import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { haversineKm } from "./geo";
import { eAeroporto, type Local } from "./aeroportos";
import { linearPartnerFactor, priceTrip, withFactor } from "./pricing";
import { precoDaReserva } from "./precoTours";
import { classOf, loadPricing, smallestThatFits } from "./quote";

/*
 * O mínimo que uma reserva de transfer tem de pagar, calculado no servidor.
 *
 * Até 16/11/2026 o checkout mandava o preço, as taxas e o total, e o
 * servidor cobrava o total que viesse — quem mexesse no pedido pagava o que
 * quisesse (estava no CLAUDE.md como "por corrigir"). Agora, antes de cobrar,
 * o servidor refaz a conta com o que tem gravado e recusa um total abaixo
 * deste mínimo. Acima pode ser: o que sobra é a gorjeta, que é livre.
 *
 * As peças são as do checkout (apps/web/components/*checkout/pricing.ts e
 * lib/format.ts, calculatePriceBreakdown):
 *  - o carro: priceVehicle com a distância, a noite, o aeroporto e a volta;
 *  - os seguros e opções escolhidos, pelo código (o mais barato dos dois
 *    checkouts, que não têm a mesma tabela — refundTerms é 4 num e 5 noutro);
 *  - os extras de bagagem gravados na ida (cadeiras, pranchas, animais);
 *  - o total arredondado para cima ao euro, como no checkout;
 *  - as experiências juntadas no checkout, com o preço do servidor.
 *
 * A distância vem do browser (é o Google no browser que a calcula). Não se
 * confia nela abaixo da linha recta entre a partida e a chegada: nenhuma
 * estrada é mais curta do que isso.
 */

/* Euros, só ida; numa ida e volta, ×2 (como no checkout). */
const OPCOES_MINIMO: Record<string, number> = {
  premiumInsurance: 9,
  refundTerms: 4,
  priorityPickup: 6,
  comfortConnection: 7,
};

/* Os aeroportos vivem em lib/aeroportos.ts (sem dependências): daqui só se
   reexportam, para quem já os importava deste ficheiro. */
export { codigoDoAeroporto, eAeroporto } from "./aeroportos";

/** O ajuste de preço de um parceiro sobre a frota (partnerships.ajustePreco, em %).
    Only the linear model uses it; the banded one has one channel factor for
    every partner (siteSettings.pricing.partnerFactor). */
export const factorDoParceiro = (p: Pick<Doc<"partnerships">, "ajustePreco"> | null | undefined) => linearPartnerFactor(p);

/* Ao cêntimo: 57 × 1,1 dava 62,699999… no checkout. */
export const comAjuste = withFactor;

/* How long a quote keeps its lead-time surge: someone who chose the car an
   hour ago and pays now is priced as of then. Longer than that, the clock of
   the payment counts. */
const QUOTE_HOLD_MS = 2 * 3_600_000;

export async function minimoDoTransfer(
  ctx: QueryCtx,
  ida: Doc<"orders">,
  volta: Doc<"orders"> | null,
  /* Os escolhidos agora: na order só ficam gravados depois de se aceitar o pagamento. */
  opcoesEscolhidas: { code: string }[],
) {
  if (!ida.vehicleId) throw new ConvexError("Escolha um carro antes de pagar.");
  let carro = await ctx.db.get(ida.vehicleId);
  if (!carro) throw new ConvexError("O carro escolhido já não existe. Volte atrás e escolha outro.");
  const categoria = carro.categoryId ? await ctx.db.get(carro.categoryId) : null;
  /* A category's car must take the group: a request edited to keep the
     15-seat minibus for 20 people is priced with the car that fits. */
  if (categoria && ida.passengers > carro.passengers) {
    const irmaos = (await ctx.db.query("vehicles").withIndex("by_category", (q) => q.eq("categoryId", categoria._id)).collect()).filter(
      (c) => c.status === "active",
    );
    carro = smallestThatFits(irmaos, ida.passengers, 0) ?? carro;
  }
  const parceria = ida.partnershipId ? await ctx.db.get(ida.partnershipId) : null;

  const temCoordenadas = (l: Local): l is { location: string; lat: number; lng: number } => typeof l?.lat === "number" && typeof l?.lng === "number";
  const recta = temCoordenadas(ida.departure) && temCoordenadas(ida.arrival) ? haversineKm(ida.departure, ida.arrival) : 0;
  const distancia = Math.max(ida.distance ?? 0, recta);

  const pricing = await loadPricing(ctx);
  const precoEm = (now: number) =>
    priceTrip({
      vehicle: carro,
      vehicleClass: classOf(categoria),
      config: pricing.config,
      partner: parceria,
      distance: distancia,
      departureDate: ida.departureDate,
      returnDate: volta?.departureDate,
      bookReturn: Boolean(volta),
      isAirportPickup: eAeroporto(ida.departure),
      airportSurchargePercent: pricing.airportSurchargePercent,
      now,
    });
  const agora = Date.now();
  const cotado = ida.quotedAt && agora - ida.quotedAt <= QUOTE_HOLD_MS ? precoEm(ida.quotedAt) : null;
  const actual = precoEm(agora);
  /* The cheaper of the two for the customer: the surge only grows as the
     pickup gets closer. */
  const preco = cotado && cotado.price < actual.price ? cotado : actual;

  const vezes = volta ? 2 : 1;
  const opcoes = opcoesEscolhidas.reduce((t, o) => t + (OPCOES_MINIMO[o.code] ?? 0) * vezes, 0);
  const cadeiras = (ida.childSeats ?? 0) + (ida.babySeats ?? 0) + (ida.boosterSeats ?? 0);
  const pranchas = (ida.standardSurfboards ?? 0) + (ida.largeSurfboards ?? 0);
  const animais = (ida.smallPets ?? 0) + (ida.largePets ?? 0);
  /* Per unit and per leg, from Configurações → Preços (the checkout reads the same). */
  const EXTRA = pricing.config.extras;
  const extras = (cadeiras * EXTRA.childSeat + pranchas * EXTRA.surfboard + animais * EXTRA.pet) * vezes;

  let experiencias = 0;
  for (const x of ida.pendingCheckoutExperiences ?? []) experiencias += await minimoDaExperiencia(ctx, x);

  const transfer = Math.ceil(preco.price + opcoes + extras);
  return {
    minimo: transfer + experiencias,
    carro: preco.price,
    opcoes,
    extras,
    experiencias,
    distancia,
    snapshot: { model: preco.model, distance: Math.round(distancia * 10) / 10, car: preco.price, ...(preco.legs ? { legs: preco.legs } : {}) },
  };
}

type Experiencia = NonNullable<Doc<"orders">["pendingCheckoutExperiences"]>[number];

/* O mínimo de uma experiência juntada no checkout. Num caso que o servidor
   não saiba calcular (produto entretanto apagado), conta zero: o pagamento
   não se bloqueia por isso — o mínimo é um limite de baixo, não o preço. */
async function minimoDaExperiencia(ctx: QueryCtx, x: Experiencia): Promise<number> {
  const pessoas = Math.max(1, x.passengers);
  const extras = (x.selectedAddons ?? []).map((a) => ({ addonId: a.addonId, universalAddonId: a.universalAddonId }));
  try {
    if (x.tourId) {
      const p = await precoDaReserva(ctx, { tourId: x.tourId, passengers: pessoas, extras });
      return p.basePrice + p.addonsTotal;
    }
    if (x.eventId) {
      /* O checkout do transfer não guarda se o evento foi partilhado ou
         privado: conta o mais barato dos dois. */
      const opcoes = await Promise.all(
        (["private", "shared"] as const).map(async (m) => {
          try {
            const p = await precoDaReserva(ctx, { eventId: x.eventId, passengers: pessoas, sharingMode: m, extras });
            return p.basePrice + p.addonsTotal;
          } catch {
            return Infinity;
          }
        }),
      );
      const min = Math.min(...opcoes);
      return Number.isFinite(min) ? min : 0;
    }
    if (x.upsellStopId) {
      const s = await ctx.db.get(x.upsellStopId);
      return s ? Math.min(s.price15 ?? s.price30, s.price30) : 0;
    }
    if (x.upsellExperienceId) {
      const e = await ctx.db.get(x.upsellExperienceId);
      return e ? e.basePrice * (e.pricingModel === "perPerson" ? pessoas : 1) : 0;
    }
  } catch {
    return 0;
  }
  return 0;
}
