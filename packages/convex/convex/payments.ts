import { v } from "convex/values";
import { internalMutation, mutation, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getDepartureArrivalFromBooking, buildOrderFromTourBooking } from "./tourBookings";
import { exigirAdmin } from "./lib/admin";

export const updatePaymentStatus = internalMutation({
  args: {
    orderId: v.optional(v.string()),
    orderNumber: v.optional(v.string()),
    paymentStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    transactionId: v.optional(v.string()),
    requestId: v.optional(v.string()), // Para MBWay
    entity: v.optional(v.string()), // Para Multibanco
    reference: v.optional(v.string()), // Para Multibanco
    amount: v.optional(v.number()),
    paymentDateTime: v.optional(v.string()), // ISO string
    metadata: v.optional(v.any()),
    paymentMethod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let order = null;

    if (args.orderId) {
      if (args.orderId.startsWith("j")) {
        try {
          order = await ctx.db.get(args.orderId as Id<"orders">);
        } catch {
        }
      }
    }

    if (!order && args.orderNumber) {
      order = await ctx.db
        .query("orders")
        .withIndex("by_order_number", (q) => q.eq("orderNumber", args.orderNumber!))
        .unique();
    }

    // Fallback 1: match by the IfThenPay requestId (stored on the order at init and returned
    // in every callback). Immune to the 15-char orderId truncation (ifthenpay init does
    // substring(0,15)) that makes a long orderNumber never match exactly for cc/mbway.
    if (!order && args.requestId) {
      order = await ctx.db
        .query("orders")
        .filter((q) => q.eq(q.field("paymentRequestId"), args.requestId))
        .first();
    }

    // Fallback 2: the truncated id is a prefix of the real orderNumber — match it back when
    // exactly one order carries that prefix (unambiguous).
    if (!order && args.orderNumber) {
      const prefix = args.orderNumber;
      const candidates = await ctx.db
        .query("orders")
        .withIndex("by_order_number", (q) =>
          q.gte("orderNumber", prefix).lt("orderNumber", prefix + "￿"),
        )
        .take(2);
      if (candidates.length === 1) order = candidates[0];
    }

    if (!order) {
      throw new Error(`Order not found: orderId=${args.orderId}, orderNumber=${args.orderNumber}, requestId=${args.requestId}`);
    }

    const updates: any = {
      paymentStatus: args.paymentStatus,
      updatedAt: Date.now(),
    };

    // Atualizar referências de pagamento
    if (args.entity) updates.paymentEntity = args.entity;
    if (args.reference) updates.paymentReference = args.reference;
    if (args.requestId) updates.paymentRequestId = args.requestId;
    if (args.transactionId) {
      // Store transactionId in metadata or separate field
      updates.transactionId = args.transactionId;
    }
    // Stripe: the real method the customer chose on the hosted page (set from the webhook).
    if (args.paymentMethod) updates.paymentMethod = args.paymentMethod;

    if (args.paymentStatus === "completed") {
      updates.status = "paid";

      const orderAmount = (order as any).totalAmount || (order as any).price || 0;
      const orderPaymentMethod = args.paymentMethod ?? order.paymentMethod ?? "unknown";
      await ctx.db.insert("transactions", {
        amount: args.amount || orderAmount,
        bookingId: order._id,
        paymentMethod: orderPaymentMethod,
        status: "completed",
        timestamp: args.paymentDateTime ? new Date(args.paymentDateTime).getTime() : Date.now(),
      });

      // Se for round trip, também atualizar ordem relacionada
      const relatedOrderId = (order as any).relatedOrderId;
      if (relatedOrderId) {
        const relatedOrder = await ctx.db.get(relatedOrderId);
        if (relatedOrder) {
          await ctx.db.patch(relatedOrderId, {
            paymentStatus: "completed",
            status: "paid",
            ...(args.paymentMethod ? { paymentMethod: args.paymentMethod } : {}),
            updatedAt: Date.now(),
          });
          
          // Criar transação para ordem relacionada também
          const relatedOrderAmount = (relatedOrder as any).totalAmount || (relatedOrder as any).price || 0;
          await ctx.db.insert("transactions", {
            amount: args.amount || relatedOrderAmount,
            bookingId: relatedOrderId,
            paymentMethod: orderPaymentMethod,
            status: "completed",
            timestamp: args.paymentDateTime ? new Date(args.paymentDateTime).getTime() : Date.now(),
          });
        }
      }
    } else if (args.paymentStatus === "failed") {
      updates.status = "pending";

      // Se for round trip, também atualizar ordem relacionada
      const relatedOrderId = (order as any).relatedOrderId;
      if (relatedOrderId) {
        await ctx.db.patch(relatedOrderId, {
          paymentStatus: "failed",
          status: "pending",
          updatedAt: Date.now(),
        });
      }

      ctx.scheduler.runAfter(0, internal.webhooks.sendLeadPayloadFromOrder, {
        orderId: order._id as Id<"orders">,
      });
    }

    await ctx.db.patch(order._id, updates);

    // Após confirmação de pagamento (transfer): criar orders para tours/experiências do upsell e enviar webhook
    if (args.paymentStatus === "completed") {
      const pending = (order as { pendingCheckoutExperiences?: Array<{
        productType: "tour" | "experience" | "event";
        tourId?: string;
        eventId?: string;
        tourTitle: string;
        tourSlug: string;
        passengers: number;
        selectedDate: string;
        selectedTime: string;
        basePrice: number;
        pickup?: {
          title: string;
          address: string;
          lat?: number;
          lng?: number;
          placeId?: string;
        };
        selectedAddons?: Array<{
          addonId?: Id<"tourAddons">;
          universalAddonId?: Id<"universalAddons">;
          title: string;
          price: number;
          pricingType: "per_person" | "flat";
          quantity: number;
          subtotal: number;
        }>;
        addonsTotal?: number;
        specialRequest?: string;
      }> }).pendingCheckoutExperiences;
      const customerName = (order as { customerName?: string }).customerName ?? "";
      const customerEmail = (order as { customerEmail?: string }).customerEmail ?? "";
      const customerPhone = (order as { customerPhone?: string }).customerPhone ?? "";
      const customerNif = (order as { customerNif?: string }).customerNif ?? undefined;
      const paymentMethod = args.paymentMethod ?? order.paymentMethod ?? "unknown";

      if (pending && pending.length > 0) {
        const now = Date.now();

        /* Uma paragem paga no checkout não tem data nem passageiros próprios:
           acontece a meio do transfer, com quem já lá vai. O formulário mandava
           `selectedDate: ""` e `passengers: 0`, e a encomenda que sai daqui
           seguia assim para a operação — sem data não há entrada na agenda do
           motorista, e a paragem que o cliente pagou desaparecia da folha.
           A viagem-mãe tem as duas coisas; é de lá que vêm quando faltam. */
        const dataDoTransfer = (order as { departureDate?: string }).departureDate ?? "";
        const passageirosDoTransfer = (order as { passengers?: number }).passengers ?? 0;
        const diaDoTransfer = dataDoTransfer.slice(0, 10);
        const horaDoTransfer = dataDoTransfer.slice(11, 16);
        for (let i = 0; i < pending.length; i++) {
          const exp = pending[i];
          if (!exp) continue;
          const bookingNumber = `TB${now.toString().slice(-10)}${(i + 1).toString().padStart(2, "0")}${Math.floor(Math.random() * 100).toString().padStart(2, "0")}`.slice(0, 15);
          const bookingId = await ctx.db.insert("tourBookings", {
            bookingNumber,
            productType: exp.productType,
            tourId: exp.tourId as Id<"tours"> | undefined,
            eventId: exp.eventId as Id<"events"> | undefined,
            tourTitle: exp.tourTitle,
            tourSlug: exp.tourSlug,
            passengers: exp.passengers || passageirosDoTransfer,
            selectedDate: exp.selectedDate || diaDoTransfer,
            selectedTime: exp.selectedTime || horaDoTransfer,
            // Os upsells não têm paragens em `tourStops`; sem isto a order
            // ficava sem partida e sem chegada.
            pickup: exp.pickup,
            basePrice: exp.basePrice,
            // O valor dos extras já vinha somado em `basePrice`; o que faltava
            // era ficar registado O QUÊ.
            selectedAddons: exp.selectedAddons,
            addonsTotal: exp.addonsTotal,
            specialRequest: exp.specialRequest,
            tipPercent: 0,
            tipAmount: 0,
            totalAmount: exp.basePrice,
            customerName,
            customerEmail,
            customerPhone,
            customerNif,
            status: "paid",
            paymentMethod,
            paymentStatus: "completed",
            createdAt: now,
            updatedAt: now,
          });
          const booking = await ctx.db.get(bookingId);
          if (booking) {
            const { departure, arrival } = await getDepartureArrivalFromBooking(ctx, booking);
            const orderDoc = buildOrderFromTourBooking(
              { ...booking, customerNif: booking.customerNif ?? undefined },
              now,
              paymentMethod,
              departure,
              arrival
            );
            await ctx.db.insert("orders", {
              ...orderDoc,
              transferOrderId: order._id as Id<"orders">,
              /* `buildOrderFromTourBooking` põe aqui a data sem hora, que serve
                 a um tour com hora própria mas não a uma paragem: esta tem de
                 cair no mesmo instante da viagem para aparecer ao lado dela. */
              ...(exp.selectedDate ? {} : { departureDate: dataDoTransfer }),
              ...(exp.passengers ? {} : { passengers: passageirosDoTransfer }),
            });
          }
        }
        await ctx.db.patch(order._id, {
          pendingCheckoutExperiences: undefined,
          updatedAt: Date.now(),
        });
      }

      // Webhook é chamado diretamente pelo caller (HTTP/action), nunca agendado
      return { success: true, orderId: order._id as Id<"orders"> };
    }

    return { success: true };
  },
});

/**
 * Mutation para testar pagamento bem-sucedido (desenvolvimento)
 * Pode ser chamada diretamente para simular um pagamento
 */
export const testPaymentSuccess = mutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    await ctx.db.patch(args.orderId, {
      paymentStatus: "completed",
      status: "paid",
      updatedAt: Date.now(),
    });

    // Criar transação
    await ctx.db.insert("transactions", {
      amount: order.totalAmount || 0,
      bookingId: args.orderId,
      paymentMethod: order.paymentMethod || "cash",
      status: "completed",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/* checkPendingMbwayPayments removido na migração para Stripe — já não há polling de MB Way;
   o estado é confirmado pelo webhook assinado do Stripe. */
