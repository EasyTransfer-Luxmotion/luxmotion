import { urlDaImagem, vImagem } from "./lib/imagens";
import { v, ConvexError } from "convex/values"
import { query } from "./_generated/server"
import { mutation } from "./functions"
import type { QueryCtx } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination"
import { CORPORATE_LANGUAGES, corporateOriginalLanguage, localizeCorporateExperience } from "./lib/corporateExperienceTranslations"
import { exigirAdmin } from "./lib/admin";

const durationValidator = v.union(
  v.literal("halfDay"),
  v.literal("fullDay"),
  v.literal("multiDay"),
)

const pillarValidator = v.union(
  v.literal("standard"),
  v.literal("experiences"),
  v.literal("logistics"),
)

const statusValidator = v.union(v.literal("draft"), v.literal("published"))

const experienceItemValidator = v.object({
  strong: v.string(),
  body: v.string(),
})

async function resolveUrls(
  ctx: QueryCtx,
  exp: Doc<"corporateExperiences">,
  locale?: string,
) {
  const galleryImageUrls = await Promise.all(
    (exp.galleryImageIds ?? []).map((id) => urlDaImagem(ctx, id)),
  )
  /* Sem capa (ou com a capa partida), a primeira da galeria. Em produção, as
     60 experiências tinham a capa num ficheiro antigo do Convex que já não
     existia (ficou de fora da migração para o Bunny), e o site mostrava no
     lugar fotografias genéricas que não são de nenhuma delas. */
  const coverImageUrl =
    (exp.coverImageId ? await urlDaImagem(ctx, exp.coverImageId) : null) ??
    galleryImageUrls.find((u): u is string => Boolean(u)) ??
    null
  const translations = await ctx.db.query("corporateExperienceTranslations")
    .withIndex("by_experience", (q) => q.eq("experienceId", exp._id)).collect()
  const originalLanguage = corporateOriginalLanguage(exp)
  const localized = locale
    ? localizeCorporateExperience(exp, translations.find((t) => t.locale === locale), locale)
    : exp
  return {
    ...localized, originalLanguage, coverImageUrl, galleryImageUrls,
    availableLanguages: [originalLanguage, ...translations.map((t) => t.locale).filter((l) => l !== originalLanguage)],
  }
}

function validateLanguage(locale: string) {
  if (!CORPORATE_LANGUAGES.some((language) => language.value === locale)) {
    throw new ConvexError("Este idioma não é usado no site.")
  }
}

export const listPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "corporate", "ver");
    let rows = await ctx.db.query("corporateExperiences").collect()

    rows = applySearch(rows, a.search, [
      (r) => r.titlePrefix,
      (r) => r.titleAccent,
      (r) => r.shortDescription,
      (r) => r.location,
    ])

    const status = a.filters?.status
    if (status) rows = rows.filter((r) => r.status === status)
    const pillar = a.filters?.pillar
    if (pillar) rows = rows.filter((r) => r.pillar === pillar)

    // Default order mirrors `list`; applySort overrides when a sortable column is active.
    rows = rows.sort((x, y) => x.sortOrder - y.sortOrder || y.createdAt - x.createdAt)
    rows = applySort(rows, a.sortBy, a.sortDir, {
      title: (r) => `${r.titlePrefix} ${r.titleAccent}`.toLowerCase(),
      pillar: (r) => r.pillar,
      sortOrder: (r) => r.sortOrder,
      updated: (r) => r.updatedAt,
    })

    const result = paginate(rows, a.page, a.pageSize)
    const withUrls = await Promise.all(result.rows.map((e) => resolveUrls(ctx, e)))
    return { ...result, rows: withUrls }
  },
})

export const listPublished = query({
  args: { locale: v.optional(v.string()) },
  handler: async (ctx, { locale }) => {
    const all = await ctx.db
      .query("corporateExperiences")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect()
    const withUrls = await Promise.all(all.map((e) => resolveUrls(ctx, e, locale)))
    return withUrls.sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt - a.createdAt)
  },
})

export const get = query({
  args: { id: v.id("corporateExperiences") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "corporate", "ver");
    const exp = await ctx.db.get(id)
    if (!exp) return null
    return await resolveUrls(ctx, exp)
  },
})

export const create = mutation({
  args: {
    originalLanguage: v.optional(v.string()),
    titlePrefix: v.string(),
    titleAccent: v.string(),
    shortDescription: v.string(),
    duration: durationValidator,
    pillar: pillarValidator,
    subcategory: v.string(),
    groupSize: v.string(),
    durationLabel: v.string(),
    location: v.string(),
    description: v.string(),
    experienceBody: v.string(),
    experienceItems: v.array(experienceItemValidator),
    routeHighlights: v.array(v.string()),
    whatsIncluded: v.array(v.string()),
    coverImageId: v.optional(vImagem),
    galleryImageIds: v.array(vImagem),
    status: statusValidator,
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "corporate");
    const originalLanguage = corporateOriginalLanguage(args)
    validateLanguage(originalLanguage)
    const now = Date.now()
    return await ctx.db.insert("corporateExperiences", {
      ...args,
      originalLanguage,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id("corporateExperiences"),
    originalLanguage: v.optional(v.string()),
    titlePrefix: v.optional(v.string()),
    titleAccent: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    duration: v.optional(durationValidator),
    pillar: v.optional(pillarValidator),
    subcategory: v.optional(v.string()),
    groupSize: v.optional(v.string()),
    durationLabel: v.optional(v.string()),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    experienceBody: v.optional(v.string()),
    experienceItems: v.optional(v.array(experienceItemValidator)),
    routeHighlights: v.optional(v.array(v.string())),
    whatsIncluded: v.optional(v.array(v.string())),
    coverImageId: v.optional(vImagem),
    galleryImageIds: v.optional(v.array(vImagem)),
    status: v.optional(statusValidator),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "corporate");
    const { id, ...data } = args
    const existing = await ctx.db.get(id)
    if (!existing) throw new ConvexError("Esta experiência já não existe — talvez tenha sido apagada noutra janela.")
    if (data.originalLanguage !== undefined) {
      const originalLanguage = data.originalLanguage
      validateLanguage(originalLanguage)
      const translation = await ctx.db.query("corporateExperienceTranslations")
        .withIndex("by_experience_locale", (q) => q.eq("experienceId", id).eq("locale", originalLanguage)).first()
      if (translation) throw new ConvexError("Apague primeiro a tradução neste idioma; só depois ele pode passar a ser o idioma original.")
    }
    await ctx.db.patch(id, { ...data, updatedAt: Date.now() })
    return id
  },
})

export const setStatus = mutation({
  args: {
    id: v.id("corporateExperiences"),
    status: statusValidator,
  },
  handler: async (ctx, { id, status }) => {
    await exigirAdmin(ctx, "corporate");
    await ctx.db.patch(id, { status, updatedAt: Date.now() })
  },
})

export const remove = mutation({
  args: { id: v.id("corporateExperiences") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "corporate", "editar", "apagar");
    const exp = await ctx.db.get(id)
    if (!exp) throw new ConvexError("Esta experiência já não existe — talvez tenha sido apagada noutra janela.")
    // Capa e galeria não se apagam: os ficheiros podem ser partilhados com outros
    // registos (ver lib/imagens.ts).
    const translations = await ctx.db.query("corporateExperienceTranslations")
      .withIndex("by_experience", (q) => q.eq("experienceId", id)).collect()
    for (const translation of translations) await ctx.db.delete(translation._id)
    await ctx.db.delete(id)
    return id
  },
})

export const getTranslation = query({
  args: { experienceId: v.id("corporateExperiences"), locale: v.string() },
  handler: async (ctx, { experienceId, locale }) => {
    await exigirAdmin(ctx, "corporate", "ver")
    return await ctx.db
      .query("corporateExperienceTranslations")
      .withIndex("by_experience_locale", (q) => q.eq("experienceId", experienceId).eq("locale", locale))
      .first()
  },
})

export const upsertTranslation = mutation({
  args: {
    experienceId: v.id("corporateExperiences"),
    locale: v.string(),
    titlePrefix: v.string(),
    titleAccent: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    groupSize: v.optional(v.string()),
    durationLabel: v.optional(v.string()),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    experienceBody: v.optional(v.string()),
    experienceItems: v.optional(v.array(experienceItemValidator)),
    routeHighlights: v.optional(v.array(v.string())),
    whatsIncluded: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx, "corporate");
    const experience = await ctx.db.get(args.experienceId)
    if (!experience) throw new ConvexError("Esta experiência já não existe — talvez tenha sido apagada noutra janela.")
    validateLanguage(args.locale)
    if (args.locale === corporateOriginalLanguage(experience)) {
      throw new ConvexError("Este é o idioma em que o texto foi escrito: não leva tradução.")
    }
    if (!args.titlePrefix.trim()) throw new ConvexError("Escreva o título neste idioma.")
    const existing = await ctx.db.query("corporateExperienceTranslations")
      .withIndex("by_experience_locale", (q) => q.eq("experienceId", args.experienceId).eq("locale", args.locale)).first()
    const data = { ...args, titlePrefix: args.titlePrefix.trim(), updatedAt: Date.now() }
    if (existing) {
      await ctx.db.replace(existing._id, data)
      return existing._id
    }
    return ctx.db.insert("corporateExperienceTranslations", data)
  },
})

export const removeTranslation = mutation({
  args: { experienceId: v.id("corporateExperiences"), locale: v.string() },
  handler: async (ctx, { experienceId, locale }) => {
    await exigirAdmin(ctx, "corporate");
    const translation = await ctx.db.query("corporateExperienceTranslations")
      .withIndex("by_experience_locale", (q) => q.eq("experienceId", experienceId).eq("locale", locale)).first()
    if (!translation) throw new ConvexError("Esta tradução já não existe — talvez tenha sido apagada noutra janela. Recarregue a página.")
    await ctx.db.delete(translation._id)
    return translation._id
  },
})
