import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { resolveReferral } from "./lib/referral";
import { enfileirarLead } from "./lib/pipedriveFila";
import { avisarPedido } from "./lib/avisoPedido";
import { exigirAdmin } from "./lib/admin";

export const submit = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    message: v.string(),
    referralSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { referralSlug, ...rest } = args;
    const ref = await resolveReferral(ctx, referralSlug);
    const id = await ctx.db.insert("contactSubmissions", {
      ...rest,
      partnershipId: ref.partnershipId,
      partnershipName: ref.partnershipName,
      status: "new",
      createdAt: Date.now(),
    });

    await enfileirarLead(ctx, "contactSubmissions", id);
    await avisarPedido(ctx, "contactSubmissions", id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const submissions = await ctx.db
      .query("contactSubmissions")
      .withIndex("by_created")
      .collect();
    return submissions.reverse();
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("contactSubmissions"),
    status: v.union(
      v.literal("new"),
      v.literal("read"),
      v.literal("archived"),
    ),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const remove = mutation({
  args: { id: v.id("contactSubmissions") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});
