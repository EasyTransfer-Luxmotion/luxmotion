import { v } from "convex/values";
import { query } from "./_generated/server";
import { exigirAdmin } from "./lib/admin";
import { bandedKm, lisbonLocalToEpoch, partnerFactorOf, priceTrip, pricingConfigOf, tariffOf, type PricingConfig } from "./lib/pricing";
import { offeredTo, reachOf } from "./lib/frota";
import { loadPricing } from "./lib/quote";

/*
 * Configurações → Preços: the simulator. The comparison with the linear
 * model ("Novo vs atual") went with that model (2026-11-27).
 * Values only: it needs the "valores" capability, like the booking totals.
 */

/* The partners for the simulator's picker, with their own markup (null =
   the default of Preços). */
export const parceiros = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "definicoes", "ver", "valores");
    const ps = await ctx.db.query("partnerships").collect();
    return ps
      .map((p) => ({ id: p._id, nome: p.name, markup: typeof p.priceMarkupPercent === "number" ? p.priceMarkupPercent : null }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  },
});

/*
 * The simulator of Configurações → Preços: one trip, every category, with
 * the levers being edited (not yet saved), so each number's effect is seen
 * before saving. Each line has the price step by step (base by distance,
 * minimum, airport, night, lead time, partner). With a partner, its fleet
 * and its own markup.
 */
export const simular = query({
  args: {
    /* The levers as on screen; missing keys take the saved/default values. */
    pricing: v.any(),
    km: v.number(),
    hour: v.number(),
    hoursAhead: v.number(),
    /* "default" = a partner with the default markup; an id = that partner
       (its markup and its fleet); absent = the main site. */
    partner: v.optional(v.union(v.literal("default"), v.id("partnerships"))),
    airport: v.boolean(),
    /* The airport surcharge being edited; absent = the saved one. */
    airportSurchargePercent: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "definicoes", "ver", "valores");
    const saved = await loadPricing(ctx);
    const config: PricingConfig = pricingConfigOf({ ...saved.config, ...(a.pricing ?? {}) });
    const aeroporto = typeof a.airportSurchargePercent === "number" && Number.isFinite(a.airportSurchargePercent) ? a.airportSurchargePercent : saved.airportSurchargePercent;
    const parceria = a.partner && a.partner !== "default" ? await ctx.db.get(a.partner) : null;
    const partner = a.partner ? (parceria ?? {}) : null;
    const km = Math.min(Math.max(a.km, 0.5), 2000);
    const hour = Math.min(Math.max(Math.round(a.hour), 0), 23);
    const departureDate = `2030-01-15 ${String(hour).padStart(2, "0")}:00`;
    const now = lisbonLocalToEpoch(departureDate)! - Math.max(a.hoursAhead, 0) * 3_600_000;
    const categories = await ctx.db.query("vehicleCategories").withIndex("by_order").collect();
    const cars = (await ctx.db.query("vehicles").withIndex("by_order").collect()).filter(
      /* A partner with the default markup sees the cars offered to all partners. */
      (c) => c.status === "active" && tariffOf(c) && (a.partner === "default" ? reachOf(c).mode === "all" : offeredTo(c, parceria)),
    );
    const rows = [];
    for (const cat of categories) {
      if (cat.status !== "active") continue;
      const car = cars.filter((c) => c.categoryId === cat._id).sort((x, y) => x.passengers - y.passengers)[0];
      if (!car) continue;
      const trip = {
        vehicle: car,
        vehicleClass: cat.vehicleClass,
        partner,
        distance: km,
        departureDate,
        isAirportPickup: a.airport,
        airportSurchargePercent: aeroporto,
        now,
      };
      const q = priceTrip({ ...trip, config });
      const leg = q.legs[0];
      const t = tariffOf(car)!;
      rows.push({
        category: cat.name,
        car: car.name,
        passengers: car.passengers,
        price: q.price,
        steps: leg
          ? {
              baseFare: t.baseFare,
              byDistance: Math.round(t.ratePerKm * bandedKm(km, config.bands) * 100) / 100,
              minimum: t.minimum,
              minimumApplied: t.baseFare + t.ratePerKm * bandedKm(km, config.bands) < t.minimum,
              base: leg.base,
              airport: leg.airport,
              night: leg.night,
              surge: leg.surge,
              channel: leg.channel,
            }
          : null,
      });
    }
    return { rows, airportSurchargePercent: aeroporto, partnerFactor: partnerFactorOf(partner, config) };
  },
});
