import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination"
import { enfileirarLead } from "./lib/pipedriveFila"
import { avisarPedido } from "./lib/avisoPedido"
import { exigirAdmin } from "./lib/admin";

const statusValidator = v.union(
  v.literal("new"),
  v.literal("contacted"),
  v.literal("qualified"),
  v.literal("archived"),
)

export const submit = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    companyName: v.string(),
    partnerType: v.string(),
    estimatedMonthlyVolume: v.string(),
    city: v.string(),
    howDidYouHear: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("partnerLeads", {
      ...args,
      status: "new",
      createdAt: Date.now(),
    })

    await enfileirarLead(ctx, "partnerLeads", id)
    await avisarPedido(ctx, "partnerLeads", id)

    return { id }
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const rows = await ctx.db
      .query("partnerLeads")
      .withIndex("by_created")
      .collect()
    return rows.reverse()
  },
})

export const listPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    await exigirAdmin(ctx);
    // Mirror `list`: newest-first baseline (by_created reversed).
    let rows = (
      await ctx.db.query("partnerLeads").withIndex("by_created").collect()
    ).reverse()

    rows = applySearch(rows, a.search, [
      (r) => r.fullName,
      (r) => r.email,
      (r) => r.companyName,
      (r) => r.city,
    ])

    const status = a.filters?.status
    if (status) rows = rows.filter((r) => r.status === status)

    rows = applySort(rows, a.sortBy, a.sortDir, {
      contact: (r) => r.fullName.toLowerCase(),
      company: (r) => r.companyName.toLowerCase(),
      city: (r) => r.city.toLowerCase(),
      recebido: (r) => r.createdAt,
    })

    return paginate(rows, a.page, a.pageSize)
  },
})

export const get = query({
  args: { id: v.id("partnerLeads") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    return await ctx.db.get(args.id)
  },
})

export const setStatus = mutation({
  args: { id: v.id("partnerLeads"), status: statusValidator },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.patch(args.id, { status: args.status })
  },
})

export const remove = mutation({
  args: { id: v.id("partnerLeads") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.delete(args.id)
  },
})
