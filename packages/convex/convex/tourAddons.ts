import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { urlDaImagem, apagarImagem, vImagem } from "./lib/imagens";
import { exigirAdmin } from "./lib/admin";

export const listByTour = query({
  args: { tourId: v.id("tours") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const addons = await ctx.db
      .query("tourAddons")
      .withIndex("by_tour", (q) => q.eq("tourId", args.tourId))
      .collect();

    const sorted = addons.sort((a, b) => a.order - b.order);

    return await Promise.all(
      sorted.map(async (addon) => {
        const imageUrl = addon.imageId
          ? await urlDaImagem(ctx, addon.imageId)
          : null;
        const translations = await ctx.db
          .query("tourAddonTranslations")
          .withIndex("by_addon", (q) => q.eq("addonId", addon._id))
          .collect();
        return { ...addon, imageUrl, translations };
      })
    );
  },
});

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const addons = await ctx.db
      .query("tourAddons")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const sorted = addons.sort((a, b) => a.order - b.order);

    return await Promise.all(
      sorted.map(async (addon) => {
        const imageUrl = addon.imageId
          ? await urlDaImagem(ctx, addon.imageId)
          : null;
        const translations = await ctx.db
          .query("tourAddonTranslations")
          .withIndex("by_addon", (q) => q.eq("addonId", addon._id))
          .collect();
        return { ...addon, imageUrl, translations };
      })
    );
  },
});

export const getTranslation = query({
  args: {
    addonId: v.id("tourAddons"),
    locale: v.string(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    return await ctx.db
      .query("tourAddonTranslations")
      .withIndex("by_addon_locale", (q) =>
        q.eq("addonId", args.addonId).eq("locale", args.locale)
      )
      .first();
  },
});

export const create = mutation({
  args: {
    tourId: v.optional(v.id("tours")),
    eventId: v.optional(v.id("events")),
    title: v.string(),
    description: v.optional(v.string()),
    imageId: v.optional(vImagem),
    price: v.number(),
    pricingType: v.union(v.literal("per_person"), v.literal("flat")),
    currency: v.string(),
    originalLanguage: v.string(),
    order: v.number(),
    status: v.union(v.literal("draft"), v.literal("published")),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const now = Date.now();
    return await ctx.db.insert("tourAddons", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("tourAddons"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    /* `null` limpa a imagem; ausente deixa como está. Sem o `null` não havia
       maneira de tirar uma imagem: `undefined` é indistinguível de "não mexas". */
    imageId: v.optional(v.union(vImagem, v.null())),
    price: v.optional(v.number()),
    pricingType: v.optional(v.union(v.literal("per_person"), v.literal("flat"))),
    currency: v.optional(v.string()),
    order: v.optional(v.number()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const { id, ...data } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Addon not found");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.imageId !== undefined) updates.imageId = data.imageId ?? undefined;
    if (data.price !== undefined) updates.price = data.price;
    if (data.pricingType !== undefined) updates.pricingType = data.pricingType;
    if (data.currency !== undefined) updates.currency = data.currency;
    if (data.order !== undefined) updates.order = data.order;
    if (data.status !== undefined) updates.status = data.status;

    await ctx.db.patch(id, updates);
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("tourAddons") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const addon = await ctx.db.get(args.id);
    if (!addon) throw new Error("Addon not found");

    const translations = await ctx.db
      .query("tourAddonTranslations")
      .withIndex("by_addon", (q) => q.eq("addonId", args.id))
      .collect();

    for (const t of translations) {
      await ctx.db.delete(t._id);
    }

    /* Só se apaga o ficheiro se mais ninguém o usar. Desde que as imagens
       passaram a ser partilhadas entre extras, apagar um extra apagava a imagem
       debaixo dos pés de todos os outros que apontavam para o mesmo ficheiro. */
    if (addon.imageId) {
      const outros = await ctx.db.query("tourAddons").collect();
      const usadaPorOutro = outros.some(
        (a) => a._id !== args.id && a.imageId === addon.imageId,
      );
      const naBiblioteca = await ctx.db
        .query("addonImages")
        .withIndex("by_storage", (q) => q.eq("storageId", addon.imageId!))
        .first();

      if (!usadaPorOutro && !naBiblioteca) {
        await apagarImagem(ctx, addon.imageId);
      }
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const upsertTranslation = mutation({
  args: {
    addonId: v.id("tourAddons"),
    locale: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const addon = await ctx.db.get(args.addonId);
    if (!addon) throw new Error("Addon not found");

    if (args.locale === addon.originalLanguage) {
      throw new Error("Cannot create translation in the original language");
    }

    const existing = await ctx.db
      .query("tourAddonTranslations")
      .withIndex("by_addon_locale", (q) =>
        q.eq("addonId", args.addonId).eq("locale", args.locale)
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

    return await ctx.db.insert("tourAddonTranslations", {
      addonId: args.addonId,
      locale: args.locale,
      title: args.title,
      description: args.description,
      updatedAt: now,
    });
  },
});

