import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { constructStripeEvent, getUsedMethod } from "./stripe";

const http = httpRouter();

// Rota para webhook de pagamento
http.route({
  path: "/payments/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verificar método HTTP
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      // Validar header de autorização do webhook
      const authHeader = request.headers.get("authorization");
      const expectedAuth = process.env.INTEGRATION_WEBHOOK_HEADER_AUHTORIZATION;
      
      if (expectedAuth && authHeader !== expectedAuth) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const body = await request.json();
      
      const {
        orderId,
        orderNumber,
        paymentStatus,
        paymentMethod,
        transactionId,
        amount,
        metadata,
      } = body;

      const ref = (orderNumber ?? orderId) as string | undefined;
      const isTourBooking = typeof ref === "string" && ref.startsWith("TB");
      const validStatus = ["pending", "processing", "completed", "failed"].includes(paymentStatus)
        ? (paymentStatus as "pending" | "processing" | "completed" | "failed")
        : null;

      if (ref) {
        if (isTourBooking) {
          if (validStatus) {
            await ctx.runAction(internal.tourBookings.completeTourBookingPayment, {
              bookingNumber: ref,
              paymentStatus: validStatus,
            });
          }
        } else {
          const result = await ctx.runMutation(internal.payments.updatePaymentStatus, {
            orderId: orderId ? (orderId as string) : undefined,
            orderNumber: orderNumber as string | undefined,
            paymentStatus: (validStatus ?? "completed") as "pending" | "processing" | "completed" | "failed",
            transactionId: transactionId as string | undefined,
            amount: amount as number | undefined,
            metadata: metadata as any,
          });
          if (result?.orderId) {
            await ctx.runAction(internal.webhooks.sendOrderPayload, { orderId: result.orderId });
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response(
        JSON.stringify({ error: "Webhook processing failed" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// Rota para testar webhook (desenvolvimento)
http.route({
  path: "/payments/test",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

      // Simular webhook de pagamento bem-sucedido
      const result = await ctx.runMutation(internal.payments.updatePaymentStatus, {
        orderId: orderId,
        paymentStatus: "completed",
        amount: undefined,
      });
      if (result?.orderId) {
        await ctx.runAction(internal.webhooks.sendOrderPayload, { orderId: result.orderId });
      }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Rota para buscar informações de voo (equivalente ao /flights/select do backend Java)
http.route({
  path: "/flights/select",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const body = await request.json();
      const { flightNumber, departureDate } = body;

      if (!flightNumber || !departureDate) {
        return new Response(
          JSON.stringify({ error: "flightNumber and departureDate are required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Chamar a action de lookup de voo
      // Nota: api.flights será gerado automaticamente pelo Convex quando o código for deployado
      // Usamos type assertion para evitar erro de TypeScript durante desenvolvimento
      const flightsApi = api as any;
      const result = await ctx.runAction(flightsApi.flights.lookupFlightAction, {
        flightNumber,
        departureDate,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Flight lookup error:", error);
      return new Response(
        JSON.stringify({ 
          error: error.message || "Failed to lookup flight",
          message: error.message || "Unexpected server error"
        }),
        {
          status: error.message?.includes("not found") ? 404 : 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// ===================== Stripe Webhook =====================

/**
 * Single signed Stripe webhook (replaces the 3 IfThenPay GET callbacks). Verifies the
 * signature (Web Crypto — see stripe.ts), maps the event to our payment status and reuses
 * the EXISTING completion chain:
 *  - checkout.session.completed (payment_status "paid")  → completed  [cards, immediate]
 *  - checkout.session.async_payment_succeeded             → completed  [MB WAY / Multibanco]
 *  - checkout.session.async_payment_failed / expired      → failed
 * The order is matched by orderNumber from the session metadata — exact, no truncation
 * (which is what previously left orders stuck "pending").
 */
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[Stripe] STRIPE_WEBHOOK_SECRET not configured");
      return new Response("not configured", { status: 500 });
    }

    const payload = await request.text();
    const sig = request.headers.get("stripe-signature");

    let event: any;
    try {
      event = await constructStripeEvent(payload, sig, secret);
    } catch (err: any) {
      console.error("[Stripe] Webhook signature verification failed:", err?.message);
      return new Response("invalid signature", { status: 400 });
    }

    const type: string = event.type;
    const session: any = event.data?.object ?? {};
    const meta: any = session.metadata ?? {};
    const orderNumber: string | undefined = meta.orderNumber;
    const kind: string | undefined = meta.kind;

    let paymentStatus: "completed" | "failed" | null = null;
    if (type === "checkout.session.completed") {
      // Cards complete here ("paid"); async methods land here "unpaid" → still pending.
      paymentStatus = session.payment_status === "paid" ? "completed" : null;
    } else if (type === "checkout.session.async_payment_succeeded") {
      paymentStatus = "completed";
    } else if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") {
      paymentStatus = "failed";
    }

    // Nothing actionable (or async still pending) — ack so Stripe doesn't retry.
    if (!paymentStatus) return new Response("ignored", { status: 200 });
    if (!orderNumber) {
      console.error("[Stripe] Webhook event without orderNumber metadata:", type, session.id);
      return new Response("ignored: no orderNumber", { status: 200 });
    }

    const paymentIntentId: string | undefined =
      typeof session.payment_intent === "string" ? session.payment_intent : undefined;
    const amountEur: number | undefined =
      typeof session.amount_total === "number" ? session.amount_total / 100 : undefined;

    try {
      if (kind === "tour" || orderNumber.startsWith("TB")) {
        await ctx.runAction(internal.tourBookings.completeTourBookingPayment, {
          bookingNumber: orderNumber,
          paymentStatus,
        });
      } else {
        // On success, learn which method the customer actually used on Stripe and record it.
        const usedMethod =
          paymentStatus === "completed" && paymentIntentId
            ? await getUsedMethod(paymentIntentId)
            : undefined;
        const result = await ctx.runMutation(internal.payments.updatePaymentStatus, {
          orderNumber,
          paymentStatus,
          requestId: paymentIntentId,
          amount: amountEur,
          paymentMethod: usedMethod,
        });
        if (paymentStatus === "completed" && result?.orderId) {
          await ctx.runAction(internal.webhooks.sendOrderPayload, { orderId: result.orderId });
        }
      }
    } catch (err: any) {
      // Log loudly for manual reconciliation; still 200 so Stripe stops retrying.
      console.error(
        `[Stripe] Failed to apply '${paymentStatus}' for order ${orderNumber} (${type}):`,
        err?.message,
      );
      return new Response("ignored: order not applied", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  }),
});

// ===================== Orders HTTP Endpoints (Compatibilidade) =====================

/**
 * Helper para converter Id do Convex para formato compatível com backend antigo
 */
function formatObservationLine(label: string, value: string | number): string {
  const normalizedValue = typeof value === "number" ? String(value) : value;
  return `"${label}": ${JSON.stringify(`${normalizedValue} ${label}`)}`;
}

function formatSelectedExperiences(experiences: any[] | undefined): string {
  if (!Array.isArray(experiences) || experiences.length === 0) {
    return "none";
  }

  return experiences
    .map((experience) => {
      const title = experience?.tourTitle || "unknown";
      const productType = experience?.productType || "experience";
      const passengers = experience?.passengers ?? 0;
      const date = experience?.selectedDate || "unknown date";
      const time = experience?.selectedTime || "unknown time";
      return `${title} (${productType}) x${passengers} on ${date} ${time}`;
    })
    .join("; ");
}

function hasCheckoutAddon(order: any, code: string): boolean {
  return Array.isArray(order?.selectedCheckoutAddons)
    ? order.selectedCheckoutAddons.some((addon: any) => addon?.code === code)
    : false;
}

function buildOrderObservations(order: any): string {
  const lines = [
    formatObservationLine("backpacks", order?.backpacks ?? 0),
    formatObservationLine("hand baggage", order?.handbaggage ?? 0),
    formatObservationLine("checked baggage", order?.checkedBaggage ?? 0),
    formatObservationLine("baby seats", order?.babySeats ?? 0),
    formatObservationLine("child seats", order?.childSeats ?? 0),
    formatObservationLine("booster seats", order?.boosterSeats ?? 0),
    formatObservationLine("standard surfboards", order?.standardSurfboards ?? 0),
    formatObservationLine("large surfboards", order?.largeSurfboards ?? 0),
    formatObservationLine("small pets", order?.smallPets ?? 0),
    formatObservationLine("large pets", order?.largePets ?? 0),
    formatObservationLine(
      "selected experience",
      formatSelectedExperiences(order?.pendingCheckoutExperiences)
    ),
    formatObservationLine("nif / vat", order?.customerNif || "n/a"),
    formatObservationLine(
      "booked for another person",
      order?.bookedForAnotherPerson ? "yes" : "no"
    ),
    formatObservationLine("passenger name", order?.passengerName || "n/a"),
    formatObservationLine("passenger email", order?.passengerEmail || "n/a"),
    formatObservationLine("passenger whatsapp", order?.passengerWhatsapp || "n/a"),
    formatObservationLine(
      "passenger relationship",
      order?.passengerRelationship || "n/a"
    ),
    formatObservationLine(
      "route km",
      typeof order?.distance === "number" ? order.distance : "n/a"
    ),
    formatObservationLine(
      "route estimated minutes",
      typeof order?.routeDurationMinutes === "number"
        ? order.routeDurationMinutes
        : "n/a"
    ),
    formatObservationLine("credit card", order?.paymentMethod === "ccard" ? "yes" : "no"),
    formatObservationLine("cash", order?.paymentMethod === "cash" ? "yes" : "no"),
    formatObservationLine("mbway", order?.paymentMethod === "mbway" ? "yes" : "no"),
    formatObservationLine("multibanco", order?.paymentMethod === "mb" ? "yes" : "no"),
    formatObservationLine(
      "comfort travel pack",
      hasCheckoutAddon(order, "comfortConnection") ? "yes" : "no"
    ),
    formatObservationLine("driver notes", order?.driverNotes || "n/a"),
  ];

  return lines.join("\n");
}

function convertOrderToBackendFormat(order: any): any {
  if (!order) return null;
  
  // Usar orderNumber como id para compatibilidade (frontend espera string/number)
  // Se não tiver orderNumber, usar _id como fallback
  const orderId = order.orderNumber || order._id;
  
  return {
    id: orderId,
    outboundCarTrip: order.distance ? { distance: order.distance } : null,
    returnCarTrip: null, // Return trips are separate orders now
    price: order.totalAmount || order.basePrice || null,
    passengers: order.passengers ?? null,
    adults: order.adults ?? null,
    children: order.children ?? null,
    routeDurationMinutes: order.routeDurationMinutes ?? null,
    flightNumber: order.flightNumber ?? null,
    airlineCompany: order.airlineCompany ?? null,
    arrivalDate: order.arrivalDate ?? null,
    amadeusFlightInfo: order.amadeusFlightInfo ?? null,
    bookedForAnotherPerson: order.bookedForAnotherPerson ?? null,
    passengerName: order.passengerName ?? null,
    passengerEmail: order.passengerEmail ?? null,
    passengerWhatsapp: order.passengerWhatsapp ?? null,
    passengerRelationship: order.passengerRelationship ?? null,
    smallPets: order.smallPets ?? null,
    largePets: order.largePets ?? null,
    standardSurfboards: order.standardSurfboards ?? null,
    largeSurfboards: order.largeSurfboards ?? null,
    driverNotes: order.driverNotes ?? null,
    selectedCheckoutAddons: order.selectedCheckoutAddons ?? null,
    pendingCheckoutExperiences: order.pendingCheckoutExperiences ?? null,
    observations: buildOrderObservations(order),
  };
}

http.route({
  path: "/orders",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      // Verificar autenticação via secret
      const url = new URL(request.url);
      const secret = url.searchParams.get("secret") || request.headers.get("x-api-secret");
      const expectedSecret = process.env.ORDERS_API_SECRET;
      
      if (!expectedSecret) {
        console.error("[HTTP] GET /orders - ORDERS_API_SECRET not configured");
        return new Response(
          JSON.stringify({ error: "Server configuration error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      
      if (!secret || secret !== expectedSecret) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      
      // Buscar apenas pedidos do dia atual (sem paginação)
      const orders = await ctx.runQuery(internal.orders.getTodayOrders, {});

      console.log("[HTTP] GET /orders - Today's orders:", { 
        count: orders.length,
      });

      const ordersWithObservations = orders.map((order) => ({
        ...order,
        observations: buildOrderObservations(order),
      }));

      return new Response(JSON.stringify({ orders: ordersWithObservations }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("[HTTP] GET /orders - Error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to list orders" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// POST /orders/init
http.route({
  path: "/orders/init",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      console.log("[HTTP] POST /orders/init - Request body:", JSON.stringify(body, null, 2));
      
      const result = await ctx.runMutation(api.orders.init, {
        departure: {
          location: body.departure.location,
          placeId: body.departure.placeId ?? undefined,
          lat: body.departure.lat ?? undefined,
          lng: body.departure.lng ?? undefined,
        },
        arrival: {
          location: body.arrival.location,
          placeId: body.arrival.placeId ?? undefined,
          lat: body.arrival.lat ?? undefined,
          lng: body.arrival.lng ?? undefined,
        },
        stops: body.stops?.map((s: any) => ({
          location: s.location,
          placeId: s.placeId ?? undefined,
          lat: s.lat ?? undefined,
          lng: s.lng ?? undefined,
        })),
        passengers: body.passengers ?? (body.adults ?? 0) + (body.children ?? 0),
        adults: body.adults ?? undefined,
        children: body.children ?? undefined,
        departureDate: body.departureDate,
        isRoundTrip: body.isRoundTrip,
        returnDate: body.returnDate,
      });

      console.log("[HTTP] POST /orders/init - Success:", JSON.stringify(result, null, 2));
      return new Response(JSON.stringify({ order: convertOrderToBackendFormat(result.order) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("[HTTP] POST /orders/init - Error:", error);
      console.error("[HTTP] POST /orders/init - Error stack:", error.stack);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to init order" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// POST /orders/{orderId}/selectCar
http.route({
  path: "/orders/:orderId/selectCar",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const orderId = request.url.split("/orders/")[1]?.split("/selectCar")[0];
      if (!orderId) {
        return new Response(JSON.stringify({ error: "orderId required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const body = await request.json();
      
      // Converter orderId string para Id se necessário
      const convexOrderId = orderId.startsWith("j") ? (orderId as any) : undefined;
      
      if (!convexOrderId) {
        // Tentar buscar por orderNumber
        const order = await ctx.runQuery(api.orders.getByOrderNumber, { orderNumber: orderId });
        if (!order) {
          return new Response(JSON.stringify({ error: "Order not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        const result = await ctx.runMutation(api.orders.selectCar, {
          orderId: order._id,
          vehicleId: body.carId as any,
          vehicleName: body.type,
          price: body.price,
          passengerCapacity: body.passengerCapacity,
        });

        return new Response(JSON.stringify(convertOrderToBackendFormat(result.order)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const result = await ctx.runMutation(api.orders.selectCar, {
        orderId: convexOrderId,
        vehicleId: body.carId as any,
        vehicleName: body.type,
        price: body.price,
        passengerCapacity: body.passengerCapacity,
      });

      return new Response(JSON.stringify({ order: convertOrderToBackendFormat(result.order) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Select car error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to select car" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// POST /orders/{orderId}/registTrip
http.route({
  path: "/orders/:orderId/registTrip",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const orderId = request.url.split("/orders/")[1]?.split("/registTrip")[0];
      if (!orderId) {
        return new Response(JSON.stringify({ error: "orderId required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const body = await request.json();
      
      // Tentar buscar ordem por orderNumber ou usar como ID
      let convexOrderId: any = orderId.startsWith("j") ? orderId : undefined;
      
      if (!convexOrderId) {
        const order = await ctx.runQuery(api.orders.getByOrderNumber, { orderNumber: orderId });
        if (order) {
          convexOrderId = order._id;
        } else {
          return new Response(JSON.stringify({ error: "Order not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      const result = await ctx.runMutation(api.orders.registTrip, {
        orderId: convexOrderId,
        flightNumber: body.flightNumber,
        departureDate: body.departureDate,
        arrivalDate: body.arrivalDate ?? undefined,
        backpacks: body.backpacks ?? undefined,
        handbaggage: body.handbaggage ?? undefined,
        checkedBaggage: body.checkedBaggage ?? undefined,
        pets: body.pets ?? undefined,
        smallPets: body.smallPets ?? undefined,
        largePets: body.largePets ?? undefined,
        surfboards: body.surfboards ?? undefined,
        standardSurfboards: body.standardSurfboards ?? undefined,
        largeSurfboards: body.largeSurfboards ?? undefined,
        childSeats: body.childSeats ?? undefined,
        babySeats: body.babySeats ?? undefined,
        boosterSeats: body.boosterSeats ?? undefined,
        passengers: body.passengers ?? (body.adults ?? 0) + (body.children ?? 0),
        adults: body.adults ?? undefined,
        children: body.children ?? undefined,
        flightType: body.flightType ?? undefined,
        airlineCompany: body.airlineCompany ?? undefined,
        amadeusFlightInfo: body.amadeusFlightInfo ?? undefined,
        distance: body.distance ?? undefined,
        routeDurationMinutes: body.routeDurationMinutes ?? undefined,
        departure: body.departure ? {
          location: body.departure.location,
          placeId: body.departure.placeId ?? undefined,
          lat: body.departure.lat ?? undefined,
          lng: body.departure.lng ?? undefined,
        } : undefined,
        arrival: body.arrival ? {
          location: body.arrival.location,
          placeId: body.arrival.placeId ?? undefined,
          lat: body.arrival.lat ?? undefined,
          lng: body.arrival.lng ?? undefined,
        } : undefined,
      });

      return new Response(JSON.stringify({ order: convertOrderToBackendFormat(result.order) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Regist trip error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to regist trip" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// POST /orders/{orderId}/registContactInformation
http.route({
  path: "/orders/:orderId/registContactInformation",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const orderId = request.url.split("/orders/")[1]?.split("/registContactInformation")[0];
      if (!orderId) {
        return new Response(JSON.stringify({ error: "orderId required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const body = await request.json();
      
      let convexOrderId: any = orderId.startsWith("j") ? orderId : undefined;
      
      if (!convexOrderId) {
        const order = await ctx.runQuery(api.orders.getByOrderNumber, { orderNumber: orderId });
        if (order) {
          convexOrderId = order._id;
        } else {
          return new Response(JSON.stringify({ error: "Order not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      const result = await ctx.runMutation(api.orders.registContactInformation, {
        orderId: convexOrderId,
        name: body.name,
        email: body.email,
        phoneNumber: body.phoneNumber,
        nif: body.nif ?? undefined,
        bookedForAnotherPerson: body.bookedForAnotherPerson ?? undefined,
        passengerName: body.passengerName ?? undefined,
        passengerEmail: body.passengerEmail ?? undefined,
        passengerWhatsapp: body.passengerWhatsapp ?? undefined,
        passengerRelationship: body.passengerRelationship ?? undefined,
      });

      return new Response(JSON.stringify({ order: convertOrderToBackendFormat(result.order) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Regist contact error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to regist contact information" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// POST /orders/{orderId}/payments/{method}
http.route({
  path: "/orders/:orderId/payments/:method",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const urlParts = request.url.split("/orders/")[1]?.split("/payments/");
      const orderId = urlParts?.[0];
      const method = urlParts?.[1];
      
      if (!orderId || !method) {
        return new Response(JSON.stringify({ error: "orderId and method required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const body = await request.json();
      
      let convexOrderId: any = orderId.startsWith("j") ? orderId : undefined;
      
      if (!convexOrderId) {
        const order = await ctx.runQuery(api.orders.getByOrderNumber, { orderNumber: orderId });
        if (order) {
          convexOrderId = order._id;
        } else {
          return new Response(JSON.stringify({ error: "Order not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // Inicia o pagamento (Stripe Checkout) e devolve { checkoutUrl }.
      const ordersApi = api as any;
      const result = await ctx.runAction(ordersApi.orders.startPaymentAction, {
        orderId: convexOrderId,
        method: method as "mbway" | "mb" | "ccard" | "cash",
        amount: body.amount,
        amountReturn: body.amountReturn,
        basePrice: body.basePrice,
        basePriceReturn: body.basePriceReturn,
        discountAmount: body.discountAmount,
        discountAmountReturn: body.discountAmountReturn,
        additionalFees: body.additionalFees,
        additionalFeesReturn: body.additionalFeesReturn,
        nightTax: body.nightTax,
        nightTaxReturn: body.nightTaxReturn,
        airportServiceFee: body.airportServiceFee,
        cancellationFee: body.cancellationFee,
        refundFee: body.refundFee,
        refundToOriginalPaymentMethod: body.refundToOriginalPaymentMethod,
        nif: body.nif,
        phoneNumber: body.phoneNumber,
        email: body.email,
        driverNotes: body.driverNotes,
        selectedCheckoutAddons: body.selectedCheckoutAddons,
        successUrl: body.successUrl,
        errorUrl: body.errorUrl,
        cancelUrl: body.cancelUrl,
        language: body.language,
        expiryDays: body.expiryDays,
        description: body.description,
        useSandbox: body.useSandbox,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Start payment error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to start payment" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// GET /reviews?lang={lang}
http.route({
  path: "/reviews",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const lang = url.searchParams.get("lang") || "pt-PT";
      
      // Por enquanto, retornar dados mock (os reviews estão hardcoded no frontend)
      // Pode ser expandido para buscar de uma tabela no Convex no futuro
      const reviews = {
        lang,
        reviews: [],
        message: "Reviews endpoint - data is currently hardcoded in frontend components",
      };

      return new Response(JSON.stringify(reviews), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Get reviews error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to get reviews" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }),
});

export default http;
