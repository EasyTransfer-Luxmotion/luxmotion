import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { exigirAdmin } from "./lib/admin";

export const listByTour = query({
  args: { tourId: v.id("tours") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "tours", "ver");
    const schedules = await ctx.db
      .query("tourSchedules")
      .withIndex("by_tour", (q) => q.eq("tourId", args.tourId))
      .collect();

    return schedules.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getAvailability = query({
  args: {
    tourId: v.id("tours"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const tour = await ctx.db.get(args.tourId);
    const bookingDeadlineHours = tour?.bookingDeadlineHours;

    const schedules = await ctx.db
      .query("tourSchedules")
      .withIndex("by_tour", (q) => q.eq("tourId", args.tourId))
      .collect();

    const activeSchedules = schedules.filter((s) => {
      if (!s.isActive) return false;
      if (s.validFrom && s.validFrom > args.endDate) return false;
      if (s.validUntil && s.validUntil < args.startDate) return false;
      return true;
    });

    const exceptions = await ctx.db
      .query("tourScheduleExceptions")
      .withIndex("by_tour", (q) => q.eq("tourId", args.tourId))
      .collect();

    const relevantExceptions = exceptions.filter(
      (e) => e.date >= args.startDate && e.date <= args.endDate
    );

    const availability: {
      date: number;
      timeSlots: { startTime: string; endTime?: string }[];
      isCancelled: boolean;
      isRescheduled: boolean;
      isSpecial: boolean;
      reason?: string;
    }[] = [];

    const currentDate = new Date(args.startDate);
    const endDate = new Date(args.endDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getUTCDay();
      const dateTimestamp = currentDate.getTime();

      const exception = relevantExceptions.find((e) => {
        const exceptionDate = new Date(e.date);
        return (
          exceptionDate.getUTCFullYear() === currentDate.getUTCFullYear() &&
          exceptionDate.getUTCMonth() === currentDate.getUTCMonth() &&
          exceptionDate.getUTCDate() === currentDate.getUTCDate()
        );
      });

      if (exception) {
        if (exception.type === "cancelled") {
          availability.push({
            date: dateTimestamp,
            timeSlots: [],
            isCancelled: true,
            isRescheduled: false,
            isSpecial: false,
            reason: exception.reason,
          });
        } else if (exception.type === "rescheduled" && exception.newTimeSlot) {
          availability.push({
            date: dateTimestamp,
            timeSlots: [exception.newTimeSlot],
            isCancelled: false,
            isRescheduled: true,
            isSpecial: false,
            reason: exception.reason,
          });
        } else if (exception.type === "special" && exception.newTimeSlot) {
          availability.push({
            date: dateTimestamp,
            timeSlots: [exception.newTimeSlot],
            isCancelled: false,
            isRescheduled: false,
            isSpecial: true,
            reason: exception.reason,
          });
        }
      } else {
        const applicableSchedules = activeSchedules.filter((s) => {
          if (s.validFrom && s.validFrom > dateTimestamp) return false;
          if (s.validUntil && s.validUntil < dateTimestamp) return false;
          return s.activeDays.includes(dayOfWeek);
        });

        const allTimeSlots = applicableSchedules.flatMap((s) => s.timeSlots);

        if (allTimeSlots.length > 0) {
          availability.push({
            date: dateTimestamp,
            timeSlots: allTimeSlots,
            isCancelled: false,
            isRescheduled: false,
            isSpecial: false,
          });
        }
      }

      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    return { availability, bookingDeadlineHours };
  },
});

export const create = mutation({
  args: {
    tourId: v.id("tours"),
    activeDays: v.array(v.number()),
    timeSlots: v.array(
      v.object({
        startTime: v.string(),
        endTime: v.optional(v.string()),
      })
    ),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "tours");
    const tour = await ctx.db.get(args.tourId);
    if (!tour) throw new Error("Tour not found");

    const now = Date.now();
    const scheduleId = await ctx.db.insert("tourSchedules", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });

    return scheduleId;
  },
});

export const update = mutation({
  args: {
    id: v.id("tourSchedules"),
    activeDays: v.optional(v.array(v.number())),
    timeSlots: v.optional(
      v.array(
        v.object({
          startTime: v.string(),
          endTime: v.optional(v.string()),
        })
      )
    ),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "tours");
    const { id, ...data } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Schedule not found");

    await ctx.db.patch(id, {
      ...data,
      updatedAt: Date.now(),
    });

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("tourSchedules") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "tours");
    const schedule = await ctx.db.get(args.id);
    if (!schedule) throw new Error("Schedule not found");

    const exceptions = await ctx.db
      .query("tourScheduleExceptions")
      .withIndex("by_tour", (q) => q.eq("tourId", schedule.tourId))
      .collect();

    const relatedExceptions = exceptions.filter(
      (e) => e.scheduleId === args.id
    );

    for (const exception of relatedExceptions) {
      await ctx.db.delete(exception._id);
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});
