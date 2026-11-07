import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination";
import { urlDaImagem, apagarImagem, vImagem } from "./lib/imagens";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const experiences = await ctx.db.query("pastExperiences").collect();

    const withUrls = await Promise.all(
      experiences.map(async (exp) => {
        const imageUrl = exp.imageId
          ? await urlDaImagem(ctx, exp.imageId)
          : null;
        return { ...exp, imageUrl };
      })
    );

    return withUrls.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    let rows = await ctx.db.query("pastExperiences").collect();

    rows = applySearch(rows, a.search, [(r) => r.title, (r) => r.location]);

    const status = a.filters?.status;
    if (status) rows = rows.filter((r) => r.status === status);
    const category = a.filters?.category;
    if (category) rows = rows.filter((r) => r.category === category);

    // Default order mirrors `list` (newest first); applySort is a no-op unless sortBy is set.
    rows = rows.sort((x, y) => y.createdAt - x.createdAt);
    rows = applySort(rows, a.sortBy, a.sortDir, {
      title: (r) => r.title.toLowerCase(),
      category: (r) => r.category,
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
    const experiences = await ctx.db
      .query("pastExperiences")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const withUrls = await Promise.all(
      experiences.map(async (exp) => {
        const imageUrl = exp.imageId
          ? await urlDaImagem(ctx, exp.imageId)
          : null;
        return { ...exp, imageUrl };
      })
    );

    return withUrls.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    location: v.string(),
    category: v.union(
      v.literal("corporate"),
      v.literal("weddings"),
      v.literal("events"),
      v.literal("privateTours")
    ),
    tags: v.optional(v.array(v.string())),
    imageId: v.optional(vImagem),
    linkUrl: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("pastExperiences", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("pastExperiences"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    category: v.optional(
      v.union(
        v.literal("corporate"),
        v.literal("weddings"),
        v.literal("events"),
        v.literal("privateTours")
      )
    ),
    tags: v.optional(v.array(v.string())),
    imageId: v.optional(vImagem),
    linkUrl: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Experience not found");

    await ctx.db.patch(id, {
      ...data,
      updatedAt: Date.now(),
    });

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("pastExperiences") },
  handler: async (ctx, args) => {
    const experience = await ctx.db.get(args.id);
    if (!experience) throw new Error("Experience not found");

    if (experience.imageId) {
      await apagarImagem(ctx, experience.imageId);
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
