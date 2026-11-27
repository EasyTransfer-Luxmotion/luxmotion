import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  PRICING_DEFAULTS,
  isNightDeparture,
  leadTimeSurge,
  lisbonLocalToEpoch,
  priceTrip,
  pricingConfigOf,
  type PricingConfig,
  type Tariff,
  type VehicleClass,
} from "../convex/lib/pricing";
import { makeTest } from "./convex";

/*
 * Every scenario of the pricing sheet (EasyTransfer_Precificacao_Dinamica
 * .xlsx), against the code:
 *  - the sheet's own formula, written again here as an independent oracle,
 *    over every car of the sheet, many distances, day and night, the three
 *    lead times and both channels;
 *  - the edges of every rule (band limits, the 12 h and 3 h marks, the early
 *    morning, the night window);
 *  - that every lever is read from the settings (configurable);
 *  - the whole checkout on the server: order, car, trip, cash payment,
 *    refused when below the price, the snapshot stored.
 */

const ADMIN = "recovery@example.com";
const admin = { subject: ADMIN, issuer: "test", tokenIdentifier: `test|${ADMIN}`, email: ADMIN, emailVerified: true, name: "Admin" };

/* The "Parametros" sheet: base, day rate, night multiplier, minimum, class. */
const SHEET: [string, Tariff, VehicleClass][] = [
  ["Classic", { baseFare: 18, ratePerKm: 0.86, nightMultiplier: 1.221, minimum: 35 }, "standard"],
  ["Business Class", { baseFare: 25, ratePerKm: 1.55, nightMultiplier: 1.097, minimum: 50 }, "standard"],
  ["First Class", { baseFare: 30, ratePerKm: 2.25, nightMultiplier: 1.111, minimum: 60 }, "standard"],
  ["Carro XL", { baseFare: 22, ratePerKm: 1.2, nightMultiplier: 1.167, minimum: 45 }, "standard"],
  ["Carro XL Luxo", { baseFare: 30, ratePerKm: 1.55, nightMultiplier: 1.129, minimum: 60 }, "standard"],
  ["Van", { baseFare: 30, ratePerKm: 1.8, nightMultiplier: 1.1, minimum: 60 }, "van"],
  ["Business Class Van", { baseFare: 35, ratePerKm: 2.05, nightMultiplier: 1.171, minimum: 70 }, "van"],
  ["First Class Van", { baseFare: 38, ratePerKm: 2.4, nightMultiplier: 1.083, minimum: 75 }, "van"],
  ["Mini Bus 15", { baseFare: 50, ratePerKm: 3.5, nightMultiplier: 1.114, minimum: 100 }, "large"],
  ["Mini Bus 20", { baseFare: 65, ratePerKm: 3.9, nightMultiplier: 1.103, minimum: 130 }, "large"],
  ["Mini Bus 22", { baseFare: 80, ratePerKm: 4.3, nightMultiplier: 1.116, minimum: 160 }, "large"],
  ["Mini Bus Luxo 15", { baseFare: 80, ratePerKm: 5, nightMultiplier: 1.1, minimum: 160 }, "large"],
  ["Mini Bus Luxo 20", { baseFare: 110, ratePerKm: 5.3, nightMultiplier: 1.132, minimum: 220 }, "large"],
  ["Mini Bus Luxo 22", { baseFare: 125, ratePerKm: 6, nightMultiplier: 1.117, minimum: 250 }, "large"],
  ["Autocarro 30", { baseFare: 125, ratePerKm: 8.5, nightMultiplier: 1.176, minimum: 250 }, "large"],
  ["Autocarro 45", { baseFare: 135, ratePerKm: 10.5, nightMultiplier: 1.143, minimum: 270 }, "large"],
  ["Autocarro 56", { baseFare: 150, ratePerKm: 12.5, nightMultiplier: 1.08, minimum: 300 }, "large"],
  ["Autocarro Luxo 30", { baseFare: 150, ratePerKm: 11.5, nightMultiplier: 1.13, minimum: 300 }, "large"],
  ["Autocarro Luxo 45", { baseFare: 175, ratePerKm: 13.2, nightMultiplier: 1.129, minimum: 350 }, "large"],
  ["Autocarro Luxo 56", { baseFare: 185, ratePerKm: 16.1, nightMultiplier: 1.068, minimum: 370 }, "large"],
  ["Transfer com CEO", { baseFare: 75, ratePerKm: 5, nightMultiplier: 1.3, minimum: 150 }, "standard"],
];

const BANDS = PRICING_DEFAULTS.bands;
const cfg: PricingConfig = { ...PRICING_DEFAULTS };

/* The sheet's "Calculadora", cell by cell, written independently of the code:
   B15..E15 slice the km, B16 base price, B17 with the minimum, B22 the final
   price = ROUND(B17 × period × surge × channel, 2). */
function sheetPrice(t: Tariff, km: number, night: boolean, surge: number, channel: number): number {
  const b1 = Math.min(km, 15);
  const b2 = Math.max(0, Math.min(km, 50) - 15);
  const b3 = Math.max(0, Math.min(km, 100) - 50);
  const b4 = Math.max(0, km - 100);
  const base = t.baseFare + t.ratePerKm * (b1 * 1 + b2 * 0.9 + b3 * 0.78 + b4 * 0.68);
  const withMin = Math.max(t.minimum, base);
  /* Excel's ROUND is half up on the decimal number: 74.975 → 74.98, even
     though the double is 74.97499999… */
  const x = withMin * (night ? t.nightMultiplier : 1) * surge * channel;
  return Math.round(Number((x * 100).toPrecision(12))) / 100;
}

const KMS = [0.5, 1.5, 3, 5, 10, 14.9, 15, 15.1, 20, 30, 45, 49.9, 50, 50.1, 75, 99.9, 100, 100.1, 138, 200, 250, 315, 500];
/* Lead times as the sheet names them, as hours before the pickup. Pickups
   at 12:00 (day) and 22:00 (night): outside the early morning, which forces
   last minute and is tested on its own. */
/* Lisbon 08:00 on 10 March 2030: pickups on the 11th at 12:00 are 28 h away. */
const NOW = lisbonLocalToEpoch("2030-03-10 08:00")!;
const LEADS: [string, number, keyof PricingConfig["surge"]["standard"] | null][] = [
  ["≥12h / dia seguinte", 24, null],
  ["Mesmo dia (>3h)", 6, "sameDay"],
  ["Última hora (<3h)", 1, "lastMinute"],
];
describe("the sheet's formula, every car × distance × period × lead time × channel", () => {
  let cases = 0;
  for (const [name, tariff, cls] of SHEET) {
    test(name, () => {
      for (const km of KMS) {
        for (const [lead, hoursBefore, level] of LEADS) {
          for (const night of [false, true]) {
            const pickup = night ? "2030-03-11 22:00" : "2030-03-11 12:00";
            const now = lisbonLocalToEpoch(pickup)! - hoursBefore * 3_600_000;
            const isNight = isNightDeparture(pickup);
            const surge = level ? cfg.surge[cls][level] : 1;
            for (const partner of [null, {}]) {
              const got = priceTrip({
                vehicle: { pricePerKm: 9, minimumPrice: 9, tariff },
                vehicleClass: cls,
                config: cfg,
                partner,
                distance: km,
                departureDate: pickup,
                now,
              }).price;
              const want = sheetPrice(tariff, km, isNight, surge, partner ? 1.15 : 1);
              expect(got, `${name} ${km} km ${lead} ${isNight ? "noite" : "dia"} ${partner ? "parceiro" : "direto"}`).toBeCloseTo(want, 2);
              cases++;
            }
          }
        }
      }
    });
  }
  test("covered", () => {
    expect(cases).toBe(SHEET.length * KMS.length * LEADS.length * 2 * 2);
  });
});

describe("the sheet's Comparacao table, cell by cell", () => {
  const rows: [string, number, number][] = [
    ["Business Class", 1.5, 50],
    ["Business Class", 3, 50],
    ["Business Class", 30, 69.18],
    ["Business Class", 138, 197.58],
    ["Business Class Van", 1.5, 70],
    ["Business Class Van", 3, 70],
    ["Business Class Van", 30, 93.43],
    ["Business Class Van", 138, 263.25],
    ["First Class", 1.5, 60],
    ["First Class", 3, 60],
    ["First Class", 30, 94.13],
    ["First Class", 138, 280.52],
  ];
  for (const [name, km, want] of rows) {
    test(`${name} a ${km} km = ${want} €`, () => {
      const [, tariff, cls] = SHEET.find(([n]) => n === name)!;
      expect(priceTrip({ vehicle: { pricePerKm: 1, minimumPrice: 1, tariff }, vehicleClass: cls, config: cfg, partner: null, distance: km }).price).toBe(want);
    });
  }
});

describe("rule edges", () => {
  test("night window: 20:00 and 07:59 are night, 19:59 and 08:00 are not", () => {
    expect(["20:00", "23:59", "00:00", "07:59"].map((h) => isNightDeparture(`2030-01-01 ${h}`))).toEqual([true, true, true, true]);
    expect(["19:59", "08:00", "12:00"].map((h) => isNightDeparture(`2030-01-01 ${h}`))).toEqual([false, false, false]);
  });

  test("lead time: exactly 12 h is free, 11:59 is same day, exactly 3 h is last minute, 3:01 is same day", () => {
    const now = lisbonLocalToEpoch("2030-03-10 08:00")!;
    expect(leadTimeSurge("2030-03-10 20:00", now, "standard", cfg)).toBe(1);
    expect(leadTimeSurge("2030-03-10 19:59", now, "standard", cfg)).toBe(1.06);
    expect(leadTimeSurge("2030-03-10 11:01", now, "standard", cfg)).toBe(1.06);
    expect(leadTimeSurge("2030-03-10 11:00", now, "standard", cfg)).toBe(1.12);
    expect(leadTimeSurge("2030-03-10 08:30", now, "standard", cfg)).toBe(1.12);
  });

  test("early morning: 00:00 to 06:59 always last minute, 07:00 not; from weeks ahead", () => {
    const now = lisbonLocalToEpoch("2030-01-01 12:00")!;
    expect(["00:00", "03:30", "06:59"].map((h) => leadTimeSurge(`2030-02-01 ${h}`, now, "van", cfg))).toEqual([1.18, 1.18, 1.18]);
    expect(leadTimeSurge("2030-02-01 07:00", now, "van", cfg)).toBe(1);
  });

  test("a pickup already past (or a wrong clock) is last minute, never free", () => {
    const now = lisbonLocalToEpoch("2030-03-10 12:00")!;
    expect(leadTimeSurge("2030-03-10 10:00", now, "large", cfg)).toBe(1.2);
  });

  test("the minimum holds below the break-even distance and stops right after", () => {
    const t = SHEET.find(([n]) => n === "Business Class")![1];
    const p = (km: number) => priceTrip({ vehicle: { pricePerKm: 1, minimumPrice: 1, tariff: t }, vehicleClass: "standard", config: cfg, partner: null, distance: km }).price;
    // 25 + 1.55 × km = 50 → km ≈ 16.1 (the 16th km is in band 2)
    expect(p(16)).toBe(50);
    expect(p(17)).toBeGreaterThan(50);
  });

  test("price never goes down as distance grows", () => {
    for (const [name, tariff, cls] of SHEET) {
      let last = 0;
      for (let km = 0.5; km <= 600; km += 0.5) {
        const p = priceTrip({ vehicle: { pricePerKm: 1, minimumPrice: 1, tariff }, vehicleClass: cls, config: cfg, partner: null, distance: km }).price;
        expect(p, `${name} ${km} km`).toBeGreaterThanOrEqual(last);
        last = p;
      }
    }
  });

  test("the average €/km falls with distance (the dilution the sheet promises)", () => {
    for (const [name, tariff, cls] of SHEET) {
      const perKm = (km: number) => priceTrip({ vehicle: { pricePerKm: 1, minimumPrice: 1, tariff }, vehicleClass: cls, config: cfg, partner: null, distance: km }).price / km;
      expect(perKm(138), name).toBeLessThan(perKm(30));
      expect(perKm(315), name).toBeLessThan(perKm(138));
    }
  });

  test("the night part is what the night added, day + night parts = price", () => {
    for (const [, tariff, cls] of SHEET) {
      const p = priceTrip({
        vehicle: { pricePerKm: 1, minimumPrice: 1, tariff },
        vehicleClass: cls,
        config: cfg,
        partner: {},
        distance: 60,
        departureDate: "2030-03-11 23:00",
        bookReturn: true,
        returnDate: "2030-03-12 05:00",
        isAirportPickup: true,
        airportSurchargePercent: 12,
        now: NOW,
      });
      expect(p.dayPrice + p.nightTaxOutbound + p.nightTaxReturn).toBeCloseTo(p.price, 2);
      expect(p.nightTaxOutbound).toBeGreaterThan(0);
      expect(p.nightTaxReturn).toBeGreaterThan(0);
    }
  });

  test("no distance: no price, whatever the levers", () => {
    for (const km of [0, -5, null, undefined]) {
      expect(priceTrip({ vehicle: { pricePerKm: 1, minimumPrice: 1, tariff: SHEET[0]![1] }, vehicleClass: "standard", config: cfg, partner: null, distance: km }).hasDistance).toBe(false);
    }
  });
});

describe("every lever is read from the settings", () => {
  const t = SHEET.find(([n]) => n === "Business Class")![1];
  const at = (c: PricingConfig, extra: Partial<Parameters<typeof priceTrip>[0]> = {}) =>
    priceTrip({ vehicle: { pricePerKm: 1, minimumPrice: 1, tariff: t }, vehicleClass: "standard", config: c, partner: null, distance: 30, departureDate: "2030-03-11 12:00", now: NOW, ...extra }).price;

  test("bands", () => {
    const flat = { ...cfg, bands: [{ upToKm: null, pct: 1 }] };
    expect(at(flat)).toBeCloseTo(25 + 1.55 * 30, 2);
  });
  test("surge per class and the hour marks", () => {
    const c = { ...cfg, surge: { ...cfg.surge, standard: { sameDay: 1.5, lastMinute: 2 } }, freeAfterHours: 48 };
    expect(at(c)).toBeCloseTo(at(cfg) * 1.5, 1);
  });
  test("early morning window", () => {
    const c = { ...cfg, earlyMorningFrom: 11, earlyMorningTo: 13 };
    expect(at(c)).toBeCloseTo(at(cfg) * 1.12, 1);
  });
  test("partner factor", () => {
    expect(at({ ...cfg, partnerFactor: 1.3 }, { partner: {} })).toBeCloseTo(at(cfg) * 1.3, 1);
  });
  test("night window", () => {
    expect(at({ ...cfg, nightFrom: 11, nightTo: 14 })).toBeCloseTo(at(cfg) * 1.097, 1);
  });
  test("missing keys in the stored settings take the sheet's defaults", () => {
    const c = pricingConfigOf({ model: "bands", partnerFactor: 1.2 } as Partial<PricingConfig>);
    expect(c.partnerFactor).toBe(1.2);
    expect(c.bands).toEqual(PRICING_DEFAULTS.bands);
    expect(c.extras).toEqual({ childSeat: 5, surfboard: 5, pet: 15 });
    expect(c.nightFrom).toBe(20);
  });
});

/* ───────────────────────── The checkout, on the server ───────────────────── */

let t: ReturnType<typeof makeTest>;
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  t = makeTest();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const carBase = { luggage: 20, hasWifi: true, isElectric: false, status: "active" as const, pricePerKmNight: 1 };

async function fleet(pricing: Partial<PricingConfig> = {}) {
  return await t.run(async (ctx) => {
    const minibus = await ctx.db.insert("vehicleCategories", { name: "Minibus", vehicleClass: "large", status: "active", order: 2 });
    const business = await ctx.db.insert("vehicleCategories", { name: "Business Class", vehicleClass: "standard", status: "active", order: 1 });
    const mk = (name: string, passengers: number, categoryId: Id<"vehicleCategories">, tariff: Tariff, order: number, luggage = 20) =>
      ctx.db.insert("vehicles", { ...carBase, luggage, name, passengers, categoryId, order, tariff });
    const tariffOf = (n: string) => SHEET.find(([x]) => x === n)![1];
    const bc = await mk("Business Class", 3, business, tariffOf("Business Class"), 1, 3);
    const mb15 = await mk("Mini Bus (max 15 pax)", 15, minibus, tariffOf("Mini Bus 15"), 2, 13);
    const mb20 = await mk("Mini Bus (16–20 pax)", 20, minibus, tariffOf("Mini Bus 20"), 3, 16);
    const mb22 = await mk("Mini Bus (21–22 pax)", 22, minibus, tariffOf("Mini Bus 22"), 4, 20);
    await ctx.db.insert("siteSettings", { key: "global", minAdvanceBookingHours: 2, pricing: { ...PRICING_DEFAULTS, ...pricing } });
    return { minibus, business, bc, mb15, mb20, mb22 };
  });
}

const LISBOA = { location: "Lisboa", lat: 38.7223, lng: -9.1393 };
const CASCAIS = { location: "Cascais", lat: 38.6979, lng: -9.4215 };
const AEROPORTO = { location: "Aeroporto Humberto Delgado", lat: 38.7742, lng: -9.1342 };

async function book(o: { from?: typeof LISBOA; passengers: number; date: string; returnDate?: string; partnershipSlug?: string; partnerCheckout?: boolean }) {
  const r = await t.mutation(api.orders.init, {
    departure: o.from ?? LISBOA,
    arrival: CASCAIS,
    passengers: o.passengers,
    departureDate: o.date,
    isRoundTrip: Boolean(o.returnDate),
    returnDate: o.returnDate,
    partnershipSlug: o.partnershipSlug,
    partnerCheckout: o.partnerCheckout,
  });
  const ida = (r.order as { _id: Id<"orders"> })._id;
  return ida;
}

const payArgs = (orderId: Id<"orders">, amount: number) => ({
  orderId,
  method: "cash" as const,
  amount,
  basePrice: amount,
  discountAmount: 0,
  additionalFees: 0,
  nightTax: 0,
  airportServiceFee: 0,
  cancellationFee: 0,
  refundFee: 0,
  refundToOriginalPaymentMethod: false,
  email: "cliente@example.com",
  phoneNumber: "+351910000000",
});

describe("the checkout on the server", () => {
  test("quote → choose → trip → cash payment at the quoted price: accepted, snapshot stored", async () => {
    const s = await fleet();
    const date = "2030-06-10 12:00";
    const q = await t.query(api.vehicles.listQuoted, { passengers: 18, distance: 30, departureDate: date, now: Date.now() });
    const line = q.find((r) => r.name === "Minibus")!;
    expect(line._id).toBe(s.mb20);
    const id = await book({ passengers: 18, date });
    await t.mutation(api.orders.selectCar, { orderId: id, vehicleId: line._id, vehicleName: line.name, price: line.price, passengerCapacity: 20 });
    await t.mutation(api.orders.registTrip, { orderId: id, departureDate: date, passengers: 18, distance: 30 });
    await t.action(api.orders.startPaymentAction, payArgs(id, Math.ceil(line.price)));
    const o = (await t.run((ctx) => ctx.db.get(id)))!;
    expect(o.paymentStatus).toBe("completed");
    expect(o.vehicleName).toBe("Mini Bus (16–20 pax)");
    expect(o.categoryId).toBe(s.minibus);
    expect(o.pricingSnapshot?.model).toBe("bands");
    expect(o.pricingSnapshot?.car).toBe(line.price);
    expect(o.pricingWarning).toBeUndefined();
    /* Paying again a paid booking is refused (it used to open a second
       Stripe session the customer could also pay). */
    await expect(t.action(api.orders.startPaymentAction, payArgs(id, Math.ceil(line.price)))).rejects.toThrow(/já está paga/);
  });

  test("the route recomputed after the trip step: the payment is checked against the route paid", async () => {
    const s = await fleet();
    const date = "2030-06-10 12:00";
    const id = await book({ passengers: 2, date });
    await t.mutation(api.orders.selectCar, { orderId: id, vehicleId: s.bc, vehicleName: "Business Class", price: 1, passengerCapacity: 3 });
    /* Saved at 60 km, then Google gave 30 km and the customer saw that price. */
    await t.mutation(api.orders.registTrip, { orderId: id, departureDate: date, passengers: 2, distance: 60 });
    const q = await t.query(api.vehicles.listQuoted, { passengers: 2, distance: 30, departureDate: date, now: Date.now() });
    const price = Math.ceil(q.find((r) => r._id === s.bc)!.price);
    await t.action(api.orders.startPaymentAction, { ...payArgs(id, price), distance: 30, routeDurationMinutes: 35 });
    const o = (await t.run((ctx) => ctx.db.get(id)))!;
    expect(o.distance).toBe(30);
    expect(o.pricingSnapshot?.distance).toBe(30);
    expect(o.pricingWarning).toBeUndefined();
  });

  test("a route shorter than the straight line is not believed", async () => {
    const s = await fleet();
    const date = "2030-06-10 12:00";
    const id = await book({ passengers: 2, date });
    await t.mutation(api.orders.selectCar, { orderId: id, vehicleId: s.bc, vehicleName: "Business Class", price: 1, passengerCapacity: 3 });
    await t.mutation(api.orders.registTrip, { orderId: id, departureDate: date, passengers: 2, distance: 30 });
    /* Lisboa–Cascais is ~25 km in a straight line: 1 km is a lie. */
    await expect(t.action(api.orders.startPaymentAction, { ...payArgs(id, 50), distance: 1 })).rejects.toThrow(/pelo menos/);
  });

  test("paying well below the price is refused", async () => {
    const s = await fleet();
    const date = "2030-06-10 12:00";
    const id = await book({ passengers: 2, date });
    await t.mutation(api.orders.selectCar, { orderId: id, vehicleId: s.bc, vehicleName: "Business Class", price: 1, passengerCapacity: 3 });
    await t.mutation(api.orders.registTrip, { orderId: id, departureDate: date, passengers: 2, distance: 30 });
    await expect(t.action(api.orders.startPaymentAction, payArgs(id, 50))).rejects.toThrow(/pelo menos/);
  });

  test("keeping the 15-seat minibus for 20 people is priced as the 20-seat one", async () => {
    const s = await fleet();
    const date = "2030-06-10 12:00";
    const id = await book({ passengers: 20, date });
    await t.mutation(api.orders.selectCar, { orderId: id, vehicleId: s.mb15, vehicleName: "Minibus", price: 1, passengerCapacity: 15 });
    await t.mutation(api.orders.registTrip, { orderId: id, departureDate: date, passengers: 20, distance: 30 });
    const m = await t.query(internal.orders.minimoAPagar, { orderId: id, opcoes: [] });
    const q = await t.query(api.vehicles.listQuoted, { passengers: 20, distance: 30, departureDate: date, now: Date.now() });
    expect(m.carro).toBe(q.find((r) => r.name === "Minibus")!.price);
  });

  test("a partner order pays the channel factor, quote and check agree", async () => {
    const s = await fleet();
    /* The old model's ajustePreco is not read any more. */
    await t.run((ctx) => ctx.db.insert("partnerships", { name: "Hotel", slug: "hotel", theme: {}, ajustePreco: 40 }));
    const date = "2030-06-10 12:00";
    const q = await t.query(api.vehicles.listQuoted, { partnershipSlug: "hotel", passengers: 2, distance: 30, departureDate: date, now: Date.now() });
    const bc = q.find((r) => r._id === s.bc)!;
    expect(bc.price).toBeCloseTo(69.175 * 1.15, 2);
    const id = await book({ passengers: 2, date, partnershipSlug: "hotel", partnerCheckout: true });
    await t.mutation(api.orders.selectCar, { orderId: id, vehicleId: s.bc, vehicleName: "Business Class", price: bc.price, passengerCapacity: 3 });
    await t.mutation(api.orders.registTrip, { orderId: id, departureDate: date, passengers: 2, distance: 30 });
    const m = await t.query(internal.orders.minimoAPagar, { orderId: id, opcoes: [] });
    expect(m.carro).toBe(bc.price);
  });

  test("a partner with its own markup: the checkout and the payment check use it", async () => {
    const s = await fleet();
    await t.run((ctx) => ctx.db.insert("partnerships", { name: "Spa", slug: "spa", theme: {}, priceMarkupPercent: 25 }));
    const date = "2030-06-10 12:00";
    const q = await t.query(api.vehicles.listQuoted, { partnershipSlug: "spa", passengers: 2, distance: 30, departureDate: date, now: Date.now() });
    const bc = q.find((r) => r._id === s.bc)!;
    expect(bc.price).toBeCloseTo(69.175 * 1.25, 2);
    const id = await book({ passengers: 2, date, partnershipSlug: "spa", partnerCheckout: true });
    await t.mutation(api.orders.selectCar, { orderId: id, vehicleId: s.bc, vehicleName: "Business Class", price: bc.price, passengerCapacity: 3 });
    await t.mutation(api.orders.registTrip, { orderId: id, departureDate: date, passengers: 2, distance: 30 });
    const m = await t.query(internal.orders.minimoAPagar, { orderId: id, opcoes: [] });
    expect(m.carro).toBe(bc.price);
  });

  test("a partner from the referral cookie on the main site: attributed, but the site's price", async () => {
    const s = await fleet();
    const hotel = await t.run((ctx) => ctx.db.insert("partnerships", { name: "Hotel", slug: "hotel", theme: {} }));
    const date = "2030-06-10 12:00";
    const id = await book({ passengers: 2, date, partnershipSlug: "hotel" });
    await t.mutation(api.orders.selectCar, { orderId: id, vehicleId: s.bc, vehicleName: "Business Class", price: 1, passengerCapacity: 3 });
    await t.mutation(api.orders.registTrip, { orderId: id, departureDate: date, passengers: 2, distance: 30 });
    const o = (await t.run((ctx) => ctx.db.get(id)))!;
    expect(o.partnershipId).toBe(hotel);
    expect(o.precoDeParceiro).toBeUndefined();
    const m = await t.query(internal.orders.minimoAPagar, { orderId: id, opcoes: [] });
    expect(m.carro).toBe(69.18);
    /* Paying the site's price is accepted with no warning. */
    await t.action(api.orders.startPaymentAction, payArgs(id, 70));
    expect((await t.run((ctx) => ctx.db.get(id)))!.pricingWarning).toBeUndefined();
  });

  test("a round trip on the partner checkout: both legs carry the partner price flag", async () => {
    await fleet();
    await t.run((ctx) => ctx.db.insert("partnerships", { name: "Hotel", slug: "hotel", theme: {} }));
    const id = await book({ passengers: 2, date: "2030-06-10 12:00", returnDate: "2030-06-12 12:00", partnershipSlug: "hotel", partnerCheckout: true });
    const ida = (await t.run((ctx) => ctx.db.get(id)))!;
    const volta = (await t.run((ctx) => ctx.db.get(ida.relatedOrderId!)))!;
    expect([ida.precoDeParceiro, volta.precoDeParceiro]).toEqual([true, true]);
  });

  test("round trip from the airport at night: two legs, airport only on the way out", async () => {
    const s = await fleet();
    const id = await book({ from: AEROPORTO, passengers: 2, date: "2030-06-10 22:00", returnDate: "2030-06-14 12:00" });
    await t.mutation(api.orders.selectCar, { orderId: id, vehicleId: s.bc, vehicleName: "Business Class", price: 1, passengerCapacity: 3 });
    await t.mutation(api.orders.registTrip, { orderId: id, departureDate: "2030-06-10 22:00", passengers: 2, distance: 30 });
    const m = await t.query(internal.orders.minimoAPagar, { orderId: id, opcoes: [] });
    expect(m.snapshot.legs?.map((l) => [l.airport, l.night])).toEqual([
      [1.12, 1.097],
      [1, 1],
    ]);
  });

  test("the luggage extras follow the settings in the payment check", async () => {
    const s = await fleet({ extras: { childSeat: 7, surfboard: 6, pet: 20 } });
    const date = "2030-06-10 12:00";
    const id = await book({ passengers: 2, date });
    await t.mutation(api.orders.selectCar, { orderId: id, vehicleId: s.bc, vehicleName: "Business Class", price: 1, passengerCapacity: 3 });
    await t.mutation(api.orders.registTrip, { orderId: id, departureDate: date, passengers: 2, distance: 30, childSeats: 1, standardSurfboards: 1, smallPets: 1 });
    const m = await t.query(internal.orders.minimoAPagar, { orderId: id, opcoes: [] });
    expect(m.extras).toBe(7 + 6 + 20);
  });

  test("the public settings give the checkout the same extras", async () => {
    await fleet({ extras: { childSeat: 7, surfboard: 6, pet: 20 } });
    const st = await t.query(api.siteSettings.get, {});
    expect((st as { extraPrices: unknown }).extraPrices).toEqual({ childSeat: 7, surfboard: 6, pet: 20 });
  });

  test("bags pick the size too: 10 people with 15 bags get the 20-seat minibus", async () => {
    const s = await fleet();
    const q = await t.query(api.vehicles.listQuoted, { passengers: 10, checkedBaggage: 15, distance: 30 });
    expect(q.find((r) => r.name === "Minibus")!._id).toBe(s.mb20);
  });

  test("an inactive category disappears with its cars; a car without category shows alone", async () => {
    const s = await fleet();
    await t.run(async (ctx) => {
      await ctx.db.patch(s.minibus, { status: "inactive" });
      await ctx.db.insert("vehicles", { ...carBase, name: "Solto", passengers: 4, order: 9, tariff: { baseFare: 0, ratePerKm: 2, nightMultiplier: 1.2, minimum: 50 } });
    });
    const q = await t.query(api.vehicles.listQuoted, { passengers: 2, distance: 30 });
    expect(q.map((r) => r.name)).toEqual(["Business Class", "Solto"]);
    /* 30 km = 15 + 15 × 0.9 weighted km × 2 €. */
    expect(q.find((r) => r.name === "Solto")!.price).toBe(57);
  });

  test("a car without any price is not offered (it would show at 0 €)", async () => {
    await fleet();
    await t.run((ctx) => ctx.db.insert("vehicles", { ...carBase, name: "Sem preço", passengers: 4, order: 9 }));
    const q = await t.query(api.vehicles.listQuoted, { passengers: 2, distance: 30 });
    expect(q.map((r) => r.name)).not.toContain("Sem preço");
  });

  test("where a car shows: site only, some partners only, nowhere", async () => {
    const s = await fleet();
    const hotel = await t.run((ctx) => ctx.db.insert("partnerships", { name: "Hotel", slug: "hotel", theme: {} }));
    await t.run((ctx) => ctx.db.insert("partnerships", { name: "Spa", slug: "spa", theme: {} }));
    const nomes = async (slug?: string) => (await t.query(api.vehicles.listQuoted, { partnershipSlug: slug, passengers: 2, distance: 30 })).map((r) => r.name);
    await t.run((ctx) => ctx.db.patch(s.bc, { showOnSite: true, partnerMode: "none" }));
    expect(await nomes()).toContain("Business Class");
    expect(await nomes("hotel")).not.toContain("Business Class");
    await t.run((ctx) => ctx.db.patch(s.bc, { showOnSite: false, partnerMode: "some", partnerIds: [hotel] }));
    expect(await nomes()).not.toContain("Business Class");
    expect(await nomes("hotel")).toContain("Business Class");
    expect(await nomes("spa")).not.toContain("Business Class");
  });
});

describe("Configurações → Preços", () => {
  const save = async (patch: Partial<PricingConfig>) => {
    const as = t.withIdentity(admin);
    const cur = await as.query(api.definicoes.precos, {});
    return await as.mutation(api.definicoes.guardarPrecos, { versao: cur.versao, precos: { ...cur.precos, ...patch }, sobretaxaAeroporto: cur.sobretaxaAeroporto });
  };

  test("saves and the checkout uses it right away", async () => {
    const s = await fleet();
    await save({ partnerFactor: 1.2, extras: { childSeat: 5, surfboard: 5, pet: 12 } });
    await t.run((ctx) => ctx.db.insert("partnerships", { name: "Hotel", slug: "hotel", theme: {} }));
    const q = await t.query(api.vehicles.listQuoted, { partnershipSlug: "hotel", passengers: 2, distance: 30 });
    expect(q.find((r) => r._id === s.bc)!.price).toBeCloseTo(69.175 * 1.2, 2);
  });

  test.each([
    ["bands out of order", { bands: [{ upToKm: 50, pct: 1 }, { upToKm: 15, pct: 0.9 }, { upToKm: null, pct: 0.8 }] }],
    ["last band with an end", { bands: [{ upToKm: 15, pct: 1 }, { upToKm: 50, pct: 0.9 }] }],
    ["surge below ×1", { surge: { ...PRICING_DEFAULTS.surge, van: { sameDay: 0.9, lastMinute: 1.1 } } }],
    ["last minute longer than free", { lastMinuteHours: 20 }],
    ["partner factor absurd", { partnerFactor: 5 }],
    ["night window of zero hours", { nightFrom: 8, nightTo: 8 }],
    ["negative extra", { extras: { childSeat: -1, surfboard: 5, pet: 15 } }],
    ["band % zero", { bands: [{ upToKm: 15, pct: 0 }, { upToKm: null, pct: 1 }] }],
  ])("refuses %s", async (_n, patch) => {
    await fleet();
    await expect(save(patch as Partial<PricingConfig>)).rejects.toThrow();
  });

  test("two people saving: the second is refused instead of overwriting", async () => {
    await fleet();
    const as = t.withIdentity(admin);
    const cur = await as.query(api.definicoes.precos, {});
    await as.mutation(api.definicoes.guardarPrecos, { versao: cur.versao, precos: { ...cur.precos, partnerFactor: 1.2 }, sobretaxaAeroporto: 12 });
    await expect(as.mutation(api.definicoes.guardarPrecos, { versao: cur.versao, precos: { ...cur.precos, partnerFactor: 1.3 }, sobretaxaAeroporto: 12 })).rejects.toThrow(/Alguém gravou/);
  });

  test("the airport surcharge is saved with the prices and the checkout uses it", async () => {
    const s = await fleet();
    const as = t.withIdentity(admin);
    const cur = await as.query(api.definicoes.precos, {});
    await as.mutation(api.definicoes.guardarPrecos, { versao: cur.versao, precos: cur.precos, sobretaxaAeroporto: 20 });
    const q = await t.query(api.vehicles.listQuoted, { passengers: 2, distance: 30, isAirportPickup: true });
    expect(q.find((r) => r._id === s.bc)!.price).toBeCloseTo(69.175 * 1.2, 2);
    await expect(as.mutation(api.definicoes.guardarPrecos, { versao: (await as.query(api.definicoes.precos, {})).versao, precos: cur.precos, sobretaxaAeroporto: 150 })).rejects.toThrow();
  });

  test("without a session nothing is read or saved", async () => {
    await fleet();
    await expect(t.query(api.definicoes.precos, {})).rejects.toThrow();
    await expect(t.query(api.pricingReport.parceiros, {})).rejects.toThrow();
  });
});

describe("the simulator", () => {
  test("a partner of its own: its markup and only its fleet", async () => {
    const s = await fleet();
    const spa = await t.run((ctx) => ctx.db.insert("partnerships", { name: "Spa", slug: "spa", theme: {}, priceMarkupPercent: 10 }));
    const as = t.withIdentity(admin);
    const args = { pricing: {}, km: 30, hour: 12, hoursAhead: 48, airport: false };
    const site = await as.query(api.pricingReport.simular, args);
    const comSpa = await as.query(api.pricingReport.simular, { ...args, partner: spa });
    const bc = (r: typeof site) => r.rows.find((x) => x.category === "Business Class")!.price;
    expect(bc(comSpa)).toBeCloseTo(bc(site) * 1.1, 1);
    expect(comSpa.partnerFactor).toBeCloseTo(1.1);
    await t.run((ctx) => ctx.db.patch(s.bc, { showOnSite: true, partnerMode: "none" }));
    const semFrota = await as.query(api.pricingReport.simular, { ...args, partner: spa });
    expect(semFrota.rows.map((r) => r.category)).not.toContain("Business Class");
  });

  test("the airport surcharge being edited counts before it is saved", async () => {
    await fleet();
    const as = t.withIdentity(admin);
    const r = await as.query(api.pricingReport.simular, { pricing: {}, km: 30, hour: 12, hoursAhead: 48, airport: true, airportSurchargePercent: 30 });
    expect(r.airportSurchargePercent).toBe(30);
    expect(r.rows.find((x) => x.category === "Business Class")!.price).toBeCloseTo(69.175 * 1.3, 2);
  });
});

describe("migrating the cars saved before 2026-11-27", () => {
  test("a tariff from the old price, the reach from the old owner, the old fields gone; twice is harmless", async () => {
    const hotel = await t.run((ctx) => ctx.db.insert("partnerships", { name: "Hotel", slug: "hotel", theme: {} }));
    const [site, doHotel, comTarifa] = await t.run(async (ctx) => [
      await ctx.db.insert("vehicles", { ...carBase, name: "Antigo", passengers: 3, order: 1, pricePerKm: 2, minimumPrice: 50 }),
      await ctx.db.insert("vehicles", { ...carBase, name: "Do hotel", passengers: 3, order: 2, pricePerKm: 3, minimumPrice: 60, partnershipId: hotel }),
      await ctx.db.insert("vehicles", { ...carBase, name: "Já com tarifa", passengers: 3, order: 3, pricePerKm: 9, minimumPrice: 9, tariff: { baseFare: 25, ratePerKm: 1.55, nightMultiplier: 1.097, minimum: 50 } }),
    ]);
    const lista = await t.mutation(internal.veiculos.migrarParaTarifas, { executar: false });
    expect(lista.carros).toBe(3);
    expect((await t.run((ctx) => ctx.db.get(site)))!.pricePerKm).toBe(2);
    await t.mutation(internal.veiculos.migrarParaTarifas, { executar: true });
    const [a, b, c] = await t.run(async (ctx) => [await ctx.db.get(site), await ctx.db.get(doHotel), await ctx.db.get(comTarifa)]);
    expect(a).toMatchObject({ tariff: { baseFare: 0, ratePerKm: 2, nightMultiplier: 1.2, minimum: 50 }, showOnSite: true, partnerMode: "all" });
    expect(a!.pricePerKm).toBeUndefined();
    expect(b).toMatchObject({ showOnSite: false, partnerMode: "some", partnerIds: [hotel] });
    expect(b!.partnershipId).toBeUndefined();
    /* A car that already had a tariff keeps it: the old fields don't overwrite. */
    expect(c!.tariff).toEqual({ baseFare: 25, ratePerKm: 1.55, nightMultiplier: 1.097, minimum: 50 });
    expect((await t.mutation(internal.veiculos.migrarParaTarifas, { executar: true })).carros).toBe(0);
  });
});

describe("the class is the car's (2026-11-28)", () => {
  test("a car's own class decides the surge, over its category's", async () => {
    const s = await fleet();
    const now = lisbonLocalToEpoch("2030-06-10 08:00")!;
    const q = async () => (await t.query(api.vehicles.listQuoted, { passengers: 2, distance: 30, departureDate: "2030-06-10 10:00", now })).find((r) => r._id === s.bc)!.price;
    /* Business Class's category is standard: last minute ×1.12. */
    expect(await q()).toBeCloseTo(69.175 * 1.12, 2);
    await t.run((ctx) => ctx.db.patch(s.bc, { vehicleClass: "large" }));
    expect(await q()).toBeCloseTo(69.175 * 1.2, 2);
  });

  test("the migration copies the category's class to its cars", async () => {
    const s = await fleet();
    await t.mutation(internal.veiculos.migrarParaTarifas, { executar: true });
    const [bc, mb] = await t.run(async (ctx) => [await ctx.db.get(s.bc), await ctx.db.get(s.mb20)]);
    expect(bc!.vehicleClass).toBe("standard");
    expect(mb!.vehicleClass).toBe("large");
  });
});
