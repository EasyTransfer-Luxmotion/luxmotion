import { v } from "convex/values";

/*
 * Back-office lists filter, sort and page here, on the server: the URL sends
 * the filters and the page, and the dashboard only receives the rows it shows.
 * Before this, every list downloaded the whole table and filtered in the
 * browser, so the URL and the screen could disagree.
 */

export const pageArgs = { page: v.number(), pageSize: v.number() };

export function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* Every word of the search must appear in some field, so "lisboa sintra"
   finds a tour whose title has one word and whose destination has the other. */
export function matchesSearch(search: string | undefined, fields: (string | null | undefined)[]): boolean {
  const terms = stripAccents(search ?? "").split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = stripAccents(fields.filter(Boolean).join(" "));
  return terms.every((t) => haystack.includes(t));
}

/* The requested page (0-based), clamped so a stale URL after a filter change
   lands on the last page instead of an empty one. */
export function pageOf<T>(rows: T[], a: { page: number; pageSize: number }) {
  const pageSize = Math.min(Math.max(1, Math.floor(a.pageSize)), 100);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(0, Math.floor(a.page)), pageCount - 1);
  return { rows: rows.slice(page * pageSize, (page + 1) * pageSize), total, page, pageCount, pageSize };
}

export const distinctSorted = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, "pt"));

/* Drag-to-reorder on a paged list: the client holds one page and sends that
   page's ids in their new order. Returns the full new order, or null when the
   page no longer matches the table (another tab reordered or added a row),
   so the caller refuses instead of shuffling rows it did not see. */
export function reorderSlice<T extends string>(all: T[], start: number, ids: T[]): T[] | null {
  const slice = all.slice(start, start + ids.length);
  const sameSet = slice.length === ids.length && new Set(ids).size === ids.length && ids.every((id) => slice.includes(id));
  if (!sameSet) return null;
  return [...all.slice(0, start), ...ids, ...all.slice(start + ids.length)];
}
