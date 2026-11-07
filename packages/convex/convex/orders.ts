import { v } from "convex/values";
import { isNightDeparture } from "./lib/pricing";
import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination";
import { resolveReferral } from "./lib/referral";
import { exigirAdmin } from "./lib/admin";

const ORDER_WEBHOOK_URL =
  process.env.EASYTRANSFER_ORDER_WEBHOOK_URL ??
  "https://webhooks.easytransferericeira.com/webhook/73c31c3b-49ad-47f9-b8fa-40e8e7369a36";

const amadeusFlightInfoValidator = v.object({
  carrier: v.optional(v.string()),
  flightNumber: v.optional(v.string()),
  airlineCompany: v.optional(v.string()),
  scheduledDepartureDate: v.optional(v.string()),
  departureAirportCode: v.optional(v.string()),
  departureTerminal: v.optional(v.string()),
  departureDateTimeLocal: v.optional(v.string()),
  departureTimingSource: v.optional(v.string()),
  arrivalAirportCode: v.optional(v.string()),
  arrivalTerminal: v.optional(v.string()),
  arrivalDateTimeLocal: v.optional(v.string()),
  arrivalTimingSource: v.optional(v.string()),
  aircraftCode: v.optional(v.string()),
  operatingCarrierCode: v.optional(v.string()),
  rawFlightData: v.optional(v.any()),
});

export const init = mutation({
  args: {
    departure: v.object({
      location: v.string(),
      placeId: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    }),
    arrival: v.object({
      location: v.string(),
      placeId: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    }),
    stops: v.optional(v.array(v.object({
      location: v.string(),
      placeId: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    }))),
    passengers: v.number(),
    adults: v.optional(v.number()),
    children: v.optional(v.number()),
    departureDate: v.string(),
    isRoundTrip: v.optional(v.boolean()),
    returnDate: v.optional(v.string()),
    /** Slug da parceria no URL (ex: "vila-gale"). Se omitido = site principal "Easy Transfer". */
    partnershipSlug: v.optional(v.string()),
    /* A origem publicitária e o identificador da OpenAI andam juntos no
       pedido mas separados na gravação — ver o comentário no schema. */
    adSource: v.optional(
      v.object({
        utmSource: v.optional(v.string()),
        utmMedium: v.optional(v.string()),
        utmCampaign: v.optional(v.string()),
        utmContent: v.optional(v.string()),
        campaignId: v.optional(v.string()),
        adGroupId: v.optional(v.string()),
        capturedAt: v.optional(v.number()),
      }),
    ),
    opprefId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const isRoundTrip = args.isRoundTrip ?? false;
    const passengers = args.passengers ?? (args.adults ?? 0) + (args.children ?? 0);

    // Attribute the order to an affiliate/partnership by its URL slug. Falls back
    // to the main site label when there's no slug or the slug matches nothing.
    const ref = await resolveReferral(ctx, args.partnershipSlug);
    const partnershipName: string = ref.partnershipName ?? "Easy Transfer";
    const partnershipId = ref.partnershipId;

    // Gerar orderNumber único para a ordem de ida
    const outboundOrderNumber = `ET${now}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    console.log("[Orders] Creating order(s) - isRoundTrip:", isRoundTrip, "partnershipName:", partnershipName);
    console.log("[Orders] Args:", JSON.stringify(args, null, 2));
    
    // Criar ordem de ida (outbound)
    const outboundOrderId = await ctx.db.insert("orders", {
      orderNumber: outboundOrderNumber,
      partnershipName,
      partnershipId,
      departure: {
        location: args.departure.location,
        placeId: args.departure.placeId ?? undefined,
        lat: args.departure.lat ?? undefined,
        lng: args.departure.lng ?? undefined,
      },
      arrival: {
        location: args.arrival.location,
        placeId: args.arrival.placeId ?? undefined,
        lat: args.arrival.lat ?? undefined,
        lng: args.arrival.lng ?? undefined,
      },
      stops: args.stops?.map(s => ({
        location: s.location,
        placeId: s.placeId ?? undefined,
        lat: s.lat ?? undefined,
        lng: s.lng ?? undefined,
      })),
      departureDate: args.departureDate,
      passengers,
      adults: args.adults ?? undefined,
      children: args.children ?? undefined,
      isRoundTrip: isRoundTrip,
      /* Desde o rascunho: se só se gravasse no pagamento, uma reserva
         abandonada não dizia de onde tinha vindo — e são essas que mais
         interessam para perceber o que uma campanha está a trazer. */
      adSource: args.adSource,
      opprefId: args.opprefId,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    let returnOrderId: any = null;
    let returnOrderNumber: string | null = null;

    // Só criar ordem de retorno se for round trip E tiver returnDate
    // Isso garante que só criamos quando realmente necessário
    if (isRoundTrip && args.returnDate) {
      returnOrderNumber = `ET${now}${Math.floor(Math.random() * 1000 + 1000).toString().padStart(3, '0')}`;
      
      returnOrderId = await ctx.db.insert("orders", {
        orderNumber: returnOrderNumber,
        relatedOrderId: outboundOrderId, // Link to outbound order
        partnershipName,
        partnershipId,
        departure: {
          location: args.arrival.location, // Swapped: return starts from arrival
          placeId: args.arrival.placeId ?? undefined,
          lat: args.arrival.lat ?? undefined,
          lng: args.arrival.lng ?? undefined,
        },
        arrival: {
          location: args.departure.location, // Swapped: return ends at departure
          placeId: args.departure.placeId ?? undefined,
          lat: args.departure.lat ?? undefined,
          lng: args.departure.lng ?? undefined,
        },
        stops: undefined, // Return trip typically has no stops
        departureDate: args.returnDate,
        passengers: args.passengers,
        isRoundTrip: true,
        /* A perna de volta é outra linha na base mas a mesma visita: sem isto,
           metade das reservas de ida e volta aparecia sem origem. */
        adSource: args.adSource,
        opprefId: args.opprefId,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });

      // Link outbound order to return order
      await ctx.db.patch(outboundOrderId, {
        relatedOrderId: returnOrderId,
      });
    }

    const outboundOrder = await ctx.db.get(outboundOrderId);
    
    if (!outboundOrder) {
      console.error("[Orders] Failed to retrieve outbound order after insert. orderId:", outboundOrderId);
      throw new Error("Failed to retrieve order after creation");
    }
    
    console.log("[Orders] Orders created successfully:", {
      outboundOrderId: outboundOrder._id,
      outboundOrderNumber: outboundOrder.orderNumber,
      returnOrderId: returnOrderId,
      returnOrderNumber: returnOrderNumber,
      status: outboundOrder.status,
    });
    
    // Retornar ordem de ida como principal (frontend pode precisar do returnOrderId depois)
    return {
      order: {
        id: outboundOrderNumber, // Usar orderNumber como id compatível
        ...outboundOrder,
        returnOrderId: returnOrderId ? returnOrderNumber : undefined, // Include return order number if exists
      },
    };
  },
});

/**
 * Mutation para criar ordem de retorno separadamente
 * Usado quando o usuário seleciona "round trip" no checkout após já ter criado a ordem de ida
 */
export const createReturnOrder = mutation({
  args: {
    outboundOrderId: v.id("orders"),
    departure: v.object({
      location: v.string(),
      placeId: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    }),
    arrival: v.object({
      location: v.string(),
      placeId: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    }),
    departureDate: v.string(),
    passengers: v.number(),
    adults: v.optional(v.number()),
    children: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Verificar se a ordem de ida existe
    const outboundOrder = await ctx.db.get(args.outboundOrderId);
    if (!outboundOrder) {
      throw new Error("Outbound order not found");
    }

    // Verificar se já existe ordem de retorno
    if ((outboundOrder as any).relatedOrderId) {
      throw new Error("Return order already exists for this outbound order");
    }

    // Gerar orderNumber único para a ordem de retorno
    const returnOrderNumber = `ET${now}${Math.floor(Math.random() * 1000 + 1000).toString().padStart(3, '0')}`;
    
    console.log("[Orders] Creating return order for outbound order:", {
      outboundOrderId: args.outboundOrderId,
      outboundOrderNumber: (outboundOrder as any).orderNumber,
      returnOrderNumber,
    });
    
    const outboundPartnershipName = (outboundOrder as { partnershipName?: string }).partnershipName;
    const outboundPartnershipId = (outboundOrder as { partnershipId?: Id<"partnerships"> }).partnershipId;

    // Criar ordem de retorno (mesma parceria/origem que a ordem de ida)
    const returnOrderId = await ctx.db.insert("orders", {
      orderNumber: returnOrderNumber,
      relatedOrderId: args.outboundOrderId, // Link to outbound order
      partnershipName: outboundPartnershipName ?? "Easy Transfer",
      partnershipId: outboundPartnershipId,
      departure: {
        location: args.departure.location,
        placeId: args.departure.placeId ?? undefined,
        lat: args.departure.lat ?? undefined,
        lng: args.departure.lng ?? undefined,
      },
      arrival: {
        location: args.arrival.location,
        placeId: args.arrival.placeId ?? undefined,
        lat: args.arrival.lat ?? undefined,
        lng: args.arrival.lng ?? undefined,
      },
      stops: undefined, // Return trip typically has no stops
      departureDate: args.departureDate,
      passengers: args.passengers ?? (args.adults ?? 0) + (args.children ?? 0),
      adults: args.adults ?? undefined,
      children: args.children ?? undefined,
      isRoundTrip: true,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      });

      // Link outbound order to return order
    await ctx.db.patch(args.outboundOrderId, {
      relatedOrderId: returnOrderId,
      isRoundTrip: true,
      updatedAt: now,
    });

    const returnOrder = await ctx.db.get(returnOrderId);
    
    if (!returnOrder) {
      throw new Error("Failed to retrieve return order after creation");
    }
    
    console.log("[Orders] Return order created successfully:", {
      returnOrderId: returnOrder._id,
      returnOrderNumber: returnOrder.orderNumber,
    });
    
    return {
      order: {
        id: returnOrderNumber,
        ...returnOrder,
      },
    };
  },
});

export const selectCar = mutation({
  args: {
    orderId: v.id("orders"),
    vehicleId: v.id("vehicles"),
    vehicleName: v.string(),
    price: v.number(), 
    passengerCapacity: v.number(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

     await ctx.db.patch(args.orderId, {
      vehicleId: args.vehicleId,
      vehicleName: args.vehicleName,
      basePrice: args.price, // Preço base do veículo
      updatedAt: Date.now(),
    });

    const updatedOrder = await ctx.db.get(args.orderId);
    return { order: updatedOrder };
  },
});

export const registTrip = mutation({
  args: {
    orderId: v.id("orders"),
    flightNumber: v.optional(v.string()),
    departureDate: v.string(),
    arrivalDate: v.optional(v.string()),
    backpacks: v.optional(v.number()),
    handbaggage: v.optional(v.number()),
    checkedBaggage: v.optional(v.number()),
    pets: v.optional(v.number()),
    surfboards: v.optional(v.number()),
    childSeats: v.optional(v.number()),
    babySeats: v.optional(v.number()),
    boosterSeats: v.optional(v.number()),
    passengers: v.number(),
    adults: v.optional(v.number()),
    children: v.optional(v.number()),
    smallPets: v.optional(v.number()),
    largePets: v.optional(v.number()),
    standardSurfboards: v.optional(v.number()),
    largeSurfboards: v.optional(v.number()),
    flightType: v.optional(v.union(v.literal("IDA"), v.literal("VOLTA"))),
    airlineCompany: v.optional(v.string()),
    amadeusFlightInfo: v.optional(amadeusFlightInfoValidator),
    distance: v.optional(v.number()),
    routeDurationMinutes: v.optional(v.number()),
    departure: v.optional(v.object({
      location: v.string(),
      placeId: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    })),
    arrival: v.optional(v.object({
      location: v.string(),
      placeId: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const passengers = args.passengers ?? (args.adults != null && args.children != null ? args.adults + args.children : undefined);
    const updates: any = {
      updatedAt: Date.now(),
    };
    if (passengers !== undefined) updates.passengers = passengers;
    if (args.adults !== undefined) updates.adults = args.adults;
    if (args.children !== undefined) updates.children = args.children;

    // Now each order is separate - IDA or VOLTA determines which order this is
    if (args.flightType === "VOLTA") {
      // Return trip order - update locations (already swapped in init)
      if (args.departure) {
        updates.departure = {
          location: args.departure.location,
          placeId: args.departure.placeId ?? undefined,
          lat: args.departure.lat ?? undefined,
          lng: args.departure.lng ?? undefined,
        };
      }
      if (args.arrival) {
        updates.arrival = {
          location: args.arrival.location,
          placeId: args.arrival.placeId ?? undefined,
          lat: args.arrival.lat ?? undefined,
          lng: args.arrival.lng ?? undefined,
        };
      }

      if (args.departureDate) {
        updates.departureDate = args.departureDate;
      }
      
      // Save return trip luggage/equipment (this is a separate order now)
      updates.backpacks = args.backpacks ?? 0;
      updates.handbaggage = args.handbaggage ?? 0;
      updates.checkedBaggage = args.checkedBaggage ?? 0;
      updates.pets = args.pets ?? 0;
      updates.smallPets = args.smallPets ?? 0;
      updates.largePets = args.largePets ?? 0;
      updates.surfboards = args.surfboards ?? 0;
      updates.standardSurfboards = args.standardSurfboards ?? 0;
      updates.largeSurfboards = args.largeSurfboards ?? 0;
      updates.childSeats = args.childSeats ?? 0;
      updates.babySeats = args.babySeats ?? 0;
      updates.boosterSeats = args.boosterSeats ?? 0;
    } else {
      // Outbound trip order - update locations and save data
      // Update departure/arrival locations if provided
      if (args.departure) {
        updates.departure = {
          location: args.departure.location,
          placeId: args.departure.placeId ?? undefined,
          lat: args.departure.lat ?? undefined,
          lng: args.departure.lng ?? undefined,
        };
      }
      if (args.arrival) {
        updates.arrival = {
          location: args.arrival.location,
          placeId: args.arrival.placeId ?? undefined,
          lat: args.arrival.lat ?? undefined,
          lng: args.arrival.lng ?? undefined,
        };
      }
      
      // Save outbound trip luggage/equipment
      updates.backpacks = args.backpacks ?? 0;
      updates.handbaggage = args.handbaggage ?? 0;
      updates.checkedBaggage = args.checkedBaggage ?? 0;
      updates.pets = args.pets ?? 0;
      updates.smallPets = args.smallPets ?? 0;
      updates.largePets = args.largePets ?? 0;
      updates.surfboards = args.surfboards ?? 0;
      updates.standardSurfboards = args.standardSurfboards ?? 0;
      updates.largeSurfboards = args.largeSurfboards ?? 0;
      updates.childSeats = args.childSeats ?? 0;
      updates.babySeats = args.babySeats ?? 0;
      updates.boosterSeats = args.boosterSeats ?? 0;
    }

    if (args.flightType) updates.flightType = args.flightType;

    const normalizedFlightNumber =
      typeof args.flightNumber === "string" ? args.flightNumber.trim() : "";
    if (normalizedFlightNumber) {
      updates.flightNumber = normalizedFlightNumber;
    }

    if (typeof args.arrivalDate === "string" && args.arrivalDate.trim() !== "") {
      updates.arrivalDate = args.arrivalDate;
    }

    if (
      typeof args.airlineCompany === "string" &&
      args.airlineCompany.trim() !== ""
    ) {
      updates.airlineCompany = args.airlineCompany;
    }

    if (args.amadeusFlightInfo) {
      updates.amadeusFlightInfo = args.amadeusFlightInfo;
    }
    if (args.distance !== undefined) updates.distance = args.distance;
    if (args.routeDurationMinutes !== undefined) {
      updates.routeDurationMinutes = args.routeDurationMinutes;
    }

    await ctx.db.patch(args.orderId, updates);

    const updatedOrder = await ctx.db.get(args.orderId);
    return { order: updatedOrder };
  },
});

export const registContactInformation = mutation({
  args: {
    orderId: v.id("orders"),
    name: v.string(),
    email: v.string(),
    phoneNumber: v.string(),
    nif: v.optional(v.string()),
    bookedForAnotherPerson: v.optional(v.boolean()),
    passengerName: v.optional(v.string()),
    passengerEmail: v.optional(v.string()),
    passengerWhatsapp: v.optional(v.string()),
    passengerRelationship: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("[Orders] registContactInformation - Saving:", {
      orderId: args.orderId,
      name: args.name,
      email: args.email,
      phoneNumber: args.phoneNumber,
      nif: args.nif,
      bookedForAnotherPerson: args.bookedForAnotherPerson,
      passengerName: args.passengerName,
      passengerEmail: args.passengerEmail,
      passengerWhatsapp: args.passengerWhatsapp,
      passengerRelationship: args.passengerRelationship,
    });

    await ctx.db.patch(args.orderId, {
      customerName: args.name,
      customerEmail: args.email,
      customerPhone: args.phoneNumber,
      customerNif: args.nif,
      bookedForAnotherPerson: args.bookedForAnotherPerson,
      passengerName: args.passengerName ?? args.name,
      passengerEmail: args.passengerEmail ?? args.email,
      passengerWhatsapp: args.passengerWhatsapp ?? args.phoneNumber,
      passengerRelationship: args.passengerRelationship,
      updatedAt: Date.now(),
    });

    const order = await ctx.db.get(args.orderId);
    console.log("[Orders] registContactInformation - Saved order:", {
      _id: order?._id,
      customerName: (order as any)?.customerName,
      customerEmail: (order as any)?.customerEmail,
      customerPhone: (order as any)?.customerPhone,
    });
    
    return { order };
  },
});

export const startPayment = internalMutation({
  args: {
    orderId: v.id("orders"),
    method: v.union(
      v.literal("mbway"),
      v.literal("mb"),
      v.literal("ccard"),
      v.literal("cash")
    ),
    amount: v.number(),
    basePrice: v.number(),
    discountAmount: v.number(),
    additionalFees: v.number(),
    nightTax: v.number(),
    airportServiceFee: v.number(),
    cancellationFee: v.number(),
    refundFee: v.number(),
    refundToOriginalPaymentMethod: v.boolean(),
    nif: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    email: v.optional(v.string()),
    driverNotes: v.optional(v.string()),
    selectedCheckoutAddons: v.optional(
      v.array(
        v.object({
          code: v.string(),
          label: v.string(),
          price: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    // Cash payments are automatically marked as paid
    const isCash = args.method === "cash";

    /* O preço é decidido no browser e este mutation grava o que vier. Já
       aconteceu chegar aqui zero de taxa noturna numa partida à meia-noite: o
       cliente viu e pagou o valor sem ela, e ninguém deu por isso.

       Não se corrige o valor aqui — cobrar mais do que o cliente viu seria pior
       do que perder a taxa. Regista-se a divergência, para deixar de ser
       invisível e para se saber se volta a acontecer. */
    const existingOrder: any = await ctx.db.get(args.orderId);
    let pricingWarning: string | undefined;
    if (existingOrder && isNightDeparture(existingOrder.departureDate) && args.nightTax === 0) {
      pricingWarning = `Taxa noturna em falta: partida às ${String(existingOrder.departureDate).slice(11, 16)} e o checkout enviou 0.`;
      console.error(
        `[Pricing] ${pricingWarning} (encomenda ${existingOrder.orderNumber ?? args.orderId})`,
      );
    }

    const updates: any = {
      paymentMethod: args.method,
      paymentStatus: isCash ? "completed" : "pending",
      totalAmount: args.amount,
      basePrice: args.basePrice,
      discountAmount: args.discountAmount,
      additionalFees: args.additionalFees,
      nightTax: args.nightTax,
      ...(pricingWarning ? { pricingWarning } : {}),
      airportServiceFee: args.airportServiceFee,
      cancellationFee: args.cancellationFee,
      refundFee: args.refundFee,
      refundToOriginalPaymentMethod: args.refundToOriginalPaymentMethod,
      status: isCash ? "paid" : "pending",
      updatedAt: Date.now(),
    };

    // Atualizar campos opcionais apenas se fornecidos
    if (args.nif) {
      updates.customerNif = args.nif;
    }
    if (args.phoneNumber) {
      updates.customerPhone = args.phoneNumber;
    }
    if (args.email) {
      updates.customerEmail = args.email;
    }
    if (args.driverNotes !== undefined) {
      updates.driverNotes = args.driverNotes;
    }
    if (args.selectedCheckoutAddons !== undefined) {
      updates.selectedCheckoutAddons = args.selectedCheckoutAddons;
    }

    console.log("[Orders] startPayment - Updating order:", {
      orderId: args.orderId,
      method: args.method,
      phoneNumber: args.phoneNumber,
      email: args.email,
      updates: Object.keys(updates),
      isCash,
    });

    await ctx.db.patch(args.orderId, updates);

    // Get order for orderNumber and related order check
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Cash payments - create transaction record and return immediately (already marked as paid)
    if (isCash) {
      // Create transaction record for cash payment
      await ctx.db.insert("transactions", {
        amount: args.amount,
        bookingId: args.orderId,
        paymentMethod: "cash",
        status: "completed",
        timestamp: Date.now(),
      });

      // If round trip, also create transaction for return order
      const relatedOrderId = (order as any).relatedOrderId;
      if (relatedOrderId) {
        const relatedOrder = await ctx.db.get(relatedOrderId);
        if (relatedOrder) {
          const relatedOrderAmount = (relatedOrder as any).totalAmount || 0;
          await ctx.db.insert("transactions", {
            amount: relatedOrderAmount,
            bookingId: relatedOrderId,
            paymentMethod: "cash",
            status: "completed",
            timestamp: Date.now(),
          });
        }
      }

      // Cash: webhook é enviado pela action startPaymentAction (não agendar aqui para aparecer no mesmo request)
      return { success: true };
    }

    const orderNumber = order.orderNumber || args.orderId;
    const totalAmount = args.amount;

    // For non-cash payments, return order info so frontend can call IfThenPay actions
    // The frontend should then call updateOrderPaymentReferences to store the payment details
    return { 
      success: true, 
      message: "Payment initiated",
      orderId: orderNumber,
      orderConvexId: args.orderId,
      amount: totalAmount,
      method: args.method,
    };
  },
});

export const getById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.orderId);
  },
});

export const getByOrderNumber = query({
  args: { orderNumber: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_order_number", (q) => q.eq("orderNumber", args.orderNumber))
      .unique();
  },
});

const pendingExperienceValidator = v.object({
  productType: v.union(v.literal("tour"), v.literal("experience"), v.literal("event")),
  tourId: v.optional(v.id("tours")),
  eventId: v.optional(v.id("events")),
  upsellStopId: v.optional(v.id("upsellStops")),
  upsellExperienceId: v.optional(v.id("upsellExperiences")),
  tourTitle: v.string(),
  tourSlug: v.string(),
  passengers: v.number(),
  selectedDate: v.string(),
  selectedTime: v.string(),
  basePrice: v.number(),
  pickup: v.optional(
    v.object({
      title: v.string(),
      address: v.string(),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      placeId: v.optional(v.string()),
    }),
  ),
  selectedAddons: v.optional(
    v.array(
      v.object({
        addonId: v.optional(v.id("tourAddons")),
        universalAddonId: v.optional(v.id("universalAddons")),
        title: v.string(),
        price: v.number(),
        pricingType: v.union(v.literal("per_person"), v.literal("flat")),
        quantity: v.number(),
        subtotal: v.number(),
      }),
    ),
  ),
  addonsTotal: v.optional(v.number()),
  specialRequest: v.optional(v.string()),
});

export const setPendingCheckoutExperiences = mutation({
  args: {
    orderId: v.id("orders"),
    experiences: v.array(pendingExperienceValidator),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "draft" && order.status !== "pending") {
      throw new Error("Cannot set pending experiences after payment started");
    }
    await ctx.db.patch(args.orderId, {
      pendingCheckoutExperiences: args.experiences,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const getByTransferOrderId = internalQuery({
  args: { transferOrderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_transfer_order", (q) => q.eq("transferOrderId", args.transferOrderId))
      .collect();
  },
});

/**
 * Query para listar todas as ordens (com opções de filtro e paginação baseada em cursor)
 */
/**
 * Query para buscar apenas pedidos do dia atual (sem paginação)
 * Usado pelo endpoint HTTP protegido
 */
export const getTodayOrders = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Início do dia atual (00:00:00) em UTC
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfDayTimestamp = startOfDay.getTime();
    
    // Fim do dia atual (23:59:59.999) em UTC
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);
    const endOfDayTimestamp = endOfDay.getTime();
    
    const allOrders = await ctx.db.query("orders").collect();
    
    // Filtrar apenas pedidos criados hoje E com status "paid"
    const todayOrders = allOrders.filter((order: any) => {
      const createdAt = order.createdAt || order._creationTime || 0;
      const isToday = createdAt >= startOfDayTimestamp && createdAt <= endOfDayTimestamp;
      const isPaid = order.status === "paid";
      return isToday && isPaid;
    });
    
    // Ordenar por data de criação (mais recentes primeiro)
    const sortedOrders = todayOrders.sort((a: any, b: any) => {
      const aTime = a.createdAt || a._creationTime || 0;
      const bTime = b.createdAt || b._creationTime || 0;
      return bTime - aTime; // Descendente (mais recentes primeiro)
    });
    
    return sortedOrders;
  },
});

export const listOrders = query({
  args: {
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("paid"),
      v.literal("completed"),
      v.literal("cancelled")
    )),
    paymentStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    )),
    onlyPaid: v.optional(v.boolean()), // Filtro rápido para apenas ordens pagas
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()), // Cursor baseado em _id da última ordem
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const effectiveStatus = args.onlyPaid ? "paid" : args.status;
    
    let query = ctx.db.query("orders");
    
    let allOrders: any[] = [];
    if (args.cursor) {
      const cursorOrder = await ctx.db.get(args.cursor as any);
      if (cursorOrder) {
        const cursorTime = cursorOrder._creationTime || 0;
        allOrders = await query.collect();
        allOrders = allOrders.filter((order: any) => (order._creationTime || 0) < cursorTime);
      } else {
        return {
          orders: [],
          total: 0,
          limit: args.limit || 100,
          cursor: null,
          hasMore: false,
        };
      }
    } else {
      allOrders = await query.collect();
    }
    
    // Ordenar por data de criação (mais recentes primeiro) em memória
    const sortedOrders = allOrders.sort((a: any, b: any) => {
      const aTime = a._creationTime || 0;
      const bTime = b._creationTime || 0;
      return bTime - aTime; // Descendente (mais recentes primeiro)
    });
    
    // Aplicar filtros
    let filtered = sortedOrders;
    if (effectiveStatus) {
      filtered = filtered.filter((order: any) => order.status === effectiveStatus);
    }
    if (args.paymentStatus) {
      filtered = filtered.filter((order: any) => order.paymentStatus === args.paymentStatus);
    }
    
    // Aplicar paginação baseada em cursor
    const limit = args.limit || 100;
    const paginated = filtered.slice(0, limit);
    
    // Determinar próximo cursor (último _id da página atual)
    const nextCursor = paginated.length > 0 && paginated.length === limit 
      ? paginated[paginated.length - 1]._id 
      : null;
    const hasMore = nextCursor !== null;
    
    console.log("[Orders] listOrders - Found:", {
      total: allOrders.length,
      filtered: filtered.length,
      paginated: paginated.length,
      status: effectiveStatus,
      paymentStatus: args.paymentStatus,
      onlyPaid: args.onlyPaid,
      cursor: args.cursor,
      nextCursor,
      hasMore,
    });
    
    return {
      orders: paginated,
      total: filtered.length,
      limit,
      cursor: nextCursor,
      hasMore,
    };
  },
});

/**
 * Query para buscar ordens com pagamento MBWay pendente criadas desde um timestamp
 * Usado para polling de status MBWay
 */
export const getPendingMbwayPayments = query({
  args: {
    since: v.number(), // timestamp em milissegundos
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    return await ctx.db
      .query("orders")
      .withIndex("by_payment_status", (q) => q.eq("paymentStatus", "pending"))
      .filter((q) =>
        q.and(
          q.eq(q.field("paymentMethod"), "mbway"),
          q.gte(q.field("createdAt"), args.since),
          q.neq(q.field("paymentRequestId"), undefined)
        )
      )
      .collect();
  },
});

/**
 * Query para monitorar status de uma ordem (substitui WebSocket)
 * Pode ser usada com useQuery do Convex para atualizações em tempo real
 */
export const subscribeToOrderStatus = query({
  args: {
    orderId: v.optional(v.id("orders")),
    orderNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let order = null;

    if (args.orderId) {
      order = await ctx.db.get(args.orderId);
    } else if (args.orderNumber) {
      order = await ctx.db
        .query("orders")
        .withIndex("by_order_number", (q) => q.eq("orderNumber", args.orderNumber!))
        .unique();
    }

    if (!order) {
      return null;
    }

    // Retornar apenas os campos relevantes para status
    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      updatedAt: order.updatedAt,
    };
  },
});

export const startPaymentAction = action({
  args: {
    orderId: v.id("orders"),
    method: v.union(
      v.literal("mbway"),
      v.literal("mb"),
      v.literal("ccard"),
      v.literal("cash")
    ),
    amount: v.number(),
    amountReturn: v.optional(v.number()), // Opcional para compatibilidade com frontend
    basePrice: v.number(),
    basePriceReturn: v.optional(v.number()), // Opcional para compatibilidade com frontend
    discountAmount: v.number(),
    discountAmountReturn: v.optional(v.number()), // Opcional para compatibilidade com frontend
    additionalFees: v.number(),
    additionalFeesReturn: v.optional(v.number()), // Opcional para compatibilidade com frontend
    nightTax: v.number(),
    nightTaxReturn: v.optional(v.number()), // Opcional para compatibilidade com frontend
    airportServiceFee: v.number(),
    cancellationFee: v.number(),
    refundFee: v.number(),
    refundToOriginalPaymentMethod: v.boolean(),
    nif: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    email: v.optional(v.string()),
    driverNotes: v.optional(v.string()),
    selectedCheckoutAddons: v.optional(
      v.array(
        v.object({
          code: v.string(),
          label: v.string(),
          price: v.number(),
        }),
      ),
    ),
    // URLs para cartão de crédito
    successUrl: v.optional(v.string()),
    errorUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    language: v.optional(v.string()),
    // Opções para Multibanco
    expiryDays: v.optional(v.number()),
    description: v.optional(v.string()),
    // Sandbox mode
    useSandbox: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    console.log("[Orders] startPaymentAction ENTRADA — method:", args.method, "typeof:", typeof args.method, "orderId:", args.orderId);
    // 1. Buscar ordem para verificar se é round trip
    const order: any = await ctx.runQuery(api.orders.getById, { orderId: args.orderId });
    if (!order) {
      throw new Error("Order not found");
    }

    const isRoundTrip = !!order.relatedOrderId;
    let returnOrder: any = null;
    let totalAmount = args.amount;
    let totalBasePrice = args.basePrice;

    // 2. Se for round trip, buscar ordem de retorno e somar valores
    if (isRoundTrip && order.relatedOrderId) {
      returnOrder = await ctx.runQuery(api.orders.getById, { orderId: order.relatedOrderId });
      if (returnOrder) {
        // Somar valores de ambas as ordens
        // Se amountReturn não for fornecido, usar o mesmo valor da ida
        const returnAmount = (args as any).amountReturn ?? args.amount;
        totalAmount = args.amount + returnAmount;
        const returnBasePrice = (args as any).basePriceReturn ?? args.basePrice;
        totalBasePrice = args.basePrice + returnBasePrice;
        
        console.log("[Orders] startPaymentAction - Round trip detected:", {
          outboundOrder: order.orderNumber,
          returnOrder: returnOrder.orderNumber,
          outboundAmount: args.amount,
          returnAmount: returnAmount,
          totalAmount: totalAmount,
        });
      }
    }

    // 3. Atualizar ordem de ida com os dados do pagamento
    const paymentUpdates: any = {
      orderId: args.orderId,
      method: args.method,
      amount: args.amount,
      basePrice: args.basePrice,
      discountAmount: args.discountAmount,
      additionalFees: args.additionalFees,
      nightTax: args.nightTax,
      airportServiceFee: args.airportServiceFee,
      cancellationFee: args.cancellationFee,
      refundFee: args.refundFee,
      refundToOriginalPaymentMethod: args.refundToOriginalPaymentMethod,
      nif: args.nif,
      phoneNumber: args.phoneNumber,
      email: args.email,
      driverNotes: args.driverNotes,
      selectedCheckoutAddons: args.selectedCheckoutAddons,
    };

    console.log("[Orders] startPaymentAction - Updating outbound order with:", {
      orderId: args.orderId,
      method: args.method,
      phoneNumber: args.phoneNumber,
      email: args.email,
    });

    await ctx.runMutation(internal.orders.startPayment, paymentUpdates);

    // 4. Se for round trip, também atualizar ordem de retorno
    if (isRoundTrip && returnOrder) {
      // Usar valores de retorno se fornecidos, senão usar os mesmos valores da ida
      const returnArgs = args as any;
      const returnPaymentUpdates: any = {
        orderId: order.relatedOrderId,
        method: args.method,
        amount: returnArgs.amountReturn ?? args.amount,
        basePrice: returnArgs.basePriceReturn ?? args.basePrice,
        discountAmount: returnArgs.discountAmountReturn ?? args.discountAmount,
        additionalFees: returnArgs.additionalFeesReturn ?? args.additionalFees,
        nightTax: returnArgs.nightTaxReturn ?? args.nightTax,
        airportServiceFee: 0,
        cancellationFee: 0,
        refundFee: 0,
        refundToOriginalPaymentMethod: args.refundToOriginalPaymentMethod,
        nif: args.nif,
        phoneNumber: args.phoneNumber,
        email: args.email,
        driverNotes: args.driverNotes,
        selectedCheckoutAddons: args.selectedCheckoutAddons,
      };

      await ctx.runMutation(internal.orders.startPayment, returnPaymentUpdates);
    }

    const isCash = args.method === "cash" || (typeof args.method === "string" && args.method.toLowerCase() === "cash");
    console.log("[Orders] ANTES CASH BLOCK — method:", args.method, "isCash:", isCash);
    // 5. Se for cash: enviar webhook INLINE nesta action (sem chamar outra função — garante que o POST corre aqui)
    if (isCash) {
      console.log("[Orders] DENTRO DO BLOCO CASH — A ENVIAR WEBHOOK (orderId ida):", args.orderId);
      const outboundOrder = await ctx.runQuery(api.orders.getById, { orderId: args.orderId });
      if (!outboundOrder) {
        console.warn("[Orders] ENVIO WEBHOOK — Order not found:", args.orderId);
        return { success: true };
      }
      const ordersList: typeof outboundOrder[] = [outboundOrder];
      if (outboundOrder.relatedOrderId) {
        const returnOrd = await ctx.runQuery(api.orders.getById, { orderId: outboundOrder.relatedOrderId });
        if (returnOrd) ordersList.push(returnOrd);
      }
      const tourOrds = await ctx.runQuery(internal.orders.getByTransferOrderId, { transferOrderId: args.orderId });
      for (const o of tourOrds) ordersList.push(o);
      const body = JSON.stringify({ orders: ordersList });
      console.log("[Orders] ENVIO WEBHOOK — POST para:", ORDER_WEBHOOK_URL, "| orders:", ordersList.length);
      try {
        const res = await fetch(ORDER_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (res.ok) {
          console.log("[Orders] ENVIO WEBHOOK — Payload enviado com sucesso.", res.status, res.statusText);
        } else {
          console.warn("[Orders] ENVIO WEBHOOK — POST failed:", res.status, res.statusText, await res.text());
        }
      } catch (e) {
        console.warn("[Orders] ENVIO WEBHOOK — POST error:", e);
      }
      return { success: true };
    }

    // 6. Stripe Checkout — uma única sessão hosted para o TOTAL da reserva.
    const orderNumber: string = order.orderNumber || args.orderId;

    if (args.method !== "mb" && args.method !== "mbway" && args.method !== "ccard") {
      throw new Error(`Unsupported payment method: ${args.method}`);
    }
    // Todos os métodos Stripe são redirect → precisamos do success + cancel URL.
    if (!args.successUrl || !args.cancelUrl) {
      throw new Error("successUrl and cancelUrl are required for Stripe payment");
    }

    try {
      const result: any = await ctx.runAction(internal.stripe.createCheckoutSession, {
        kind: "transfer",
        // Sem método específico → o Stripe mostra cartão + MB WAY + Multibanco na página dele.
        orderNumber,
        orderId: args.orderId,
        // Total da reserva (ida + volta). O IfThenPay só cobrava a ida no cartão — corrigido.
        amount: totalAmount,
        description: args.description ?? `Easy Transfer ${orderNumber}`,
        email: args.email,
        language: args.language,
        successUrl: args.successUrl,
        cancelUrl: args.errorUrl ?? args.cancelUrl,
      });

      // Guardar a referência Stripe (paridade com paymentRequestId + reconciliação).
      // O webhook faz o match pelo orderNumber no metadata, por isso isto é só informativo.
      await ctx.runMutation(internal.orders.updatePaymentReferences, {
        orderId: args.orderId,
        paymentEntity: undefined,
        paymentReference: undefined,
        paymentRequestId: result.paymentIntentId ?? result.sessionId,
      });

      return {
        success: true,
        method: args.method,
        checkoutUrl: result.checkoutUrl,
        sessionId: result.sessionId,
      };
    } catch (error: any) {
      // Se a criação da sessão falhar, marcar como failed.
      await ctx.runMutation(internal.orders.updatePaymentStatus, {
        orderId: args.orderId,
        paymentStatus: "failed",
      });
      throw error;
    }
  },
});

/* checkMbwayOrderStatus removido na migração para Stripe — o estado MB Way passa a ser
   confirmado pelo webhook assinado do Stripe (checkout.session.async_payment_succeeded /
   _failed), sem polling. */

/**
 * Mutation para atualizar referências de pagamento na ordem
 */
export const updatePaymentReferences = internalMutation({
  args: {
    orderId: v.id("orders"),
    paymentEntity: v.optional(v.string()),
    paymentReference: v.optional(v.string()),
    paymentRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      updatedAt: Date.now(),
    };

    if (args.paymentEntity !== undefined) updates.paymentEntity = args.paymentEntity;
    if (args.paymentReference !== undefined) updates.paymentReference = args.paymentReference;
    if (args.paymentRequestId !== undefined) updates.paymentRequestId = args.paymentRequestId;

    await ctx.db.patch(args.orderId, updates);

    const order = await ctx.db.get(args.orderId);
    return { order };
  },
});

/**
 * Mutation helper para atualizar status de pagamento
 */
export const updatePaymentStatus = internalMutation({
  args: {
    orderId: v.id("orders"),
    paymentStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, {
      paymentStatus: args.paymentStatus,
      updatedAt: Date.now(),
    });

    if (args.paymentStatus === "failed") {
      ctx.scheduler.runAfter(0, internal.webhooks.sendLeadPayloadFromOrder, {
        orderId: args.orderId,
      });
    }

    const order = await ctx.db.get(args.orderId);
    return { order };
  },
});

/* ─────────────────────────────────────────────────────────────────────────
   Admin /admin/orders — paginated listing + status management
   ───────────────────────────────────────────────────────────────────────── */

/** Server-paginated orders list for the admin DataTable (newest first). */
export const listPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    await exigirAdmin(ctx);
    // Newest first by default — most recent orders are what the admin acts on.
    const all = await ctx.db.query("orders").order("desc").collect();

    let rows = all.map((o) => ({
      ...o,
      adSourceName: o.adSource?.utmSource?.trim().toLowerCase() || "",
      routeLabel: `${o.departure?.location ?? "—"} → ${o.arrival?.location ?? "—"}`,
    }));

    // Keep every source available, regardless of the current page or filters.
    const adSourceOptions = [...new Set(rows.map((r) => r.adSourceName))]
      .filter(Boolean)
      .sort()
      .map((source) => ({ value: `source:${source}`, label: source }));
    adSourceOptions.push({ value: "unknown", label: "Origem desconhecida" });

    rows = applySearch(rows, a.search, [
      (r) => r.orderNumber,
      (r) => r.customerName,
      (r) => r.customerEmail,
      (r) => r.customerPhone,
      (r) => r.partnershipName,
    ]);

    const status = a.filters?.status;
    if (status) rows = rows.filter((r) => r.status === status);
    const paymentStatus = a.filters?.paymentStatus;
    if (paymentStatus) rows = rows.filter((r) => r.paymentStatus === paymentStatus);
    const method = a.filters?.method;
    if (method) rows = rows.filter((r) => r.paymentMethod === method);
    const adSource = a.filters?.adSource;
    if (adSource) {
      rows = rows.filter((r) =>
        adSource === "unknown"
          ? !r.adSourceName
          : `source:${r.adSourceName}` === adSource,
      );
    }

    rows = applySort(rows, a.sortBy, a.sortDir, {
      order: (r) => r.orderNumber ?? "",
      customer: (r) => (r.customerName ?? "").toLowerCase(),
      adSource: (r) => r.adSourceName,
      date: (r) => r.departureDate ?? "",
      total: (r) => r.totalAmount ?? 0,
      created: (r) => r.createdAt,
    });

    return { ...paginate(rows, a.page, a.pageSize), adSourceOptions };
  },
});

const ADMIN_ORDER_STATUS = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("confirmed"),
  v.literal("paid"),
  v.literal("completed"),
  v.literal("cancelled"),
);

/** Plain status patch with no payment side-effects. Internal — only the admin action calls it. */
export const adminSetStatus = internalMutation({
  args: { orderId: v.id("orders"), status: ADMIN_ORDER_STATUS },
  handler: async (ctx, { orderId, status }) => {
    await ctx.db.patch(orderId, { status, updatedAt: Date.now() });
  },
});

/**
 * Admin: change an order's status from the back-office.
 *
 * Marking it "paid" routes through the SAME completion chain a real payment fires
 * (internal.payments.updatePaymentStatus → completed): it sets status=paid +
 * paymentStatus=completed, writes a `transactions` row, cascades to the round-trip
 * leg, materialises any pending upsell experiences, and then POSTs the order webhook
 * (driver dispatch / confirmation live downstream of that webhook). Orders that are
 * already paid are NOT re-fired, so there's no duplicate transaction/webhook. Every
 * other status is a plain patch.
 */
export const adminUpdateOrderStatus = action({
  args: { orderId: v.id("orders"), status: ADMIN_ORDER_STATUS },
  handler: async (
    ctx,
    { orderId, status },
  ): Promise<{ success: boolean; triggered: boolean }> => {
    await exigirAdmin(ctx);
    const order = await ctx.runQuery(api.orders.getById, { orderId });
    if (!order) throw new Error("Order not found");

    const alreadyPaid = order.paymentStatus === "completed";
    if (status === "paid" && !alreadyPaid) {
      await ctx.runMutation(internal.payments.updatePaymentStatus, {
        orderId,
        orderNumber: order.orderNumber ?? undefined,
        paymentStatus: "completed",
      });
      await ctx.runAction(internal.webhooks.sendOrderPayload, { orderId });
      return { success: true, triggered: true };
    }

    await ctx.runMutation(internal.orders.adminSetStatus, { orderId, status });
    return { success: true, triggered: false };
  },
});

/**
 * Migration: Remove deprecated "Return" fields from orders
 * This mutation removes fields that are no longer in the schema by replacing
 * the document with only valid fields.
 * 
 * Deprecated fields removed:
 * - basePriceReturn, discountAmountReturn, additionalFeesReturn, nightTaxReturn
 * - totalAmountReturn, backpacksReturn, handbaggageReturn, checkedBaggageReturn
 * - petsReturn, surfboardsReturn, childSeatsReturn, babySeatsReturn, boosterSeatsReturn
 * - outboundDistance, returnDistance (replaced by single "distance" field)
 * 
 * Run this once to clean up existing orders.
 */
export const cleanupDeprecatedFields = internalMutation({
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const orderAny = order as any;
    const deprecatedFields: string[] = [
      "basePriceReturn",
      "discountAmountReturn",
      "additionalFeesReturn",
      "nightTaxReturn",
      "totalAmountReturn",
      "backpacksReturn",
      "handbaggageReturn",
      "checkedBaggageReturn",
      "petsReturn",
      "surfboardsReturn",
      "childSeatsReturn",
      "babySeatsReturn",
      "boosterSeatsReturn",
      "outboundDistance",
      "returnDistance",
    ];

    // Check if order has deprecated fields
    const hasDeprecatedFields = deprecatedFields.some(field => field in orderAny);
    const foundFields = deprecatedFields.filter(f => f in orderAny);
    
    if (hasDeprecatedFields) {
      // Handle distance: if outboundDistance or returnDistance exists, use the first available
      let distance = orderAny.distance;
      if (!distance) {
        distance = orderAny.outboundDistance ?? orderAny.returnDistance ?? undefined;
      }

      // Create a clean order object with only valid fields
      const cleanOrder: any = {
        orderNumber: orderAny.orderNumber,
        relatedOrderId: orderAny.relatedOrderId,
        status: orderAny.status,
        departure: orderAny.departure,
        arrival: orderAny.arrival,
        stops: orderAny.stops,
        departureDate: orderAny.departureDate,
        arrivalDate: orderAny.arrivalDate,
        passengers: orderAny.passengers,
        adults: orderAny.adults,
        children: orderAny.children,
        isRoundTrip: orderAny.isRoundTrip,
        vehicleId: orderAny.vehicleId,
        vehicleName: orderAny.vehicleName,
        flightNumber: orderAny.flightNumber,
        airlineCompany: orderAny.airlineCompany,
        amadeusFlightInfo: orderAny.amadeusFlightInfo,
        flightType: orderAny.flightType,
        backpacks: orderAny.backpacks,
        handbaggage: orderAny.handbaggage,
        checkedBaggage: orderAny.checkedBaggage,
        pets: orderAny.pets,
        smallPets: orderAny.smallPets,
        largePets: orderAny.largePets,
        surfboards: orderAny.surfboards,
        standardSurfboards: orderAny.standardSurfboards,
        largeSurfboards: orderAny.largeSurfboards,
        childSeats: orderAny.childSeats,
        babySeats: orderAny.babySeats,
        boosterSeats: orderAny.boosterSeats,
        basePrice: orderAny.basePrice,
        discountAmount: orderAny.discountAmount,
        additionalFees: orderAny.additionalFees,
        nightTax: orderAny.nightTax,
        airportServiceFee: orderAny.airportServiceFee,
        cancellationFee: orderAny.cancellationFee,
        refundFee: orderAny.refundFee,
        totalAmount: orderAny.totalAmount,
        distance: distance,
        routeDurationMinutes: orderAny.routeDurationMinutes,
        customerName: orderAny.customerName,
        customerEmail: orderAny.customerEmail,
        customerPhone: orderAny.customerPhone,
        customerNif: orderAny.customerNif,
        bookedForAnotherPerson: orderAny.bookedForAnotherPerson,
        passengerName: orderAny.passengerName,
        passengerEmail: orderAny.passengerEmail,
        passengerWhatsapp: orderAny.passengerWhatsapp,
        passengerRelationship: orderAny.passengerRelationship,
        paymentMethod: orderAny.paymentMethod,
        paymentStatus: orderAny.paymentStatus,
        refundToOriginalPaymentMethod: orderAny.refundToOriginalPaymentMethod,
        paymentEntity: orderAny.paymentEntity,
        paymentReference: orderAny.paymentReference,
        paymentRequestId: orderAny.paymentRequestId,
        paymentAmount: orderAny.paymentAmount,
        driverNotes: orderAny.driverNotes,
        selectedCheckoutAddons: orderAny.selectedCheckoutAddons,
        selectedAddons: orderAny.selectedAddons,
        addonsTotal: orderAny.addonsTotal,
        tourBookingId: orderAny.tourBookingId,
        transferOrderId: orderAny.transferOrderId,
        pendingCheckoutExperiences: orderAny.pendingCheckoutExperiences,
        partnershipName: orderAny.partnershipName,
        createdAt: orderAny.createdAt,
        updatedAt: Date.now(),
      };

      // Replace the document with clean version
      await ctx.db.replace(args.orderId, cleanOrder);
      
      console.log(`[Migration] Cleaned order ${args.orderId}, removed fields:`, foundFields);
    }

    return { 
      orderId: args.orderId,
      hadDeprecatedFields: hasDeprecatedFields,
      deprecatedFieldsFound: foundFields,
    };
  },
});

/**
 * Query to get all order IDs (for migration)
 */
export const getAllOrderIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"orders">>> => {
    const orders = await ctx.db.query("orders").collect();
    return orders.map(order => order._id);
  },
});

/**
 * Action to clean up all orders with deprecated fields
 * This can be run once to migrate all existing orders
 */
export const cleanupAllDeprecatedFields = action({
  args: {},
  handler: async (ctx): Promise<{
    total: number;
    processed: number;
    results: Array<{
      orderId: Id<"orders">;
      hadDeprecatedFields?: boolean;
      deprecatedFieldsFound?: string[];
      error?: string;
    }>;
  }> => {
    await exigirAdmin(ctx);
    // Get all order IDs
    const orderIds: Array<Id<"orders">> = await ctx.runQuery(internal.orders.getAllOrderIds);
    
    const results: Array<{
      orderId: Id<"orders">;
      hadDeprecatedFields?: boolean;
      deprecatedFieldsFound?: string[];
      error?: string;
    }> = [];
    
    for (const orderId of orderIds) {
      try {
        const result: {
          orderId: Id<"orders">;
          hadDeprecatedFields: boolean;
          deprecatedFieldsFound: string[];
        } = await ctx.runMutation(internal.orders.cleanupDeprecatedFields, {
          orderId,
        });
        results.push(result);
      } catch (error: any) {
        console.error(`Failed to cleanup order ${orderId}:`, error);
        results.push({ orderId, error: error.message });
      }
    }
    
    return {
      total: orderIds.length,
      processed: results.length,
      results,
    };
  },
});
