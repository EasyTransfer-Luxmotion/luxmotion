import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin } from "./lib/admin";
import { lotacao, reservasDaSaida } from "./lib/saidas";

/*
 * As saídas partilhadas dos eventos (E3A). O back-office cria e gere as
 * saídas no passo "Saídas" do editor do evento; o site lista as que estão à
 * venda no cartão de reserva. As regras (lugares, retenção, preço, o que se
 * pode mudar numa saída já reservada) são as da decisão D08 — ver
 * lib/saidas.ts.
 */

const vSentido = v.union(v.literal("ida"), v.literal("regresso"));
const vEstado = v.union(v.literal("aberta"), v.literal("fechada"), v.literal("cancelada"));

/* ─── Back-office ─────────────────────────────────────────────────────── */

export const lista = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await exigirAdmin(ctx, "eventos", "ver");
    const evento = await ctx.db.get(eventId);
    if (!evento) return null;
    const viatura = evento.vehicleId ? await ctx.db.get(evento.vehicleId) : null;
    const saidas = await ctx.db.query("eventDepartures").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const agora = Date.now();
    return {
      /* Para pré-preencher uma saída nova. */
      omissao: {
        preco: evento.sharedPrice ?? null,
        lugares: viatura?.passengers ?? evento.maxPassengers ?? null,
        origem: evento.meetingPoint?.title || evento.meetingPoint?.address || "",
        destino: evento.venue || evento.location || "",
      },
      vendePartilhado: typeof evento.sharedPrice === "number" && evento.sharedPrice > 0,
      saidas: await Promise.all(
        saidas.map(async (s) => {
          const l = await lotacao(ctx, s);
          /* Qualquer reserva (mesmo por pagar ou cancelada) prende a saída: é
             ela que guarda o que o cliente escolheu. */
          const temReservas = (await reservasDaSaida(ctx, s)).length > 0;
          return {
            id: s._id as string,
            sentido: s.sentido,
            partida: s.partida,
            origem: s.origem,
            destino: s.destino,
            preco: s.preco,
            lugares: s.lugares,
            estado: s.estado,
            passou: s.partida <= agora,
            vendidos: l.vendidos,
            retidos: l.retidos,
            livres: l.livres,
            temReservas,
          };
        }),
      ),
    };
  },
});

function erro(campo: string, mensagem: string): never {
  throw new ConvexError({ tipo: "invalido", mensagem, erros: { [campo]: mensagem } });
}

export const guardar = mutation({
  args: {
    id: v.optional(v.id("eventDepartures")),
    eventId: v.id("events"),
    sentido: vSentido,
    partida: v.number(),
    origem: v.string(),
    destino: v.string(),
    preco: v.number(),
    lugares: v.number(),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "eventos");
    const evento = await ctx.db.get(a.eventId);
    if (!evento) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este evento já não existe." });
    const origem = a.origem.trim();
    const destino = a.destino.trim();
    if (!origem) erro("origem", "De onde parte?");
    if (!destino) erro("destino", "Para onde vai?");
    if (!Number.isFinite(a.preco) || a.preco <= 0) erro("preco", "O preço por pessoa tem de ser maior que zero.");
    if (!Number.isInteger(a.lugares) || a.lugares < 1 || a.lugares > 200) erro("lugares", "Lugares: um número inteiro entre 1 e 200.");
    const agora = Date.now();

    if (!a.id) {
      if (a.partida <= agora) erro("partida", "Esta data já passou.");
      return await ctx.db.insert("eventDepartures", {
        eventId: a.eventId,
        sentido: a.sentido,
        partida: a.partida,
        origem,
        destino,
        preco: a.preco,
        lugares: a.lugares,
        estado: "aberta",
        criadaEm: agora,
        actualizadaEm: agora,
      });
    }

    const s = await ctx.db.get(a.id);
    if (!s || s.eventId !== a.eventId) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta saída já não existe." });
    /* D08 (5): numa saída já reservada não se muda o que o cliente comprou —
       o dia, a hora, o sentido e a rota. */
    if ((await reservasDaSaida(ctx, s)).length > 0) {
      if (a.sentido !== s.sentido) erro("sentido", "Já há reservas nesta saída: o sentido não muda.");
      if (a.partida !== s.partida) erro("partida", "Já há reservas nesta saída: o dia e a hora não mudam. Feche-a e crie outra.");
      if (origem !== s.origem) erro("origem", "Já há reservas nesta saída: a origem não muda.");
      if (destino !== s.destino) erro("destino", "Já há reservas nesta saída: o destino não muda.");
    } else if (a.partida !== s.partida && a.partida <= agora) {
      erro("partida", "Esta data já passou.");
    }
    const { vendidos, retidos } = await lotacao(ctx, s);
    if (a.lugares < vendidos + retidos) {
      erro("lugares", `Já há ${vendidos + retidos} ${vendidos + retidos === 1 ? "lugar ocupado" : "lugares ocupados"}: não pode ter menos.`);
    }
    await ctx.db.patch(s._id, {
      sentido: a.sentido,
      partida: a.partida,
      origem,
      destino,
      preco: a.preco,
      lugares: a.lugares,
      actualizadaEm: agora,
    });
    return s._id;
  },
});

export const mudarEstado = mutation({
  args: { id: v.id("eventDepartures"), estado: vEstado },
  handler: async (ctx, { id, estado }) => {
    await exigirAdmin(ctx, "eventos");
    const s = await ctx.db.get(id);
    if (!s) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta saída já não existe." });
    if (s.estado === "cancelada" && estado !== "cancelada") {
      throw new ConvexError({ tipo: "invalido", mensagem: "Uma saída cancelada não volta à venda: crie outra." });
    }
    await ctx.db.patch(id, { estado, actualizadaEm: Date.now() });
  },
});

/* Apagar só sem reservas nenhumas; com reservas, cancela-se. */
export const remover = mutation({
  args: { id: v.id("eventDepartures") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "eventos");
    const s = await ctx.db.get(id);
    if (!s) return;
    if ((await reservasDaSaida(ctx, s)).length > 0) {
      throw new ConvexError({ tipo: "invalido", mensagem: "Esta saída tem reservas: cancele-a em vez de a apagar." });
    }
    await ctx.db.delete(id);
  },
});

/* ─── Site ────────────────────────────────────────────────────────────── */

/**
 * As saídas de um evento publicado, para o cartão de reserva. `usaSaidas`
 * diz se o partilhado se vende por saídas (há pelo menos uma não cancelada,
 * como no servidor — lib/saidas.ts, temSaidas); `saidas` são as que estão à
 * venda agora (abertas, por partir), com os lugares livres. Um evento que usa
 * saídas e não tem nenhuma à venda mostra-se sem lugares, e não volta à data
 * do evento — o servidor recusaria essa reserva.
 */
export const doEvento = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const evento = await ctx.db.get(eventId);
    if (!evento || evento.status !== "published") return { usaSaidas: false, saidas: [] };
    const agora = Date.now();
    const todas = await ctx.db.query("eventDepartures").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
    const abertas = todas.filter((s: Doc<"eventDepartures">) => s.estado === "aberta" && s.partida > agora);
    return {
      usaSaidas: todas.some((s) => s.estado !== "cancelada"),
      saidas: await Promise.all(
        abertas.map(async (s) => ({
          id: s._id as Id<"eventDepartures">,
          sentido: s.sentido,
          partida: s.partida,
          origem: s.origem,
          destino: s.destino,
          preco: s.preco,
          livres: (await lotacao(ctx, s)).livres,
        })),
      ),
    };
  },
});
