"use client"

import { useMemo } from "react"
import { useQueries } from "convex/react"
import { api } from "@workspace/convex/api"
import { DEFAULT_RATES, type ExchangeRates } from "@/lib/currency"
import { AIRPORT_SURCHARGE_PERCENT } from "@/lib/airport"

/**
 * Fallback for the /tours/results proximity search, used until the backend
 * answers (and if `siteSettings.get` isn't deployed). Must match
 * `siteSettingsDefaults.toursSearchRadiusKm` in the Convex package.
 */
export const DEFAULT_TOURS_SEARCH_RADIUS_KM = 10

/**
 * Fallback for the tours and events offered during checkout. 30 is the value
 * that used to be hardcoded in the backend. Must match
 * `siteSettingsDefaults.checkoutToursRadiusKm`.
 */
export const DEFAULT_CHECKOUT_TOURS_RADIUS_KM = 30

/**
 * Fallback for the checkout upsells (extra stops and experiences offered around
 * the drop-off). Must match `siteSettingsDefaults.checkoutUpsellRadiusKm`.
 */
export const DEFAULT_CHECKOUT_UPSELL_RADIUS_KM = 50

export type SiteSettings = {
  minAdvanceBookingHours: number
  announcementsEnabled: boolean
  announcements: string[]
  exchangeRates: ExchangeRates
  airportSurchargePercent: number
  toursSearchRadiusKm: number
  checkoutToursRadiusKm: number
  checkoutUpsellRadiusKm: number
  /** Luggage extras, euros per unit and per leg (Configurações → Preços). */
  extraPrices: ExtraPrices
}

export type ExtraPrices = { childSeat: number; surfboard: number; pet: number }

/* Until the backend answers. Must match PRICING_DEFAULTS.extras in the
   Convex package (lib/pricing.ts), the defaults of the pricing sheet. */
export const DEFAULT_EXTRA_PRICES: ExtraPrices = { childSeat: 5, surfboard: 5, pet: 15 }

const DEFAULTS: SiteSettings = {
  minAdvanceBookingHours: 2,
  announcementsEnabled: false,
  announcements: [],
  exchangeRates: DEFAULT_RATES,
  airportSurchargePercent: AIRPORT_SURCHARGE_PERCENT,
  toursSearchRadiusKm: DEFAULT_TOURS_SEARCH_RADIUS_KM,
  checkoutToursRadiusKm: DEFAULT_CHECKOUT_TOURS_RADIUS_KM,
  checkoutUpsellRadiusKm: DEFAULT_CHECKOUT_UPSELL_RADIUS_KM,
  extraPrices: DEFAULT_EXTRA_PRICES,
}

/**
 * Reads the global `siteSettings` singleton SAFELY.
 *
 * Uses `useQueries` (not `useQuery`) on purpose: if `siteSettings.get` isn't
 * deployed on the backend yet — e.g. the Vercel frontend went live before
 * `npx convex deploy` ran — the result comes back as an Error VALUE instead of a
 * thrown exception, so callers fall back to defaults instead of crashing the app.
 *
 * The queries object MUST be memoized (an inline object every render re-subscribes
 * and loops → React #301), and the mapped result is memoized so its identity is
 * stable while the underlying data is unchanged (safe to use as an effect dep).
 */
export function useSiteSettings(): SiteSettings {
  const queries = useMemo(
    () => ({ siteSettings: { query: api.siteSettings.get, args: {} } }),
    [],
  )
  const results = useQueries(queries)
  const raw = results.siteSettings
  return useMemo(() => {
    const r = raw as Partial<SiteSettings> | Error | undefined
    if (!r || r instanceof Error) return DEFAULTS
    return {
      minAdvanceBookingHours:
        typeof r.minAdvanceBookingHours === "number"
          ? r.minAdvanceBookingHours
          : DEFAULTS.minAdvanceBookingHours,
      announcementsEnabled: r.announcementsEnabled ?? false,
      announcements: r.announcements ?? [],
      exchangeRates: r.exchangeRates ?? DEFAULT_RATES,
      airportSurchargePercent:
        r.airportSurchargePercent ?? DEFAULTS.airportSurchargePercent,
      toursSearchRadiusKm:
        readRadius(r, "toursSearchRadiusKm") ?? DEFAULTS.toursSearchRadiusKm,
      checkoutToursRadiusKm:
        readRadius(r, "checkoutToursRadiusKm") ??
        DEFAULTS.checkoutToursRadiusKm,
      checkoutUpsellRadiusKm:
        readRadius(r, "checkoutUpsellRadiusKm") ??
        DEFAULTS.checkoutUpsellRadiusKm,
      extraPrices: r.extraPrices ?? DEFAULT_EXTRA_PRICES,
    }
  }, [raw])
}

/** The luggage extras' prices; the payment check uses the same ones. */
export function useExtraPrices(): ExtraPrices {
  return useSiteSettings().extraPrices
}

type RadiusKey =
  | "toursSearchRadiusKm"
  | "checkoutToursRadiusKm"
  | "checkoutUpsellRadiusKm"

function readRadius(
  r: Partial<SiteSettings> | Error | undefined,
  key: RadiusKey,
): number | undefined {
  if (!r) return undefined
  if (r instanceof Error) return undefined
  const value = r[key]
  return typeof value === "number" && value > 0 ? value : undefined
}

/**
 * A subscrição crua a `siteSettings.get`.
 *
 * IMPORTANTE: um componente só pode ter UMA destas. Duas subscrições à mesma
 * query no mesmo componente entram em ciclo infinito de renders ("Too many
 * re-renders") — cada `QueriesObserver` reage à transição do outro. Foi por isso
 * que os dois raios do checkout se lêem juntos, num único hook, em vez de um
 * hook por raio.
 */
function useSiteSettingsRaw() {
  const queries = useMemo(
    () => ({ siteSettings: { query: api.siteSettings.get, args: {} } }),
    [],
  )
  return useQueries(queries).siteSettings as
    | Partial<SiteSettings>
    | Error
    | undefined
}

/**
 * Raio da pesquisa por proximidade em /tours/results.
 *
 * `undefined` enquanto `siteSettings.get` não responde, para quem pesquisa poder
 * adiar a query em vez de a lançar com o valor por omissão e ter de a repetir (e
 * piscar o skeleton) assim que o valor real chega.
 */
export function useToursSearchRadiusKm(): number | undefined {
  const raw = useSiteSettingsRaw()
  return useMemo(() => {
    if (raw === undefined) return undefined
    return (
      readRadius(raw, "toursSearchRadiusKm") ?? DEFAULT_TOURS_SEARCH_RADIUS_KM
    )
  }, [raw])
}

/**
 * Os dois raios do checkout, de uma só subscrição — ver o aviso em
 * `useSiteSettingsRaw`. `undefined` enquanto não há resposta.
 */
export function useCheckoutRadiiKm(): {
  toursKm: number | undefined
  upsellKm: number | undefined
} {
  const raw = useSiteSettingsRaw()
  return useMemo(() => {
    if (raw === undefined) return { toursKm: undefined, upsellKm: undefined }
    return {
      toursKm:
        readRadius(raw, "checkoutToursRadiusKm") ??
        DEFAULT_CHECKOUT_TOURS_RADIUS_KM,
      upsellKm:
        readRadius(raw, "checkoutUpsellRadiusKm") ??
        DEFAULT_CHECKOUT_UPSELL_RADIUS_KM,
    }
  }, [raw])
}
