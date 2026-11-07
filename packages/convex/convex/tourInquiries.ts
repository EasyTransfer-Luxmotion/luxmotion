import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveReferral } from "./lib/referral";
import { enfileirarLead } from "./lib/pipedriveFila";
import { avisarPedido } from "./lib/avisoPedido";
import { exigirAdmin } from "./lib/admin";

export const submit = mutation({
  args: {
    tourId: v.optional(v.id("tours")),
    tourTitle: v.optional(v.string()),
    tourSlug: v.optional(v.string()),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    country: v.optional(v.string()),
    date: v.optional(v.string()),
    datesFlexible: v.boolean(),
    people: v.optional(v.string()),
    ageRange: v.optional(v.string()),
    budgetMin: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    interests: v.string(),
    marketingOptIn: v.boolean(),
    referralSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { referralSlug, ...rest } = args;
    const ref = await resolveReferral(ctx, referralSlug);
    const id = await ctx.db.insert("tourInquiries", {
      ...rest,
      partnershipId: ref.partnershipId,
      partnershipName: ref.partnershipName,
      status: "new",
      createdAt: Date.now(),
    });

    // Confirmacao ao cliente (via API EasyTransfer -> template SendGrid Tour)
    await ctx.scheduler.runAfter(0, internal.webhooks.sendPedido, {
      tipo: "tour",
      email: args.email,
      nome: args.name,
      dados: {
        nome_tour: args.tourTitle ?? "",
        data_tour: args.date ?? "",
        total_passageiros: args.people ?? "",
      },
    });

    // Depois da confirmação: são todas `runAfter(0)` e correm por ordem de
    // agendamento, portanto o email ao cliente sai primeiro.
    await enfileirarLead(ctx, "tourInquiries", id);
    await avisarPedido(ctx, "tourInquiries", id);

    return id;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const inquiries = await ctx.db
      .query("tourInquiries")
      .withIndex("by_created")
      .collect();
    return inquiries.reverse();
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("tourInquiries"),
    status: v.union(v.literal("new"), v.literal("read"), v.literal("archived")),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const remove = mutation({
  args: { id: v.id("tourInquiries") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});
