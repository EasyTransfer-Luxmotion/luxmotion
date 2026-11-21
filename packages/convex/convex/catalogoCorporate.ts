import { ConvexError, v } from "convex/values";
import { matchesSearch, pageArgs, pageOf, reorderSlice } from "./lib/list";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { pode, exigirAdmin } from "./lib/admin";
import { urlDaImagem } from "./lib/imagens";
import { CORPORATE_LANGUAGES, corporateOriginalLanguage } from "./lib/corporateExperienceTranslations";

/*
 * Catálogo → Corporate no dashboard (E3). Substitui, para o ecrã novo, o
 * corporateExperiences.listPaged/create/update/setStatus/remove.
 *
 * O que muda:
 *  - Conflito pelo updatedAt; capa opcional com a chave (tirar apaga).
 *  - A capa partida vê-se: em produção as 60 experiências tinham a capa num
 *    ficheiro do Convex que já não existia, e ninguém sabia (2026-11-14).
 *  - Publicar exige título, descrição curta, local e uma capa que exista.
 *  - A ordem muda-se de uma vez (reordenar), como nos Veículos.
 */

const vDados = v.object({
  originalLanguage: v.string(),
  titlePrefix: v.string(),
  titleAccent: v.string(),
  shortDescription: v.string(),
  duration: v.union(v.literal("halfDay"), v.literal("fullDay"), v.literal("multiDay")),
  pillar: v.union(v.literal("standard"), v.literal("experiences"), v.literal("logistics")),
  subcategory: v.string(),
  groupSize: v.string(),
  durationLabel: v.string(),
  location: v.string(),
  description: v.string(),
  experienceBody: v.string(),
  experienceItems: v.array(v.object({ strong: v.string(), body: v.string() })),
  routeHighlights: v.array(v.string()),
  whatsIncluded: v.array(v.string()),
  coverImageId: v.optional(v.string()),
  galleryImageIds: v.array(v.string()),
});
type Dados = typeof vDados.type;

function impedimentos(x: Pick<Doc<"corporateExperiences">, "titlePrefix" | "titleAccent" | "shortDescription" | "location">, capaUrl: string | null) {
  const falta: { campo: string; texto: string }[] = [];
  if (!`${x.titlePrefix}${x.titleAccent}`.trim()) falta.push({ campo: "titlePrefix", texto: "Título" });
  if (!x.shortDescription.trim()) falta.push({ campo: "shortDescription", texto: "Descrição curta" });
  if (!x.location.trim()) falta.push({ campo: "location", texto: "Local" });
  if (!capaUrl) falta.push({ campo: "coverImageId", texto: "Fotografia de capa" });
  return falta;
}

/* The Corporate list: filters, search and page come from the URL and are
   resolved here. The order is the site's (sortOrder); `place` is each row's
   position on the site, so it stays right when the list is filtered. */
export const lista = query({
  args: {
    search: v.optional(v.string()),
    pillar: v.optional(v.string()),
    status: v.optional(v.string()),
    ...pageArgs,
  },
  handler: async (ctx, a) => {
    if (!(await pode(ctx, "corporate"))) return null;
    const xs = await ctx.db.query("corporateExperiences").withIndex("by_sort").collect();
    const place = new Map(xs.map((x, i) => [x._id, i + 1]));
    const matching = xs
      .filter((x) => !a.pillar || x.pillar === a.pillar)
      .filter((x) => !a.status || x.status === a.status)
      .filter((x) => matchesSearch(a.search, [`${x.titlePrefix} ${x.titleAccent}`, x.location, x.subcategory]));
    const pg = pageOf(matching, a);
    const tr = await ctx.db.query("corporateExperienceTranslations").collect();
    const rows = await Promise.all(
      pg.rows.map(async (x) => {
        const capa = x.coverImageId ? await urlDaImagem(ctx, x.coverImageId) : null;
        const galeria0 = x.galleryImageIds[0] ? await urlDaImagem(ctx, x.galleryImageIds[0]) : null;
        return {
          _id: x._id,
          place: place.get(x._id) ?? 0,
          titulo: `${x.titlePrefix} ${x.titleAccent}`.trim(),
          estado: x.status,
          pilar: x.pillar,
          duracao: x.duration,
          rotuloDuracao: x.durationLabel,
          subcategoria: x.subcategory,
          local: x.location,
          ordem: x.sortOrder,
          imagem: capa ?? galeria0,
          capaPartida: Boolean(x.coverImageId) && !capa,
          fotos: x.galleryImageIds.length,
          idiomas: [corporateOriginalLanguage(x), ...tr.filter((t) => t.experienceId === x._id).map((t) => t.locale)],
        };
      }),
    );
    // Broken covers across the whole table, not just this page: one URL check per cover.
    let brokenCovers = 0;
    for (const x of xs) if (x.coverImageId && !(await urlDaImagem(ctx, x.coverImageId))) brokenCovers++;
    return {
      ...pg,
      rows,
      unfilteredTotal: xs.length,
      publishedCount: xs.filter((x) => x.status === "published").length,
      brokenCovers,
    };
  },
});

export const detalhe = query({
  args: { id: v.id("corporateExperiences") },
  handler: async (ctx, { id }) => {
    if (!(await pode(ctx, "corporate"))) return null;
    const x = await ctx.db.get(id);
    if (!x) return { encontrado: false as const };
    const capaUrl = x.coverImageId ? await urlDaImagem(ctx, x.coverImageId) : null;
    const galeria = await Promise.all(x.galleryImageIds.map(async (g) => ({ id: g, url: await urlDaImagem(ctx, g) })));
    const tr = await ctx.db
      .query("corporateExperienceTranslations")
      .withIndex("by_experience", (q) => q.eq("experienceId", id))
      .collect();
    return {
      encontrado: true as const,
      experiencia: { ...x, originalLanguage: corporateOriginalLanguage(x) },
      versao: x.updatedAt,
      capaUrl,
      capaPartida: Boolean(x.coverImageId) && !capaUrl,
      galeria,
      traducoes: tr.map((t) => ({ locale: t.locale })),
      impedimentos: impedimentos(x, capaUrl),
      idiomas: CORPORATE_LANGUAGES.map((l) => l.value),
    };
  },
});

type Erros = Partial<Record<string, string>>;

function validar(d: Dados): Erros {
  const e: Erros = {};
  if (!`${d.titlePrefix}${d.titleAccent}`.trim()) e.titlePrefix = "Dê um título à experiência.";
  if (!CORPORATE_LANGUAGES.some((l) => l.value === d.originalLanguage)) e.originalLanguage = "Idioma não suportado.";
  if (d.experienceItems.some((i) => !i.strong.trim() && i.body.trim())) e.experienceItems = "Cada ponto precisa de um título.";
  return e;
}

const limpar = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

export const guardar = mutation({
  args: { id: v.optional(v.id("corporateExperiences")), versao: v.optional(v.number()), dados: vDados },
  handler: async (ctx, { id, versao, dados }) => {
    await exigirAdmin(ctx, "corporate");
    const actual = id ? await ctx.db.get(id) : null;
    if (id && !actual) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta experiência já não existe." });
    if (actual && versao !== actual.updatedAt) {
      throw new ConvexError({ tipo: "conflito", mensagem: "Alguém gravou esta experiência depois de a abrir. Veja a versão actual antes de gravar por cima." });
    }
    const erros = validar(dados);
    if (actual && dados.originalLanguage !== corporateOriginalLanguage(actual)) {
      const ja = await ctx.db
        .query("corporateExperienceTranslations")
        .withIndex("by_experience_locale", (q) => q.eq("experienceId", actual._id).eq("locale", dados.originalLanguage))
        .first();
      if (ja) erros.originalLanguage = "Já há uma tradução neste idioma. Apague-a antes de o tornar o original.";
    }
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const agora = Date.now();
    const d: Dados = {
      ...dados,
      experienceItems: dados.experienceItems.filter((i) => i.strong.trim() || i.body.trim()),
      routeHighlights: limpar(dados.routeHighlights),
      whatsIncluded: limpar(dados.whatsIncluded),
    };
    if (actual) {
      // A capa antiga não se apaga: o ficheiro pode ser partilhado com outros registos (ver lib/imagens.ts).
      await ctx.db.patch(actual._id, { ...d, coverImageId: d.coverImageId, updatedAt: agora });
      return { id: actual._id, versao: agora };
    }
    const ultimo = await ctx.db.query("corporateExperiences").withIndex("by_sort").order("desc").first();
    const novo = await ctx.db.insert("corporateExperiences", {
      ...d,
      status: "draft",
      sortOrder: (ultimo?.sortOrder ?? -1) + 1,
      createdAt: agora,
      updatedAt: agora,
    });
    return { id: novo, versao: agora };
  },
});

export const mudarEstado = mutation({
  args: { id: v.id("corporateExperiences"), estado: v.union(v.literal("draft"), v.literal("published")) },
  handler: async (ctx, { id, estado }) => {
    await exigirAdmin(ctx, "corporate");
    const x = await ctx.db.get(id);
    if (!x) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta experiência já não existe." });
    if (estado === "published") {
      const capaUrl = (x.coverImageId ? await urlDaImagem(ctx, x.coverImageId) : null) ?? null;
      const falta = impedimentos(x, capaUrl);
      if (falta.length) throw new ConvexError({ tipo: "impedido", mensagem: `Para publicar falta: ${falta.map((f) => f.texto.toLowerCase()).join(", ")}.` });
    }
    const agora = Date.now();
    await ctx.db.patch(id, { status: estado, updatedAt: agora });
    return { versao: agora };
  },
});

export const reordenar = mutation({
  args: { ids: v.array(v.id("corporateExperiences")) },
  handler: async (ctx, { ids }) => {
    await exigirAdmin(ctx, "corporate");
    const todos = await ctx.db.query("corporateExperiences").collect();
    if (ids.length !== todos.length || new Set(ids).size !== ids.length || !todos.every((x) => ids.includes(x._id))) {
      throw new ConvexError({ tipo: "conflito", mensagem: "A lista mudou entretanto. Recarregue e volte a ordenar." });
    }
    const agora = Date.now();
    await Promise.all(ids.map((id, i) => ctx.db.patch(id, { sortOrder: i, updatedAt: agora })));
  },
});

/* Reorders one page of the unfiltered list: `ids` are the rows at positions
   start..start+n, in their new order. The client only holds one page, so it
   cannot send the whole order the way `reordenar` expects. */
export const reorderPage = mutation({
  args: { start: v.number(), ids: v.array(v.id("corporateExperiences")) },
  handler: async (ctx, { start, ids }) => {
    await exigirAdmin(ctx, "corporate");
    const all = await ctx.db.query("corporateExperiences").withIndex("by_sort").collect();
    const order = reorderSlice(all.map((x) => x._id), start, ids);
    if (!order) {
      throw new ConvexError({ tipo: "conflito", mensagem: "A lista mudou entretanto. Recarregue e volte a ordenar." });
    }
    const now = Date.now();
    await Promise.all(order.map((id, i) => ctx.db.patch(id, { sortOrder: i, updatedAt: now })));
  },
});

export const remover = mutation({
  args: { id: v.id("corporateExperiences") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "corporate", "editar", "apagar");
    const x = await ctx.db.get(id);
    if (!x) return;
    /* Capa e galeria não se apagam. Foi aqui que, ao apagar uma experiência de teste,
       desapareceram duas fotografias de veículos (2026-11-14): a migração para
       o Bunny tinha juntado os ficheiros iguais num só caminho. Ver lib/imagens.ts. */
    for (const t of await ctx.db.query("corporateExperienceTranslations").withIndex("by_experience", (q) => q.eq("experienceId", id)).collect()) {
      await ctx.db.delete(t._id);
    }
    await ctx.db.delete(id);
  },
});
