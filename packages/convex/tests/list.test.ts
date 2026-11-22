import { describe, expect, test } from "vitest";
import { matchesSearch, pageOf, reorderSlice } from "../convex/lib/list";
import { lisbonToday, periodStart } from "../convex/lib/boardFilters";

describe("server-side lists (lib/list.ts)", () => {
  test("search ignores accents and case, and every word must match some field", () => {
    expect(matchesSearch("sao vicente", ["São Vicente"])).toBe(true);
    expect(matchesSearch("LISBOA sintra", ["Tour de Lisboa", "Sintra"])).toBe(true);
    expect(matchesSearch("lisboa porto", ["Tour de Lisboa"])).toBe(false);
    expect(matchesSearch("", ["qualquer"])).toBe(true);
  });

  test("a page beyond the end lands on the last one (an old URL after a filter change)", () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    const p = pageOf(rows, { page: 9, pageSize: 10 });
    expect(p.page).toBe(2);
    expect(p.rows).toEqual([20, 21, 22, 23, 24]);
    expect(p.pageCount).toBe(3);
    expect(p.total).toBe(25);
  });

  test("page size is clamped to 1..100", () => {
    expect(pageOf([1, 2, 3], { page: 0, pageSize: 0 }).pageSize).toBe(1);
    expect(pageOf([1, 2, 3], { page: 0, pageSize: 5000 }).pageSize).toBe(100);
  });

  test("reordering a page refuses rows that are not that page (another tab changed the list)", () => {
    const all = ["a", "b", "c", "d", "e"];
    expect(reorderSlice(all, 2, ["d", "c"])).toEqual(["a", "b", "d", "c", "e"]);
    expect(reorderSlice(all, 2, ["d", "x"])).toBeNull();
    expect(reorderSlice(all, 2, ["d", "d"])).toBeNull();
  });
});

describe("periods in Lisbon time (lib/boardFilters.ts)", () => {
  test("'today' starts at Lisbon midnight in winter (UTC+0) and in summer (UTC+1)", () => {
    expect(new Date(periodStart("today", "2026-01-15")!).toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(new Date(periodStart("today", "2026-07-15")!).toISOString()).toBe("2026-07-14T23:00:00.000Z");
  });

  test("7 and 30 days include today; month and year start on the 1st", () => {
    expect(new Date(periodStart("7d", "2026-01-15")!).toISOString()).toBe("2026-01-09T00:00:00.000Z");
    expect(new Date(periodStart("30d", "2026-01-15")!).toISOString()).toBe("2025-12-17T00:00:00.000Z");
    expect(new Date(periodStart("month", "2026-01-15")!).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(new Date(periodStart("year", "2026-07-15")!).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  test("Lisbon's date, not UTC's: 23:30 UTC in summer is already tomorrow", () => {
    expect(lisbonToday(Date.parse("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
  });
});
