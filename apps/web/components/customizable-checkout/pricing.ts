import { calculateTotalChildSeats } from "@/lib/format"
import type { ExtraPrices } from "@/hooks/use-site-settings"

/**
 * Single source of truth for the customizable-checkout add-on prices.
 *
 * These prices used to be duplicated in three places — the option cards (hardcoded
 * strings), the order summary (invoice), and the payment charge — which drifted apart
 * and caused real-money bugs (refund terms shown at €4 but charged at €5; surfboards
 * shown but never charged). Every one of those places now reads from here, so the
 * displayed invoice and the charged amount can never diverge again.
 *
 * Values are the ONE-WAY euro amounts; a round trip pays ×2 (the transfer runs both ways).
 */
export const INSURANCE_PRICE = {
  premiumInsurance: 9,
  refundTerms: 4,
  comfortConnection: 7,
} as const

export type InsuranceKey = keyof typeof INSURANCE_PRICE

/* The per-unit prices of the luggage extras come from Configurações → Preços
   (useExtraPrices); the server's payment check uses the same numbers. */

export function insurancePrice(key: InsuranceKey, isRoundTrip: boolean): number {
  return INSURANCE_PRICE[key] * (isRoundTrip ? 2 : 1)
}

type ExtrasSelection = {
  childSeats: { baby: number; child: number; booster: number }
  surfboardChecked: boolean
  surfboard: { standard: number; upgraded: number }
  petChecked: boolean
  pet: { small: number; large: number }
}

/** Luggage extras breakdown + total, shared by the summary (line items) and the charge. */
export function calcExtras(transfer: ExtrasSelection, isRoundTrip: boolean, prices: ExtraPrices) {
  const multiplier = isRoundTrip ? 2 : 1
  const childSeats = calculateTotalChildSeats(transfer.childSeats)
  const surfboards = transfer.surfboardChecked
    ? transfer.surfboard.standard + transfer.surfboard.upgraded
    : 0
  const pets = transfer.petChecked ? transfer.pet.small + transfer.pet.large : 0
  const childSeatsCost = childSeats * prices.childSeat * multiplier
  const surfboardsCost = surfboards * prices.surfboard * multiplier
  const petsCost = pets * prices.pet * multiplier
  return {
    childSeats,
    surfboards,
    pets,
    childSeatsCost,
    surfboardsCost,
    petsCost,
    total: childSeatsCost + surfboardsCost + petsCost,
  }
}
