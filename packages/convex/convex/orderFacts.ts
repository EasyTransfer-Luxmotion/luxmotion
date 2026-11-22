import { v } from "convex/values";
import { internalMutation } from "./functions";
import { internal } from "./_generated/api";
import { LEAD_TABLES, requestSearchText, searchTextOf, slotsOf, syncLeadFacts, syncNewsletterFacts, syncOrderFacts, VIEWS, facts } from "./lib/orderFacts";
import { internalQuery } from "./_generated/server";
import { onContactChange, onOrgChange, refreshNumbers } from "./lib/contactFacts";
import type { Id } from "./_generated/dataModel";

/*
 * Files the orders and partner leads that existed before the facts did
 * (lib/orderFacts.ts). Run once per environment after publishing:
 *
 *   npx convex run orderFacts:backfill '{}'
 *
 * It schedules itself batch after batch and can be run again at any time:
 * every step is idempotent, so a second run only repairs what drifted.
 * Progress: `npx convex run orderFacts:counts`.
 */

/* Small batches: each order is ~15 writes to the aggregate, and a mutation
   has a second of work. */
const BATCH = 25;
const TABLES = ["orders", ...LEAD_TABLES, "newsletterSubscriptions", "contactos", "organizacoes"] as const;

export const backfill = internalMutation({
  args: { table: v.optional(v.string()), cursor: v.optional(v.union(v.string(), v.null())), done: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const table = (TABLES as readonly string[]).includes(a.table ?? "") ? (a.table as (typeof TABLES)[number]) : "orders";
    const page = await ctx.db.query(table).paginate({ cursor: a.cursor ?? null, numItems: BATCH });
    for (const doc of page.page) {
      if (table === "orders") {
        const order = await ctx.db.get(doc._id as Id<"orders">);
        if (!order) continue;
        /* A patch fires the trigger, which files it; otherwise file it here. */
        const text = searchTextOf(order);
        if (order.searchText !== text) await ctx.db.patch(order._id, { searchText: text });
        else await syncOrderFacts(ctx, order._id);
      } else if (table === "contactos" || table === "organizacoes") {
        /* Numbers, relations, search text, list and menus: the same as the
           trigger does on a change, from nothing. */
        await refreshNumbers(ctx, table, doc._id as never);
        const fresh = await ctx.db.get(doc._id as Id<"contactos">);
        /* No inner writer outside a trigger: the search text goes through the
           wrapped one (its trigger repeats the same, harmlessly). */
        const c2 = { ...ctx, innerDb: ctx.db };
        if (table === "contactos") await onContactChange(c2, null, fresh as never);
        else await onOrgChange(c2, null, fresh as never);
      } else if (table === "newsletterSubscriptions") {
        await syncNewsletterFacts(ctx, null, doc as Parameters<typeof syncNewsletterFacts>[2]);
      } else {
        /* The search text through a patch (the trigger files it too). */
        const text = requestSearchText(table, doc as Parameters<typeof requestSearchText>[1]);
        if ((doc as { searchText?: string }).searchText !== text) await ctx.db.patch(doc._id as never, { searchText: text } as never);
        else await syncLeadFacts(ctx, table, null, doc as Parameters<typeof syncLeadFacts>[3]);
      }
    }
    const done = (a.done ?? 0) + page.page.length;
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.orderFacts.backfill, { table, cursor: page.continueCursor, done });
      return { table, done, finished: false };
    }
    console.log(`orderFacts.backfill: ${table} filed (${done}).`);
    const next = TABLES[TABLES.indexOf(table) + 1];
    if (next) await ctx.scheduler.runAfter(0, internal.orderFacts.backfill, { table: next, cursor: null, done: 0 });
    return { table, done, finished: !next };
  },
});

/* How many orders each view has, by the facts: after the backfill these are
   the numbers of the sidebar. */
export const counts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: Record<string, number> = { todas: 0 };
    for (const view of VIEWS) {
      const n = await facts.countBatch(ctx, slotsOf(view).map((slot) => ({ namespace: ["created", slot] })));
      out[view] = n.reduce((x, y) => x + y, 0);
      out.todas! += out[view]!;
    }
    return out;
  },
});
