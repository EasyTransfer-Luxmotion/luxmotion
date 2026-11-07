import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { urlDaImagem, apagarImagem, vImagem } from "./lib/imagens";
import { exigirAdmin } from "./lib/admin";

/**
 * Biblioteca de imagens dos extras: carrega-se o ficheiro uma vez e depois
 * associa-se a quantos extras se quiser, em vez de repetir o upload em cada
 * tour e em cada evento.
 */

type ItemDaBiblioteca = {
  /** Presente só nas imagens registadas; as herdadas dos extras não têm linha. */
  libraryId?: Id<"addonImages">;
  storageId: string;
  label: string;
  url: string;
  createdAt: number;
  /** Quantos extras apontam para este ficheiro. A página de gestão avisa com
   *  base nisto antes de apagar; o selector ignora-o. */
  usageCount: number;
};

/**
 * Tudo o que se pode associar a um extra: as imagens registadas na biblioteca
 * mais as que já estão em uso pelos extras e nunca foram registadas — sem isso
 * a biblioteca abria vazia e obrigava a carregar de novo aquilo que já cá está.
 *
 * A desduplicação é por `storageId`, e o rótulo da biblioteca ganha ao título do
 * extra quando a mesma imagem aparece nos dois lados.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const registadas = await ctx.db.query("addonImages").collect();
    const extras = await ctx.db.query("tourAddons").collect();

    const porStorage = new Map<string, ItemDaBiblioteca>();

    // Contagem primeiro, num ciclo só: as duas passagens abaixo já precisam dela.
    const usos = new Map<string, number>();
    for (const extra of extras) {
      if (!extra.imageId) continue;
      usos.set(extra.imageId, (usos.get(extra.imageId) ?? 0) + 1);
    }

    for (const img of registadas) {
      const url = await urlDaImagem(ctx, img.storageId);
      // Ficheiro apagado do storage: a linha fica órfã e não vale mostrá-la.
      if (!url) continue;
      porStorage.set(img.storageId, {
        libraryId: img._id,
        storageId: img.storageId,
        label: img.label,
        url,
        createdAt: img.createdAt,
        usageCount: usos.get(img.storageId) ?? 0,
      });
    }

    for (const extra of extras) {
      if (!extra.imageId) continue;
      if (porStorage.has(extra.imageId)) continue;
      const url = await urlDaImagem(ctx, extra.imageId);
      if (!url) continue;
      porStorage.set(extra.imageId, {
        storageId: extra.imageId,
        label: extra.title,
        url,
        createdAt: extra.createdAt,
        usageCount: usos.get(extra.imageId) ?? 0,
      });
    }

    return [...porStorage.values()].sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Regista um ficheiro já carregado. Idempotente por `storageId`. */
export const add = mutation({
  args: {
    storageId: vImagem,
    label: v.string(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const existente = await ctx.db
      .query("addonImages")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();

    if (existente) {
      if (args.label && args.label !== existente.label) {
        await ctx.db.patch(existente._id, { label: args.label });
      }
      return existente._id;
    }

    return await ctx.db.insert("addonImages", {
      storageId: args.storageId,
      label: args.label,
      createdAt: Date.now(),
    });
  },
});

export const rename = mutation({
  args: {
    id: v.id("addonImages"),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.patch(args.id, { label: args.label });
    return args.id;
  },
});

/**
 * Apaga a imagem a sério: tira-a da biblioteca, limpa-a dos extras que a estejam
 * a usar e apaga o ficheiro.
 *
 * É por `storageId` e não pela linha da biblioteca de propósito — as imagens que
 * vieram dos extras e nunca foram registadas não têm linha nenhuma, e eram
 * justamente essas que não havia maneira de apagar.
 *
 * Devolve quantos extras ficaram sem imagem, para a página o poder dizer.
 */
export const remove = mutation({
  args: { storageId: vImagem },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const linha = await ctx.db
      .query("addonImages")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (linha) await ctx.db.delete(linha._id);

    const extras = await ctx.db.query("tourAddons").collect();
    const afectados = extras.filter((a) => a.imageId === args.storageId);
    for (const extra of afectados) {
      await ctx.db.patch(extra._id, { imageId: undefined, updatedAt: Date.now() });
    }

    await apagarImagem(ctx, args.storageId);

    return { extrasAfectados: afectados.length };
  },
});

/**
 * Extras cuja imagem não se vê, agrupados pelo título.
 *
 * São dois casos, e do lado de fora dão no mesmo — um extra sem fotografia no
 * site: os que nunca tiveram imagem, e os que apontam para um ficheiro que já
 * não existe. O segundo caso é o rasto do defeito antigo em `tourAddons.remove`,
 * que apagava o ficheiro ao apagar um extra mesmo quando dezenas de outros
 * apontavam para o mesmo: um extra apagado levava a imagem dos restantes.
 *
 * Agrupa-se pelo título porque é assim que se resolvem — "Bagagem Extra" é o
 * mesmo extra repetido em 56 tours, e escolher a imagem uma vez arruma os 56.
 */
export const listMissing = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const extras = await ctx.db.query("tourAddons").collect();

    // O mesmo ficheiro aparece em dezenas de extras; sem cache era um getUrl
    // por extra, e são centenas.
    const vivos = new Map<string, boolean>();
    const estaViva = async (id: string) => {
      const guardado = vivos.get(id);
      if (guardado !== undefined) return guardado;
      const url = await urlDaImagem(ctx, id as string);
      vivos.set(id, url !== null);
      return url !== null;
    };

    const grupos = new Map<
      string,
      { titulo: string; quantidade: number; addonIds: Id<"tourAddons">[] }
    >();

    for (const extra of extras) {
      const semImagem = !extra.imageId || !(await estaViva(extra.imageId));
      if (!semImagem) continue;
      // Extras ainda sem título são rascunhos por preencher; não vale listá-los.
      const titulo = extra.title.trim();
      if (!titulo) continue;
      const grupo = grupos.get(titulo) ?? { titulo, quantidade: 0, addonIds: [] };
      grupo.quantidade += 1;
      grupo.addonIds.push(extra._id);
      grupos.set(titulo, grupo);
    }

    return [...grupos.values()].sort((a, b) => b.quantidade - a.quantidade);
  },
});

/** Dá a mesma imagem a um conjunto de extras de uma vez. */
export const assign = mutation({
  args: {
    storageId: vImagem,
    addonIds: v.array(v.id("tourAddons")),
    /** Nome com que a imagem fica na biblioteca, se ainda não estiver lá. */
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const agora = Date.now();
    for (const id of args.addonIds) {
      await ctx.db.patch(id, { imageId: args.storageId, updatedAt: agora });
    }

    const jaRegistada = await ctx.db
      .query("addonImages")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!jaRegistada) {
      await ctx.db.insert("addonImages", {
        storageId: args.storageId,
        label: args.label?.trim() || "Sem nome",
        createdAt: agora,
      });
    }

    return { atribuidos: args.addonIds.length };
  },
});

/**
 * Onde é que esta imagem está a ser usada: um extra por linha, com o tour ou o
 * evento a que pertence. É o que dá conteúdo ao painel de detalhe — antes de
 * apagar uma imagem convém ver o que é que ela ilustra.
 */
export const usedBy = query({
  args: { storageId: vImagem },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const extras = await ctx.db.query("tourAddons").collect();
    const usados = extras.filter((a) => a.imageId === args.storageId);

    return await Promise.all(
      usados.map(async (extra) => {
        const dono = extra.tourId
          ? await ctx.db.get(extra.tourId)
          : extra.eventId
            ? await ctx.db.get(extra.eventId)
            : null;
        return {
          addonId: extra._id,
          addonTitle: extra.title,
          tipo: extra.eventId ? ("event" as const) : ("tour" as const),
          donoTitulo: dono?.title ?? "—",
        };
      }),
    );
  },
});

/** URL de upload próprio, para a biblioteca não depender de `blogs`. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
