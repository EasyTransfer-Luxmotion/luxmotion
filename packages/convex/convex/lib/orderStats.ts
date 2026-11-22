import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import { ESTADOS_DE_SERVICO, METODOS, SEM_METODO, SEM_PARCEIRO, local, origemNoEndereco, paraDia, parceiroDe } from "./orderLabels";

/*
 * Order stats: the numbers of Finanças, Definições and the partner ranking,
 * kept per day and per month as the orders are written.
 *
 * Why: the statistics read every order of the period, the previous period
 * and the same period a year before. At 10 000 orders a day one month is
 * 300 000 orders, far past what a query may read. Here each order adds its
 * part to a few rows (`orderStats`): one per day and one per month, for each
 * thing a screen groups by (payment method, source, vehicle, route, client,
 * hour...). A screen sums the rows of its period: whole months from the
 * month rows, the days at the edges from the day rows.
 *
 * Exact: counts, revenue, net, card fees, passengers, every grouping and
 * each partner's clients. Estimated: unique clients overall (a HyperLogLog
 * sketch per day and month, about ±1.6% and close to exact below a
 * thousand, redone when a client's booking is cancelled)
 * and the top lists of clients and routes over long periods (the top of
 * each month and edge day, summed).
 *
 * Kept by the same trigger as the order facts (lib/orderFacts.ts,
 * syncOrderFacts), which stores what each order added (orderFactState.stats)
 * and applies only the difference.
 */

type Reader = { db: GenericDatabaseReader<DataModel> };
type Writer = { db: GenericDatabaseWriter<DataModel> };

export type Produto = "transfer" | "tour" | "evento";
export type Canal = "site" | "parceiro";
export type Seg = `${Produto}:${Canal}`;
export const SEGS: readonly Seg[] = ["transfer:site", "transfer:parceiro", "tour:site", "tour:parceiro", "evento:site", "evento:parceiro"];

export const METRICS = ["n", "v", "p", "x", "liq", "tx", "iv", "ae", "no", "as", "an"] as const;
export type Metric = (typeof METRICS)[number];
export type Values = Partial<Record<Metric, number>>;

/* IVA included in the price (6% transport, 23% tours and events) and the
   ~2% card fee absorbed on Stripe payments: estimates, as in Finanças. */
const IVA: Record<Produto, number> = { transfer: 0.06, tour: 0.23, evento: 0.23 };
const TAXA_STRIPE = 0.02;
const PELO_STRIPE = new Set(["ccard", "card", "link", "mbway", "mb", "multibanco"]);
const NIF_EMPRESA = /^[5689]\d{8}$/;

export const ANTECEDENCIA = [
  { rotulo: "Menos de 24 h", ate: 0 },
  { rotulo: "1 a 3 dias", ate: 3 },
  { rotulo: "4 a 7 dias", ate: 7 },
  { rotulo: "8 a 30 dias", ate: 30 },
  { rotulo: "Mais de 30 dias", ate: Infinity },
];
/* Every order that starts a checkout adds 1 to one of these rows: spread
   over eight so concurrent checkouts do not write the same document. */
const FUNNEL_SHARDS = 8;

const dayIndex = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/* ─── HyperLogLog (unique clients) ─────────────────────────────────── */

export function hllAdd(regs: Uint8Array, key: string): boolean {
  const bits = Math.log2(regs.length);
  const h = hash32(key);
  const idx = h >>> (32 - bits);
  const rest = (h << bits) >>> 0;
  const rank = rest === 0 ? 32 - bits + 1 : Math.clz32(rest) + 1;
  if (rank <= regs[idx]!) return false;
  regs[idx] = rank;
  return true;
}
export function hllMerge(into: Uint8Array, from: Uint8Array) {
  for (let i = 0; i < into.length; i++) if (from[i]! > into[i]!) into[i] = from[i]!;
}
export function hllCount(regs: Uint8Array): number {
  const m = regs.length;
  let sum = 0;
  let zeros = 0;
  for (const r of regs) {
    sum += 2 ** -r;
    if (r === 0) zeros++;
  }
  const alpha = 0.7213 / (1 + 1.079 / m);
  const e = (alpha * m * m) / sum;
  /* Small numbers: linear counting is close to exact. */
  return Math.round(e <= 2.5 * m && zeros > 0 ? m * Math.log(m / zeros) : e);
}

/* ─── What one order adds ──────────────────────────────────────────── */

/* h: a client for the day's unique-client sketch (daily "total" rows);
   c: a client for the partner's exact client set (daily "parceiro" rows). */
export type Contribution = { id: string; label?: string; d: Values; h?: string; c?: string };
const SEP = "\u0001";
export const rowId = (g: "d" | "m", seg: string, dim: string, per: string, key: string) => [g, seg, dim, per, key].join(SEP);
const parseId = (id: string) => {
  const [g, seg, dim, per, key] = id.split(SEP) as ["d" | "m", string, string, string, string];
  return { g, seg, dim, per, key };
};

export const clientKey = (o: Doc<"orders">) =>
  (o.customerEmail ?? "").trim().toLowerCase() || (o.customerPhone ?? "").replace(/\D/g, "") || (o.customerName ?? "").trim().toLowerCase() || o._id;

export async function statsOf(ctx: Reader, o: Doc<"orders">): Promise<Contribution[]> {
  const other = o.relatedOrderId ? await ctx.db.get(o.relatedOrderId) : null;
  const isReturn = Boolean(other && other._creationTime < o._creationTime);
  const ida = isReturn && other ? other : o;
  const tb = o.tourBookingId ? await ctx.db.get(o.tourBookingId) : null;
  const produto: Produto = tb ? (tb.productType === "event" ? "evento" : "tour") : (o.orderNumber ?? "").startsWith("TB") ? "tour" : "transfer";
  const parceiro = parceiroDe(ida);
  const seg: Seg = `${produto}:${parceiro === SEM_PARCEIRO ? "site" : "parceiro"}`;
  const dia = paraDia(o._creationTime);
  const out: Contribution[] = [];
  const add = (dim: string, key: string, d: Values, extra: { label?: string; h?: string; c?: string } = {}) => {
    /* A partner's exact client set lives on the day rows only. */
    const { c: client, ...rest } = extra;
    out.push({ id: rowId("d", seg, dim, dia, key), d, ...extra });
    out.push({ id: rowId("m", seg, dim, dia.slice(0, 7), key), d, ...rest });
    void client;
  };

  /* The funnel, every status: started, cancelled, cancelled after paying. */
  const c = isReturn ? 0 : 1;
  const valor = o.totalAmount ?? 0;
  if (c) add("funil", `iniciados#${hash32(o._id) % FUNNEL_SHARDS}`, { n: 1 });
  if (c && o.status === "cancelled") add("funil", "canceladas", { n: 1 });
  if (o.status === "cancelled" && o.paymentStatus === "completed") add("funil", "perdas", { n: c, v: valor });
  if (!ESTADOS_DE_SERVICO.has(o.status)) return out;

  /* Paid: a round trip is one service (the outbound) and both legs' money. */
  const metodo = (ida.paymentMethod ?? "").trim().toLowerCase();
  const taxa = PELO_STRIPE.has(metodo) ? valor * TAXA_STRIPE : 0;
  const pessoas = c ? (o.passengers ?? 0) : 0;
  const cliente = clientKey(ida);
  const dv = String(o.departureDate);
  const dataViagem = /^\d{4}-\d{2}-\d{2}/.test(dv) ? dv.slice(0, 10) : null;
  const antecedencia = dataViagem ? dayIndex(dataViagem) - dayIndex(dia) : -1;
  const antOk = c && antecedencia >= 0;
  add(
    "total",
    "",
    {
      n: c,
      v: valor,
      p: pessoas,
      x: o.addonsTotal ?? 0,
      liq: valor / (1 + IVA[produto]) - taxa,
      tx: taxa,
      iv: c && (o.relatedOrderId || o.isRoundTrip) ? 1 : 0,
      ae: c && ((o.airportServiceFee ?? 0) > 0 || /aeroporto/i.test(local(o.departure) + local(o.arrival))) ? 1 : 0,
      no: c && (o.nightTax ?? 0) > 0 ? 1 : 0,
      as: antOk ? antecedencia : 0,
      an: antOk ? 1 : 0,
    },
    c ? { h: cliente } : {},
  );
  add("metodo", metodo ? (METODOS[metodo] ?? metodo) : SEM_METODO, { n: c, v: valor });
  add("origem", origemNoEndereco(ida), { n: c, v: valor });
  add("viatura", ida.vehicleName?.trim() || "Sem viatura indicada", { n: c, v: valor });
  const origem = local(ida.departure);
  const destino = local(ida.arrival);
  add("rota", `${origem}→${destino}`.toLowerCase(), { n: c, v: valor }, { label: JSON.stringify([origem, destino]) });
  const nif = (ida.customerNif ?? "").replace(/\D/g, "").replace(/^351/, "");
  add("tipoCliente", ida.organizacaoId || NIF_EMPRESA.test(nif) ? "Empresas" : "Particulares", { n: c, v: valor });
  /* Every leg names its client: the old ranking counted the clients of all
     the partner's lines. */
  if (parceiro !== SEM_PARCEIRO) add("parceiro", parceiro, { n: c, v: valor }, { c: String(hash32(cliente)) });
  if (produto !== "transfer") {
    const titulo = tb?.tourTitle ?? (produto === "evento" ? "Evento sem título" : "Tour sem título");
    add("produto", titulo, { n: c, v: valor, p: pessoas });
  }
  add("cliente", cliente, { n: c, v: valor }, { label: JSON.stringify([ida.customerName?.trim() || ida.customerEmail || "Sem nome", ida.customerEmail ?? null]) });
  if (c) {
    if (dataViagem) {
      add("diaSemana", String((new Date(`${dataViagem}T12:00:00Z`).getUTCDay() + 6) % 7), { n: 1 });
      const k = ANTECEDENCIA.findIndex((x) => antecedencia <= x.ate);
      if (antecedencia >= 0 && k >= 0) add("antecedencia", String(k), { n: 1 });
    }
    const h = /T(\d{2}):/.exec(dv)?.[1] ?? / (\d{2}):/.exec(dv)?.[1];
    if (h) add("hora", h, { n: 1 });
  }
  return out;
}

/* ─── Applying the difference ──────────────────────────────────────── */

export type StoredContribution = { id: string; d: Values; h?: string; c?: string };

/* 4 096 registers: about ±1.6%, and close to exact below a thousand. */
const HLL_BITS = 12;

export async function applyStats(ctx: Writer, prev: StoredContribution[], next: Contribution[]): Promise<StoredContribution[]> {
  const before = new Map(prev.map((c) => [c.id, c]));
  const after = new Map(next.map((c) => [c.id, c]));
  /* Day rows that lost a client: their sketch is rebuilt at the end, from the
     day's client rows, once those are up to date. */
  const rebuild = new Set<string>();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(id);
    const a = after.get(id);
    const delta: Values = {};
    let changed = false;
    for (const m of METRICS) {
      const x = (a?.d[m] ?? 0) - (b?.d[m] ?? 0);
      if (Math.abs(x) > 1e-9) {
        delta[m] = x;
        changed = true;
      }
    }
    const newClient = a?.h && a.h !== b?.h ? a.h : undefined;
    if (b?.h && b.h !== a?.h) rebuild.add(id);
    const clientMoved = (a?.c ?? null) !== (b?.c ?? null);
    if (!changed && !newClient && !clientMoved && !(a && !b)) continue;
    const { g, seg, dim, per, key } = parseId(id);
    const row = await ctx.db
      .query("orderStats")
      .withIndex("by_row", (q) => q.eq("g", g).eq("seg", seg).eq("dim", dim).eq("per", per).eq("key", key))
      .unique();
    const values: Values = {};
    for (const m of METRICS) values[m] = (row?.[m] ?? 0) + (delta[m] ?? 0);
    let hll: ArrayBuffer | undefined = row?.hll;
    if (newClient) {
      const regs = hll ? new Uint8Array(hll.slice(0)) : new Uint8Array(2 ** HLL_BITS);
      if (hllAdd(regs, newClient) || !hll) hll = regs.buffer as ArrayBuffer;
    }
    let cm = row?.cm;
    if (clientMoved) {
      cm = { ...(cm ?? {}) };
      if (b?.c) {
        const left = (cm[b.c] ?? 0) - 1;
        if (left > 0) cm[b.c] = left;
        else delete cm[b.c];
      }
      if (a?.c) cm[a.c] = (cm[a.c] ?? 0) + 1;
    }
    const empty = METRICS.every((m) => Math.abs(values[m] ?? 0) < 1e-6) && !Object.keys(cm ?? {}).length;
    const fields = Object.fromEntries(METRICS.map((m) => [m, Math.round((values[m] ?? 0) * 1e6) / 1e6])) as Record<Metric, number>;
    if (!row) {
      if (!empty) await ctx.db.insert("orderStats", { g, seg, dim, per, key, label: a?.label, ...fields, hll, cm });
    } else if (empty) {
      await ctx.db.delete(row._id);
    } else {
      await ctx.db.patch(row._id, { ...fields, hll, cm, ...(a?.label && a.label !== row.label ? { label: a.label } : {}) });
    }
  }
  /* A sketch cannot forget, so one that lost a client is redone: a day from
     its client rows, then a month from its days' sketches. */
  const ids = [...rebuild].sort((x, y) => (parseId(x).g === parseId(y).g ? 0 : parseId(x).g === "d" ? -1 : 1));
  for (const id of ids) {
    const { g, seg, dim, per, key } = parseId(id);
    const row = await ctx.db
      .query("orderStats")
      .withIndex("by_row", (q) => q.eq("g", g).eq("seg", seg).eq("dim", dim).eq("per", per).eq("key", key))
      .unique();
    if (!row) continue;
    const regs = new Uint8Array(2 ** HLL_BITS);
    if (g === "d") {
      for (const c of await ctx.db.query("orderStats").withIndex("by_row", (q) => q.eq("g", "d").eq("seg", seg).eq("dim", "cliente").eq("per", per)).collect())
        if (c.n > 0) hllAdd(regs, c.key);
    } else {
      const days = await ctx.db
        .query("orderStats")
        .withIndex("by_row", (q) => q.eq("g", "d").eq("seg", seg).eq("dim", "total").gte("per", `${per}-01`).lte("per", `${per}-31`))
        .collect();
      for (const d of days) if (d.hll && d.hll.byteLength === regs.length) hllMerge(regs, new Uint8Array(d.hll));
    }
    await ctx.db.patch(row._id, { hll: regs.buffer as ArrayBuffer });
  }
  return next.map((c) => ({ id: c.id, d: c.d, ...(c.h ? { h: c.h } : {}), ...(c.c ? { c: c.c } : {}) }));
}

/* ─── Reading a period ─────────────────────────────────────────────── */

const addMonths = (mes: string, n: number) => {
  const t = +mes.slice(0, 4) * 12 + (+mes.slice(5, 7) - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const lastDay = (mes: string) => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);

/* [de, ate] as whole months plus the days at each edge. */
export function unitsOf(de: string, ate: string) {
  let first = de.slice(8) === "01" ? de.slice(0, 7) : addMonths(de.slice(0, 7), 1);
  let last = lastDay(ate.slice(0, 7)) === ate ? ate.slice(0, 7) : addMonths(ate.slice(0, 7), -1);
  if (first > last) return { months: null, days: [[de, ate]] as [string, string][] };
  const days: [string, string][] = [];
  if (de < `${first}-01`) days.push([de, lastDay(addMonths(first, -1))]);
  if (ate > lastDay(last)) days.push([`${addMonths(last, 1)}-01`, ate]);
  return { months: [first, last] as [string, string], days };
}

export type StatRow = Doc<"orderStats">;

/* Every row of these segments and groupings in [de, ate]. */
export async function rowsIn(ctx: Reader, segs: readonly Seg[], dims: readonly string[], de: string, ate: string, onlyDays = false): Promise<StatRow[]> {
  const u = onlyDays ? { months: null, days: [[de, ate]] as [string, string][] } : unitsOf(de, ate);
  const out: StatRow[] = [];
  for (const seg of segs)
    for (const dim of dims) {
      if (u.months) {
        const [m0, m1] = u.months;
        out.push(...(await ctx.db.query("orderStats").withIndex("by_row", (q) => q.eq("g", "m").eq("seg", seg).eq("dim", dim).gte("per", m0).lte("per", m1)).collect()));
      }
      for (const [d0, d1] of u.days)
        out.push(...(await ctx.db.query("orderStats").withIndex("by_row", (q) => q.eq("g", "d").eq("seg", seg).eq("dim", dim).gte("per", d0).lte("per", d1)).collect()));
    }
  return out;
}

export type Summed = Record<Metric, number> & { key: string; label: string | null };

/* Rows summed by key. */
export function byKey(rows: StatRow[]): Map<string, Summed> {
  const m = new Map<string, Summed>();
  for (const r of rows) {
    let x = m.get(r.key);
    if (!x) m.set(r.key, (x = { key: r.key, label: r.label ?? null, ...(Object.fromEntries(METRICS.map((k) => [k, 0])) as Record<Metric, number>) }));
    for (const k of METRICS) x[k] += r[k] ?? 0;
  }
  return m;
}
export function total(rows: StatRow[]): Record<Metric, number> {
  const t = Object.fromEntries(METRICS.map((k) => [k, 0])) as Record<Metric, number>;
  for (const r of rows) for (const k of METRICS) t[k] += r[k] ?? 0;
  return t;
}
/* Unique clients of these segments in [de, ate]: the sketches of the whole
   months and of the edge days, merged. */
export async function clientsIn(ctx: Reader, segs: readonly Seg[], de: string, ate: string): Promise<number> {
  const regs = new Uint8Array(2 ** HLL_BITS);
  let any = false;
  for (const r of await rowsIn(ctx, segs, ["total"], de, ate)) {
    if (!r.hll || r.hll.byteLength !== regs.length) continue;
    hllMerge(regs, new Uint8Array(r.hll));
    any = true;
  }
  return any ? hllCount(regs) : 0;
}

/* Each partner's distinct clients in [de, ate], exactly: the union of the
   day rows' client sets. */
export async function partnerClients(ctx: Reader, segs: readonly Seg[], de: string, ate: string): Promise<Map<string, number>> {
  const sets = new Map<string, Set<string>>();
  for (const r of await rowsIn(ctx, segs, ["parceiro"], de, ate, true)) {
    const s = sets.get(r.key) ?? new Set<string>();
    for (const k of Object.keys(r.cm ?? {})) s.add(k);
    sets.set(r.key, s);
  }
  return new Map([...sets].map(([k, s]) => [k, s.size]));
}

/*
 * The top `k` keys of a grouping with many keys (clients, routes) in
 * [de, ate], in two passes. First the candidates: the top TOP_PER_UNIT of
 * each month and edge day, per segment. Then each of the 3k best candidates
 * is summed exactly over the period. The numbers shown are exact; a key can
 * only be missed if it is outside every unit's top yet in the overall one.
 * One pass was not enough: a client who booked on the site and through a
 * partner was cut in two and fell out of both tops.
 */
const TOP_PER_UNIT = 25;
export async function topIn(ctx: Reader, segs: readonly Seg[], dim: string, de: string, ate: string, k: number): Promise<Summed[]> {
  const u = unitsOf(de, ate);
  const units: { g: "d" | "m"; per: string }[] = [];
  if (u.months) for (let m = u.months[0]; m <= u.months[1]; m = addMonths(m, 1)) units.push({ g: "m", per: m });
  for (const [d0, d1] of u.days) for (let i = dayIndex(d0); i <= dayIndex(d1); i++) units.push({ g: "d", per: new Date(i * 86_400_000).toISOString().slice(0, 10) });
  const seen: StatRow[] = [];
  for (const seg of segs)
    for (const x of units)
      seen.push(
        ...(await ctx.db
          .query("orderStats")
          .withIndex("by_top", (q) => q.eq("g", x.g).eq("seg", seg).eq("dim", dim).eq("per", x.per))
          .order("desc")
          .take(TOP_PER_UNIT)),
      );
  const candidates = [...byKey(seen).values()].sort((a, b) => b.v - a.v || b.n - a.n).slice(0, k * 3);
  const exact: Summed[] = [];
  for (const c of candidates) {
    const rows: StatRow[] = [];
    for (const seg of segs) {
      if (u.months) {
        const [m0, m1] = u.months;
        rows.push(...(await ctx.db.query("orderStats").withIndex("by_key", (q) => q.eq("g", "m").eq("seg", seg).eq("dim", dim).eq("key", c.key).gte("per", m0).lte("per", m1)).collect()));
      }
      for (const [d0, d1] of u.days)
        rows.push(...(await ctx.db.query("orderStats").withIndex("by_key", (q) => q.eq("g", "d").eq("seg", seg).eq("dim", dim).eq("key", c.key).gte("per", d0).lte("per", d1)).collect()));
    }
    /* The label of the latest row: a client's name as last given. */
    rows.sort((x, y) => (x.per < y.per ? -1 : 1));
    const sum = byKey(rows).get(c.key);
    if (sum) exact.push({ ...sum, label: rows[rows.length - 1]?.label ?? sum.label });
  }
  return exact.sort((a, b) => b.v - a.v || b.n - a.n).slice(0, k);
}

/* The latest day in [.., ate] with something for this key (a partner's last
   booking): the day rows, newest first. */
export async function latestDay(ctx: Reader, segs: readonly Seg[], dim: string, key: string, ate: string): Promise<string | null> {
  let best: string | null = null;
  for (const seg of segs) {
    const r = await ctx.db
      .query("orderStats")
      .withIndex("by_key", (q) => q.eq("g", "d").eq("seg", seg).eq("dim", dim).eq("key", key).lte("per", ate))
      .order("desc")
      .first();
    if (r && (!best || r.per > best)) best = r.per;
  }
  return best;
}
