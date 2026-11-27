"use client"

import { User, Briefcase, Wifi, Lock, Leaf, Info } from "lucide-react"
import Image from "next/image"
import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { calculatePriceBreakdown } from "@/lib/format"
import { VehicleInfoTooltip } from "@/components/customizable-checkout/vehicle-info-tooltip"

interface Vehicle {
  id: string
  name: string
  examples?: string
  price: number
  pricePerKm?: number
  hasDistance?: boolean
  image: string
  passengers: number
  luggage: number
  isElectric: boolean
  hasWifi?: boolean
}

interface VehicleCardProps {
  vehicle: Vehicle
  onSelect?: (vehicle: Vehicle) => void
  /** When true (round trip), show half of the computed trip price (outbound only). */
  isRoundTrip?: boolean
}

export function VehicleCard({ vehicle, onSelect, isRoundTrip = false }: VehicleCardProps) {
  const t = useTranslations("vehicle")
  const tCommon = useTranslations("common")
  const [showInfo, setShowInfo] = useState(false)

  // For round trips, vehicle.price is the total for both legs.
  // In the checkout UI we always display the one-way price (outbound only),
  // so divide by 2 for round trips.
  /* O cartão mostrava metade do preço da ida e volta, e metade de uma ida e
     volta não é uma ida: a taxa noturna e a sobretaxa de aeroporto cobram-se
     uma vez, não por perna. Numa partida à noite, Ericeira–Lisboa, o cartão
     dizia 46 €, a factura fechava em 92 € e tirar a volta dava 51 € — três
     números diferentes para o cliente, e nenhum deles errado por si só.
     Passa a mostrar o que se vai pagar, dito com todas as letras. */
  const priceBreakdown = useMemo(
    () => calculatePriceBreakdown(vehicle.price),
    [vehicle.price]
  )

  const hasDistance = vehicle.hasDistance ?? vehicle.price > 0
  const displayPrice = priceBreakdown.total.toFixed(2).replace(".", ",")
  const pricePerKm = vehicle.pricePerKm?.toFixed(2).replace(".", ",") ?? "0,00"

  return (
    <div 
      className="checkout-vehicle-card rounded-2xl md:rounded-xl pt-4 pb-2 px-4 md:p-5 shadow-xs border md:border-2 md:min-h-[285px] relative overflow-hidden"
      style={{
        backgroundColor: "var(--theme-checkout-vehicle-card-bg, #FFFFFF)",
        borderColor: "var(--theme-checkout-vehicle-card-border, #DEDEDE)",
      }}
    >
      {vehicle.isElectric && (
        <div className="absolute left-0 top-3.5 z-10">
          <div 
            className="inline-flex items-center gap-1.5 justify-between pl-2 pr-2 md:pl-3 md:pr-5 py-1 rounded-r-full text-xs md:text-sm font-medium"
            style={{
              backgroundColor: "var(--theme-checkout-vehicle-electric-badge-bg, #ABEDD5)",
              color: "var(--theme-checkout-vehicle-electric-badge-text, #008354)",
            }}
          >
            {t("electric")}
            <Leaf className="size-3.5 md:size-4" />
          </div>
        </div>
      )}

      <div className="hidden md:flex h-full items-stretch justify-between gap-2">
        <div className="flex-1 flex flex-col justify-between">
          <div className={`relative mb-2 h-[120px] bg-transparent rounded-lg flex items-start justify-start ${vehicle.isElectric ? "mt-5 md:mt-8" : "md:mt-5"}`}>
            <Image
              src={vehicle.image || "/shared/placeholder-experience.webp"}
              alt={vehicle.name}
              width={240}
              height={120}
              className="w-auto h-full object-contain"
            />
          </div>

          <div className="mt-auto">
            <div className="flex items-center mb-2 gap-2">
              <h3 
                className="text-xl font-bold"
                style={{ color: "var(--theme-checkout-vehicle-card-title, #222222)" }}
              >
                {vehicle.name}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <div 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl"
                style={{ backgroundColor: "var(--theme-checkout-vehicle-card-badge-bg, #E9F9FF)" }}
              >
                <User 
                  className="w-4 h-4"
                  style={{ color: "var(--theme-checkout-vehicle-card-badge-icon, #0E4659)" }}
                />
                <span 
                  className="text-sm font-semibold"
                  style={{ color: "var(--theme-checkout-vehicle-card-badge-text, #0E4659)" }}
                >
                  {vehicle.passengers}
                </span>
              </div>
              <div 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl"
                style={{ backgroundColor: "var(--theme-checkout-vehicle-card-badge-bg, #E9F9FF)" }}
              >
                <Briefcase 
                  className="w-4 h-4"
                  style={{ color: "var(--theme-checkout-vehicle-card-badge-icon, #0E4659)" }}
                />
                <span 
                  className="text-sm font-semibold"
                  style={{ color: "var(--theme-checkout-vehicle-card-badge-text, #0E4659)" }}
                >
                  {vehicle.luggage}
                </span>
              </div>
              {vehicle.hasWifi && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl"
                  style={{ backgroundColor: "var(--theme-checkout-vehicle-card-badge-bg, #E9F9FF)" }}
                >
                  <Wifi
                    className="w-4 h-4"
                    style={{ color: "var(--theme-checkout-vehicle-card-badge-icon, #0E4659)" }}
                  />
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--theme-checkout-vehicle-card-badge-text, #0E4659)" }}
                  >
                    {tCommon("yes")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <div className="text-right">
            {hasDistance ? (
              <>
                <div 
                  className="flex items-baseline justify-end gap-1 text-2xl font-bold leading-none"
                  style={{ color: "var(--theme-checkout-vehicle-card-price, #000000)" }}
                >
                  <span className="leading-none">€</span>
                  <span className="leading-none">{displayPrice}</span>
                </div>
                <div 
                  className="text-sm mt-0.5 mb-1.5"
                  style={{ color: "var(--theme-checkout-vehicle-card-price-subtext, #A0A0A0)" }}
                >
                  {isRoundTrip ? t("vatIncludedRoundTrip") : t("vatIncluded")}
                </div>
              </>
            ) : (
              <>
                <div 
className="flex items-baseline justify-end gap-1 text-2xl font-bold leading-none"
                  style={{ color: "var(--theme-checkout-vehicle-card-price, #000000)" }}
                >
                  <span className="leading-none">€</span>
                  <span className="leading-none">{pricePerKm}</span>
                  <span
                    className="text-base font-normal"
                    style={{ color: "var(--theme-checkout-vehicle-card-price-subtext, #A0A0A0)" }}
                  >
                    /km
                  </span>
                </div>
                <div 
                  className="text-sm mt-0.5 mb-1.5"
                  style={{ color: "var(--theme-checkout-vehicle-card-price-subtext, #A0A0A0)" }}
                >
                  {t("selectRouteForPrice")}
                </div>
              </>
            )}
            <div 
              className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full"
              style={{ 
                backgroundColor: "var(--theme-checkout-vehicle-card-badge-bg, #E9F9FF)",
                color: "var(--theme-checkout-vehicle-card-badge-text, #0E4659)"
              }}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{t("fixedPriceGuaranteed")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={`md:hidden flex flex-col ${vehicle.isElectric ? "mt-2" : ""}`}>
        <div className="flex items-center justify-between pt-4">
          <div className="relative w-[150px] h-[95px] bg-transparent rounded-lg flex items-center justify-center shrink-0">
            <Image
              src={vehicle.image || "/shared/placeholder-experience.webp"}
              alt={vehicle.name}
              width={240}
              height={120}
              className="w-auto h-full object-contain"
            />
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              {hasDistance ? (
                <>
                  <div
                    className="text-xl font-bold leading-none"
                    style={{ color: "var(--theme-checkout-vehicle-card-price, #000000)" }}
                  >
                    € {displayPrice}
                  </div>
                  <div 
                    className="text-xs mt-1"
                    style={{ color: "var(--theme-checkout-vehicle-card-price-subtext, #A0A0A0)" }}
                  >
                    {isRoundTrip ? t("vatIncludedRoundTrip") : t("vatIncluded")}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="text-lg font-bold leading-none"
                    style={{ color: "var(--theme-checkout-vehicle-card-price, #000000)" }}
                  >
                    € {pricePerKm}
                    <span
                      className="text-sm font-normal"
                      style={{ color: "var(--theme-checkout-vehicle-card-price-subtext, #A0A0A0)" }}
                    >
                      /km
                    </span>
                  </div>
                  <div
                    className="text-xs mt-1"
                    style={{ color: "var(--theme-checkout-vehicle-card-price-subtext, #A0A0A0)" }}
                  >
                    {t("selectRouteForPrice")}
                  </div>
                </>
              )}
            </div>
            <div
              className="inline-flex items-center gap-1.5 text-[11px] pl-2 pr-4 py-1.5 rounded-lg"
              style={{
                backgroundColor: "var(--theme-checkout-vehicle-card-badge-bg, #E9F9FF)",
                color: "var(--theme-checkout-vehicle-card-badge-text, #0E4659)"
              }}
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="uppercase whitespace-nowrap">{t("fixedPriceGuaranteed")}</span>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between mt-2">
          <div>
            <div className="flex items-center mb-2 gap-2">
              <h3 
                className="text-base font-bold tracking-wide"
                style={{ color: "var(--theme-checkout-vehicle-card-title, #222222)" }}
              >
                {vehicle.name}
              </h3>
            </div>

            <div className="flex items-center gap-1">
              <div 
                className="flex items-center gap-1 pl-2 pr-2 py-1 rounded-2xl"
                style={{ backgroundColor: "var(--theme-checkout-vehicle-card-badge-bg, #E9F9FF)" }}
              >
                <User 
                  className="w-4 h-4"
                  style={{ color: "var(--theme-checkout-vehicle-card-badge-icon, #0E4659)" }}
                />
                <span 
                  className="text-sm font-medium"
                  style={{ color: "var(--theme-checkout-vehicle-card-badge-text, #0E4659)" }}
                >
                  {vehicle.passengers}
                </span>
              </div>
              <div 
                className="flex items-center gap-1 pl-2 pr-2 py-1 rounded-2xl"
                style={{ backgroundColor: "var(--theme-checkout-vehicle-card-badge-bg, #E9F9FF)" }}
              >
                <Briefcase 
                  className="w-4 h-4"
                  style={{ color: "var(--theme-checkout-vehicle-card-badge-icon, #0E4659)" }}
                />
                <span 
                  className="text-sm font-medium"
                  style={{ color: "var(--theme-checkout-vehicle-card-badge-text, #0E4659)" }}
                >
                  {vehicle.luggage}
                </span>
              </div>
              {vehicle.hasWifi && (
                <div
                  className="flex items-center gap-1 pl-2 pr-2 py-1 rounded-2xl"
                  style={{ backgroundColor: "var(--theme-checkout-vehicle-card-badge-bg, #E9F9FF)" }}
                >
                  <Wifi
                    className="w-4 h-4"
                    style={{ color: "var(--theme-checkout-vehicle-card-badge-icon, #0E4659)" }}
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--theme-checkout-vehicle-card-badge-text, #0E4659)" }}
                  >
                    {tCommon("yes")}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowInfo(true) }}
              className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:brightness-90 focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{
                backgroundColor: "var(--theme-checkout-primary-button-bg, #27C7FF)",
                color: "var(--theme-checkout-primary-button-text, #FFFFFF)"
              }}
              aria-label={t("included")}
            >
              <Info className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <button
              onClick={() => onSelect?.(vehicle)}
              className="font-bold py-2.5 px-3 rounded-lg text-xs transition-colors uppercase tracking-wide hover:brightness-90"
              style={{
                backgroundColor: "var(--theme-checkout-primary-button-bg, #27C7FF)",
                color: "var(--theme-checkout-primary-button-text, #FFFFFF)"
              }}
            >
              {tCommon("select").toUpperCase()}
            </button>
          </div>
        </div>
      </div>

      <div
        className="hidden md:flex flex-col items-end gap-1.5 absolute bottom-[22px] right-5"
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowInfo(true) }}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:brightness-90 focus:outline-none focus:ring-2 focus:ring-offset-1"
          style={{
            backgroundColor: "var(--theme-checkout-primary-button-bg, #27C7FF)",
            color: "var(--theme-checkout-primary-button-text, #FFFFFF)"
          }}
          aria-label={t("included")}
        >
          <Info className="w-4 h-4" strokeWidth={2.5} />
        </button>
        <button
          onClick={() => onSelect?.(vehicle)}
          className="font-bold py-3 px-2.5 rounded-lg text-sm transition-colors uppercase tracking-wide shadow-sm hover:brightness-90"
          style={{
            backgroundColor: "var(--theme-checkout-primary-button-bg, #27C7FF)",
            color: "var(--theme-checkout-primary-button-text, #FFFFFF)"
          }}
        >
          {tCommon("select").toUpperCase()}
        </button>
      </div>

      {showInfo && (
        <VehicleInfoTooltip vehicleName={vehicle.name} examples={vehicle.examples} onClose={() => setShowInfo(false)} />
      )}
    </div>
  )
}
