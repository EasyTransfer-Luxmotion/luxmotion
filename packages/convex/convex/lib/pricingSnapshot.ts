import { v } from "convex/values";

/* How the server priced the car at payment (lib/pricing.ts, priceTrip). Kept
   apart from lib/pricing.ts so schema.ts imports only validators. */
export const vPricingSnapshot = v.object({
  model: v.union(v.literal("linear"), v.literal("bands")),
  distance: v.number(),
  car: v.number(),
  legs: v.optional(
    v.array(v.object({ base: v.number(), airport: v.number(), night: v.number(), surge: v.number(), channel: v.number(), price: v.number() })),
  ),
});
