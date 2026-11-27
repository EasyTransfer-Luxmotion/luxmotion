import { ConvexError, v } from "convex/values";
import { matchesSearch, pageArgs, pageOf, reorderSlice } from "./lib/list";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { pode, exigirAdmin } from "./lib/admin";
import { catalogTranslationsValidator } from "./lib/catalogTranslations";
import { NIGHT_TAX_MIN_EUR, NIGHT_TAX_PERCENT, priceTrip } from "./lib/pricing";
import { loadPricing } from "./lib/quote";
import { urlDaImagem, vImagem } from "./lib/imagens";

/*
 * Veículos no dashboard (E3 do plano de reconstrução). Substitui, para o ecrã
 * novo, o vehicles.listPaged/create/update/remove — que ficam para o ecrã
 * antigo de staging e produção.
 *
 * O que muda:
 *  - Validação no servidor: lugares e limites inteiros e não negativos,
 *    preços positivos, upgrade só do mesmo dono, nunca de si próprio nem em
 *    círculo, e um só upgrade por veículo standard (o checkout mostra um).
 *  - Conflito: o editor manda a versão que leu; se outra pessoa gravou
 *    entretanto, recusa em vez de pisar.
 *  - Não se apaga um veículo em uso (eventos com essa viatura, ou upgrades
 *    que apontam para ele): o evento perdia o limite de pessoas.
 *  - A simulação de preço corre as regras do servidor (lib/pricing.ts), para
 *    quem edita ver o efeito antes de gravar.
 *
 * O "preço por km de noite" (pricePerKmNight) não entra em nenhum cálculo: a
 * noite cobra-se com a taxa nocturna sobre o preço de dia. O campo fica
 * gravado como está; o editor novo não o mostra como se mudasse alguma coisa.
 */

const vEstado = v.union(v.literal("active"), v.literal("inactive"), v.literal("maintenance"));

function versaoDe(d: Doc<"vehicles">): number {
  return d.actualizadoEm ?? d._creationTime;
}

/*
 * O que está errado no upgrade de um veículo. O schema diz que o premium
 * aponta para o standard, mas em produção (2026-11-14) havia cinco pares
 * também ao contrário — Classic "upgrade" de Business Class, que custa o
 * dobro — porque o checkout aceitava as duas direcções. Ficam à vista para
 * se corrigirem; o editor não deixa criar novos.
 */
function avisosDoUpgrade(x: Doc<"vehicles">, todos: Doc<"vehicles">[]): string[] {
  if (!x.upgradeFromVehicleId) return [];
  const base = todos.find((y) => y._id === x.upgradeFromVehicleId);
  if (!base) return ["O veículo standard deste upgrade já não existe."];
  /* Num círculo, a ligação certa é a do mais caro (é ele o upgrade); o erro
     está só na do mais barato, e é essa que se marca — uma por par. */
  if (x.pricePerKm > base.pricePerKm) return [];
  const circulo = base.upgradeFromVehicleId === x._id;
  const preco = (n: number) => n.toFixed(2).replace(".", ",");
  return [
    `Não é mais caro que ${base.name} (${preco(x.pricePerKm)} €/km contra ${preco(base.pricePerKm)}), por isso não é um upgrade dele.` +
      (circulo ? ` ${base.name} já está registado como upgrade deste, que é o sentido certo.` : ""),
  ];
}

async function nomesDosParceiros(ctx: QueryCtx) {
  const ps = await ctx.db.query("partnerships").collect();
  return new Map(ps.map((p) => [p._id as Id<"partnerships">, p.name]));
}

async function usos(ctx: QueryCtx, id: Id<"vehicles">, todos: Doc<"vehicles">[]) {
  /* Os eventos são poucas dezenas; não há índice por veículo. */
  const eventos = (await ctx.db.query("events").collect()).filter((e) => e.vehicleId === id);
  return {
    eventos: eventos.map((e) => ({ _id: e._id, titulo: e.title })),
    upgrades: todos.filter((x) => x.upgradeFromVehicleId === id).map((x) => ({ _id: x._id, nome: x.name })),
  };
}

/* The Vehicles list: filters, search and page come from the URL and are
   resolved here, in checkout order. `place` is the position in the checkout,
   so it stays right when the list is filtered. */
export const lista = query({
  args: {
    search: v.optional(v.string()),
    // "global" = the main site's fleet; otherwise a partnership id.
    owner: v.optional(v.string()),
    status: v.optional(v.string()),
    ...pageArgs,
  },
  handler: async (ctx, a) => {
    if (!(await pode(ctx, "veiculos"))) return null;
    const todos = await ctx.db.query("vehicles").withIndex("by_order").collect();
    const parceiros = await nomesDosParceiros(ctx);
    const ownerName = (x: (typeof todos)[number]) => (x.partnershipId ? (parceiros.get(x.partnershipId) ?? "Parceiro") : null);
    const upgradeName = (x: (typeof todos)[number]) => (x.upgradeFromVehicleId ? (todos.find((y) => y._id === x.upgradeFromVehicleId)?.name ?? null) : null);
    const place = new Map(todos.map((x, i) => [x._id, i + 1]));
    const matching = todos
      .filter((x) => !a.status || x.status === a.status)
      .filter((x) => !a.owner || (a.owner === "global" ? !x.partnershipId : x.partnershipId === a.owner))
      .filter((x) => matchesSearch(a.search, [x.name, x.examples, ownerName(x) ?? "Site principal", upgradeName(x)]));
    const pg = pageOf(matching, a);
    const eventos = await ctx.db.query("events").collect();
    const rows = await Promise.all(
      pg.rows.map(async (x) => ({
        _id: x._id,
        place: place.get(x._id) ?? 0,
        nome: x.name,
        exemplos: x.examples ?? null,
        imagem: x.imageId ? await urlDaImagem(ctx, x.imageId) : null,
        estado: x.status,
        ordem: x.order,
        passageiros: x.passengers,
        malas: x.luggage,
        precoKm: x.pricePerKm,
        minimo: x.minimumPrice,
        wifi: x.hasWifi,
        electrico: x.isElectric,
        dono: ownerName(x),
        donoId: x.partnershipId ?? null,
        upgradeDe: upgradeName(x),
        emEventos: eventos.filter((e) => e.vehicleId === x._id).length,
        avisos: avisosDoUpgrade(x, todos),
        traducoes: (x.translations ?? []).filter((t) => t.name?.trim()).map((t) => t.locale),
      })),
    );
    const owners = new Map<string, string>();
    for (const x of todos) if (x.partnershipId) owners.set(x.partnershipId, ownerName(x)!);
    return {
      ...pg,
      rows,
      unfilteredTotal: todos.length,
      owners: [...owners].map(([id, name]) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name, "pt")),
      withWarnings: todos.filter((x) => avisosDoUpgrade(x, todos).length > 0).length,
    };
  },
});

/* The categories a car can belong to, for the editor's picker. */
async function categoriasParaEditor(ctx: QueryCtx) {
  const all = await ctx.db.query("vehicleCategories").withIndex("by_order").collect();
  return all.map((c) => ({ _id: c._id, nome: c.name, classe: c.vehicleClass, estado: c.status }));
}

export const detalhe = query({
  args: { id: v.id("vehicles") },
  handler: async (ctx, { id }) => {
    if (!(await pode(ctx, "veiculos"))) return null;
    const x = await ctx.db.get(id);
    if (!x) return { encontrado: false as const };
    const todos = await ctx.db.query("vehicles").withIndex("by_order").collect();
    return {
      encontrado: true as const,
      categorias: await categoriasParaEditor(ctx),
      veiculo: { ...x, imagem: x.imageId ? await urlDaImagem(ctx, x.imageId) : null, versao: versaoDe(x) },
      usos: await usos(ctx, id, todos),
      avisos: avisosDoUpgrade(x, todos),
      outros: todos
        .filter((y) => y._id !== id)
        .map((y) => ({
          _id: y._id,
          nome: y.name,
          donoId: y.partnershipId ?? null,
          passageiros: y.passengers,
          precoKm: y.pricePerKm,
          estado: y.status,
          upgradeDe: y.upgradeFromVehicleId ?? null,
        })),
    };
  },
});

/* Para o editor de um veículo novo: os outros veículos (upgrade) e a próxima
   posição na ordem. */
export const paraNovo = query({
  args: {},
  handler: async (ctx) => {
    if (!(await pode(ctx, "veiculos"))) return null;
    const todos = await ctx.db.query("vehicles").withIndex("by_order").collect();
    return {
      categorias: await categoriasParaEditor(ctx),
      ordem: todos.length ? Math.max(...todos.map((y) => y.order)) + 1 : 0,
      outros: todos.map((y) => ({
        _id: y._id,
        nome: y.name,
        donoId: y.partnershipId ?? null,
        passageiros: y.passengers,
        precoKm: y.pricePerKm,
        estado: y.status,
        upgradeDe: y.upgradeFromVehicleId ?? null,
      })),
    };
  },
});

export const parceiros = query({
  args: {},
  handler: async (ctx) => {
    if (!(await pode(ctx, "veiculos"))) return null;
    const ps = await ctx.db.query("partnerships").collect();
    return ps.map((p) => ({ _id: p._id, nome: p.name })).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  },
});

/*
 * Em que parceiros aparece este carro (o passo "Parceiros" do editor). É a
 * mesma informação do separador "Frota" da parceria, vista do lado do
 * carro: cada parceria guarda os carros globais que esconde
 * (partnerships.veiculosEscondidos, ver lib/frota.ts). Um carro de um
 * parceiro só aparece nesse parceiro.
 */
export const ondeAparece = query({
  args: { id: v.id("vehicles") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "veiculos", "ver");
    const carro = await ctx.db.get(id);
    if (!carro) return null;
    const ps = await ctx.db.query("partnerships").collect();
    return {
      donoId: (carro.partnershipId ?? null) as string | null,
      parcerias: ps
        .map((p) => ({
          id: p._id as string,
          nome: p.name,
          slug: p.slug,
          publicada: p.status !== "inactive",
          mostra: carro.partnershipId ? carro.partnershipId === p._id : !(p.veiculosEscondidos ?? []).includes(id),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
    };
  },
});

/* Mostrar ou esconder um carro global num parceiro, ou em todos de uma vez
   (sem `parceriaId`). Grava logo, como os extras: mexe nas parcerias, não no
   carro. Muda a versão das parcerias tocadas — um editor de parceria aberto
   vê que mudou em vez de gravar por cima. */
export const mostrarEmParceiro = mutation({
  args: { veiculoId: v.id("vehicles"), parceriaId: v.optional(v.id("partnerships")), mostrar: v.boolean() },
  handler: async (ctx, { veiculoId, parceriaId, mostrar }) => {
    await exigirAdmin(ctx, "veiculos");
    const carro = await ctx.db.get(veiculoId);
    if (!carro) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este veículo já não existe." });
    if (carro.partnershipId) {
      throw new ConvexError({ tipo: "invalido", mensagem: "Este carro está associado a uma parceria: só aparece no checkout dela. Para o pôr no site e nas parcerias, associe-o ao site principal." });
    }
    const alvo = parceriaId ? [await ctx.db.get(parceriaId)] : await ctx.db.query("partnerships").collect();
    const agora = Date.now();
    for (const p of alvo) {
      if (!p) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta parceria já não existe." });
      const antes = p.veiculosEscondidos ?? [];
      const depois = mostrar ? antes.filter((x) => x !== veiculoId) : antes.includes(veiculoId) ? antes : [...antes, veiculoId];
      if (depois.length === antes.length) continue;
      await ctx.db.patch(p._id, { veiculosEscondidos: depois, updatedAt: Math.max(agora, (p.updatedAt ?? p._creationTime) + 1) });
    }
  },
});

/* Distâncias típicas: aeroporto → centro, → Cascais, → Sintra, Lisboa →
   Évora, Lisboa → Porto. */
const vTariff = v.object({ baseFare: v.number(), ratePerKm: v.number(), nightMultiplier: v.number(), minimum: v.number() });

const DISTANCIAS = [15, 30, 50, 130, 315];

export const simular = query({
  args: {
    precoKm: v.number(),
    minimo: v.number(),
    /* The banded tariff being edited, and the class of the car's category. */
    tariff: v.optional(vTariff),
    vehicleClass: v.optional(v.union(v.literal("standard"), v.literal("van"), v.literal("large"))),
  },
  handler: async (ctx, a) => {
    if (!(await pode(ctx, "veiculos"))) return null;
    if (!(a.precoKm > 0) || !(a.minimo >= 0)) return null;
    const { config, airportSurchargePercent: aeroporto } = await loadPricing(ctx);
    const vehicle = { pricePerKm: a.precoKm, minimumPrice: a.minimo, tariff: a.tariff };
    const at = (model: "linear" | "bands", km: number, extra: { departureDate?: string; isAirportPickup?: boolean }) =>
      priceTrip({
        vehicle,
        vehicleClass: a.vehicleClass ?? "standard",
        config: { ...config, model },
        partner: null,
        distance: km,
        departureDate: extra.departureDate ?? "2030-01-01 12:00",
        isAirportPickup: extra.isAirportPickup,
        airportSurchargePercent: aeroporto,
      }).price;
    const NOITE = "2030-01-01 22:00";
    return {
      aeroporto,
      noitePct: NIGHT_TAX_PERCENT,
      noiteMin: NIGHT_TAX_MIN_EUR,
      modelo: config.model,
      linhas: DISTANCIAS.map((km) => ({
        km,
        dia: at("linear", km, {}),
        noite: at("linear", km, { departureDate: NOITE }),
        aeroporto: at("linear", km, { isAirportPickup: true }),
        minimoAplicado: a.precoKm * km < a.minimo,
        bandas: a.tariff
          ? { dia: at("bands", km, {}), noite: at("bands", km, { departureDate: NOITE }), aeroporto: at("bands", km, { isAirportPickup: true }) }
          : null,
      })),
    };
  },
});

const vDados = v.object({
  name: v.string(),
  examples: v.optional(v.string()),
  translations: v.optional(catalogTranslationsValidator),
  imageId: v.optional(vImagem),
  partnershipId: v.optional(v.id("partnerships")),
  passengers: v.number(),
  luggage: v.number(),
  maxBackpacks: v.number(),
  maxHandLuggage: v.number(),
  maxCheckedBaggage: v.number(),
  maxChildSeats: v.number(),
  maxBabySeats: v.number(),
  maxBoosterSeats: v.number(),
  pricePerKm: v.number(),
  minimumPrice: v.number(),
  hasWifi: v.boolean(),
  isElectric: v.boolean(),
  status: vEstado,
  upgradeFromVehicleId: v.optional(v.id("vehicles")),
  /* Absent = leave as is (dashboards from before the categories would
     otherwise wipe them on save); null = clear. */
  tariff: v.optional(v.union(vTariff, v.null())),
  categoryId: v.optional(v.union(v.id("vehicleCategories"), v.null())),
});

type Erros = Partial<Record<string, string>>;

function validar(d: typeof vDados.type): Erros {
  const e: Erros = {};
  if (!d.name.trim()) e.name = "Dê um nome à classe.";
  const inteiro = (campo: keyof typeof d, min: number, texto: string) => {
    const x = d[campo] as number;
    if (!Number.isInteger(x) || x < min || x > 100) e[campo] = texto;
  };
  inteiro("passengers", 1, "Entre 1 e 100 passageiros.");
  for (const campo of ["luggage", "maxBackpacks", "maxHandLuggage", "maxCheckedBaggage", "maxChildSeats", "maxBabySeats", "maxBoosterSeats"] as const) {
    inteiro(campo, 0, "Um número inteiro, 0 ou mais.");
  }
  if (!Number.isFinite(d.pricePerKm) || d.pricePerKm <= 0 || d.pricePerKm > 100) e.pricePerKm = "Um preço por km acima de 0.";
  if (!Number.isFinite(d.minimumPrice) || d.minimumPrice < 0 || d.minimumPrice > 10_000) e.minimumPrice = "Um mínimo de 0 € ou mais.";
  const t = d.tariff;
  if (t) {
    const ok = (x: number, min: number, max: number) => Number.isFinite(x) && x >= min && x <= max;
    if (!ok(t.baseFare, 0, 10_000)) e.baseFare = "Uma base de 0 € ou mais.";
    if (!ok(t.ratePerKm, 0.01, 100)) e.ratePerKm = "Uma taxa por km acima de 0.";
    if (!ok(t.nightMultiplier, 1, 3)) e.nightMultiplier = "Entre ×1 (sem taxa) e ×3.";
    if (!ok(t.minimum, 0, 10_000)) e.minimum = "Um mínimo de 0 € ou mais.";
  }
  return e;
}

export const guardar = mutation({
  args: {
    id: v.optional(v.id("vehicles")),
    /* A versão lida pelo editor (versao do detalhe). Obrigatória ao editar. */
    versao: v.optional(v.number()),
    dados: vDados,
    /* The other side of the pair: the car this one upgrades to. The link is
       still one field (the premium points at the standard), so choosing it
       here writes it on that car. Absent = leave as is (older dashboards);
       null = this car has no upgrade. */
    upgradeVehicleId: v.optional(v.union(v.id("vehicles"), v.null())),
  },
  handler: async (ctx, { id, versao, dados, upgradeVehicleId }) => {
    await exigirAdmin(ctx, "veiculos");
    const d = { ...dados, name: dados.name.trim(), examples: dados.examples?.trim() || undefined };

    const erros = validar(d);
    const todos = await ctx.db.query("vehicles").collect();
    const actual = id ? todos.find((x) => x._id === id) : undefined;
    if (id && !actual) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este veículo já não existe." });
    if (actual && versao !== versaoDe(actual)) {
      throw new ConvexError({
        tipo: "conflito",
        mensagem: "Alguém gravou este veículo depois de o abrir. Recarregue para ver a versão actual antes de gravar.",
      });
    }

    /* A car has at most one downgrade (its own field) and one upgrade (the
       car pointing at it): the checkout offers a single upgrade. Choosing
       either side takes the place over — whoever held it is unlinked in the
       same write, and the editor says so before saving. */
    const mesmoSitio = (x: Doc<"vehicles">) => (x.partnershipId ?? null) === (d.partnershipId ?? null);
    const precoKm = (n: number) => n.toFixed(2).replace(".", ",");
    const downgradeMudou = d.upgradeFromVehicleId !== actual?.upgradeFromVehicleId;
    if (d.upgradeFromVehicleId) {
      const base = todos.find((x) => x._id === d.upgradeFromVehicleId);
      if (!base) erros.upgradeFromVehicleId = "O veículo escolhido já não existe.";
      else if (id && base._id === id) erros.upgradeFromVehicleId = "Um veículo não pode ser downgrade de si próprio.";
      else if (!mesmoSitio(base)) erros.upgradeFromVehicleId = "Só um veículo associado ao mesmo sítio (site principal ou a mesma parceria).";
      else if (upgradeVehicleId === base._id || (upgradeVehicleId === undefined && id && base.upgradeFromVehicleId === id)) {
        erros.upgradeFromVehicleId = `${base.name} não pode ser upgrade e downgrade deste ao mesmo tempo.`;
      }
      /* Only a link being made now: the five reversed pairs in production
         stay visible as warnings (avisosDoUpgrade) without blocking other edits. */
      else if (downgradeMudou && base.pricePerKm > d.pricePerKm) {
        erros.upgradeFromVehicleId = `${base.name} é mais caro (${precoKm(base.pricePerKm)} €/km contra ${precoKm(d.pricePerKm)}): é um upgrade, não um downgrade.`;
      }
    }
    const upgradeActual = id ? todos.filter((x) => x.upgradeFromVehicleId === id) : [];
    if (upgradeVehicleId) {
      const cima = todos.find((x) => x._id === upgradeVehicleId);
      if (!cima) erros.upgradeVehicleId = "O veículo escolhido já não existe.";
      else if (id && cima._id === id) erros.upgradeVehicleId = "Um veículo não pode ser upgrade de si próprio.";
      else if (!mesmoSitio(cima)) erros.upgradeVehicleId = "Só um veículo associado ao mesmo sítio (site principal ou a mesma parceria).";
      else if (!upgradeActual.some((x) => x._id === cima._id) && cima.pricePerKm < d.pricePerKm) {
        erros.upgradeVehicleId = `${cima.name} é mais barato (${precoKm(cima.pricePerKm)} €/km contra ${precoKm(d.pricePerKm)}): é um downgrade, não um upgrade.`;
      }
    }
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const agora = Date.now();
    /* The other cars of the pair. Done before this one is written so a
       failed check above never leaves half a pair. */
    const ligarPar = async (eu: Id<"vehicles">) => {
      if (downgradeMudou && d.upgradeFromVehicleId) {
        for (const x of todos) {
          if (x._id !== eu && x.upgradeFromVehicleId === d.upgradeFromVehicleId) await ctx.db.patch(x._id, { upgradeFromVehicleId: undefined, actualizadoEm: agora });
        }
      }
      if (upgradeVehicleId === undefined) return;
      for (const x of upgradeActual) {
        if (x._id !== upgradeVehicleId) await ctx.db.patch(x._id, { upgradeFromVehicleId: undefined, actualizadoEm: agora });
      }
      if (upgradeVehicleId && !upgradeActual.some((x) => x._id === upgradeVehicleId)) {
        await ctx.db.patch(upgradeVehicleId, { upgradeFromVehicleId: eu, actualizadoEm: agora });
      }
    };
    if (actual) {
      await ligarPar(actual._id);
      // A imagem antiga não se apaga: o ficheiro pode ser partilhado com outros registos (ver lib/imagens.ts).
      /* Os opcionais vão sempre com a chave: um campo que o browser manda
         vazio chega cá sem chave nenhuma, e um patch sem a chave não mexe no
         campo. Era assim que "Nenhum" no upgrade (e tirar o dono ou a foto)
         gravava sem efeito — no vehicles.update antigo também. Com a chave
         e o valor undefined, o patch apaga-o. */
      const { tariff, categoryId, ...resto } = d;
      await ctx.db.patch(actual._id, {
        ...resto,
        ...(tariff !== undefined ? { tariff: tariff ?? undefined } : {}),
        ...(categoryId !== undefined ? { categoryId: categoryId ?? undefined } : {}),
        examples: d.examples,
        translations: d.translations,
        imageId: d.imageId,
        partnershipId: d.partnershipId,
        upgradeFromVehicleId: d.upgradeFromVehicleId,
        actualizadoEm: agora,
      });
      return { id: actual._id, versao: agora };
    }
    const ordem = todos.length ? Math.max(...todos.map((x) => x.order)) + 1 : 0;
    /* pricePerKmNight é obrigatório no schema e não entra em cálculo nenhum:
       fica igual ao de dia, para não parecer uma tarifa diferente. */
    const novo = await ctx.db.insert("vehicles", {
      ...d,
      tariff: d.tariff ?? undefined,
      categoryId: d.categoryId ?? undefined,
      pricePerKmNight: d.pricePerKm,
      order: ordem,
      actualizadoEm: agora,
    });
    await ligarPar(novo);
    return { id: novo, versao: agora };
  },
});

export const mudarEstado = mutation({
  args: { id: v.id("vehicles"), estado: vEstado },
  handler: async (ctx, { id, estado }) => {
    await exigirAdmin(ctx, "veiculos");
    const x = await ctx.db.get(id);
    if (!x) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este veículo já não existe." });
    await ctx.db.patch(id, { status: estado, actualizadoEm: Date.now() });
  },
});

/* Reorders one page of the checkout order (see reorderSlice). */
export const reorderPage = mutation({
  args: { start: v.number(), ids: v.array(v.id("vehicles")) },
  handler: async (ctx, { start, ids }) => {
    await exigirAdmin(ctx, "veiculos");
    const all = await ctx.db.query("vehicles").withIndex("by_order").collect();
    const order = reorderSlice(all.map((x) => x._id), start, ids);
    if (!order) {
      throw new ConvexError({ tipo: "conflito", mensagem: "A lista mudou entretanto. Recarregue e volte a ordenar." });
    }
    const now = Date.now();
    await Promise.all(order.map((id, i) => ctx.db.patch(id, { order: i, actualizadoEm: now })));
  },
});

export const reordenar = mutation({
  args: { ids: v.array(v.id("vehicles")) },
  handler: async (ctx, { ids }) => {
    await exigirAdmin(ctx, "veiculos");
    const todos = await ctx.db.query("vehicles").collect();
    /* A lista tem de ser a completa: uma lista antiga (outro separador)
       baralhava os que faltassem. */
    if (ids.length !== todos.length || new Set(ids).size !== ids.length || !todos.every((x) => ids.includes(x._id))) {
      throw new ConvexError({ tipo: "conflito", mensagem: "A lista mudou entretanto. Recarregue e volte a ordenar." });
    }
    const agora = Date.now();
    await Promise.all(ids.map((id, ordem) => ctx.db.patch(id, { order: ordem, actualizadoEm: agora })));
  },
});

export const remover = mutation({
  args: { id: v.id("vehicles") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "veiculos", "editar", "apagar");
    const x = await ctx.db.get(id);
    if (!x) return;
    const u = await usos(ctx, id, await ctx.db.query("vehicles").collect());
    if (u.eventos.length || u.upgrades.length) {
      const onde = [
        ...u.eventos.map((e) => `pelo evento "${e.titulo}"`),
        ...u.upgrades.map((y) => `pelo upgrade ${y.nome}`),
      ].join(", ");
      throw new ConvexError({
        tipo: "emUso",
        mensagem: `Não se pode apagar: é usado ${onde}. Desactive-o em vez disso — deixa de aparecer no checkout.`,
      });
    }
    // O ficheiro da imagem não se apaga: pode ser partilhado com outros registos (ver lib/imagens.ts).
    await ctx.db.delete(id);
  },
});
