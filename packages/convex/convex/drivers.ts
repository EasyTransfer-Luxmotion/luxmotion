import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination";
import { urlDaImagem, apagarImagem, vImagem } from "./lib/imagens";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const drivers = await ctx.db.query("drivers").collect();

    const withUrls = await Promise.all(
      drivers.map(async (driver) => {
        const imageUrl = driver.imageId
          ? await urlDaImagem(ctx, driver.imageId)
          : null;
        return { ...driver, imageUrl };
      })
    );

    return withUrls.sort((a, b) => a.order - b.order);
  },
});

export const listPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    // Mirror `list`: full collection sorted by order asc as the baseline.
    let rows = (await ctx.db.query("drivers").collect()).sort((x, y) => x.order - y.order);

    rows = applySearch(rows, a.search, [(r) => r.name, (r) => r.location]);

    const status = a.filters?.status;
    if (status) rows = rows.filter((r) => r.status === status);

    rows = applySort(rows, a.sortBy, a.sortDir, {
      name: (r) => r.name.toLowerCase(),
      order: (r) => r.order,
    });

    const result = paginate(rows, a.page, a.pageSize);
    const withImages = await Promise.all(
      result.rows.map(async (r) => ({
        ...r,
        imageUrl: r.imageId ? await urlDaImagem(ctx, r.imageId) : null,
      })),
    );
    return { ...result, rows: withImages };
  },
});

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const drivers = await ctx.db
      .query("drivers")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const withUrls = await Promise.all(
      drivers.map(async (driver) => {
        const imageUrl = driver.imageId
          ? await urlDaImagem(ctx, driver.imageId)
          : null;
        return { ...driver, imageUrl };
      })
    );

    return withUrls.sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    location: v.string(),
    quote: v.string(),
    description: v.optional(v.string()),
    languages: v.optional(v.string()),
    vehicle: v.optional(v.string()),
    rating: v.optional(v.string()),
    rides: v.optional(v.number()),
    imageId: v.optional(vImagem),
    status: v.union(v.literal("draft"), v.literal("published")),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("drivers", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("drivers"),
    name: v.optional(v.string()),
    location: v.optional(v.string()),
    quote: v.optional(v.string()),
    description: v.optional(v.string()),
    languages: v.optional(v.string()),
    vehicle: v.optional(v.string()),
    rating: v.optional(v.string()),
    rides: v.optional(v.number()),
    imageId: v.optional(vImagem),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Driver not found");

    await ctx.db.patch(id, {
      ...data,
      updatedAt: Date.now(),
    });

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("drivers") },
  handler: async (ctx, args) => {
    const driver = await ctx.db.get(args.id);
    if (!driver) throw new Error("Driver not found");

    if (driver.imageId) {
      await apagarImagem(ctx, driver.imageId);
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
