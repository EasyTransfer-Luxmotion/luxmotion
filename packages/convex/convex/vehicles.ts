import { frotaVisivel } from "./lib/frota";
import { parceriaPorSlug } from "./lib/parceriaPorSlug";
import { v } from "convex/values";
import { catalogTranslationsValidator } from "./lib/catalogTranslations";
import { priceTrip } from "./lib/pricing";
import { categoriesOf, classOf, loadPricing, smallestThatFits } from "./lib/quote";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination";
import { urlDaImagem, vImagem } from "./lib/imagens";
import { exigirAdmin } from "./lib/admin";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "veiculos", "ver");
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
    await exigirAdmin(ctx, "veiculos", "ver");
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
      night: (r) => r.pricePerKmNight ?? r.pricePerKm,
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
    const parceria = args.partnershipSlug
      ? await parceriaPorSlug(ctx, args.partnershipSlug)
      : null;

    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const sortedVehicles = frotaVisivel(vehicles, parceria);

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
 *
 * One line per category (vehicleCategories): the customer picks "Minibus",
 * not one of three minibus sizes, and the line carries the smallest car of
 * the category that takes the group — its _id is what selectCar stores.
 * Changing the number of passengers re-runs this and may swap the car inside
 * the same category (the checkout follows the line by categoryId). Cars not
 * yet in a category show on their own, as before.
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
    /* The browser's clock (epoch ms, rounded): a query doesn't re-run as time
       passes, so the lead-time surge is priced as of this. */
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const parceria = args.partnershipSlug
      ? await parceriaPorSlug(ctx, args.partnershipSlug)
      : null;

    const all = await ctx.db
      .query("vehicles")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const visible = frotaVisivel(all, parceria);
    const categories = await categoriesOf(ctx, visible);
    const pricing = await loadPricing(ctx);

    const requiredBags =
      (args.checkedBaggage ?? 0) + (args.handLuggage ?? 0) + (args.backpack ?? 0);
    const passengers = args.passengers ?? 1;

    type Line = { car: Doc<"vehicles">; category: Doc<"vehicleCategories"> | null; cars: Doc<"vehicles">[] };
    const lines: Line[] = [];
    const byCategory = new Map<Id<"vehicleCategories">, Doc<"vehicles">[]>();
    for (const car of visible) {
      const category = car.categoryId ? categories.get(car.categoryId) : undefined;
      if (!category) {
        if (car.passengers >= passengers && car.luggage >= requiredBags) lines.push({ car, category: null, cars: [car] });
        continue;
      }
      if (category.status !== "active") continue;
      byCategory.set(category._id, [...(byCategory.get(category._id) ?? []), car]);
    }
    for (const [id, cars] of byCategory) {
      const car = smallestThatFits(cars, passengers, requiredBags);
      if (car) lines.push({ car, category: categories.get(id)!, cars });
    }
    lines.sort((a, b) => (a.category?.order ?? a.car.order) - (b.category?.order ?? b.car.order));

    /* The upgrade link, in car ids for the checkout: the line of category A
       points at the car shown for the category it upgrades. */
    const carOfCategory = new Map(lines.filter((l) => l.category).map((l) => [l.category!._id, l.car._id]));

    return Promise.all(
      lines.map(async ({ car, category, cars }) => {
        const quote = priceTrip({
          vehicle: car,
          vehicleClass: classOf(category),
          config: pricing.config,
          partner: parceria,
          distance: args.distance,
          departureDate: args.departureDate,
          returnDate: args.returnDate,
          bookReturn: args.bookReturn,
          isAirportPickup: args.isAirportPickup,
          airportSurchargePercent: pricing.airportSurchargePercent,
          now: args.now,
        });
        const imageId = category?.imageId ?? car.imageId;
        const { legs: _legs, model: _model, ...price } = quote;
        return {
          ...car,
          ...(category
            ? {
                name: category.name,
                translations: category.translations,
                examples: category.examples ?? car.examples,
                upgradeFromVehicleId: category.upgradeFromCategoryId ? carOfCategory.get(category.upgradeFromCategoryId) : undefined,
              }
            : {}),
          categoryId: category?._id,
          /* The size inside the category, for the line under the name. */
          vehicleName: car.name,
          maxPassengers: Math.max(...cars.map((c) => c.passengers)),
          maxLuggage: Math.max(...cars.map((c) => c.luggage)),
          imageUrl: imageId ? await urlDaImagem(ctx, imageId) : null,
          ...price,
        };
      }),
    );
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
    await exigirAdmin(ctx, "veiculos");
    return await ctx.db.insert("vehicles", { ...args, actualizadoEm: Date.now() });
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
    await exigirAdmin(ctx, "veiculos");
    const { id, ...data } = args;
    // A imagem antiga não se apaga: o ficheiro pode ser partilhado com outros registos (ver lib/imagens.ts).
    await ctx.db.patch(id, { ...data, actualizadoEm: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("vehicles") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "veiculos", "editar", "apagar");
    // O ficheiro da imagem não se apaga: pode ser partilhado com outros registos (ver lib/imagens.ts).
    await ctx.db.delete(args.id);
  },
});
