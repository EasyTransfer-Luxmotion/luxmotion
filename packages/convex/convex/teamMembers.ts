import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination";
import { urlDaImagem, apagarImagem, vImagem } from "./lib/imagens";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db.query("teamMembers").collect();

    const withUrls = await Promise.all(
      members.map(async (member) => {
        const imageUrl = member.imageId
          ? await urlDaImagem(ctx, member.imageId)
          : null;
        return { ...member, imageUrl };
      })
    );

    return withUrls.sort((a, b) => a.order - b.order);
  },
});

export const listPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    let rows = await ctx.db.query("teamMembers").collect();

    rows = applySearch(rows, a.search, [(r) => r.name, (r) => r.role]);

    const status = a.filters?.status;
    if (status) rows = rows.filter((r) => r.status === status);

    // Default order matches `list`: ascending by order.
    if (!a.sortBy) {
      rows = [...rows].sort((x, y) => x.order - y.order);
    } else {
      rows = applySort(rows, a.sortBy, a.sortDir, {
        name: (r) => r.name.toLowerCase(),
        role: (r) => (r.role ?? "").toLowerCase(),
        order: (r) => r.order,
      });
    }

    const result = paginate(rows, a.page, a.pageSize);
    const withUrls = await Promise.all(
      result.rows.map(async (r) => ({
        ...r,
        imageUrl: r.imageId ? await urlDaImagem(ctx, r.imageId) : null,
      })),
    );
    return { ...result, rows: withUrls };
  },
});

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const withUrls = await Promise.all(
      members.map(async (member) => {
        const imageUrl = member.imageId
          ? await urlDaImagem(ctx, member.imageId)
          : null;
        return { ...member, imageUrl };
      })
    );

    return withUrls.sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    role: v.string(),
    bio: v.optional(v.string()),
    imageId: v.optional(vImagem),
    status: v.union(v.literal("draft"), v.literal("published")),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("teamMembers", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("teamMembers"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    bio: v.optional(v.string()),
    imageId: v.optional(vImagem),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Team member not found");

    await ctx.db.patch(id, {
      ...data,
      updatedAt: Date.now(),
    });

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.id);
    if (!member) throw new Error("Team member not found");

    if (member.imageId) {
      await apagarImagem(ctx, member.imageId);
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
