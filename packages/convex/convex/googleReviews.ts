import { v } from "convex/values";
import { internalAction, query } from "./_generated/server";
import { internalMutation } from "./functions";
import { internal } from "./_generated/api";

/**
 * Real Google reviews — pulled from the Google Places API (New) server-side and
 * cached in Convex (refreshed once a day by the cron in crons.ts). The website
 * reads the cached `getGoogleReviews` query, so pages stay fast + SSR-friendly
 * and we stay within Google's caching policy.
 *
 * NOTE: the official Places API returns at most 5 review texts per place — the
 * aggregate rating + total count, however, are the real values for the listing.
 *
 * Required Convex env vars (set via the dashboard or `npx convex env set`):
 *   GOOGLE_PLACES_API_KEY  — a server key with "Places API (New)" enabled
 *   GOOGLE_PLACE_ID        — the Google place_id of the business listing
 */

type GoogleReview = {
  author: string;
  rating: number;
  text: string;
  relativeTime: string;
  time: number;
  profilePhotoUrl?: string;
  language?: string;
};

const reviewValidator = v.object({
  author: v.string(),
  rating: v.number(),
  text: v.string(),
  relativeTime: v.string(),
  time: v.number(),
  profilePhotoUrl: v.optional(v.string()),
  language: v.optional(v.string()),
});

/** Public: the website reads the cached reviews + aggregate from here. */
export const getGoogleReviews = query({
  args: {},
  handler: async (ctx) => {
    try {
      const doc = await ctx.db.query("googleReviewsCache").first();
      if (!doc) return null;
      return {
        rating: doc.rating,
        total: doc.total,
        fetchedAt: doc.fetchedAt,
        reviews: doc.reviews,
      };
    } catch {
      // Never let a reviews read crash the homepage — fall back to null.
      return null;
    }
  },
});

/** Internal: replace the single cache document with a fresh pull. */
export const _store = internalMutation({
  args: {
    rating: v.number(),
    total: v.number(),
    reviews: v.array(reviewValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("googleReviewsCache").collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }
    await ctx.db.insert("googleReviewsCache", {
      rating: args.rating,
      total: args.total,
      reviews: args.reviews,
      fetchedAt: Date.now(),
    });
  },
});

/**
 * The Featurable widget that mirrors our Google Business listing. Overridable
 * via env var, but defaulted so the cron works without extra configuration.
 */
const FEATURABLE_WIDGET_ID =
  process.env.FEATURABLE_WIDGET_ID ??
  "67727f04-6a40-498a-80eb-24c531a84524";

/**
 * Google shows non-English reviews as "(Translated by Google) <english>
 * (Original) <original>". Keep the translated half and drop the marker.
 */
function cleanReviewText(raw: string): string {
  let text = raw.trim();
  const originalAt = text.indexOf("(Original)");
  if (originalAt !== -1) text = text.slice(0, originalAt);
  return text.replace(/^\(Translated by Google\)\s*/i, "").trim();
}

/** English relative description, matching what the Places API used to return. */
function relativeFrom(time: number, now: number): string {
  if (!time) return "";
  const days = Math.floor((now - time) / 86_400_000);
  if (days <= 1) return "a day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "a month ago" : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

/**
 * Fetch the latest reviews and store them. Runs daily via cron; can also be
 * triggered manually from the Convex dashboard to populate the cache.
 *
 * Sourced from Featurable rather than the Places API directly: Places caps the
 * response at 5 review texts, while the widget feed carries the full recent set
 * (with reviewer photos) plus the real aggregate rating and review count.
 */
export const fetchGoogleReviews = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ ok: boolean; count?: number; error?: string }> => {
    try {
      const url = `https://featurable.com/api/v1/widgets/${FEATURABLE_WIDGET_ID}`;
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) {
        console.error("[GoogleReviews] API error:", res.status, res.statusText);
        return { ok: false, error: `${res.status}: ${res.statusText}` };
      }
      const data = await res.json();
      if (!data?.success) {
        return { ok: false, error: "Featurable returned success=false" };
      }

      const now = Date.now();
      const reviews: GoogleReview[] = (data.reviews ?? [])
        .map((r: any): GoogleReview => {
          const parsed = r.createTime ? Date.parse(r.createTime) : 0;
          const time = Number.isNaN(parsed) ? 0 : parsed;
          return {
            author: r.reviewer?.displayName ?? "Google user",
            rating: typeof r.starRating === "number" ? r.starRating : 5,
            text: cleanReviewText(r.comment ?? ""),
            relativeTime: relativeFrom(time, now),
            time,
            profilePhotoUrl: r.reviewer?.profilePhotoUrl,
          };
        })
        .filter((r: GoogleReview) => r.text.length > 0)
        // Newest first, so the carousel leads with fresh reviews.
        .sort((a: GoogleReview, b: GoogleReview) => b.time - a.time);

      await ctx.runMutation(internal.googleReviews._store, {
        rating:
          typeof data.averageRating === "number" ? data.averageRating : 0,
        total:
          typeof data.totalReviewCount === "number" ? data.totalReviewCount : 0,
        reviews,
      });
      console.log(
        `[GoogleReviews] Stored ${reviews.length} reviews (rating ${data.averageRating}, total ${data.totalReviewCount})`,
      );
      return { ok: true, count: reviews.length };
    } catch (err: any) {
      console.error("[GoogleReviews] Fetch error:", err);
      return { ok: false, error: err?.message ?? String(err) };
    }
  },
});
