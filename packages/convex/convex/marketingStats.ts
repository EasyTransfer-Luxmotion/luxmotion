import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { exigirAdmin } from "./lib/admin";

const SETTINGS_KEY = "global";

export const marketingStatsDefaults = {
  trustpilotReviewCount: 387,
  heroDailyTravelersMin: 90,
  heroDailyTravelersMax: 150,
  detailDailyTravelersMin: 55,
  detailDailyTravelersMax: 125,
  checkoutBookedTodayMin: 16,
  checkoutBookedTodayMax: 42,
} as const;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("marketingStats")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();

    if (!existing) {
      return marketingStatsDefaults;
    }

    return {
      trustpilotReviewCount: existing.trustpilotReviewCount,
      heroDailyTravelersMin: existing.heroDailyTravelersMin,
      heroDailyTravelersMax: existing.heroDailyTravelersMax,
      detailDailyTravelersMin: existing.detailDailyTravelersMin,
      detailDailyTravelersMax: existing.detailDailyTravelersMax,
      checkoutBookedTodayMin: existing.checkoutBookedTodayMin,
      checkoutBookedTodayMax: existing.checkoutBookedTodayMax,
    };
  },
});

export const upsert = mutation({
  args: {
    trustpilotReviewCount: v.number(),
    heroDailyTravelersMin: v.number(),
    heroDailyTravelersMax: v.number(),
    detailDailyTravelersMin: v.number(),
    detailDailyTravelersMax: v.number(),
    checkoutBookedTodayMin: v.number(),
    checkoutBookedTodayMax: v.number(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const allValues = [
      args.trustpilotReviewCount,
      args.heroDailyTravelersMin,
      args.heroDailyTravelersMax,
      args.detailDailyTravelersMin,
      args.detailDailyTravelersMax,
      args.checkoutBookedTodayMin,
      args.checkoutBookedTodayMax,
    ];

    if (
      allValues.some(
        (value) => !Number.isFinite(value) || !Number.isInteger(value),
      )
    ) {
      throw new Error("All values must be valid integers");
    }

    if (args.trustpilotReviewCount < 0) {
      throw new Error("Trustpilot review count cannot be negative");
    }

    if (args.heroDailyTravelersMin < 0 || args.heroDailyTravelersMax < 0) {
      throw new Error("Hero traveler values cannot be negative");
    }

    if (args.detailDailyTravelersMin < 0 || args.detailDailyTravelersMax < 0) {
      throw new Error("Detail traveler values cannot be negative");
    }

    if (args.checkoutBookedTodayMin < 0 || args.checkoutBookedTodayMax < 0) {
      throw new Error("Checkout booked values cannot be negative");
    }

    if (args.heroDailyTravelersMin > args.heroDailyTravelersMax) {
      throw new Error("Hero traveler min cannot be greater than max");
    }

    if (args.detailDailyTravelersMin > args.detailDailyTravelersMax) {
      throw new Error("Detail traveler min cannot be greater than max");
    }

    if (args.checkoutBookedTodayMin > args.checkoutBookedTodayMax) {
      throw new Error("Checkout booked min cannot be greater than max");
    }

    const existing = await ctx.db
      .query("marketingStats")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();

    const payload = {
      key: SETTINGS_KEY,
      trustpilotReviewCount: args.trustpilotReviewCount,
      heroDailyTravelersMin: args.heroDailyTravelersMin,
      heroDailyTravelersMax: args.heroDailyTravelersMax,
      detailDailyTravelersMin: args.detailDailyTravelersMin,
      detailDailyTravelersMax: args.detailDailyTravelersMax,
      checkoutBookedTodayMin: args.checkoutBookedTodayMin,
      checkoutBookedTodayMax: args.checkoutBookedTodayMax,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("marketingStats", payload);
  },
});
