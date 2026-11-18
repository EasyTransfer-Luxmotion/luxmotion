import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { exigirAdmin } from "./lib/admin";
import { urlDaImagem } from "./lib/imagens";

/*
 * Conteúdos → Portefólio no dashboard (E4): o trabalho já feito que o mosaico
 * de Sobre nós mostra (pastExperiences).
 *
 * O site lê pelo pastExperiences.listPublished e mostra de cada uma só a
 * fotografia, "título · local" e o link; a descrição e as etiquetas não
 * aparecem em lado nenhum. A ordem é a da criação, mais recente primeiro, e
 * as quatro primeiras ficam grandes no mosaico.
 *
 * O que muda em relação às funções antigas:
 *  - O link escolhe-se de entre os eventos e tours publicados e grava-se como
 *    caminho do site (/events/<slug>). Eram endereços colados à mão, todos de
 *    produção — de staging levavam para produção, num separador novo — e
 *    vários trocados: casamentos a abrir o festival de cinema, a final da
 *    Champions a abrir o MotoGP.
 *  - Publicar pede fotografia: o site deixa de fora as que não têm (filtra
 *    por imageUrl), e uma experiência publicada sem foto não aparecia.
 *  - "Pôr em primeiro" muda a data de criação, que é o que dá a ordem.
 */

const vCategoria = v.union(v.literal("corporate"), v.literal("weddings"), v.literal("events"), v.literal("privateTours"));
const DESTAQUES = 4;

type Destino = { tipo: "evento" | "tour"; titulo: string; href: string; publicado: boolean };

/* Os sítios do site para onde uma foto pode levar, pelo caminho. */
async function destinos(ctx: QueryCtx): Promise<Map<string, Destino>> {
  const [eventos, tours] = await Promise.all([ctx.db.query("events").collect(), ctx.db.query("tours").collect()]);
  const m = new Map<string, Destino>();
  for (const e of eventos) m.set(`/events/${e.slug}`, { tipo: "evento", titulo: e.title, href: `/events/${e.slug}`, publicado: e.status === "published" });
  for (const t of tours) {
    const href = t.isUltraLuxury ? `/ultra-luxury-tours/tours/${t.slug}` : `/tours/tour/${t.slug}`;
    m.set(href, { tipo: "tour", titulo: t.title, href, publicado: t.status === "published" });
  }
  return m;
}

/* "https://www.easytransferportugal.com/en/events/x?y" → "/events/x": os
   links antigos, colados de produção, reconhecem-se pelo caminho. */
function caminhoDoSite(link: string): string | null {
  try {
    const u = new URL(link, "https://www.easytransferportugal.com");
    if (!/(^|\.)easytransferportugal\.com$/.test(u.hostname)) return null;
    return u.pathname.replace(/^\/(pt|en|es|fr|de|nl)(?=\/)/, "").replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
}

const ordenar = (xs: Doc<"pastExperiences">[]) => [...xs].sort((a, b) => b.createdAt - a.createdAt);

export const lista = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "portefolio", "ver");
    const [docs, mapa] = await Promise.all([ctx.db.query("pastExperiences").collect(), destinos(ctx)]);
    /* O lugar no site: só as publicadas com fotografia, como o site conta. */
    const noSite = ordenar(docs).filter((d) => d.status === "published" && d.imageId);
    const lugar = new Map(noSite.map((d, i) => [d._id as string, i + 1]));
    const linhas = await Promise.all(
      ordenar(docs).map(async (d) => {
        const caminho = d.linkUrl ? caminhoDoSite(d.linkUrl) : null;
        const destino = caminho ? (mapa.get(caminho) ?? null) : null;
        return {
          id: d._id as string,
          versao: d.updatedAt,
          titulo: d.title,
          local: d.location,
          categoria: d.category,
          descricao: d.description,
          etiquetas: d.tags ?? [],
          imagem: d.imageId ?? null,
          imagemUrl: await urlDaImagem(ctx, d.imageId),
          publicado: d.status === "published",
          link: d.linkUrl ?? "",
          /* A que é que o link leva: um evento ou tour (e se está publicado),
             um endereço de fora, ou uma página do site que já não existe. */
          destino: !d.linkUrl
            ? null
            : destino
              ? { ...destino, externo: false, antigo: !d.linkUrl.startsWith("/") }
              : { tipo: caminho ? ("perdido" as const) : ("externo" as const), titulo: d.linkUrl, href: d.linkUrl, publicado: true, externo: !caminho, antigo: !d.linkUrl.startsWith("/") },
          lugar: lugar.get(d._id) ?? null,
          criado: d.createdAt,
        };
      }),
    );
    return { linhas, destaques: DESTAQUES };
  },
});

/* Para escolher o link: os eventos e tours publicados. */
export const destinosPossiveis = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "portefolio", "ver");
    return [...(await destinos(ctx)).values()].filter((d) => d.publicado).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.titulo.localeCompare(b.titulo, "pt"));
  },
});

const vDados = v.object({
  titulo: v.string(),
  local: v.string(),
  categoria: vCategoria,
  descricao: v.string(),
  imagem: v.union(v.string(), v.null()),
  link: v.string(),
  publicado: v.boolean(),
});

function validar(d: typeof vDados.type): Record<string, string> {
  const erros: Record<string, string> = {};
  if (!d.titulo.trim()) erros.titulo = "Escreva o título.";
  else if (d.titulo.trim().length > 90) erros.titulo = "No máximo 90 caracteres.";
  if (!d.local.trim()) erros.local = "Escreva o local: aparece a seguir ao título.";
  else if (d.local.trim().length > 80) erros.local = "No máximo 80 caracteres.";
  if (d.descricao.length > 2000) erros.descricao = "No máximo 2000 caracteres.";
  const l = d.link.trim();
  if (l && !l.startsWith("/") && !/^https:\/\/[^\s]+$/.test(l)) erros.link = "Um caminho do site (/events/…) ou um endereço https://.";
  if (d.publicado && !d.imagem) erros.imagem = "Sem fotografia não aparece no site.";
  return erros;
}

export const guardar = mutation({
  args: { id: v.optional(v.id("pastExperiences")), versao: v.optional(v.number()), dados: vDados },
  handler: async (ctx, { id, versao, dados }) => {
    await exigirAdmin(ctx, "portefolio");
    const erros = validar(dados);
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });
    const registo = {
      title: dados.titulo.trim(),
      location: dados.local.trim(),
      category: dados.categoria,
      description: dados.descricao.trim(),
      imageId: dados.imagem ?? undefined,
      linkUrl: dados.link.trim() || undefined,
      status: dados.publicado ? ("published" as const) : ("draft" as const),
    };
    const agora = Date.now();
    if (!id) {
      const nid = await ctx.db.insert("pastExperiences", { ...registo, tags: [], createdAt: agora, updatedAt: agora });
      return { id: nid as string, versao: agora };
    }
    const doc = await ctx.db.get(id);
    if (!doc) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta experiência já não existe." });
    if (versao !== undefined && doc.updatedAt !== versao) {
      throw new ConvexError({ tipo: "conflito", mensagem: "Alguém gravou esta experiência depois de a abrir. Veja a versão actual antes de gravar por cima." });
    }
    const updatedAt = Math.max(agora, doc.updatedAt + 1);
    /* As etiquetas não se editam (o site não as mostra) e ficam como estão. */
    await ctx.db.patch(id, { ...registo, updatedAt });
    return { id: id as string, versao: updatedAt };
  },
});

export const publicar = mutation({
  args: { id: v.id("pastExperiences"), publicado: v.boolean() },
  handler: async (ctx, { id, publicado }) => {
    await exigirAdmin(ctx, "portefolio");
    const doc = await ctx.db.get(id);
    if (!doc) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta experiência já não existe." });
    if (publicado && !doc.imageId) throw new ConvexError({ tipo: "invalido", mensagem: "Sem fotografia não aparece no site. Carregue uma antes de publicar." });
    await ctx.db.patch(id, { status: publicado ? "published" : "draft", updatedAt: Math.max(Date.now(), doc.updatedAt + 1) });
  },
});

/* O mosaico ordena pela criação, mais recente primeiro: pôr em primeiro é
   dar-lhe a data de agora. */
export const porEmPrimeiro = mutation({
  args: { id: v.id("pastExperiences") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "portefolio");
    const doc = await ctx.db.get(id);
    if (!doc) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta experiência já não existe." });
    const agora = Date.now();
    await ctx.db.patch(id, { createdAt: agora, updatedAt: Math.max(agora, doc.updatedAt + 1) });
  },
});

export const remover = mutation({
  args: { id: v.id("pastExperiences") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "portefolio", "editar", "apagar");
    /* A fotografia não se apaga: pode estar noutro registo (lib/imagens.ts). */
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});
