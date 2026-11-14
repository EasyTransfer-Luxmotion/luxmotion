import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { avaliarAcesso, exigirAdmin } from "./lib/admin";
import { catalogTranslationsValidator } from "./lib/catalogTranslations";
import { NIGHT_TAX_MIN_EUR, NIGHT_TAX_PERCENT, priceVehicle } from "./lib/pricing";
import { apagarImagem, urlDaImagem, vImagem } from "./lib/imagens";
import { siteSettingsDefaults } from "./siteSettings";

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

export const lista = query({
  args: {},
  handler: async (ctx) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const todos = await ctx.db.query("vehicles").withIndex("by_order").collect();
    const parceiros = await nomesDosParceiros(ctx);
    const eventos = await ctx.db.query("events").collect();
    return Promise.all(
      todos.map(async (x) => ({
        _id: x._id,
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
        dono: x.partnershipId ? (parceiros.get(x.partnershipId) ?? "Parceiro") : null,
        donoId: x.partnershipId ?? null,
        upgradeDe: x.upgradeFromVehicleId ? (todos.find((y) => y._id === x.upgradeFromVehicleId)?.name ?? null) : null,
        emEventos: eventos.filter((e) => e.vehicleId === x._id).length,
        avisos: avisosDoUpgrade(x, todos),
        traducoes: (x.translations ?? []).filter((t) => t.name?.trim()).map((t) => t.locale),
      })),
    );
  },
});

export const detalhe = query({
  args: { id: v.id("vehicles") },
  handler: async (ctx, { id }) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const x = await ctx.db.get(id);
    if (!x) return { encontrado: false as const };
    const todos = await ctx.db.query("vehicles").withIndex("by_order").collect();
    return {
      encontrado: true as const,
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
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const todos = await ctx.db.query("vehicles").withIndex("by_order").collect();
    return {
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
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const ps = await ctx.db.query("partnerships").collect();
    return ps.map((p) => ({ _id: p._id, nome: p.name })).sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  },
});

/* Distâncias típicas: aeroporto → centro, → Cascais, → Sintra, Lisboa →
   Évora, Lisboa → Porto. */
const DISTANCIAS = [15, 30, 50, 130, 315];

export const simular = query({
  args: { precoKm: v.number(), minimo: v.number() },
  handler: async (ctx, a) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    if (!(a.precoKm > 0) || !(a.minimo >= 0)) return null;
    const definicoes = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .first();
    const aeroporto = definicoes?.airportSurchargePercent ?? siteSettingsDefaults.airportSurchargePercent;
    const base = { pricePerKm: a.precoKm, minimumPrice: a.minimo, airportSurchargePercent: aeroporto };
    return {
      aeroporto,
      noitePct: NIGHT_TAX_PERCENT,
      noiteMin: NIGHT_TAX_MIN_EUR,
      linhas: DISTANCIAS.map((km) => ({
        km,
        dia: priceVehicle({ ...base, distance: km, isNight: false }).price,
        noite: priceVehicle({ ...base, distance: km, isNight: true }).price,
        aeroporto: priceVehicle({ ...base, distance: km, isNight: false, isAirportPickup: true }).price,
        minimoAplicado: a.precoKm * km < a.minimo,
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
  return e;
}

export const guardar = mutation({
  args: {
    id: v.optional(v.id("vehicles")),
    /* A versão lida pelo editor (versao do detalhe). Obrigatória ao editar. */
    versao: v.optional(v.number()),
    dados: vDados,
  },
  handler: async (ctx, { id, versao, dados }) => {
    await exigirAdmin(ctx);
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

    if (d.upgradeFromVehicleId) {
      const base = todos.find((x) => x._id === d.upgradeFromVehicleId);
      if (!base) erros.upgradeFromVehicleId = "O veículo escolhido já não existe.";
      else if (id && base._id === id) erros.upgradeFromVehicleId = "Um veículo não pode ser upgrade de si próprio.";
      else if ((base.partnershipId ?? null) !== (d.partnershipId ?? null)) {
        erros.upgradeFromVehicleId = "Só de um veículo do mesmo dono.";
      } else if (id && base.upgradeFromVehicleId === id) {
        erros.upgradeFromVehicleId = `${base.name} já é upgrade deste: ficavam em círculo.`;
      } else {
        const outro = todos.find((x) => x._id !== id && x.upgradeFromVehicleId === base._id && x.status === "active");
        if (outro && d.status === "active") {
          erros.upgradeFromVehicleId = `${outro.name} já é o upgrade de ${base.name}; o checkout só mostra um.`;
        }
      }
    }
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const agora = Date.now();
    if (actual) {
      if (actual.imageId && actual.imageId !== d.imageId) await apagarImagem(ctx, actual.imageId);
      /* Os opcionais vão sempre com a chave: um campo que o browser manda
         vazio chega cá sem chave nenhuma, e um patch sem a chave não mexe no
         campo. Era assim que "Nenhum" no upgrade (e tirar o dono ou a foto)
         gravava sem efeito — no vehicles.update antigo também. Com a chave
         e o valor undefined, o patch apaga-o. */
      await ctx.db.patch(actual._id, {
        ...d,
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
    const novo = await ctx.db.insert("vehicles", { ...d, pricePerKmNight: d.pricePerKm, order: ordem, actualizadoEm: agora });
    return { id: novo, versao: agora };
  },
});

export const mudarEstado = mutation({
  args: { id: v.id("vehicles"), estado: vEstado },
  handler: async (ctx, { id, estado }) => {
    await exigirAdmin(ctx);
    const x = await ctx.db.get(id);
    if (!x) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este veículo já não existe." });
    await ctx.db.patch(id, { status: estado, actualizadoEm: Date.now() });
  },
});

export const reordenar = mutation({
  args: { ids: v.array(v.id("vehicles")) },
  handler: async (ctx, { ids }) => {
    await exigirAdmin(ctx);
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
    await exigirAdmin(ctx);
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
    if (x.imageId) await apagarImagem(ctx, x.imageId);
    await ctx.db.delete(id);
  },
});
