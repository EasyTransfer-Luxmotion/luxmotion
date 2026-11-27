"use client"

import { Users, Briefcase, Wifi, ShieldCheck, Info, Zap, Check } from "lucide-react"
import Image from "next/image"
import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { calculatePriceBreakdown } from "@/lib/format"
import { VehicleInfoTooltip } from "@/components/checkout/vehicle-info-tooltip"
import { cn } from "@workspace/ui/lib/utils"

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
}

interface VehicleCardProps {
  vehicle: Vehicle
  onSelect?: (vehicle: Vehicle) => void
  isRoundTrip?: boolean
  selected?: boolean
}

export function VehicleCard({ vehicle, onSelect, isRoundTrip = false, selected = false }: VehicleCardProps) {
  const t = useTranslations("vehicle")
  const tCommon = useTranslations("common")
  const [showInfo, setShowInfo] = useState(false)

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
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(vehicle)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect?.(vehicle)
        }
      }}
      className={cn(
        "relative flex flex-col gap-[10px] pt-6 pb-4 px-4 border transition-colors cursor-pointer",
        selected
          ? "bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.07)] border-[var(--ck-accent,#c9a96e)]"
          : "bg-[var(--ck-surface,#1e1d1b)] border-[var(--ck-border,rgba(var(--ck-text-rgb,255,255,255),0.12))] hover:border-[rgba(var(--ck-accent-rgb,201,169,110),0.4)]"
      )}
    >
      {vehicle.isElectric && (
        <div className="absolute left-[7px] top-[7px] flex items-center gap-[2px] bg-[rgba(46,125,82,0.08)] border border-[rgba(46,125,82,0.2)] pl-[5px] pr-[5px] py-[3px]">
          <span className="text-[12px] font-bold tracking-[0.528px] uppercase text-[#2E7D52] leading-none px-[4px]">
            {t("electric")}
          </span>
          <Zap className="size-[14px] text-[#2E7D52] fill-[#2E7D52]" strokeWidth={1.5} />
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setShowInfo(true)
        }}
        aria-label={t("included")}
        className={cn(
          "absolute right-0 top-0 p-[10px] transition-colors hover:text-[var(--ck-accent,#c9a96e)]",
          selected ? "text-[var(--ck-accent,#c9a96e)]" : "text-[rgba(var(--ck-text-rgb,247,244,239),0.55)]"
        )}
      >
        <Info className="size-6" strokeWidth={1.5} />
      </button>

      <div className="relative h-[92px] w-full overflow-hidden">
        <Image
          src={vehicle.image || "/shared/placeholder-experience.webp"}
          alt={vehicle.name}
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          className="object-contain object-center"
        />
      </div>

      <div className="flex items-start justify-between w-full">
        <h3 className="text-[16px] font-bold text-[var(--ck-text,#f7f4ef)] leading-[21.76px]">
          {vehicle.name}
        </h3>
        <div className="flex flex-col items-end">
          {hasDistance ? (
            <>
              <p className="text-[20px] font-bold text-[var(--ck-text,#f7f4ef)] leading-[28.16px] text-right">
                €{displayPrice}
              </p>
              <p className="text-[8px] text-[rgba(var(--ck-text-rgb,247,244,239),0.38)] leading-[14.85px] text-right">
                {isRoundTrip ? t("vatIncludedRoundTrip") : t("vatIncluded")}
              </p>
            </>
          ) : (
            <>
              <p className="text-[20px] font-bold text-[var(--ck-text,#f7f4ef)] leading-[28.16px] text-right whitespace-nowrap">
                €{pricePerKm}
                <span className="text-[12px] text-[rgba(var(--ck-text-rgb,247,244,239),0.38)] font-normal">/km</span>
              </p>
              <p className="text-[8px] text-[rgba(var(--ck-text-rgb,247,244,239),0.38)] leading-[14.85px] text-right">
                {t("selectRouteForPrice")}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-[8px] w-full">
        <Users className="size-[18px] text-[var(--ck-text-muted,#999999)]" strokeWidth={1.5} />
        <span className="text-[14px] text-[var(--ck-text-muted,#999999)] leading-none">{vehicle.passengers}</span>
        <Briefcase className="size-[18px] text-[var(--ck-text-muted,#999999)] ml-1" strokeWidth={1.5} />
        <span className="text-[14px] text-[var(--ck-text-muted,#999999)] leading-none">{vehicle.luggage}</span>
        <Wifi className="size-[18px] text-[var(--ck-text-muted,#999999)] ml-1" strokeWidth={1.5} />
        <span className="text-[14px] text-[var(--ck-text-muted,#999999)] leading-none">{tCommon("yes")}</span>
      </div>

      <div className="flex items-center gap-[4px] w-full">
        <ShieldCheck className="size-[14px] text-[var(--ck-accent-strong,#9a7535)]" strokeWidth={1.5} />
        <span className="text-[8px] font-normal uppercase text-[var(--ck-accent-strong,#9a7535)] leading-none tracking-[0.3px]">
          {t("fixedPriceGuaranteed")}
        </span>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.(vehicle)
        }}
        className={cn(
          "group flex items-center p-[10px] border w-full transition-colors",
          selected
            ? "border-[var(--ck-accent,#c9a96e)] bg-[rgba(var(--ck-accent-rgb,201,169,110),0.08)]"
            : "border-[var(--ck-border,rgba(var(--ck-text-rgb,255,255,255),0.12))] hover:border-[rgba(var(--ck-accent-rgb,201,169,110),0.4)] hover:bg-[rgba(var(--ck-accent-rgb,201,169,110),0.04)]"
        )}
      >
        <div
          className={cn(
            "size-[15px] rounded-[2px] border-[0.833px] flex items-center justify-center shrink-0 transition-colors",
            selected
              ? "border-[var(--ck-accent,#c9a96e)] bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.22)]"
              : "border-[var(--ck-border,rgba(var(--ck-text-rgb,255,255,255),0.12))] group-hover:border-[rgba(var(--ck-accent-rgb,201,169,110),0.5)]"
          )}
        >
          {selected && <Check className="size-[10px] text-[var(--ck-accent,#c9a96e)]" strokeWidth={3} />}
        </div>
        <span
          className={cn(
            "text-[12px] font-semibold uppercase leading-none px-[8px] transition-colors",
            selected ? "text-[var(--ck-accent,#c9a96e)]" : "text-[var(--ck-text-subtle,#696969)] group-hover:text-[var(--ck-accent,#c9a96e)]"
          )}
        >
          {selected ? tCommon("selected") : tCommon("select")}
        </span>
      </button>

      {showInfo && (
        <VehicleInfoTooltip vehicleName={vehicle.name} examples={vehicle.examples} onClose={() => setShowInfo(false)} />
      )}
    </div>
  )
}
