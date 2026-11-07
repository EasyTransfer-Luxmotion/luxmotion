import { v } from "convex/values";
import { catalogTranslationsValidator } from "./lib/catalogTranslations";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { urlDaImagem, vImagem } from "./lib/imagens";
import { exigirAdmin } from "./lib/admin";

/**
 * Extras universais: definidos uma vez e mostrados em todos os tours ou eventos
 * do seu âmbito, em vez de copiados linha a linha em cada um.
 */

const ambito = v.union(
  v.literal("tours"),
  v.literal("events"),
  v.literal("ultraLuxury"),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const linhas = await ctx.db.query("universalAddons").collect();
    return await Promise.all(
      linhas
        .sort((a, b) => a.order - b.order)
        .map(async (l) => ({
          ...l,
          imageUrl: l.imageId ? await urlDaImagem(ctx, l.imageId) : null,
        })),
    );
  },
});

/**
 * Os que se aplicam a um tour ou evento, com a marca de quais estão desligados.
 * É o que o formulário do admin mostra por cima da lista dos extras próprios.
 */
export const listForOwner = query({
  args: {
    tourId: v.optional(v.id("tours")),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const dono = args.tourId
      ? await ctx.db.get(args.tourId)
      : args.eventId
        ? await ctx.db.get(args.eventId)
        : null;
    if (!dono) return [];

    const alvo = args.eventId
      ? "events"
      : "isUltraLuxury" in dono && dono.isUltraLuxury === true
        ? "ultraLuxury"
        : "tours";

    const desligados = new Set<string>(dono.disabledUniversalAddons ?? []);
    const linhas = await ctx.db.query("universalAddons").collect();

    return await Promise.all(
      linhas
        .filter((l) => l.scopes.includes(alvo as never))
        .sort((a, b) => a.order - b.order)
        .map(async (l) => ({
          _id: l._id,
          title: l.title,
          description: l.description,
          price: l.price,
          pricingType: l.pricingType,
          currency: l.currency,
          status: l.status,
          imageUrl: l.imageId ? await urlDaImagem(ctx, l.imageId) : null,
          disabled: desligados.has(l._id),
        })),
    );
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    translations: v.optional(catalogTranslationsValidator),
    description: v.optional(v.string()),
    imageId: v.optional(vImagem),
    price: v.number(),
    pricingType: v.union(v.literal("per_person"), v.literal("flat")),
    currency: v.string(),
    originalLanguage: v.string(),
    scopes: v.array(ambito),
    status: v.union(v.literal("draft"), v.literal("published")),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const agora = Date.now();
    const quantos = (await ctx.db.query("universalAddons").collect()).length;
    return await ctx.db.insert("universalAddons", {
      ...args,
      order: quantos,
      createdAt: agora,
      updatedAt: agora,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("universalAddons"),
    title: v.optional(v.string()),
    translations: v.optional(catalogTranslationsValidator),
    description: v.optional(v.string()),
    /* `null` limpa a imagem; ausente deixa como está — o mesmo contrato de
       `tourAddons.update`, e pela mesma razão: `undefined` não distingue os
       dois casos. */
    imageId: v.optional(v.union(vImagem, v.null())),
    price: v.optional(v.number()),
    pricingType: v.optional(v.union(v.literal("per_person"), v.literal("flat"))),
    currency: v.optional(v.string()),
    scopes: v.optional(v.array(ambito)),
    order: v.optional(v.number()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const { id, ...dados } = args;
    const existente = await ctx.db.get(id);
    if (!existente) throw new Error("Universal addon not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, valor] of Object.entries(dados)) {
      if (valor === undefined) continue;
      patch[k] = k === "imageId" && valor === null ? undefined : valor;
    }
    await ctx.db.patch(id, patch);
    return id;
  },
});

/**
 * Apaga o extra e limpa-o das excepções de quem o tinha desligado, senão ficavam
 * ids mortos nos tours para sempre. O ficheiro da imagem **não** se apaga: vem da
 * biblioteca e pode estar noutros extras.
 */
export const remove = mutation({
  args: { id: v.id("universalAddons") },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const tours = await ctx.db.query("tours").collect();
    for (const t of tours) {
      if (!t.disabledUniversalAddons?.includes(args.id)) continue;
      await ctx.db.patch(t._id, {
        disabledUniversalAddons: t.disabledUniversalAddons.filter((x) => x !== args.id),
      });
    }
    const eventos = await ctx.db.query("events").collect();
    for (const e of eventos) {
      if (!e.disabledUniversalAddons?.includes(args.id)) continue;
      await ctx.db.patch(e._id, {
        disabledUniversalAddons: e.disabledUniversalAddons.filter((x) => x !== args.id),
      });
    }

    await ctx.db.delete(args.id);
  },
});

/** Liga ou desliga um universal num tour ou num evento. */
export const setDisabled = mutation({
  args: {
    addonId: v.id("universalAddons"),
    tourId: v.optional(v.id("tours")),
    eventId: v.optional(v.id("events")),
    disabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const id = args.tourId ?? args.eventId;
    if (!id) throw new Error("Missing tourId or eventId");

    const dono = await ctx.db.get(id);
    if (!dono) throw new Error("Owner not found");

    const actuais = new Set<Id<"universalAddons">>(dono.disabledUniversalAddons ?? []);
    if (args.disabled) actuais.add(args.addonId);
    else actuais.delete(args.addonId);

    await ctx.db.patch(id, { disabledUniversalAddons: [...actuais] });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/* ---------------------------------------------------------------------------
   Conversão dos extras repetidos.

   Antes dos universais, cada extra era copiado para cada tour: cinco extras em
   56 tours e treze em 23 eventos davam 281 linhas para 18 extras reais. Estas
   duas funções desfazem isso — a primeira mostra o que ia acontecer, a segunda
   faz.
   --------------------------------------------------------------------------- */

type Grupo = {
  titulo: string;
  copias: number;
  precos: number[];
  tiposDePreco: string[];
  scopes: ("tours" | "events" | "ultraLuxury")[];
  /** Donos do mesmo âmbito que NÃO têm este extra e passariam a tê-lo. */
  semEsteExtra: number;
  /** Preços ou tipos de preço diferentes entre cópias: não se converte às cegas. */
  conflito: boolean;
};

async function agruparRepetidos(ctx: {
  db: { query: (t: string) => { collect: () => Promise<Record<string, unknown>[]> } };
}) {
  const extras = (await ctx.db.query("tourAddons").collect()) as Array<{
    _id: Id<"tourAddons">;
    tourId?: Id<"tours">;
    eventId?: Id<"events">;
    title: string;
    price: number;
    pricingType: string;
  }>;
  const tours = (await ctx.db.query("tours").collect()) as Array<{
    _id: Id<"tours">;
    isUltraLuxury?: boolean;
    status: string;
  }>;
  const eventos = (await ctx.db.query("events").collect()) as Array<{
    _id: Id<"events">;
    status: string;
  }>;

  const toursNormais = tours.filter((t) => t.isUltraLuxury !== true);
  const toursUltra = tours.filter((t) => t.isUltraLuxury === true);

  const porTitulo = new Map<string, typeof extras>();
  for (const e of extras) {
    const chave = e.title.trim();
    if (!chave) continue;
    porTitulo.set(chave, [...(porTitulo.get(chave) ?? []), e]);
  }

  return { extras, tours, eventos, toursNormais, toursUltra, porTitulo };
}

export const previewMigration = query({
  args: {},
  handler: async (ctx): Promise<Grupo[]> => {
    await exigirAdmin(ctx);
    const { toursNormais, toursUltra, eventos, porTitulo } = await agruparRepetidos(
      ctx as never,
    );

    const grupos: Grupo[] = [];
    for (const [titulo, copias] of porTitulo) {
      if (copias.length < 2) continue;

      const precos = [...new Set(copias.map((c) => c.price))];
      const tiposDePreco = [...new Set(copias.map((c) => c.pricingType))];

      const idsUltra = new Set(toursUltra.map((t) => t._id));
      const temUltra = copias.some((c) => c.tourId && idsUltra.has(c.tourId));
      const temNormal = copias.some((c) => c.tourId && !idsUltra.has(c.tourId));
      const temEvento = copias.some((c) => c.eventId);

      const scopes: Grupo["scopes"] = [];
      if (temNormal) scopes.push("tours");
      if (temEvento) scopes.push("events");
      if (temUltra) scopes.push("ultraLuxury");

      /* Quantos donos do âmbito ficariam com um extra que hoje não têm — é a
         estes que a migração escreve a excepção, para nada mudar de facto. */
      const comEste = new Set(copias.map((c) => String(c.tourId ?? c.eventId)));
      let semEsteExtra = 0;
      if (temNormal) semEsteExtra += toursNormais.filter((t) => !comEste.has(String(t._id))).length;
      if (temUltra) semEsteExtra += toursUltra.filter((t) => !comEste.has(String(t._id))).length;
      if (temEvento) semEsteExtra += eventos.filter((e) => !comEste.has(String(e._id))).length;

      grupos.push({
        titulo,
        copias: copias.length,
        precos,
        tiposDePreco,
        scopes,
        semEsteExtra,
        conflito: precos.length > 1 || tiposDePreco.length > 1,
      });
    }

    return grupos.sort((a, b) => b.copias - a.copias);
  },
});

export const migrateGroups = mutation({
  args: { titles: v.array(v.string()) },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    const { toursNormais, toursUltra, eventos, porTitulo } = await agruparRepetidos(
      ctx as never,
    );

    let criados = 0;
    let apagados = 0;
    let excepcoes = 0;
    const ignorados: string[] = [];

    for (const titulo of args.titles) {
      const copias = porTitulo.get(titulo.trim());
      if (!copias || copias.length < 2) {
        ignorados.push(titulo);
        continue;
      }

      /* O grupo é recalculado aqui e não vem do cliente: entre ver a
         pré-visualização e carregar no botão, os dados podem ter mudado. */
      const precos = new Set(copias.map((c) => c.price));
      const tipos = new Set(copias.map((c) => c.pricingType));
      if (precos.size > 1 || tipos.size > 1) {
        ignorados.push(titulo);
        continue;
      }

      const primeira = await ctx.db.get(copias[0]!._id);
      if (!primeira) {
        ignorados.push(titulo);
        continue;
      }

      const idsUltra = new Set(toursUltra.map((t) => t._id));
      const temUltra = copias.some((c) => c.tourId && idsUltra.has(c.tourId));
      const temNormal = copias.some((c) => c.tourId && !idsUltra.has(c.tourId));
      const temEvento = copias.some((c) => c.eventId);

      const scopes: ("tours" | "events" | "ultraLuxury")[] = [];
      if (temNormal) scopes.push("tours");
      if (temEvento) scopes.push("events");
      if (temUltra) scopes.push("ultraLuxury");
      if (scopes.length === 0) {
        ignorados.push(titulo);
        continue;
      }

      const agora = Date.now();
      const quantos = (await ctx.db.query("universalAddons").collect()).length;
      const novoId = await ctx.db.insert("universalAddons", {
        title: primeira.title,
        description: primeira.description,
        imageId: primeira.imageId,
        price: primeira.price,
        pricingType: primeira.pricingType,
        currency: primeira.currency,
        originalLanguage: primeira.originalLanguage,
        order: quantos,
        status: "published",
        scopes,
        createdAt: agora,
        updatedAt: agora,
      });
      criados++;

      // Quem não tinha o extra continua sem ele: a excepção guarda o statu quo.
      const comEste = new Set(copias.map((c) => String(c.tourId ?? c.eventId)));
      const donosSemEste: Array<{ _id: Id<"tours"> | Id<"events"> }> = [
        ...(temNormal ? toursNormais.filter((t) => !comEste.has(String(t._id))) : []),
        ...(temUltra ? toursUltra.filter((t) => !comEste.has(String(t._id))) : []),
        ...(temEvento ? eventos.filter((e) => !comEste.has(String(e._id))) : []),
      ];
      for (const dono of donosSemEste) {
        const doc = await ctx.db.get(dono._id as Id<"tours">);
        if (!doc) continue;
        await ctx.db.patch(dono._id as Id<"tours">, {
          disabledUniversalAddons: [...(doc.disabledUniversalAddons ?? []), novoId],
        });
        excepcoes++;
      }

      /* Apaga as cópias e as traduções, mas nunca o ficheiro da imagem: ele
         passou para o universal e continua a ser mostrado. */
      for (const copia of copias) {
        const traducoes = await ctx.db
          .query("tourAddonTranslations")
          .withIndex("by_addon", (q) => q.eq("addonId", copia._id))
          .collect();
        for (const t of traducoes) await ctx.db.delete(t._id);
        await ctx.db.delete(copia._id);
        apagados++;
      }
    }

    return { criados, apagados, excepcoes, ignorados };
  },
});
