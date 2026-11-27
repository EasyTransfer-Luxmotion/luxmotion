import { describe, expect, test } from "vitest";
import { isNightDeparture } from "../convex/lib/pricing";
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
