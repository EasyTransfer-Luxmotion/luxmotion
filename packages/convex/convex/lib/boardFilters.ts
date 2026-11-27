import { v, type Infer } from "convex/values";
import { matchesSearch } from "./list";

/*
 * The funnel board filters, resolved on the server. They are the same as the
 * matching list screens (reservas.lista, pedidos.lista, parceiros.leads), so
 * switching between board and list shows the same cards. The URL keeps its
 * Portuguese values; these args are new code, in English.
 */
export const vBoardFilters = v.object({
  search: v.optional(v.string()),
  // Bookings: by trip date. Default "upcoming"; a trip without a date always shows.
  when: v.optional(v.union(v.literal("upcoming"), v.literal("past"), v.literal("all"))),
  day: v.optional(v.string()),
  method: v.optional(v.string()),
  // "source:<utm_source>" or "unknown".
  source: v.optional(v.string()),
  // Quotes: the request type (URL value); partnerships: the segment.
  type: v.optional(v.string()),
  // A partner name, or "direct" for cards with no partner.
  partner: v.optional(v.string()),
  period: v.optional(v.union(v.literal("today"), v.literal("7d"), v.literal("30d"), v.literal("month"), v.literal("year"))),
  // Partnerships: which table the card came from.
  record: v.optional(v.union(v.literal("lead"), v.literal("company"), v.literal("driver"), v.literal("manual"))),
  /* Dashboard spec v1.0. Bookings: the service date as a range [from, to],
     both YYYY-MM-DD and inclusive (today, tomorrow, 7 and 30 days, a range). */
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  // Bookings and quotes: the type of service (lib/tipoServico.ts).
  service: v.optional(v.string()),
  // Quotes: where the lead came in ("site" or the manual channel).
  channel: v.optional(v.string()),
  // Quotes and applications: only these stages.
  stages: v.optional(v.array(v.string())),
  // Applications.
  kind: v.optional(v.union(v.literal("driver"), v.literal("company"))),
  registeredBy: v.optional(v.union(v.literal("site"), v.literal("manual"))),
  zone: v.optional(v.string()),
  category: v.optional(v.string()),
  docs: v.optional(v.union(v.literal("completa"), v.literal("falta"), v.literal("validar"))),
  owner: v.optional(v.string()),
});
export type BoardFilters = Infer<typeof vBoardFilters>;

const QUOTE_TYPES: Record<string, string> = {
  contactos: "contactSubmissions",
  orcamentos: "contactQuotes",
  "ultra-luxo": "tourInquiries",
  casamentos: "weddingQuoteSubmissions",
  escolas: "schoolQuoteSubmissions",
  corporate: "corporateRequests",
  manual: "manual",
};
const RECORD_ORIGINS = { lead: "partnerLeads", company: "partnerApplications", driver: "driverApplications", manual: "manual" } as const;

const LISBON_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" });
const LISBON_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hourCycle: "h23" });

export const lisbonToday = (now = Date.now()) => LISBON_DAY.format(now);

/* Midnight in Lisbon for a YYYY-MM-DD day. The server runs in UTC, and a
   UTC midnight cut-off put last night's 23:30 requests into "today". */
function lisbonMidnight(day: string): number {
  const utc = Date.parse(`${day}T00:00:00Z`);
  return utc - Number(LISBON_HOUR.format(utc)) * 3_600_000;
}

function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function periodStart(period: BoardFilters["period"], today: string): number | undefined {
  if (!period) return undefined;
  if (period === "today") return lisbonMidnight(today);
  if (period === "7d") return lisbonMidnight(shiftDay(today, -6));
  if (period === "30d") return lisbonMidnight(shiftDay(today, -29));
  if (period === "month") return lisbonMidnight(`${today.slice(0, 7)}-01`);
  return lisbonMidnight(`${today.slice(0, 4)}-01-01`);
}

type FilterableCard = {
  titulo: string;
  pessoa: string;
  organizacao: string | null;
  email: string | null;
  telefone: string | null;
  referencia: string | null;
  parceiro: string | null;
  viagem: string | null;
  metodo: string | null;
  anuncio: string | null;
  origem: string;
  segmento: string | null;
  criadoEm: number;
  etapaId?: string;
  tipoServico?: string | null;
  canal?: string | null;
  zonas?: string[];
  categorias?: string[];
  registo?: "site" | "manual" | null;
  documentacao?: "completa" | "falta" | "validar" | null;
  responsavel?: string | null;
};

/* An inclusive day range on a "YYYY-MM-DD…" date. */
function inRange(date: string | null, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const day = date?.slice(0, 10) ?? null;
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function matchesBoardFilters(key: string, f: BoardFilters, today: string, x: FilterableCard): boolean {
  if (!matchesSearch(f.search, [x.titulo, x.pessoa, x.organizacao, x.email, x.telefone, x.referencia])) return false;
  if (f.partner && (f.partner === "direct" ? x.parceiro : x.parceiro !== f.partner)) return false;
  if (key === "reservas") {
    /* Dashboard spec v1.0, 2.2: no payment method nor upcoming/past any
       more (an old dashboard may still send them: ignored). The calendar is
       a day or a range of the service date. */
    const day = x.viagem?.slice(0, 10) ?? null;
    if (f.day && day !== f.day) return false;
    if (!inRange(x.viagem, f.from, f.to)) return false;
    if (f.service && x.tipoServico !== f.service) return false;
    if (f.source && (f.source === "unknown" ? x.anuncio : `source:${x.anuncio}` !== f.source)) return false;
    return true;
  }
  if (f.stages?.length && x.etapaId && !f.stages.includes(x.etapaId)) return false;
  if (key === "candidaturas") {
    if (f.kind && x.origem !== (f.kind === "driver" ? "driverApplications" : "partnerApplications")) return false;
    if (f.registeredBy && (x.registo ?? "site") !== f.registeredBy) return false;
    if (f.zone && !(x.zonas ?? []).includes(f.zone)) return false;
    if (f.category && !(x.categorias ?? []).includes(f.category)) return false;
    if (f.docs && x.documentacao !== f.docs) return false;
    if (f.owner && (f.owner === "none" ? x.responsavel : x.responsavel !== f.owner)) return false;
    return true;
  }
  if (key === "medida") {
    if (f.service && x.tipoServico !== f.service) return false;
    if (f.channel && (x.canal ?? "site") !== f.channel) return false;
  }
  const since = periodStart(f.period, today);
  if (since !== undefined && x.criadoEm < since) return false;
  if (key === "parcerias") {
    if (f.record && x.origem !== RECORD_ORIGINS[f.record]) return false;
    if (f.type && x.segmento !== f.type) return false;
  }
  if (key === "medida" && f.type) {
    const origin = QUOTE_TYPES[f.type];
    if (origin && x.origem !== origin) return false;
  }
  return true;
}

export function boardFiltersActive(f: BoardFilters | undefined): boolean {
  return Boolean(
    f &&
      (f.search?.trim() || f.day || f.from || f.to || f.method || f.source || f.type || f.partner || f.period || f.record || f.service || f.channel ||
        f.stages?.length || f.kind || f.registeredBy || f.zone || f.category || f.docs || f.owner),
  );
}
