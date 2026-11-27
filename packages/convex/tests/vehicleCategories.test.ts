import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { PRICING_DEFAULTS, lisbonLocalToEpoch } from "../convex/lib/pricing";
import { makeTest } from "./convex";

/*
 * Categories in the checkout: the customer picks "Minibus" and the server
 * prices the smallest minibus that takes the group. And the payment check
 * agrees with what the checkout showed.
 */

let t: ReturnType<typeof makeTest>;
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "recovery@example.com");
  t = makeTest();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const base = {
  luggage: 20,
  hasWifi: true,
  isElectric: false,
  status: "active" as const,
  pricePerKmNight: 1,
};

async function seed() {
  return await t.run(async (ctx) => {
    const minibus = await ctx.db.insert("vehicleCategories", { name: "Minibus", vehicleClass: "large", status: "active", order: 2 });
    const business = await ctx.db.insert("vehicleCategories", { name: "Business Class", vehicleClass: "standard", status: "active", order: 1 });
    const mk = (name: string, passengers: number, categoryId: Id<"vehicleCategories">, baseFare: number, order: number) =>
      ctx.db.insert("vehicles", {
        ...base,
        name,
        passengers,
        categoryId,
        order,
        pricePerKm: 4,
        minimumPrice: 100,
        tariff: { baseFare, ratePerKm: 3.5, nightMultiplier: 1.1, minimum: 100 },
      });
    const mb15 = await mk("Mini Bus (max 15 pax)", 15, minibus, 50, 9);
    const mb20 = await mk("Mini Bus (16–20 pax)", 20, minibus, 65, 10);
    const mb22 = await mk("Mini Bus (21–22 pax)", 22, minibus, 80, 11);
    const bc = await mk("Business Class", 3, business, 25, 2);
    await ctx.db.insert("siteSettings", { key: "global", minAdvanceBookingHours: 2, pricing: { ...PRICING_DEFAULTS, model: "bands" } });
    return { minibus, business, mb15, mb20, mb22, bc };
  });
}

describe("one line per category", () => {
  test("18 passengers: one Minibus line, priced with the 20-seat car", async () => {
    const s = await seed();
    const rows = await t.query(api.vehicles.listQuoted, { passengers: 18, distance: 30, departureDate: "2030-03-10 12:00" });
    expect(rows.map((r) => r.name)).toEqual(["Minibus"]);
    expect(rows[0]!._id).toBe(s.mb20);
    expect(rows[0]!.vehicleName).toBe("Mini Bus (16–20 pax)");
    expect(rows[0]!.maxPassengers).toBe(22);
    expect(rows[0]!.price).toBe(Math.round((65 + 3.5 * (15 + 15 * 0.9)) * 100) / 100);
  });

  test("2 passengers: both categories, in the categories' order, each with its smallest car", async () => {
    const s = await seed();
    const rows = await t.query(api.vehicles.listQuoted, { passengers: 2, distance: 30 });
    expect(rows.map((r) => [r.name, r._id])).toEqual([
      ["Business Class", s.bc],
      ["Minibus", s.mb15],
    ]);
  });

  test("no car big enough: the category doesn't show", async () => {
    await seed();
    const rows = await t.query(api.vehicles.listQuoted, { passengers: 30, distance: 30 });
    expect(rows).toEqual([]);
  });

  test("a partner hiding the 20-seat car gets the 22-seat one for 18 people", async () => {
    const s = await seed();
    await t.run((ctx) => ctx.db.insert("partnerships", { name: "Hotel", slug: "hotel", theme: {}, veiculosEscondidos: [s.mb20] }));
    const rows = await t.query(api.vehicles.listQuoted, { partnershipSlug: "hotel", passengers: 18, distance: 30 });
    expect(rows[0]!._id).toBe(s.mb22);
    /* And the channel factor. */
    expect(rows[0]!.price).toBe(Math.round((80 + 3.5 * (15 + 15 * 0.9)) * 1.15 * 100) / 100);
  });

  test("the upgrade link follows the categories, in car ids for the checkout", async () => {
    const s = await seed();
    await t.run((ctx) => ctx.db.patch(s.minibus, { upgradeFromCategoryId: s.business }));
    const rows = await t.query(api.vehicles.listQuoted, { passengers: 2, distance: 30 });
    expect(rows.find((r) => r._id === s.mb15)!.upgradeFromVehicleId).toBe(s.bc);
  });
});

describe("the payment check", () => {
  test("selectCar keeps the real size and the moment of the quote", async () => {
    const s = await seed();
    const orderId = await t.run((ctx) =>
      ctx.db.insert("orders", {
        status: "draft",
        updatedAt: 0,
        departure: { location: "A" },
        arrival: { location: "B" },
        departureDate: "2030-03-10 12:00",
        passengers: 18,
        isRoundTrip: false,
        createdAt: 0,
      } as never),
    );
    await t.mutation(api.orders.selectCar, { orderId, vehicleId: s.mb20, vehicleName: "Minibus", price: 1, passengerCapacity: 20 });
    const o = (await t.run((ctx) => ctx.db.get(orderId)))!;
    expect(o.vehicleName).toBe("Mini Bus (16–20 pax)");
    expect(o.categoryId).toBe(s.minibus);
    expect(o.quotedAt).toBeTypeOf("number");
  });

  test("a quote seen before the 12-hour mark is honoured if paid a little later", async () => {
    const s = await seed();
    const pickup = "2030-03-10 20:00";
    const quoted = lisbonLocalToEpoch(pickup)! - 12.5 * 3_600_000;
    const orderId = await t.run((ctx) =>
      ctx.db.insert("orders", {
        status: "draft",
        updatedAt: 0,
        departure: { location: "A" },
        arrival: { location: "B" },
        departureDate: pickup,
        passengers: 2,
        isRoundTrip: false,
        createdAt: 0,
        distance: 30,
        vehicleId: s.bc,
        quotedAt: quoted,
      } as never),
    );
    vi.useFakeTimers();
    vi.setSystemTime(quoted + 60 * 60_000); // paying an hour later: 11.5 h ahead now
    const m = await t.query(internal.orders.minimoAPagar, { orderId, opcoes: [] });
    expect(m.snapshot.legs?.[0]?.surge).toBe(1);
    expect(m.snapshot.model).toBe("bands");
  });
});

describe("createFromFleet", () => {
  test("groups the sizes, gives the rest a category each, and keeps the upgrade pairs", async () => {
    const ids = await t.run(async (ctx) => {
      const mk = (name: string, passengers: number, order: number) =>
        ctx.db.insert("vehicles", { ...base, name, passengers, order, pricePerKm: 2, minimumPrice: 50 });
      const business = await mk("Business Class", 3, 1);
      const first = await mk("First Class", 3, 2);
      await ctx.db.patch(first, { upgradeFromVehicleId: business });
      await mk("Mini Bus (max 15 pax)", 15, 3);
      await mk("Mini Bus (16–20 pax)", 20, 4);
      await mk("Luxury Mini Bus  (15 pax max)", 15, 5);
      await mk("Bus (30 pax)", 30, 6);
      await mk("Luxury Bus (30 pax)", 30, 7);
      await mk("Business Class Van", 7, 8);
      return { business, first };
    });
    const r = await t.mutation(internal.vehicleCategories.createFromFleet, {});
    expect(r.created).toEqual(["Business Class", "First Class", "Minibus", "Luxury Minibus", "Coach", "Luxury Coach", "Business Class Van"]);
    expect(r.loose).toEqual([]);
    const cats = await t.run((ctx) => ctx.db.query("vehicleCategories").collect());
    const byName = new Map(cats.map((c) => [c.name, c]));
    expect(byName.get("Business Class Van")!.vehicleClass).toBe("van");
    expect(byName.get("Minibus")!.vehicleClass).toBe("large");
    expect(byName.get("First Class")!.upgradeFromCategoryId).toBe(byName.get("Business Class")!._id);
    /* Again: nothing new. */
    const again = await t.mutation(internal.vehicleCategories.createFromFleet, {});
    expect(again.created).toEqual([]);
    expect(again.assigned).toBe(0);
  });
});
