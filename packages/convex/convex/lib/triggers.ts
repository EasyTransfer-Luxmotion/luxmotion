import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "../_generated/dataModel";
import { LEAD_TABLES, searchTextOf, syncLeadFacts, syncOrderFacts } from "./orderFacts";

/*
 * Code that runs inside the same transaction as every write to a table, for
 * the derived data that must never disagree with it. Registered once here;
 * functions.ts wraps every mutation with them.
 */
export const triggers = new Triggers<DataModel>();

triggers.register("orders", async (ctx, change) => {
  const o = change.newDoc;
  /* The search text, on the order itself. Through innerDb so this patch does
     not fire the trigger again. */
  if (o) {
    const text = searchTextOf(o);
    if (o.searchText !== text) await ctx.innerDb.patch(change.id, { searchText: text });
  }
  await syncOrderFacts(ctx, change.id);
  /* The return leg is filed under the outbound's partner: when the outbound
     changes (paid, cancelled, partner fixed), the return follows. */
  const related = o?.relatedOrderId ?? change.oldDoc?.relatedOrderId;
  if (related) await syncOrderFacts(ctx, related);
});

for (const table of LEAD_TABLES) {
  triggers.register(table, async (ctx, change) => {
    await syncLeadFacts(ctx, table, change.oldDoc, change.newDoc);
  });
}
