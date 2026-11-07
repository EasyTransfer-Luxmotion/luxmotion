import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveReferral } from "./lib/referral";
import { enfileirarLead } from "./lib/pipedriveFila";
import { avisarPedido } from "./lib/avisoPedido";
import { exigirAdmin } from "./lib/admin";

export const submit = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    weddingDate: v.optional(v.string()),
    guests: v.optional(v.number()),
    venue: v.optional(v.string()),
    pickup: v.optional(v.string()),
    numVehicles: v.optional(v.number()),
    budget: v.optional(v.number()),
    vehicle: v.optional(v.string()),
    message: v.optional(v.string()),
    referralSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { referralSlug, ...rest } = args;
    const ref = await resolveReferral(ctx, referralSlug);
    const id = await ctx.db.insert("weddingQuoteSubmissions", {
      ...rest,
      partnershipId: ref.partnershipId,
      partnershipName: ref.partnershipName,
      status: "new",
      createdAt: Date.now(),
    });

    // Confirmacao ao cliente (via API EasyTransfer -> template SendGrid Wedding)
    await ctx.scheduler.runAfter(0, internal.webhooks.sendPedido, {
      tipo: "wedding",
      email: args.email,
      nome: args.fullName,
      dados: {
        evento_tipo: "Casamento",
        data_evento: args.weddingDate ?? "",
        local_cerimonia: args.venue ?? "",
        local_festa: args.venue ?? "",
        num_convidados: args.guests != null ? String(args.guests) : "",
        veiculos_estimados: args.numVehicles != null ? String(args.numVehicles) : "",
      },
    });

    // Depois da confirmação: são todas `runAfter(0)` e correm por ordem de
    // agendamento, portanto o email ao cliente sai primeiro.
    await enfileirarLead(ctx, "weddingQuoteSubmissions", id);
    await avisarPedido(ctx, "weddingQuoteSubmissions", id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const submissions = await ctx.db
      .query("weddingQuoteSubmissions")
      .withIndex("by_created")
      .collect();
    return submissions.reverse();
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("weddingQuoteSubmissions"),
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
  args: { id: v.id("weddingQuoteSubmissions") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});
