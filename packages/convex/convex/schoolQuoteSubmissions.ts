import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveReferral } from "./lib/referral";
import { enfileirarLead } from "./lib/pipedriveFila";
import { avisarPedido } from "./lib/avisoPedido";
import { exigirAdmin } from "./lib/admin";

export const submit = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    children: v.optional(v.number()),
    budget: v.optional(v.number()),
    route: v.optional(v.string()),
    departureTime: v.optional(v.string()),
    pickup: v.optional(v.string()),
    dropoff: v.optional(v.string()),
    vehicle: v.optional(v.string()),
    message: v.optional(v.string()),
    referralSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { referralSlug, ...rest } = args;
    const ref = await resolveReferral(ctx, referralSlug);
    const id = await ctx.db.insert("schoolQuoteSubmissions", {
      ...rest,
      partnershipId: ref.partnershipId,
      partnershipName: ref.partnershipName,
      status: "new",
      createdAt: Date.now(),
    });

    // Confirmacao ao cliente (via API EasyTransfer -> template SendGrid School)
    await ctx.scheduler.runAfter(0, internal.webhooks.sendPedido, {
      tipo: "school",
      email: args.email,
      nome: args.name,
      dados: {
        escola_nome: "",
        numero_alunos: args.children != null ? String(args.children) : "",
      },
    });

    // Depois da confirmação: são todas `runAfter(0)` e correm por ordem de
    // agendamento, portanto o email ao cliente sai primeiro.
    await enfileirarLead(ctx, "schoolQuoteSubmissions", id);
    await avisarPedido(ctx, "schoolQuoteSubmissions", id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const submissions = await ctx.db
      .query("schoolQuoteSubmissions")
      .withIndex("by_created")
      .collect();
    return submissions.reverse();
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("schoolQuoteSubmissions"),
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
  args: { id: v.id("schoolQuoteSubmissions") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});
