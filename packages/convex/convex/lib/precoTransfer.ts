import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { haversineKm } from "./geo";
import { isNightDeparture, priceVehicle } from "./pricing";
import { precoDaReserva } from "./precoTours";
import { siteSettingsDefaults } from "../siteSettings";

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
const EXTRA = { cadeira: 5, prancha: 5, animal: 10 };

/* Os aeroportos de apps/web/lib/airport.ts: o mesmo critério que o checkout
   usa para a sobretaxa — perto de um aeroporto, o placeId dele, ou a palavra
   "aeroporto" no texto. */
const AEROPORTOS = [
  { placeId: "ChIJgwHZFkYyGQ0RRm0DWD6lZgo", lat: 38.7788454, lng: -9.1319758 },
  { placeId: "ChIJrStKYWRvJA0R0TlgbYpXGhU", lat: 41.2473992, lng: -8.6806638 },
  { placeId: "ChIJm5mnTbBSBQ0RRztnYx5VRCE", lat: 37.0165746, lng: -7.9705537 },
  { placeId: "ChIJ6xlRBVRiYAwR7cmGjBb7wVY", lat: 32.6975155, lng: -16.774145 },
  { placeId: "ChIJ-QPpnfoqQwsR1yGd6x257gU", lat: 37.7493461, lng: -25.7103849 },
  { placeId: "ChIJn3CH1mjPHg0RCIXOSj2NWKY", lat: 38.7247009, lng: -9.3534113 },
];
const PALAVRAS_AEROPORTO = ["airport", "aeroporto", "aeropuerto", "aéroport", "aeroport", "flughafen", "luchthaven", "vliegveld", "lufthavn", "flygplats", "lentoasema", "lotnisko", "letiště", "letiste", "havalimanı", "havalimani", "repülőtér", "aerodrom"];

type Local = { location: string; placeId?: string; lat?: number; lng?: number } | undefined;

export function eAeroporto(l: Local): boolean {
  if (!l) return false;
  if (typeof l.lat === "number" && typeof l.lng === "number" && AEROPORTOS.some((a) => haversineKm(l as { lat: number; lng: number }, a) <= 2)) return true;
  if (l.placeId && AEROPORTOS.some((a) => a.placeId === l.placeId)) return true;
  const t = l.location.toLowerCase();
  return PALAVRAS_AEROPORTO.some((p) => t.includes(p));
}

/** O ajuste de preço de um parceiro sobre a frota (partnerships.ajustePreco, em %). */
export function factorDoParceiro(p: Pick<Doc<"partnerships">, "ajustePreco"> | null | undefined): number {
  const a = p?.ajustePreco ?? 0;
  return Number.isFinite(a) ? 1 + a / 100 : 1;
}

/* Ao cêntimo: 57 × 1,1 dava 62,699999… no checkout. */
export function comAjuste(valor: number, f: number): number {
  return f === 1 ? valor : Math.round(valor * f * 100) / 100;
}

export async function minimoDoTransfer(
  ctx: QueryCtx,
  ida: Doc<"orders">,
  volta: Doc<"orders"> | null,
  /* Os escolhidos agora: na order só ficam gravados depois de se aceitar o pagamento. */
  opcoesEscolhidas: { code: string }[],
) {
  if (!ida.vehicleId) throw new ConvexError("Escolha um carro antes de pagar.");
  const carro = await ctx.db.get(ida.vehicleId);
  if (!carro) throw new ConvexError("O carro escolhido já não existe. Volte atrás e escolha outro.");
  const parceria = ida.partnershipId ? await ctx.db.get(ida.partnershipId) : null;
  const f = factorDoParceiro(parceria);

  const temCoordenadas = (l: Local): l is { location: string; lat: number; lng: number } => typeof l?.lat === "number" && typeof l?.lng === "number";
  const recta = temCoordenadas(ida.departure) && temCoordenadas(ida.arrival) ? haversineKm(ida.departure, ida.arrival) : 0;
  const distancia = Math.max(ida.distance ?? 0, recta);

  const definicoes = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", "global")).first();
  const preco = priceVehicle({
    pricePerKm: comAjuste(carro.pricePerKm, f),
    minimumPrice: comAjuste(carro.minimumPrice, f),
    distance: distancia,
    isNight: isNightDeparture(ida.departureDate),
    isNightReturn: volta ? isNightDeparture(volta.departureDate) : false,
    bookReturn: Boolean(volta),
    isAirportPickup: eAeroporto(ida.departure),
    airportSurchargePercent: definicoes?.airportSurchargePercent ?? siteSettingsDefaults.airportSurchargePercent,
  });

  const vezes = volta ? 2 : 1;
  const opcoes = opcoesEscolhidas.reduce((t, o) => t + (OPCOES_MINIMO[o.code] ?? 0) * vezes, 0);
  const cadeiras = (ida.childSeats ?? 0) + (ida.babySeats ?? 0) + (ida.boosterSeats ?? 0);
  const pranchas = (ida.standardSurfboards ?? 0) + (ida.largeSurfboards ?? 0);
  const animais = (ida.smallPets ?? 0) + (ida.largePets ?? 0);
  const extras = (cadeiras * EXTRA.cadeira + pranchas * EXTRA.prancha + animais * EXTRA.animal) * vezes;

  let experiencias = 0;
  for (const x of ida.pendingCheckoutExperiences ?? []) experiencias += await minimoDaExperiencia(ctx, x);

  const transfer = Math.ceil(preco.price + opcoes + extras);
  return { minimo: transfer + experiencias, carro: preco.price, opcoes, extras, experiencias, distancia };
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
