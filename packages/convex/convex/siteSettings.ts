import { v, ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { exigirAdmin } from "./lib/admin";
import { pricingConfigOf } from "./lib/pricing";

// Single global settings row, keyed like marketingStats.
const SETTINGS_KEY = "global";

export const siteSettingsDefaults = {
  // Minimum hours a transfer must be booked in advance (blocks "same hour" bookings).
  minAdvanceBookingHours: 2,
  // Scrolling announcement bar.
  announcementsEnabled: false,
  announcements: [] as string[],
  // "How many X per 1 EUR" — display-only conversion; Stripe still charges EUR.
  exchangeRates: { BRL: 6.2, USD: 1.08, GBP: 0.85 },
  // Extra % added to the base transfer fare when the pickup is an airport.
  airportSurchargePercent: 12,
  // How far from the searched place a tour may be and still show up in the
  // /tours/results list. Tight on purpose: searching "Mafra" should not return
  // Lisbon just because it is half an hour down the road.
  toursSearchRadiusKm: 10,
  // How far from the transfer's drop-off a tour or event may be and still be
  // offered in the checkout. 30 is the value that used to be hardcoded in
  // `tours.listNearCoordinates` / `events.listNearCoordinates`.
  checkoutToursRadiusKm: 30,
  // Same, for the upsells (extra stops and experiences). Wider on purpose: the
  // visitor is already travelling there, not browsing.
  checkoutUpsellRadiusKm: 50,
} as const;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();

    /* The checkout's luggage extras, per unit and per leg (lib/pricing.ts;
       the payment check uses the same). */
    const extraPrices = pricingConfigOf(existing?.pricing).extras;
    if (!existing) {
      return { ...siteSettingsDefaults, extraPrices };
    }

    return {
      minAdvanceBookingHours: existing.minAdvanceBookingHours,
      announcementsEnabled:
        existing.announcementsEnabled ??
        siteSettingsDefaults.announcementsEnabled,
      announcements: existing.announcements ?? [],
      exchangeRates:
        existing.exchangeRates ?? siteSettingsDefaults.exchangeRates,
      airportSurchargePercent:
        existing.airportSurchargePercent ??
        siteSettingsDefaults.airportSurchargePercent,
      toursSearchRadiusKm:
        existing.toursSearchRadiusKm ??
        siteSettingsDefaults.toursSearchRadiusKm,
      checkoutToursRadiusKm:
        existing.checkoutToursRadiusKm ??
        siteSettingsDefaults.checkoutToursRadiusKm,
      checkoutUpsellRadiusKm:
        existing.checkoutUpsellRadiusKm ??
        siteSettingsDefaults.checkoutUpsellRadiusKm,
      extraPrices,
    };
  },
});

// Merge-style upsert: each admin card saves only the fields it owns, so unset args
// leave the other settings untouched (booking hours, announcements, exchange rates).
export const upsert = mutation({
  args: {
    minAdvanceBookingHours: v.optional(v.number()),
    announcementsEnabled: v.optional(v.boolean()),
    announcements: v.optional(v.array(v.string())),
    exchangeRates: v.optional(
      v.object({ BRL: v.number(), USD: v.number(), GBP: v.number() }),
    ),
    airportSurchargePercent: v.optional(v.number()),
    toursSearchRadiusKm: v.optional(v.number()),
    checkoutToursRadiusKm: v.optional(v.number()),
    checkoutUpsellRadiusKm: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "definicoes");
    if (
      args.minAdvanceBookingHours !== undefined &&
      (!Number.isFinite(args.minAdvanceBookingHours) ||
        args.minAdvanceBookingHours < 0 ||
        args.minAdvanceBookingHours > 720)
    ) {
      // 0 = no restriction; 720 = 30 days, a sane upper bound.
      throw new ConvexError("A antecedência mínima tem de estar entre 0 e 720 horas.");
    }
    if (
      args.airportSurchargePercent !== undefined &&
      (!Number.isFinite(args.airportSurchargePercent) ||
        args.airportSurchargePercent < 0 ||
        args.airportSurchargePercent > 100)
    ) {
      throw new ConvexError("A sobretaxa de aeroporto tem de estar entre 0 e 100%.");
    }
    if (
      args.toursSearchRadiusKm !== undefined &&
      (!Number.isFinite(args.toursSearchRadiusKm) ||
        args.toursSearchRadiusKm < 1 ||
        args.toursSearchRadiusKm > 500)
    ) {
      // 1 km = same town only; 500 km covers mainland Portugal end to end.
      throw new ConvexError("A distância de procura dos tours tem de estar entre 1 e 500 km.");
    }
    if (
      args.checkoutToursRadiusKm !== undefined &&
      (!Number.isFinite(args.checkoutToursRadiusKm) ||
        args.checkoutToursRadiusKm < 1 ||
        args.checkoutToursRadiusKm > 500)
    ) {
      throw new ConvexError("A distância dos tours no checkout tem de estar entre 1 e 500 km.");
    }
    if (
      args.checkoutUpsellRadiusKm !== undefined &&
      (!Number.isFinite(args.checkoutUpsellRadiusKm) ||
        args.checkoutUpsellRadiusKm < 1 ||
        args.checkoutUpsellRadiusKm > 500)
    ) {
      throw new ConvexError("A distância dos extras no checkout tem de estar entre 1 e 500 km.");
    }

    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();

    const patch: {
      minAdvanceBookingHours?: number;
      announcementsEnabled?: boolean;
      announcements?: string[];
      exchangeRates?: { BRL: number; USD: number; GBP: number };
      airportSurchargePercent?: number;
      toursSearchRadiusKm?: number;
      checkoutToursRadiusKm?: number;
      checkoutUpsellRadiusKm?: number;
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.minAdvanceBookingHours !== undefined)
      patch.minAdvanceBookingHours = args.minAdvanceBookingHours;
    if (args.announcementsEnabled !== undefined)
      patch.announcementsEnabled = args.announcementsEnabled;
    if (args.announcements !== undefined)
      patch.announcements = args.announcements;
    if (args.exchangeRates !== undefined)
      patch.exchangeRates = args.exchangeRates;
    if (args.airportSurchargePercent !== undefined)
      patch.airportSurchargePercent = args.airportSurchargePercent;
    if (args.toursSearchRadiusKm !== undefined)
      patch.toursSearchRadiusKm = args.toursSearchRadiusKm;
    if (args.checkoutToursRadiusKm !== undefined)
      patch.checkoutToursRadiusKm = args.checkoutToursRadiusKm;
    if (args.checkoutUpsellRadiusKm !== undefined)
      patch.checkoutUpsellRadiusKm = args.checkoutUpsellRadiusKm;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("siteSettings", {
      key: SETTINGS_KEY,
      minAdvanceBookingHours:
        args.minAdvanceBookingHours ??
        siteSettingsDefaults.minAdvanceBookingHours,
      ...patch,
    });
  },
});
