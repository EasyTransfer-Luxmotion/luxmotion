import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { avaliarAcesso, exigirAdmin } from "./lib/admin";
import { apagarImagem, urlDaImagem } from "./lib/imagens";

/*
 * Catálogo → Tours no dashboard (E3). Substitui, para o ecrã novo, o
 * tours.listPaged/create/update e a sequência de chamadas que o formulário
 * antigo fazia ao gravar.
 *
 * O que muda:
 *  - Gravar é uma transacção só: o tour, as paragens e o horário. O
 *    formulário antigo gravava o tour e depois apagava/criava paragens uma a
 *    uma — uma falha a meio deixava metade gravado.
 *  - O assistente antigo só gravava no último dos dez passos; aqui grava-se
 *    de qualquer secção.
 *  - As paragens que ficam mantêm o _id (e as suas traduções); as que saem
 *    levam as traduções e a imagem.
 *  - A data de publicação só muda quando o tour passa a publicado. Antes,
 *    cada gravação de um tour publicado punha publishedAt = agora, e o site
 *    ordena as listagens por essa data: corrigir uma vírgula subia o tour
 *    para o topo.
 *  - Publicar exige o essencial (impedimentos), dito campo a campo.
 *  - Apagar recusa um tour com reservas: o tours.remove antigo apagava
 *    também as avaliações, sem olhar para as reservas.
 *  - Conflito: o editor manda o updatedAt que leu.
 *
 * O isActive não é mostrado: está a true em todos e nem o site nem o servidor
 * o usam para decidir o que aparece (2026-11-14).
 */

const vCategoria = v.union(
  v.literal("tours"),
  v.literal("experiences"),
  v.literal("private"),
  v.literal("stops"),
  v.literal("events"),
);

const vLocal = v.object({
  title: v.string(),
  address: v.string(),
  description: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  placeId: v.optional(v.string()),
});

const vDia = v.object({
  title: v.string(),
  titleAccent: v.optional(v.string()),
  hoursActive: v.optional(v.string()),
  nights: v.optional(v.number()),
  hotel: v.optional(v.string()),
  stops: v.array(
    v.object({
      time: v.optional(v.string()),
      label: v.optional(v.string()),
      title: v.string(),
      description: v.optional(v.string()),
      imageId: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    }),
  ),
});

const vDados = v.object({
  title: v.string(),
  subtitle: v.optional(v.string()),
  description: v.any(),
  tourType: v.string(),
  originalLanguage: v.string(),
  category: vCategoria,
  destination: v.string(),
  isUltraLuxury: v.optional(v.boolean()),
  tourTypeTag: v.optional(
    v.union(
      v.literal("half-day"),
      v.literal("full-day"),
      v.literal("multi-day"),
      v.literal("river-cruise"),
      v.literal("private-yacht"),
      v.literal("helicopter"),
    ),
  ),
  durationDays: v.optional(v.number()),
  itineraryDays: v.optional(v.array(vDia)),
  duration: v.string(),
  groupSize: v.string(),
  languages: v.array(v.string()),
  basePrice: v.number(),
  originalPrice: v.optional(v.number()),
  currency: v.string(),
  bannerImageId: v.optional(v.string()),
  additionalBannerIds: v.optional(v.array(v.string())),
  additionalBannerTypes: v.optional(v.array(v.union(v.literal("image"), v.literal("video")))),
  included: v.optional(v.array(v.string())),
  excluded: v.optional(v.array(v.string())),
  tags: v.optional(v.array(v.string())),
  pickup: v.optional(vLocal),
  dropoff: v.optional(vLocal),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
  bookingDeadlineHours: v.optional(v.number()),
  cancellationPolicy: v.optional(v.string()),
  minPassengers: v.optional(v.number()),
  maxPassengers: v.optional(v.number()),
});

/* Chaves opcionais que vão sempre no patch: um campo esvaziado no browser
   chega sem chave, e um patch sem a chave não o apaga (era assim que tirar o
   "preço antes do desconto" não tirava nada). */
const OPCIONAIS = [
  "subtitle",
  "isUltraLuxury",
  "tourTypeTag",
  "durationDays",
  "itineraryDays",
  "originalPrice",
  "bannerImageId",
  "additionalBannerIds",
  "additionalBannerTypes",
  "included",
  "excluded",
  "tags",
  "pickup",
  "dropoff",
  "seoTitle",
  "seoDescription",
  "bookingDeadlineHours",
  "cancellationPolicy",
  "minPassengers",
  "maxPassengers",
] as const;

const vParagem = v.object({
  _id: v.optional(v.id("tourStops")),
  time: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  imageId: v.optional(v.string()),
  showImage: v.boolean(),
  address: v.optional(v.string()),
  placeId: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
});

const vHorario = v.object({
  activeDays: v.array(v.number()),
  timeSlots: v.array(v.object({ startTime: v.string(), endTime: v.optional(v.string()) })),
  validFrom: v.optional(v.number()),
  validUntil: v.optional(v.number()),
  isActive: v.boolean(),
});

type Dados = typeof vDados.type;
type Horario = typeof vHorario.type;
type Erros = Partial<Record<string, string>>;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function temTexto(d: unknown): boolean {
  if (typeof d === "string") return d.trim().length > 0;
  /* O editor rico grava um documento; tem texto se algum nó "text" tiver
     mais do que espaços. */
  return /"text":"\s*[^"\s]/.test(JSON.stringify(d ?? ""));
}

function validar(d: Dados, paragens: (typeof vParagem.type)[], horario: Horario | null): Erros {
  const e: Erros = {};
  if (!d.title.trim()) e.title = "Dê um título ao tour.";
  if (!d.duration.trim()) e.duration = "Diga quanto dura (ex.: 4 horas).";
  if (!Number.isFinite(d.basePrice) || d.basePrice <= 0) e.basePrice = "Um preço acima de 0.";
  if (d.originalPrice !== undefined && (!Number.isFinite(d.originalPrice) || d.originalPrice < 0)) {
    e.originalPrice = "Um número, ou deixe vazio.";
  }
  const inteiro = (x: number | undefined) => x === undefined || (Number.isInteger(x) && x >= 1 && x <= 500);
  if (!inteiro(d.minPassengers)) e.minPassengers = "Um número inteiro de 1 a 500.";
  if (!inteiro(d.maxPassengers)) e.maxPassengers = "Um número inteiro de 1 a 500.";
  if (!e.minPassengers && !e.maxPassengers && d.minPassengers && d.maxPassengers && d.minPassengers > d.maxPassengers) {
    e.maxPassengers = "O máximo não pode ser menor que o mínimo.";
  }
  if (d.bookingDeadlineHours !== undefined && (!Number.isFinite(d.bookingDeadlineHours) || d.bookingDeadlineHours < 0)) {
    e.bookingDeadlineHours = "Horas, 0 ou mais.";
  }
  if (paragens.some((p) => !p.title.trim())) e.paragens = "Há paragens sem nome.";
  if (horario) {
    if (horario.activeDays.some((x) => !Number.isInteger(x) || x < 0 || x > 6)) e.horario = "Dias da semana inválidos.";
    if (horario.timeSlots.some((s) => !HORA.test(s.startTime) || (s.endTime && !HORA.test(s.endTime)))) {
      e.horario = "As horas escrevem-se HH:MM (ex.: 09:30).";
    }
    if (horario.validFrom && horario.validUntil && horario.validFrom > horario.validUntil) {
      e.horario = "O fim da validade é antes do início.";
    }
  }
  return e;
}

/* O que falta para publicar. Medido em produção a 2026-11-14: dos 105
   publicados, só 1 não cumpria (sem horário) — e continua publicado; isto só
   pesa quando se publica. */
function impedimentos(t: Pick<Dados, "title" | "duration" | "basePrice" | "bannerImageId" | "description" | "isUltraLuxury">, horario: Pick<Horario, "activeDays" | "timeSlots"> | null) {
  const falta: { campo: string; texto: string }[] = [];
  if (!t.title.trim()) falta.push({ campo: "title", texto: "Título" });
  if (!temTexto(t.description)) falta.push({ campo: "description", texto: "Descrição" });
  if (!t.bannerImageId) falta.push({ campo: "bannerImageId", texto: "Fotografia principal" });
  if (!(t.basePrice > 0)) falta.push({ campo: "basePrice", texto: "Preço" });
  if (!t.duration.trim()) falta.push({ campo: "duration", texto: "Duração" });
  if (!t.isUltraLuxury && !(horario && horario.activeDays.length && horario.timeSlots.some((s) => s.startTime))) {
    falta.push({ campo: "horario", texto: "Horário (dias e horas) — sem ele não se consegue reservar" });
  }
  return falta;
}

async function horarioDe(ctx: QueryCtx, tourId: Id<"tours">) {
  return ctx.db
    .query("tourSchedules")
    .withIndex("by_tour", (q) => q.eq("tourId", tourId))
    .first();
}

export const lista = query({
  args: {},
  handler: async (ctx) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const tours = await ctx.db.query("tours").collect();
    const traducoes = await ctx.db.query("tourTranslations").collect();
    return Promise.all(
      tours.map(async (t) => ({
        _id: t._id,
        titulo: t.title,
        slug: t.slug,
        estado: t.status,
        categoria: t.category,
        destino: t.destination,
        ultra: Boolean(t.isUltraLuxury),
        destaque: t.isFeatured,
        bestseller: t.isBestSeller,
        preco: t.basePrice,
        precoAntes: t.originalPrice ?? null,
        duracao: t.duration,
        imagem: t.bannerImageId ? await urlDaImagem(ctx, t.bannerImageId) : null,
        idiomas: [t.originalLanguage, ...traducoes.filter((x) => x.tourId === t._id).map((x) => x.locale)],
        actualizado: t.updatedAt,
        avaliacao: t.rating ?? null,
      })),
    );
  },
});

export const detalhe = query({
  args: { id: v.id("tours") },
  handler: async (ctx, { id }) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const t = await ctx.db.get(id);
    if (!t) return { encontrado: false as const };
    const [paragens, horario, traducoes, extras, reservas, destaques] = await Promise.all([
      ctx.db.query("tourStops").withIndex("by_tour", (q) => q.eq("tourId", id)).collect(),
      horarioDe(ctx, id),
      ctx.db.query("tourTranslations").withIndex("by_tour", (q) => q.eq("tourId", id)).collect(),
      ctx.db.query("tourAddons").withIndex("by_tour", (q) => q.eq("tourId", id)).collect(),
      ctx.db.query("tourBookings").withIndex("by_tour", (q) => q.eq("tourId", id)).take(1000),
      ctx.db.query("tours").withIndex("by_featured", (q) => q.eq("isFeatured", true)).collect(),
    ]);
    const bannerUrl = t.bannerImageId ? await urlDaImagem(ctx, t.bannerImageId) : null;
    const extrasUrls = await Promise.all((t.additionalBannerIds ?? []).map((x) => urlDaImagem(ctx, x)));
    return {
      encontrado: true as const,
      tour: { ...t, bannerUrl, additionalBannerUrls: extrasUrls },
      versao: t.updatedAt,
      paragens: await Promise.all(
        paragens
          .sort((a, b) => a.order - b.order)
          .map(async (p) => ({ ...p, imageUrl: p.imageId ? ((await urlDaImagem(ctx, p.imageId)) ?? undefined) : undefined })),
      ),
      horario: horario
        ? {
            activeDays: horario.activeDays,
            timeSlots: horario.timeSlots,
            validFrom: horario.validFrom ?? null,
            validUntil: horario.validUntil ?? null,
            isActive: horario.isActive,
          }
        : null,
      traducoes: traducoes.map((x) => ({ locale: x.locale, actualizado: x.updatedAt ?? x._creationTime })),
      extras: extras.length,
      reservas: reservas.length,
      destaques: destaques.length,
      impedimentos: impedimentos(t, horario),
    };
  },
});

async function sincronizarParagens(ctx: MutationCtx, tourId: Id<"tours">, paragens: (typeof vParagem.type)[], agora: number) {
  const existentes = await ctx.db.query("tourStops").withIndex("by_tour", (q) => q.eq("tourId", tourId)).collect();
  const ficam = new Set(paragens.map((p) => p._id).filter(Boolean));
  for (const p of existentes) {
    if (ficam.has(p._id)) continue;
    for (const tr of await ctx.db.query("tourStopTranslations").withIndex("by_stop", (q) => q.eq("stopId", p._id)).collect()) {
      await ctx.db.delete(tr._id);
    }
    if (p.imageId) await apagarImagem(ctx, p.imageId);
    await ctx.db.delete(p._id);
  }
  for (const [ordem, p] of paragens.entries()) {
    const { _id, ...campos } = p;
    const doc = {
      ...campos,
      title: campos.title.trim(),
      description: campos.description,
      imageId: campos.imageId,
      address: campos.address,
      placeId: campos.placeId,
      lat: campos.lat,
      lng: campos.lng,
      order: ordem,
      updatedAt: agora,
    };
    const actual = _id ? existentes.find((x) => x._id === _id) : undefined;
    if (actual) {
      if (actual.imageId && actual.imageId !== campos.imageId) await apagarImagem(ctx, actual.imageId);
      await ctx.db.patch(actual._id, doc);
    } else {
      await ctx.db.insert("tourStops", { ...doc, tourId, createdAt: agora });
    }
  }
}

async function gravarHorario(ctx: MutationCtx, tourId: Id<"tours">, horario: Horario | null, agora: number) {
  const actual = await horarioDe(ctx, tourId);
  if (!horario) return;
  const doc = {
    activeDays: [...new Set(horario.activeDays)].sort(),
    timeSlots: horario.timeSlots.filter((s) => s.startTime),
    validFrom: horario.validFrom,
    validUntil: horario.validUntil,
    isActive: horario.isActive,
    updatedAt: agora,
  };
  if (actual) await ctx.db.patch(actual._id, doc);
  else await ctx.db.insert("tourSchedules", { ...doc, tourId, createdAt: agora });
}

function slugDe(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "tour";
}

export const guardar = mutation({
  args: {
    id: v.optional(v.id("tours")),
    versao: v.optional(v.number()),
    dados: vDados,
    paragens: v.array(vParagem),
    horario: v.union(vHorario, v.null()),
  },
  handler: async (ctx, { id, versao, dados, paragens, horario }) => {
    await exigirAdmin(ctx);
    const actual = id ? await ctx.db.get(id) : null;
    if (id && !actual) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este tour já não existe." });
    if (actual && versao !== actual.updatedAt) {
      throw new ConvexError({
        tipo: "conflito",
        mensagem: "Alguém gravou este tour depois de o abrir. Veja a versão actual antes de gravar por cima.",
      });
    }
    const erros = validar(dados, paragens, horario);
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const agora = Date.now();
    const d: Dados = { ...dados, title: dados.title.trim(), duration: dados.duration.trim() };
    const comChaves = Object.fromEntries(OPCIONAIS.map((k) => [k, d[k]])) as Partial<Dados>;

    let tourId: Id<"tours">;
    if (actual) {
      await ctx.db.patch(actual._id, { ...d, ...comChaves, updatedAt: agora });
      tourId = actual._id;
    } else {
      let slug = slugDe(d.title);
      if (await ctx.db.query("tours").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) slug = `${slug}-${agora.toString(36)}`;
      tourId = await ctx.db.insert("tours", {
        ...d,
        slug,
        status: "draft",
        isFeatured: false,
        isBestSeller: false,
        isActive: true,
        rating: 0,
        reviewCount: 0,
        createdAt: agora,
        updatedAt: agora,
      });
    }
    await sincronizarParagens(ctx, tourId, paragens, agora);
    await gravarHorario(ctx, tourId, horario, agora);
    return { id: tourId, versao: agora };
  },
});

export const mudarEstado = mutation({
  args: { id: v.id("tours"), estado: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")) },
  handler: async (ctx, { id, estado }) => {
    await exigirAdmin(ctx);
    const t = await ctx.db.get(id);
    if (!t) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este tour já não existe." });
    if (estado === "published") {
      const falta = impedimentos(t, await horarioDe(ctx, id));
      if (falta.length) {
        throw new ConvexError({
          tipo: "impedido",
          mensagem: `Para publicar falta: ${falta.map((f) => f.texto.split(" — ")[0]!.toLowerCase()).join(", ")}.`,
        });
      }
    }
    const agora = Date.now();
    await ctx.db.patch(id, {
      status: estado,
      /* Só ao passar a publicado; voltar a gravar um publicado não mexe. */
      publishedAt: estado === "published" && t.status !== "published" ? agora : t.publishedAt,
      updatedAt: agora,
    });
    return { versao: agora };
  },
});

/* Destaque (máximo 6, como no tours.toggleFeatured) e mais vendido. */
export const marcar = mutation({
  args: { id: v.id("tours"), marca: v.union(v.literal("destaque"), v.literal("bestseller")), valor: v.boolean() },
  handler: async (ctx, { id, marca, valor }) => {
    await exigirAdmin(ctx);
    const t = await ctx.db.get(id);
    if (!t) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este tour já não existe." });
    if (marca === "destaque" && valor && !t.isFeatured) {
      const n = (await ctx.db.query("tours").withIndex("by_featured", (q) => q.eq("isFeatured", true)).collect()).length;
      if (n >= 6) throw new ConvexError({ tipo: "limite", mensagem: "Já há 6 tours em destaque, o máximo da página inicial. Tire um antes." });
    }
    await ctx.db.patch(id, marca === "destaque" ? { isFeatured: valor, updatedAt: Date.now() } : { isBestSeller: valor, updatedAt: Date.now() });
  },
});

export const remover = mutation({
  args: { id: v.id("tours") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
    const t = await ctx.db.get(id);
    if (!t) return;
    const reservas = await ctx.db.query("tourBookings").withIndex("by_tour", (q) => q.eq("tourId", id)).first();
    if (reservas) {
      throw new ConvexError({
        tipo: "emUso",
        mensagem: "Este tour tem reservas. Arquive-o em vez de o apagar: sai do site e as reservas continuam a apontar para ele.",
      });
    }
    /* O tours.remove apaga em cascata (traduções, paragens, extras, horários,
       avaliações). Sem reservas, é isso que se quer. */
    await ctx.runMutation(api.tours.remove, { id });
  },
});

export type Tour = Doc<"tours">;
