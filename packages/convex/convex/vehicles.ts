import { frotaVisivel } from "./lib/frota";
import { parceriaPorSlug } from "./lib/parceriaPorSlug";
import { v } from "convex/values";
import { priceTrip, tariffOf } from "./lib/pricing";
import { categoriesOf, classOf, loadPricing, smallestThatFits } from "./lib/quote";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { urlDaImagem } from "./lib/imagens";

/* The back-office's vehicle functions live in veiculos.ts; the old admin's
   list/create/update/remove were removed with the linear model (2026-11-27). */

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
    /* A car without a price is not offered: it would show at 0 €. */
    const visible = frotaVisivel(all, parceria).filter((c) => tariffOf(c));
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
          vehicleClass: classOf(car, category),
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
        const { legs: _legs, ...price } = quote;
        /* The old per-km fields stay out of the checkout. */
        const { pricePerKm: _k, pricePerKmNight: _n, minimumPrice: _m, partnerIds: _p, ...publicCar } = car;
        return {
          ...publicCar,
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
