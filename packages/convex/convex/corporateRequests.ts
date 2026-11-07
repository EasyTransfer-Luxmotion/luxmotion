import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { resolveReferral } from "./lib/referral"
import { enfileirarLead } from "./lib/pipedriveFila"
import { avisarPedido } from "./lib/avisoPedido"
import { exigirAdmin } from "./lib/admin";

const statusValidator = v.union(
  v.literal("submitted"),
  v.literal("reviewing"),
  v.literal("approved"),
  v.literal("rejected"),
)

export const submit = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    companyName: v.string(),
    eventDate: v.optional(v.number()),
    guests: v.optional(v.number()),
    budget: v.optional(v.number()),
    vehicleType: v.optional(v.string()),
    notes: v.optional(v.string()),
    referralSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { referralSlug, ...rest } = args
    const ref = await resolveReferral(ctx, referralSlug)
    const total = await ctx.db.query("corporateRequests").collect()
    const queuePosition = total.length + 1

    const id = await ctx.db.insert("corporateRequests", {
      ...rest,
      partnershipId: ref.partnershipId,
      partnershipName: ref.partnershipName,
      status: "submitted",
      queuePosition,
      createdAt: Date.now(),
    })

    // Confirmacao ao cliente (via API EasyTransfer -> template SendGrid Corporate)
    await ctx.scheduler.runAfter(0, internal.webhooks.sendPedido, {
      tipo: "corporate",
      email: args.email,
      nome: args.fullName,
      dados: {},
    })

    // Depois da confirmação: são todas `runAfter(0)` e correm por ordem de
    // agendamento, portanto o email ao cliente sai primeiro.
    await enfileirarLead(ctx, "corporateRequests", id)
    await avisarPedido(ctx, "corporateRequests", id)

    return { id, queuePosition }
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const requests = await ctx.db
      .query("corporateRequests")
      .withIndex("by_created")
      .collect()
    return requests.reverse()
  },
})

export const get = query({
  args: { id: v.id("corporateRequests") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    return await ctx.db.get(args.id)
  },
})

export const setStatus = mutation({
  args: {
    id: v.id("corporateRequests"),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.patch(args.id, {
      status: args.status,
      reviewedAt: Date.now(),
    })
  },
})

export const setInternalNotes = mutation({
  args: {
    id: v.id("corporateRequests"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.patch(args.id, { internalNotes: args.notes })
  },
})

export const remove = mutation({
  args: { id: v.id("corporateRequests") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.delete(args.id)
  },
})
