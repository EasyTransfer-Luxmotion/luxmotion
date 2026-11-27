import { ConvexError, v } from "convex/values";
import { matchesSearch, pageArgs, pageOf, reorderSlice } from "./lib/list";
import { query, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { pode, exigirAdmin } from "./lib/admin";
import { catalogTranslationsValidator } from "./lib/catalogTranslations";
import { PRICING_DEFAULTS, priceTrip, tariffLeg, tariffOf } from "./lib/pricing";
import { reachOf } from "./lib/frota";
import { classOf, loadPricing } from "./lib/quote";
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
 *  - O preço é só a tarifa (base, €/km por bandas, noite, mínimo); o preço
 *    por km e o mínimo do modelo antigo saíram a 2026-11-27.
 *  - Onde aparece: site principal sim/não e parceiros todos/alguns/nenhum
 *    (lib/frota.ts), em vez de um dono só («Associado a»).
 */

const vEstado = v.union(v.literal("active"), v.literal("inactive"), v.literal("maintenance"));

function versaoDe(d: Doc<"vehicles">): number {
  return d.actualizadoEm ?? d._creationTime;
}

/* The day price of a 30 km trip with the default bands: what "more
   expensive" means when pairing upgrades (it was the old €/km). */
const KM_REFERENCIA = 30;
function precoRef(x: Pick<Doc<"vehicles">, "tariff" | "pricePerKm" | "minimumPrice">): number {
  const t = tariffOf(x);
  return t ? Math.round(tariffLeg(t, KM_REFERENCIA, PRICING_DEFAULTS.bands) * 100) / 100 : 0;
}
const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

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
  if (precoRef(x) > precoRef(base)) return [];
  const circulo = base.upgradeFromVehicleId === x._id;
  return [
    `Não é mais caro que ${base.name} (${euros(precoRef(x))} contra ${euros(precoRef(base))} a ${KM_REFERENCIA} km), por isso não é um upgrade dele.` +
      (circulo ? ` ${base.name} já está registado como upgrade deste, que é o sentido certo.` : ""),
  ];
}

async function nomesDosParceiros(ctx: QueryCtx) {
  const ps = await ctx.db.query("partnerships").collect();
  return new Map(ps.map((p) => [p._id as Id<"partnerships">, p.name]));
}

/* Which partners hide each car in their Frota (the "all partners" cars). */
async function escondidosPorCarro(ctx: QueryCtx) {
  const m = new Map<string, string[]>();
  for (const p of await ctx.db.query("partnerships").collect()) {
    for (const id of p.veiculosEscondidos ?? []) m.set(id, [...(m.get(id) ?? []), p._id]);
  }
  return m;
}

/* "Site e todos os parceiros", "Só Hotel X", … for the list. */
function ondeEmPalavras(r: ReturnType<typeof reachOf>, nomes: Map<Id<"partnerships">, string>): string {
  const alguns = r.partnerIds.map((id) => nomes.get(id) ?? "Parceiro");
  const parceiros =
    r.mode === "all" ? "todos os parceiros" : r.mode === "none" || alguns.length === 0 ? null : alguns.length <= 2 ? alguns.join(" e ") : `${alguns.length} parceiros`;
  if (r.site) return parceiros ? `Site e ${parceiros}` : "Só no site";
  return parceiros ? `Só ${parceiros}` : "Em lado nenhum";
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
    // "global" = offered on the main site; otherwise a partnership id (offered there).
    owner: v.optional(v.string()),
    status: v.optional(v.string()),
    ...pageArgs,
  },
  handler: async (ctx, a) => {
    if (!(await pode(ctx, "veiculos"))) return null;
    const todos = await ctx.db.query("vehicles").withIndex("by_order").collect();
    const parceiros = await nomesDosParceiros(ctx);
    const escondidos = await escondidosPorCarro(ctx);
    const categorias = new Map((await ctx.db.query("vehicleCategories").collect()).map((c) => [c._id, c]));
    const { config } = await loadPricing(ctx);
    const nomeDaClasse = (k: string) => config.classes.find((c) => c.key === k)?.name ?? k;
    const onde = (x: (typeof todos)[number]) => ondeEmPalavras(reachOf(x), parceiros);
    const upgradeName = (x: (typeof todos)[number]) => (x.upgradeFromVehicleId ? (todos.find((y) => y._id === x.upgradeFromVehicleId)?.name ?? null) : null);
    const place = new Map(todos.map((x, i) => [x._id, i + 1]));
    const emParceiro = (x: (typeof todos)[number], id: string) => {
      const r = reachOf(x);
      return r.mode === "all" ? !(escondidos.get(x._id) ?? []).includes(id) : r.mode === "some" && r.partnerIds.includes(id as Id<"partnerships">);
    };
    const matching = todos
      .filter((x) => !a.status || x.status === a.status)
      .filter((x) => !a.owner || (a.owner === "global" ? reachOf(x).site : emParceiro(x, a.owner)))
      .filter((x) => matchesSearch(a.search, [x.name, x.examples, onde(x), upgradeName(x)]));
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
        tarifa: tariffOf(x),
        classe: nomeDaClasse(classOf(x, x.categoryId ? categorias.get(x.categoryId) : null)),
        wifi: x.hasWifi,
        electrico: x.isElectric,
        onde: onde(x),
        upgradeDe: upgradeName(x),
        emEventos: eventos.filter((e) => e.vehicleId === x._id).length,
        avisos: avisosDoUpgrade(x, todos),
        traducoes: (x.translations ?? []).filter((t) => t.name?.trim()).map((t) => t.locale),
      })),
    );
    return {
      ...pg,
      rows,
      unfilteredTotal: todos.length,
      owners: [...parceiros].map(([id, name]) => ({ id: id as string, name })).sort((x, y) => x.name.localeCompare(y.name, "pt")),
      withWarnings: todos.filter((x) => avisosDoUpgrade(x, todos).length > 0).length,
    };
  },
});

/* The lead-time multipliers of each class (Configurações → Preços →
   Antecedência), shown under the car's class so the choice is not blind. */
async function antecedencia(ctx: QueryCtx) {
  const { config } = await loadPricing(ctx);
  return {
    classes: config.classes,
    surge: config.surge,
    freeAfterHours: config.freeAfterHours,
    lastMinuteHours: config.lastMinuteHours,
    earlyMorningFrom: config.earlyMorningFrom,
    earlyMorningTo: config.earlyMorningTo,
  };
}

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
      antecedencia: await antecedencia(ctx),
      veiculo: {
        ...x,
        /* The price and the reach in the new shape, whatever the car had. */
        tariff: tariffOf(x) ?? undefined,
        vehicleClass: classOf(x, x.categoryId ? await ctx.db.get(x.categoryId) : null),
        alcance: reachOf(x),
        imagem: x.imageId ? await urlDaImagem(ctx, x.imageId) : null,
        versao: versaoDe(x),
      },
      /* Partners that hide this car in their Frota (only with "all"). */
      escondidoEm: (await ctx.db.query("partnerships").collect()).filter((p) => (p.veiculosEscondidos ?? []).includes(id)).map((p) => p.name),
      usos: await usos(ctx, id, todos),
      avisos: avisosDoUpgrade(x, todos),
      outros: todos
        .filter((y) => y._id !== id)
        .map((y) => ({
          _id: y._id,
          nome: y.name,
          passageiros: y.passengers,
          precoRef: precoRef(y),
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
      antecedencia: await antecedencia(ctx),
      ordem: todos.length ? Math.max(...todos.map((y) => y.order)) + 1 : 0,
      outros: todos.map((y) => ({
        _id: y._id,
        nome: y.name,
        passageiros: y.passengers,
        precoRef: precoRef(y),
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

/* Distâncias típicas: aeroporto → centro, → Cascais, → Sintra, Lisboa →
   Évora, Lisboa → Porto. */
const vTariff = v.object({ baseFare: v.number(), ratePerKm: v.number(), nightMultiplier: v.number(), minimum: v.number() });

const DISTANCIAS = [15, 30, 50, 130, 315];

export const simular = query({
  args: {
    /* The tariff being edited, and the class of the car's category. */
    tariff: vTariff,
    vehicleClass: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (!(await pode(ctx, "veiculos"))) return null;
    if (!(a.tariff.ratePerKm > 0) || !(a.tariff.minimum >= 0)) return null;
    const { config, airportSurchargePercent: aeroporto } = await loadPricing(ctx);
    const at = (km: number, extra: { departureDate?: string; isAirportPickup?: boolean; partner?: boolean }) =>
      priceTrip({
        vehicle: { tariff: a.tariff },
        vehicleClass: a.vehicleClass ?? "standard",
        config,
        partner: extra.partner ? {} : null,
        distance: km,
        departureDate: extra.departureDate ?? "2030-01-01 12:00",
        isAirportPickup: extra.isAirportPickup,
        airportSurchargePercent: aeroporto,
      }).price;
    const NOITE = "2030-01-01 22:00";
    return {
      aeroporto,
      parceiroPct: Math.round((config.partnerFactor - 1) * 1000) / 10,
      linhas: DISTANCIAS.map((km) => ({
        km,
        dia: at(km, {}),
        noite: at(km, { departureDate: NOITE }),
        aeroporto: at(km, { isAirportPickup: true }),
        parceiro: at(km, { partner: true }),
        minimoAplicado: tariffLeg(a.tariff, km, config.bands) <= a.tariff.minimum,
      })),
    };
  },
});

const vDados = v.object({
  name: v.string(),
  examples: v.optional(v.string()),
  translations: v.optional(catalogTranslationsValidator),
  imageId: v.optional(vImagem),
  showOnSite: v.boolean(),
  partnerMode: v.union(v.literal("all"), v.literal("some"), v.literal("none")),
  /* Only with "some": the partners that offer it. */
  partnerIds: v.array(v.id("partnerships")),
  passengers: v.number(),
  luggage: v.number(),
  maxBackpacks: v.number(),
  maxHandLuggage: v.number(),
  maxCheckedBaggage: v.number(),
  maxChildSeats: v.number(),
  maxBabySeats: v.number(),
  maxBoosterSeats: v.number(),
  hasWifi: v.boolean(),
  isElectric: v.boolean(),
  status: vEstado,
  upgradeFromVehicleId: v.optional(v.id("vehicles")),
  tariff: vTariff,
  /* The lead-time surge class, part of the price (as in the pricing sheet). */
  vehicleClass: v.string(),
  /* null = no category (the car shows on its own). */
  categoryId: v.union(v.id("vehicleCategories"), v.null()),
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
  const t = d.tariff;
  const ok = (x: number, min: number, max: number) => Number.isFinite(x) && x >= min && x <= max;
  if (!ok(t.baseFare, 0, 10_000)) e.baseFare = "Uma base de 0 € ou mais.";
  if (!ok(t.ratePerKm, 0.01, 100)) e.ratePerKm = "Uma taxa por km acima de 0.";
  if (!ok(t.nightMultiplier, 1, 3)) e.nightMultiplier = "Entre ×1 (sem taxa) e ×3.";
  if (!ok(t.minimum, 0, 10_000)) e.minimum = "Um mínimo de 0 € ou mais.";
  if (d.partnerMode === "some" && d.partnerIds.length === 0) e.partnerIds = "Escolha pelo menos um parceiro, ou «Nenhum».";
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
    const { config } = await loadPricing(ctx);
    if (!config.classes.some((c) => c.key === d.vehicleClass)) erros.vehicleClass = "Esta classe já não existe: escolha outra.";
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
    const meu = precoRef(d);
    const downgradeMudou = d.upgradeFromVehicleId !== actual?.upgradeFromVehicleId;
    if (d.upgradeFromVehicleId) {
      const base = todos.find((x) => x._id === d.upgradeFromVehicleId);
      if (!base) erros.upgradeFromVehicleId = "O veículo escolhido já não existe.";
      else if (id && base._id === id) erros.upgradeFromVehicleId = "Um veículo não pode ser downgrade de si próprio.";
      else if (upgradeVehicleId === base._id || (upgradeVehicleId === undefined && id && base.upgradeFromVehicleId === id)) {
        erros.upgradeFromVehicleId = `${base.name} não pode ser upgrade e downgrade deste ao mesmo tempo.`;
      }
      /* Only a link being made now: the five reversed pairs in production
         stay visible as warnings (avisosDoUpgrade) without blocking other edits. */
      else if (downgradeMudou && precoRef(base) > meu) {
        erros.upgradeFromVehicleId = `${base.name} é mais caro (${euros(precoRef(base))} contra ${euros(meu)} a ${KM_REFERENCIA} km): é um upgrade, não um downgrade.`;
      }
    }
    const upgradeActual = id ? todos.filter((x) => x.upgradeFromVehicleId === id) : [];
    if (upgradeVehicleId) {
      const cima = todos.find((x) => x._id === upgradeVehicleId);
      if (!cima) erros.upgradeVehicleId = "O veículo escolhido já não existe.";
      else if (id && cima._id === id) erros.upgradeVehicleId = "Um veículo não pode ser upgrade de si próprio.";
      else if (!upgradeActual.some((x) => x._id === cima._id) && precoRef(cima) < meu) {
        erros.upgradeVehicleId = `${cima.name} é mais barato (${euros(precoRef(cima))} contra ${euros(meu)} a ${KM_REFERENCIA} km): é um downgrade, não um upgrade.`;
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
      await ctx.db.patch(actual._id, {
        ...d,
        categoryId: d.categoryId ?? undefined,
        partnerIds: d.partnerMode === "some" ? d.partnerIds : undefined,
        examples: d.examples,
        translations: d.translations,
        imageId: d.imageId,
        upgradeFromVehicleId: d.upgradeFromVehicleId,
        /* The old model and the old single owner go on the first save. */
        partnershipId: undefined,
        pricePerKm: undefined,
        pricePerKmNight: undefined,
        minimumPrice: undefined,
        actualizadoEm: agora,
      });
      return { id: actual._id, versao: agora };
    }
    const ordem = todos.length ? Math.max(...todos.map((x) => x.order)) + 1 : 0;
    const novo = await ctx.db.insert("vehicles", {
      ...d,
      categoryId: d.categoryId ?? undefined,
      partnerIds: d.partnerMode === "some" ? d.partnerIds : undefined,
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

/*
 * The cars saved before 2026-11-27 in the new shape: the class of their
 * category (it moved to the car on 2026-11-28), a tariff from the old
 * per-km price and minimum when they had none (no base, +20% at night, as
 * the old model charged), the reach from the old single owner, and the old
 * fields cleared. Can run again: a car already migrated is left alone.
 * npx convex run veiculos:migrarParaTarifas '{"executar":false}' lists.
 */
export const migrarParaTarifas = internalMutation({
  args: { executar: v.boolean() },
  handler: async (ctx, { executar }) => {
    const mudados: { nome: string; tarifa: boolean; semPreco: boolean; alcance: string }[] = [];
    for (const x of await ctx.db.query("vehicles").collect()) {
      const antigo = x.pricePerKm !== undefined || x.minimumPrice !== undefined || x.pricePerKmNight !== undefined || x.partnershipId !== undefined;
      if (!antigo && x.partnerMode && x.tariff && x.vehicleClass) continue;
      const t = tariffOf(x);
      const r = reachOf(x);
      mudados.push({ nome: x.name, tarifa: !x.tariff && Boolean(t), semPreco: !t, alcance: `${r.site ? "site" : "sem site"} · ${r.mode}${r.partnerIds.length ? ` (${r.partnerIds.length})` : ""}` });
      if (!executar) continue;
      await ctx.db.patch(x._id, {
        tariff: t ?? undefined,
        /* The class moved from the category to the car (2026-11-28). */
        vehicleClass: classOf(x, x.categoryId ? await ctx.db.get(x.categoryId) : null),
        showOnSite: r.site,
        partnerMode: r.mode,
        partnerIds: r.mode === "some" ? r.partnerIds : undefined,
        partnershipId: undefined,
        pricePerKm: undefined,
        pricePerKmNight: undefined,
        minimumPrice: undefined,
      });
    }
    return { executado: executar, carros: mudados.length, mudados, semPreco: mudados.filter((m) => m.semPreco).length };
  },
});
