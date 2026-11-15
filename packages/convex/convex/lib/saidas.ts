import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/*
 * As regras das saídas partilhadas dos eventos (E3A). As decisões estão na
 * D08 do registo de decisões do back-office; resumidas:
 *
 *  - os lugares são de cada saída;
 *  - uma reserva por pagar segura os lugares durante RETENCAO_MIN, o mesmo
 *    tempo que o checkout mostra ao cliente (RESERVATION_MINUTES no site);
 *  - ida e regresso custam a soma das duas pernas;
 *  - o regresso tem de ser depois da ida, e pode ser só uma das duas.
 */

export const RETENCAO_MIN = 30;

type Saida = Doc<"eventDepartures">;
export type Perna = {
  saidaId: Id<"eventDepartures">;
  sentido: "ida" | "regresso";
  partida: number;
  origem: string;
  destino: string;
  preco: number;
};

/** Esta reserva conta para a lotação? Paga sempre; por pagar, só enquanto a retenção dura. */
export function ocupaLugares(b: Doc<"tourBookings">, agora: number): boolean {
  if (b.status === "paid" || b.status === "completed") return true;
  if (b.status === "draft" || b.status === "pending") return b.updatedAt >= agora - RETENCAO_MIN * 60_000;
  return false;
}

/** As reservas que escolheram esta saída, pelo índice do sentido dela. */
export async function reservasDaSaida(ctx: QueryCtx, saida: Saida): Promise<Doc<"tourBookings">[]> {
  return saida.sentido === "ida"
    ? await ctx.db.query("tourBookings").withIndex("by_saida_ida", (q) => q.eq("saidaIdaId", saida._id)).collect()
    : await ctx.db.query("tourBookings").withIndex("by_saida_regresso", (q) => q.eq("saidaRegressoId", saida._id)).collect();
}

/** Lugares: vendidos (pagos), retidos (por pagar, dentro da retenção) e livres. */
export async function lotacao(ctx: QueryCtx, saida: Saida, excluir?: Id<"tourBookings">) {
  const agora = Date.now();
  let vendidos = 0;
  let retidos = 0;
  for (const b of await reservasDaSaida(ctx, saida)) {
    if (b._id === excluir) continue;
    if (b.status === "paid" || b.status === "completed") vendidos += b.passengers;
    else if (ocupaLugares(b, agora)) retidos += b.passengers;
  }
  return { vendidos, retidos, livres: Math.max(0, saida.lugares - vendidos - retidos) };
}

/** O evento vende-se por saídas? Basta haver uma que não esteja cancelada. */
export async function temSaidas(ctx: QueryCtx, eventId: Id<"events">): Promise<boolean> {
  const todas = await ctx.db.query("eventDepartures").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect();
  return todas.some((s) => s.estado !== "cancelada");
}

/**
 * A escolha do cliente: confere que as saídas são deste evento, estão à
 * venda, ainda não partiram, estão no sentido certo, por ordem, e têm lugar
 * para todos. Devolve as pernas e o preço por pessoa (a soma).
 *
 * `excluir`: ao recalcular uma reserva que já existe, ela própria não conta
 * como ocupante — senão uma reserva de 4 numa saída de 4 recusava-se a si
 * mesma no momento de pagar.
 */
export async function validarSaidas(
  ctx: QueryCtx,
  eventId: Id<"events">,
  escolha: { ida?: Id<"eventDepartures">; regresso?: Id<"eventDepartures"> },
  pessoas: number,
  excluir?: Id<"tourBookings">,
): Promise<{ pernas: Perna[]; precoPorPessoa: number }> {
  if (!escolha.ida && !escolha.regresso) throw new ConvexError("Escolha a ida, o regresso ou os dois.");
  const agora = Date.now();
  const pernas: Perna[] = [];
  for (const sentido of ["ida", "regresso"] as const) {
    const id = escolha[sentido];
    if (!id) continue;
    const s = await ctx.db.get(id);
    if (!s || s.eventId !== eventId) throw new ConvexError("Esta saída já não existe.");
    if (s.sentido !== sentido) throw new ConvexError("Saída no sentido errado.");
    if (s.estado !== "aberta") throw new ConvexError("Esta saída já não está à venda.");
    if (s.partida <= agora) throw new ConvexError("Esta saída já partiu.");
    const { livres } = await lotacao(ctx, s, excluir);
    if (pessoas > livres) {
      throw new ConvexError(
        livres === 0
          ? `A ${sentido} das ${horaLisboa(s.partida)} já não tem lugares.`
          : `A ${sentido} das ${horaLisboa(s.partida)} só tem ${livres} ${livres === 1 ? "lugar" : "lugares"}.`,
      );
    }
    pernas.push({ saidaId: s._id, sentido, partida: s.partida, origem: s.origem, destino: s.destino, preco: s.preco });
  }
  const [ida, regresso] = [pernas.find((p) => p.sentido === "ida"), pernas.find((p) => p.sentido === "regresso")];
  if (ida && regresso && regresso.partida <= ida.partida) throw new ConvexError("O regresso tem de ser depois da ida.");
  return { pernas, precoPorPessoa: pernas.reduce((t, p) => t + p.preco, 0) };
}

/** Dia e hora de Lisboa, AAAA-MM-DD e HH:MM — como a reserva guarda a data. */
export function emLisboa(ms: number): { dia: string; hora: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Lisbon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

function horaLisboa(ms: number) {
  const { dia, hora } = emLisboa(ms);
  return `${hora} de ${dia.split("-").reverse().join("/")}`;
}
