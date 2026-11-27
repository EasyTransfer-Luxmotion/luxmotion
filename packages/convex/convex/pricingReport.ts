import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { exigirAdmin } from "./lib/admin";
import { haversineKm } from "./lib/geo";
import { eAeroporto, type Local } from "./lib/aeroportos";
import { priceTrip, type PricingConfig } from "./lib/pricing";
import { classOf, loadPricing } from "./lib/quote";

/*
 * Today's prices next to the banded model's, for whoever calibrates the new
 * values (Configurações → Preços: novo vs atual). Two views:
 *  - a grid: every car at typical distances, day and night;
 *  - the paid bookings: the car part of the last paid transfers, priced again
 *    with both models, so the change is measured on real trips and not only
 *    on round numbers.
 * Values only: it needs the "valores" capability, like the booking totals.
 */

const GRID_KM = [5, 15, 30, 60, 138, 250];
const DAY = "2030-01-15 12:00";
const NIGHT = "2030-01-15 22:00";

export const grid = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "definicoes", "ver", "valores");
    const { config, airportSurchargePercent } = await loadPricing(ctx);
    const categories = await ctx.db.query("vehicleCategories").withIndex("by_order").collect();
    const cars = (await ctx.db.query("vehicles").withIndex("by_order").collect()).filter((c) => !c.partnershipId && c.status === "active");
    const rows = [];
    for (const cat of [...categories, null]) {
      const mine = cars.filter((c) => (cat ? c.categoryId === cat._id : !c.categoryId)).sort((a, b) => a.passengers - b.passengers);
      for (const car of mine) {
        const at = (model: PricingConfig["model"], km: number, departureDate: string) =>
          priceTrip({ vehicle: car, vehicleClass: classOf(cat), config: { ...config, model }, partner: null, distance: km, departureDate, airportSurchargePercent }).price;
        rows.push({
          category: cat?.name ?? "Sem categoria",
          car: car.name,
          passengers: car.passengers,
          hasTariff: Boolean(car.tariff),
          cells: GRID_KM.map((km) => ({
            km,
            day: { now: at("linear", km, DAY), next: car.tariff ? at("bands", km, DAY) : null },
            night: { now: at("linear", km, NIGHT), next: car.tariff ? at("bands", km, NIGHT) : null },
          })),
        });
      }
    }
    return { km: GRID_KM, model: config.model, rows };
  },
});

/* Distance buckets for the summary of paid bookings. */
const BUCKETS: [string, number][] = [
  ["até 15 km", 15],
  ["15–50 km", 50],
  ["50–100 km", 100],
  ["mais de 100 km", Infinity],
];

export const paidBookings = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await exigirAdmin(ctx, "definicoes", "ver", "valores");
    const { config, airportSurchargePercent } = await loadPricing(ctx);
    /* The newest orders, bounded: the orders table is never read whole. */
    const recent = await ctx.db.query("orders").order("desc").take(Math.min(Math.max(limit ?? 1500, 100), 4000));
    const paid = recent.filter((o) => o.paymentStatus === "completed" && o.vehicleId && !o.tourBookingId && !o.transferOrderId);

    const cars = new Map<string, Doc<"vehicles"> | null>();
    const categories = new Map<string, Doc<"vehicleCategories"> | null>();
    const partners = new Map<string, Doc<"partnerships"> | null>();
    const get = async <T,>(cache: Map<string, T | null>, id: string, load: () => Promise<T | null>) => {
      if (!cache.has(id)) cache.set(id, await load());
      return cache.get(id) ?? null;
    };

    const trips: { number: string; category: string; car: string; km: number; date: string; now: number; next: number }[] = [];
    for (const out of paid) {
      const back = out.relatedOrderId ? await ctx.db.get(out.relatedOrderId) : null;
      /* A return leg is counted with its outbound. */
      if (back && back._creationTime < out._creationTime) continue;
      const car = await get(cars, out.vehicleId!, () => ctx.db.get(out.vehicleId!));
      if (!car?.tariff) continue;
      const cat = car.categoryId ? await get(categories, car.categoryId, () => ctx.db.get(car.categoryId!)) : null;
      const partner = out.partnershipId ? await get(partners, out.partnershipId, () => ctx.db.get(out.partnershipId!)) : null;
      const hasCoords = (l: Local): l is { location: string; lat: number; lng: number } => typeof l?.lat === "number" && typeof l?.lng === "number";
      const km = Math.max(out.distance ?? 0, hasCoords(out.departure) && hasCoords(out.arrival) ? haversineKm(out.departure, out.arrival) : 0);
      if (!(km > 0)) continue;
      /* The lead-time surge as of when the checkout started (the order's
         creation): old orders don't record when the car was chosen. */
      const at = (model: PricingConfig["model"]) =>
        priceTrip({
          vehicle: car,
          vehicleClass: classOf(cat),
          config: { ...config, model },
          partner,
          distance: km,
          departureDate: out.departureDate,
          returnDate: back?.departureDate,
          bookReturn: Boolean(back),
          isAirportPickup: eAeroporto(out.departure),
          airportSurchargePercent,
          now: out._creationTime,
        }).price;
      trips.push({
        number: out.orderNumber ?? String(out._id),
        category: cat?.name ?? car.name,
        car: car.name,
        km: Math.round(km),
        date: out.departureDate.slice(0, 16),
        now: at("linear"),
        next: at("bands"),
      });
    }

    const summarise = (xs: typeof trips) => {
      const now = xs.reduce((t, x) => t + x.now, 0);
      const next = xs.reduce((t, x) => t + x.next, 0);
      return { trips: xs.length, now: Math.round(now), next: Math.round(next), change: now > 0 ? next / now - 1 : null };
    };
    const byCategory = [...new Set(trips.map((t) => t.category))]
      .map((c) => ({ label: c, ...summarise(trips.filter((t) => t.category === c)) }))
      .sort((a, b) => b.trips - a.trips);
    let from = 0;
    const byDistance = BUCKETS.map(([label, to]) => {
      const xs = trips.filter((t) => t.km > from && t.km <= to);
      from = to;
      return { label, ...summarise(xs) };
    });
    const biggest = [...trips]
      .sort((a, b) => Math.abs(b.next / b.now - 1) - Math.abs(a.next / a.now - 1))
      .slice(0, 15)
      .map((t) => ({ ...t, change: t.now > 0 ? t.next / t.now - 1 : null }));
    return { looked: recent.length, total: summarise(trips), byCategory, byDistance, biggest, withoutTariff: paid.length - trips.length };
  },
});
