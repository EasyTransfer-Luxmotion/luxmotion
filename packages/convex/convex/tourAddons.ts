import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { urlDaImagem, vImagem } from "./lib/imagens";
import { exigirAdmin } from "./lib/admin";

export const listByTour = query({
  args: { tourId: v.id("tours") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, ["extras", "tours", "eventos"], "ver");
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
    await exigirAdmin(ctx, ["extras", "tours", "eventos"], "ver");
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
    await exigirAdmin(ctx, ["extras", "tours", "eventos"]);
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
    await exigirAdmin(ctx, ["extras", "tours", "eventos"]);
    const { id, ...data } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new ConvexError("Este extra já não existe — talvez tenha sido apagado noutra janela.");

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
    await exigirAdmin(ctx, ["extras", "tours", "eventos"]);
    const addon = await ctx.db.get(args.id);
    if (!addon) throw new ConvexError("Este extra já não existe — talvez tenha sido apagado noutra janela.");

    const translations = await ctx.db
      .query("tourAddonTranslations")
      .withIndex("by_addon", (q) => q.eq("addonId", args.id))
      .collect();

    for (const t of translations) {
      await ctx.db.delete(t._id);
    }

    /* O ficheiro da imagem não se apaga. Verificar só os outros extras e a biblioteca
       não chegava: o mesmo ficheiro pode estar em veículos, tours ou eventos
       (a migração para o Bunny juntou as cópias iguais). Ver lib/imagens.ts. */

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
    await exigirAdmin(ctx, ["extras", "tours", "eventos"]);
    const addon = await ctx.db.get(args.addonId);
    if (!addon) throw new ConvexError("Este extra já não existe — talvez tenha sido apagado noutra janela.");

    if (args.locale === addon.originalLanguage) {
      throw new ConvexError("Este é o idioma em que o texto foi escrito: não leva tradução.");
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


/* Apagar a tradução de um extra: no editor, esvaziar o título e a descrição
   num idioma. Não havia como, e o site ficava com a tradução para sempre. */
export const removeTranslation = mutation({
  args: { addonId: v.id("tourAddons"), locale: v.string() },
  handler: async (ctx, { addonId, locale }) => {
    await exigirAdmin(ctx, ["extras", "tours", "eventos"]);
    const existing = await ctx.db
      .query("tourAddonTranslations")
      .withIndex("by_addon_locale", (q) => q.eq("addonId", addonId).eq("locale", locale))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});
