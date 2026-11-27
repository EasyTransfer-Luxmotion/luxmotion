import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { siteSettingsDefaults } from "../siteSettings";
import { pricingConfigOf, type PricingConfig, type VehicleClass } from "./pricing";

/*
 * What the transfer checkout and the payment check share besides the formula
 * (lib/pricing.ts): the pricing levers from siteSettings, and which car of a
 * category takes a group.
 */

export type PricingContext = { config: PricingConfig; airportSurchargePercent: number };

export async function loadPricing(ctx: QueryCtx): Promise<PricingContext> {
  const settings = await ctx.db
    .query("siteSettings")
    .withIndex("by_key", (q) => q.eq("key", "global"))
    .first();
  return {
    config: pricingConfigOf(settings?.pricing),
    airportSurchargePercent: settings?.airportSurchargePercent ?? siteSettingsDefaults.airportSurchargePercent,
  };
}

/** Cars without a category are priced as "standard" (sedans were the default). */
export function classOf(category: Pick<Doc<"vehicleCategories">, "vehicleClass"> | null | undefined): VehicleClass {
  return category?.vehicleClass ?? "standard";
}

/**
 * The car of a category for a group: the smallest that takes the passengers
 * and the bags (fewest seats, then fewest bags, then the admin order). null
 * when no car of the category is big enough.
 */
export function smallestThatFits<T extends Pick<Doc<"vehicles">, "passengers" | "luggage" | "order">>(
  cars: T[],
  passengers: number,
  bags: number,
): T | null {
  const fit = cars.filter((c) => c.passengers >= passengers && c.luggage >= bags);
  fit.sort((a, b) => a.passengers - b.passengers || a.luggage - b.luggage || a.order - b.order);
  return fit[0] ?? null;
}

/** The categories by id, for the cars given. */
export async function categoriesOf(ctx: QueryCtx, cars: Pick<Doc<"vehicles">, "categoryId">[]) {
  const ids = [...new Set(cars.map((c) => c.categoryId).filter((id): id is Id<"vehicleCategories"> => Boolean(id)))];
  const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return new Map(docs.filter((d): d is Doc<"vehicleCategories"> => Boolean(d)).map((d) => [d._id, d]));
}
