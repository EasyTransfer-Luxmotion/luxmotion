import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { resolveReferral } from "./lib/referral"
import { enfileirarLead } from "./lib/pipedriveFila"
import { avisarPedido } from "./lib/avisoPedido"
import { exigirAdmin } from "./lib/admin";

const statusValidator = v.union(
  v.literal("new"),
  v.literal("inProgress"),
  v.literal("resolved"),
  v.literal("archived"),
)

export const submit = mutation({
  args: {
    fullName: v.string(),
    company: v.string(),
    email: v.string(),
    phone: v.string(),
    subject: v.string(),
    message: v.string(),
    referralSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { referralSlug, ...rest } = args
    const ref = await resolveReferral(ctx, referralSlug)
    const id = await ctx.db.insert("contactQuotes", {
      ...rest,
      partnershipId: ref.partnershipId,
      partnershipName: ref.partnershipName,
      status: "new",
      createdAt: Date.now(),
    })

    await enfileirarLead(ctx, "contactQuotes", id)
    await avisarPedido(ctx, "contactQuotes", id)

    return { id }
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const rows = await ctx.db
      .query("contactQuotes")
      .withIndex("by_created")
      .collect()
    return rows.reverse()
  },
})

export const get = query({
  args: { id: v.id("contactQuotes") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    return await ctx.db.get(args.id)
  },
})

export const setStatus = mutation({
  args: { id: v.id("contactQuotes"), status: statusValidator },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.patch(args.id, { status: args.status })
  },
})

export const remove = mutation({
  args: { id: v.id("contactQuotes") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.delete(args.id)
  },
})
