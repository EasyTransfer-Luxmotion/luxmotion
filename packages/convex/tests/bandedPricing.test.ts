import { describe, expect, test } from "vitest";
import {
  PRICING_DEFAULTS,
  bandedKm,
  leadTimeSurge,
  lisbonLocalToEpoch,
  priceTrip,
  priceVehicle,
  type PricingConfig,
  type Tariff,
} from "../convex/lib/pricing";

/*
 * The banded model from the pricing sheet (EasyTransfer_Precificacao_Dinamica
 * .xlsx). The sheet's own examples are checked to the cent: if the code and
 * the sheet disagree, whoever calibrates in the sheet sees one number and the
 * customer pays another.
 */

const bands: PricingConfig = { ...PRICING_DEFAULTS, model: "bands" };
const businessVan: Tariff = { baseFare: 35, ratePerKm: 2.05, nightMultiplier: 1.171, minimum: 70 };
const business: Tariff = { baseFare: 25, ratePerKm: 1.55, nightMultiplier: 1.097, minimum: 50 };
const car = (tariff: Tariff, pricePerKm = 2, minimumPrice = 60) => ({ pricePerKm, minimumPrice, tariff });
const trip = (t: Tariff, km: number, extra: Partial<Parameters<typeof priceTrip>[0]> = {}) =>
  priceTrip({ vehicle: car(t), vehicleClass: "standard", config: bands, partner: null, distance: km, departureDate: "2030-03-10 12:00", ...extra });

describe("distance bands", () => {
  test("each slice of km pays its % of the rate", () => {
    expect(bandedKm(10, bands.bands)).toBe(10);
    expect(bandedKm(45, bands.bands)).toBeCloseTo(15 + 30 * 0.9);
    expect(bandedKm(138, bands.bands)).toBeCloseTo(15 + 35 * 0.9 + 50 * 0.78 + 38 * 0.68);
  });

  test("the sheet's calculator: Business Class Van, 45 km, day, direct = 121.10 €", () => {
    expect(trip(businessVan, 45, { vehicleClass: "van" }).price).toBe(121.1);
  });

  test("the sheet's comparison: Business Class at 30 and 138 km, minimum at 3 km", () => {
    expect(trip(business, 30).price).toBe(69.18);
    expect(trip(business, 138).price).toBe(197.58);
    expect(trip(business, 3).price).toBe(50);
  });
});

describe("night, airport, partner", () => {
  test("night multiplies the leg, and the night part is reported apart", () => {
    const p = trip(business, 30, { departureDate: "2030-03-10 22:00" });
    /* Rounded once, at the end, as the sheet does (base 69.175 × 1.097). */
    expect(p.price).toBeCloseTo(69.175 * 1.097, 2);
    expect(p.nightTaxOutbound).toBeCloseTo(p.price - 69.18, 2);
    expect(p.dayPrice).toBeCloseTo(69.18, 2);
  });

  test("the airport surcharge stays, on the leg that starts at the airport", () => {
    const p = trip(business, 30, { isAirportPickup: true, airportSurchargePercent: 12, bookReturn: true, returnDate: "2030-03-12 12:00" });
    expect(p.legs?.[0]?.airport).toBe(1.12);
    expect(p.legs?.[1]?.airport).toBe(1);
    expect(p.price).toBeCloseTo(69.175 * 1.12 + 69.18, 2);
  });

  test("a partner checkout pays the channel factor; ajustePreco no longer counts", () => {
    const p = trip(business, 30, { partner: { ajustePreco: 40 } });
    expect(p.price).toBeCloseTo(69.175 * 1.15, 2);
  });
});

describe("lead-time surge", () => {
  const now = lisbonLocalToEpoch("2030-03-10 08:00")!;
  test("12 hours or more ahead: none; same day: sameDay; under 3 hours: last minute", () => {
    expect(leadTimeSurge("2030-03-10 20:00", now, "van", bands)).toBe(1);
    expect(leadTimeSurge("2030-03-10 15:00", now, "van", bands)).toBe(1.1);
    expect(leadTimeSurge("2030-03-10 10:00", now, "van", bands)).toBe(1.18);
    expect(leadTimeSurge("2030-03-10 10:00", now, "standard", bands)).toBe(1.12);
  });

  test("pickups between 00:00 and 07:00 always pay last minute, even weeks ahead", () => {
    expect(leadTimeSurge("2030-04-20 05:30", now, "large", bands)).toBe(1.2);
    expect(leadTimeSurge("2030-04-20 07:00", now, "large", bands)).toBe(1);
  });

  test("without a clock there is no surge (never charge more for a missing field)", () => {
    expect(leadTimeSurge("2030-03-10 10:00", undefined, "van", bands)).toBe(1);
  });

  test("Lisbon local time, summer and winter", () => {
    expect(new Date(lisbonLocalToEpoch("2030-01-15 12:00")!).toISOString()).toBe("2030-01-15T12:00:00.000Z");
    expect(new Date(lisbonLocalToEpoch("2030-07-15 12:00")!).toISOString()).toBe("2030-07-15T11:00:00.000Z");
  });

  test("a round trip prices each leg with its own surge", () => {
    const p = trip(business, 30, { now, departureDate: "2030-03-10 10:00", bookReturn: true, returnDate: "2030-03-14 12:00" });
    expect(p.legs?.map((l) => l.surge)).toEqual([1.12, 1]);
  });
});

describe("the linear model stays exactly as today", () => {
  test("model linear, or a car without a tariff, gives priceVehicle's number", () => {
    const today = priceVehicle({ pricePerKm: 2, minimumPrice: 60, distance: 100, isNight: true, isAirportPickup: true, airportSurchargePercent: 12 });
    const linear = priceTrip({
      vehicle: { pricePerKm: 2, minimumPrice: 60, tariff: business },
      vehicleClass: "standard",
      config: PRICING_DEFAULTS,
      partner: null,
      distance: 100,
      departureDate: "2030-03-10 22:00",
      isAirportPickup: true,
      airportSurchargePercent: 12,
    });
    expect(linear.price).toBe(today.price);
    const noTariff = priceTrip({ vehicle: { pricePerKm: 2, minimumPrice: 60 }, vehicleClass: "standard", config: bands, partner: null, distance: 100 });
    expect(noTariff.model).toBe("linear");
    expect(noTariff.price).toBe(200);
  });

  test("the partner's ajustePreco keeps working in the linear model", () => {
    const p = priceTrip({ vehicle: { pricePerKm: 2, minimumPrice: 60 }, vehicleClass: "standard", config: PRICING_DEFAULTS, partner: { ajustePreco: 10 }, distance: 100 });
    expect(p.price).toBeCloseTo(220, 6);
  });
});

describe("everything from the sheet is configurable", () => {
  test("the night window: 22h–6h instead of 20h–8h", () => {
    const cfg: PricingConfig = { ...bands, nightFrom: 22, nightTo: 6 };
    const at = (h: string) => priceTrip({ vehicle: car(business), vehicleClass: "standard", config: cfg, partner: null, distance: 30, departureDate: `2030-03-10 ${h}` }).nightTaxOutbound;
    expect(at("21:00")).toBe(0);
    expect(at("23:00")).toBeGreaterThan(0);
    expect(at("07:00")).toBe(0);
  });

  test("the sheet's values are the defaults", () => {
    expect(PRICING_DEFAULTS.bands.map((b) => [b.upToKm, b.pct])).toEqual([[15, 1], [50, 0.9], [100, 0.78], [null, 0.68]]);
    expect(PRICING_DEFAULTS.surge).toEqual({ standard: { sameDay: 1.06, lastMinute: 1.12 }, van: { sameDay: 1.1, lastMinute: 1.18 }, large: { sameDay: 1.1, lastMinute: 1.2 } });
    expect([PRICING_DEFAULTS.freeAfterHours, PRICING_DEFAULTS.lastMinuteHours, PRICING_DEFAULTS.earlyMorningFrom, PRICING_DEFAULTS.earlyMorningTo]).toEqual([12, 3, 0, 7]);
    expect(PRICING_DEFAULTS.partnerFactor).toBe(1.15);
    expect([PRICING_DEFAULTS.nightFrom, PRICING_DEFAULTS.nightTo]).toEqual([20, 8]);
    expect(PRICING_DEFAULTS.extras).toEqual({ childSeat: 5, surfboard: 5, pet: 15 });
  });
});
