import type { Bound } from "@convex-dev/aggregate";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { DIMS, VIEWS, VIEW_OF, dimValue, facts, hasDims, normaliseSearch, slotsOf, sortKey, viewOfSlot, type Dim, type FactKey, type Sort, type View } from "./orderFacts";

/*
 * One page of the reservations list, read through the order facts instead of
 * the table (lib/orderFacts.ts).
 *
 * Three ways in, from cheapest to dearest:
 *  - exact: the view (and at most one filter) has its own sorted namespace,
 *    so the count is one call, the page starts at a position (`at`) and only
 *    the rows shown are read. The common screens are all this: "Serviços"
 *    from today by trip date, "Por pagar" newest first, a partner's bookings,
 *    and "Todas", the four views merged by key.
 *  - scan: a combination with no namespace of its own (two filters, a
 *    filtered cart list, a date range sorted by creation). Reads the
 *    narrowest namespace in order and filters, up to SCAN_LIMIT orders; past
 *    that the total is "at least" (`approximate`).
 *  - search: the full-text index on searchText, up to SEARCH_LIMIT matches
 *    per status, then the same filters.
 */

const SCAN_LIMIT = 1000;
const SCAN_PAGE = 200;
const SEARCH_LIMIT = 256;
/* Up to this position, a page of several trees is the first items of each,
   merged; past it, the start is found by searching (mergedPage). */
const SHALLOW = 500;
/* How close the search gets before reading forward (mergedPage). */
const FORWARD = 300;

export type ListArgs = {
  view: View | "todas";
  sort: Sort;
  order: "asc" | "desc";
  /* Trip date range, [from, to): a day is [d, d + "￿"). */
  from: string | null;
  to: string | null;
  filters: Partial<Record<Dim, string>>;
  search: string;
  page: number;
  pageSize: number;
};

export type ListResult = {
  docs: Doc<"orders">[];
  total: number;
  page: number;
  pageCount: number;
  approximate: boolean;
};

const statusesOf = (view: View | "todas") =>
  (Object.keys(VIEW_OF) as Doc<"orders">["status"][]).filter((s) => view === "todas" || VIEW_OF[s] === view);

export type Side = { lower?: Bound<FactKey, string>; upper?: Bound<FactKey, string> };

function tripBounds(a: ListArgs): Side | undefined {
  if (a.from === null && a.to === null) return undefined;
  return {
    lower: a.from !== null ? { key: a.from, inclusive: true } : undefined,
    upper: a.to !== null ? { key: a.to, inclusive: false } : undefined,
  };
}

function matches(a: ListArgs, o: Doc<"orders">, terms: string[]): boolean {
  if (a.view !== "todas" && VIEW_OF[o.status] !== a.view) return false;
  if (a.from !== null && o.departureDate < a.from) return false;
  if (a.to !== null && o.departureDate >= a.to) return false;
  for (const dim of DIMS) {
    const want = a.filters[dim];
    if (want !== undefined && dimValue(o, dim) !== want) return false;
  }
  if (terms.length) {
    const text = o.searchText ?? "";
    if (!terms.every((t) => text.includes(t))) return false;
  }
  return true;
}

function compare(sort: Sort, order: "asc" | "desc") {
  return (x: Doc<"orders">, y: Doc<"orders">) => {
    const a = sortKey(x, sort);
    const b = sortKey(y, sort);
    const c = a < b ? -1 : a > b ? 1 : x._id < y._id ? -1 : x._id > y._id ? 1 : 0;
    return order === "asc" ? c : -c;
  };
}

async function load(ctx: QueryCtx, ids: string[]): Promise<Doc<"orders">[]> {
  const docs = await Promise.all(ids.map((id) => ctx.db.get(id as Id<"orders">)));
  return docs.filter((d): d is Doc<"orders"> => d !== null);
}

function paged(all: Doc<"orders">[], a: ListArgs, approximate: boolean): ListResult {
  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / a.pageSize));
  const page = Math.min(Math.max(0, a.page), pageCount - 1);
  return { docs: all.slice(page * a.pageSize, (page + 1) * a.pageSize), total, page, pageCount, approximate };
}

export async function readOrderList(ctx: QueryCtx, a: ListArgs): Promise<ListResult> {
  const terms = normaliseSearch(a.search).split(/\s+/).filter(Boolean);
  const active = DIMS.filter((d) => a.filters[d] !== undefined);
  const dated = a.from !== null || a.to !== null;

  /* ── search ── */
  if (terms.length) {
    /* Two searches: the whole phrase (Convex ranks orders with every word
       first, the last word as a prefix) and the most selective word alone, a
       number if there is one ("LT0100050", a phone). Searching only the
       longest word missed "Sintético 200123": "sintetico" filled the cap
       with orders that did not have the number. */
    const selective = terms.find((x) => /\d/.test(x)) ?? terms.reduce((x, y) => (y.length > x.length ? y : x));
    const queries = [...new Set([terms.join(" "), selective])];
    let approximate = false;
    const byId = new Map<string, Doc<"orders">>();
    for (const text of queries) {
      for (const status of statusesOf(a.view)) {
        const docs = await ctx.db
          .query("orders")
          .withSearchIndex("search_orders", (q) => q.search("searchText", text).eq("status", status))
          .take(SEARCH_LIMIT);
        /* Every match has the selective word: if that search was not cut
           short, nothing the index can find is missing. */
        if (text === selective && docs.length === SEARCH_LIMIT) approximate = true;
        for (const d of docs) byId.set(d._id, d);
      }
    }
    const found = [...byId.values()].filter((o) => matches(a, o, terms)).sort(compare(a.sort, a.order));
    return paged(found, a, approximate);
  }

  /* ── exact ── */
  /* "Todas" is the four views read side by side; carts have no filter
     namespaces (lib/orderFacts.ts, factsOf). */
  const views = a.view === "todas" ? VIEWS : [a.view];
  /* The trees to read: a view, or each slice of a sharded one. */
  const slots = views.flatMap(slotsOf);
  const dimOk = active.length === 0 || (active.length === 1 && views.every(hasDims) && a.sort !== "total");
  const exact = dimOk && (a.sort === "trip" || !dated);
  const nsFor = (sort: Sort, slot: string, dim?: Dim) => (dim && hasDims(viewOfSlot(slot)) ? [sort, slot, dim, a.filters[dim]!] : [sort, slot]);

  if (exact) {
    const list = slots.map((v) => nsFor(a.sort, v, active[0]));
    const bounds = a.sort === "trip" ? tripBounds(a) : undefined;
    const counts = await facts.countBatch(ctx, list.map((namespace) => ({ namespace, bounds })));
    const total = counts.reduce((x, y) => x + y, 0);
    const pageCount = Math.max(1, Math.ceil(total / a.pageSize));
    const page = Math.min(Math.max(0, a.page), pageCount - 1);
    if (total === 0) return { docs: [], total, page, pageCount, approximate: false };
    const offset = page * a.pageSize;
    let ids: string[];
    if (list.length === 1) {
      /* One namespace: jump to the position and read one page. */
      const ns = list[0]!;
      const start = await facts.at(ctx, a.order === "asc" ? offset : -(offset + 1), { namespace: ns, bounds });
      const edge = { key: start.key, id: start.id, inclusive: true };
      const side: Side = bounds ?? {};
      const { page: items } = await facts.paginate(ctx, {
        namespace: ns,
        bounds: a.order === "asc" ? { lower: edge, upper: side.upper } : { lower: side.lower, upper: edge },
        order: a.order,
        pageSize: a.pageSize,
      });
      ids = items.map((i) => i.id);
    } else {
      ids = await mergedPage(ctx, list, counts, bounds ?? {}, a.order, offset, a.pageSize);
    }
    return { docs: await load(ctx, ids), total, page, pageCount, approximate: false };
  }

  /* ── scan ── */
  /* A date range sorted by something else: the range is the narrow part, so
     read it by trip date. Otherwise read in the order asked, from the
     narrowest namespace each view has, and sort what matches. */
  const byRange = dated && a.sort !== "trip";
  const scanSort: Sort = byRange ? "trip" : a.sort;
  const scanDim = scanSort !== "total" ? active[0] : undefined;
  const bounds = scanSort === "trip" ? tripBounds(a) : undefined;
  const budget = Math.ceil(SCAN_LIMIT / slots.length);
  const found: Doc<"orders">[] = [];
  let done = true;
  for (const v of slots) {
    let cursor: string | undefined;
    let read = 0;
    let finished = false;
    while (read < budget) {
      const r = await facts.paginate(ctx, { namespace: nsFor(scanSort, v, scanDim), bounds, cursor, order: byRange ? "asc" : a.order, pageSize: SCAN_PAGE });
      read += r.page.length;
      for (const o of await load(ctx, r.page.map((i) => i.id))) if (matches(a, o, terms)) found.push(o);
      cursor = r.cursor;
      if (r.isDone) {
        finished = true;
        break;
      }
    }
    if (!finished) done = false;
  }
  found.sort(compare(a.sort, a.order));
  return paged(found, a, !done);
}

type Item = { key: FactKey; id: string };
const cmpItem = (x: Item, y: Item) => (x.key < y.key ? -1 : x.key > y.key ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/*
 * One page of several sorted trees read as one ("Todas", the cart shards):
 * the items at positions [offset, offset + size) of their merge.
 *
 * Near the top, the first offset + size of each tree are merged (keys and
 * ids only, no orders loaded). Deeper, reading every item before the page
 * gets slow, so the page's first item is searched for: an item's position in
 * the merge is how many items come before it in all the trees together (one
 * batched count), and that grows with its position in its own tree, so each
 * tree is searched by probing positions until one lands exactly on offset.
 */
export async function mergedPage(
  ctx: QueryCtx,
  list: string[][],
  counts: number[],
  bounds: Side,
  order: "asc" | "desc",
  offset: number,
  size: number,
): Promise<string[]> {
  const dir = order === "asc" ? 1 : -1;
  const byOrder = (x: Item, y: Item) => dir * cmpItem(x, y);
  const firstOf = async (ns: string[], from: Bound<FactKey, string> | undefined, n: number) => {
    const out: Item[] = [];
    let cursor: string | undefined;
    while (out.length < n) {
      const r = await facts.paginate(ctx, {
        namespace: ns,
        bounds: order === "asc" ? { lower: from ?? bounds.lower, upper: bounds.upper } : { lower: bounds.lower, upper: from ?? bounds.upper },
        cursor,
        order,
        pageSize: Math.min(n - out.length, 500),
      });
      out.push(...r.page);
      cursor = r.cursor;
      if (r.isDone) break;
    }
    return out;
  };

  if (offset < SHALLOW) {
    const items: Item[] = [];
    for (let i = 0; i < list.length; i++) if (counts[i]) items.push(...(await firstOf(list[i]!, undefined, offset + size)));
    return items.sort(byOrder).slice(offset, offset + size).map((i) => i.id);
  }

  /* For each x: how many items of each tree come before it in this order,
     and in all of them together (its position in the merge). */
  const before = async (xs: Item[]) => {
    const q = xs.flatMap((x) =>
      list.map((namespace) => ({
        namespace,
        bounds:
          order === "asc"
            ? { lower: bounds.lower, upper: { key: x.key, id: x.id, inclusive: false } }
            : { lower: { key: x.key, id: x.id, inclusive: false }, upper: bounds.upper },
      })),
    );
    const n = await facts.countBatch(ctx, q);
    return xs.map((item, k) => {
      const pos = n.slice(k * list.length, (k + 1) * list.length);
      return { item, pos, rank: pos.reduce((a, b) => a + b, 0) };
    });
  };

  /* Interpolation: L comes at or before the page, U at or after it. Each
     round guesses, in every tree, the position where offset should fall by
     proportion, and keeps the closest guesses on each side. A binary search
     per tree read past the 16 MB limit at 30 000 orders. */
  type Mark = { item: Item | null; pos: number[]; rank: number };
  const total = counts.reduce((a, b) => a + b, 0);
  let L: Mark = { item: null, pos: list.map(() => 0), rank: 0 };
  let U: Mark = { item: null, pos: [...counts], rank: total };
  for (let round = 0; round < 12 && offset - L.rank > FORWARD; round++) {
    const probes: { t: number; p: number }[] = [];
    list.forEach((_, t) => {
      const span = U.pos[t]! - L.pos[t]!;
      if (span <= 0) return;
      const p = L.pos[t]! + Math.floor(((offset - L.rank) * span) / Math.max(1, U.rank - L.rank));
      probes.push({ t, p: Math.min(U.pos[t]! - 1, Math.max(L.pos[t]!, p)) });
    });
    if (!probes.length) break;
    const items = await facts.atBatch(ctx, probes.map(({ t, p }) => ({ namespace: list[t]!, bounds, offset: order === "asc" ? p : -(p + 1) })));
    for (const m of await before(items)) {
      if (m.rank <= offset && m.rank >= L.rank) L = m;
      if (m.rank >= offset && m.rank <= U.rank) U = m;
    }
    if (L.rank === offset) break;
  }

  /* From L, read forward what is left to the page, in every tree. */
  const from = L.item ? { key: L.item.key, id: L.item.id, inclusive: true } : undefined;
  const skip = offset - L.rank;
  const items: Item[] = [];
  for (let i = 0; i < list.length; i++) if (counts[i]! > L.pos[i]!) items.push(...(await firstOf(list[i]!, from, skip + size)));
  return items.sort(byOrder).slice(skip, skip + size).map((i) => i.id);
}

/* The filter menus for a view: every value it has had, minus the ones no
   order in the view has now. */
export async function facetOptions(ctx: QueryCtx, view: View | "todas"): Promise<Record<Dim, string[]>> {
  const views = view === "todas" ? VIEWS : [view];
  const out = { payment: [], method: [], partner: [], source: [] } as Record<Dim, string[]>;
  const rows = (
    await Promise.all(
      DIMS.flatMap((dim) => views.map((v) => ctx.db.query("orderFacetValues").withIndex("by_view_dim", (q) => q.eq("view", v).eq("dim", dim)).take(500))),
    )
  ).flat();
  if (!rows.length) return out;
  /* Carts have no per-value namespaces to count: every value seen stays. */
  const counted = rows.filter((r) => hasDims(r.view as View));
  const counts = counted.length ? await facts.countBatch(ctx, counted.map((r) => ({ namespace: ["created", r.view, r.dim, r.value] }))) : [];
  const live = new Set(counted.filter((_, i) => counts[i]! > 0));
  for (const r of rows) {
    const list = out[r.dim as Dim];
    if ((live.has(r) || !hasDims(r.view as View)) && list && !list.includes(r.value)) list.push(r.value);
  }
  return out;
}
