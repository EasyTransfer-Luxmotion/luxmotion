import { describe, expect, test } from "vitest";
import { isNightDeparture, priceVehicle } from "../convex/lib/pricing";
import { comAjuste, factorDoParceiro } from "../convex/lib/precoTransfer";
import { gorjeta } from "../convex/lib/precoTours";

/*
 * The transfer price rules (CLAUDE.md → "Preços"). Each case is a rule that
 * once went wrong: night trips charged without the fee, the fee charged per
 * leg on top of the airport surcharge, 57 × 1.1 showing 62.6999…
 */

describe("night departures (20:00–08:00, local time as stored)", () => {
  test.each([
    ["2026-11-22 20:00", true],
    ["2026-11-22 23:59", true],
    ["2026-11-23 07:59", true],
    ["2026-11-23 08:00", false],
    ["2026-11-22 19:59", false],
    ["2026-11-22T21:30:00", true],
  ])("%s → %s", (when, night) => expect(isNightDeparture(when)).toBe(night));

  test("a date without a time is not night: better not to charge than charge for a blank field", () => {
    expect(isNightDeparture("2026-11-22")).toBe(false);
    expect(isNightDeparture(null)).toBe(false);
    expect(isNightDeparture(undefined)).toBe(false);
  });
});

describe("priceVehicle", () => {
  const car = { pricePerKm: 2, minimumPrice: 60 };

  test("the minimum applies to short trips, price per km to long ones", () => {
    expect(priceVehicle({ ...car, distance: 10, isNight: false }).price).toBe(60);
    expect(priceVehicle({ ...car, distance: 100, isNight: false }).price).toBe(200);
  });

  test("no distance, no price (never a guess)", () => {
    const p = priceVehicle({ ...car, distance: 0, isNight: false });
    expect(p.hasDistance).toBe(false);
    expect(p.price).toBe(0);
  });

  test("night fee is 20% of the day fare, at least 9 €", () => {
    expect(priceVehicle({ ...car, distance: 100, isNight: true }).nightTaxOutbound).toBe(40);
    expect(priceVehicle({ pricePerKm: 1, minimumPrice: 30, distance: 10, isNight: true }).nightTaxOutbound).toBe(9);
  });

  test("on a return trip each leg has its own hour", () => {
    const p = priceVehicle({ ...car, distance: 100, isNight: true, isNightReturn: false, bookReturn: true });
    expect(p.dayPrice).toBe(400);
    expect(p.nightTaxOutbound).toBe(40);
    expect(p.nightTaxReturn).toBe(0);
    expect(p.price).toBe(440);
  });

  test("airport surcharge goes on the pickup leg only, and the night fee is on the base fare", () => {
    const p = priceVehicle({ ...car, distance: 100, isNight: true, isAirportPickup: true, airportSurchargePercent: 12 });
    expect(p.dayPrice).toBeCloseTo(224);
    expect(p.nightTaxOutbound).toBe(40);
    expect(p.price).toBeCloseTo(264);
    const r = priceVehicle({ ...car, distance: 100, isNight: false, bookReturn: true, isAirportPickup: true, airportSurchargePercent: 12 });
    expect(r.dayPrice).toBeCloseTo(424);
  });
});

describe("partner price adjustment", () => {
  test("percent becomes a factor; missing or invalid is 1", () => {
    expect(factorDoParceiro({ ajustePreco: 10 })).toBeCloseTo(1.1);
    expect(factorDoParceiro({ ajustePreco: -50 })).toBeCloseTo(0.5);
    expect(factorDoParceiro(null)).toBe(1);
    expect(factorDoParceiro({ ajustePreco: Number.NaN })).toBe(1);
  });

  test("rounded to the cent: 57 × 1.1 is 62.7, not 62.6999…", () => {
    expect(comAjuste(57, 1.1)).toBe(62.7);
    expect(comAjuste(57, 1)).toBe(57);
  });
});

describe("tour tip", () => {
  test("a percentage of the base, rounded like the checkout", () => {
    expect(gorjeta(87, 10, 0)).toBe(9);
  });
  test("a free amount cannot be negative (it was a way to discount the total)", () => {
    expect(() => gorjeta(100, -1, -5)).toThrow();
    expect(gorjeta(100, -1, 7.555)).toBe(7.56);
  });
  test("more than 100% is refused", () => {
    expect(() => gorjeta(100, 150, 0)).toThrow();
  });
});
