import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./functions";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { exigirAdmin, pode } from "./lib/admin";
import { catalogTranslationsValidator } from "./lib/catalogTranslations";
import { urlDaImagem, vImagem } from "./lib/imagens";
import { PRICING_DEFAULTS, priceTrip, type Tariff } from "./lib/pricing";
import { loadPricing } from "./lib/quote";

/*
 * Vehicle categories: what the customer chooses in the checkout ("Minibus",
 * "Business Class"). Each car belongs to one; a category with several sizes
 * shows once and is priced with the smallest car that takes the group
 * (vehicles.listQuoted). Before, the checkout listed twelve minibus and coach
 * variants side by side and the customer had to work out which one fitted.
 */

const vClass = v.union(v.literal("standard"), v.literal("van"), v.literal("large"));
const vStatus = v.union(v.literal("active"), v.literal("inactive"));
const versionOf = (c: Doc<"vehicleCategories">) => c.actualizadoEm ?? c._creationTime;

/* The distances the back-office shows next to each car. */
const SAMPLE_KM = [15, 30, 60, 138];

export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await pode(ctx, "veiculos"))) return null;
    const categories = await ctx.db.query("vehicleCategories").withIndex("by_order").collect();
    const cars = await ctx.db.query("vehicles").collect();
    const pricing = await loadPricing(ctx);
    const byId = new Map(categories.map((c) => [c._id, c]));
    const rows = await Promise.all(
      categories.map(async (c) => {
        const mine = cars
          .filter((car) => car.categoryId === c._id && !car.partnershipId)
          .sort((a, b) => a.passengers - b.passengers || a.luggage - b.luggage);
        return {
          _id: c._id,
          name: c.name,
          examples: c.examples ?? null,
          image: c.imageId ? await urlDaImagem(ctx, c.imageId) : null,
          vehicleClass: c.vehicleClass,
          status: c.status,
          order: c.order,
          version: versionOf(c),
          upgradeOf: c.upgradeFromCategoryId ? (byId.get(c.upgradeFromCategoryId)?.name ?? null) : null,
          translations: (c.translations ?? []).filter((t) => t.name?.trim()).map((t) => t.locale),
          cars: mine.map((car) => ({
            _id: car._id,
            name: car.name,
            status: car.status,
            passengers: car.passengers,
            luggage: car.luggage,
            hasTariff: Boolean(car.tariff),
            prices: SAMPLE_KM.map((km) => ({
              km,
              ...pricesAt(car, c.vehicleClass, km, pricing.airportSurchargePercent, pricing.config),
            })),
          })),
        };
      }),
    );
    const loose = cars.filter((car) => !car.categoryId).map((car) => ({ _id: car._id, name: car.name, status: car.status }));
    return { rows, loose, model: pricing.config.model, sampleKm: SAMPLE_KM };
  },
});

/* Day price of a car at a distance, with today's (linear) and the banded
   model, so the back-office sees both while the new one is calibrated. */
function pricesAt(
  car: Doc<"vehicles">,
  vehicleClass: Doc<"vehicleCategories">["vehicleClass"],
  km: number,
  airportSurchargePercent: number,
  config: Awaited<ReturnType<typeof loadPricing>>["config"],
) {
  const trip = { vehicle: car, vehicleClass, partner: null, distance: km, departureDate: "2030-01-01 12:00", airportSurchargePercent };
  return {
    linear: priceTrip({ ...trip, config: { ...config, model: "linear" } }).price,
    bands: car.tariff ? priceTrip({ ...trip, config: { ...config, model: "bands" } }).price : null,
  };
}

export const detail = query({
  args: { id: v.id("vehicleCategories") },
  handler: async (ctx, { id }) => {
    if (!(await pode(ctx, "veiculos"))) return null;
    const c = await ctx.db.get(id);
    if (!c) return null;
    const all = await ctx.db.query("vehicleCategories").withIndex("by_order").collect();
    const upgrade = all.find((x) => x.upgradeFromCategoryId === id) ?? null;
    return {
      ...c,
      version: versionOf(c),
      image: c.imageId ? await urlDaImagem(ctx, c.imageId) : null,
      upgradeCategoryId: upgrade?._id ?? null,
      others: all.filter((x) => x._id !== id).map((x) => ({ _id: x._id, name: x.name })),
    };
  },
});

const vData = v.object({
  name: v.string(),
  translations: v.optional(catalogTranslationsValidator),
  examples: v.optional(v.string()),
  imageId: v.optional(vImagem),
  vehicleClass: vClass,
  status: vStatus,
  upgradeFromCategoryId: v.optional(v.id("vehicleCategories")),
});

export const save = mutation({
  args: {
    id: v.optional(v.id("vehicleCategories")),
    version: v.optional(v.number()),
    data: vData,
    /* The other side of the pair, as in veiculos.guardar: the category this
       one upgrades to. Absent = leave as is; null = none. */
    upgradeCategoryId: v.optional(v.union(v.id("vehicleCategories"), v.null())),
  },
  handler: async (ctx, { id, version, data, upgradeCategoryId }) => {
    await exigirAdmin(ctx, "veiculos");
    const name = data.name.trim();
    if (!name) throw new ConvexError("Dê um nome à categoria.");
    const all = await ctx.db.query("vehicleCategories").collect();
    const current = id ? all.find((c) => c._id === id) : undefined;
    if (id && !current) throw new ConvexError("Esta categoria já não existe.");
    if (current && version !== versionOf(current)) {
      throw new ConvexError("Alguém gravou esta categoria depois de a abrir. Recarregue para ver a versão atual antes de gravar.");
    }
    if (all.some((c) => c._id !== id && c.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new ConvexError(`Já existe uma categoria «${name}».`);
    }
    const down = data.upgradeFromCategoryId;
    if (id && (down === id || upgradeCategoryId === id)) throw new ConvexError("Uma categoria não pode ser upgrade de si própria.");
    if (down && upgradeCategoryId && down === upgradeCategoryId) throw new ConvexError("A mesma categoria não pode estar acima e abaixo desta.");

    const now = Date.now();
    const doc = { ...data, name, examples: data.examples?.trim() || undefined, actualizadoEm: now };
    let categoryId = id;
    if (id) await ctx.db.patch(id, doc);
    else categoryId = await ctx.db.insert("vehicleCategories", { ...doc, order: Math.max(0, ...all.map((c) => c.order)) + 1 });

    /* One upgrade per category (the checkout offers one): taking a place
       unlinks whoever held it. */
    if (down) {
      for (const c of all) if (c._id !== categoryId && c.upgradeFromCategoryId === down) await ctx.db.patch(c._id, { upgradeFromCategoryId: undefined, actualizadoEm: now });
    }
    if (upgradeCategoryId !== undefined) {
      for (const c of all) if (c.upgradeFromCategoryId === categoryId && c._id !== upgradeCategoryId) await ctx.db.patch(c._id, { upgradeFromCategoryId: undefined, actualizadoEm: now });
      if (upgradeCategoryId) await ctx.db.patch(upgradeCategoryId, { upgradeFromCategoryId: categoryId, actualizadoEm: now });
    }
    return categoryId!;
  },
});

export const remove = mutation({
  args: { id: v.id("vehicleCategories") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "veiculos", "editar", "apagar");
    const cars = await ctx.db.query("vehicles").withIndex("by_category", (q) => q.eq("categoryId", id)).collect();
    if (cars.length > 0) {
      throw new ConvexError(`Esta categoria tem ${cars.length === 1 ? "um carro" : `${cars.length} carros`}. Passe-os para outra categoria antes de a apagar.`);
    }
    for (const c of await ctx.db.query("vehicleCategories").withIndex("by_upgrade_from", (q) => q.eq("upgradeFromCategoryId", id)).collect()) {
      await ctx.db.patch(c._id, { upgradeFromCategoryId: undefined });
    }
    await ctx.db.delete(id);
  },
});

export const reorder = mutation({
  args: { ids: v.array(v.id("vehicleCategories")) },
  handler: async (ctx, { ids }) => {
    await exigirAdmin(ctx, "veiculos");
    for (const [i, id] of ids.entries()) await ctx.db.patch(id, { order: i + 1 });
  },
});

/* ───────────────────────── Migration from the old fleet ─────────────────── */

type Group = { name: string; vehicleClass: Doc<"vehicleCategories">["vehicleClass"]; translations: { locale: string; name: string }[] };

const tr = (pt: string, en: string, es: string, fr: string, de: string, nl: string) =>
  Object.entries({ pt, en, es, fr, de, nl }).map(([locale, name]) => ({ locale, name }));

/* The sizes that become one category. Order matters: "Luxury Mini Bus"
   before "Mini Bus", "Luxury Bus" before "Bus". */
const GROUPS: [RegExp, Group][] = [
  [/lux\w*\s*mini\s*-?\s*bus|mini\s*-?\s*bus\s*(de\s*)?lux/i, { name: "Luxury Minibus", vehicleClass: "large", translations: tr("Minibus de luxo", "Luxury Minibus", "Minibús de lujo", "Minibus de luxe", "Luxus-Minibus", "Luxe minibus") }],
  [/mini\s*-?\s*bus/i, { name: "Minibus", vehicleClass: "large", translations: tr("Minibus", "Minibus", "Minibús", "Minibus", "Minibus", "Minibus") }],
  [/lux\w*\s*(bus|coach)|autocarro\s*(de\s*)?lux/i, { name: "Luxury Coach", vehicleClass: "large", translations: tr("Autocarro de luxo", "Luxury Coach", "Autocar de lujo", "Autocar de luxe", "Luxus-Reisebus", "Luxe touringcar") }],
  [/^(bus|coach|autocarro)\b/i, { name: "Coach", vehicleClass: "large", translations: tr("Autocarro", "Coach", "Autocar", "Autocar", "Reisebus", "Touringcar") }],
];

function groupOf(car: Doc<"vehicles">): Group | null {
  return GROUPS.find(([re]) => re.test(car.name))?.[1] ?? null;
}

/**
 * Puts every car without a category into one. The minibus and coach sizes
 * share four categories; every other car gets a category of its own with its
 * name, translations, examples and photo. Upgrade pairs between cars become
 * pairs between their categories. Can run again: cars that already have a
 * category are left alone.
 *
 * npx convex run vehicleCategories:createFromFleet
 */
export const createFromFleet = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cars = (await ctx.db.query("vehicles").withIndex("by_order").collect()).filter((c) => !c.partnershipId);
    const categories = await ctx.db.query("vehicleCategories").collect();
    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c._id]));
    let order = Math.max(0, ...categories.map((c) => c.order));
    const created: string[] = [];
    const now = Date.now();

    const ensure = async (name: string, make: () => Omit<Doc<"vehicleCategories">, "_id" | "_creationTime" | "order">) => {
      const found = byName.get(name.toLowerCase());
      if (found) return found;
      const id = await ctx.db.insert("vehicleCategories", { ...make(), order: ++order });
      byName.set(name.toLowerCase(), id);
      created.push(name);
      return id;
    };

    let assigned = 0;
    for (const car of cars) {
      if (car.categoryId) continue;
      const g = groupOf(car);
      const id = g
        ? await ensure(g.name, () => ({ name: g.name, translations: g.translations, imageId: car.imageId, vehicleClass: g.vehicleClass, status: "active", actualizadoEm: now }))
        : await ensure(car.name, () => ({
            name: car.name,
            translations: car.translations,
            examples: car.examples,
            imageId: car.imageId,
            vehicleClass: /\bvan\b/i.test(car.name) ? "van" : "standard",
            status: "active",
            actualizadoEm: now,
          }));
      await ctx.db.patch(car._id, { categoryId: id });
      assigned++;
    }

    /* Upgrade pairs: the premium car points at the standard one. */
    const fresh = await ctx.db.query("vehicles").collect();
    const catOf = new Map(fresh.map((c) => [c._id, c.categoryId]));
    let upgrades = 0;
    for (const car of fresh) {
      if (!car.upgradeFromVehicleId) continue;
      const premium = car.categoryId;
      const standard = catOf.get(car.upgradeFromVehicleId);
      if (!premium || !standard || premium === standard) continue;
      const doc = await ctx.db.get(premium);
      const taken = (await ctx.db.query("vehicleCategories").withIndex("by_upgrade_from", (q) => q.eq("upgradeFromCategoryId", standard)).first()) !== null;
      if (doc && !doc.upgradeFromCategoryId && !taken) {
        await ctx.db.patch(premium, { upgradeFromCategoryId: standard });
        upgrades++;
      }
    }
    return { created, assigned, upgrades, loose: fresh.filter((c) => !c.categoryId && !c.partnershipId).map((c) => c.name) };
  },
});

/* The values of the pricing sheet (EasyTransfer_Precificacao_Dinamica.xlsx,
   sheet "Parametros"), by category and seats. Not validated yet: they go to
   development for the calibration, never straight to production. */
const SHEET: { match: RegExp; seats?: number; tariff: Tariff }[] = [
  { match: /^classic/i, tariff: { baseFare: 18, ratePerKm: 0.86, nightMultiplier: 1.221, minimum: 35 } },
  { match: /^business class$/i, tariff: { baseFare: 25, ratePerKm: 1.55, nightMultiplier: 1.097, minimum: 50 } },
  { match: /^first class$/i, tariff: { baseFare: 30, ratePerKm: 2.25, nightMultiplier: 1.111, minimum: 60 } },
  { match: /^van$/i, tariff: { baseFare: 30, ratePerKm: 1.8, nightMultiplier: 1.1, minimum: 60 } },
  { match: /^business class van$/i, tariff: { baseFare: 35, ratePerKm: 2.05, nightMultiplier: 1.171, minimum: 70 } },
  { match: /^first class van$/i, tariff: { baseFare: 38, ratePerKm: 2.4, nightMultiplier: 1.083, minimum: 75 } },
  { match: /^luxury minibus$/i, seats: 15, tariff: { baseFare: 80, ratePerKm: 5, nightMultiplier: 1.1, minimum: 160 } },
  { match: /^luxury minibus$/i, seats: 20, tariff: { baseFare: 110, ratePerKm: 5.3, nightMultiplier: 1.132, minimum: 220 } },
  { match: /^luxury minibus$/i, seats: 22, tariff: { baseFare: 125, ratePerKm: 6, nightMultiplier: 1.117, minimum: 250 } },
  { match: /^minibus$/i, seats: 15, tariff: { baseFare: 50, ratePerKm: 3.5, nightMultiplier: 1.114, minimum: 100 } },
  { match: /^minibus$/i, seats: 20, tariff: { baseFare: 65, ratePerKm: 3.9, nightMultiplier: 1.103, minimum: 130 } },
  { match: /^minibus$/i, seats: 22, tariff: { baseFare: 80, ratePerKm: 4.3, nightMultiplier: 1.116, minimum: 160 } },
  { match: /^luxury coach$/i, seats: 30, tariff: { baseFare: 150, ratePerKm: 11.5, nightMultiplier: 1.13, minimum: 300 } },
  { match: /^luxury coach$/i, seats: 45, tariff: { baseFare: 175, ratePerKm: 13.2, nightMultiplier: 1.129, minimum: 350 } },
  { match: /^luxury coach$/i, seats: 56, tariff: { baseFare: 185, ratePerKm: 16.1, nightMultiplier: 1.068, minimum: 370 } },
  { match: /^coach$/i, seats: 30, tariff: { baseFare: 125, ratePerKm: 8.5, nightMultiplier: 1.176, minimum: 250 } },
  { match: /^coach$/i, seats: 45, tariff: { baseFare: 135, ratePerKm: 10.5, nightMultiplier: 1.143, minimum: 270 } },
  { match: /^coach$/i, seats: 56, tariff: { baseFare: 150, ratePerKm: 12.5, nightMultiplier: 1.08, minimum: 300 } },
  { match: /ceo/i, tariff: { baseFare: 75, ratePerKm: 5, nightMultiplier: 1.3, minimum: 150 } },
];

/**
 * Loads the sheet's values into the cars' tariffs and the pricing levers.
 * Leaves the model as it is: switching to "bands" is a separate, deliberate
 * step in Definições. Refuses to run where the deployment says production.
 *
 * npx convex run vehicleCategories:applySheetValues
 */
export const applySheetValues = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.EASYTRANSFER_ORDER_WEBHOOK_URL) {
      throw new ConvexError("Isto parece produção (tem o webhook da operação). Os valores da folha ainda não estão validados.");
    }
    const categories = new Map((await ctx.db.query("vehicleCategories").collect()).map((c) => [c._id, c]));
    const cars = await ctx.db.query("vehicles").collect();
    const applied: string[] = [];
    const missing: string[] = [];
    for (const car of cars) {
      const cat = car.categoryId ? categories.get(car.categoryId) : undefined;
      const name = cat?.name ?? car.name;
      const rows = SHEET.filter((s) => s.match.test(name));
      const row = rows.find((s) => s.seats === car.passengers) ?? (rows.length === 1 ? rows[0] : undefined);
      if (!row) {
        missing.push(car.name);
        continue;
      }
      await ctx.db.patch(car._id, { tariff: row.tariff });
      applied.push(car.name);
    }
    const settings = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", "global")).first();
    const pricing = { ...PRICING_DEFAULTS, model: settings?.pricing?.model ?? PRICING_DEFAULTS.model };
    if (settings) await ctx.db.patch(settings._id, { pricing });
    else await ctx.db.insert("siteSettings", { key: "global", minAdvanceBookingHours: 2, pricing });
    return { applied, missing, model: pricing.model };
  },
});

/* Which model the checkout uses and the partner factor, for the partnership
   editor: in the banded model the per-partner adjustment no longer counts. */
export const pricingModel = query({
  args: {},
  handler: async (ctx) => {
    if (!(await pode(ctx, "parcerias")) && !(await pode(ctx, "veiculos"))) return null;
    const { config } = await loadPricing(ctx);
    return { model: config.model, partnerFactor: config.partnerFactor };
  },
});
