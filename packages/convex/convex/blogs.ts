import { v, type ObjectType, ConvexError } from "convex/values";
import { query, type MutationCtx } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import { generateSlug, calculateReadTime } from "./lib/utils";
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination";
import { urlDaImagem, vImagem } from "./lib/imagens";
import { exigirAdmin } from "./lib/admin";

export const list = query({
  args: {},
  handler: async (ctx) => {
    /* Pública: só o que está publicado. O back-office tem as suas (catalogo*), e
       esta devolvia rascunhos e arquivados a quem a chamasse. */
    const blogs = await ctx.db.query("blogs").withIndex("by_status", (q) => q.eq("status", "published")).collect();

    const blogsWithUrls = await Promise.all(
      blogs.map(async (blog) => {
        const heroImageUrl = blog.heroImageId
          ? await urlDaImagem(ctx, blog.heroImageId)
          : null;

        const authorAvatarUrl = blog.authorAvatarId
          ? await urlDaImagem(ctx, blog.authorAvatarId)
          : null;

        const translations = await ctx.db
          .query("blogTranslations")
          .withIndex("by_blog", (q) => q.eq("blogId", blog._id))
          .collect();

        return {
          ...blog,
          heroImageUrl,
          authorAvatarUrl,
          availableLanguages: [blog.originalLanguage, ...translations.map((t) => t.locale)],
        };
      })
    );

    return blogsWithUrls.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "blog", "ver");
    const blogs = await ctx.db.query("blogs").collect();

    // Enrich with availableLanguages (needed for the Languages column) — cheap
    // translation lookup per row. Avatar/hero URLs are resolved later, page-only.
    let rows = await Promise.all(
      blogs.map(async (blog) => {
        const translations = await ctx.db
          .query("blogTranslations")
          .withIndex("by_blog", (q) => q.eq("blogId", blog._id))
          .collect();
        return {
          ...blog,
          availableLanguages: [blog.originalLanguage, ...translations.map((t) => t.locale)],
        };
      }),
    );

    rows = applySearch(rows, a.search, [
      (r) => r.title,
      (r) => r.excerpt,
      (r) => r.category,
    ]);

    const status = a.filters?.status;
    if (status) rows = rows.filter((r) => r.status === status);
    const category = a.filters?.category;
    if (category) rows = rows.filter((r) => r.category.toLowerCase() === category);

    // Default order matches `list`: newest first by createdAt.
    if (!a.sortBy) {
      rows = [...rows].sort((x, y) => y.createdAt - x.createdAt);
    } else {
      rows = applySort(rows, a.sortBy, a.sortDir, {
        title: (r) => r.title.toLowerCase(),
        date: (r) => r.createdAt,
      });
    }

    const result = paginate(rows, a.page, a.pageSize);
    const withUrls = await Promise.all(
      result.rows.map(async (r) => ({
        ...r,
        heroImageUrl: r.heroImageId ? await urlDaImagem(ctx, r.heroImageId) : null,
        authorAvatarUrl: r.authorAvatarId ? await urlDaImagem(ctx, r.authorAvatarId) : null,
      })),
    );
    return { ...result, rows: withUrls };
  },
});

export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const blogs = await ctx.db
      .query("blogs")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();

    const nonServiceBlogs = blogs.filter((b) => !b.isService);

    const blogsWithUrls = await Promise.all(
      nonServiceBlogs.map(async (blog) => {
        const heroImageUrl = blog.heroImageId
          ? await urlDaImagem(ctx, blog.heroImageId)
          : null;

        const authorAvatarUrl = blog.authorAvatarId
          ? await urlDaImagem(ctx, blog.authorAvatarId)
          : null;

        const translations = await ctx.db
          .query("blogTranslations")
          .withIndex("by_blog", (q) => q.eq("blogId", blog._id))
          .collect();

        return {
          ...blog,
          heroImageUrl,
          authorAvatarUrl,
          availableLanguages: [blog.originalLanguage, ...translations.map((t) => t.locale)],
        };
      })
    );

    return blogsWithUrls.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  },
});

export const listFeatured = query({
  args: {},
  handler: async (ctx) => {
    const blogs = await ctx.db
      .query("blogs")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect();

    const publishedFeatured = blogs
      .filter((b) => b.status === "published" && !b.isService)
      .slice(0, 3);

    const blogsWithUrls = await Promise.all(
      publishedFeatured.map(async (blog) => {
        const heroImageUrl = blog.heroImageId
          ? await urlDaImagem(ctx, blog.heroImageId)
          : null;

        const authorAvatarUrl = blog.authorAvatarId
          ? await urlDaImagem(ctx, blog.authorAvatarId)
          : null;

        const translations = await ctx.db
          .query("blogTranslations")
          .withIndex("by_blog", (q) => q.eq("blogId", blog._id))
          .collect();

        return {
          ...blog,
          heroImageUrl,
          authorAvatarUrl,
          availableLanguages: [blog.originalLanguage, ...translations.map((t) => t.locale)],
        };
      })
    );

    return blogsWithUrls;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const blog = await ctx.db
      .query("blogs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    // Um artigo em rascunho não se lê pelo endereço antes de ser publicado.
    if (!blog || blog.status !== "published") return null;

    const heroImageUrl = blog.heroImageId
      ? await urlDaImagem(ctx, blog.heroImageId)
      : null;

    const editorialImageUrl = blog.editorialImageId
      ? await urlDaImagem(ctx, blog.editorialImageId)
      : null;

    const authorAvatarUrl = blog.authorAvatarId
      ? await urlDaImagem(ctx, blog.authorAvatarId)
      : null;

    const translations = await ctx.db
      .query("blogTranslations")
      .withIndex("by_blog", (q) => q.eq("blogId", blog._id))
      .collect();

    return {
      ...blog,
      heroImageUrl,
      editorialImageUrl,
      authorAvatarUrl,
      translations,
      availableLanguages: [blog.originalLanguage, ...translations.map((t) => t.locale)],
    };
  },
});

export const getById = query({
  args: { id: v.id("blogs") },
  handler: async (ctx, args) => {
    const blog = await ctx.db.get(args.id);
    if (!blog || blog.status !== "published") return null;

    const heroImageUrl = blog.heroImageId
      ? await urlDaImagem(ctx, blog.heroImageId)
      : null;

    const editorialImageUrl = blog.editorialImageId
      ? await urlDaImagem(ctx, blog.editorialImageId)
      : null;

    const authorAvatarUrl = blog.authorAvatarId
      ? await urlDaImagem(ctx, blog.authorAvatarId)
      : null;

    const translations = await ctx.db
      .query("blogTranslations")
      .withIndex("by_blog", (q) => q.eq("blogId", blog._id))
      .collect();

    return {
      ...blog,
      heroImageUrl,
      editorialImageUrl,
      authorAvatarUrl,
      translations,
      availableLanguages: [blog.originalLanguage, ...translations.map((t) => t.locale)],
    };
  },
});

export const getCategories = query({
  args: {},
  handler: async (ctx) => {
    const blogs = await ctx.db.query("blogs").collect();
    const categories = [...new Set(blogs.map((b) => b.category))];
    return categories.sort();
  },
});

const argscriarBlog = {
    title: v.string(),
    excerpt: v.string(),
    content: v.any(),
    heroImageId: v.optional(vImagem),
    heroImageAlt: v.optional(v.string()),
    heroImageFilename: v.optional(v.string()),
    editorialImageId: v.optional(vImagem),
    editorialImageAlt: v.optional(v.string()),
    editorialImageCaption: v.optional(v.string()),
    editorialImageFilename: v.optional(v.string()),
    category: v.string(),
    author: v.string(),
    authorRole: v.optional(v.string()),
    authorBio: v.optional(v.string()),
    authorAvatarId: v.optional(vImagem),
    originalLanguage: v.string(),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    isFeatured: v.boolean(),
    isService: v.optional(v.boolean()),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    faq: v.optional(
      v.array(v.object({ question: v.string(), answer: v.string() })),
    ),
  };

async function criarBlog(ctx: MutationCtx, args: ObjectType<typeof argscriarBlog>) {
    if (args.isFeatured) {
      const featuredCount = await ctx.db
        .query("blogs")
        .withIndex("by_featured", (q) => q.eq("isFeatured", true))
        .collect();
      if (featuredCount.length >= 6) {
        throw new ConvexError("Já há 6 artigos em destaque, o máximo. Tire um do destaque primeiro.");
      }
    }

    if (args.isService) {
      const serviceCount = await ctx.db
        .query("blogs")
        .withIndex("by_service", (q) => q.eq("isService", true))
        .collect();
      if (serviceCount.length >= 3) {
        throw new ConvexError("Já há 3 artigos de serviço, o máximo. Tire um primeiro.");
      }
    }

    const now = Date.now();
    let slug = generateSlug(args.title);

    const existing = await ctx.db
      .query("blogs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (existing) {
      slug = `${slug}-${now}`;
    }

    const readTimeMinutes = calculateReadTime(args.content);

    const { isService: isServiceArg, ...restArgs } = args;
    const blogId = await ctx.db.insert("blogs", {
      ...restArgs,
      isService: isServiceArg ?? false,
      slug,
      readTimeMinutes,
      publishedAt: args.status === "published" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    return blogId;
  }

export const create = mutation({
  args: argscriarBlog,
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "blog");
    return await criarBlog(ctx, args);
  },
});

/** A mesma coisa, para a automação do blog — corre agendada, sem sessão. */
export const createInterno = internalMutation({
  args: argscriarBlog,
  handler: (ctx, args) => criarBlog(ctx, args),
});

const argsatualizarBlog = {
    id: v.id("blogs"),
    title: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    content: v.optional(v.any()),
    heroImageId: v.optional(vImagem),
    heroImageAlt: v.optional(v.string()),
    heroImageFilename: v.optional(v.string()),
    editorialImageId: v.optional(vImagem),
    editorialImageAlt: v.optional(v.string()),
    editorialImageCaption: v.optional(v.string()),
    editorialImageFilename: v.optional(v.string()),
    category: v.optional(v.string()),
    author: v.optional(v.string()),
    authorRole: v.optional(v.string()),
    authorBio: v.optional(v.string()),
    authorAvatarId: v.optional(vImagem),
    originalLanguage: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"), v.literal("archived"))),
    isFeatured: v.optional(v.boolean()),
    isService: v.optional(v.boolean()),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    faq: v.optional(
      v.array(v.object({ question: v.string(), answer: v.string() })),
    ),
  };

async function atualizarBlog(ctx: MutationCtx, args: ObjectType<typeof argsatualizarBlog>) {
    const { id, isService: isServiceArg, ...data } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new ConvexError("Este artigo já não existe — talvez tenha sido apagado noutra janela.");

    if (data.isFeatured && !existing.isFeatured) {
      const featuredCount = await ctx.db
        .query("blogs")
        .withIndex("by_featured", (q) => q.eq("isFeatured", true))
        .collect();
      if (featuredCount.length >= 6) {
        throw new ConvexError("Já há 6 artigos em destaque, o máximo. Tire um do destaque primeiro.");
      }
    }

    // Partial-update safe: only flip isService when it's explicitly provided.
    const isService = isServiceArg ?? existing.isService ?? false;
    if (isService && !existing.isService) {
      const serviceCount = await ctx.db
        .query("blogs")
        .withIndex("by_service", (q) => q.eq("isService", true))
        .collect();
      if (serviceCount.length >= 3) {
        throw new ConvexError("Já há 3 artigos de serviço, o máximo. Tire um primeiro.");
      }
    }

    const now = Date.now();

    let publishedAt = existing.publishedAt;
    if (data.status === "published" && existing.status !== "published") {
      publishedAt = now;
    }

    await ctx.db.patch(id, {
      ...data,
      isService,
      // Only recompute read time when the content actually changed.
      ...(data.content !== undefined
        ? { readTimeMinutes: calculateReadTime(data.content) }
        : {}),
      publishedAt,
      updatedAt: now,
    });

    return id;
  }

export const update = mutation({
  args: argsatualizarBlog,
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "blog");
    return await atualizarBlog(ctx, args);
  },
});

/** A mesma coisa, para a automação do blog — corre agendada, sem sessão. */
export const updateInterno = internalMutation({
  args: argsatualizarBlog,
  handler: (ctx, args) => atualizarBlog(ctx, args),
});

export const remove = mutation({
  args: { id: v.id("blogs") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "blog", "editar", "apagar");
    const blog = await ctx.db.get(args.id);
    if (!blog) throw new ConvexError("Este artigo já não existe — talvez tenha sido apagado noutra janela.");

    const translations = await ctx.db
      .query("blogTranslations")
      .withIndex("by_blog", (q) => q.eq("blogId", args.id))
      .collect();

    for (const translation of translations) {
      await ctx.db.delete(translation._id);
    }

    // Hero, editorial e avatar não se apagam: os ficheiros podem ser partilhados
    // com outros registos (ver lib/imagens.ts).

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getImageUrl = mutation({
  args: { storageId: vImagem },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "blog");
    return await urlDaImagem(ctx, args.storageId);
  },
});

export const countFeatured = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "blog", "ver");
    const featured = await ctx.db
      .query("blogs")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect();
    return featured.length;
  },
});

export const countServices = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "blog", "ver");
    const services = await ctx.db
      .query("blogs")
      .withIndex("by_service", (q) => q.eq("isService", true))
      .collect();
    return services.length;
  },
});

export const toggleFeatured = mutation({
  args: { id: v.id("blogs") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "blog");
    const blog = await ctx.db.get(args.id);
    if (!blog) throw new ConvexError("Este artigo já não existe — talvez tenha sido apagado noutra janela.");

    if (!blog.isFeatured) {
      const featuredCount = await ctx.db
        .query("blogs")
        .withIndex("by_featured", (q) => q.eq("isFeatured", true))
        .collect();
      if (featuredCount.length >= 6) {
        throw new ConvexError("Já há 6 artigos em destaque, o máximo. Tire um do destaque primeiro.");
      }
    }

    await ctx.db.patch(args.id, {
      isFeatured: !blog.isFeatured,
      updatedAt: Date.now(),
    });

    return !blog.isFeatured;
  },
});

export const publish = mutation({
  args: { id: v.id("blogs") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "blog");
    const blog = await ctx.db.get(args.id);
    if (!blog) throw new ConvexError("Este artigo já não existe — talvez tenha sido apagado noutra janela.");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "published",
      publishedAt: blog.publishedAt ?? now,
      updatedAt: now,
    });

    return args.id;
  },
});

export const unpublish = mutation({
  args: { id: v.id("blogs") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "blog");
    const blog = await ctx.db.get(args.id);
    if (!blog) throw new ConvexError("Este artigo já não existe — talvez tenha sido apagado noutra janela.");

    await ctx.db.patch(args.id, {
      status: "draft",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

const argsgravarTraducaoBlog = {
    blogId: v.id("blogs"),
    locale: v.string(),
    title: v.string(),
    excerpt: v.string(),
    content: v.any(),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
  };

async function gravarTraducaoBlog(ctx: MutationCtx, args: ObjectType<typeof argsgravarTraducaoBlog>) {
    const blog = await ctx.db.get(args.blogId);
    if (!blog) throw new ConvexError("Este artigo já não existe — talvez tenha sido apagado noutra janela.");

    if (args.locale === blog.originalLanguage) {
      throw new ConvexError("Este é o idioma em que o texto foi escrito: não leva tradução.");
    }

    const existing = await ctx.db
      .query("blogTranslations")
      .withIndex("by_blog_locale", (q) =>
        q.eq("blogId", args.blogId).eq("locale", args.locale)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        excerpt: args.excerpt,
        content: args.content,
        seoTitle: args.seoTitle,
        seoDescription: args.seoDescription,
        updatedAt: now,
      });
      return existing._id;
    }

    const translationId = await ctx.db.insert("blogTranslations", {
      blogId: args.blogId,
      locale: args.locale,
      title: args.title,
      excerpt: args.excerpt,
      content: args.content,
      seoTitle: args.seoTitle,
      seoDescription: args.seoDescription,
      updatedAt: now,
    });

    return translationId;
  }

export const upsertTranslation = mutation({
  args: argsgravarTraducaoBlog,
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "blog");
    return await gravarTraducaoBlog(ctx, args);
  },
});

/** A mesma coisa, para a automação do blog — corre agendada, sem sessão. */
export const upsertTranslationInterno = internalMutation({
  args: argsgravarTraducaoBlog,
  handler: (ctx, args) => gravarTraducaoBlog(ctx, args),
});

export const removeTranslation = mutation({
  args: {
    blogId: v.id("blogs"),
    locale: v.string()
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "blog");
    const translation = await ctx.db
      .query("blogTranslations")
      .withIndex("by_blog_locale", (q) =>
        q.eq("blogId", args.blogId).eq("locale", args.locale)
      )
      .first();

    if (!translation) throw new ConvexError("Esta tradução já não existe — talvez tenha sido apagada noutra janela. Recarregue a página.");

    await ctx.db.delete(translation._id);
    return translation._id;
  },
});
