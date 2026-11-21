import { ConvexError, v } from "convex/values";
import { matchesSearch, pageArgs, pageOf, reorderSlice } from "./lib/list";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { pode, exigirAdmin } from "./lib/admin";
import { urlDaImagem, vImagem } from "./lib/imagens";
import { catalogTranslationsValidator } from "./lib/catalogTranslations";
import { legacyUpsellTranslations } from "./lib/upsellTranslations";
import { siteSettingsDefaults } from "./siteSettings";
import { guardarNaBiblioteca } from "./lib/bibliotecaFotos";

/*
 * Catálogo → Extras no dashboard (E3). Junta num só módulo as três coisas que
 * o back-office antigo tinha em dois ecrãs: as paragens e as experiências que
 * se oferecem a meio do checkout de um transfer (upsells.*) e os extras que se
 * acrescentam a todos os tours ou eventos de um âmbito (universalAddons.*).
 *
 * O que muda em relação às funções antigas:
 *  - Conflito pelo updatedAt, e as chaves opcionais vão sempre no patch: no
 *    updateStop/updateExperience tirar a imagem ou o local não gravava nada.
 *  - Nunca se apaga o ficheiro de uma imagem. Vêm da biblioteca dos extras ou
 *    dos tours de onde as paragens foram migradas, e são partilhadas; ao
 *    apagar uma experiência corporate de teste foram-se duas fotografias de
 *    veículos que usavam o mesmo ficheiro (2026-11-14).
 *  - O que é preciso para aparecer no site verifica-se ao publicar e ao gravar
 *    o que já está publicado: uma paragem sem coordenadas nunca aparece, e
 *    gravava-se publicada sem ninguém saber.
 *  - Um extra novo nasce em rascunho (os universais nasciam publicados).
 */

type Tipo = "paragens" | "experiencias" | "universais";
const vTipo = v.union(v.literal("paragens"), v.literal("experiencias"), v.literal("universais"));
const TABELA = { paragens: "upsellStops", experiencias: "upsellExperiences", universais: "universalAddons" } as const;

const vLocal = v.object({
  title: v.string(),
  address: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  placeId: v.optional(v.string()),
});
const vSelo = v.union(v.literal("none"), v.literal("recommended"), v.literal("mostPopular"));
const vAmbito = v.union(v.literal("tours"), v.literal("events"), v.literal("ultraLuxury"));
type Traducao = typeof catalogTranslationsValidator.type extends (infer T)[] ? T : never;
type Falta = { campo: string; texto: string };
type Erros = Record<string, string>;

function erroNaoExiste(): never {
  throw new ConvexError({ tipo: "naoExiste", mensagem: "Este extra já não existe." });
}
function erroConflito(): never {
  throw new ConvexError({ tipo: "conflito", mensagem: "Alguém gravou este extra depois de o abrir. Veja a versão actual antes de gravar por cima." });
}
function invalido(erros: Erros): never {
  throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });
}
/* Gravar o que já está publicado não pode tirá-lo do site sem se dar por isso. */
function publicadoIncompleto(falta: Falta[]): never {
  throw new ConvexError({
    tipo: "invalido",
    mensagem: `Está publicado e assim deixava de poder aparecer: falta ${falta.map((f) => f.texto.toLowerCase()).join(", ")}. Passe-o a rascunho primeiro.`,
    erros: Object.fromEntries(falta.map((f) => [f.campo, `Obrigatório enquanto estiver publicado.`])),
  });
}

const valido = (n: number) => Number.isFinite(n) && n >= 0;
const temCoordenadas = (l?: { lat?: number; lng?: number } | null) => l?.lat != null && l?.lng != null;

/* Tira as traduções vazias e os espaços; o editor manda os cinco idiomas. */
function limparTraducoes(xs: Traducao[]): Traducao[] {
  return xs
    .map((t) => {
      const o: Traducao = { locale: t.locale };
      for (const k of ["name", "title", "description", "duration", "examples"] as const) {
        const s = t[k]?.trim();
        if (s) o[k] = s;
      }
      return o;
    })
    .filter((t) => Object.keys(t).length > 1);
}

async function raioKm(ctx: QueryCtx) {
  const s = await ctx.db
    .query("siteSettings")
    .withIndex("by_key", (q) => q.eq("key", "global"))
    .first();
  const r = s?.checkoutUpsellRadiusKm;
  return typeof r === "number" && r > 0 ? r : siteSettingsDefaults.checkoutUpsellRadiusKm;
}

/* ─── O que falta para aparecer no site ─────────────────────────────── */

function faltaCheckout(x: { title: string; universal: boolean; location?: { lat?: number; lng?: number } | null }, preco: number): Falta[] {
  const f: Falta[] = [];
  if (!x.title.trim()) f.push({ campo: "title", texto: "Nome" });
  if (!valido(preco)) f.push({ campo: "preco", texto: "Preço" });
  if (!x.universal && !temCoordenadas(x.location)) f.push({ campo: "location", texto: "Local no mapa" });
  return f;
}
function faltaUniversal(x: { title: string; price: number; scopes: string[] }): Falta[] {
  const f: Falta[] = [];
  if (!x.title.trim()) f.push({ campo: "title", texto: "Nome" });
  if (!valido(x.price)) f.push({ campo: "price", texto: "Preço" });
  if (x.scopes.length === 0) f.push({ campo: "scopes", texto: "Onde aparece" });
  return f;
}

/* Onde um universal aparece de facto: os tours e eventos do âmbito, menos os
   que o desligaram. Só os publicados contam para o número; os desligados
   dizem-se pelo nome, para se saber onde ir ligá-lo. */
async function alcance(ctx: QueryCtx) {
  const tours = await ctx.db.query("tours").collect();
  const eventos = await ctx.db.query("events").collect();
  return (x: Doc<"universalAddons">) => {
    const donos = [
      ...(x.scopes.includes("tours") ? tours.filter((t) => t.isUltraLuxury !== true && t.category !== "stops" && t.category !== "experiences") : []),
      ...(x.scopes.includes("ultraLuxury") ? tours.filter((t) => t.isUltraLuxury === true) : []),
    ].map((t) => ({ tipo: "tour" as const, d: t }));
    const evs = x.scopes.includes("events") ? eventos.map((e) => ({ tipo: "evento" as const, d: e })) : [];
    const todos = [...donos, ...evs];
    const desligado = (d: { disabledUniversalAddons?: Id<"universalAddons">[] }) => (d.disabledUniversalAddons ?? []).includes(x._id);
    const publicados = todos.filter((t) => t.d.status === "published");
    return {
      tours: publicados.filter((t) => t.tipo === "tour" && !desligado(t.d)).length,
      eventos: publicados.filter((t) => t.tipo === "evento" && !desligado(t.d)).length,
      desligadoEm: todos
        .filter((t) => desligado(t.d))
        .map((t) => ({ id: t.d._id as string, tipo: t.tipo, titulo: t.d.title, publicado: t.d.status === "published" })),
    };
  };
}

/* ─── Lista ─────────────────────────────────────────────────────────── */

/* The Extras list, one tab at a time: filters, search and page come from the
   URL and are resolved here, in site order. Images and the universal add-ons'
   reach are only worked out for the page shown. `place` is the position on the
   site, so it stays right when the list is filtered. */
export const lista = query({
  args: {
    tipo: vTipo,
    search: v.optional(v.string()),
    // "missing" = rows the checkout cannot show yet (see faltaCheckout).
    status: v.optional(v.union(v.literal("published"), v.literal("draft"), v.literal("missing"))),
    ...pageArgs,
  },
  handler: async (ctx, a) => {
    const { tipo } = a;
    if (!(await pode(ctx, "extras"))) return null;
    const [paragens, experiencias, universais] = await Promise.all([
      ctx.db.query("upsellStops").withIndex("by_order").collect(),
      ctx.db.query("upsellExperiences").withIndex("by_order").collect(),
      ctx.db.query("universalAddons").collect(),
    ]);
    universais.sort((x, y) => x.order - y.order);
    const contagens = { paragens: paragens.length, experiencias: experiencias.length, universais: universais.length };
    const raio = await raioKm(ctx);
    const imagem = (id?: string) => (id ? urlDaImagem(ctx, id) : Promise.resolve(null));
    const locais = (xs?: Traducao[]) => (xs ?? []).map((t) => t.locale);

    const select = <D extends { _id: string; status: string; title: string; description?: string }>(
      docs: D[],
      missing: (d: D) => string[],
      location: (d: D) => string | null,
    ) => {
      const place = new Map(docs.map((d, i) => [d._id, i + 1]));
      const withMissing = docs.map((d) => ({ d, falta: missing(d), place: place.get(d._id) ?? 0 }));
      const matching = withMissing
        .filter((x) => !a.status || (a.status === "missing" ? x.falta.length > 0 : x.d.status === a.status))
        .filter((x) => matchesSearch(a.search, [x.d.title, x.d.description, location(x.d)]));
      return {
        pg: pageOf(matching, a),
        // Published but hidden from the checkout: counted over the whole tab, not the page.
        notOnSiteCount: withMissing.filter((x) => x.d.status === "published" && x.falta.length > 0).length,
      };
    };

    if (tipo === "paragens") {
      const { pg, notOnSiteCount } = select(paragens, (x) => faltaCheckout(x, x.price30).map((f) => f.texto), (x) => x.location?.title ?? null);
      const rows = await Promise.all(
        pg.rows.map(async ({ d: x, falta, place }) => ({
          _id: x._id as string,
          place,
          titulo: x.title,
          descricao: x.description ?? "",
          imagem: await imagem(x.imageId),
          estado: x.status,
          selo: x.tag,
          universal: x.universal,
          local: x.location?.title ?? null,
          preco: x.price30,
          preco15: x.price15 ?? null,
          idiomas: locais(x.translations),
          falta,
        })),
      );
      return { tipo, contagens, raioKm: raio, ...pg, rows, notOnSiteCount };
    }
    if (tipo === "experiencias") {
      const { pg, notOnSiteCount } = select(experiencias, (x) => faltaCheckout(x, x.basePrice).map((f) => f.texto), (x) => x.location?.title ?? null);
      const rows = await Promise.all(
        pg.rows.map(async ({ d: x, falta, place }) => ({
          _id: x._id as string,
          place,
          titulo: x.title,
          descricao: x.description ?? "",
          imagem: await imagem(x.imageId),
          estado: x.status,
          selo: x.tag,
          universal: x.universal,
          local: x.location?.title ?? null,
          preco: x.basePrice,
          modelo: x.pricingModel,
          duracao: x.duration ?? "",
          opcoes: (x.addons ?? []).length,
          idiomas: locais(x.translations),
          falta,
        })),
      );
      return { tipo, contagens, raioKm: raio, ...pg, rows, notOnSiteCount };
    }
    const { pg, notOnSiteCount } = select(universais, (x) => faltaUniversal(x).map((f) => f.texto), () => null);
    const onde = await alcance(ctx);
    const rows = await Promise.all(
      pg.rows.map(async ({ d: x, falta, place }) => {
        const r = onde(x);
        return {
          _id: x._id as string,
          place,
          titulo: x.title,
          descricao: x.description ?? "",
          imagem: await imagem(x.imageId),
          estado: x.status,
          preco: x.price,
          tipoPreco: x.pricingType,
          ambitos: x.scopes,
          emTours: r.tours,
          emEventos: r.eventos,
          desligados: r.desligadoEm.length,
          idiomas: locais(x.translations),
          falta,
        };
      }),
    );
    return { tipo, contagens, raioKm: raio, ...pg, rows, notOnSiteCount };
  },
});

/* ─── Detalhes ──────────────────────────────────────────────────────── */

export const detalheParagem = query({
  args: { id: v.id("upsellStops") },
  handler: async (ctx, { id }) => {
    if (!(await pode(ctx, "extras"))) return null;
    const x = await ctx.db.get(id);
    if (!x) return { encontrado: false as const };
    return {
      encontrado: true as const,
      extra: { ...x, translations: x.translations ?? (await legacyUpsellTranslations(ctx, x.title, "stops")) },
      versao: x.updatedAt,
      imagemUrl: x.imageId ? await urlDaImagem(ctx, x.imageId) : null,
      raioKm: await raioKm(ctx),
      falta: faltaCheckout(x, x.price30),
    };
  },
});

export const detalheExperiencia = query({
  args: { id: v.id("upsellExperiences") },
  handler: async (ctx, { id }) => {
    if (!(await pode(ctx, "extras"))) return null;
    const x = await ctx.db.get(id);
    if (!x) return { encontrado: false as const };
    return {
      encontrado: true as const,
      extra: { ...x, translations: x.translations ?? (await legacyUpsellTranslations(ctx, x.title, "experiences")) },
      versao: x.updatedAt,
      imagemUrl: x.imageId ? await urlDaImagem(ctx, x.imageId) : null,
      raioKm: await raioKm(ctx),
      falta: faltaCheckout(x, x.basePrice),
    };
  },
});

export const detalheUniversal = query({
  args: { id: v.id("universalAddons") },
  handler: async (ctx, { id }) => {
    if (!(await pode(ctx, "extras"))) return null;
    const x = await ctx.db.get(id);
    if (!x) return { encontrado: false as const };
    const a = (await alcance(ctx))(x);
    /* As reservas guardam o extra pelo id: dá para dizer quantas o levaram. */
    const reservas = (await ctx.db.query("tourBookings").collect()).filter((b) => (b.selectedAddons ?? []).some((s) => s.universalAddonId === id)).length;
    return {
      encontrado: true as const,
      extra: x,
      versao: x.updatedAt,
      imagemUrl: x.imageId ? await urlDaImagem(ctx, x.imageId) : null,
      alcance: a,
      reservas,
      falta: faltaUniversal(x),
    };
  },
});

/* ─── Gravar ────────────────────────────────────────────────────────── */

async function proximaOrdem(ctx: MutationCtx, tabela: (typeof TABELA)[Tipo]) {
  const xs = await ctx.db.query(tabela).collect();
  return xs.reduce((m, r) => Math.max(m, r.order + 1), 0);
}

export const guardarParagem = mutation({
  args: {
    id: v.optional(v.id("upsellStops")),
    versao: v.optional(v.number()),
    dados: v.object({
      title: v.string(),
      description: v.string(),
      imageId: v.optional(vImagem),
      location: v.optional(vLocal),
      price30: v.number(),
      price15: v.optional(v.number()),
      tag: vSelo,
      universal: v.boolean(),
      translations: catalogTranslationsValidator,
    }),
  },
  handler: async (ctx, { id, versao, dados }) => {
    await exigirAdmin(ctx, "extras");
    const actual = id ? await ctx.db.get(id) : null;
    if (id && !actual) erroNaoExiste();
    if (actual && versao !== actual.updatedAt) erroConflito();

    const e: Erros = {};
    if (!dados.title.trim()) e.title = "Dê um nome à paragem.";
    if (!valido(dados.price30)) e.price30 = "Indique o preço dos 30 minutos.";
    if (dados.price15 !== undefined && !valido(dados.price15)) e.price15 = "Preço inválido.";
    if (dados.price15 !== undefined && valido(dados.price30) && dados.price15 > dados.price30) e.price15 = "Os 15 minutos não podem custar mais do que os 30.";
    if (Object.keys(e).length) invalido(e);

    const d = {
      title: dados.title.trim(),
      description: dados.description.trim() || undefined,
      imageId: dados.imageId,
      location: dados.location,
      price30: dados.price30,
      price15: dados.price15,
      tag: dados.tag,
      universal: dados.universal,
      translations: limparTraducoes(dados.translations),
    };
    const agora = Date.now();
    if (actual) {
      if (actual.status === "published") {
        const f = faltaCheckout(d, d.price30);
        if (f.length) publicadoIncompleto(f);
      }
      if (actual.imageId !== d.imageId) await guardarNaBiblioteca(ctx, actual.imageId, actual.title);
      await ctx.db.patch(actual._id, { ...d, updatedAt: agora });
      return { id: actual._id, versao: agora };
    }
    const novo = await ctx.db.insert("upsellStops", {
      ...d,
      currency: "EUR",
      status: "draft",
      order: await proximaOrdem(ctx, "upsellStops"),
      createdAt: agora,
      updatedAt: agora,
    });
    return { id: novo, versao: agora };
  },
});

export const guardarExperiencia = mutation({
  args: {
    id: v.optional(v.id("upsellExperiences")),
    versao: v.optional(v.number()),
    dados: v.object({
      title: v.string(),
      description: v.string(),
      imageId: v.optional(vImagem),
      location: v.optional(vLocal),
      basePrice: v.number(),
      pricingModel: v.union(v.literal("perPerson"), v.literal("flat")),
      duration: v.string(),
      addons: v.array(
        v.object({
          name: v.string(),
          price: v.number(),
          pricingType: v.union(v.literal("per_person"), v.literal("flat")),
          translations: catalogTranslationsValidator,
        }),
      ),
      hasDateField: v.boolean(),
      hasSpecialRequest: v.boolean(),
      tag: vSelo,
      universal: v.boolean(),
      translations: catalogTranslationsValidator,
    }),
  },
  handler: async (ctx, { id, versao, dados }) => {
    await exigirAdmin(ctx, "extras");
    const actual = id ? await ctx.db.get(id) : null;
    if (id && !actual) erroNaoExiste();
    if (actual && versao !== actual.updatedAt) erroConflito();

    const opcoes = dados.addons.filter((a) => a.name.trim() || a.price);
    const e: Erros = {};
    if (!dados.title.trim()) e.title = "Dê um nome à experiência.";
    if (!valido(dados.basePrice)) e.basePrice = "Indique o preço.";
    if (opcoes.some((a) => !a.name.trim())) e.addons = "Cada opção precisa de um nome.";
    else if (opcoes.some((a) => !valido(a.price))) e.addons = "Há uma opção com o preço inválido.";
    if (Object.keys(e).length) invalido(e);

    const d = {
      title: dados.title.trim(),
      description: dados.description.trim() || undefined,
      imageId: dados.imageId,
      location: dados.location,
      basePrice: dados.basePrice,
      pricingModel: dados.pricingModel,
      duration: dados.duration.trim() || undefined,
      addons: opcoes.map((a) => ({
        name: a.name.trim(),
        price: a.price,
        pricingType: a.pricingType,
        translations: limparTraducoes(a.translations),
      })),
      hasDateField: dados.hasDateField,
      hasSpecialRequest: dados.hasSpecialRequest,
      tag: dados.tag,
      universal: dados.universal,
      translations: limparTraducoes(dados.translations),
    };
    const agora = Date.now();
    if (actual) {
      if (actual.status === "published") {
        const f = faltaCheckout(d, d.basePrice);
        if (f.length) publicadoIncompleto(f);
      }
      if (actual.imageId !== d.imageId) await guardarNaBiblioteca(ctx, actual.imageId, actual.title);
      await ctx.db.patch(actual._id, { ...d, updatedAt: agora });
      return { id: actual._id, versao: agora };
    }
    const novo = await ctx.db.insert("upsellExperiences", {
      ...d,
      currency: "EUR",
      status: "draft",
      order: await proximaOrdem(ctx, "upsellExperiences"),
      createdAt: agora,
      updatedAt: agora,
    });
    return { id: novo, versao: agora };
  },
});

export const guardarUniversal = mutation({
  args: {
    id: v.optional(v.id("universalAddons")),
    versao: v.optional(v.number()),
    dados: v.object({
      title: v.string(),
      description: v.string(),
      imageId: v.optional(vImagem),
      price: v.number(),
      pricingType: v.union(v.literal("per_person"), v.literal("flat")),
      scopes: v.array(vAmbito),
      translations: catalogTranslationsValidator,
    }),
  },
  handler: async (ctx, { id, versao, dados }) => {
    await exigirAdmin(ctx, "extras");
    const actual = id ? await ctx.db.get(id) : null;
    if (id && !actual) erroNaoExiste();
    if (actual && versao !== actual.updatedAt) erroConflito();

    const e: Erros = {};
    if (!dados.title.trim()) e.title = "Dê um nome ao extra.";
    if (!valido(dados.price)) e.price = "Indique o preço.";
    if (dados.scopes.length === 0) e.scopes = "Escolha pelo menos onde aparece.";
    if (Object.keys(e).length) invalido(e);

    const d = {
      title: dados.title.trim(),
      description: dados.description.trim() || undefined,
      imageId: dados.imageId,
      price: dados.price,
      pricingType: dados.pricingType,
      scopes: [...new Set(dados.scopes)],
      translations: limparTraducoes(dados.translations),
    };
    const agora = Date.now();
    if (actual) {
      if (actual.imageId !== d.imageId) await guardarNaBiblioteca(ctx, actual.imageId, actual.title);
      await ctx.db.patch(actual._id, { ...d, updatedAt: agora });
      return { id: actual._id, versao: agora };
    }
    const novo = await ctx.db.insert("universalAddons", {
      ...d,
      currency: "EUR",
      originalLanguage: "pt",
      status: "draft",
      order: await proximaOrdem(ctx, "universalAddons"),
      createdAt: agora,
      updatedAt: agora,
    });
    return { id: novo, versao: agora };
  },
});

/* ─── Estado, ordem e apagar ────────────────────────────────────────── */

async function lerQualquer(ctx: QueryCtx, tipo: Tipo, id: string) {
  const tabela = TABELA[tipo];
  const nid = ctx.db.normalizeId(tabela, id);
  const doc = nid ? await ctx.db.get(nid) : null;
  if (!doc) erroNaoExiste();
  return doc as Doc<"upsellStops"> | Doc<"upsellExperiences"> | Doc<"universalAddons">;
}

export const mudarEstado = mutation({
  args: { tipo: vTipo, id: v.string(), estado: v.union(v.literal("draft"), v.literal("published")) },
  handler: async (ctx, { tipo, id, estado }) => {
    await exigirAdmin(ctx, "extras");
    const x = await lerQualquer(ctx, tipo, id);
    if (estado === "published") {
      const falta =
        tipo === "universais"
          ? faltaUniversal(x as Doc<"universalAddons">)
          : tipo === "paragens"
            ? faltaCheckout(x as Doc<"upsellStops">, (x as Doc<"upsellStops">).price30)
            : faltaCheckout(x as Doc<"upsellExperiences">, (x as Doc<"upsellExperiences">).basePrice);
      if (falta.length) throw new ConvexError({ tipo: "impedido", mensagem: `Para publicar falta: ${falta.map((f) => f.texto.toLowerCase()).join(", ")}.` });
    }
    const agora = Date.now();
    await ctx.db.patch(x._id, { status: estado, updatedAt: agora });
    return { versao: agora };
  },
});

/* Reorders one page of a tab, in site order (see reorderSlice). */
export const reorderPage = mutation({
  args: { tipo: vTipo, start: v.number(), ids: v.array(v.string()) },
  handler: async (ctx, { tipo, start, ids }) => {
    await exigirAdmin(ctx, "extras");
    const all = (await ctx.db.query(TABELA[tipo]).collect()).sort((x, y) => x.order - y.order);
    const order = reorderSlice(all.map((x) => x._id as string), start, ids);
    if (!order) {
      throw new ConvexError({ tipo: "conflito", mensagem: "A lista mudou entretanto. Recarregue e volte a ordenar." });
    }
    const byId = new Map(all.map((x) => [x._id as string, x]));
    const now = Date.now();
    await Promise.all(
      order.map((id, i) => {
        const x = byId.get(id)!;
        return x.order === i ? null : ctx.db.patch(x._id, { order: i, updatedAt: now });
      }),
    );
  },
});

export const reordenar = mutation({
  args: { tipo: vTipo, ids: v.array(v.string()) },
  handler: async (ctx, { tipo, ids }) => {
    await exigirAdmin(ctx, "extras");
    const todos = await ctx.db.query(TABELA[tipo]).collect();
    const existentes = new Set(todos.map((x) => x._id as string));
    /* A lista tem de ser a completa: uma lista antiga (outro separador)
       baralhava os que faltassem. */
    if (ids.length !== todos.length || new Set(ids).size !== ids.length || !ids.every((i) => existentes.has(i))) {
      throw new ConvexError({ tipo: "conflito", mensagem: "A lista mudou entretanto. Recarregue e volte a ordenar." });
    }
    const porId = new Map(todos.map((x) => [x._id as string, x]));
    const agora = Date.now();
    await Promise.all(
      ids.map((i, ordem) => {
        const x = porId.get(i)!;
        return x.order === ordem ? null : ctx.db.patch(x._id, { order: ordem, updatedAt: agora });
      }),
    );
  },
});

/*
 * Apaga a linha e, num universal, tira-o das excepções dos tours e eventos
 * (senão ficavam ids mortos). As reservas já feitas guardam o nome e o preço,
 * não dependem disto. O ficheiro da imagem fica (pode estar noutros extras)
 * e a foto passa para a biblioteca, para não se perder de vista.
 */
export const remover = mutation({
  args: { tipo: vTipo, id: v.string() },
  handler: async (ctx, { tipo, id }) => {
    await exigirAdmin(ctx, "extras", "editar", "apagar");
    const nid = ctx.db.normalizeId(TABELA[tipo], id);
    const x = nid ? await ctx.db.get(nid) : null;
    if (!x) return;
    if (tipo === "universais") {
      const uid = x._id as Id<"universalAddons">;
      for (const t of await ctx.db.query("tours").collect()) {
        if (t.disabledUniversalAddons?.includes(uid)) await ctx.db.patch(t._id, { disabledUniversalAddons: t.disabledUniversalAddons.filter((y) => y !== uid) });
      }
      for (const e of await ctx.db.query("events").collect()) {
        if (e.disabledUniversalAddons?.includes(uid)) await ctx.db.patch(e._id, { disabledUniversalAddons: e.disabledUniversalAddons.filter((y) => y !== uid) });
      }
    }
    await guardarNaBiblioteca(ctx, x.imageId, x.title);
    await ctx.db.delete(x._id);
  },
});
