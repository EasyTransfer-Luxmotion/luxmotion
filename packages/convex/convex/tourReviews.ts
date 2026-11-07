import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { exigirAdmin } from "./lib/admin";

export const listByTour = query({
  args: { tourId: v.id("tours") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const reviews = await ctx.db
      .query("tourReviews")
      .withIndex("by_tour", (q) => q.eq("tourId", args.tourId))
      .collect();

    return reviews.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const reviews = await ctx.db
      .query("tourReviews")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    return reviews.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listApprovedByTour = query({
  args: { tourId: v.id("tours") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const reviews = await ctx.db
      .query("tourReviews")
      .withIndex("by_tour", (q) => q.eq("tourId", args.tourId))
      .collect();

    return reviews
      .filter((r) => r.isApproved)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listApprovedByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("tourReviews")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    return reviews
      .filter((r) => r.isApproved)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const reviews = await ctx.db
      .query("tourReviews")
      .withIndex("by_approved", (q) => q.eq("isApproved", false))
      .collect();

    const reviewsWithDetails = await Promise.all(
      reviews.map(async (review) => {
        let tourTitle = null;
        let eventTitle = null;

        if (review.tourId) {
          const tour = await ctx.db.get(review.tourId);
          tourTitle = tour?.title;
        }

        if (review.eventId) {
          const event = await ctx.db.get(review.eventId);
          eventTitle = event?.title;
        }

        return {
          ...review,
          tourTitle,
          eventTitle,
        };
      })
    );

    return reviewsWithDetails.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listApproved = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const reviews = await ctx.db
      .query("tourReviews")
      .withIndex("by_approved", (q) => q.eq("isApproved", true))
      .collect();

    const reviewsWithDetails = await Promise.all(
      reviews.map(async (review) => {
        let tourTitle = null;
        let eventTitle = null;

        if (review.tourId) {
          const tour = await ctx.db.get(review.tourId);
          tourTitle = tour?.title;
        }

        if (review.eventId) {
          const event = await ctx.db.get(review.eventId);
          eventTitle = event?.title;
        }

        return {
          ...review,
          tourTitle,
          eventTitle,
        };
      })
    );

    return reviewsWithDetails.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listFeatured = query({
  args: {},
  handler: async (ctx) => {
    const reviews = await ctx.db
      .query("tourReviews")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect();

    const approved = reviews.filter((r) => r.isApproved);

    const enriched = await Promise.all(
      approved.map(async (review) => {
        let tourTitle = null;
        let tourSlug = null;
        let eventTitle = null;
        let eventSlug = null;

        if (review.tourId) {
          const tour = await ctx.db.get(review.tourId);
          tourTitle = tour?.title ?? null;
          tourSlug = tour?.slug ?? null;
        }

        if (review.eventId) {
          const event = await ctx.db.get(review.eventId);
          eventTitle = event?.title ?? null;
          eventSlug = event?.slug ?? null;
        }

        return { ...review, tourTitle, tourSlug, eventTitle, eventSlug };
      })
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getById = query({
  args: { id: v.id("tourReviews") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    tourId: v.optional(v.id("tours")),
    eventId: v.optional(v.id("events")),
    author: v.string(),
    avatar: v.optional(v.string()),
    rating: v.number(),
    text: v.string(),
    source: v.optional(v.string()),
    nationality: v.optional(v.string()),
    isApproved: v.boolean(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    if (!args.tourId && !args.eventId) {
      throw new Error("Either tourId or eventId must be provided");
    }

    if (args.tourId) {
      const tour = await ctx.db.get(args.tourId);
      if (!tour) throw new Error("Tour not found");
    }

    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      if (!event) throw new Error("Event not found");
    }

    const reviewId = await ctx.db.insert("tourReviews", {
      ...args,
      createdAt: Date.now(),
    });

    if (args.isApproved) {
      if (args.tourId) {
        await updateTourRating(ctx, args.tourId);
      }
      if (args.eventId) {
        await updateEventRating(ctx, args.eventId);
      }
    }

    return reviewId;
  },
});

export const submit = mutation({
  args: {
    tourId: v.optional(v.id("tours")),
    eventId: v.optional(v.id("events")),
    author: v.string(),
    rating: v.number(),
    text: v.string(),
    nationality: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.tourId && !args.eventId) {
      throw new Error("Either tourId or eventId must be provided");
    }

    if (args.tourId) {
      const tour = await ctx.db.get(args.tourId);
      if (!tour) throw new Error("Tour not found");
    }

    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      if (!event) throw new Error("Event not found");
    }

    if (args.rating < 1 || args.rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    const reviewId = await ctx.db.insert("tourReviews", {
      tourId: args.tourId,
      eventId: args.eventId,
      author: args.author,
      rating: args.rating,
      text: args.text,
      nationality: args.nationality,
      isApproved: false,
      createdAt: Date.now(),
    });

    return reviewId;
  },
});

export const approve = mutation({
  args: { id: v.id("tourReviews") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const review = await ctx.db.get(args.id);
    if (!review) throw new Error("Review not found");

    await ctx.db.patch(args.id, { isApproved: true });

    if (review.tourId) {
      await updateTourRating(ctx, review.tourId);
    }

    if (review.eventId) {
      await updateEventRating(ctx, review.eventId);
    }

    return args.id;
  },
});

export const reject = mutation({
  args: { id: v.id("tourReviews") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const review = await ctx.db.get(args.id);
    if (!review) throw new Error("Review not found");

    const wasApproved = review.isApproved;

    await ctx.db.delete(args.id);

    if (wasApproved) {
      if (review.tourId) {
        await updateTourRating(ctx, review.tourId);
      }
      if (review.eventId) {
        await updateEventRating(ctx, review.eventId);
      }
    }

    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("tourReviews") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const review = await ctx.db.get(args.id);
    if (!review) throw new Error("Review not found");

    const wasApproved = review.isApproved;

    await ctx.db.delete(args.id);

    if (wasApproved) {
      if (review.tourId) {
        await updateTourRating(ctx, review.tourId);
      }
      if (review.eventId) {
        await updateEventRating(ctx, review.eventId);
      }
    }

    return args.id;
  },
});

export const toggleFeatured = mutation({
  args: { id: v.id("tourReviews") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const review = await ctx.db.get(args.id);
    if (!review) throw new Error("Review not found");
    if (!review.isApproved) throw new Error("Only approved reviews can be featured");

    await ctx.db.patch(args.id, { isFeatured: !review.isFeatured });
    return args.id;
  },
});

export const update = mutation({
  args: {
    id: v.id("tourReviews"),
    author: v.optional(v.string()),
    avatar: v.optional(v.string()),
    rating: v.optional(v.number()),
    text: v.optional(v.string()),
    source: v.optional(v.string()),
    nationality: v.optional(v.string()),
    /**
     * A data em que a review foi escrita.
     *
     * Uma review só entra pelo formulário do site, que grava o instante da
     * submissão. Quando é uma avaliação antiga a ser passada para cá, essa data
     * não é a verdadeira — e é o que fica a ler-se no site. Daí poder ser
     * corrigida no back-office.
     */
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const { id, ...data } = args;
    const review = await ctx.db.get(id);
    if (!review) throw new Error("Review not found");

    if (data.createdAt !== undefined) {
      if (!Number.isFinite(data.createdAt) || data.createdAt <= 0) {
        throw new Error("Data inválida");
      }
      // Uma review com data futura ordena-se à frente de tudo e lê-se mal.
      if (data.createdAt > Date.now() + 60_000) {
        throw new Error("A data não pode estar no futuro");
      }
    }

    await ctx.db.patch(id, data);

    if (review.isApproved) {
      if (review.tourId) {
        await updateTourRating(ctx, review.tourId);
      }
      if (review.eventId) {
        await updateEventRating(ctx, review.eventId);
      }
    }

    return id;
  },
});

async function updateTourRating(ctx: any, tourId: any) {
  const reviews = await ctx.db
    .query("tourReviews")
    .withIndex("by_tour", (q: any) => q.eq("tourId", tourId))
    .collect();

  const approvedReviews = reviews.filter((r: any) => r.isApproved);
  const reviewCount = approvedReviews.length;
  const rating =
    reviewCount > 0
      ? approvedReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviewCount
      : 0;

  await ctx.db.patch(tourId, {
    rating: Math.round(rating * 10) / 10,
    reviewCount,
    updatedAt: Date.now(),
  });
}

async function updateEventRating(ctx: any, eventId: any) {
  const reviews = await ctx.db
    .query("tourReviews")
    .withIndex("by_event", (q: any) => q.eq("eventId", eventId))
    .collect();

  const approvedReviews = reviews.filter((r: any) => r.isApproved);
  const reviewCount = approvedReviews.length;
  const rating =
    reviewCount > 0
      ? approvedReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviewCount
      : 0;

  await ctx.db.patch(eventId, {
    rating: Math.round(rating * 10) / 10,
    reviewCount,
    updatedAt: Date.now(),
  });
}
