import { v } from "convex/values";
import { withDisplayedReviewStats } from "./lib/displayedReviewStats";
import { resolveAddons } from "./lib/addons";
import { query, mutation } from "./_generated/server";
import { generateSlug } from "./lib/utils";
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination";
import { haversineKm, roundKm } from "./lib/geo";
import { urlDaImagem, apagarImagem, vImagem } from "./lib/imagens";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();

    const eventsWithUrls = await Promise.all(
      events.map(async (event) => {
        const bannerImageUrl = event.bannerImageId
          ? await urlDaImagem(ctx, event.bannerImageId)
          : null;

        const additionalBannerUrls = event.additionalBannerIds
          ? await Promise.all(
              event.additionalBannerIds.map((id) => urlDaImagem(ctx, id)),
            )
          : [];

        const translations = await ctx.db
          .query("eventTranslations")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();

        return withDisplayedReviewStats({
          ...event,
          bannerImageUrl,
          additionalBannerUrls: additionalBannerUrls.filter(Boolean),
          availableLanguages: [
            event.originalLanguage,
            ...translations.map((t) => t.locale),
          ],
        });
      }),
    );

    return eventsWithUrls.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    const events = await ctx.db.query("events").collect();

    // Default ordering mirrors `list`: newest first.
    let rows = events
      .map((event) => withDisplayedReviewStats(event))
      .sort((x, y) => y.createdAt - x.createdAt);

    rows = applySearch(rows, a.search, [
      (r) => r.title,
      (r) => r.location,
      (r) => r.venue,
    ]);

    const status = a.filters?.status;
    if (status) rows = rows.filter((r) => r.status === status);
    const location = a.filters?.location;
    if (location) rows = rows.filter((r) => r.location === location);

    rows = applySort(rows, a.sortBy, a.sortDir, {
      title: (r) => r.title.toLowerCase(),
      date: (r) => r.eventDate,
      // `?? basePrice` cai quando o deploy 2 tirar o campo antigo.
      price: (r) => r.privatePrice ?? r.basePrice ?? 0,
    });

    const result = paginate(rows, a.page, a.pageSize);
    const withUrls = await Promise.all(
      result.rows.map(async (event) => {
        const bannerImageUrl = event.bannerImageId
          ? await urlDaImagem(ctx, event.bannerImageId)
          : null;

        const additionalBannerUrls = event.additionalBannerIds
          ? await Promise.all(
              event.additionalBannerIds.map((id) => urlDaImagem(ctx, id)),
            )
          : [];

        const translations = await ctx.db
          .query("eventTranslations")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();

        return {
          ...event,
          bannerImageUrl,
          additionalBannerUrls: additionalBannerUrls.filter(Boolean),
          availableLanguages: [
            event.originalLanguage,
            ...translations.map((t) => t.locale),
          ],
        };
      }),
    );
    return { ...result, rows: withUrls };
  },
});

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    const eventsWithUrls = await Promise.all(
      events.map(async (event) => {
        const bannerImageUrl = event.bannerImageId
          ? await urlDaImagem(ctx, event.bannerImageId)
          : null;

        const translations = await ctx.db
          .query("eventTranslations")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();

        return withDisplayedReviewStats({
          ...event,
          bannerImageUrl,
          availableLanguages: [
            event.originalLanguage,
            ...translations.map((t) => t.locale),
          ],
        });
      }),
    );

    return eventsWithUrls.sort((a, b) => a.eventDate - b.eventDate);
  },
});

export const listUpcoming = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();

    const events = await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const upcomingEvents = events
      .filter((e) => e.eventDate >= now)
      .sort((a, b) => a.eventDate - b.eventDate)
      .slice(0, args.limit ?? 10);

    const eventsWithUrls = await Promise.all(
      upcomingEvents.map(async (event) => {
        const bannerImageUrl = event.bannerImageId
          ? await urlDaImagem(ctx, event.bannerImageId)
          : null;

        return withDisplayedReviewStats({
          ...event,
          bannerImageUrl,
        });
      }),
    );

    return eventsWithUrls;
  },
});

export const listByLocation = query({
  args: { location: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_location", (q) => q.eq("location", args.location))
      .collect();
    const publishedEvents = events.filter((e) => e.status === "published");

    const eventsWithUrls = await Promise.all(
      publishedEvents.map(async (event) => {
        const bannerImageUrl = event.bannerImageId
          ? await urlDaImagem(ctx, event.bannerImageId)
          : null;

        return withDisplayedReviewStats({
          ...event,
          bannerImageUrl,
        });
      }),
    );

    return eventsWithUrls.sort((a, b) => a.eventDate - b.eventDate);
  },
});

export const listFeatured = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect();
    const publishedFeatured = events
      .filter((e) => e.status === "published")
      .slice(0, args.limit ?? 6);

    const eventsWithUrls = await Promise.all(
      publishedFeatured.map(async (event) => {
        const bannerImageUrl = event.bannerImageId
          ? await urlDaImagem(ctx, event.bannerImageId)
          : null;

        return withDisplayedReviewStats({
          ...event,
          bannerImageUrl,
        });
      }),
    );

    return eventsWithUrls;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!event) return null;

    const bannerImageUrl = event.bannerImageId
      ? await urlDaImagem(ctx, event.bannerImageId)
      : null;

    const additionalBannerUrls = event.additionalBannerIds
      ? await Promise.all(
          event.additionalBannerIds.map((id) => urlDaImagem(ctx, id)),
        )
      : [];

    const galleryImageUrls = event.galleryImageIds
      ? await Promise.all(
          event.galleryImageIds.map((id) => urlDaImagem(ctx, id)),
        )
      : [];

    const translations = await ctx.db
      .query("eventTranslations")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();

    const reviews = await ctx.db
      .query("tourReviews")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();

    const approvedReviews = reviews.filter((r) => r.isApproved);

    // Os próprios deste evento mais os universais de âmbito "events".
    const addonsWithData = await resolveAddons(ctx, {
      eventId: event._id,
      disabled: event.disabledUniversalAddons,
    });

    const veiculo = event.vehicleId ? await ctx.db.get(event.vehicleId) : null;

    return withDisplayedReviewStats({
      ...event,
      bannerImageUrl,
      additionalBannerUrls: additionalBannerUrls.filter(Boolean),
      galleryImageUrls: galleryImageUrls.filter(Boolean),
      translations,
      reviews: approvedReviews,
      addons: addonsWithData,
      /* A viatura vem resolvida: o cartão precisa do nome da classe e dos
         lugares, e o checkout usa os lugares como limite. */
      vehicle: veiculo
        ? {
            _id: veiculo._id,
            name: veiculo.name,
            examples: veiculo.examples,
            passengers: veiculo.passengers,
          }
        : null,
      availableLanguages: [
        event.originalLanguage,
        ...translations.map((t) => t.locale),
      ],
    });
  },
});

export const getById = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) return null;

    const bannerImageUrl = event.bannerImageId
      ? await urlDaImagem(ctx, event.bannerImageId)
      : null;

    const additionalBannerUrls = event.additionalBannerIds
      ? await Promise.all(
          event.additionalBannerIds.map((id) => urlDaImagem(ctx, id)),
        )
      : [];

    const galleryImageUrls = event.galleryImageIds
      ? await Promise.all(
          event.galleryImageIds.map((id) => urlDaImagem(ctx, id)),
        )
      : [];

    const translations = await ctx.db
      .query("eventTranslations")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();

    return withDisplayedReviewStats({
      ...event,
      bannerImageUrl,
      additionalBannerUrls: additionalBannerUrls.filter(Boolean),
      galleryImageUrls: galleryImageUrls.filter(Boolean),
      translations,
      availableLanguages: [
        event.originalLanguage,
        ...translations.map((t) => t.locale),
      ],
    });
  },
});

export const getTranslation = query({
  args: {
    eventId: v.id("events"),
    locale: v.string(),
  },
  handler: async (ctx, args) => {
    const translation = await ctx.db
      .query("eventTranslations")
      .withIndex("by_event_locale", (q) =>
        q.eq("eventId", args.eventId).eq("locale", args.locale),
      )
      .first();

    return translation;
  },
});

export const getLocations = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    const locations = [...new Set(events.map((e) => e.location))];
    return locations.sort();
  },
});

export const listNearCoordinates = query({
  args: {
    lat: v.number(),
    lng: v.number(),
    radiusKm: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const radius = args.radiusKm ?? 30;
    const now = Date.now();

    const events = await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const upcomingEvents = events.filter((e) => e.eventDate >= now);

    const eventsWithDistance = upcomingEvents
      .map((event) => {
        const eventLat = event.meetingPoint?.lat;
        const eventLng = event.meetingPoint?.lng;
        if (eventLat == null || eventLng == null) return null;
        const distance = haversineKm(
          { lat: args.lat, lng: args.lng },
          { lat: eventLat, lng: eventLng },
        );
        if (distance > radius) return null;
        return { event, distance: roundKm(distance) };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.distance - b.distance);

    const result = await Promise.all(
      eventsWithDistance.map(async ({ event, distance }) => {
        const bannerImageUrl = event.bannerImageId
          ? await urlDaImagem(ctx, event.bannerImageId)
          : null;

        const addons = await resolveAddons(ctx, {
          eventId: event._id,
          disabled: event.disabledUniversalAddons,
          trimmed: false,
        });

        const translations = await ctx.db
          .query("eventTranslations")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();

        return withDisplayedReviewStats({
          ...event,
          bannerImageUrl,
          distanceKm: distance,
          addons,
          translations,
        });
      }),
    );

    return result;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getStorageUrl = query({
  args: { storageId: vImagem },
  handler: async (ctx, args) => {
    return await urlDaImagem(ctx, args.storageId);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
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
    privatePrice: v.number(),
    sharedPrice: v.optional(v.number()),
    currency: v.string(),
    bannerImageId: v.optional(vImagem),
    additionalBannerIds: v.optional(v.array(vImagem)),
    galleryImageIds: v.optional(v.array(vImagem)),
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
    minPassengers: v.optional(v.number()),
    maxPassengers: v.optional(v.number()),
    returnAt: v.optional(v.number()),
    vehicleId: v.optional(v.id("vehicles")),
    confirmationHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.isFeatured) {
      const featuredCount = await ctx.db
        .query("events")
        .withIndex("by_featured", (q) => q.eq("isFeatured", true))
        .collect();
      if (featuredCount.length >= 6) {
        throw new Error("Maximum of 6 featured events allowed");
      }
    }

    const now = Date.now();
    let slug = generateSlug(args.title);

    const existing = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (existing) {
      slug = `${slug}-${now}`;
    }

    const eventId = await ctx.db.insert("events", {
      ...args,
      slug,
      rating: 0,
      reviewCount: 0,
      publishedAt: args.status === "published" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    return eventId;
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    title: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    description: v.optional(v.any()),
    originalLanguage: v.optional(v.string()),
    location: v.optional(v.string()),
    venue: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    isFeatured: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("published"),
        v.literal("cancelled"),
        v.literal("completed"),
      ),
    ),
    maxCapacity: v.optional(v.number()),
    privatePrice: v.optional(v.number()),
    sharedPrice: v.optional(v.number()),
    currency: v.optional(v.string()),
    bannerImageId: v.optional(vImagem),
    additionalBannerIds: v.optional(v.array(vImagem)),
    galleryImageIds: v.optional(v.array(vImagem)),
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
    minPassengers: v.optional(v.number()),
    maxPassengers: v.optional(v.number()),
    returnAt: v.optional(v.number()),
    vehicleId: v.optional(v.id("vehicles")),
    confirmationHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Event not found");

    if (data.isFeatured && !existing.isFeatured) {
      const featuredCount = await ctx.db
        .query("events")
        .withIndex("by_featured", (q) => q.eq("isFeatured", true))
        .collect();
      if (featuredCount.length >= 6) {
        throw new Error("Maximum of 6 featured events allowed");
      }
    }

    const now = Date.now();

    let publishedAt = existing.publishedAt;
    if (
      data.status === "published" ||
      (data.status === undefined &&
        data.isActive === true &&
        existing.status !== "published")
    ) {
      publishedAt = now;
    }

    await ctx.db.patch(id, {
      ...data,
      publishedAt,
      updatedAt: now,
    });

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");

    const translations = await ctx.db
      .query("eventTranslations")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();

    for (const translation of translations) {
      await ctx.db.delete(translation._id);
    }

    const eventAddons = await ctx.db
      .query("tourAddons")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();

    for (const addon of eventAddons) {
      const addonTranslations = await ctx.db
        .query("tourAddonTranslations")
        .withIndex("by_addon", (q) => q.eq("addonId", addon._id))
        .collect();
      for (const at of addonTranslations) {
        await ctx.db.delete(at._id);
      }
      if (addon.imageId) {
        await apagarImagem(ctx, addon.imageId);
      }
      await ctx.db.delete(addon._id);
    }

    const reviews = await ctx.db
      .query("tourReviews")
      .withIndex("by_event", (q) => q.eq("eventId", args.id))
      .collect();

    for (const review of reviews) {
      await ctx.db.delete(review._id);
    }

    if (event.bannerImageId) {
      await apagarImagem(ctx, event.bannerImageId);
    }

    if (event.additionalBannerIds) {
      for (const imageId of event.additionalBannerIds) {
        await apagarImagem(ctx, imageId);
      }
    }

    if (event.galleryImageIds) {
      for (const imageId of event.galleryImageIds) {
        await apagarImagem(ctx, imageId);
      }
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const publish = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "published",
      publishedAt: event.publishedAt ?? now,
      updatedAt: now,
    });

    return args.id;
  },
});

export const unpublish = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");

    await ctx.db.patch(args.id, {
      status: "draft",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const cancel = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");

    await ctx.db.patch(args.id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

export const countFeatured = query({
  args: {},
  handler: async (ctx) => {
    const featured = await ctx.db
      .query("events")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect();
    return featured.length;
  },
});

export const toggleFeatured = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (!event) throw new Error("Event not found");

    if (!event.isFeatured) {
      const featuredCount = await ctx.db
        .query("events")
        .withIndex("by_featured", (q) => q.eq("isFeatured", true))
        .collect();
      if (featuredCount.length >= 6) {
        throw new Error("Maximum of 6 featured events allowed");
      }
    }

    await ctx.db.patch(args.id, {
      isFeatured: !event.isFeatured,
      updatedAt: Date.now(),
    });

    return !event.isFeatured;
  },
});

export const upsertTranslation = mutation({
  args: {
    eventId: v.id("events"),
    locale: v.string(),
    title: v.string(),
    subtitle: v.optional(v.string()),
    description: v.any(),
    included: v.optional(v.array(v.string())),
    excluded: v.optional(v.array(v.string())),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");

    if (args.locale === event.originalLanguage) {
      throw new Error("Cannot create translation in the original language");
    }

    const existing = await ctx.db
      .query("eventTranslations")
      .withIndex("by_event_locale", (q) =>
        q.eq("eventId", args.eventId).eq("locale", args.locale),
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        subtitle: args.subtitle,
        description: args.description,
        included: args.included,
        excluded: args.excluded,
        seoTitle: args.seoTitle,
        seoDescription: args.seoDescription,
        updatedAt: now,
      });
      return existing._id;
    }

    const translationId = await ctx.db.insert("eventTranslations", {
      eventId: args.eventId,
      locale: args.locale,
      title: args.title,
      subtitle: args.subtitle,
      description: args.description,
      included: args.included,
      excluded: args.excluded,
      seoTitle: args.seoTitle,
      seoDescription: args.seoDescription,
      updatedAt: now,
    });

    return translationId;
  },
});

export const removeTranslation = mutation({
  args: {
    eventId: v.id("events"),
    locale: v.string(),
  },
  handler: async (ctx, args) => {
    const translation = await ctx.db
      .query("eventTranslations")
      .withIndex("by_event_locale", (q) =>
        q.eq("eventId", args.eventId).eq("locale", args.locale),
      )
      .first();

    if (!translation) throw new Error("Translation not found");

    await ctx.db.delete(translation._id);
    return translation._id;
  },
});

export const updateRating = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("tourReviews")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const approvedReviews = reviews.filter((r) => r.isApproved);
    const reviewCount = approvedReviews.length;
    const rating =
      reviewCount > 0
        ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
        : 0;

    await ctx.db.patch(args.eventId, {
      rating: Math.round(rating * 10) / 10,
      reviewCount,
      updatedAt: Date.now(),
    });

    return { rating, reviewCount };
  },
});

/* ---------------------------------------------------------------------------
   Migração dos preços.

   `basePrice` passou a `privatePrice`, e `originalPrice` — o preço riscado —
   desapareceu por ser igual ao outro em todos os eventos: um desconto a fingir.

   São dois passos e dois deploys de propósito. O Convex valida o schema contra
   os documentos que já lá estão; trocar o nome de um campo obrigatório de uma
   só vez fazia o deploy rebentar com os eventos existentes.
   --------------------------------------------------------------------------- */

/** Passo 1: copia `basePrice` para `privatePrice` em quem ainda não o tem. */
export const backfillPrivatePrice = mutation({
  args: {},
  handler: async (ctx) => {
    const eventos = await ctx.db.query("events").collect();
    let copiados = 0;
    let semOrigem = 0;

    for (const e of eventos) {
      if (e.privatePrice !== undefined) continue;
      if (e.basePrice === undefined) {
        semOrigem++;
        continue;
      }
      await ctx.db.patch(e._id, { privatePrice: e.basePrice, updatedAt: Date.now() });
      copiados++;
    }

    return { total: eventos.length, copiados, semOrigem };
  },
});

/**
 * Passo 2, só depois de o deploy seguinte tirar os campos do schema: limpa
 * `basePrice` e `originalPrice` dos documentos.
 *
 * Recusa-se a correr enquanto houver um evento sem `privatePrice` — apagar a
 * origem antes de a cópia estar feita deixava o evento sem preço nenhum.
 */
export const dropLegacyPrices = mutation({
  args: {},
  handler: async (ctx) => {
    const eventos = await ctx.db.query("events").collect();

    const porCopiar = eventos.filter(
      (e) => e.privatePrice === undefined && e.basePrice !== undefined,
    );
    if (porCopiar.length > 0) {
      throw new Error(
        `Há ${porCopiar.length} eventos sem privatePrice. Corre primeiro o backfill.`,
      );
    }

    let limpos = 0;
    for (const e of eventos) {
      if (e.basePrice === undefined && e.originalPrice === undefined) continue;
      await ctx.db.patch(e._id, {
        basePrice: undefined,
        originalPrice: undefined,
        updatedAt: Date.now(),
      });
      limpos++;
    }

    return { limpos };
  },
});
