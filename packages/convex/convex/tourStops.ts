import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { urlDaImagem, apagarImagem, vImagem } from "./lib/imagens";

export const listByTour = query({
  args: { tourId: v.id("tours") },
  handler: async (ctx, args) => {
    const stops = await ctx.db
      .query("tourStops")
      .withIndex("by_tour", (q) => q.eq("tourId", args.tourId))
      .collect();

    const stopsWithUrls = await Promise.all(
      stops.map(async (stop) => {
        const imageUrl = stop.imageId
          ? await urlDaImagem(ctx, stop.imageId)
          : null;

        const translations = await ctx.db
          .query("tourStopTranslations")
          .withIndex("by_stop", (q) => q.eq("stopId", stop._id))
          .collect();

        return {
          ...stop,
          imageUrl,
          translations,
        };
      })
    );

    return stopsWithUrls.sort((a, b) => a.order - b.order);
  },
});

export const getById = query({
  args: { id: v.id("tourStops") },
  handler: async (ctx, args) => {
    const stop = await ctx.db.get(args.id);
    if (!stop) return null;

    const imageUrl = stop.imageId
      ? await urlDaImagem(ctx, stop.imageId)
      : null;

    const translations = await ctx.db
      .query("tourStopTranslations")
      .withIndex("by_stop", (q) => q.eq("stopId", stop._id))
      .collect();

    return {
      ...stop,
      imageUrl,
      translations,
    };
  },
});

export const getStopTranslation = query({
  args: {
    stopId: v.id("tourStops"),
    locale: v.string(),
  },
  handler: async (ctx, args) => {
    const translation = await ctx.db
      .query("tourStopTranslations")
      .withIndex("by_stop_locale", (q) =>
        q.eq("stopId", args.stopId).eq("locale", args.locale)
      )
      .first();

    return translation;
  },
});

export const create = mutation({
  args: {
    tourId: v.id("tours"),
    time: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    imageId: v.optional(vImagem),
    showImage: v.boolean(),
    address: v.optional(v.string()),
    placeId: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tour = await ctx.db.get(args.tourId);
    if (!tour) throw new Error("Tour not found");

    const existingStops = await ctx.db
      .query("tourStops")
      .withIndex("by_tour", (q) => q.eq("tourId", args.tourId))
      .collect();

    const maxOrder = existingStops.length > 0
      ? Math.max(...existingStops.map((s) => s.order))
      : -1;

    const now = Date.now();
    const stopId = await ctx.db.insert("tourStops", {
      ...args,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    return stopId;
  },
});

export const update = mutation({
  args: {
    id: v.id("tourStops"),
    time: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageId: v.optional(vImagem),
    showImage: v.optional(v.boolean()),
    address: v.optional(v.string()),
    placeId: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Tour stop not found");

    await ctx.db.patch(id, {
      ...data,
      updatedAt: Date.now(),
    });

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("tourStops") },
  handler: async (ctx, args) => {
    const stop = await ctx.db.get(args.id);
    if (!stop) throw new Error("Tour stop not found");

    const translations = await ctx.db
      .query("tourStopTranslations")
      .withIndex("by_stop", (q) => q.eq("stopId", args.id))
      .collect();

    for (const translation of translations) {
      await ctx.db.delete(translation._id);
    }

    if (stop.imageId) {
      await apagarImagem(ctx, stop.imageId);
    }

    await ctx.db.delete(args.id);

    const remainingStops = await ctx.db
      .query("tourStops")
      .withIndex("by_tour", (q) => q.eq("tourId", stop.tourId))
      .collect();

    const sortedStops = remainingStops.sort((a, b) => a.order - b.order);

    for (let i = 0; i < sortedStops.length; i++) {
      const stop = sortedStops[i]
      if (stop && stop.order !== i) {
        await ctx.db.patch(stop._id, { order: i });
      }
    }

    return args.id;
  },
});

export const reorder = mutation({
  args: {
    tourId: v.id("tours"),
    stopIds: v.array(v.id("tourStops")),
  },
  handler: async (ctx, args) => {
    const tour = await ctx.db.get(args.tourId);
    if (!tour) throw new Error("Tour not found");

    const now = Date.now();

    for (let i = 0; i < args.stopIds.length; i++) {
      const stopId = args.stopIds[i]
      if (stopId) {
        await ctx.db.patch(stopId, {
          order: i,
          updatedAt: now,
        });
      }
    }

    return true;
  },
});

export const upsertTranslation = mutation({
  args: {
    stopId: v.id("tourStops"),
    locale: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const stop = await ctx.db.get(args.stopId);
    if (!stop) throw new Error("Tour stop not found");

    const tour = await ctx.db.get(stop.tourId);
    if (!tour) throw new Error("Tour not found");

    if (args.locale === tour.originalLanguage) {
      throw new Error("Cannot create translation in the original language");
    }

    const existing = await ctx.db
      .query("tourStopTranslations")
      .withIndex("by_stop_locale", (q) =>
        q.eq("stopId", args.stopId).eq("locale", args.locale)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        updatedAt: now,
      });
      return existing._id;
    }

    const translationId = await ctx.db.insert("tourStopTranslations", {
      stopId: args.stopId,
      locale: args.locale,
      title: args.title,
      description: args.description,
      updatedAt: now,
    });

    return translationId;
  },
});

export const removeTranslation = mutation({
  args: {
    stopId: v.id("tourStops"),
    locale: v.string(),
  },
  handler: async (ctx, args) => {
    const translation = await ctx.db
      .query("tourStopTranslations")
      .withIndex("by_stop_locale", (q) =>
        q.eq("stopId", args.stopId).eq("locale", args.locale)
      )
      .first();

    if (!translation) throw new Error("Translation not found");

    await ctx.db.delete(translation._id);
    return translation._id;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
