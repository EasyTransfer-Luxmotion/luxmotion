"use client"

import Image from "next/image"
import { Search, Info, Backpack, Luggage, Briefcase, Plus, X, ArrowLeft, ArrowRight, Minus, PlaneLanding, Clock, MapPin, Users, Baby, ChevronRight, Dog, CircleAlert } from "lucide-react"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { DateTimePicker } from "@/components/checkout/date-time-picker"
import { AnimatedCollapse } from "@/components/checkout/shared"
import { useTranslations } from "next-intl"
import { insurancePrice, calcExtras } from "@/components/checkout/pricing"
import { useCheckout } from "@/components/checkout/checkout-context"
import { useCheckoutTheme } from "@/components/checkout/checkout-theme"
import { GooglePlacesInput } from "@/components/ui/google-places-input"
import { initOrder, createReturnOrder, registTrip, selectCar, toBackendLocation, formatLocalDate, formatLocalDateTime, lookupFlight } from "@/lib/orders"
import { readReferralCookie } from "@/lib/referral"
import { useState, useMemo, type ReactNode, type ComponentType } from "react"
import { useConvex } from "convex/react"
import { calculatePriceBreakdown } from "@/lib/format"
import { api } from "@workspace/convex/api"
import { cn } from "@workspace/ui/lib/utils"
import { readAdSourceCookie, readOppref } from "@/lib/ad-source"

interface TransferInfoStepProps {
  onContinue: () => void
}

const SERIF_FONT = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[12px] font-bold text-[var(--ck-text-muted,#999)] uppercase tracking-[1.152px] mt-8 mb-3">
      {children}
    </div>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-[16px] font-bold text-[var(--ck-text,#f7f4ef)] mb-2">{children}</label>
  )
}

function DarkFieldBox({ children }: { children: ReactNode }) {
  return (
    <div className="h-12 bg-[var(--ck-surface,#1a1918)] border border-[rgba(var(--ck-text-rgb,255,255,255),0.06)] px-3 flex items-center [&>*]:min-w-0 [&>*]:flex-1 focus-within:border-[var(--ck-accent,#c9a96e)] transition-colors">
      {children}
    </div>
  )
}

function DarkCounter({
  value,
  onChange,
  min = 0,
  max = Infinity,
  className,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  className?: string
}) {
  return (
    <div className={cn("flex items-center", className)}>
      <button
        type="button"
        onClick={() => value > min && onChange(value - 1)}
        disabled={value <= min}
        className="w-8 h-8 flex items-center justify-center border-[1.5px] border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] text-[var(--ck-text,#f7f4ef)] hover:bg-[rgba(var(--ck-text-rgb,255,255,255),0.04)] disabled:text-[rgba(var(--ck-text-rgb,247,244,239),0.35)] disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
      >
        <Minus className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <div className="w-10 h-8 flex items-center justify-center border-y-[1.5px] border-[rgba(var(--ck-text-rgb,255,255,255),0.12)]">
        <span className={cn("text-[14px] font-medium tabular-nums", value > 0 ? "text-[var(--ck-text,#f7f4ef)]" : "text-[var(--ck-text-subtle,#696969)]")}>{value}</span>
      </div>
      <button
        type="button"
        onClick={() => value < max && onChange(value + 1)}
        disabled={value >= max}
        className="w-8 h-8 flex items-center justify-center border-[1.5px] border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] text-[var(--ck-text,#f7f4ef)] hover:bg-[rgba(var(--ck-text-rgb,255,255,255),0.04)] disabled:text-[rgba(var(--ck-text-rgb,247,244,239),0.35)] disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </div>
  )
}

function DarkInput({
  value,
  onChange,
  placeholder,
  leftIcon,
  rightAdornment,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  leftIcon?: ReactNode
  rightAdornment?: ReactNode
}) {
  return (
    <div className="relative">
      {leftIcon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ck-accent,#c9a96e)]">{leftIcon}</div>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full h-12 bg-[var(--ck-surface,#1a1918)] border border-[rgba(var(--ck-text-rgb,255,255,255),0.06)] text-[14px] text-[var(--ck-text,#f7f4ef)] placeholder:text-[var(--ck-text-subtle,#696969)]",
          "focus:outline-none focus:border-[var(--ck-accent,#c9a96e)] transition-colors",
          leftIcon ? "pl-10" : "pl-4",
          rightAdornment ? "pr-12" : "pr-4",
        )}
      />
      {rightAdornment && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightAdornment}</div>
      )}
    </div>
  )
}

function IconOptionCard({
  icon: Icon,
  iconImage,
  iconImageClassName,
  title,
  subtitle,
  badge,
  selected,
  children,
}: {
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>
  iconImage?: string
  iconImageClassName?: string
  title: string
  subtitle?: string
  badge?: string
  selected?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "relative border p-4 pt-8 md:pt-4 flex flex-col gap-2 items-center transition-colors",
        selected
          ? "bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.07)] border-[var(--ck-accent,#c9a96e)]"
          : "bg-[var(--ck-surface,#1a1918)] border-[rgba(var(--ck-text-rgb,255,255,255),0.06)]",
      )}
    >
      {badge && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-bold text-[var(--ck-accent-strong,#9a7535)] uppercase tracking-[0.72px]">
          <CircleAlert className="w-3 h-3" strokeWidth={1.8} />
          {badge}
        </span>
      )}
      <div className="flex items-center justify-center gap-2">
        {iconImage ? (
          <Image
            src={iconImage}
            alt=""
            width={24}
            height={24}
            className={cn("shrink-0 object-contain", iconImageClassName ?? "w-6 h-6")}
          />
        ) : Icon ? (
          <Icon className="w-6 h-6 text-[var(--ck-accent,#c9a96e)] shrink-0" strokeWidth={1.6} />
        ) : null}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[12px] font-bold text-[var(--ck-text,#f7f4ef)] leading-[19.2px]">{title}</span>
          {subtitle && (
            <span className="text-[10px] font-medium text-[rgba(var(--ck-text-rgb,247,244,239),0.38)] uppercase tracking-[0.1px] leading-[14.85px] whitespace-nowrap">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-center w-full mt-auto">
        {children}
      </div>
    </div>
  )
}

function ImageOptionCard({
  image,
  imageRotation,
  title,
  subtitle,
  badge,
  selected,
  children,
}: {
  image: string
  imageRotation?: string
  title: string
  subtitle?: string
  badge?: string
  selected?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "relative border p-4 flex flex-col gap-2 items-center transition-colors",
        selected
          ? "bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.07)] border-[var(--ck-accent,#c9a96e)]"
          : "bg-[var(--ck-surface,#1e1d1b)] border-[rgba(var(--ck-text-rgb,247,244,239),0.08)]",
      )}
    >
      {badge && (
        <span className="absolute top-3 right-3 text-[9px] font-bold text-[var(--ck-accent-strong,#9a7535)] uppercase tracking-[0.72px] z-10">
          {badge}
        </span>
      )}
      <div className="h-[88px] flex items-center justify-center overflow-hidden">
        <Image
          src={image}
          alt={title}
          width={140}
          height={88}
          className={cn(
            "max-h-full w-auto object-contain drop-shadow-[3px_4px_7px_rgba(0,0,0,0.25)]",
            imageRotation,
          )}
        />
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-[12px] font-bold text-[var(--ck-text,#f7f4ef)] leading-[19.2px]">{title}</span>
        {subtitle && (
          <span className="text-[10px] font-medium text-[rgba(var(--ck-text-rgb,247,244,239),0.38)] uppercase tracking-[0.1px] leading-[14.85px] whitespace-nowrap">
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex items-center justify-center w-full">
        {children}
      </div>
    </div>
  )
}

function FlightTimeline({
  arrivalTime,
  pickupTime,
}: {
  arrivalTime?: string | null
  pickupTime?: string | null
}) {
  const t = useTranslations("transfer")
  return (
    <div className="flex items-stretch gap-2 bg-[var(--ck-surface,#1a1918)] border border-[rgba(var(--ck-text-rgb,255,255,255),0.06)] px-4 py-3">
      <TimelineStop icon={PlaneLanding} time={arrivalTime} label={t("landing")} />
      <TimelineConnector />
      <TimelineStop icon={Clock} time={"00:30"} label={t("wait")} />
      <TimelineConnector />
      <TimelineStop icon={MapPin} time={pickupTime} label={t("landing")} align="end" />
    </div>
  )
}

function TimelineStop({
  icon: Icon,
  time,
  label,
  align = "start",
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  time?: string | null
  label: string
  align?: "start" | "center" | "end"
}) {
  const alignClass = align === "end" ? "items-end" : align === "center" ? "items-center" : "items-start"
  return (
    <div className={cn("flex flex-col min-w-[60px]", alignClass)}>
      <div className="w-8 h-8 border border-[rgba(var(--ck-accent-rgb,201,169,110),0.4)] flex items-center justify-center mb-1">
        <Icon className="w-4 h-4 text-[var(--ck-accent,#c9a96e)]" strokeWidth={1.6} />
      </div>
      <span className="text-[14px] font-bold text-[var(--ck-text,#f7f4ef)] tabular-nums leading-tight">{time || "--:--"}</span>
      <span className="text-[10px] text-[var(--ck-text-muted,#999)] uppercase tracking-[0.5px] mt-0.5">{label}</span>
    </div>
  )
}

function TimelineConnector() {
  return <div className="flex-1 border-t border-dashed border-[rgba(var(--ck-accent-rgb,201,169,110),0.4)] mt-4" />
}

function formatFlightTime(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function TransferInfoStep({ onContinue }: TransferInfoStepProps) {
  const t = useTranslations("transfer")
  const convex = useConvex()
  const tCommon = useTranslations("common")
  const { state, updateTransfer, setOrder, setStep, setUpgradeMode, setShowTransferForm } = useCheckout()
  // O DateTimePicker "new-widget" força tema escuro; passar o tema real do
  // checkout para o texto da data não ficar branco em light mode.
  const { theme: checkoutTheme } = useCheckoutTheme()
  const isDarkCheckout = checkoutTheme === "dark"
  const { transfer, selectedVehicle, distance, routeDuration, orderId, payment, experiences } = state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [flightSuccess, setFlightSuccess] = useState("")
  // Aviso suave (cor neutra) para quando o voo não é confirmado ou a API falha —
  // nunca um erro vermelho nem uma mensagem técnica. Ver handleFlightLookup.
  const [flightNotice, setFlightNotice] = useState("")

  const isRoundTrip = transfer.bookReturn
  const isReturnTab = transfer.transferType === "volta"
  const activeFlightNumber = isReturnTab ? transfer.returnFlightNumber : transfer.outboundFlightNumber
  const activeAirlineCompany = isReturnTab ? transfer.returnAirlineCompany : transfer.outboundAirlineCompany
  const activeArrivalDate = isReturnTab ? transfer.returnArrivalDate : transfer.outboundArrivalDate
  const activeFlightDate = isReturnTab ? transfer.returnDate : transfer.departureDate
  const basePrice = selectedVehicle?.price ?? 0
  const baseTotalPrice = basePrice

  const buildFlightTransferUpdate = (updates: {
    flightNumber?: string
    arrivalDate?: string | null
    airlineCompany?: string | null
    amadeusFlightInfo?: typeof transfer.outboundAmadeusFlightInfo
  }) => {
    if (isReturnTab) {
      return {
        returnFlightNumber: updates.flightNumber ?? transfer.returnFlightNumber,
        returnArrivalDate:
          updates.arrivalDate === undefined ? transfer.returnArrivalDate : updates.arrivalDate,
        returnAirlineCompany:
          updates.airlineCompany === undefined ? transfer.returnAirlineCompany : updates.airlineCompany,
        returnAmadeusFlightInfo:
          updates.amadeusFlightInfo === undefined
            ? transfer.returnAmadeusFlightInfo
            : updates.amadeusFlightInfo,
      }
    }

    return {
      outboundFlightNumber: updates.flightNumber ?? transfer.outboundFlightNumber,
      outboundArrivalDate:
        updates.arrivalDate === undefined ? transfer.outboundArrivalDate : updates.arrivalDate,
      outboundAirlineCompany:
        updates.airlineCompany === undefined
          ? transfer.outboundAirlineCompany
          : updates.airlineCompany,
      outboundAmadeusFlightInfo:
        updates.amadeusFlightInfo === undefined
          ? transfer.outboundAmadeusFlightInfo
          : updates.amadeusFlightInfo,
    }
  }

  const setTransferType = (transferType: "ida" | "volta") => {
    setError("")
    setFlightSuccess("")
    setFlightNotice("")
    updateTransfer({ transferType })
  }

  /* Os preços vêm de ./pricing, como no resumo do pedido. Estavam aqui escritos
     à mão e já tinham divergido: o Meet & Greet cobrava 4 e a factura 5, e o
     Priority Pickup nem sequer entrava na conta do botão. */
  const premiumInsurancePrice = payment.premiumInsurance ? insurancePrice("premiumInsurance", isRoundTrip) : 0
  const refundTermsPrice = payment.refundTerms ? insurancePrice("refundTerms", isRoundTrip) : 0
  const priorityPickupPrice = payment.priorityPickup ? insurancePrice("priorityPickup", isRoundTrip) : 0
  const comfortConnectionPrice = payment.comfortConnection ? insurancePrice("comfortConnection", isRoundTrip) : 0
  const insuranceTotal =
    premiumInsurancePrice + refundTermsPrice + priorityPickupPrice + comfortConnectionPrice
  /* Zero, como no resumo e no passo do pagamento. A sobretaxa de cartão foi
     retirada — é proibida na UE e o método é escolhido pela Stripe — mas este
     sítio ficou para trás, e era ele que punha o botão 2% acima da factura. */
  const cardFeeRate = 0

  const { total: extrasTotal } = calcExtras(transfer, isRoundTrip)

  const experiencesTotal = experiences.reduce((sum, exp) => sum + exp.totalPrice, 0)

  const priceBreakdown = useMemo(() => calculatePriceBreakdown({
    basePrice: baseTotalPrice,
    cardFeeRate,
    insuranceTotal: insuranceTotal + extrasTotal,
  }), [baseTotalPrice, cardFeeRate, insuranceTotal, extrasTotal])

  const continueButtonTotal = priceBreakdown.total + experiencesTotal

  const updateChildSeats = (next: typeof transfer.childSeats) => {
    const any = next.baby + next.child + next.booster > 0
    updateTransfer({ childSeats: next, childSeatChecked: any })
  }
  const childSeats = [
    {
      id: "baby",
      title: t("babySeat"),
      ageRange: t("babySeatAge"),
      image: "/shared/c589411c-9d31-4b5a-82af.jpeg",
      value: transfer.childSeats.baby,
      onChange: (v: number) => updateChildSeats({ ...transfer.childSeats, baby: v }),
    },
    {
      id: "child",
      title: t("childSeatLabel"),
      ageRange: t("childSeatAge"),
      image: "/shared/cadeira-crianca.jpeg",
      value: transfer.childSeats.child,
      onChange: (v: number) => updateChildSeats({ ...transfer.childSeats, child: v }),
    },
    {
      id: "booster",
      title: t("boosterSeat"),
      ageRange: t("boosterSeatAge"),
      image: "/shared/banco-elevatorio.jpeg",
      value: transfer.childSeats.booster,
      onChange: (v: number) => updateChildSeats({ ...transfer.childSeats, booster: v }),
    },
  ]

  const updateSurfboard = (next: typeof transfer.surfboard) => {
    const any = next.standard + next.upgraded > 0
    updateTransfer({ surfboard: next, surfboardChecked: any })
  }
  const surfboards = [
    {
      id: "standard",
      title: t("standardSurfboard"),
      subtitle: t("standardSurfboardSize"),
      iconImage: "/checkout/icons/surfboard-checkout.png",
      iconImageClassName: "w-5 h-5",
      value: transfer.surfboard.standard,
      onChange: (v: number) => updateSurfboard({ ...transfer.surfboard, standard: v }),
    },
    {
      id: "upgraded",
      title: t("biggerSurfboard"),
      subtitle: t("biggerSurfboardSize"),
      iconImage: "/checkout/icons/surfboard-checkout.png",
      iconImageClassName: "w-8 h-8",
      value: transfer.surfboard.upgraded,
      onChange: (v: number) => updateSurfboard({ ...transfer.surfboard, upgraded: v }),
      badge: t("requiresXl"),
    },
  ]

  const updatePet = (next: typeof transfer.pet) => {
    const any = next.small + next.large > 0
    updateTransfer({ pet: next, petChecked: any })
  }
  const pets = [
    {
      id: "small",
      title: t("smallPet"),
      subtitle: t("smallPetWeight"),
      icon: Dog,
      value: transfer.pet.small,
      onChange: (v: number) => updatePet({ ...transfer.pet, small: v }),
    },
    {
      id: "large",
      title: t("largePet"),
      subtitle: t("largePetWeight"),
      icon: Dog,
      value: transfer.pet.large,
      onChange: (v: number) => updatePet({ ...transfer.pet, large: v }),
      badge: t("requiresXl"),
    },
  ]

  const showLocationFields = transfer.transferType === "ida" || (transfer.transferType === "volta" && transfer.bookReturn)
  const stops = transfer.stops || []

  const handleAddStop = () => {
    if (stops.length < 1) {
      updateTransfer({ stops: [...stops, { text: "", placeId: null, lat: null, lng: null }] })
    }
  }

  const handleRemoveStop = (index: number) => {
    updateTransfer({ stops: stops.filter((_, i) => i !== index) })
  }

  const handleUpdateStop = (
    index: number,
    v: { location: string; placeId: string | null; lat: number | null; lng: number | null }
  ) => {
    const nextStops = [...stops]
    nextStops[index] = { text: v.location, placeId: v.placeId, lat: v.lat, lng: v.lng }
    updateTransfer({ stops: nextStops })
  }

  const handleFlightLookup = async () => {
    setError("")
    setFlightSuccess("")
    setFlightNotice("")
    if (!activeFlightNumber) {
      setFlightNotice(t("enterFlightNumber"))
      return
    }
    if (!activeFlightDate) {
      setFlightNotice(t("selectDateFirst"))
      return
    }

    // A confirmação do voo é um extra de conveniência (como na Welcome Pickups):
    // se encontrarmos, preenchemos companhia + hora de chegada; se NÃO
    // encontrarmos, ou se a API/Amadeus falhar, guardamos à mesma o número de
    // voo e deixamos a reserva seguir. Nunca mostramos erros técnicos ao
    // cliente nem bloqueamos o checkout.
    try {
      const depDate = formatLocalDate(activeFlightDate)
      const resp = await lookupFlight(convex, {
        flightNumber: activeFlightNumber,
        departureDate: depDate,
      })

      if (resp) {
        updateTransfer(
          buildFlightTransferUpdate({
            arrivalDate: resp.arrivalDateTimeLocal,
            airlineCompany: resp.airlineCompany,
            amadeusFlightInfo: resp.amadeusFlightInfo ?? null,
          })
        )
        setFlightSuccess(t("flightVerified", { airline: resp.airlineCompany }))
      } else {
        setFlightNotice(t("flightNotConfirmed"))
      }
    } catch (e: any) {
      // Best-effort: uma falha na pesquisa não pode partir o checkout.
      console.error("Flight lookup failed:", e)
      setFlightNotice(t("flightNotConfirmed"))
    }
  }

  const resolvePlaceFromText = async (
    text: string
  ): Promise<{ placeId: string; lat: number | null; lng: number | null } | null> => {
    const trimmed = String(text || "").trim()
    if (!trimmed) return null
    const google = (globalThis as any).google
    const svc = google?.maps?.places?.AutocompleteService
    const PlacesService = google?.maps?.places?.PlacesService
    if (!svc || !PlacesService) return null

    const service = new svc()
    const placeId = await new Promise<string | null>((resolve) => {
      service.getPlacePredictions({ input: trimmed }, (predictions: Array<{ place_id?: string }> | null) => {
        resolve(predictions?.[0]?.place_id ?? null)
      })
    })

    if (!placeId) return null

    const placesService = new PlacesService(document.createElement("div"))
    const details = await new Promise<{ lat: number | null; lng: number | null }>((resolve) => {
      placesService.getDetails({ placeId, fields: ["geometry"] }, (place: any, status: string) => {
        if (status === "OK" && place?.geometry?.location) {
          resolve({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() })
        } else {
          resolve({ lat: null, lng: null })
        }
      })
    })

    return { placeId, lat: details.lat, lng: details.lng }
  }

  const handleBack = () => {
    if (transfer.transferType === "volta") {
      setTransferType("ida")
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setShowTransferForm(false)
  }

  const handleContinue = async () => {
    if (transfer.transferType === "ida") {
      setTransferType("volta")
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    setError("")
    if (!selectedVehicle) {
      setError("Please select a vehicle first.")
      return
    }
    if (!transfer.departureDate) {
      setError("Please choose the departure date and time.")
      return
    }
    const departureDate =
      transfer.departureDate instanceof Date ? transfer.departureDate : new Date(transfer.departureDate as any)
    if (!Number.isFinite(departureDate.getTime())) {
      updateTransfer({ departureDate: undefined })
      setError("Please choose the departure date and time.")
      return
    }
    if (!transfer.fromLocation || !transfer.toLocation) {
      setError(t("fillLocations"))
      return
    }

    if (isRoundTrip && !transfer.returnDate) {
      setError(t("returnDateRequired"))
      return
    }

    // NÃO bloqueamos a continuação quando o voo não foi confirmado. O número de
    // voo é opcional e é guardado tal como foi escrito; a equipa confirma os
    // detalhes (a submissão já usa "Unknown" como fallback da companhia).
    // Bloquear aqui prendia clientes com voos válidos que a Amadeus não conhece
    // — exatamente o problema reportado. (comportamento à Welcome Pickups)
    setIsSubmitting(true)
    try {
      let fromPlaceId = transfer.fromPlaceId
      let fromLat = transfer.fromLat
      let fromLng = transfer.fromLng
      let toPlaceId = transfer.toPlaceId
      let toLat = transfer.toLat
      let toLng = transfer.toLng

      if (!fromPlaceId) {
        const resolved = await resolvePlaceFromText(transfer.fromLocation)
        if (resolved) {
          fromPlaceId = resolved.placeId
          fromLat = resolved.lat
          fromLng = resolved.lng
          updateTransfer({ fromPlaceId, fromLat, fromLng })
        }
      }
      if (!toPlaceId) {
        const resolved = await resolvePlaceFromText(transfer.toLocation)
        if (resolved) {
          toPlaceId = resolved.placeId
          toLat = resolved.lat
          toLng = resolved.lng
          updateTransfer({ toPlaceId, toLat, toLng })
        }
      }

      const resolvedStops = await Promise.all(
        stops.map(async (stop) => {
          if (stop.placeId) return stop
          const resolved = await resolvePlaceFromText(stop.text)
          return {
            text: stop.text,
            placeId: resolved?.placeId ?? null,
            lat: resolved?.lat ?? null,
            lng: resolved?.lng ?? null,
          }
        })
      )
      updateTransfer({ stops: resolvedStops })

      if (!fromPlaceId || !toPlaceId) {
        setError("Please select a suggestion for both origin and destination.")
        return
      }

      const departure = toBackendLocation({
        location: transfer.fromLocation,
        placeId: fromPlaceId,
        lat: fromLat,
        lng: fromLng,
      })
      const arrival = toBackendLocation({ location: transfer.toLocation, placeId: toPlaceId, lat: toLat, lng: toLng })
      const backendStops = resolvedStops.map((s) =>
        toBackendLocation({ location: s.text, placeId: s.placeId, lat: s.lat, lng: s.lng })
      )

      let currentOrderId = orderId
      let returnOrderId: string | null = null

      if (!currentOrderId) {
        const initOrderPayload = {
          departure,
          arrival,
          stops: backendStops,
          passengers: transfer.passengers,
          adults: transfer.adults,
          children: transfer.children,
          departureDate: formatLocalDateTime(departureDate, true),
          isRoundTrip: false,
          returnDate: undefined,
          // Main-site checkout: attribute to the referring partner via cookie.
          partnershipSlug: readReferralCookie() || undefined,
          /* A origem vai junto mas fica gravada à parte do parceiro: uma é
             campanha de anúncios, o outro é uma relação comercial nossa. */
          adSource: readAdSourceCookie() ?? undefined,
          opprefId: readOppref(),
        }
        const initResp = await initOrder(convex, initOrderPayload)
        currentOrderId = initResp.order.id
        setOrder(currentOrderId, initResp.order)
      } else {
        const existingOrder = await convex.query(api.orders.getByOrderNumber, { orderNumber: String(currentOrderId) })
        if (existingOrder?.relatedOrderId) {
          const returnOrder = await convex.query(api.orders.getById, { orderId: existingOrder.relatedOrderId })
          returnOrderId = returnOrder?.orderNumber || null
        }
      }

      if (isRoundTrip && !returnOrderId) {
        const returnDate = transfer.returnDate
          ? new Date(transfer.returnDate)
          : departureDate ? new Date(departureDate.getTime() + 24 * 60 * 60 * 1000) : new Date()

        if (Number.isFinite(returnDate.getTime())) {
          const returnOrderResp = await createReturnOrder(convex, currentOrderId, {
            departure: arrival,
            arrival: departure,
            departureDate: formatLocalDateTime(returnDate, true),
            passengers: transfer.passengers,
            adults: transfer.adults,
            children: transfer.children,
          })
          returnOrderId = returnOrderResp.order.id
        }
      }

      const vehicleBasePrice = basePrice
      const selectCarPayload = {
        carId: String(selectedVehicle.id),
        type: selectedVehicle.name,
        price: vehicleBasePrice,
        passengerCapacity: selectedVehicle.passengers,
      }
      await selectCar(convex, currentOrderId, selectCarPayload)

      if (isRoundTrip && returnOrderId) {
        await selectCar(convex, returnOrderId, selectCarPayload)
      }

      const registTripPayload = {
        flightNumber: transfer.outboundFlightNumber || "",
        departureDate: formatLocalDateTime(departureDate, false),
        backpacks: transfer.luggage.backpack,
        handbaggage: transfer.luggage.handLuggage,
        pets: transfer.petChecked ? transfer.pet.small + transfer.pet.large : 0,
        smallPets: transfer.petChecked ? transfer.pet.small : 0,
        largePets: transfer.petChecked ? transfer.pet.large : 0,
        childSeats: transfer.childSeatChecked ? transfer.childSeats.child : 0,
        babySeats: transfer.childSeatChecked ? transfer.childSeats.baby : 0,
        boosterSeats: transfer.childSeatChecked ? transfer.childSeats.booster : 0,
        checkedBaggage: transfer.luggage.checkedBaggage,
        surfboards: transfer.surfboardChecked ? transfer.surfboard.standard + transfer.surfboard.upgraded : 0,
        standardSurfboards: transfer.surfboardChecked ? transfer.surfboard.standard : 0,
        largeSurfboards: transfer.surfboardChecked ? transfer.surfboard.upgraded : 0,
        passengers: transfer.passengers,
        adults: transfer.adults,
        children: transfer.children,
        flightType: "IDA" as const,
        departure,
        arrival,
        arrivalDate: transfer.outboundArrivalDate as any,
        airlineCompany:
          transfer.outboundAirlineCompany ||
          (transfer.outboundFlightNumber ? "Unknown" : null),
        amadeusFlightInfo: transfer.outboundAmadeusFlightInfo,
        distance: distance ?? undefined,
        routeDurationMinutes: routeDuration ?? undefined,
      }
      await registTrip(convex, currentOrderId, registTripPayload)

      if (isRoundTrip && returnOrderId) {
        const returnDate = transfer.returnDate
          ? new Date(transfer.returnDate)
          : departureDate ? new Date(departureDate.getTime() + 24 * 60 * 60 * 1000) : new Date()

        if (Number.isFinite(returnDate.getTime())) {
          const returnTripPayload = {
            flightNumber: transfer.returnFlightNumber || "",
            departureDate: formatLocalDateTime(returnDate, false),
            backpacks: transfer.luggage.backpack,
            handbaggage: transfer.luggage.handLuggage,
            pets: transfer.petChecked ? transfer.pet.small + transfer.pet.large : 0,
            smallPets: transfer.petChecked ? transfer.pet.small : 0,
            largePets: transfer.petChecked ? transfer.pet.large : 0,
            childSeats: transfer.childSeatChecked ? transfer.childSeats.child : 0,
            babySeats: transfer.childSeatChecked ? transfer.childSeats.baby : 0,
            boosterSeats: transfer.childSeatChecked ? transfer.childSeats.booster : 0,
            checkedBaggage: transfer.luggage.checkedBaggage,
            surfboards: transfer.surfboardChecked ? transfer.surfboard.standard + transfer.surfboard.upgraded : 0,
            standardSurfboards: transfer.surfboardChecked ? transfer.surfboard.standard : 0,
            largeSurfboards: transfer.surfboardChecked ? transfer.surfboard.upgraded : 0,
            passengers: transfer.passengers,
            adults: transfer.adults,
            children: transfer.children,
            flightType: "VOLTA" as const,
            departure: arrival,
            arrival: departure,
            arrivalDate: transfer.returnArrivalDate,
            airlineCompany:
              transfer.returnAirlineCompany ||
              (transfer.returnFlightNumber ? "Unknown" : null),
            amadeusFlightInfo: transfer.returnAmadeusFlightInfo,
            distance: distance ?? undefined,
            routeDurationMinutes: routeDuration ?? undefined,
          }
          await registTrip(convex, returnOrderId, returnTripPayload)
        }
      }

      onContinue()
    } catch (e: any) {
      setError(e?.message || "Failed to submit transfer details.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const luggageCapacity = selectedVehicle?.luggage ?? Infinity
  const currentTotalLuggage = transfer.luggage.backpack + transfer.luggage.handLuggage + transfer.luggage.checkedBaggage
  const remainingLuggageCapacity = Math.max(0, luggageCapacity - currentTotalLuggage)

  const passengerCapacity = selectedVehicle?.passengers ?? Infinity
  const isEditingReturn = isReturnTab && transfer.bookReturn
  const displayFromLocation = isReturnTab ? transfer.toLocation : transfer.fromLocation
  const displayFromPlaceId = isReturnTab ? transfer.toPlaceId : transfer.fromPlaceId
  const displayFromLat = isReturnTab ? transfer.toLat : transfer.fromLat
  const displayFromLng = isReturnTab ? transfer.toLng : transfer.fromLng
  const displayToLocation = isReturnTab ? transfer.fromLocation : transfer.toLocation
  const displayToPlaceId = isReturnTab ? transfer.fromPlaceId : transfer.toPlaceId
  const displayToLat = isReturnTab ? transfer.fromLat : transfer.toLat
  const displayToLng = isReturnTab ? transfer.fromLng : transfer.toLng

  const handleUpgrade = () => {
    setUpgradeMode(true)
    setShowTransferForm(false)
    setStep(1)
  }

  const luggageItems = [
    {
      label: t("backpack"),
      icon: Backpack,
      value: transfer.luggage.backpack,
      onChange: (v: number) => updateTransfer({ luggage: { ...transfer.luggage, backpack: v } }),
      max: transfer.luggage.backpack + remainingLuggageCapacity,
    },
    {
      label: t("handLuggage"),
      icon: Luggage,
      value: transfer.luggage.handLuggage,
      onChange: (v: number) => updateTransfer({ luggage: { ...transfer.luggage, handLuggage: v } }),
      max: transfer.luggage.handLuggage + remainingLuggageCapacity,
    },
    {
      label: t("checkedBaggage"),
      icon: Briefcase,
      value: transfer.luggage.checkedBaggage,
      onChange: (v: number) => updateTransfer({ luggage: { ...transfer.luggage, checkedBaggage: v } }),
      max: transfer.luggage.checkedBaggage + remainingLuggageCapacity,
    },
  ]

  const arrivalTimeStr = formatFlightTime(activeArrivalDate)
  const pickupTimeStr = formatFlightTime(activeFlightDate)
  const showFlightTimeline = Boolean(arrivalTimeStr || activeAirlineCompany)

  return (
    <div className="w-full">
      <h2
        className="text-[28px] md:text-[32px] font-normal text-[var(--ck-text,#f7f4ef)] mb-6 leading-none"
        style={SERIF_FONT}
      >
        {t("tripDetails")}
      </h2>

      <div className="grid grid-cols-2 mb-6">
        <button
          type="button"
          onClick={() => setTransferType("ida")}
          className={cn(
            "h-12 text-[13px] font-semibold uppercase tracking-[1px] transition-colors",
            transfer.transferType === "ida"
              ? "bg-[var(--ck-accent,#c9a96e)] text-[#0D0D0D]"
              : "bg-[var(--ck-surface,#1a1918)] text-[var(--ck-text-muted,#999)] border border-[rgba(var(--ck-text-rgb,255,255,255),0.06)] hover:text-[var(--ck-text,#f7f4ef)]",
          )}
        >
          {t("outbound")}
        </button>
        <button
          type="button"
          onClick={() => setTransferType("volta")}
          className={cn(
            "h-12 text-[13px] font-semibold uppercase tracking-[1px] transition-colors",
            transfer.transferType === "volta"
              ? "bg-[var(--ck-accent,#c9a96e)] text-[#0D0D0D]"
              : "bg-[var(--ck-surface,#1a1918)] text-[var(--ck-text-muted,#999)] border border-[rgba(var(--ck-text-rgb,255,255,255),0.06)] hover:text-[var(--ck-text,#f7f4ef)]",
          )}
        >
          {t("return")}
        </button>
      </div>

      {transfer.transferType === "volta" && (
        <label
          htmlFor="book-return"
          className="flex items-center gap-2 cursor-pointer mb-4 bg-[var(--ck-surface,#1a1918)] border border-[rgba(var(--ck-text-rgb,255,255,255),0.06)] px-3 py-2.5"
        >
          <Checkbox
            appearance="luxmotion"
            id="book-return"
            checked={transfer.bookReturn}
            onCheckedChange={(checked: boolean) => updateTransfer({ bookReturn: checked })}
            className="border-[rgba(var(--ck-accent-rgb,201,169,110),0.5)] data-[state=checked]:bg-[var(--ck-accent,#c9a96e)] data-[state=checked]:border-[var(--ck-accent,#c9a96e)]"
          />
          <span className="text-[13px] text-[var(--ck-text,#f7f4ef)]">{t("bookReturn")}</span>
        </label>
      )}

      <AnimatedCollapse isOpen={showLocationFields}>
        <div className="mb-4">
          <FieldLabel>{t("from")}</FieldLabel>
          <DarkFieldBox>
            <GooglePlacesInput
              value={{
                location: displayFromLocation,
                placeId: displayFromPlaceId,
                lat: displayFromLat,
                lng: displayFromLng,
              }}
              onChange={(v) => {
                if (isReturnTab) {
                  updateTransfer({
                    toLocation: v.location,
                    toPlaceId: v.placeId,
                    toLat: v.lat,
                    toLng: v.lng,
                  })
                  return
                }
                updateTransfer({
                  fromLocation: v.location,
                  fromPlaceId: v.placeId,
                  fromLat: v.lat,
                  fromLng: v.lng,
                })
              }}
              placeholder={t("departureLocation")}
              variant="tours-hero-dark"
              dropdownDark={isDarkCheckout}
              hideLeftIcon
            />
          </DarkFieldBox>
        </div>

        {stops.length === 0 && (
          <button
            type="button"
            onClick={handleAddStop}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ck-accent,#c9a96e)] hover:text-[var(--ck-accent-hover,#b89558)] transition-colors mb-4"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            {t("addStop")}
          </button>
        )}

        {stops.map((stop, index) => (
          <div key={index} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <FieldLabel>{t("extraStop")}</FieldLabel>
              <button
                type="button"
                onClick={() => handleRemoveStop(index)}
                className="text-[var(--ck-text-subtle,#696969)] hover:text-[var(--ck-accent,#c9a96e)] transition-colors -mt-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <DarkFieldBox>
              <GooglePlacesInput
                value={{ location: stop.text, placeId: stop.placeId, lat: stop.lat, lng: stop.lng }}
                onChange={(v) => handleUpdateStop(index, v)}
                placeholder={t("destinationLocation")}
                variant="tours-hero-dark"
                dropdownDark={isDarkCheckout}
                hideLeftIcon
              />
            </DarkFieldBox>
          </div>
        ))}

        <div className="mb-4">
          <FieldLabel>{t("to")}</FieldLabel>
          <DarkFieldBox>
            <GooglePlacesInput
              value={{
                location: displayToLocation,
                placeId: displayToPlaceId,
                lat: displayToLat,
                lng: displayToLng,
              }}
              onChange={(v) => {
                if (isReturnTab) {
                  updateTransfer({
                    fromLocation: v.location,
                    fromPlaceId: v.placeId,
                    fromLat: v.lat,
                    fromLng: v.lng,
                  })
                  return
                }
                updateTransfer({
                  toLocation: v.location,
                  toPlaceId: v.placeId,
                  toLat: v.lat,
                  toLng: v.lng,
                })
              }}
              placeholder={t("destinationLocation")}
              variant="tours-hero-dark"
              dropdownDark={isDarkCheckout}
              hideLeftIcon
            />
          </DarkFieldBox>
        </div>

        {!isReturnTab && (
          <div className="mb-4">
            <FieldLabel>{isRoundTrip ? t("departureDateLabel") : t("dateTime")}</FieldLabel>
            <DarkFieldBox>
              <DateTimePicker
                value={transfer.departureDate}
                onChange={(d) => updateTransfer({ departureDate: d })}
                variant="new-widget"
                dark={isDarkCheckout}
                hideLeftIcon
              />
            </DarkFieldBox>
          </div>
        )}

        <AnimatedCollapse isOpen={isEditingReturn}>
          <div className="mb-4">
            <FieldLabel>{t("returnDateLabel")}</FieldLabel>
            <DarkFieldBox>
              <DateTimePicker
                value={transfer.returnDate}
                onChange={(d) => updateTransfer({ returnDate: d })}
                placeholder={t("return") || "Regresso"}
                variant="new-widget"
                dark={isDarkCheckout}
                hideLeftIcon
              />
            </DarkFieldBox>
          </div>
        </AnimatedCollapse>

        <div className="mb-4">
          <FieldLabel>{t("flightNumber")}</FieldLabel>
          <DarkInput
            value={activeFlightNumber}
            onChange={(v) => {
              setFlightSuccess("")
              setFlightNotice("")
              updateTransfer(
                buildFlightTransferUpdate({
                  flightNumber: v,
                  arrivalDate: null,
                  airlineCompany: null,
                  amadeusFlightInfo: null,
                })
              )
            }}
            placeholder="TP941"
            rightAdornment={
              <button
                type="button"
                onClick={handleFlightLookup}
                className={cn(
                  "transition-colors",
                  activeAirlineCompany ? "text-[var(--ck-accent,#c9a96e)]" : "text-[var(--ck-text-subtle,#696969)] hover:text-[var(--ck-accent,#c9a96e)]"
                )}
                aria-label="Search flight"
              >
                <Search className="w-5 h-5" />
              </button>
            }
          />
          {activeAirlineCompany && (
            <p className="mt-1.5 text-[11px] font-semibold text-[var(--ck-accent,#c9a96e)]">
              ✓ {activeAirlineCompany}
            </p>
          )}
          {!activeAirlineCompany && flightNotice && (
            <p className="mt-1.5 text-[11px] text-[var(--ck-text-muted,#999)] leading-[1.5]">
              {flightNotice}
            </p>
          )}
        </div>

        {showFlightTimeline && (
          <div className="mb-3">
            <FlightTimeline arrivalTime={arrivalTimeStr} pickupTime={pickupTimeStr} />
          </div>
        )}

        <div className="flex items-start gap-2 mb-2 pl-1">
          <Info className="w-3.5 h-3.5 text-[var(--ck-text-subtle,#696969)] flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--ck-text-muted,#999)] leading-[1.5]">{t("flightInfo")}</p>
        </div>

        <SectionLabel>{t("passengers")}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <IconOptionCard
            icon={Users}
            title={t("adults")}
            subtitle="IDADE 12+"
            selected={transfer.adults > 0}
          >
            <DarkCounter
              value={transfer.adults}
              onChange={(v) => updateTransfer({ adults: v, passengers: v + transfer.children })}
              min={1}
              max={passengerCapacity}
            />
          </IconOptionCard>
          <IconOptionCard
            icon={Baby}
            title={t("children")}
            subtitle="ABAIXO DE 12"
            selected={transfer.children > 0}
          >
            <DarkCounter
              value={transfer.children}
              onChange={(v) => updateTransfer({ children: v, passengers: transfer.adults + v })}
              min={0}
              max={Math.max(0, passengerCapacity - transfer.adults)}
            />
          </IconOptionCard>
        </div>

        {transfer.passengers >= passengerCapacity && (
          <UpgradeBanner message={t("passengerLimit")} label={tCommon("upgrade")} onClick={handleUpgrade} />
        )}

        <SectionLabel>{t("bags")}</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          {luggageItems.map((item) => (
            <IconOptionCard
              key={item.label}
              icon={item.icon}
              title={item.label}
              selected={item.value > 0}
            >
              <DarkCounter
                value={item.value}
                onChange={item.onChange}
                min={0}
                max={item.max}
              />
            </IconOptionCard>
          ))}
        </div>

        {remainingLuggageCapacity === 0 && (
          <UpgradeBanner message={t("luggageLimit")} label={tCommon("upgrade")} onClick={handleUpgrade} />
        )}

        <SectionLabel>{t("childSeat")}</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          {childSeats.map((seat) => (
            <ImageOptionCard
              key={seat.id}
              image={seat.image}
              title={seat.title}
              subtitle={seat.ageRange}
              selected={seat.value > 0}
            >
              <DarkCounter value={seat.value} onChange={seat.onChange} min={0} />
            </ImageOptionCard>
          ))}
        </div>

        <SectionLabel>{t("surfboard")}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {surfboards.map((item) => (
            <IconOptionCard
              key={item.id}
              iconImage={item.iconImage}
              iconImageClassName={item.iconImageClassName}
              title={item.title}
              subtitle={item.subtitle}
              badge={item.badge}
              selected={item.value > 0}
            >
              <DarkCounter value={item.value} onChange={item.onChange} min={0} />
            </IconOptionCard>
          ))}
        </div>
        {transfer.surfboard.upgraded > 0 && passengerCapacity <= 5 && (
          <UpgradeBanner message={t("surfboardUpgradeNeeded")} label={tCommon("upgrade")} onClick={handleUpgrade} />
        )}

        <SectionLabel>{t("pet")}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {pets.map((item) => (
            <IconOptionCard
              key={item.id}
              icon={item.icon}
              title={item.title}
              subtitle={item.subtitle}
              badge={item.badge}
              selected={item.value > 0}
            >
              <DarkCounter value={item.value} onChange={item.onChange} min={0} />
            </IconOptionCard>
          ))}
        </div>
        {transfer.pet.large > 0 && passengerCapacity <= 5 && (
          <UpgradeBanner message={t("petUpgradeNeeded")} label={tCommon("upgrade")} onClick={handleUpgrade} />
        )}

        <div className="mt-6">
          <label htmlFor="terms" className="flex items-center gap-3 cursor-pointer bg-[var(--ck-surface,#1a1918)] border border-[rgba(var(--ck-text-rgb,255,255,255),0.06)] px-4 py-3">
            <Checkbox
              appearance="luxmotion"
              id="terms"
              checked={transfer.acceptTerms}
              onCheckedChange={(checked: boolean) => updateTransfer({ acceptTerms: checked })}
              className="border-[rgba(var(--ck-accent-rgb,201,169,110),0.5)] data-[state=checked]:bg-[var(--ck-accent,#c9a96e)] data-[state=checked]:border-[var(--ck-accent,#c9a96e)]"
            />
            <span className="text-[13px] text-[var(--ck-text,#f7f4ef)] leading-relaxed">{t("agreeTerms")}</span>
          </label>
        </div>
      </AnimatedCollapse>

      {error && (
        <div className="mt-4 text-[12px] text-[#E53935]" aria-live="polite">
          {error}
        </div>
      )}

      {flightSuccess && (
        <div className="mt-4 text-[12px] text-[var(--ck-accent,#c9a96e)]" aria-live="polite">
          {flightSuccess}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 mt-6">
        <button
          type="button"
          onClick={handleBack}
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 h-12 px-6 text-[13px] font-semibold uppercase tracking-[1px] text-[var(--ck-text,#f7f4ef)] bg-[var(--ck-surface,#1a1918)] border border-[rgba(var(--ck-text-rgb,255,255,255),0.08)] hover:border-[var(--ck-accent,#c9a96e)] hover:text-[var(--ck-accent,#c9a96e)] transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />
          {tCommon("back")}
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={isSubmitting || !transfer.acceptTerms}
          className="inline-flex items-center gap-2 h-12 px-8 text-[13px] font-semibold uppercase tracking-[1px] bg-[var(--ck-accent,#c9a96e)] hover:bg-[var(--ck-accent-hover,#b89558)] text-[#0D0D0D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {transfer.transferType === "ida"
            ? tCommon("continue")
            : t("continueWithPrice", { price: continueButtonTotal.toFixed(2).replace(".", ",") })}
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

function UpgradeBanner({
  message,
  label,
  onClick,
}: {
  message: string
  label: string
  onClick: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-[rgba(var(--ck-accent-rgb,201,169,110),0.07)] border border-[rgba(var(--ck-accent-rgb,201,169,110),0.22)] px-4 py-3 mt-3 animate-in fade-in duration-300">
      <p className="text-[12px] text-[var(--ck-text,#f7f4ef)]">{message}</p>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[1px] text-[var(--ck-accent,#c9a96e)] hover:text-[var(--ck-accent-hover,#b89558)] transition-colors"
      >
        {label}
        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </div>
  )
}

