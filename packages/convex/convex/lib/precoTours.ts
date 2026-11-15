import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { resolveAddons } from "./addons";
import { temSaidas, validarSaidas, type Perna } from "./saidas";

/**
 * O preço de uma reserva de tour ou evento, calculado no servidor.
 *
 * Até aqui o browser mandava o `basePrice`, o total dos extras, a gorjeta e o
 * valor a cobrar, e o servidor gravava e cobrava o que vinha. Qualquer pessoa
 * reservava um tour por 1 € — é a regra dos preços do CLAUDE.md, que nos
 * transfers já se cumpria e aqui não.
 *
 * As regras são as do cartão de reserva (components/tours/tour-booking-card.tsx),
 * escritas outra vez de propósito iguais: o cliente vê um número e tem de pagar
 * esse número. Se mudarem lá, mudam aqui.
 *
 *  - Tour: `basePrice` × pessoas. Os tours não têm opção partilhada.
 *  - Evento com `sharedPrice` > 0: partilhado é `sharedPrice` × pessoas;
 *    privado é o preço da viatura, uma vez, seja quantos forem.
 *  - Evento sem `sharedPrice`: o preço privado × pessoas.
 *  - Pessoas são adultos + crianças + bebés, como no cartão. Numa viatura o
 *    cartão esconde os contadores e conta 1 — também para os extras por pessoa.
 *  - Extras por pessoa: preço × pessoas; fixos: o preço.
 *  - Gorjeta: percentagem sobre a base (sem extras), arredondada ao euro, ou
 *    um valor livre — que só pode ser zero ou mais.
 *  - Evento partilhado com saídas (E3A): o preço por pessoa é a soma das
 *    pernas escolhidas (ida, regresso ou as duas), e cada uma tem de ter
 *    lugar para todos — ver lib/saidas.ts.
 */

export type ExtraEscolhido = {
  addonId?: Id<"tourAddons">;
  universalAddonId?: Id<"universalAddons">;
};

export type PrecoDaReserva = {
  porViatura: boolean;
  /** Pessoas que contam para o preço: 1 numa viatura, senão as da reserva. */
  pessoasNoPreco: number;
  basePrice: number;
  selectedAddons: Array<{
    addonId?: Id<"tourAddons">;
    universalAddonId?: Id<"universalAddons">;
    title: string;
    price: number;
    pricingType: "per_person" | "flat";
    quantity: number;
    subtotal: number;
  }>;
  addonsTotal: number;
  /** Só num evento partilhado com saídas. */
  pernas?: Perna[];
};

/** O preço da viatura num evento, venha do campo novo ou do antigo — como `precoPrivado` no site. */
function precoPrivado(e: Doc<"events">): number {
  return e.privatePrice ?? e.basePrice ?? 0;
}

export async function precoDaReserva(
  ctx: QueryCtx,
  reserva: {
    tourId?: Id<"tours">;
    eventId?: Id<"events">;
    passengers: number;
    sharingMode?: "private" | "shared";
    extras: ExtraEscolhido[];
    saidas?: { ida?: Id<"eventDepartures">; regresso?: Id<"eventDepartures"> };
    /** Ao recalcular uma reserva já criada: não conta como ocupante das saídas. */
    reservaId?: Id<"tourBookings">;
  },
): Promise<PrecoDaReserva> {
  if (!Number.isFinite(reserva.passengers) || reserva.passengers < 1 || reserva.passengers > 200) {
    throw new ConvexError("Número de pessoas inválido.");
  }
  const pessoas = Math.round(reserva.passengers);

  let porViatura = false;
  let unitario: number;
  let pernas: Perna[] | undefined;
  let alvoExtras: Parameters<typeof resolveAddons>[1];

  if (reserva.tourId) {
    const tour = await ctx.db.get(reserva.tourId);
    if (!tour) throw new ConvexError("Este tour já não existe.");
    /* Despublicar tem de parar as reservas, não só esconder o tour das listas. */
    if (tour.status !== "published") throw new ConvexError("Este tour já não está disponível para reserva.");
    unitario = tour.basePrice;
    alvoExtras = {
      tourId: tour._id,
      isUltraLuxury: tour.isUltraLuxury,
      disabled: tour.disabledUniversalAddons,
      trimmed: true,
    };
  } else if (reserva.eventId) {
    const evento = await ctx.db.get(reserva.eventId);
    if (!evento) throw new ConvexError("Este evento já não existe.");
    if (evento.status !== "published") throw new ConvexError("Este evento já não está disponível para reserva.");
    const temEscolha = typeof evento.sharedPrice === "number" && evento.sharedPrice > 0;
    porViatura = temEscolha && reserva.sharingMode !== "shared";
    unitario = temEscolha && reserva.sharingMode === "shared" ? evento.sharedPrice! : precoPrivado(evento);
    /* Partilhado num evento com saídas: o preço é o das pernas, e sem escolher
       pelo menos uma não há reserva. */
    if (temEscolha && reserva.sharingMode === "shared" && (await temSaidas(ctx, evento._id))) {
      const r = await validarSaidas(ctx, evento._id, reserva.saidas ?? {}, pessoas, reserva.reservaId);
      pernas = r.pernas;
      unitario = r.precoPorPessoa;
    }
    alvoExtras = { eventId: evento._id, disabled: evento.disabledUniversalAddons, trimmed: true };
  } else {
    // Sem produto não há preço que se possa confirmar.
    throw new ConvexError("Não foi possível calcular o preço desta reserva.");
  }

  const pessoasNoPreco = porViatura ? 1 : pessoas;
  const basePrice = porViatura ? unitario : unitario * pessoasNoPreco;

  // Cada extra tem de estar entre os que este tour ou evento oferece agora — e
  // é daqui, não do browser, que vêm o preço e o título.
  const disponiveis = await resolveAddons(ctx, alvoExtras);
  const vistos = new Set<string>();
  const selectedAddons: PrecoDaReserva["selectedAddons"] = [];
  for (const escolhido of reserva.extras) {
    const id = escolhido.universalAddonId ?? escolhido.addonId;
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const extra = disponiveis.find(
      (a) => a._id === id && a.isUniversal === Boolean(escolhido.universalAddonId),
    );
    if (!extra) throw new ConvexError("Um dos extras escolhidos já não está disponível.");
    const quantidade = extra.pricingType === "per_person" ? pessoasNoPreco : 1;
    selectedAddons.push({
      ...(escolhido.universalAddonId
        ? { universalAddonId: escolhido.universalAddonId }
        : { addonId: escolhido.addonId }),
      title: extra.title,
      price: extra.price,
      pricingType: extra.pricingType,
      quantity: quantidade,
      subtotal: extra.price * quantidade,
    });
  }
  const addonsTotal = selectedAddons.reduce((soma, a) => soma + a.subtotal, 0);

  return { porViatura, pessoasNoPreco, basePrice, selectedAddons, addonsTotal, ...(pernas && { pernas }) };
}

/**
 * A gorjeta. Percentagem: sobre a base, arredondada — como no checkout.
 * Valor livre (`tipPercent` -1): o que a pessoa escrever, desde que não seja
 * negativo, que era uma forma de descontar no total.
 */
export function gorjeta(basePrice: number, tipPercent: number, tipAmount: number): number {
  if (tipPercent >= 0) {
    if (tipPercent > 100) throw new ConvexError("Gorjeta inválida.");
    return Math.round((basePrice * tipPercent) / 100);
  }
  if (!Number.isFinite(tipAmount) || tipAmount < 0) throw new ConvexError("Gorjeta inválida.");
  return Math.round(tipAmount * 100) / 100;
}
