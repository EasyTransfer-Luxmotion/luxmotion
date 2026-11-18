import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { exigirAdmin } from "./lib/admin";
import { tourScarcityDefaults } from "./tourScarcity";

/*
 * Operação → Disponibilidade no dashboard (E3). São os números da secção
 * "Disponibilidade limitada" da página Ultra-luxo — não um inventário de
 * lugares: nada no site os desconta quando alguém reserva (decisão D11).
 *
 * O site continua a ler pelo `tourScarcity.get`, que é público. O que muda em
 * relação ao `upsert` antigo:
 *  - Conflito pelo updatedAt: duas pessoas com o ecrã aberto já não gravam
 *    uma por cima da outra sem saber.
 *  - O erro vem por campo e em português; o antigo dizia "All values must be
 *    non-negative integers" sem dizer qual.
 *  - Um mês "quase cheio" tem de ter pelo menos uma vaga: com 0 o site
 *    escrevia "0 vagas restantes" num mês que diz estar aberto.
 *  - Diz se o documento existe. Em produção nunca foi gravado, e o site mostra
 *    os números de origem do código (2026, 173 de 200) sem ninguém o saber.
 */

const CHAVE = "global";
const vEstado = v.union(v.literal("booked"), v.literal("almost"), v.literal("available"));

async function lerDoc(ctx: QueryCtx) {
  return await ctx.db
    .query("tourScarcity")
    .withIndex("by_key", (q) => q.eq("key", CHAVE))
    .first();
}

/* AAAA-MM-DD em Lisboa: "pedidos hoje" no site quer dizer o dia de cá. */
function diaEmLisboa(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(ms));
}

export const detalhe = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "escassez", "ver");
    const doc = await lerDoc(ctx);
    const valores = doc
      ? {
          year: doc.year,
          totalCapacity: doc.totalCapacity,
          confirmedBookings: doc.confirmedBookings,
          inquiriesToday: doc.inquiriesToday,
          reservedThisWeek: doc.reservedThisWeek,
          months: doc.months,
        }
      : { ...tourScarcityDefaults, months: tourScarcityDefaults.months.map((m) => ({ ...m })) };

    /* Para comparar com os números fixos: os pedidos de tours que chegaram de
       facto. Só os últimos sete dias, pelo índice — nunca a tabela inteira. */
    const agora = Date.now();
    const recentes = await ctx.db
      .query("tourInquiries")
      .withIndex("by_created", (q) => q.gte("createdAt", agora - 7 * 86_400_000))
      .collect();
    const hoje = diaEmLisboa(agora);

    return {
      gravado: Boolean(doc),
      versao: doc?.updatedAt ?? null,
      valores,
      reais: {
        pedidosHoje: recentes.filter((p) => diaEmLisboa(p.createdAt) === hoje).length,
        pedidosSemana: recentes.length,
      },
    };
  },
});

export const guardar = mutation({
  args: {
    /* null: o ecrã abriu antes de existir documento. */
    versao: v.union(v.number(), v.null()),
    dados: v.object({
      year: v.number(),
      totalCapacity: v.number(),
      confirmedBookings: v.number(),
      inquiriesToday: v.number(),
      reservedThisWeek: v.number(),
      months: v.array(v.object({ status: vEstado, spotsLeft: v.number() })),
    }),
  },
  handler: async (ctx, { versao, dados }) => {
    await exigirAdmin(ctx, "escassez");

    const erros: Record<string, string> = {};
    const inteiro = (n: number) => Number.isFinite(n) && Number.isInteger(n) && n >= 0;
    for (const k of ["totalCapacity", "confirmedBookings", "inquiriesToday", "reservedThisWeek"] as const) {
      if (!inteiro(dados[k])) erros[k] = "Um número inteiro, 0 ou mais.";
    }
    if (!inteiro(dados.year) || dados.year < 2024 || dados.year > 2100) erros.year = "Ano entre 2024 e 2100.";
    if (!erros.totalCapacity && dados.totalCapacity === 0) erros.totalCapacity = "Com capacidade 0 o site mostra 0% reservado e nenhuma vaga.";
    if (!erros.totalCapacity && !erros.confirmedBookings && dados.confirmedBookings > dados.totalCapacity) {
      erros.confirmedBookings = `Não pode passar a capacidade (${dados.totalCapacity}).`;
    }
    if (dados.months.length !== 12) erros.months = "Têm de ser os doze meses.";
    dados.months.forEach((m, i) => {
      if (m.status !== "almost") return;
      if (!inteiro(m.spotsLeft) || m.spotsLeft < 1) erros[`mes.${i}`] = "Pelo menos 1 vaga.";
    });
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const doc = await lerDoc(ctx);
    if ((doc?.updatedAt ?? null) !== versao) {
      throw new ConvexError({
        tipo: "conflito",
        mensagem: "Alguém gravou estes números depois de abrir o ecrã. Veja a versão actual antes de gravar por cima.",
      });
    }

    /* As vagas só contam num mês quase cheio: guardar 0 nos outros evita que
       um número esquecido apareça ao mudar o estado mais tarde. */
    const months = dados.months.map((m) => ({ status: m.status, spotsLeft: m.status === "almost" ? m.spotsLeft : 0 }));
    const updatedAt = Math.max(Date.now(), (doc?.updatedAt ?? 0) + 1);
    const registo = { key: CHAVE, ...dados, months, updatedAt };
    if (doc) await ctx.db.patch(doc._id, registo);
    else await ctx.db.insert("tourScarcity", registo);
    return { versao: updatedAt };
  },
});
