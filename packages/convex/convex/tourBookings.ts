import { ConvexError, v } from "convex/values";
import { mutation, query, action, internalMutation, internalAction, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { resolveReferral } from "./lib/referral";
import { gorjeta, precoDaReserva } from "./lib/precoTours";

function generateBookingNumber(): string {
  const t = Date.now().toString().slice(-10);
  const r = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `TB${t}${r}`.slice(0, 15);
}

/**
 * Uma reserva paga, concluída ou cancelada já não muda. Sem isto dava para
 * baixar a gorjeta, ou o número de pessoas, de uma reserva que já tinha sido
 * cobrada.
 */
function exigirAlteravel(booking: Doc<"tourBookings"> | null): Doc<"tourBookings"> {
  if (!booking) throw new ConvexError("Reserva não encontrada.");
  if (booking.status !== "draft" && booking.status !== "pending") {
    throw new ConvexError("Esta reserva já não pode ser alterada.");
  }
  return booking;
}

/** O preço de uma reserva já gravada, a partir do tour ou evento de agora. */
async function recalcular(ctx: MutationCtx, booking: Doc<"tourBookings">) {
  const preco = await precoDaReserva(ctx, {
    tourId: booking.tourId,
    eventId: booking.eventId,
    passengers: booking.passengers,
    sharingMode: booking.sharingMode,
    extras: (booking.selectedAddons ?? []).map((a) => ({
      addonId: a.addonId,
      universalAddonId: a.universalAddonId,
    })),
  });
  const tipAmount = gorjeta(preco.basePrice, booking.tipPercent ?? 0, booking.tipAmount ?? 0);
  return { ...preco, tipAmount, totalAmount: preco.basePrice + preco.addonsTotal + tipAmount };
}

export const init = mutation({
  args: {
    productType: v.union(v.literal("tour"), v.literal("experience"), v.literal("event")),
    tourId: v.optional(v.id("tours")),
    eventId: v.optional(v.id("events")),
    tourTitle: v.string(),
    tourSlug: v.string(),
    passengers: v.number(),
    selectedDate: v.string(),
    selectedTime: v.string(),
    /* Os valores monetários que o browser manda são ignorados: o preço é
       calculado aqui. Continuam aceites para o site antigo não partir. */
    basePrice: v.optional(v.number()),
    sharingMode: v.optional(v.union(v.literal("private"), v.literal("shared"))),
    selectedAddons: v.optional(v.array(v.object({
      addonId: v.optional(v.id("tourAddons")),
      universalAddonId: v.optional(v.id("universalAddons")),
      title: v.optional(v.string()),
      price: v.optional(v.number()),
      pricingType: v.optional(v.union(v.literal("per_person"), v.literal("flat"))),
      quantity: v.optional(v.number()),
      subtotal: v.optional(v.number()),
    }))),
    addonsTotal: v.optional(v.number()),
    referralSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ref = await resolveReferral(ctx, args.referralSlug);
    let bookingNumber = generateBookingNumber();
    let existing = await ctx.db
      .query("tourBookings")
      .withIndex("by_booking_number", (q) => q.eq("bookingNumber", bookingNumber))
      .unique();
    while (existing) {
      bookingNumber = generateBookingNumber();
      existing = await ctx.db
        .query("tourBookings")
        .withIndex("by_booking_number", (q) => q.eq("bookingNumber", bookingNumber))
        .unique();
    }

    const preco = await precoDaReserva(ctx, {
      tourId: args.tourId,
      eventId: args.eventId,
      passengers: args.passengers,
      sharingMode: args.sharingMode,
      extras: (args.selectedAddons ?? []).map((a) => ({
        addonId: a.addonId,
        universalAddonId: a.universalAddonId,
      })),
    });
    const totalAmount = preco.basePrice + preco.addonsTotal;
    const id = await ctx.db.insert("tourBookings", {
      bookingNumber,
      productType: args.productType,
      tourId: args.tourId ?? undefined,
      eventId: args.eventId ?? undefined,
      tourTitle: args.tourTitle,
      tourSlug: args.tourSlug,
      passengers: args.passengers,
      selectedDate: args.selectedDate,
      selectedTime: args.selectedTime,
      basePrice: preco.basePrice,
      sharingMode: args.sharingMode ?? undefined,
      selectedAddons: preco.selectedAddons.length ? preco.selectedAddons : undefined,
      addonsTotal: preco.addonsTotal > 0 ? preco.addonsTotal : undefined,
      partnershipId: ref.partnershipId,
      partnershipName: ref.partnershipName,
      tipPercent: 0,
      tipAmount: 0,
      totalAmount,
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    const booking = await ctx.db.get(id);
    return { bookingId: id, booking, bookingNumber: booking?.bookingNumber ?? bookingNumber };
  },
});

export const updateContact = mutation({
  args: {
    bookingId: v.id("tourBookings"),
    customerName: v.string(),
    customerEmail: v.string(),
    customerPhone: v.string(),
    customerNif: v.optional(v.string()),
    /* Só nas reservas por viatura: o cartão não tem contadores e o número real
       é pedido aqui. */
    passengers: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const booking = exigirAlteravel(await ctx.db.get(args.bookingId));
    if (args.passengers !== undefined && args.passengers !== booking.passengers) {
      // Numa viatura o preço não depende de quantos vão; por pessoa, depende —
      // e mudar o número depois do preço feito era pagar 1 e levar 8.
      const { porViatura } = await recalcular(ctx, booking);
      if (!porViatura) throw new ConvexError("O número de pessoas não pode mudar nesta fase.");
      if (!Number.isInteger(args.passengers) || args.passengers < 1) {
        throw new ConvexError("Número de pessoas inválido.");
      }
    }
    const now = Date.now();
    await ctx.db.patch(args.bookingId, {
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      customerPhone: args.customerPhone,
      customerNif: args.customerNif ?? undefined,
      ...(args.passengers !== undefined && { passengers: args.passengers }),
      updatedAt: now,
    });
    return await ctx.db.get(args.bookingId);
  },
});

export const updatePickup = mutation({
  args: {
    bookingId: v.id("tourBookings"),
    pickup: v.optional(
      v.object({
        title: v.string(),
        address: v.string(),
        description: v.optional(v.string()),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        placeId: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    exigirAlteravel(await ctx.db.get(args.bookingId));
    const now = Date.now();
    await ctx.db.patch(args.bookingId, {
      pickup: args.pickup ?? undefined,
      updatedAt: now,
    });
    return await ctx.db.get(args.bookingId);
  },
});

export const updateTipAndTotal = mutation({
  args: {
    bookingId: v.id("tourBookings"),
    tipPercent: v.number(),
    /* Só conta no valor livre (`tipPercent` -1). Numa percentagem é calculada
       aqui. O total que o browser manda é ignorado. */
    tipAmount: v.number(),
    totalAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const booking = exigirAlteravel(await ctx.db.get(args.bookingId));
    const preco = await recalcular(ctx, {
      ...booking,
      tipPercent: args.tipPercent,
      tipAmount: args.tipAmount,
    });
    await ctx.db.patch(args.bookingId, {
      basePrice: preco.basePrice,
      addonsTotal: preco.addonsTotal > 0 ? preco.addonsTotal : undefined,
      tipPercent: args.tipPercent,
      tipAmount: preco.tipAmount,
      totalAmount: preco.totalAmount,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.bookingId);
  },
});

/**
 * Recalcula o preço de uma reserva no momento de a cobrar, grava-o e devolve
 * o total. É este o valor que vai para o pagamento — nunca o do browser.
 */
export const fixarPreco = internalMutation({
  args: { bookingId: v.id("tourBookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = exigirAlteravel(await ctx.db.get(bookingId));
    const preco = await recalcular(ctx, booking);
    await ctx.db.patch(bookingId, {
      basePrice: preco.basePrice,
      selectedAddons: preco.selectedAddons.length ? preco.selectedAddons : undefined,
      addonsTotal: preco.addonsTotal > 0 ? preco.addonsTotal : undefined,
      tipAmount: preco.tipAmount,
      totalAmount: preco.totalAmount,
      updatedAt: Date.now(),
    });
    return preco.totalAmount;
  },
});

export const getById = internalQuery({
  args: { bookingId: v.id("tourBookings") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.bookingId);
  },
});

export const getByBookingNumber = internalQuery({
  args: { bookingNumber: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tourBookings")
      .withIndex("by_booking_number", (q) => q.eq("bookingNumber", args.bookingNumber))
      .unique();
  },
});

export const subscribeToStatus = query({
  args: { bookingNumber: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.bookingNumber) return null;
    const b = await ctx.db
      .query("tourBookings")
      .withIndex("by_booking_number", (q) => q.eq("bookingNumber", args.bookingNumber!))
      .unique();
    if (!b) return null;
    return {
      bookingId: b._id,
      bookingNumber: b.bookingNumber,
      status: b.status,
      paymentStatus: b.paymentStatus,
      updatedAt: b.updatedAt,
    };
  },
});

/** Departure/arrival for orders schema: { location, placeId?, lat?, lng?, name? } */
export type OrderLocation = {
  location: string;
  name?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
};

function toOrderLocation(
  location: string,
  opts?: { name?: string; placeId?: string; lat?: number; lng?: number }
): OrderLocation {
  return {
    location,
    ...(opts?.name != null && { name: opts.name }),
    ...(opts?.placeId != null && { placeId: opts.placeId }),
    ...(opts?.lat != null && { lat: opts.lat }),
    ...(opts?.lng != null && { lng: opts.lng }),
  };
}

/** Resolve first and last stop of the tour (or event meeting point) for departure/arrival. Format: { location, placeId?, lat?, lng?, name? }. */
export async function getDepartureArrivalFromBooking(
  ctx: MutationCtx,
  booking: { tourId?: Id<"tours">; eventId?: Id<"events">; pickup?: { address?: string; title?: string; placeId?: string; lat?: number; lng?: number } | null; tourTitle: string }
): Promise<{ departure: OrderLocation; arrival: OrderLocation }> {
  const fallbackDeparture: OrderLocation = toOrderLocation(
    booking.pickup?.address ?? "Ponto de encontro",
    { name: booking.pickup?.title, placeId: booking.pickup?.placeId, lat: booking.pickup?.lat, lng: booking.pickup?.lng }
  );
  const fallbackArrival: OrderLocation = toOrderLocation(booking.tourTitle);

  if (booking.tourId) {
    const tour = await ctx.db.get(booking.tourId);
    const stops = await ctx.db
      .query("tourStops")
      .withIndex("by_tour", (q) => q.eq("tourId", booking.tourId!))
      .collect();
    const sorted = stops.sort((a, b) => a.order - b.order);
    // Sempre usar primeira e última paragem do tour para departure/arrival; coordenadas do stop ou fallback pickup/dropoff do tour
    if (sorted.length >= 2) {
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const depLat = first.lat ?? tour?.pickup?.lat;
      const depLng = first.lng ?? tour?.pickup?.lng;
      const depPlaceId = first.placeId ?? tour?.pickup?.placeId;
      const arrLat = last.lat ?? tour?.dropoff?.lat;
      const arrLng = last.lng ?? tour?.dropoff?.lng;
      const arrPlaceId = last.placeId ?? tour?.dropoff?.placeId;
      return {
        departure: toOrderLocation(first.address ?? first.title, { name: first.title, placeId: depPlaceId, lat: depLat, lng: depLng }),
        arrival: toOrderLocation(last.address ?? last.title, { name: last.title, placeId: arrPlaceId, lat: arrLat, lng: arrLng }),
      };
    }
    if (sorted.length === 1) {
      const stop = sorted[0]!;
      const depLat = stop.lat ?? tour?.pickup?.lat;
      const depLng = stop.lng ?? tour?.pickup?.lng;
      const depPlaceId = stop.placeId ?? tour?.pickup?.placeId;
      return {
        departure: toOrderLocation(stop.address ?? stop.title, { name: stop.title, placeId: depPlaceId, lat: depLat, lng: depLng }),
        arrival: toOrderLocation(booking.tourTitle, { placeId: tour?.dropoff?.placeId, lat: tour?.dropoff?.lat, lng: tour?.dropoff?.lng }),
      };
    }
    if (tour?.pickup && tour?.dropoff) {
      return {
        departure: toOrderLocation(tour.pickup.address, { name: tour.pickup.title, placeId: tour.pickup.placeId, lat: tour.pickup.lat, lng: tour.pickup.lng }),
        arrival: toOrderLocation(tour.dropoff.address, { name: tour.dropoff.title, placeId: tour.dropoff.placeId, lat: tour.dropoff.lat, lng: tour.dropoff.lng }),
      };
    }
  }

  if (booking.eventId) {
    const event = await ctx.db.get(booking.eventId);
    if (event?.meetingPoint) {
      const mp = event.meetingPoint;
      return {
        departure: toOrderLocation(mp.address, { name: mp.title, placeId: mp.placeId, lat: mp.lat, lng: mp.lng }),
        arrival: toOrderLocation(booking.tourTitle),
      };
    }
  }

  return { departure: fallbackDeparture, arrival: fallbackArrival };
}

/** Monta o documento para a tabela `orders` a partir de um tour booking pago. Mesmo schema que checkout normal (departure/arrival, paymentAmount, customerNif, departureDate = data do tour). */
export function buildOrderFromTourBooking(
  booking: {
    _id: Id<"tourBookings">;
    bookingNumber: string;
    tourTitle: string;
    selectedDate: string;
    passengers: number;
    totalAmount: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerNif?: string | null;
    paymentMethod?: string | null;
    sharingMode?: "private" | "shared";
    selectedAddons?: Array<{
      // Opcional: os add-ons dos upsells do checkout são embutidos na própria
      // experiência e não têm linha em `tourAddons`.
      addonId?: Id<"tourAddons">;
      universalAddonId?: Id<"universalAddons">;
      title: string;
      price: number;
      pricingType: "per_person" | "flat";
      quantity: number;
      subtotal: number;
    }>;
    addonsTotal?: number;
  },
  now: number,
  paymentMethod: string,
  departure: OrderLocation,
  arrival: OrderLocation
) {
  return {
    orderNumber: booking.bookingNumber,
    tourBookingId: booking._id,
    status: "paid" as const,
    departure: {
      location: departure.location,
      ...(departure.name != null && { name: departure.name }),
      ...(departure.placeId != null && { placeId: departure.placeId }),
      ...(departure.lat != null && { lat: departure.lat }),
      ...(departure.lng != null && { lng: departure.lng }),
    },
    arrival: {
      location: arrival.location,
      ...(arrival.name != null && { name: arrival.name }),
      ...(arrival.placeId != null && { placeId: arrival.placeId }),
      ...(arrival.lat != null && { lat: arrival.lat }),
      ...(arrival.lng != null && { lng: arrival.lng }),
    },
    departureDate: booking.selectedDate,
    passengers: booking.passengers,
    isRoundTrip: false,
    totalAmount: booking.totalAmount,
    paymentAmount: booking.totalAmount,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    customerNif: booking.customerNif ?? undefined,
    ...(booking.sharingMode && { sharingMode: booking.sharingMode }),
    ...(booking.selectedAddons?.length && { selectedAddons: booking.selectedAddons }),
    ...(booking.addonsTotal != null && booking.addonsTotal > 0 && { addonsTotal: booking.addonsTotal }),
    paymentMethod,
    paymentStatus: "completed" as const,
    createdAt: now,
    updatedAt: now,
  };
}

/** Cria sempre uma order em `orders` quando um tour booking está pago (callback MBWay/cartão). Webhook é chamado diretamente pelo caller (action). */
export const ensureOrderForPaidTourBooking = internalMutation({
  args: { bookingId: v.id("tourBookings") },
  handler: async (ctx, args): Promise<{ orderId?: Id<"orders"> }> => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.paymentStatus !== "completed") return {};

    const existing = await ctx.db
      .query("orders")
      .withIndex("by_tour_booking", (q) => q.eq("tourBookingId", booking._id))
      .unique();
    if (existing) return { orderId: existing._id };

    const now = Date.now();
    const { departure, arrival } = await getDepartureArrivalFromBooking(ctx, booking);
    const paymentMethod = booking.paymentMethod ?? "unknown";
    const orderDoc = buildOrderFromTourBooking(booking, now, paymentMethod, departure, arrival);
    const newOrderId = await ctx.db.insert("orders", orderDoc);
    return { orderId: newOrderId };
  },
});

export const startPayment = internalMutation({
  args: {
    bookingId: v.id("tourBookings"),
    method: v.union(
      v.literal("mbway"),
      v.literal("mb"),
      v.literal("ccard"),
      v.literal("cash")
    ),
    totalAmount: v.number(),
    paymentRequestId: v.optional(v.string()),
    paymentEntity: v.optional(v.string()),
    paymentReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const isCash = args.method === "cash";
    await ctx.db.patch(args.bookingId, {
      paymentMethod: args.method,
      paymentStatus: isCash ? "completed" : "pending",
      totalAmount: args.totalAmount,
      status: isCash ? "paid" : "pending",
      paymentRequestId: args.paymentRequestId ?? undefined,
      paymentEntity: args.paymentEntity ?? undefined,
      paymentReference: args.paymentReference ?? undefined,
      updatedAt: now,
    });
    // CASH: criar order em `orders` na mesma mutation; webhook é chamado pela action startPaymentAction
    let orderId: Id<"orders"> | undefined;
    if (isCash) {
      const booking = await ctx.db.get(args.bookingId);
      if (booking) {
        const existing = await ctx.db
          .query("orders")
          .withIndex("by_tour_booking", (q) => q.eq("tourBookingId", booking._id))
          .unique();
        if (!existing) {
          const { departure, arrival } = await getDepartureArrivalFromBooking(ctx, booking);
          const bookingForOrder = {
            ...booking,
            totalAmount: booking.totalAmount ?? args.totalAmount,
            customerNif: booking.customerNif ?? undefined,
          };
          const orderDoc = buildOrderFromTourBooking(bookingForOrder, now, "cash", departure, arrival);
          orderId = await ctx.db.insert("orders", orderDoc);
        }
      }
    }
    const booking = await ctx.db.get(args.bookingId);
    return { booking, orderId };
  },
});

export const startPaymentAction = action({
  args: {
    bookingId: v.id("tourBookings"),
    method: v.union(
      v.literal("mbway"),
      v.literal("mb"),
      v.literal("ccard"),
      v.literal("cash")
    ),
    /* O total que o cliente viu. Não é o que se cobra — serve para recusar o
       pagamento se o preço calculado aqui for outro, em vez de cobrar um número
       diferente do que estava no ecrã. */
    amount: v.optional(v.number()),
    phoneNumber: v.optional(v.string()),
    email: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    errorUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const booking = await ctx.runQuery(internal.tourBookings.getById, {
      bookingId: args.bookingId,
    });
    if (!booking) {
      throw new Error("Tour booking not found");
    }

    const bookingNumber = booking.bookingNumber;

    const totalAmount: number = await ctx.runMutation(internal.tourBookings.fixarPreco, {
      bookingId: args.bookingId,
    });
    if (args.amount !== undefined && Math.abs(args.amount - totalAmount) > 0.005) {
      throw new ConvexError(
        `O preço desta reserva é €${totalAmount.toFixed(2)}, não €${args.amount.toFixed(2)}. Recarrega a página e tenta outra vez.`,
      );
    }

    if (args.method === "cash") {
      const result = await ctx.runMutation(internal.tourBookings.startPayment, {
        bookingId: args.bookingId,
        method: "cash",
        totalAmount,
      });
      if (result?.orderId) {
        await ctx.runAction(internal.webhooks.sendOrderPayload, { orderId: result.orderId });
      }
      return { success: true };
    }

    // Stripe Checkout — uma sessão hosted para o tour/experiência.
    if (args.method !== "mb" && args.method !== "mbway" && args.method !== "ccard") {
      throw new Error("Unsupported payment method");
    }
    if (!args.successUrl || !args.cancelUrl) {
      throw new Error("successUrl and cancelUrl are required for Stripe payment");
    }

    const session: any = await ctx.runAction(internal.stripe.createCheckoutSession, {
      kind: "tour",
      // O Stripe apresenta os métodos ativos e elegíveis, tal como nos transfers.
      orderNumber: bookingNumber,
      orderId: args.bookingId,
      amount: totalAmount,
      description: booking.tourTitle
        ? `${booking.tourTitle} (${bookingNumber})`
        : `Easy Transfer ${bookingNumber}`,
      email: args.email,
      language: args.language,
      successUrl: args.successUrl,
      cancelUrl: args.errorUrl ?? args.cancelUrl,
    });

    // Guardar método + referência Stripe no booking. O webhook confirma pelo metadata.
    await ctx.runMutation(internal.tourBookings.startPayment, {
      bookingId: args.bookingId,
      method: args.method,
      totalAmount,
      paymentRequestId: session.paymentIntentId ?? session.sessionId,
    });

    return {
      success: true,
      method: args.method,
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
    };
  },
});

/* checkPaymentStatus removido na migração para Stripe — sem polling de MB Way; o estado é
   confirmado pelo webhook do Stripe (que chama completeTourBookingPayment). */

export const setPaymentFailed = internalMutation({
  args: { bookingNumber: v.string() },
  handler: async (ctx, args) => {
    const booking = await ctx.db
      .query("tourBookings")
      .withIndex("by_booking_number", (q) => q.eq("bookingNumber", args.bookingNumber))
      .unique();
    if (!booking) return;
    await ctx.db.patch(booking._id, {
      paymentStatus: "failed",
      status: "pending",
      updatedAt: Date.now(),
    });
    ctx.scheduler.runAfter(0, internal.webhooks.sendLeadPayloadFromTourBooking, {
      bookingNumber: args.bookingNumber,
    });
  },
});

export const updatePaymentStatus = internalMutation({
  args: {
    bookingNumber: v.string(),
    paymentMethod: v.optional(v.string()),
    paymentStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db
      .query("tourBookings")
      .withIndex("by_booking_number", (q) => q.eq("bookingNumber", args.bookingNumber))
      .unique();
    if (!booking) {
      throw new Error(`Tour booking not found: ${args.bookingNumber}`);
    }
    // Não sobrescrever "failed" com "completed" (ex.: callback tardio após utilizador rejeitar no MBWay)
    if (args.paymentStatus === "completed" && booking.paymentStatus === "failed") {
      return { success: true };
    }
    const now = Date.now();
    const updates: Record<string, unknown> = {
      paymentStatus: args.paymentStatus,
      ...(args.paymentMethod ? { paymentMethod: args.paymentMethod } : {}),
      updatedAt: now,
    };
    if (args.paymentStatus === "completed") {
      updates.status = "paid";
    } else if (args.paymentStatus === "failed") {
      updates.status = "pending";
    }
    await ctx.db.patch(booking._id, updates);

    // Webhook é chamado diretamente pelo caller (action completeTourBookingPayment), nunca agendado
    if (args.paymentStatus === "completed") {
      return { success: true, bookingId: booking._id };
    }
    return { success: true };
  },
});

/** Atualiza status de pagamento do tour e envia webhook diretamente (sem agendamento). Usado por HTTP/ifthenpay. */
export const completeTourBookingPayment = internalAction({
  args: {
    bookingNumber: v.string(),
    paymentMethod: v.optional(v.string()),
    paymentStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(internal.tourBookings.updatePaymentStatus, {
      bookingNumber: args.bookingNumber,
      paymentStatus: args.paymentStatus,
      paymentMethod: args.paymentMethod,
    });
    if (args.paymentStatus === "completed" && result?.bookingId) {
      const ensureResult = await ctx.runMutation(internal.tourBookings.ensureOrderForPaidTourBooking, {
        bookingId: result.bookingId,
      });
      if (ensureResult?.orderId) {
        await ctx.runAction(internal.webhooks.sendOrderPayload, { orderId: ensureResult.orderId });
      }
    } else if (args.paymentStatus === "failed") {
      await ctx.runAction(internal.webhooks.sendLeadPayloadFromTourBooking, {
        bookingNumber: args.bookingNumber,
      });
    }
  },
});
