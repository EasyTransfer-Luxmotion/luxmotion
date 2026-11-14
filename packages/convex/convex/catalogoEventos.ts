import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { avaliarAcesso, exigirAdmin } from "./lib/admin";
import { urlDaImagem } from "./lib/imagens";

/*
 * Catálogo → Eventos no dashboard (E3). Substitui, para o ecrã novo, o
 * events.listPaged/create/update/publish/unpublish/cancel.
 *
 * O que muda (como nos Tours):
 *  - Grava-se de qualquer secção, com conflito pelo updatedAt e as chaves
 *    opcionais sempre presentes (esvaziar um campo apaga-o).
 *  - publishedAt só muda ao passar a publicado; o events.update antigo
 *    punha-o a agora em cada gravação de um publicado.
 *  - Publicar exige o essencial; uma data já passada também impede.
 *  - Cancelar é um estado, não um apagar: sai do site e fica o registo.
 *  - Apagar recusa um evento com reservas.
 *
 * As datas chegam em ms, já convertidas da hora de Lisboa pelo dashboard. O
 * formulário antigo convertia pela hora do computador de quem editava.
 *
 * basePrice/originalPrice (o preço antigo) não se tocam aqui: em produção,
 * 33 dos 35 eventos ainda os têm (2026-11-14), à espera do dropLegacyPrices.
 */

const vLocal = v.object({
  title: v.string(),
  address: v.string(),
  description: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  placeId: v.optional(v.string()),
});

const vDados = v.object({
  title: v.string(),
  subtitle: v.optional(v.string()),
  description: v.any(),
  originalLanguage: v.string(),
  location: v.string(),
  venue: v.optional(v.string()),
  eventDate: v.number(),
  endDate: v.optional(v.number()),
  returnAt: v.optional(v.number()),
  maxCapacity: v.optional(v.number()),
  minPassengers: v.optional(v.number()),
  maxPassengers: v.optional(v.number()),
  vehicleId: v.optional(v.id("vehicles")),
  confirmationHours: v.optional(v.number()),
  privatePrice: v.number(),
  sharedPrice: v.optional(v.number()),
  currency: v.string(),
  bannerImageId: v.optional(v.string()),
  additionalBannerIds: v.optional(v.array(v.string())),
  included: v.optional(v.array(v.string())),
  excluded: v.optional(v.array(v.string())),
  tags: v.optional(v.array(v.string())),
  meetingPoint: v.optional(vLocal),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
});
type Dados = typeof vDados.type;

const OPCIONAIS = [
  "subtitle",
  "venue",
  "endDate",
  "returnAt",
  "maxCapacity",
  "minPassengers",
  "maxPassengers",
  "vehicleId",
  "confirmationHours",
  "sharedPrice",
  "bannerImageId",
  "additionalBannerIds",
  "included",
  "excluded",
  "tags",
  "meetingPoint",
  "seoTitle",
  "seoDescription",
] as const;

type Erros = Partial<Record<string, string>>;

function validar(d: Dados): Erros {
  const e: Erros = {};
  if (!d.title.trim()) e.title = "Dê um título ao evento.";
  if (!d.location.trim()) e.location = "Diga onde é.";
  if (!Number.isFinite(d.eventDate)) e.eventDate = "Escolha o dia e a hora de início.";
  if (d.endDate !== undefined && Number.isFinite(d.eventDate) && d.endDate < d.eventDate) e.endDate = "O fim é antes do início.";
  if (!Number.isFinite(d.privatePrice) || d.privatePrice <= 0) e.privatePrice = "Um preço acima de 0.";
  if (d.sharedPrice !== undefined && (!Number.isFinite(d.sharedPrice) || d.sharedPrice <= 0)) e.sharedPrice = "Um preço acima de 0, ou vazio.";
  const inteiro = (x: number | undefined, max = 5000) => x === undefined || (Number.isInteger(x) && x >= 1 && x <= max);
  if (!inteiro(d.maxCapacity)) e.maxCapacity = "Um número inteiro, 1 ou mais.";
  if (!inteiro(d.minPassengers)) e.minPassengers = "Um número inteiro, 1 ou mais.";
  if (!inteiro(d.maxPassengers)) e.maxPassengers = "Um número inteiro, 1 ou mais.";
  if (!e.minPassengers && !e.maxPassengers && d.minPassengers && d.maxPassengers && d.minPassengers > d.maxPassengers) {
    e.maxPassengers = "O máximo não pode ser menor que o mínimo.";
  }
  if (d.confirmationHours !== undefined && (!Number.isInteger(d.confirmationHours) || d.confirmationHours < 0 || d.confirmationHours > 720)) {
    e.confirmationHours = "Horas, de 0 a 720.";
  }
  return e;
}

function temTexto(d: unknown): boolean {
  if (typeof d === "string") return d.trim().length > 0;
  return /"text":"\s*[^"\s]/.test(JSON.stringify(d ?? ""));
}

function impedimentos(e: Pick<Doc<"events">, "title" | "description" | "bannerImageId" | "privatePrice" | "eventDate" | "endDate" | "vehicleId" | "meetingPoint">) {
  const falta: { campo: string; texto: string }[] = [];
  if (!e.title.trim()) falta.push({ campo: "title", texto: "Título" });
  if (!temTexto(e.description)) falta.push({ campo: "description", texto: "Descrição" });
  if (!e.bannerImageId) falta.push({ campo: "bannerImageId", texto: "Fotografia principal" });
  if (!(e.privatePrice && e.privatePrice > 0)) falta.push({ campo: "privatePrice", texto: "Preço privado" });
  if (!e.vehicleId) falta.push({ campo: "vehicleId", texto: "Viatura — é dela que sai o limite de pessoas no checkout" });
  if (!e.meetingPoint) falta.push({ campo: "meetingPoint", texto: "Ponto de encontro" });
  if ((e.endDate ?? e.eventDate) < Date.now()) falta.push({ campo: "eventDate", texto: "Uma data futura — esta já passou" });
  return falta;
}

async function viaturas(ctx: QueryCtx) {
  const vs = await ctx.db.query("vehicles").withIndex("by_order").collect();
  return vs.map((x) => ({ _id: x._id, nome: x.name, passageiros: x.passengers, exemplos: x.examples ?? null, estado: x.status, donoId: x.partnershipId ?? null }));
}

export const lista = query({
  args: {},
  handler: async (ctx) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const eventos = await ctx.db.query("events").collect();
    const traducoes = await ctx.db.query("eventTranslations").collect();
    const vs = await ctx.db.query("vehicles").collect();
    return Promise.all(
      eventos.map(async (e) => ({
        _id: e._id,
        titulo: e.title,
        slug: e.slug,
        estado: e.status,
        local: e.location,
        sitio: e.venue ?? null,
        inicio: e.eventDate,
        fim: e.endDate ?? null,
        precoPrivado: e.privatePrice ?? e.basePrice ?? null,
        precoPartilhado: e.sharedPrice ?? null,
        destaque: e.isFeatured,
        viatura: e.vehicleId ? (vs.find((x) => x._id === e.vehicleId)?.name ?? null) : null,
        imagem: e.bannerImageId ? await urlDaImagem(ctx, e.bannerImageId) : null,
        idiomas: [e.originalLanguage, ...traducoes.filter((x) => x.eventId === e._id).map((x) => x.locale)],
      })),
    );
  },
});

export const detalhe = query({
  args: { id: v.id("events") },
  handler: async (ctx, { id }) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const e = await ctx.db.get(id);
    if (!e) return { encontrado: false as const };
    const [traducoes, extras, reservas, destaques] = await Promise.all([
      ctx.db.query("eventTranslations").withIndex("by_event", (q) => q.eq("eventId", id)).collect(),
      ctx.db.query("tourAddons").withIndex("by_event", (q) => q.eq("eventId", id)).collect(),
      ctx.db.query("tourBookings").withIndex("by_event", (q) => q.eq("eventId", id)).take(1000),
      ctx.db.query("events").withIndex("by_featured", (q) => q.eq("isFeatured", true)).collect(),
    ]);
    return {
      encontrado: true as const,
      evento: {
        ...e,
        bannerUrl: e.bannerImageId ? await urlDaImagem(ctx, e.bannerImageId) : null,
        additionalBannerUrls: await Promise.all((e.additionalBannerIds ?? []).map((x) => urlDaImagem(ctx, x))),
      },
      versao: e.updatedAt,
      viaturas: await viaturas(ctx),
      traducoes: traducoes.map((x) => ({ locale: x.locale })),
      extras: extras.length,
      reservas: reservas.length,
      destaques: destaques.length,
      impedimentos: impedimentos(e),
      estados: destinos(e),
    };
  },
});

export const paraNovo = query({
  args: {},
  handler: async (ctx) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    return { viaturas: await viaturas(ctx) };
  },
});

function slugDe(titulo: string): string {
  return (
    titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "evento"
  );
}

export const guardar = mutation({
  args: { id: v.optional(v.id("events")), versao: v.optional(v.number()), dados: vDados },
  handler: async (ctx, { id, versao, dados }) => {
    await exigirAdmin(ctx);
    const actual = id ? await ctx.db.get(id) : null;
    if (id && !actual) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este evento já não existe." });
    if (actual && versao !== actual.updatedAt) {
      throw new ConvexError({ tipo: "conflito", mensagem: "Alguém gravou este evento depois de o abrir. Veja a versão actual antes de gravar por cima." });
    }
    const erros = validar(dados);
    if (dados.vehicleId && !(await ctx.db.get(dados.vehicleId))) erros.vehicleId = "Esta viatura já não existe.";
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const agora = Date.now();
    const d: Dados = { ...dados, title: dados.title.trim(), location: dados.location.trim() };
    const comChaves = Object.fromEntries(OPCIONAIS.map((k) => [k, d[k]])) as Partial<Dados>;
    if (actual) {
      await ctx.db.patch(actual._id, { ...d, ...comChaves, updatedAt: agora });
      return { id: actual._id, versao: agora };
    }
    let slug = slugDe(d.title);
    if (await ctx.db.query("events").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) slug = `${slug}-${agora.toString(36)}`;
    const novo = await ctx.db.insert("events", {
      ...d,
      slug,
      status: "draft",
      isFeatured: false,
      isActive: true,
      rating: 0,
      reviewCount: 0,
      createdAt: agora,
      updatedAt: agora,
    });
    return { id: novo, versao: agora };
  },
});

const vEstado = v.union(v.literal("draft"), v.literal("published"), v.literal("cancelled"), v.literal("completed"));

/* Que estados se seguem a cada um. Concluído só depois de a data passar; um
   cancelado volta a rascunho (para se rever antes de voltar ao site). */
function destinos(e: Pick<Doc<"events">, "status" | "eventDate" | "endDate">): Doc<"events">["status"][] {
  const passou = (e.endDate ?? e.eventDate) < Date.now();
  switch (e.status) {
    case "draft":
      return ["published", "cancelled"];
    case "published":
      return passou ? ["completed", "draft", "cancelled"] : ["draft", "cancelled"];
    case "cancelled":
      return ["draft"];
    case "completed":
      return ["published"];
  }
}

export const mudarEstado = mutation({
  args: { id: v.id("events"), estado: vEstado },
  handler: async (ctx, { id, estado }) => {
    await exigirAdmin(ctx);
    const e = await ctx.db.get(id);
    if (!e) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este evento já não existe." });
    if (e.status === estado) return { versao: e.updatedAt };
    if (!destinos(e).includes(estado)) {
      throw new ConvexError({ tipo: "invalido", mensagem: "Esta mudança de estado não se faz a partir do estado actual." });
    }
    if (estado === "published") {
      const falta = impedimentos(e);
      if (falta.length) {
        throw new ConvexError({ tipo: "impedido", mensagem: `Para publicar falta: ${falta.map((f) => f.texto.split(" — ")[0]!.toLowerCase()).join(", ")}.` });
      }
    }
    const agora = Date.now();
    await ctx.db.patch(id, {
      status: estado,
      publishedAt: estado === "published" && e.status !== "published" && !e.publishedAt ? agora : e.publishedAt,
      updatedAt: agora,
    });
    return { versao: agora };
  },
});

export const marcarDestaque = mutation({
  args: { id: v.id("events"), valor: v.boolean() },
  handler: async (ctx, { id, valor }) => {
    await exigirAdmin(ctx);
    const e = await ctx.db.get(id);
    if (!e) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este evento já não existe." });
    if (valor && !e.isFeatured) {
      const n = (await ctx.db.query("events").withIndex("by_featured", (q) => q.eq("isFeatured", true)).collect()).length;
      if (n >= 6) throw new ConvexError({ tipo: "limite", mensagem: "Já há 6 eventos em destaque, o máximo. Tire um antes." });
    }
    await ctx.db.patch(id, { isFeatured: valor, updatedAt: Date.now() });
  },
});

export const remover = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
    const e = await ctx.db.get(id);
    if (!e) return;
    if (await ctx.db.query("tourBookings").withIndex("by_event", (q) => q.eq("eventId", id)).first()) {
      throw new ConvexError({ tipo: "emUso", mensagem: "Este evento tem reservas. Cancele-o em vez de o apagar: sai do site e as reservas ficam." });
    }
    await ctx.runMutation(api.events.remove, { id: id as Id<"events"> });
  },
});
