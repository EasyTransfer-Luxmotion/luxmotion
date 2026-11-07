import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { enfileirarLead } from "./lib/pipedriveFila";
import { exigirAdmin } from "./lib/admin";

export const subscribe = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("newsletterSubscriptions")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) return;
    const id = await ctx.db.insert("newsletterSubscriptions", {
      email: args.email,
      name: args.name,
      source: args.source,
      createdAt: Date.now(),
    });

    /* Aqui e não no topo do handler: quem já está subscrito sai no `return`
       acima, e lá em cima o mesmo subscritor era reenviado a cada clique. */
    await enfileirarLead(ctx, "newsletterSubscriptions", id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const subs = await ctx.db
      .query("newsletterSubscriptions")
      .withIndex("by_created")
      .collect();
    return subs.reverse();
  },
});
