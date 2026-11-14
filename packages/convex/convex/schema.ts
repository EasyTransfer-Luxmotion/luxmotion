import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { catalogTranslationsValidator } from "./lib/catalogTranslations";

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

export default defineSchema({
  orders: defineTable({
    orderNumber: v.optional(v.string()),
    // For round trips: link to related order (outbound <-> return)
    relatedOrderId: v.optional(v.id("orders")),
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("paid"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),

    departure: v.object({
      location: v.string(),
      placeId: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zip_code: v.optional(v.string()),
      country: v.optional(v.string()),
      name: v.optional(v.string()),
      terminal: v.optional(v.string()),
    }),
    arrival: v.object({
      location: v.string(),
      placeId: v.optional(v.string()),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zip_code: v.optional(v.string()),
      country: v.optional(v.string()),
      name: v.optional(v.string()),
      terminal: v.optional(v.string()),
    }),
    stops: v.optional(
      v.array(
        v.object({
          location: v.string(),
          placeId: v.optional(v.string()),
          lat: v.optional(v.number()),
          lng: v.optional(v.number()),
        }),
      ),
    ),

    /**
     * De onde veio a visita, como foi observada no endereço de entrada.
     *
     * Fica separado de `partnershipName`/`partnershipId` de propósito: um
     * parceiro é uma relação comercial nossa, isto é uma campanha de anúncios.
     * Misturá-los tornaria impossível responder a qualquer das duas perguntas.
     *
     * Isto é o que **nós** observámos, e não uma declaração de que a compra foi
     * causada pelo anúncio — quem decide a atribuição é a plataforma, com o
     * `opprefId` abaixo.
     */
    adSource: v.optional(
      v.object({
        utmSource: v.optional(v.string()),
        utmMedium: v.optional(v.string()),
        utmCampaign: v.optional(v.string()),
        /** Identifica o anúncio. */
        utmContent: v.optional(v.string()),
        campaignId: v.optional(v.string()),
        adGroupId: v.optional(v.string()),
        capturedAt: v.optional(v.number()),
      }),
    ),
    /**
     * O identificador de atribuição da OpenAI, lido do cookie `__oppref` que o
     * Pixel escreve. Viaja aqui porque o webhook da Stripe não vê cookies, e
     * sem ele não há como enviar a conversão pelo servidor. Vai tal e qual:
     * nunca inventado nem substituído por UTMs.
     */
    opprefId: v.optional(v.string()),

    // Trip details
    departureDate: v.string(),
    arrivalDate: v.optional(v.string()),
    passengers: v.number(),
    adults: v.optional(v.number()),
    children: v.optional(v.number()),
    isRoundTrip: v.boolean(),

    // Vehicle
    vehicleId: v.optional(v.id("vehicles")),
    vehicleName: v.optional(v.string()),

    // Flight info
    flightNumber: v.optional(v.string()),
    airlineCompany: v.optional(v.string()),
    amadeusFlightInfo: v.optional(amadeusFlightInfoValidator),
    flightType: v.optional(v.union(v.literal("IDA"), v.literal("VOLTA"))),

    // Luggage
    backpacks: v.optional(v.number()),
    handbaggage: v.optional(v.number()),
    checkedBaggage: v.optional(v.number()),
    pets: v.optional(v.number()),
    smallPets: v.optional(v.number()),
    largePets: v.optional(v.number()),
    surfboards: v.optional(v.number()),
    standardSurfboards: v.optional(v.number()),
    largeSurfboards: v.optional(v.number()),
    childSeats: v.optional(v.number()),
    babySeats: v.optional(v.number()),
    boosterSeats: v.optional(v.number()),

    // Pricing
    basePrice: v.optional(v.number()),
    basePriceReturn: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    discountAmountReturn: v.optional(v.number()),
    additionalFees: v.optional(v.number()),
    additionalFeesReturn: v.optional(v.number()),
    nightTax: v.optional(v.number()),
    nightTaxReturn: v.optional(v.number()),
    /* Divergência detectada no servidor entre o que o cliente cobrou e o que as
       regras dizem. Não altera o valor cobrado — o cliente pagou o que viu —
       serve para a discrepância deixar de ser invisível. */
    pricingWarning: v.optional(v.string()),
    airportServiceFee: v.optional(v.number()),
    cancellationFee: v.optional(v.number()),
    refundFee: v.optional(v.number()),
    totalAmount: v.optional(v.number()),
    totalAmountReturn: v.optional(v.number()),

    // Distance
    distance: v.optional(v.number()),
    routeDurationMinutes: v.optional(v.number()),
    outboundDistance: v.optional(v.number()),
    returnDistance: v.optional(v.number()),

    // Contact info
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    customerNif: v.optional(v.string()),
    bookedForAnotherPerson: v.optional(v.boolean()),
    passengerName: v.optional(v.string()),
    passengerEmail: v.optional(v.string()),
    passengerWhatsapp: v.optional(v.string()),
    passengerRelationship: v.optional(v.string()),

    // Payment
    // Existing legacy codes plus the actual method returned by signed Stripe webhooks.
    paymentMethod: v.optional(v.string()),
    paymentStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    refundToOriginalPaymentMethod: v.optional(v.boolean()),

    // Payment references (for MB/MBWay)
    paymentEntity: v.optional(v.string()),
    paymentReference: v.optional(v.string()),
    paymentRequestId: v.optional(v.string()), // RequestId para MBWay
    paymentReturnToken: v.optional(v.string()), // token de retorno do gateway (ccard)
    paymentAmount: v.optional(v.number()),
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

    // Tour/event addon breakdown (denormalized from tourBookings at payment time)
    selectedAddons: v.optional(
      v.array(
        v.object({
          // Opcional: os add-ons dos upsells do checkout são embutidos na
          // própria experiência e não têm linha em `tourAddons`.
          addonId: v.optional(v.id("tourAddons")),
          /* Um extra universal vive noutra tabela, e o Convex valida a tabela
             do id — daí um campo próprio em vez de reaproveitar o de cima. */
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

    /* Copiado da reserva: um evento vendido em lugar partilhado tem de se ver
       na order sem ter de ir buscar a reserva. */
    sharingMode: v.optional(v.union(v.literal("private"), v.literal("shared"))),

    // Tour booking link (when order represents a paid tour/experience/event)
    tourBookingId: v.optional(v.id("tourBookings")),

    // When this order is a tour from checkout upsell, link to the transfer order that paid
    transferOrderId: v.optional(v.id("orders")),

    // Experiences/tours added during transfer checkout (upsell); processed when payment completes
    pendingCheckoutExperiences: v.optional(
      v.array(
        v.object({
          productType: v.union(
            v.literal("tour"),
            v.literal("experience"),
            v.literal("event"),
          ),
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
          /* Upsells não têm linha em `tours`, logo não há paragens de onde
             tirar partida/chegada — o local vem daqui. */
          pickup: v.optional(
            v.object({
              title: v.string(),
              address: v.string(),
              lat: v.optional(v.number()),
              lng: v.optional(v.number()),
              placeId: v.optional(v.string()),
            }),
          ),
          /* Os extras escolhidos no passo 2 entravam no total e desapareciam
             aqui: a operação recebia o valor mas nunca ficava a saber o que
             tinha sido vendido. */
          selectedAddons: v.optional(
            v.array(
              v.object({
                addonId: v.optional(v.id("tourAddons")),
                universalAddonId: v.optional(v.id("universalAddons")),
                title: v.string(),
                price: v.number(),
                pricingType: v.union(
                  v.literal("per_person"),
                  v.literal("flat"),
                ),
                quantity: v.number(),
                subtotal: v.number(),
              }),
            ),
          ),
          addonsTotal: v.optional(v.number()),
        }),
      ),
    ),

    // Origem da reserva: "Easy Transfer" (site principal) ou nome da parceria (ex: "Vila Galé")
    partnershipName: v.optional(v.string()),
    // Affiliate/partnership this order was attributed to (referral link).
    partnershipId: v.optional(v.id("partnerships")),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_payment_status", ["paymentStatus"])
    .index("by_order_number", ["orderNumber"])
    .index("by_tour_booking", ["tourBookingId"])
    .index("by_transfer_order", ["transferOrderId"]),

  bookings: defineTable({
    customerId: v.string(),
    dropoffLocation: v.string(),
    orderId: v.string(),
    passengers: v.number(),
    pickupDateTime: v.number(),
    pickupLocation: v.string(),
    price: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    vehicleId: v.string(),
  }).index("by_status", ["status"]),

  customers: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    phone: v.string(),
  }).index("by_clerkId", ["clerkId"]),

  transactions: defineTable({
    amount: v.number(),
    bookingId: v.string(),
    paymentMethod: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    timestamp: v.number(),
  }).index("by_status", ["status"]),

  vehicles: defineTable({
    name: v.string(),
    translations: v.optional(catalogTranslationsValidator),
    // Modelos concretos desta classe, ex. "Renault Clio, Fiat Tipo". Mostrado
    // a seguir ao nome para o cliente saber que carro esperar.
    examples: v.optional(v.string()),
    imageId: v.optional(v.string()),
    partnershipId: v.optional(v.id("partnerships")),
    passengers: v.number(),
    luggage: v.number(),
    maxBackpacks: v.optional(v.number()),
    maxHandLuggage: v.optional(v.number()),
    maxCheckedBaggage: v.optional(v.number()),
    maxChildSeats: v.optional(v.number()),
    maxBabySeats: v.optional(v.number()),
    maxBoosterSeats: v.optional(v.number()),
    pricePerKm: v.number(),
    pricePerKmNight: v.number(),
    minimumPrice: v.number(),
    hasWifi: v.boolean(),
    isElectric: v.boolean(),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("maintenance"),
    ),
    order: v.number(),
    // Experience-upgrade upsell: when set, THIS (premium) vehicle is offered as an
    // upgrade to customers who selected the referenced (standard) vehicle at checkout.
    upgradeFromVehicleId: v.optional(v.id("vehicles")),
  })
    .index("by_status", ["status"])
    .index("by_order", ["order"])
    .index("by_partnership", ["partnershipId"])
    .index("by_upgrade_from", ["upgradeFromVehicleId"]),

  partnerships: defineTable({
    name: v.string(),
    slug: v.string(),
    theme: v.any(),
    content: v.optional(v.any()),
    logoId: v.optional(v.string()),
    heroImageId: v.optional(v.string()),
    status: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    welcomeMessage: v.optional(v.string()),
    landingTemplate: v.optional(
      v.union(
        v.literal("transfer"),
        v.literal("whitelabel"),
        v.literal("wedding-whitelabel"),
      ),
    ),
  }).index("by_slug", ["slug"]),

  // Global site-wide settings (singleton keyed by "global"). The transfer booking
  // lead-time (minimum hours in advance) lives here so admins can tune it.
  siteSettings: defineTable({
    key: v.string(),
    minAdvanceBookingHours: v.number(),
    // Scrolling announcement bar (marquee) shown at the top of landing pages.
    announcementsEnabled: v.optional(v.boolean()),
    announcements: v.optional(v.array(v.string())),
    // Approximate display-currency conversion. Rates are "how many X per 1 EUR".
    // Stripe still charges in EUR; these only drive the storefront price display.
    exchangeRates: v.optional(
      v.object({ BRL: v.number(), USD: v.number(), GBP: v.number() }),
    ),
    // Extra % added to the base transfer fare when the pickup is an airport.
    airportSurchargePercent: v.optional(v.number()),
    // Radius, in km, used to decide which tours count as "near" the place the
    // visitor searched for on /tours/results.
    toursSearchRadiusKm: v.optional(v.number()),
    // Radius, in km, for the tours and events offered during checkout around
    // the transfer's DROP-OFF. Was hardcoded at 30 in the backend until it
    // became configurable here.
    checkoutToursRadiusKm: v.optional(v.number()),
    // Radius, in km, for the checkout upsells (extra stops and experiences).
    // Deliberately separate from the two above: someone browsing wants tight
    // local results, someone already driving somewhere will happily add a stop
    // half an hour away.
    checkoutUpsellRadiusKm: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

  emailVerifications: defineTable({
    email: v.string(),
    code: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  blogs: defineTable({
    title: v.string(),
    slug: v.string(),
    excerpt: v.string(),
    content: v.any(),
    heroImageId: v.optional(v.string()),
    /* Metadata das duas imagens geradas pela automação. O alt é o que vai para
       o atributo do <img>; o filename não é usado pelo storage do Convex (que
       serve por id), fica registado para quando as imagens saírem para um CDN
       com nomes reais. */
    heroImageAlt: v.optional(v.string()),
    heroImageFilename: v.optional(v.string()),
    /** Segunda imagem, inserida no corpo do artigo. */
    editorialImageId: v.optional(v.string()),
    editorialImageAlt: v.optional(v.string()),
    editorialImageCaption: v.optional(v.string()),
    editorialImageFilename: v.optional(v.string()),
    category: v.string(),
    author: v.string(),
    authorRole: v.optional(v.string()),
    authorBio: v.optional(v.string()),
    authorAvatarId: v.optional(v.string()),
    originalLanguage: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    isFeatured: v.boolean(),
    isService: v.optional(v.boolean()),
    readTimeMinutes: v.number(),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    // Pares Q/A do artigo, para emitir schema de FAQPage.
    faq: v.optional(
      v.array(v.object({ question: v.string(), answer: v.string() })),
    ),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_category", ["category"])
    .index("by_featured", ["isFeatured"])
    .index("by_service", ["isService"])
    .index("by_published_at", ["publishedAt"]),

  /**
   * Uma linha por artigo gerado pela automação. Guarda o Markdown de origem
   * (é dele que as traduções partem, nunca do JSON) e o suficiente para
   * perceber uma geração má sem voltar a gastar dinheiro na OpenAI.
   */
  blogGenerationRuns: defineTable({
    trigger: v.union(v.literal("cron"), v.literal("manual")),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("needsReview"),
      v.literal("failed"),
    ),
    topic: v.optional(v.string()),
    icp: v.optional(v.string()),
    blogId: v.optional(v.id("blogs")),
    /** Markdown do artigo em inglês, base das traduções. */
    sourceMarkdown: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    /** Resposta crua truncada, só para depuração. */
    rawResponse: v.optional(v.string()),
    /** Corrida de teste: fica em rascunho mesmo correndo tudo bem. */
    keepDraft: v.optional(v.boolean()),
    imageDone: v.optional(v.boolean()),
    localesDone: v.optional(v.array(v.string())),
    localesFailed: v.optional(v.array(v.string())),
    warnings: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
    model: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_started", ["startedAt"]),

  blogTranslations: defineTable({
    blogId: v.id("blogs"),
    locale: v.string(),
    title: v.string(),
    excerpt: v.string(),
    content: v.any(),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_blog", ["blogId"])
    .index("by_blog_locale", ["blogId", "locale"]),

  tours: defineTable({
    title: v.string(),
    slug: v.string(),
    subtitle: v.optional(v.string()),
    description: v.any(),
    tourType: v.string(),
    originalLanguage: v.string(),
    category: v.union(
      v.literal("tours"),
      v.literal("experiences"),
      v.literal("private"),
      v.literal("stops"),
      v.literal("events"),
    ),
    destination: v.string(),
    isFeatured: v.boolean(),
    isBestSeller: v.boolean(),
    isActive: v.boolean(),
    isUltraLuxury: v.optional(v.boolean()),
    /* Extras universais que este tour dispensa. Fica aqui e não numa tabela à
       parte porque é lido exactamente onde o tour é lido. */
    disabledUniversalAddons: v.optional(v.array(v.id("universalAddons"))),
    tourTypeTag: v.optional(
      v.union(
        v.literal("half-day"),
        v.literal("full-day"),
        v.literal("multi-day"),
        v.literal("river-cruise"),
        v.literal("private-yacht"),
        v.literal("helicopter"),
      ),
    ),
    durationDays: v.optional(v.number()),
    itineraryDays: v.optional(
      v.array(
        v.object({
          title: v.string(),
          titleAccent: v.optional(v.string()),
          hoursActive: v.optional(v.string()),
          nights: v.optional(v.number()),
          hotel: v.optional(v.string()),
          stops: v.array(
            v.object({
              time: v.optional(v.string()),
              label: v.optional(v.string()),
              title: v.string(),
              description: v.optional(v.string()),
              imageId: v.optional(v.string()),
              lat: v.optional(v.number()),
              lng: v.optional(v.number()),
            }),
          ),
        }),
      ),
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    duration: v.string(),
    durationMinutes: v.optional(v.number()),
    groupSize: v.string(),
    maxGroupSize: v.optional(v.number()),
    languages: v.array(v.string()),
    basePrice: v.number(),
    originalPrice: v.optional(v.number()),
    currency: v.string(),
    bannerImageId: v.optional(v.string()),
    additionalBannerIds: v.optional(v.array(v.string())),
    additionalBannerTypes: v.optional(
      v.array(v.union(v.literal("image"), v.literal("video"))),
    ),
    galleryImageIds: v.optional(v.array(v.string())),

    included: v.optional(v.array(v.string())),
    excluded: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
    pickup: v.optional(
      v.object({
        title: v.string(),
        address: v.string(),
        description: v.optional(v.string()),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        placeId: v.optional(v.string()),
      }),
    ),
    dropoff: v.optional(
      v.object({
        title: v.string(),
        address: v.string(),
        description: v.optional(v.string()),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        placeId: v.optional(v.string()),
      }),
    ),
    mapCenter: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    rating: v.optional(v.number()),
    reviewCount: v.optional(v.number()),
    manualReviewCount: v.optional(v.number()),
    bookingDeadlineHours: v.optional(v.number()),
    cancellationPolicy: v.optional(v.string()),
    minPassengers: v.optional(v.number()),
    maxPassengers: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_destination", ["destination"])
    .index("by_category", ["category"])
    .index("by_featured", ["isFeatured"])
    .index("by_bestseller", ["isBestSeller"])
    .index("by_ultra_luxury", ["isUltraLuxury"])
    .index("by_destination_category", ["destination", "category"]),

  tourTranslations: defineTable({
    tourId: v.id("tours"),
    locale: v.string(),
    title: v.string(),
    subtitle: v.optional(v.string()),
    description: v.any(),

    included: v.optional(v.array(v.string())),
    excluded: v.optional(v.array(v.string())),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    cancellationPolicy: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_tour", ["tourId"])
    .index("by_tour_locale", ["tourId", "locale"]),

  tourStops: defineTable({
    tourId: v.id("tours"),
    order: v.number(),
    time: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    imageId: v.optional(v.string()),
    showImage: v.boolean(),
    address: v.optional(v.string()),
    placeId: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tour", ["tourId"])
    .index("by_tour_order", ["tourId", "order"]),

  tourStopTranslations: defineTable({
    stopId: v.id("tourStops"),
    locale: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_stop", ["stopId"])
    .index("by_stop_locale", ["stopId", "locale"]),

  tourSchedules: defineTable({
    tourId: v.id("tours"),
    activeDays: v.array(v.number()),
    timeSlots: v.array(
      v.object({
        startTime: v.string(),
        endTime: v.optional(v.string()),
      }),
    ),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tour", ["tourId"])
    .index("by_active", ["isActive"]),

  tourScheduleExceptions: defineTable({
    tourId: v.id("tours"),
    scheduleId: v.optional(v.id("tourSchedules")),
    date: v.number(),
    type: v.union(
      v.literal("cancelled"),
      v.literal("rescheduled"),
      v.literal("special"),
    ),
    newTimeSlot: v.optional(
      v.object({
        startTime: v.string(),
        endTime: v.optional(v.string()),
      }),
    ),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_tour", ["tourId"])
    .index("by_date", ["date"])
    .index("by_tour_date", ["tourId", "date"]),

  events: defineTable({
    title: v.string(),
    slug: v.string(),
    subtitle: v.optional(v.string()),
    description: v.any(),
    originalLanguage: v.string(),
    location: v.string(),
    venue: v.optional(v.string()),
    eventDate: v.number(),
    endDate: v.optional(v.number()),
    isFeatured: v.boolean(),
    isActive: v.boolean(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("cancelled"),
      v.literal("completed"),
    ),
    maxCapacity: v.optional(v.number()),
    /* Um evento tem dois preços, e só dois:

       - `privatePrice` é a viatura inteira, para o grupo de quem reserva;
       - `sharedPrice` é o lugar por pessoa, com outros participantes. Vazio quer
         dizer que este evento só se vende em privado, e é isso que decide se o
         cartão de reserva mostra a escolha.

       `basePrice` e `originalPrice` são o que havia antes. O primeiro passou a
       chamar-se `privatePrice` — era ele que mandava no que se cobra — e o
       segundo, o preço riscado, era igual ao primeiro nos 22 eventos: um
       desconto a fingir. Ficam opcionais só até a migração correr e o deploy
       seguinte os tirar daqui. */
    privatePrice: v.optional(v.number()),
    sharedPrice: v.optional(v.number()),
    basePrice: v.optional(v.number()),
    originalPrice: v.optional(v.number()),
    currency: v.string(),
    bannerImageId: v.optional(v.string()),
    additionalBannerIds: v.optional(v.array(v.string())),
    galleryImageIds: v.optional(v.array(v.string())),

    included: v.optional(v.array(v.string())),
    excluded: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
    meetingPoint: v.optional(
      v.object({
        title: v.string(),
        address: v.string(),
        description: v.optional(v.string()),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        placeId: v.optional(v.string()),
      }),
    ),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    rating: v.optional(v.number()),
    reviewCount: v.optional(v.number()),
    manualReviewCount: v.optional(v.number()),
    minPassengers: v.optional(v.number()),
    maxPassengers: v.optional(v.number()),

    /* Hora a que se regressa ao ponto de encontro. Sem ela, a rota mostrada no
       cartão de reserva é só de ida. */
    returnAt: v.optional(v.number()),
    /* A viatura do serviço. Traz de lá o nome da classe, quantos lugares tem e
       os modelos concretos, em vez de se escrever "First Class" à mão em cada
       evento — e é dela que sai o limite de pessoas pedido no checkout. */
    vehicleId: v.optional(v.id("vehicles")),
    /* Quantas horas antes se confirma a partida. 72 quando está vazio. */
    confirmationHours: v.optional(v.number()),

    /* Extras universais que este evento dispensa. Fica aqui e não numa tabela
       à parte porque é lido exactamente onde o evento é lido. */
    disabledUniversalAddons: v.optional(v.array(v.id("universalAddons"))),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_location", ["location"])
    .index("by_event_date", ["eventDate"])
    .index("by_featured", ["isFeatured"]),

  eventTranslations: defineTable({
    eventId: v.id("events"),
    locale: v.string(),
    title: v.string(),
    subtitle: v.optional(v.string()),
    description: v.any(),
    included: v.optional(v.array(v.string())),
    excluded: v.optional(v.array(v.string())),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_locale", ["eventId", "locale"]),

  tourInquiries: defineTable({
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
    status: v.optional(
      v.union(v.literal("new"), v.literal("read"), v.literal("archived")),
    ),
    // Affiliate/partnership attribution (referral link).
    partnershipId: v.optional(v.id("partnerships")),
    partnershipName: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"])
    /* Para o contador de pedidos por tratar na sidebar do dashboard. */
    .index("by_status", ["status"]),

  contactSubmissions: defineTable({
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    message: v.string(),
    status: v.optional(
      v.union(v.literal("new"), v.literal("read"), v.literal("archived")),
    ),
    // Affiliate/partnership attribution (referral link).
    partnershipId: v.optional(v.id("partnerships")),
    partnershipName: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  driverApplications: defineTable({
    operatingZone: v.string(),

    fullName: v.string(),
    email: v.string(),
    representativeEmail: v.string(),
    phone: v.string(),
    whatsapp: v.string(),
    languages: v.array(
      v.object({
        code: v.string(),
        level: v.union(
          v.literal("survival"),
          v.literal("intermediate"),
          v.literal("fluent"),
        ),
      }),
    ),
    referral: v.string(),

    vehicleCategory: v.string(),
    vehicleBrand: v.string(),
    vehicleModel: v.string(),
    vehiclePlate: v.string(),
    vehicleColor: v.string(),
    vehicleYear: v.string(),
    vehicleOwnership: v.string(),
    vehiclePassengerCapacity: v.string(),
    vehicleLuggageCapacity: v.string(),
    vehicleTvdeLicensed: v.string(),
    vehicleInteriorPhotoIds: v.array(v.id("_storage")),
    vehicleExteriorPhotoIds: v.array(v.id("_storage")),
    childSeatBaby: v.number(),
    childSeatChild: v.number(),
    childSeatBooster: v.number(),
    surfboardRack: v.boolean(),
    amenities: v.array(v.string()),

    professionalPhotoId: v.optional(v.id("_storage")),
    professionalLicenseId: v.optional(v.id("_storage")),
    vehicleInsuranceId: v.optional(v.id("_storage")),
    proofOfAddressId: v.optional(v.id("_storage")),

    billingAccountHolder: v.string(),
    billingInvoiceName: v.string(),
    billingSwiftBic: v.string(),
    billingIban: v.string(),
    billingNif: v.string(),
    billingTaxOffice: v.string(),
    billingAddress: v.string(),
    billingBankProofId: v.optional(v.id("_storage")),

    availabilityDays: v.array(v.string()),
    availabilityShifts: v.array(v.string()),

    introVideoId: v.optional(v.id("_storage")),

    termsAccepted: v.boolean(),

    status: v.union(
      v.literal("submitted"),
      v.literal("reviewing"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    queuePosition: v.number(),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    internalNotes: v.optional(v.string()),
  })
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  partnerApplications: defineTable({
    // company step
    operatingZones: v.array(v.string()),
    driverCount: v.string(),
    driversComfortableWithMobile: v.union(v.literal("yes"), v.literal("no")),

    // representative step
    companyName: v.string(),
    representativeFullName: v.string(),
    representativeEmail: v.string(),
    representativePhone: v.string(),
    representativeWhatsapp: v.string(),

    // drivers step
    drivers: v.array(
      v.object({
        fullName: v.string(),
        email: v.string(),
        phone: v.string(),
        hasVideo: v.boolean(),
      }),
    ),

    // vehicles step
    vehicles: v.array(
      v.object({
        make: v.string(),
        model: v.string(),
        licensePlate: v.string(),
        category: v.string(),
      }),
    ),

    // documents step
    documentLicenseId: v.optional(v.id("_storage")),
    documentAddressProofPrimaryId: v.optional(v.id("_storage")),
    documentAddressProofSecondaryId: v.optional(v.id("_storage")),
    documentLiabilityInsuranceId: v.optional(v.id("_storage")),

    // billing step
    billingAccountHolder: v.string(),
    billingInvoiceName: v.string(),
    billingSwiftBic: v.string(),
    billingIban: v.string(),
    billingTaxId: v.string(),
    billingTaxOffice: v.string(),
    billingAddress: v.string(),
    billingBankProofId: v.optional(v.id("_storage")),

    // agreement / consent
    priceAgreementAcknowledged: v.boolean(),
    termsAccepted: v.boolean(),

    // metadata
    status: v.union(
      v.literal("submitted"),
      v.literal("reviewing"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    queuePosition: v.number(),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    internalNotes: v.optional(v.string()),
  })
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  corporateExperiences: defineTable({
    originalLanguage: v.optional(v.string()),
    titlePrefix: v.string(),
    titleAccent: v.string(),
    shortDescription: v.string(),
    duration: v.union(
      v.literal("halfDay"),
      v.literal("fullDay"),
      v.literal("multiDay"),
    ),
    pillar: v.union(
      v.literal("standard"),
      v.literal("experiences"),
      v.literal("logistics"),
    ),
    subcategory: v.string(),
    groupSize: v.string(),
    durationLabel: v.string(),
    location: v.string(),
    description: v.string(),
    experienceBody: v.string(),
    experienceItems: v.array(
      v.object({ strong: v.string(), body: v.string() }),
    ),
    routeHighlights: v.array(v.string()),
    whatsIncluded: v.array(v.string()),
    coverImageId: v.optional(v.string()),
    galleryImageIds: v.array(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_pillar", ["pillar"])
    .index("by_sort", ["sortOrder"]),

  corporateExperienceTranslations: defineTable({
    experienceId: v.id("corporateExperiences"),
    locale: v.string(),
    titlePrefix: v.string(),
    titleAccent: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    groupSize: v.optional(v.string()),
    durationLabel: v.optional(v.string()),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    experienceBody: v.optional(v.string()),
    experienceItems: v.optional(v.array(v.object({ strong: v.string(), body: v.string() }))),
    routeHighlights: v.optional(v.array(v.string())),
    whatsIncluded: v.optional(v.array(v.string())),
    updatedAt: v.number(),
  })
    .index("by_experience", ["experienceId"])
    .index("by_experience_locale", ["experienceId", "locale"]),

  corporateRequests: defineTable({
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    companyName: v.string(),
    eventDate: v.optional(v.number()),
    guests: v.optional(v.number()),
    budget: v.optional(v.number()),
    vehicleType: v.optional(v.string()),
    notes: v.optional(v.string()),

    // Affiliate/partnership attribution (referral link).
    partnershipId: v.optional(v.id("partnerships")),
    partnershipName: v.optional(v.string()),

    status: v.union(
      v.literal("submitted"),
      v.literal("reviewing"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    queuePosition: v.number(),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    internalNotes: v.optional(v.string()),
  })
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  contactQuotes: defineTable({
    fullName: v.string(),
    company: v.string(),
    email: v.string(),
    phone: v.string(),
    subject: v.string(),
    message: v.string(),
    status: v.union(
      v.literal("new"),
      v.literal("inProgress"),
      v.literal("resolved"),
      v.literal("archived"),
    ),
    // Affiliate/partnership attribution (referral link).
    partnershipId: v.optional(v.id("partnerships")),
    partnershipName: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  partnerLeads: defineTable({
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    companyName: v.string(),
    partnerType: v.string(),
    estimatedMonthlyVolume: v.string(),
    city: v.string(),
    howDidYouHear: v.string(),
    status: v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("archived"),
    ),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  weddingQuoteSubmissions: defineTable({
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
    status: v.optional(
      v.union(v.literal("new"), v.literal("read"), v.literal("archived")),
    ),
    // Affiliate/partnership attribution (referral link).
    partnershipId: v.optional(v.id("partnerships")),
    partnershipName: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  schoolQuoteSubmissions: defineTable({
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
    status: v.optional(
      v.union(v.literal("new"), v.literal("read"), v.literal("archived")),
    ),
    // Affiliate/partnership attribution (referral link).
    partnershipId: v.optional(v.id("partnerships")),
    partnershipName: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  newsletterSubscriptions: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    source: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_created", ["createdAt"]),

  /**
   * O que já foi para o Pipedrive, e até que passo.
   *
   * O Pipedrive não tem cabeçalho de idempotência em nenhum destes endpoints:
   * um POST que chega ao servidor mas cuja resposta se perde produz, na
   * tentativa seguinte, uma segunda lead. Esta linha é a memória que falta —
   * escrita na mesma transação da submissão, para que duas submissões
   * simultâneas não passem as duas, e preenchida passo a passo para que uma
   * retransmissão continue de onde ficou em vez de recomeçar.
   */
  pipedriveSync: defineTable({
    /* Nome da tabela de origem, ou "orders" para uma reserva paga. */
    origem: v.string(),
    origemId: v.string(),
    personId: v.optional(v.number()),
    organizationId: v.optional(v.number()),
    /* As leads do Pipedrive são identificadas por UUID, não por número. */
    leadId: v.optional(v.string()),
    dealId: v.optional(v.number()),
    noteId: v.optional(v.number()),
    estado: v.union(
      v.literal("pendente"),
      v.literal("concluido"),
      v.literal("falhado"),
    ),
    tentativas: v.number(),
    ultimoErro: v.optional(v.string()),
    criadoEm: v.number(),
    atualizadoEm: v.number(),
  }).index("by_origem", ["origem", "origemId"]),

  marketingStats: defineTable({
    key: v.string(),
    trustpilotReviewCount: v.number(),
    reviewCountBoost: v.optional(v.number()),
    heroDailyTravelersMin: v.number(),
    heroDailyTravelersMax: v.number(),
    detailDailyTravelersMin: v.number(),
    detailDailyTravelersMax: v.number(),
    checkoutBookedTodayMin: v.number(),
    checkoutBookedTodayMax: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  tourScarcity: defineTable({
    key: v.string(),
    year: v.number(),
    totalCapacity: v.number(),
    confirmedBookings: v.number(),
    inquiriesToday: v.number(),
    reservedThisWeek: v.number(),
    months: v.array(
      v.object({
        status: v.union(
          v.literal("booked"),
          v.literal("almost"),
          v.literal("available"),
        ),
        spotsLeft: v.number(),
      }),
    ),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  drivers: defineTable({
    name: v.string(),
    location: v.string(),
    quote: v.string(),
    // Richer profile shown on the home page carousel. Optional so rows created
    // before this migration keep validating.
    description: v.optional(v.string()),
    languages: v.optional(v.string()),
    vehicle: v.optional(v.string()),
    rating: v.optional(v.string()),
    rides: v.optional(v.number()),
    imageId: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_order", ["order"]),

  teamMembers: defineTable({
    name: v.string(),
    role: v.string(),
    bio: v.optional(v.string()),
    imageId: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_order", ["order"]),

  pastExperiences: defineTable({
    title: v.string(),
    description: v.string(),
    location: v.string(),
    category: v.union(
      v.literal("corporate"),
      v.literal("weddings"),
      v.literal("events"),
      v.literal("privateTours"),
    ),
    tags: v.optional(v.array(v.string())),
    imageId: v.optional(v.string()),
    // Destino do clique na foto, no mosaico do /about-us. Sem isto a foto não
    // é clicável, que é como se comportou até agora.
    linkUrl: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_category", ["category"])
    .index("by_created", ["createdAt"]),

  tourReviews: defineTable({
    tourId: v.optional(v.id("tours")),
    eventId: v.optional(v.id("events")),
    author: v.string(),
    avatar: v.optional(v.string()),
    rating: v.number(),
    text: v.string(),
    source: v.optional(v.string()),
    nationality: v.optional(v.string()),
    isApproved: v.boolean(),
    isFeatured: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_tour", ["tourId"])
    .index("by_event", ["eventId"])
    .index("by_approved", ["isApproved"])
    .index("by_featured", ["isFeatured"]),

  tourAddons: defineTable({
    tourId: v.optional(v.id("tours")),
    eventId: v.optional(v.id("events")),
    title: v.string(),
    description: v.optional(v.string()),
    imageId: v.optional(v.string()),
    price: v.number(),
    pricingType: v.union(v.literal("per_person"), v.literal("flat")),
    currency: v.string(),
    originalLanguage: v.string(),
    order: v.number(),
    isActive: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tour", ["tourId"])
    .index("by_event", ["eventId"]),

  /* Extras universais: definidos uma vez e mostrados em todos os tours ou
     eventos do seu âmbito.

     Tabela própria e não uma marca em `tourAddons` porque lá `tourId` e
     `eventId` são os únicos caminhos de leitura — uma linha sem dono seria
     invisível a todas as queries. Um extra universal não tem dono.

     `scopes` é uma lista porque o mesmo extra pode servir tours e ultra-luxo. É
     curta e filtra-se em memória, como o `universal` dos upsells. */
  universalAddons: defineTable({
    title: v.string(),
    translations: v.optional(catalogTranslationsValidator),
    description: v.optional(v.string()),
    imageId: v.optional(v.string()),
    price: v.number(),
    pricingType: v.union(v.literal("per_person"), v.literal("flat")),
    currency: v.string(),
    originalLanguage: v.string(),
    order: v.number(),
    status: v.union(v.literal("draft"), v.literal("published")),
    scopes: v.array(
      v.union(
        v.literal("tours"),
        v.literal("events"),
        v.literal("ultraLuxury"),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  /* Biblioteca de imagens dos extras.

     As imagens dos extras repetem-se — o champanhe, as flores, o fotógrafo são
     os mesmos em todos os tours e eventos — e até aqui cada linha de
     `tourAddons` obrigava a carregar o ficheiro outra vez. Esta tabela guarda o
     ficheiro uma vez, com um nome, e os extras passam a apontar para ele.

     Não é uma relação: `tourAddons.imageId` continua a ser um `_storage` id
     directo, e uma imagem apagada da biblioteca não desaparece dos extras que a
     usam. A biblioteca é um catálogo do que já está carregado, não o dono do
     ficheiro. */
  addonImages: defineTable({
    storageId: v.string(),
    label: v.string(),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_storage", ["storageId"]),

  /* ------------------------------------------------------------------------
     Checkout upsells.

     Tabelas próprias, e não mais categorias em `tours`, porque são coisas
     diferentes: um tour vende-se por si e tem página, calendário, traduções e
     reservas; um upsell só existe a meio do checkout de um transfer. Enquanto
     partilharam a mesma tabela, "experiences" passou a significar quatro
     coisas sem relação nenhuma e ninguém conseguia dizer onde os editar.

     `universal: true` ignora a geografia e aparece em qualquer checkout.
     Caso contrário só aparecem se estiverem a menos de
     `siteSettings.checkoutUpsellRadiusKm` do destino do transfer.
  --------------------------------------------------------------------------*/

  /** Paragem curta no próprio trajecto — preço fixo por 15 ou 30 minutos. */
  upsellStops: defineTable({
    title: v.string(),
    translations: v.optional(catalogTranslationsValidator),
    description: v.optional(v.string()),
    imageId: v.optional(v.string()),
    location: v.optional(
      v.object({
        title: v.string(),
        address: v.string(),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        placeId: v.optional(v.string()),
      }),
    ),
    price15: v.optional(v.number()),
    price30: v.number(),
    currency: v.string(),
    tag: v.union(
      v.literal("none"),
      v.literal("recommended"),
      v.literal("mostPopular"),
    ),
    universal: v.boolean(),
    status: v.union(v.literal("draft"), v.literal("published")),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_order", ["order"]),

  /** Experiência vendida como extra do transfer, com add-ons próprios. */
  upsellExperiences: defineTable({
    title: v.string(),
    translations: v.optional(catalogTranslationsValidator),
    description: v.optional(v.string()),
    imageId: v.optional(v.string()),
    location: v.optional(
      v.object({
        title: v.string(),
        address: v.string(),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        placeId: v.optional(v.string()),
      }),
    ),
    basePrice: v.number(),
    pricingModel: v.union(v.literal("perPerson"), v.literal("flat")),
    currency: v.string(),
    /** Texto livre ("2h", "Meio-dia"), como no resto do catálogo. */
    duration: v.optional(v.string()),
    /* Embutidos de propósito: são dois campos, lêem-se sempre com o pai, e uma
       tabela à parte repetiria o destino do `tourAddons`, que ficou sem ecrã
       nenhum porque nunca houve sítio óbvio onde o pôr. */
    addons: v.optional(
      v.array(
        v.object({
          name: v.string(),
          translations: v.optional(catalogTranslationsValidator),
          price: v.number(),
          pricingType: v.optional(
            v.union(v.literal("per_person"), v.literal("flat")),
          ),
        }),
      ),
    ),
    /** Pede data ao cliente no modal (visitas com marcação). */
    hasDateField: v.boolean(),
    /** Mostra a caixa de pedido especial no modal. */
    hasSpecialRequest: v.boolean(),
    tag: v.union(
      v.literal("none"),
      v.literal("recommended"),
      v.literal("mostPopular"),
    ),
    universal: v.boolean(),
    status: v.union(v.literal("draft"), v.literal("published")),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_order", ["order"]),

  tourAddonTranslations: defineTable({
    addonId: v.id("tourAddons"),
    locale: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_addon", ["addonId"])
    .index("by_addon_locale", ["addonId", "locale"]),

  tourBookings: defineTable({
    bookingNumber: v.string(),
    productType: v.union(
      v.literal("tour"),
      v.literal("experience"),
      v.literal("event"),
    ),
    tourId: v.optional(v.id("tours")),
    eventId: v.optional(v.id("events")),
    tourTitle: v.string(),
    tourSlug: v.string(),
    passengers: v.number(),
    selectedDate: v.string(),
    selectedTime: v.string(),
    pickup: v.optional(
      v.object({
        title: v.string(),
        address: v.string(),
        description: v.optional(v.string()),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        placeId: v.optional(v.string()),
      }),
    ),
    customerName: v.string(),
    customerEmail: v.string(),
    customerPhone: v.string(),
    customerNif: v.optional(v.string()),
    basePrice: v.number(),
    /* Comprou lugar partilhado ou o evento em privado? O preço sozinho não
       chega para o saber, e quem organiza precisa de agrupar os partilhados. */
    sharingMode: v.optional(v.union(v.literal("private"), v.literal("shared"))),
    selectedAddons: v.optional(
      v.array(
        v.object({
          // Opcional: os add-ons dos upsells do checkout são embutidos na
          // própria experiência e não têm linha em `tourAddons`.
          addonId: v.optional(v.id("tourAddons")),
          /* Um extra universal vive noutra tabela, e o Convex valida a tabela
             do id — daí um campo próprio em vez de reaproveitar o de cima. */
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
    tipPercent: v.number(),
    tipAmount: v.number(),
    totalAmount: v.number(),
    // Existing legacy codes plus the actual method returned by signed Stripe webhooks.
    paymentMethod: v.optional(v.string()),
    paymentStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    paymentRequestId: v.optional(v.string()),
    paymentEntity: v.optional(v.string()),
    paymentReference: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("paid"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    // Free text the customer typed when adding this to the checkout (dietary
    // needs, occasions…). Was collected in the UI and thrown away before this.
    specialRequest: v.optional(v.string()),
    // Affiliate/partnership attribution (referral link).
    partnershipId: v.optional(v.id("partnerships")),
    partnershipName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_booking_number", ["bookingNumber"])
    .index("by_tour", ["tourId"])
    .index("by_event", ["eventId"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  // Cached snapshot of the business's Google reviews (refreshed daily by a cron
  // in crons.ts). A single document holds the aggregate rating/total plus up to
  // 5 review texts — the most the official Google Places API returns.
  /* O último feed do Instagram que a API devolveu com sucesso.
     
     O site lia a API a cada visita da homepage, e quando a chamada falhava
     caía para três fotos guardadas no repositório — sem ninguém dar por isso.
     Agora quem lê é o cron: uma falha deixa o último feed bom no lugar e fica
     registada em lastError. */
  instagramCache: defineTable({
    posts: v.array(
      v.object({
        id: v.string(),
        mediaType: v.string(),
        mediaUrl: v.string(),
        permalink: v.string(),
        timestamp: v.string(),
        caption: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
      }),
    ),
    profile: v.optional(
      v.object({
        username: v.string(),
        mediaCount: v.optional(v.number()),
        followersCount: v.optional(v.number()),
        followsCount: v.optional(v.number()),
        profilePictureUrl: v.optional(v.string()),
      }),
    ),
    fetchedAt: v.number(),
    /** Última falha da sincronização, para não morrer em silêncio. */
    lastError: v.optional(v.string()),
    lastErrorAt: v.optional(v.number()),
  }),

  googleReviewsCache: defineTable({
    rating: v.number(),
    total: v.number(),
    fetchedAt: v.number(),
    reviews: v.array(
      v.object({
        author: v.string(),
        rating: v.number(),
        text: v.string(),
        relativeTime: v.string(),
        time: v.number(),
        profilePhotoUrl: v.optional(v.string()),
        language: v.optional(v.string()),
      }),
    ),
  }),
});
