import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { pagedArgs, paginate, applySearch, applySort } from "./lib/pagination";
import { urlDaImagem, vImagem } from "./lib/imagens";

const landingTemplateValidator = v.optional(
  v.union(
    v.literal("transfer"),
    v.literal("whitelabel"),
    v.literal("wedding-whitelabel"),
  ),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const partnerships = await ctx.db.query("partnerships").collect();
    return Promise.all(
      partnerships.map(async (p) => ({
        ...p,
        logoUrl: p.logoId ? await urlDaImagem(ctx, p.logoId) : null,
        heroImageUrl: p.heroImageId ? await urlDaImagem(ctx, p.heroImageId) : null,
      }))
    );
  },
});

export const listPaged = query({
  args: pagedArgs,
  handler: async (ctx, a) => {
    let rows = await ctx.db.query("partnerships").collect();

    rows = applySearch(rows, a.search, [(r) => r.name, (r) => r.slug]);

    const template = a.filters?.template;
    if (template) rows = rows.filter((r) => (r.landingTemplate ?? "transfer") === template);
    const status = a.filters?.status;
    if (status) rows = rows.filter((r) => (r.status ?? "active") === status);

    rows = applySort(rows, a.sortBy, a.sortDir, {
      name: (r) => r.name.toLowerCase(),
      slug: (r) => r.slug.toLowerCase(),
    });

    const result = paginate(rows, a.page, a.pageSize);
    const withLogos = await Promise.all(
      result.rows.map(async (r) => ({
        ...r,
        logoUrl: r.logoId ? await urlDaImagem(ctx, r.logoId) : null,
        heroImageUrl: r.heroImageId ? await urlDaImagem(ctx, r.heroImageId) : null,
      })),
    );
    return { ...result, rows: withLogos };
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const partnership = await ctx.db
      .query("partnerships")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!partnership) return null;
    return {
      ...partnership,
      logoUrl: partnership.logoId ? await urlDaImagem(ctx, partnership.logoId) : null,
      heroImageUrl: partnership.heroImageId ? await urlDaImagem(ctx, partnership.heroImageId) : null,
    };
  },
});

export const getById = query({
  args: { id: v.id("partnerships") },
  handler: async (ctx, args) => {
    const partnership = await ctx.db.get(args.id);
    if (!partnership) return null;
    return {
      ...partnership,
      logoUrl: partnership.logoId ? await urlDaImagem(ctx, partnership.logoId) : null,
      heroImageUrl: partnership.heroImageId ? await urlDaImagem(ctx, partnership.heroImageId) : null,
    };
  },
});

/**
 * O slug de uma parceria é um segmento de endereço: `/pt/<slug>`.
 *
 * Não tinha validação nenhuma — era `v.string()` e verificava-se só se já
 * existia. Entrou um `kiss&tell`, e o `&` fez duas estragas de uma vez:
 *
 *   A página respondia 404. A rota até encontrava o ficheiro certo, mas o que
 *   chegava ao `getBySlug` já não era igual ao que estava gravado, e sem
 *   correspondência a página chama `notFound()`.
 *
 *   Pior: o sitemap deixava de ser XML válido. Um `&` solto não é permitido em
 *   XML, e o Google não lê um sitemap mal formado **até ao fim** — rejeita-o
 *   inteiro. Um slug mau tirava do sitemap os outros cento e cinquenta e três
 *   endereços.
 *
 * Daí a regra ser estreita de propósito: minúsculas, dígitos e hífens. Tudo o
 * que precise de ser codificado num endereço fica de fora.
 */
const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validarSlug(slug: string): void {
  if (!slug) {
    throw new Error("O endereço da parceria não pode ficar vazio.");
  }
  if (slug.length > 60) {
    throw new Error("O endereço da parceria não pode ter mais de 60 caracteres.");
  }
  if (!SLUG_VALIDO.test(slug)) {
    throw new Error(
      `"${slug}" não serve como endereço: usa só minúsculas, números e hífens ` +
        `(por exemplo "kiss-tell"). Acentos, espaços e sinais como & partem o ` +
        `endereço e o sitemap.`,
    );
  }
}

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    theme: v.any(),
    content: v.optional(v.any()),
    logoId: v.optional(vImagem),
    status: v.optional(v.string()),
    landingTemplate: landingTemplateValidator,
  },
  handler: async (ctx, args) => {
    validarSlug(args.slug);
    const existing = await ctx.db
      .query("partnerships")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      throw new Error("Partnership with this slug already exists");
    }
    return await ctx.db.insert("partnerships", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("partnerships"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    theme: v.optional(v.any()),
    content: v.optional(v.any()),
    logoId: v.optional(vImagem),
    heroImageId: v.optional(vImagem),
    status: v.optional(v.string()),
    landingTemplate: v.optional(landingTemplateValidator),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    /* Também na edição: uma parceria criada bem podia ser estragada depois. */
    if (data.slug !== undefined) validarSlug(data.slug);
    await ctx.db.patch(id, data);
  },
});

export const remove = mutation({
  args: { id: v.id("partnerships") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Per-partnership dashboard: everything attributed to a partnership across every
// lead/order surface (affiliate attribution via partnershipId). Full-table scans
// + filter — fine for the admin (these tables are modest); add by_partnership
// indexes if any grows large.
export const getLeadStats = query({
  args: { partnershipId: v.id("partnerships") },
  handler: async (ctx, { partnershipId }) => {
    const at = (r: any): number => r.createdAt ?? r._creationTime;
    const mineOf = (rows: any[]) =>
      rows.filter((r) => r.partnershipId === partnershipId);

    const summarize = (mine: any[]) => ({
      count: mine.length,
      recent: [...mine]
        .sort((a, b) => at(b) - at(a))
        .slice(0, 8)
        .map((r) => ({
          _id: r._id as string,
          label:
            r.fullName ||
            r.name ||
            r.author ||
            r.companyName ||
            r.company ||
            r.email ||
            "—",
          email: (r.email as string | undefined) ?? null,
          status: (r.status as string | undefined) ?? null,
          createdAt: at(r),
        })),
    });

    const [
      orders,
      tourInquiries,
      tourBookings,
      contactSubmissions,
      contactQuotes,
      corporateRequests,
      schoolQuoteSubmissions,
      weddingQuoteSubmissions,
    ] = await Promise.all([
      ctx.db.query("orders").collect(),
      ctx.db.query("tourInquiries").collect(),
      ctx.db.query("tourBookings").collect(),
      ctx.db.query("contactSubmissions").collect(),
      ctx.db.query("contactQuotes").collect(),
      ctx.db.query("corporateRequests").collect(),
      ctx.db.query("schoolQuoteSubmissions").collect(),
      ctx.db.query("weddingQuoteSubmissions").collect(),
    ]);

    const groups = {
      orders: mineOf(orders),
      tourInquiries: mineOf(tourInquiries),
      tourBookings: mineOf(tourBookings),
      contactSubmissions: mineOf(contactSubmissions),
      contactQuotes: mineOf(contactQuotes),
      corporateRequests: mineOf(corporateRequests),
      schoolQuoteSubmissions: mineOf(schoolQuoteSubmissions),
      weddingQuoteSubmissions: mineOf(weddingQuoteSubmissions),
    };

    // Monthly timeline — total attributed per month over the last 6 months.
    const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const now = new Date(Date.now());
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS_PT[d.getMonth()] ?? "", count: 0 };
    });
    const idx = new Map(months.map((m) => [m.key, m]));
    for (const mine of Object.values(groups)) {
      for (const r of mine) {
        const d = new Date(at(r));
        const m = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
        if (m) m.count += 1;
      }
    }

    return {
      orders: summarize(groups.orders),
      tourInquiries: summarize(groups.tourInquiries),
      tourBookings: summarize(groups.tourBookings),
      contactSubmissions: summarize(groups.contactSubmissions),
      contactQuotes: summarize(groups.contactQuotes),
      corporateRequests: summarize(groups.corporateRequests),
      schoolQuoteSubmissions: summarize(groups.schoolQuoteSubmissions),
      weddingQuoteSubmissions: summarize(groups.weddingQuoteSubmissions),
      total: Object.values(groups).reduce((s, m) => s + m.length, 0),
      timeline: months.map((m) => ({ label: m.label, count: m.count })),
    };
  },
});

