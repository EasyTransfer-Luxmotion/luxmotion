import { legacyUpsellTranslations } from "./lib/upsellTranslations";
import { v } from "convex/values";
import { catalogTranslationsValidator } from "./lib/catalogTranslations";
import { query, mutation, internalMutation } from "./_generated/server";
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination";
import { haversineKm, roundKm } from "./lib/geo";
import { siteSettingsDefaults } from "./siteSettings";
import { urlDaImagem, apagarImagem, vImagem } from "./lib/imagens";
import { exigirAdmin } from "./lib/admin";

/* Extras oferecidos a meio do checkout de um transfer: paragens curtas no
   trajecto e experiências no destino. Ver o comentário das tabelas no schema
   para o porquê de não viverem em `tours`. */

const locationValidator = v.object({
  title: v.string(),
  address: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  placeId: v.optional(v.string()),
});

const tagValidator = v.union(
  v.literal("none"),
  v.literal("recommended"),
  v.literal("mostPopular"),
);

const statusValidator = v.union(v.literal("draft"), v.literal("published"));

const addonValidator = v.object({
  name: v.string(),
  translations: v.optional(catalogTranslationsValidator),
  price: v.number(),
  pricingType: v.optional(v.union(v.literal("per_person"), v.literal("flat"))),
});

/* ---------------------------------------------------------------------------
   Leitura pública — o cross-match do checkout
--------------------------------------------------------------------------- */

type UpsellRow = {
  order: number;
  universal: boolean;
  location?: { lat?: number; lng?: number };
};

/**
 * Upsells a oferecer para um dado destino.
 *
 * `universal: true` ignora a geografia. Os restantes só entram se estiverem a
 * menos de `siteSettings.checkoutUpsellRadiusKm` do ponto pedido — e um upsell
 * sem coordenadas nunca é geográfico, por isso só aparece se for universal.
 */
export const listForDestination = query({
  args: {
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    radiusKm: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .first();
    const stored = settings?.checkoutUpsellRadiusKm;
    const radius =
      args.radiusKm ??
      (typeof stored === "number" && stored > 0
        ? stored
        : siteSettingsDefaults.checkoutUpsellRadiusKm);

    const destination =
      args.lat != null && args.lng != null
        ? { lat: args.lat, lng: args.lng }
        : null;

    const [stopRows, experienceRows] = await Promise.all([
      ctx.db
        .query("upsellStops")
        .withIndex("by_status", (q) => q.eq("status", "published"))
        .collect(),
      ctx.db
        .query("upsellExperiences")
        .withIndex("by_status", (q) => q.eq("status", "published"))
        .collect(),
    ]);

    /* Devolve as linhas a mostrar, cada uma com a distância ao destino
       (`null` nos universais, que não dependem de onde o cliente vai).
       A ordem é a que o admin definiu, não a distância. */
    const keep = <T extends UpsellRow>(rows: T[]) =>
      rows
        .map((row) => {
          if (row.universal) return { row, distanceKm: null };
          if (!destination) return null;
          const { lat, lng } = row.location ?? {};
          if (lat == null || lng == null) return null;
          const km = haversineKm(destination, { lat, lng });
          return km > radius ? null : { row, distanceKm: roundKm(km) };
        })
        .filter((item): item is { row: T; distanceKm: number | null } =>
          Boolean(item),
        )
        .sort((a, b) => a.row.order - b.row.order);

    const stops = await Promise.all(
      keep(stopRows).map(async ({ row, distanceKm }) => ({
        _id: row._id,
        title: row.title,
        translations: row.translations ?? await legacyUpsellTranslations(ctx, row.title, "stops"),
        description: row.description ?? "",
        imageUrl: row.imageId ? await urlDaImagem(ctx, row.imageId) : null,
        price15: row.price15 ?? null,
        price30: row.price30,
        currency: row.currency,
        tag: row.tag,
        universal: row.universal,
        location: row.location ?? null,
        distanceKm,
      })),
    );

    const experiences = await Promise.all(
      keep(experienceRows).map(async ({ row, distanceKm }) => ({
        _id: row._id,
        title: row.title,
        translations: row.translations ?? await legacyUpsellTranslations(ctx, row.title, "experiences"),
        description: row.description ?? "",
        imageUrl: row.imageId ? await urlDaImagem(ctx, row.imageId) : null,
        basePrice: row.basePrice,
        pricingModel: row.pricingModel,
        currency: row.currency,
        duration: row.duration ?? "",
        addons: (row.addons ?? []).map((addon, index) => ({
          id: `${row._id}:${index}`,
          name: addon.name,
          translations: addon.translations,
          price: addon.price,
          pricingType: addon.pricingType ?? "flat",
        })),
        hasDateField: row.hasDateField,
        hasSpecialRequest: row.hasSpecialRequest,
        tag: row.tag,
        universal: row.universal,
        location: row.location ?? null,
        distanceKm,
      })),
    );

    return { stops, experiences };
  },
});

/* ---------------------------------------------------------------------------
   Admin — paragens extra
--------------------------------------------------------------------------- */

export const listStopsPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    await exigirAdmin(ctx);
    const all = await ctx.db.query("upsellStops").collect();
    let rows = [...all].sort((x, y) => x.order - y.order);

    rows = applySearch(rows, a.search, [
      (r) => r.title,
      (r) => r.description,
      (r) => r.location?.title,
      (r) => r.location?.address,
    ]);

    const status = a.filters?.status;
    if (status) rows = rows.filter((r) => r.status === status);
    const scope = a.filters?.scope;
    if (scope === "universal") rows = rows.filter((r) => r.universal);
    if (scope === "geographic") rows = rows.filter((r) => !r.universal);

    rows = applySort(rows, a.sortBy, a.sortDir, {
      title: (r) => r.title.toLowerCase(),
      price: (r) => r.price30,
      order: (r) => r.order,
      updated: (r) => r.updatedAt,
    });

    const result = paginate(rows, a.page, a.pageSize);
    const withUrls = await Promise.all(
      result.rows.map(async (row) => ({
        ...row,
        translations: row.translations ?? await legacyUpsellTranslations(ctx, row.title, "stops"),
        imageUrl: row.imageId ? await urlDaImagem(ctx, row.imageId) : null,
      })),
    );
    return { ...result, rows: withUrls };
  },
});

export const getStop = query({
  args: { id: v.id("upsellStops") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
    const row = await ctx.db.get(id);
    if (!row) return null;
    return {
      ...row,
      translations: row.translations ?? await legacyUpsellTranslations(ctx, row.title, "stops"),
      imageUrl: row.imageId ? await urlDaImagem(ctx, row.imageId) : null,
    };
  },
});

const stopFields = {
  title: v.string(),
  translations: v.optional(catalogTranslationsValidator),
  description: v.optional(v.string()),
  imageId: v.optional(vImagem),
  location: v.optional(locationValidator),
  price15: v.optional(v.number()),
  price30: v.number(),
  currency: v.optional(v.string()),
  tag: tagValidator,
  universal: v.boolean(),
  status: statusValidator,
  order: v.optional(v.number()),
} as const;

export const createStop = mutation({
  args: stopFields,
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const now = Date.now();
    // Novo entra no fim da lista, para o admin não ter de reordenar tudo.
    const last = await ctx.db.query("upsellStops").collect();
    const order =
      args.order ?? last.reduce((max, r) => Math.max(max, r.order + 1), 0);
    return await ctx.db.insert("upsellStops", {
      ...args,
      currency: args.currency ?? "EUR",
      order,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStop = mutation({
  args: {
    id: v.id("upsellStops"),
    title: v.optional(v.string()),
    translations: v.optional(catalogTranslationsValidator),
    description: v.optional(v.string()),
    imageId: v.optional(vImagem),
    location: v.optional(locationValidator),
    price15: v.optional(v.number()),
    price30: v.optional(v.number()),
    currency: v.optional(v.string()),
    tag: v.optional(tagValidator),
    universal: v.optional(v.boolean()),
    status: v.optional(statusValidator),
    order: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await exigirAdmin(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Upsell stop not found");
    if (
      patch.imageId &&
      existing.imageId &&
      patch.imageId !== existing.imageId
    ) {
      await apagarImagem(ctx, existing.imageId);
    }
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
    return id;
  },
});

export const removeStop = mutation({
  args: { id: v.id("upsellStops") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Upsell stop not found");
    if (row.imageId) await apagarImagem(ctx, row.imageId);
    await ctx.db.delete(id);
  },
});

/* ---------------------------------------------------------------------------
   Admin — experiências
--------------------------------------------------------------------------- */

export const listExperiencesPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    await exigirAdmin(ctx);
    const all = await ctx.db.query("upsellExperiences").collect();
    let rows = [...all].sort((x, y) => x.order - y.order);

    rows = applySearch(rows, a.search, [
      (r) => r.title,
      (r) => r.description,
      (r) => r.location?.title,
      (r) => r.location?.address,
    ]);

    const status = a.filters?.status;
    if (status) rows = rows.filter((r) => r.status === status);
    const scope = a.filters?.scope;
    if (scope === "universal") rows = rows.filter((r) => r.universal);
    if (scope === "geographic") rows = rows.filter((r) => !r.universal);
    const pricing = a.filters?.pricingModel;
    if (pricing) rows = rows.filter((r) => r.pricingModel === pricing);

    rows = applySort(rows, a.sortBy, a.sortDir, {
      title: (r) => r.title.toLowerCase(),
      price: (r) => r.basePrice,
      order: (r) => r.order,
      updated: (r) => r.updatedAt,
    });

    const result = paginate(rows, a.page, a.pageSize);
    const withUrls = await Promise.all(
      result.rows.map(async (row) => ({
        ...row,
        translations: row.translations ?? await legacyUpsellTranslations(ctx, row.title, "experiences"),
        imageUrl: row.imageId ? await urlDaImagem(ctx, row.imageId) : null,
      })),
    );
    return { ...result, rows: withUrls };
  },
});

export const getExperience = query({
  args: { id: v.id("upsellExperiences") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
    const row = await ctx.db.get(id);
    if (!row) return null;
    return {
      ...row,
      translations: row.translations ?? await legacyUpsellTranslations(ctx, row.title, "experiences"),
      imageUrl: row.imageId ? await urlDaImagem(ctx, row.imageId) : null,
    };
  },
});

const experienceFields = {
  title: v.string(),
  translations: v.optional(catalogTranslationsValidator),
  description: v.optional(v.string()),
  imageId: v.optional(vImagem),
  location: v.optional(locationValidator),
  basePrice: v.number(),
  pricingModel: v.union(v.literal("perPerson"), v.literal("flat")),
  currency: v.optional(v.string()),
  duration: v.optional(v.string()),
  addons: v.optional(v.array(addonValidator)),
  hasDateField: v.boolean(),
  hasSpecialRequest: v.boolean(),
  tag: tagValidator,
  universal: v.boolean(),
  status: statusValidator,
  order: v.optional(v.number()),
} as const;

export const createExperience = mutation({
  args: experienceFields,
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const now = Date.now();
    const last = await ctx.db.query("upsellExperiences").collect();
    const order =
      args.order ?? last.reduce((max, r) => Math.max(max, r.order + 1), 0);
    return await ctx.db.insert("upsellExperiences", {
      ...args,
      currency: args.currency ?? "EUR",
      order,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateExperience = mutation({
  args: {
    id: v.id("upsellExperiences"),
    title: v.optional(v.string()),
    translations: v.optional(catalogTranslationsValidator),
    description: v.optional(v.string()),
    imageId: v.optional(vImagem),
    location: v.optional(locationValidator),
    basePrice: v.optional(v.number()),
    pricingModel: v.optional(
      v.union(v.literal("perPerson"), v.literal("flat")),
    ),
    currency: v.optional(v.string()),
    duration: v.optional(v.string()),
    addons: v.optional(v.array(addonValidator)),
    hasDateField: v.optional(v.boolean()),
    hasSpecialRequest: v.optional(v.boolean()),
    tag: v.optional(tagValidator),
    universal: v.optional(v.boolean()),
    status: v.optional(statusValidator),
    order: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await exigirAdmin(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Upsell experience not found");
    if (
      patch.imageId &&
      existing.imageId &&
      patch.imageId !== existing.imageId
    ) {
      await apagarImagem(ctx, existing.imageId);
    }
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
    return id;
  },
});

export const removeExperience = mutation({
  args: { id: v.id("upsellExperiences") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Upsell experience not found");
    if (row.imageId) await apagarImagem(ctx, row.imageId);
    await ctx.db.delete(id);
  },
});

/* ---------------------------------------------------------------------------
   Migração de uso único

   Copia as linhas de `tours` com categoria `stops`/`experiences` para as
   tabelas novas. Não apaga nada: as originais deixam de aparecer no checkout
   mas ficam lá até se confirmar que a migração correu bem.

   Correr do dashboard do Convex:
     npx convex run upsells:migrateFromTours '{"dryRun": true}'
--------------------------------------------------------------------------- */

export const migrateFromTours = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const tours = await ctx.db.query("tours").collect();
    const candidates = tours.filter(
      (t) => t.category === "stops" || t.category === "experiences",
    );

    const [existingStops, existingExperiences] = await Promise.all([
      ctx.db.query("upsellStops").collect(),
      ctx.db.query("upsellExperiences").collect(),
    ]);
    // Reexecutar não pode duplicar: o título é a chave prática, já que as
    // linhas novas não guardam de onde vieram.
    const stopTitles = new Set(existingStops.map((r) => r.title));
    const experienceTitles = new Set(existingExperiences.map((r) => r.title));

    const created: string[] = [];
    const skipped: string[] = [];
    const needsAttention: string[] = [];
    const now = Date.now();

    for (const tour of candidates) {
      const isStop = tour.category === "stops";
      if (
        isStop ? stopTitles.has(tour.title) : experienceTitles.has(tour.title)
      ) {
        skipped.push(`${tour.title} (já existe)`);
        continue;
      }

      const location = tour.pickup
        ? {
            title: tour.pickup.title,
            address: tour.pickup.address,
            lat: tour.pickup.lat ?? tour.mapCenter?.lat,
            lng: tour.pickup.lng ?? tour.mapCenter?.lng,
            placeId: tour.pickup.placeId,
          }
        : undefined;

      if (location?.lat == null || location?.lng == null) {
        // Sem coordenadas o cross-match nunca o mostra — fica dito.
        needsAttention.push(`${tour.title}: sem coordenadas`);
      }

      const translations = await legacyUpsellTranslations(ctx, tour.title, isStop ? "stops" : "experiences");
      if (!dryRun) {
        if (isStop) {
          await ctx.db.insert("upsellStops", {
            title: tour.title,
            translations,
            description: tour.subtitle,
            imageId: tour.bannerImageId,
            location,
            // price15 não existe nos tours; fica por preencher no admin.
            price30: tour.basePrice,
            currency: tour.currency || "EUR",
            tag: "none",
            universal: false,
            status: tour.status === "published" ? "published" : "draft",
            order: created.length,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          const addons = await ctx.db
            .query("tourAddons")
            .withIndex("by_tour", (q) => q.eq("tourId", tour._id))
            .collect();
          await ctx.db.insert("upsellExperiences", {
            title: tour.title,
            translations,
            description: tour.subtitle,
            imageId: tour.bannerImageId,
            location,
            basePrice: tour.basePrice,
            pricingModel: "perPerson",
            currency: tour.currency || "EUR",
            duration: tour.duration,
            addons: addons.map((a) => ({
              name: a.title,
              price: a.price,
              pricingType: a.pricingType,
            })),
            hasDateField: true,
            hasSpecialRequest: false,
            tag: "none",
            universal: false,
            status: tour.status === "published" ? "published" : "draft",
            order: created.length,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      created.push(`${tour.category}: ${tour.title}`);
    }

    return {
      dryRun: dryRun === true,
      created,
      skipped,
      needsAttention,
      note: "price15, tag e universal ficaram por preencher — revê-os em /admin/upsells. As linhas originais em `tours` não foram apagadas.",
    };
  },
});
