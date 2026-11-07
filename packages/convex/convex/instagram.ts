import { v } from "convex/values";
import { internalAction, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { exigirAdmin } from "./lib/admin";

/**
 * O feed do Instagram do site.
 *
 * Duas coisas mudaram aqui, e vale a pena perceber porquê antes de mexer.
 *
 * PRIMEIRA: a API. Isto falava com o `graph.instagram.com`, que é a API do
 * Instagram com Instagram Login e usa tokens que começam por `IGAA`. Passa a
 * falar com o Graph do Facebook, que é o caminho para contas Business ligadas
 * a uma página — e é o único onde existe um token que não expira: um Page
 * access token derivado de um token de utilizador de longa duração vive
 * enquanto ninguém mudar a palavra-passe nem revogar a app. O caminho antigo
 * obrigava a renovar o token de 60 em 60 dias, e foi por não se renovar que o
 * feed parou.
 *
 * SEGUNDA: quem chama. Era o browser de cada visitante, a cada carregamento da
 * homepage. Agora é o cron, uma vez por dia, e o site lê a cache — o que
 * também tira uma chamada externa do caminho crítico da página.
 *
 * Variáveis de ambiente no Convex (dashboard ou `npx convex env set`):
 *   INSTAGRAM_ACCESS_TOKEN  — Page access token (começa por EAA)
 *   INSTAGRAM_ACCOUNT_ID    — Instagram Business Account ID, que se obtém em
 *                             /{page-id}?fields=instagram_business_account
 *   INSTAGRAM_GRAPH_VERSION — opcional, por omissão v21.0
 */

const postValidator = v.object({
  id: v.string(),
  mediaType: v.string(),
  mediaUrl: v.string(),
  permalink: v.string(),
  timestamp: v.string(),
  caption: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
});

const profileValidator = v.object({
  username: v.string(),
  mediaCount: v.optional(v.number()),
  followersCount: v.optional(v.number()),
  followsCount: v.optional(v.number()),
  profilePictureUrl: v.optional(v.string()),
});

/**
 * O que o site mostra. Nunca falha: sem cache devolve null e o componente usa
 * as imagens de reserva, como antes.
 */
export const getInstagramFeed = query({
  args: {},
  handler: async (ctx) => {
    try {
      const doc = await ctx.db.query("instagramCache").first();
      if (!doc) return null;
      return {
        posts: doc.posts,
        profile: doc.profile ?? null,
        fetchedAt: doc.fetchedAt,
      };
    } catch {
      return null;
    }
  },
});

/**
 * Estado da sincronização, para o admin. É aqui que se vê um token expirado
 * antes de alguém reparar que as fotos são sempre as mesmas.
 */
export const getInstagramStatus = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const doc = await ctx.db.query("instagramCache").first();
    if (!doc) {
      return {
        configured: false,
        postCount: 0,
        fetchedAt: null,
        lastError: null,
        lastErrorAt: null,
      };
    }
    return {
      configured: true,
      postCount: doc.posts.length,
      fetchedAt: doc.fetchedAt,
      lastError: doc.lastError ?? null,
      lastErrorAt: doc.lastErrorAt ?? null,
    };
  },
});

/** Guarda um feed novo, substituindo o anterior. */
export const _store = internalMutation({
  args: {
    posts: v.array(postValidator),
    profile: v.optional(profileValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("instagramCache").collect();
    for (const doc of existing) await ctx.db.delete(doc._id);
    await ctx.db.insert("instagramCache", {
      posts: args.posts,
      profile: args.profile,
      fetchedAt: Date.now(),
    });
  },
});

/**
 * Regista a falha sem apagar o feed anterior: um dia mau da API não pode
 * deitar abaixo a secção do site.
 */
export const _storeError = internalMutation({
  args: { error: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("instagramCache").first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastError: args.error,
        lastErrorAt: Date.now(),
      });
      return;
    }
    await ctx.db.insert("instagramCache", {
      posts: [],
      fetchedAt: 0,
      lastError: args.error,
      lastErrorAt: Date.now(),
    });
  },
});

function graphBase(): string {
  const version = process.env.INSTAGRAM_GRAPH_VERSION ?? "v21.0";
  return `https://graph.facebook.com/${version}`;
}

function credentials(): { token: string; accountId: string } {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!token) {
    throw new Error(
      "INSTAGRAM_ACCESS_TOKEN não está definido no Convex (dashboard > Settings > Environment Variables).",
    );
  }
  if (!accountId) {
    throw new Error("INSTAGRAM_ACCOUNT_ID não está definido no Convex.");
  }
  return { token, accountId };
}

/** Nunca deixar o token entrar numa mensagem de erro ou num log. */
async function graphGet(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${graphBase()}${path}`);
  for (const [k, value] of Object.entries(params)) url.searchParams.set(k, value);
  url.searchParams.set("access_token", token);

  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);

  if (!res.ok) {
    const detail = (body as { error?: { message?: string; type?: string } }).error;
    throw new Error(
      `Graph API ${res.status}: ${detail?.message ?? res.statusText}${
        detail?.type ? ` (${detail.type})` : ""
      }`,
    );
  }
  return body as any;
}

type RawPost = {
  id: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  caption?: string;
  thumbnail_url?: string;
};

/**
 * Sincroniza o feed. Corre uma vez por dia pelo cron e pode ser disparada à
 * mão no dashboard do Convex depois de mudar o token.
 */
export const syncInstagram = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ ok: boolean; posts?: number; error?: string }> => {
    try {
      const { token, accountId } = credentials();
      const limit = args.limit ?? 12;

      const [media, profile] = await Promise.all([
        graphGet(
          `/${accountId}/media`,
          {
            fields:
              "id,media_type,media_url,permalink,timestamp,caption,thumbnail_url",
            limit: String(limit),
          },
          token,
        ),
        graphGet(
          `/${accountId}`,
          {
            fields:
              "username,media_count,followers_count,follows_count,profile_picture_url",
          },
          token,
        ),
      ]);

      const posts = ((media.data ?? []) as RawPost[])
        // Um vídeo traz thumbnail_url e pode não trazer media_url utilizável.
        .map((p) => ({
          id: p.id,
          mediaType: p.media_type ?? "IMAGE",
          mediaUrl: p.thumbnail_url ?? p.media_url ?? "",
          permalink: p.permalink ?? "",
          timestamp: p.timestamp ?? "",
          caption: p.caption,
          thumbnailUrl: p.thumbnail_url,
        }))
        .filter((p) => p.mediaUrl && p.permalink);

      if (posts.length === 0) {
        throw new Error("A API respondeu sem posts utilizáveis.");
      }

      await ctx.runMutation(internal.instagram._store, {
        posts,
        profile: {
          username: profile.username ?? "luxmotion.tours",
          mediaCount: profile.media_count,
          followersCount: profile.followers_count,
          followsCount: profile.follows_count,
          profilePictureUrl: profile.profile_picture_url,
        },
      });

      console.log(`[Instagram] ${posts.length} posts sincronizados`);
      return { ok: true, posts: posts.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Instagram] sincronização falhou: ${message}`);
      await ctx.runMutation(internal.instagram._storeError, { error: message });
      return { ok: false, error: message };
    }
  },
});
