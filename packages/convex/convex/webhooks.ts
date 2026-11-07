import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

// Centralizado na API EasyTransfer (via Supabase Edge Function -> /webhooks/nova-reserva).
// N8N removido do circuito de reservas (era um ponto de falha sem retry).
const ORDER_WEBHOOK_URL =
  process.env.EASYTRANSFER_ORDER_WEBHOOK_URL ??
  "https://vmtcugydsqkbfzuyajxh.supabase.co/functions/v1/webhook-nova-reserva";

const LEAD_WEBHOOK_URL =
  process.env.EASYTRANSFER_LEAD_WEBHOOK_URL ??
  "https://webhooks.easytransferericeira.com/webhook/novo_lead";

// Pedidos nao-transfer (tour/casamento/corporate/escola) -> confirmacao por email.
const PEDIDO_WEBHOOK_URL =
  process.env.EASYTRANSFER_PEDIDO_WEBHOOK_URL ??
  "https://vmtcugydsqkbfzuyajxh.supabase.co/functions/v1/webhook-pedido";

/**
 * Internal action: envia um pedido nao-transfer para a API EasyTransfer, que
 * dispara o email de confirmacao ao cliente com o template SendGrid do tipo.
 */
export const sendPedido = internalAction({
  args: {
    tipo: v.string(),
    email: v.string(),
    nome: v.optional(v.string()),
    dados: v.optional(v.any()),
  },
  handler: async (_ctx, args): Promise<void> => {
    try {
      const res = await fetch(PEDIDO_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: args.tipo,
          email: args.email,
          nome: args.nome,
          dados: args.dados ?? {},
        }),
      });
      if (res.ok) {
        console.log("[Pedido] Confirmacao enviada:", args.tipo, args.email);
      } else {
        console.warn("[Pedido] POST failed:", res.status, res.statusText, await res.text());
      }
    } catch (e) {
      console.warn("[Pedido] POST error:", e);
    }
  },
});

/**
 * Internal action: after payment is confirmed (transfer or tour), build the order
 * payload (outbound + return if round trip) and POST to the EasyTransfer webhook.
 * - Viagem só de ida: body = { orders: [ outbound ] }
 * - Viagem ida e volta: body = { orders: [ outbound, return ] }
 * - Tour: body = { orders: [ tourOrder ] }
 */

export const sendOrderPayload = internalAction({
  args: {
    orderId: v.id("orders"),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const attempt = args.attempt ?? 1;
    const MAX_ATTEMPTS = 5;
    console.log(`[Webhook] ENVIO WEBHOOK — sendOrderPayload INICIADO — orderId: ${args.orderId} (tentativa ${attempt}/${MAX_ATTEMPTS})`);
    const order: Doc<"orders"> | null = await ctx.runQuery(api.orders.getById, {
      orderId: args.orderId,
    });
    if (!order) {
      console.warn("[Webhook] Order not found:", args.orderId);
      return;
    }

    /* O CRM, antes do POST e não depois: uma avaria da API EasyTransfer não
       pode levar o Pipedrive atrás. Agendado e não `runAction`, para que um
       problema do lado do CRM não faça reenviar a reserva à EasyTransfer.
       A própria mutation trava as repetições — este ponto é chamado de seis
       sítios, cada um a começar na tentativa 1, e uma re-entrega do Stripe
       criaria um segundo negócio ganho. */
    const novoNoCrm = await ctx.runMutation(internal.pipedrive.enfileirarReserva, {
      orderId: args.orderId,
    });
    if (!novoNoCrm) {
      console.log(`[Pipedrive] reserva ${args.orderId} já estava na fila do CRM — não repetida.`);
    }

    const orders: Doc<"orders">[] = [order];
    if (order.relatedOrderId) {
      const returnOrder = await ctx.runQuery(api.orders.getById, {
        orderId: order.relatedOrderId,
      });
      if (returnOrder) {
        orders.push(returnOrder);
      }
    }
    // Incluir orders dos tours/experiências do upsell (checkout transfer + tours)
    const tourOrders = await ctx.runQuery(internal.orders.getByTransferOrderId, {
      transferOrderId: args.orderId,
    });
    for (const o of tourOrders) {
      orders.push(o);
    }

    const body = JSON.stringify({ orders });

    console.log("[Webhook] ENVIO WEBHOOK — Enviando POST para:", ORDER_WEBHOOK_URL, "| orders:", orders.length, "| orderIds:", orders.map((o) => o._id));
    let ok = false;
    try {
      const res = await fetch(ORDER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      ok = res.ok;
      if (ok) {
        console.log("[Webhook] ENVIO WEBHOOK — Payload enviado com sucesso. POST OK:", res.status, res.statusText);
      } else {
        console.warn("[Webhook] POST failed (tentativa " + attempt + "):", res.status, res.statusText, await res.text());
      }
    } catch (e) {
      console.warn("[Webhook] POST error (tentativa " + attempt + "):", e);
    }

    // Retry com backoff exponencial — evita perder reservas se a API/edge estiver
    // temporariamente indisponivel. Antes, uma falha aqui perdia a reserva em silencio.
    if (!ok) {
      if (attempt < MAX_ATTEMPTS) {
        const delayMs = Math.min(5 * 60_000, 5_000 * 2 ** (attempt - 1)); // 5s,10s,20s,40s... (max 5min)
        console.warn(`[Webhook] Reagendando envio (tentativa ${attempt + 1}/${MAX_ATTEMPTS}) em ${delayMs}ms — order ${args.orderId}`);
        await ctx.scheduler.runAfter(delayMs, internal.webhooks.sendOrderPayload, {
          orderId: args.orderId,
          attempt: attempt + 1,
        });
      } else {
        console.error(`[Webhook] FALHA DEFINITIVA apos ${MAX_ATTEMPTS} tentativas — RESERVA PODE TER-SE PERDIDO — order ${args.orderId}. Verificar manualmente.`);
      }
    }
  },
});

/**
 * Internal action: when payment fails (MBWay or card), send contact info to the lead webhook.
 * Used for both transfers and tour bookings.
 */
export const sendLeadPayloadFromOrder = internalAction({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<void> => {
    const order: Doc<"orders"> | null = await ctx.runQuery(api.orders.getById, {
      orderId: args.orderId,
    });
    if (!order) {
      console.warn("[Webhook] Lead: order not found:", args.orderId);
      return;
    }
    const lead = {
      source: "transfer",
      reference: (order as { orderNumber?: string }).orderNumber ?? args.orderId,
      customerName: (order as { customerName?: string }).customerName ?? "",
      customerEmail: (order as { customerEmail?: string }).customerEmail ?? "",
      customerPhone: (order as { customerPhone?: string }).customerPhone ?? "",
      customerNif: (order as { customerNif?: string }).customerNif ?? undefined,
    };
    await ctx.runAction(internal.webhooks.sendLeadPayload, { lead });
  },
});

/**
 * Internal action: when tour/experience payment fails, send contact info to the lead webhook.
 */
export const sendLeadPayloadFromTourBooking = internalAction({
  args: { bookingNumber: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const booking = await ctx.runQuery(internal.tourBookings.getByBookingNumber, {
      bookingNumber: args.bookingNumber,
    });
    if (!booking) {
      console.warn("[Webhook] Lead: tour booking not found:", args.bookingNumber);
      return;
    }
    const lead = {
      source: "tour",
      reference: args.bookingNumber,
      customerName: booking.customerName ?? "",
      customerEmail: booking.customerEmail ?? "",
      customerPhone: booking.customerPhone ?? "",
      customerNif: booking.customerNif ?? undefined,
    };
    await ctx.runAction(internal.webhooks.sendLeadPayload, { lead });
  },
});

/**
 * Internal action: POST contact payload to novo_lead webhook.
 */
export const sendLeadPayload = internalAction({
  args: {
    lead: v.object({
      source: v.string(),
      reference: v.string(),
      customerName: v.string(),
      customerEmail: v.string(),
      customerPhone: v.string(),
      customerNif: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<void> => {
    const body = JSON.stringify(args.lead);
    console.log("[Webhook] Lead: enviando para", LEAD_WEBHOOK_URL, "|", args.lead.reference);
    try {
      const res = await fetch(LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (res.ok) {
        console.log("[Webhook] Lead: enviado com sucesso:", res.status);
      } else {
        console.warn("[Webhook] Lead POST failed:", res.status, res.statusText, await res.text());
      }
    } catch (e) {
      console.warn("[Webhook] Lead POST error:", e);
    }
  },
});