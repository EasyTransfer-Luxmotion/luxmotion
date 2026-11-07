import { v } from "convex/values";
import { catalogTranslationsValidator } from "./lib/catalogTranslations";
import { isNightDeparture, priceVehicle } from "./lib/pricing";
import { siteSettingsDefaults } from "./siteSettings";
import { mutation, query } from "./_generated/server";
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination";
import { urlDaImagem, apagarImagem, vImagem } from "./lib/imagens";
import { exigirAdmin } from "./lib/admin";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_order")
      .collect();
    
    return Promise.all(
      vehicles.map(async (vehicle) => {
        const partnership = vehicle.partnershipId 
          ? await ctx.db.get(vehicle.partnershipId)
          : null;
          
        return {
        ...vehicle,
        imageUrl: vehicle.imageId 
          ? await urlDaImagem(ctx, vehicle.imageId) 
          : null,
          partnershipName: partnership?.name || "EasyTransfer",
        };
      })
    );
  },
});

export const listPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    await exigirAdmin(ctx);
    const vehicles = await ctx.db.query("vehicles").withIndex("by_order").collect();

    // Enrich with partnershipName (needed for search/filter) — cheap db.get per row.
    let rows = await Promise.all(
      vehicles.map(async (vehicle) => {
        const partnership = vehicle.partnershipId ? await ctx.db.get(vehicle.partnershipId) : null;
        return { ...vehicle, partnershipName: partnership?.name || "EasyTransfer" };
      }),
    );

    rows = applySearch(rows, a.search, [(r) => r.name, (r) => r.partnershipName]);

    const owner = a.filters?.owner;
    if (owner) rows = rows.filter((r) => (owner === "global" ? !r.partnershipId : r.partnershipId === owner));
    const status = a.filters?.status;
    if (status) rows = rows.filter((r) => r.status === status);

    rows = applySort(rows, a.sortBy, a.sortDir, {
      name: (r) => r.name.toLowerCase(),
      day: (r) => r.pricePerKm,
      night: (r) => r.pricePerKmNight,
      min: (r) => r.minimumPrice,
    });

    const result = paginate(rows, a.page, a.pageSize);
    const withImages = await Promise.all(
      result.rows.map(async (r) => ({
        ...r,
        imageUrl: r.imageId ? await urlDaImagem(ctx, r.imageId) : null,
      })),
    );
    return { ...result, rows: withImages };
  },
});

export const listActive = query({
  args: { partnershipSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let partnershipId = null;
    if (args.partnershipSlug) {
      const partnership = await ctx.db
        .query("partnerships")
        .withIndex("by_slug", (q) => q.eq("slug", args.partnershipSlug!))
        .unique();
      partnershipId = partnership?._id;
    }

    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    
    const filteredVehicles = vehicles.filter((vehicle) => {
      if (partnershipId) {
        return vehicle.partnershipId === partnershipId;
      }
      return !vehicle.partnershipId;
    });

    const sortedVehicles = filteredVehicles.sort((a, b) => a.order - b.order);

    return Promise.all(
      sortedVehicles.map(async (vehicle) => ({
        ...vehicle,
        imageUrl: vehicle.imageId 
          ? await urlDaImagem(ctx, vehicle.imageId) 
          : null,
      }))
    );
  },
});

/**
 * Os veículos disponíveis para uma viagem, já com preço.
 *
 * O checkout mostrava preços calculados no browser e mandava-os para o
 * servidor, que os aceitava. Agora quem calcula é isto: o preço depende dos
 * parâmetros da viagem, e muda com eles — não há fotografia para ficar velha.
 */
export const listQuoted = query({
  args: {
    partnershipSlug: v.optional(v.string()),
    passengers: v.optional(v.number()),
    checkedBaggage: v.optional(v.number()),
    handLuggage: v.optional(v.number()),
    backpack: v.optional(v.number()),
    distance: v.optional(v.number()),
    /** "YYYY-MM-DD HH:mm[:ss]", hora local — é o servidor que decide se é noite. */
    departureDate: v.optional(v.string()),
    returnDate: v.optional(v.string()),
    bookReturn: v.optional(v.boolean()),
    isAirportPickup: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let partnershipId = null;
    if (args.partnershipSlug) {
      const partnership = await ctx.db
        .query("partnerships")
        .withIndex("by_slug", (q) => q.eq("slug", args.partnershipSlug!))
        .unique();
      partnershipId = partnership?._id;
    }

    const all = await ctx.db
      .query("vehicles")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const settings = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .first();
    const airportSurchargePercent =
      settings?.airportSurchargePercent ?? siteSettingsDefaults.airportSurchargePercent;

    const requiredBags =
      (args.checkedBaggage ?? 0) + (args.handLuggage ?? 0) + (args.backpack ?? 0);
    const passengers = args.passengers ?? 1;

    const isNight = isNightDeparture(args.departureDate);
    const isNightReturn = args.bookReturn ? isNightDeparture(args.returnDate) : false;

    const rows = all
      .filter((v) => (partnershipId ? v.partnershipId === partnershipId : !v.partnershipId))
      .filter((v) => v.passengers >= passengers && v.luggage >= requiredBags)
      .sort((a, b) => a.order - b.order);

    return Promise.all(
      rows.map(async (vehicle) => {
        const pricing = priceVehicle({
          pricePerKm: vehicle.pricePerKm,
          minimumPrice: vehicle.minimumPrice,
          distance: args.distance,
          isNight,
          isNightReturn,
          bookReturn: args.bookReturn,
          isAirportPickup: args.isAirportPickup,
          airportSurchargePercent,
        });

        return {
          ...vehicle,
          imageUrl: vehicle.imageId ? await urlDaImagem(ctx, vehicle.imageId) : null,
          ...pricing,
        };
      }),
    );
  },
});

export const getById = query({
  args: { id: v.id("vehicles") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const vehicle = await ctx.db.get(args.id);
    if (!vehicle) return null;

    return {
      ...vehicle,
      imageUrl: vehicle.imageId 
        ? await urlDaImagem(ctx, vehicle.imageId) 
        : null,
    };
  },
});

/**
 * Checkout upsell: given the vehicle the customer selected, return the premium
 * vehicle configured as its experience-upgrade (or null). Reverse lookup via the
 * `by_upgrade_from` index — the premium vehicle stores `upgradeFromVehicleId`.
 */
export const getUpgradeFor = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const upgrade = await ctx.db
      .query("vehicles")
      .withIndex("by_upgrade_from", (q) =>
        q.eq("upgradeFromVehicleId", args.vehicleId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!upgrade) return null;
    return {
      ...upgrade,
      imageUrl: upgrade.imageId
        ? await urlDaImagem(ctx, upgrade.imageId)
        : null,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    translations: v.optional(catalogTranslationsValidator),
    examples: v.optional(v.string()),
    imageId: v.optional(vImagem),
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
      v.literal("maintenance")
    ),
    order: v.number(),
    upgradeFromVehicleId: v.optional(v.id("vehicles")),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    return await ctx.db.insert("vehicles", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("vehicles"),
    name: v.optional(v.string()),
    translations: v.optional(catalogTranslationsValidator),
    examples: v.optional(v.string()),
    imageId: v.optional(vImagem),
    partnershipId: v.optional(v.id("partnerships")),
    passengers: v.optional(v.number()),
    luggage: v.optional(v.number()),
    maxBackpacks: v.optional(v.number()),
    maxHandLuggage: v.optional(v.number()),
    maxCheckedBaggage: v.optional(v.number()),
    maxChildSeats: v.optional(v.number()),
    maxBabySeats: v.optional(v.number()),
    maxBoosterSeats: v.optional(v.number()),
    pricePerKm: v.optional(v.number()),
    pricePerKmNight: v.optional(v.number()),
    minimumPrice: v.optional(v.number()),
    hasWifi: v.optional(v.boolean()),
    isElectric: v.optional(v.boolean()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("inactive"),
        v.literal("maintenance")
      )
    ),
    order: v.optional(v.number()),
    upgradeFromVehicleId: v.optional(v.id("vehicles")),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const { id, ...data } = args;
    const existing = await ctx.db.get(id);
    
    if (existing?.imageId && data.imageId && existing.imageId !== data.imageId) {
      await apagarImagem(ctx, existing.imageId);
    }

    await ctx.db.patch(id, data);
  },
});

export const remove = mutation({
  args: { id: v.id("vehicles") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (existing?.imageId) {
      await apagarImagem(ctx, existing.imageId);
    }
    await ctx.db.delete(args.id);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
