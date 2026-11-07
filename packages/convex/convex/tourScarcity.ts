import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { exigirAdmin } from "./lib/admin";

const SETTINGS_KEY = "global";

type MonthStatus = "booked" | "almost" | "available";

const monthEntry = (status: MonthStatus, spotsLeft = 0) => ({ status, spotsLeft });

export const tourScarcityDefaults = {
  year: 2026,
  totalCapacity: 200,
  confirmedBookings: 173,
  inquiriesToday: 14,
  reservedThisWeek: 3,
  months: [
    monthEntry("booked"),
    monthEntry("booked"),
    monthEntry("booked"),
    monthEntry("booked"),
    monthEntry("booked"),
    monthEntry("booked"),
    monthEntry("booked"),
    monthEntry("booked"),
    monthEntry("almost", 2),
    monthEntry("almost", 4),
    monthEntry("available"),
    monthEntry("available"),
  ],
} as const;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("tourScarcity")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();

    if (!existing) {
      return tourScarcityDefaults;
    }

    return {
      year: existing.year,
      totalCapacity: existing.totalCapacity,
      confirmedBookings: existing.confirmedBookings,
      inquiriesToday: existing.inquiriesToday,
      reservedThisWeek: existing.reservedThisWeek,
      months: existing.months,
    };
  },
});

export const upsert = mutation({
  args: {
    year: v.number(),
    totalCapacity: v.number(),
    confirmedBookings: v.number(),
    inquiriesToday: v.number(),
    reservedThisWeek: v.number(),
    months: v.array(
      v.object({
        status: v.union(
          v.literal("booked"),
          v.literal("almost"),
          v.literal("available"),
        ),
        spotsLeft: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const numbers = [
      args.year,
      args.totalCapacity,
      args.confirmedBookings,
      args.inquiriesToday,
      args.reservedThisWeek,
      ...args.months.map((m) => m.spotsLeft),
    ];
    if (numbers.some((n) => !Number.isFinite(n) || !Number.isInteger(n) || n < 0)) {
      throw new Error("All values must be non-negative integers");
    }
    if (args.months.length !== 12) {
      throw new Error("months must contain exactly 12 entries");
    }
    if (args.confirmedBookings > args.totalCapacity) {
      throw new Error("Confirmed bookings cannot exceed total capacity");
    }

    const payload = {
      key: SETTINGS_KEY,
      year: args.year,
      totalCapacity: args.totalCapacity,
      confirmedBookings: args.confirmedBookings,
      inquiriesToday: args.inquiriesToday,
      reservedThisWeek: args.reservedThisWeek,
      months: args.months,
      updatedAt: Date.now(),
    };

    const existing = await ctx.db
      .query("tourScarcity")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("tourScarcity", payload);
  },
});
