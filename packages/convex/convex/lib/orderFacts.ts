import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

/*
 * Order facts: what each order counts for, kept up to date on every write.
 *
 * Why: at 10 000 orders a day the table grows past what one Convex query may
 * read (~16 MB, ~32 000 documents) within days, and the old lists, sidebar
 * counters and partner numbers read every order to count them. Here each
 * order is filed, when it is written, under the few sorted "namespaces" the
 * screens ask about (the "Serviços" view by trip date, the "Por pagar" view by
 * creation, the partner's outbound legs...). The aggregate component keeps
 * counts, sums and positions per namespace, so a screen asks "how many", "the
 * 40 items from position 120" or "how much money" and reads only that.
 *
 * Kept exact by a trigger on `orders` (lib/triggers.ts) that recomputes the
 * order's entries and applies only the difference against what it filed last
 * time (`orderFactState`). Every write goes through the wrapped
 * `mutation`/`internalMutation` of functions.ts — tests/facts.test.ts fails if
 * a file writes with the raw ones, because one unwrapped write leaves the
 * counts wrong until the next backfill.
 */

export type FactKey = string | number;
export type FactEntry = { ns: string[]; key: FactKey; sum: number };

export const facts = new DirectAggregate<{ Key: FactKey; Id: string; Namespace: string[] }>(components.orderFacts);

type Status = Doc<"orders">["status"];
export type View = "reservas" | "porPagar" | "canceladas" | "carrinhos";
export const VIEW_OF: Record<Status, View> = {
  paid: "reservas",
  confirmed: "reservas",
  completed: "reservas",
  pending: "porPagar",
  cancelled: "canceladas",
  draft: "carrinhos",
};
export const VIEWS: readonly View[] = ["reservas", "porPagar", "canceladas", "carrinhos"];
/* Whether a view has the per-filter namespaces (see factsOf). */
export const hasDims = (view: View) => view !== "carrinhos";

/*
 * Carts are split over SHARDS trees. A new cart always lands at the end of
 * "by creation", so concurrent checkouts wrote the same tree node: in a load
 * test (20 at a time, 25 orders/s) 3 in 1 000 failed after every retry. With
 * the carts spread over four trees, two checkouts collide a quarter as often.
 * Readers ask slotsOf(view) and merge (lib/orderList.ts).
 */
const SHARDS: Record<View, number> = { carrinhos: 4, reservas: 1, porPagar: 1, canceladas: 1 };
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export const slotOf = (view: View, id: string) => (SHARDS[view] === 1 ? view : `${view}#${hash(id) % SHARDS[view]}`);
export const slotsOf = (view: View) => (SHARDS[view] === 1 ? [view] : Array.from({ length: SHARDS[view] }, (_, k) => `${view}#${k}`));
export const viewOfSlot = (slot: string) => slot.split("#")[0] as View;
export const SERVICE: ReadonlySet<Status> = new Set(["paid", "confirmed", "completed"]);

/* The sorts the reservations list offers, each a namespace prefix. */
export type Sort = "trip" | "created" | "total";
/* The list filters that have their own namespaces (one value at a time). */
export type Dim = "payment" | "method" | "partner" | "source";
export const DIMS: readonly Dim[] = ["payment", "method", "partner", "source"];

export function dimValue(o: Doc<"orders">, dim: Dim): string | null {
  switch (dim) {
    case "payment":
      return o.paymentStatus ?? "sem";
    case "method":
      return o.paymentMethod || null;
    case "partner":
      /* "" is "direto": no partner, sold on the main site. */
      return o.partnershipName?.trim() ?? "";
    case "source":
      /* "" is "Origem desconhecida". */
      return o.adSource?.utmSource?.trim().toLowerCase() ?? "";
  }
}

export const sortKey = (o: Doc<"orders">, sort: Sort): FactKey =>
  sort === "trip" ? o.departureDate : sort === "created" ? o._creationTime : (o.totalAmount ?? 0);

type Reader = { db: GenericDatabaseReader<DataModel> };

/*
 * The leg question every report asks: a round trip is two orders pointing at
 * each other, the outbound one created first (orders.create inserts it
 * first). The return is paid on the outbound, so the partner and the client
 * are the outbound's.
 */
export async function legOf(ctx: Reader, o: Doc<"orders">): Promise<{ isReturn: boolean; outbound: Doc<"orders"> }> {
  const other = o.relatedOrderId ? await ctx.db.get(o.relatedOrderId) : null;
  const isReturn = Boolean(other && other._creationTime < o._creationTime);
  return { isReturn, outbound: isReturn && other ? other : o };
}

export const isTour = (o: Doc<"orders">) => Boolean(o.tourBookingId) || (o.orderNumber ?? "").startsWith("TB");

/* What one order is filed under. Pure apart from reading the other leg. */
export async function factsOf(ctx: Reader, o: Doc<"orders">): Promise<FactEntry[]> {
  const view = VIEW_OF[o.status];
  const slot = slotOf(view, o._id);
  const out: FactEntry[] = [
    { ns: ["trip", slot], key: o.departureDate, sum: 0 },
    { ns: ["created", slot], key: o._creationTime, sum: 0 },
    { ns: ["total", slot], key: o.totalAmount ?? 0, sum: 0 },
  ];
  /* No filter namespaces for carts: they are 4 in 5 orders, the ones written
     most often (each checkout step), and almost never filtered. Every entry
     is a write that concurrent checkouts can collide on; a filtered cart list
     is read by scanning instead (lib/orderList.ts). "Todas" has no
     namespaces either: it is the four views read together. */
  if (hasDims(view)) {
    for (const dim of DIMS) {
      const value = dimValue(o, dim);
      if (value === null) continue;
      out.push({ ns: ["trip", view, dim, value], key: o.departureDate, sum: 0 });
      out.push({ ns: ["created", view, dim, value], key: o._creationTime, sum: 0 });
    }
  }
  if (SERVICE.has(o.status)) {
    const { isReturn, outbound } = await legOf(ctx, o);
    /* The partner's numbers (parceiros.lista/detalhe): bookings count the
       outbound legs only, revenue both. Filed by the outbound's creation, the
       moment the partner sold it. */
    if (outbound.partnershipId) {
      out.push({ ns: ["partner", outbound.partnershipId, isReturn ? "return" : "outbound"], key: outbound._creationTime, sum: o.totalAmount ?? 0 });
      if (!isReturn && isTour(o)) out.push({ ns: ["partner", outbound.partnershipId, "tour"], key: outbound._creationTime, sum: 0 });
    }
  }
  return out;
}

const nsId = (ns: string[]) => JSON.stringify(ns);

type Writer = { db: GenericDatabaseWriter<DataModel> } & Parameters<typeof facts.insert>[0];

/*
 * Brings one order's entries in line with the order as it is now (or removes
 * them when it was deleted). Idempotent: running it twice changes nothing,
 * and an order filed before (or never) is fixed either way.
 */
export async function syncOrderFacts(ctx: Writer, id: Id<"orders">): Promise<void> {
  const o = await ctx.db.get(id);
  const next = o ? await factsOf(ctx, o) : [];
  const state = await ctx.db
    .query("orderFactState")
    .withIndex("by_order", (q) => q.eq("orderId", id))
    .unique();
  const prev = new Map((state?.entries ?? []).map((e) => [nsId(e.ns), e]));
  const now = new Map(next.map((e) => [nsId(e.ns), e]));
  const sid = id as string;

  for (const [k, e] of prev) {
    if (!now.has(k)) await facts.deleteIfExists(ctx, { namespace: e.ns, key: e.key, id: sid });
  }
  for (const [k, e] of now) {
    const before = prev.get(k);
    if (!before) await facts.insertIfDoesNotExist(ctx, { namespace: e.ns, key: e.key, id: sid, sumValue: e.sum });
    else if (before.key !== e.key || before.sum !== e.sum)
      await facts.replaceOrInsert(ctx, { namespace: e.ns, key: before.key, id: sid }, { namespace: e.ns, key: e.key, sumValue: e.sum });
  }

  /* The filter menus: the values each view has ever had. Written only the
     first time a value appears (never a hot document); the list hides the
     ones whose count dropped to zero. */
  const before = new Set(state?.facets ?? []);
  const facets: string[] = [];
  for (const dim of o ? DIMS : []) {
    const value = dimValue(o!, dim);
    if (value === null) continue;
    const view = VIEW_OF[o!.status];
    const f = nsId([view, dim, value]);
    facets.push(f);
    if (before.has(f)) continue;
    const seen = await ctx.db
      .query("orderFacetValues")
      .withIndex("by_view_dim", (q) => q.eq("view", view).eq("dim", dim).eq("value", value))
      .first();
    if (!seen) await ctx.db.insert("orderFacetValues", { view, dim, value });
  }

  if (!o) {
    if (state) await ctx.db.delete(state._id);
  } else if (!state) {
    await ctx.db.insert("orderFactState", { orderId: id, entries: next, facets });
  } else if (JSON.stringify(state.entries) !== JSON.stringify(next) || JSON.stringify(state.facets ?? []) !== JSON.stringify(facets)) {
    await ctx.db.patch(state._id, { entries: next, facets });
  }
}

/* ─── Search ────────────────────────────────────────────────────────── */

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/*
 * The text the reservations search looks in (searchIndex `search_orders`).
 * Without accents and lower case, like the old in-memory search; the phone
 * also as bare digits, so "912 345 678" and "912345678" both find it.
 */
export function searchTextOf(o: Doc<"orders">): string {
  const phone = (o.customerPhone ?? "").replace(/\D/g, "");
  return plain(
    [
      o.orderNumber,
      o.customerName,
      o.customerEmail,
      o.customerPhone,
      phone,
      o.passengerName,
      o.partnershipName,
      o.departure?.location,
      o.departure?.name,
      o.arrival?.location,
      o.arrival?.name,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export const normaliseSearch = plain;

/* ─── Partner leads ─────────────────────────────────────────────────── */

/* The request forms a partner's page can send (parceiros.ts, PEDIDOS). */
export const LEAD_TABLES = [
  "contactSubmissions",
  "contactQuotes",
  "tourInquiries",
  "weddingQuoteSubmissions",
  "schoolQuoteSubmissions",
  "corporateRequests",
] as const;
export type LeadTable = (typeof LEAD_TABLES)[number];

type Lead = { _id: string; partnershipId?: Id<"partnerships">; createdAt: number };

/* A lead from a partner's page is filed twice: all of the partner's leads by
   date (count, latest, the recent list) and per form (the categories). */
function leadEntries(table: LeadTable, d: Lead | null): FactEntry[] {
  if (!d?.partnershipId) return [];
  return [
    { ns: ["partnerLead", d.partnershipId], key: d.createdAt, sum: 0 },
    { ns: ["partnerLead", d.partnershipId, table], key: d.createdAt, sum: 0 },
  ];
}

/* These rows only change partner by hand, so the old document says what was
   filed: no state table needed. */
export async function syncLeadFacts(
  ctx: Parameters<typeof facts.insert>[0],
  table: LeadTable,
  oldDoc: Lead | null,
  newDoc: Lead | null,
): Promise<void> {
  const before = new Map(leadEntries(table, oldDoc).map((e) => [nsId(e.ns), e]));
  const after = new Map(leadEntries(table, newDoc).map((e) => [nsId(e.ns), e]));
  const id = (newDoc ?? oldDoc)!._id;
  for (const [k, e] of before) {
    const n = after.get(k);
    if (!n) await facts.deleteIfExists(ctx, { namespace: e.ns, key: e.key, id });
    else if (n.key !== e.key) await facts.replaceOrInsert(ctx, { namespace: e.ns, key: e.key, id }, { namespace: n.ns, key: n.key });
  }
  for (const [k, e] of after) if (!before.has(k)) await facts.insertIfDoesNotExist(ctx, { namespace: e.ns, key: e.key, id, sumValue: 0 });
}
