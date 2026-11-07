import { mutation } from "./_generated/server";
import { exigirAdmin } from "./lib/admin";

const REVIEW_POOL = [
  { author: "Sarah M.", rating: 5, text: "Absolutely incredible experience! Our guide was so knowledgeable and passionate about the area. Every stop felt carefully curated and we discovered hidden gems we never would have found on our own. Highly recommend!" },
  { author: "James T.", rating: 5, text: "One of the best tours I've ever been on. The scenery was breathtaking and the whole experience was perfectly organized from start to finish. Worth every penny." },
  { author: "Maria L.", rating: 4, text: "Really enjoyed this tour. Beautiful locations and great company. The guide shared fascinating local stories that brought everything to life. Would love to do it again." },
  { author: "David K.", rating: 5, text: "A truly memorable day. The tour exceeded all our expectations — stunning views, amazing food stops, and a guide who genuinely loves what they do. Can't wait to book another one!" },
  { author: "Emma R.", rating: 5, text: "This was the highlight of our trip to Portugal. So well organized and the small group size made it feel really personal. Our guide went above and beyond to make sure everyone had a fantastic time." },
  { author: "Thomas W.", rating: 4, text: "Great experience overall. Loved the pace of the tour — not rushed at all. The locations were stunning and our guide was very friendly and informative." },
  { author: "Ana P.", rating: 5, text: "Perfeito! Melhor tour que já fiz em Portugal. O guia era fantástico e os locais visitados são de tirar o fôlego. Recomendo vivamente a todos!" },
  { author: "Lucas H.", rating: 5, text: "We booked this as a surprise for my wife's birthday and it was perfect. The attention to detail was impressive and every moment felt special." },
  { author: "Sophie B.", rating: 4, text: "Lovely tour with beautiful scenery. The guide was excellent — very personable and full of interesting facts. A wonderful way to explore the region." },
  { author: "Marco V.", rating: 5, text: "Exceptional from beginning to end. The quality of the experience far surpassed what I expected. Already recommended it to all my friends and family." },
  { author: "Charlotte F.", rating: 5, text: "What an amazing adventure! The tour was perfectly paced with the right mix of sightseeing, culture, and free time. Our guide was a true gem." },
  { author: "Miguel S.", rating: 4, text: "Very well-organized tour. The pickup was on time, the vehicle was comfortable, and the stops were all fantastic. Great value for the price." },
  { author: "Laura G.", rating: 5, text: "Hands down the best way to explore this part of Portugal. Intimate group, passionate guide, and unforgettable views. We will definitely be back!" },
  { author: "Robert N.", rating: 5, text: "Everything about this tour was top-notch. From the seamless booking process to the incredible locations, it was a first-class experience all the way." },
  { author: "Isabelle D.", rating: 4, text: "A really enjoyable day out. The guide struck the perfect balance between sharing knowledge and letting us soak in the atmosphere. Beautiful route." },
]

export const seedReviews = mutation({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const tours = await ctx.db.query("tours").collect();

    if (tours.length === 0) {
      throw new Error("No tours found to seed reviews for");
    }

    let totalCreated = 0;

    for (const tour of tours) {
      const existing = await ctx.db
        .query("tourReviews")
        .withIndex("by_tour", (q) => q.eq("tourId", tour._id))
        .collect();

      const approvedCount = existing.filter((r) => r.isApproved).length;

      if (approvedCount >= 5) continue;

      const needed = 5 - approvedCount;
      const shuffled = [...REVIEW_POOL].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, needed);

      for (let i = 0; i < selected.length; i++) {
        const review = selected[i]!;
        await ctx.db.insert("tourReviews", {
          tourId: tour._id,
          author: review.author,
          rating: review.rating,
          text: review.text,
          isApproved: true,
          createdAt: Date.now() - (i + 1) * 86400000,
        });
      }

      const allReviews = await ctx.db
        .query("tourReviews")
        .withIndex("by_tour", (q) => q.eq("tourId", tour._id))
        .collect();

      const approved = allReviews.filter((r) => r.isApproved);
      const reviewCount = approved.length;
      const rating = approved.reduce((sum, r) => sum + r.rating, 0) / reviewCount;

      await ctx.db.patch(tour._id, {
        rating: Math.round(rating * 10) / 10,
        reviewCount,
        updatedAt: Date.now(),
      });

      totalCreated += needed;
    }

    return { toursProcessed: tours.length, reviewsCreated: totalCreated };
  },
});

export const removeHighlightsFromTours = mutation({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const tours = await ctx.db.query("tours").collect();
    let fixed = 0;
    for (const tour of tours) {
      if ("highlights" in tour) {
        const { highlights, ...rest } = tour as any;
        await ctx.db.replace(tour._id, rest);
        fixed++;
      }
    }

    const translations = await ctx.db.query("tourTranslations").collect();
    let fixedTranslations = 0;
    for (const translation of translations) {
      if ("highlights" in translation) {
        const { highlights, ...rest } = translation as any;
        await ctx.db.replace(translation._id, rest);
        fixedTranslations++;
      }
    }

    const events = await ctx.db.query("events").collect();
    let fixedEvents = 0;
    for (const event of events) {
      if ("highlights" in event) {
        const { highlights, ...rest } = event as any;
        await ctx.db.replace(event._id, rest);
        fixedEvents++;
      }
    }

    return { toursFixed: fixed, translationsFixed: fixedTranslations, eventsFixed: fixedEvents };
  },
});
