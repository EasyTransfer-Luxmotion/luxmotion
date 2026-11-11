"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { CircleMinus, BadgeCheck, ShieldCheck } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { precoPrivado } from "@/hooks/use-event-data"
import { cn } from "@workspace/ui/lib/utils"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { useMinAdvanceBookingHours } from "@/hooks/use-min-advance-hours"
import { TransferForm } from "./booking/transfer-form"
import { EventsTourForm } from "./booking/events-tour-form"
import type { TripType, PassengerState, TourPassengerState, LuggageState, WidgetProductItem } from "./booking/types"
import { useQuery } from "convex/react"
import { api } from "@workspace/convex/api"

interface BookingWidgetProps {
  className?: string
  compact?: boolean
  // On a partnership landing (/<slug>) the transfer booking must continue to that
  // partner's checkout (/<slug>/checkout), not the main /checkout. Empty = main site.
  checkoutBasePath?: string
}

interface LocationState {
  text: string
  placeId: string | null
  lat: number | null
  lng: number | null
}

export function BookingWidget({ className, checkoutBasePath = "" }: BookingWidgetProps) {
  const t = useTranslations("hero")
  const tCommon = useTranslations("common")
  const tTransfer = useTranslations("transfer")
  const router = useRouter()
  const minAdvanceHours = useMinAdvanceBookingHours()

  const [mounted, setMounted] = useState(false)
  const [tripType, setTripType] = useState<TripType>("oneWay")
  const [fromLocation, setFromLocation] = useState<LocationState>({ text: "", placeId: null, lat: null, lng: null })
  const [destinations, setDestinations] = useState<LocationState[]>([{ text: "", placeId: null, lat: null, lng: null }])
  const [showPassengersDropdown, setShowPassengersDropdown] = useState(false)
  const [selectedTour, setSelectedTour] = useState<WidgetProductItem | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<WidgetProductItem | null>(null)
  const [departureDate, setDepartureDate] = useState<Date | undefined>(undefined)
  const [departureDateTime, setDepartureDateTime] = useState<{ date: Date | null; time: string | null }>({ date: null, time: null })
  const [passengers, setPassengers] = useState<PassengerState>({ adults: 1, children: 0 })
  const [tourPassengers, setTourPassengers] = useState<TourPassengerState>({ adults: 1, children: 0, infants: 0 })
  const [luggage, setLuggage] = useState<LuggageState>({ backpack: 0, handLuggage: 0, checkedBaggage: 0 })
  const passengersRef = useRef<HTMLDivElement | null>(null)
  const [reservationCount, setReservationCount] = useState<number | null>(null)

  const toursFromApi = useQuery(api.tours.listPublished)
  const eventsFromApi = useQuery(api.events.listPublished)

  const widgetToursItems: WidgetProductItem[] = useMemo(() => {
    if (!toursFromApi) return []
    return toursFromApi.map((tour) => ({
      _id: tour._id,
      productType: tour.category === "experiences" ? "experience" : "tour",
      title: tour.title,
      slug: tour.slug,
      price: tour.basePrice,
      image: tour.bannerImageUrl ?? undefined,
      subtitle: tour.subtitle ?? undefined,
      pickup: tour.pickup,
      minPassengers: tour.minPassengers,
      maxPassengers: tour.maxPassengers,
    }))
  }, [toursFromApi])

  const widgetEventsItems: WidgetProductItem[] = useMemo(() => {
    if (!eventsFromApi) return []
    return eventsFromApi.map((event) => ({
      _id: event._id,
      productType: "event" as const,
      title: event.title,
      slug: event.slug,
      price: precoPrivado(event),
      image: event.bannerImageUrl ?? undefined,
      subtitle: event.subtitle ?? undefined,
      eventDate: event.eventDate,
      endDate: event.endDate,
      meetingPoint: event.meetingPoint,
      minPassengers: event.minPassengers,
      maxPassengers: event.maxPassengers,
    }))
  }, [eventsFromApi])

  const handleEventsTourContinue = (
    item: WidgetProductItem,
    dateTime: { date: Date | null; time: string | null },
    p: TourPassengerState
  ) => {
    const basePath = item.productType === "event" ? "/events" : "/tours/tour"
    const params = new URLSearchParams()

    params.set("openCheckout", "true")
    if (dateTime.date) params.set("date", dateTime.date.toISOString())
    if (dateTime.time) params.set("time", dateTime.time)
    params.set("adults", String(p.adults))
    params.set("children", String(p.children))
    params.set("infants", String(p.infants))

    router.push(`${basePath}/${item.slug}?${params.toString()}`)
  }

  useEffect(() => {
    setMounted(true)
    setReservationCount(Math.floor(40 + Math.random() * 41))
  }, [])

  const addDestination = () => {
    if (destinations.length < 2) {
      setDestinations([...destinations, { text: "", placeId: null, lat: null, lng: null }])
    }
  }

  const removeDestination = () => {
    if (destinations.length > 1) {
      setDestinations(destinations.slice(0, -1))
    }
  }

  const handleFromLocationUpdate = (text: string, details?: { placeId: string; lat: number; lng: number }) => {
    setFromLocation({
      text,
      placeId: details?.placeId ?? null,
      lat: details?.lat ?? null,
      lng: details?.lng ?? null,
    })
  }

  const handleDestinationUpdate = (index: number, text: string, details?: { placeId: string; lat: number; lng: number }) => {
    setDestinations((prev) => {
      const next = [...prev]
      next[index] = {
        text,
        placeId: details?.placeId ?? null,
        lat: details?.lat ?? null,
        lng: details?.lng ?? null,
      }
      return next
    })
  }

  const tripTypes: { key: TripType; label: string }[] = [
    { key: "oneWay", label: t("tripTypes.oneWay") },
    { key: "roundTrip", label: t("tripTypes.roundTrip") },
    { key: "events", label: t("tripTypes.events") },
    { key: "tours", label: t("tripTypes.tours") },
  ]

  const isTransferMode = tripType === "oneWay" || tripType === "roundTrip"
  const hasExtraStop = destinations.length > 1

  const transferTranslations = {
    labelFrom: t("labelFrom"),
    labelTo: t("labelTo"),
    labelDeparture: t("labelDeparture"),
    whereFrom: t("whereFrom"),
    whereTo: t("whereTo"),
    placeholderFrom: t("placeholderFrom"),
    placeholderTo: t("placeholderTo"),
    placeholderDeparture: t("placeholderDeparture"),
    continue: tCommon("continue"),
    passengers: t("passengers"),
    adults: t("adults"),
    children: t("children"),
    childrenAge: t("childrenAge"),
    backpack: tTransfer("backpack"),
    handLuggage: tTransfer("handLuggage"),
    checkedBaggage: tTransfer("checkedBaggage"),
    done: t("done"),
    fillLocations: tTransfer("fillLocations"),
    selectDateFirst: tTransfer("selectDateFirst"),
  }

  const eventTranslations = {
    chooseEvent: t("chooseEvent"),
    chooseTour: t("chooseTour"),
    noEvents: t("noEvents"),
    noTours: t("noTours"),
    clearSelection: t("clearSelection"),
    placeholderDeparture: t("placeholderDeparture"),
    continue: tCommon("continue"),
    passengers: t("passengers"),
    adults: t("adults"),
    adultAge: t("adultAge"),
    children: t("children"),
    childrenAge: t("childrenAge"),
    infant: t("infant"),
    infantAge: t("infantAge"),
    done: t("done"),
    readMore: t("readMore"),
  }

  const trustTranslations = {
    exclusive: t("exclusive"),
    flexibleCancellation: t("flexibleCancellation"),
  }

  const STORAGE_KEY = "easytransfer_checkout"

  const serializeCheckoutState = (state: unknown) => {
    return JSON.stringify(state, (key, value) => {
      if (value instanceof Date) {
        return { __type: "Date", value: value.toISOString() }
      }
      return value
    })
  }

  const deserializeCheckoutState = (json: string) => {
    return JSON.parse(json, (key, value) => {
      if (value && typeof value === "object" && value.__type === "Date") {
        return new Date(value.value)
      }
      return value
    })
  }

  const handleTransferContinue = () => {
    const toLoc = destinations[destinations.length - 1]
    const isTransferComplete =
      Boolean(fromLocation.placeId) &&
      Boolean(departureDate) &&
      Boolean(toLoc?.placeId) &&
      destinations.every((dest) => Boolean(dest.placeId))

    if (!isTransferComplete) {
      return
    }

    // Minimum booking lead time (also enforced in the date picker; this warns if the
    // chosen time has since slipped under it, e.g. a stale value restored from storage).
    const minLeadMs = minAdvanceHours * 60 * 60 * 1000
    if (departureDate && departureDate.getTime() < Date.now() + minLeadMs) {
      toast.error(t("minAdvanceNotice", { hours: minAdvanceHours }))
      return
    }

    const totalPassengers = passengers.adults + passengers.children
    const stops = destinations.length > 1 
      ? destinations.slice(0, -1).map(d => ({
          text: d.text,
          placeId: d.placeId,
          lat: d.lat,
          lng: d.lng
        }))
      : []

    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY)
        const existing = stored ? deserializeCheckoutState(stored) : {}

        // Extrair transfer existente de forma type-safe
        const existingTransfer = existing &&
          typeof existing === "object" &&
          "transfer" in existing &&
          typeof (existing as any).transfer === "object" &&
          (existing as any).transfer !== null
          ? (existing as any).transfer as Record<string, unknown>
          : {}

        const merged = {
          ...existing,
          currentStep: 1,
          direction: "right",
          selectedVehicle: null,
          showTransferForm: false,
          orderId: null,
          order: null,
          distance: null,
          transfer: {
            ...existingTransfer,
            fromLocation: fromLocation.text,
            fromPlaceId: fromLocation.placeId,
            fromLat: fromLocation.lat,
            fromLng: fromLocation.lng,
            toLocation: toLoc?.text ?? "",
            toPlaceId: toLoc?.placeId ?? null,
            toLat: toLoc?.lat ?? null,
            toLng: toLoc?.lng ?? null,
            stops,
            departureDate: departureDate, // Preservar o Date object
            passengers: totalPassengers,
            adults: passengers.adults,
            children: passengers.children,
            luggage: {
              backpack: luggage.backpack,
              handLuggage: luggage.handLuggage,
              checkedBaggage: luggage.checkedBaggage,
            },
            bookReturn: tripType === "roundTrip",
            transferType: "ida", // Sempre começar na aba "outbound", mesmo para round trip
          },
        }

        sessionStorage.setItem(STORAGE_KEY, serializeCheckoutState(merged))
      } catch (error) {
        console.error("Failed to persist widget data to checkout storage:", error)
      }
    }

    router.push(`${checkoutBasePath}/checkout`)
  }

  return (
    <motion.div
      layout
      initial={false}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30
      }}
      className={cn("relative z-20 booking-widget-trip-types BookingWidget w-full", className)}
    >
      <div className="flex flex-nowrap gap-[12px] md:gap-[24px] mb-2 justify-start overflow-x-auto snap-x snap-mandatory [&>*]:snap-start" style={{ WebkitOverflowScrolling: 'touch' }}>
        {tripTypes.map((type) => (
          <label
            key={type.key}
            className="flex items-center gap-[8px] cursor-pointer group select-none shrink-0"
            style={{ scrollSnapStop: 'always' }}
            onClick={() => setTripType(type.key)}
          >
            <div
              className={cn(
                "relative size-[16px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors",
                tripType === type.key ? "border-[var(--lm-accent,#C9A96E)]" : "border-[rgba(var(--lm-text-rgb,255,255,255),0.25)] group-hover:border-[var(--lm-accent,#C9A96E)]"
              )}
            >
              <div
                className={cn(
                  "absolute left-1/2 top-1/2 size-[7px] rounded-full bg-[var(--lm-accent,#C9A96E)] transition-all duration-200 ease-out transform -translate-x-1/2 -translate-y-1/2",
                  tripType === type.key ? "scale-100 opacity-100" : "scale-0 opacity-0"
                )}
              />
            </div>
            <span
              className={cn(
                "text-[14px] font-medium transition-colors duration-200 whitespace-nowrap leading-[19.5px]",
                tripType === type.key ? "text-[var(--lm-text,#fff)]" : "text-[var(--lm-muted,#999)] group-hover:text-[var(--lm-text,#fff)]"
              )}
            >
              {type.label}
            </span>
          </label>
        ))}
      </div>

      <div
        className="border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] backdrop-blur-[8px] overflow-hidden"
        style={{ backgroundColor: "var(--lm-surface,#1e1d1b)" }}
        suppressHydrationWarning
      >
        {mounted && (
          <>
            {isTransferMode ? (
              <TransferForm
                fromLocation={fromLocation}
                setFromLocation={handleFromLocationUpdate}
                destinations={destinations}
                setDestination={handleDestinationUpdate}
                passengers={passengers}
                luggage={luggage}
                showPassengersDropdown={showPassengersDropdown}
                setShowPassengersDropdown={setShowPassengersDropdown}
                setPassengers={setPassengers}
                setLuggage={setLuggage}
                departureDate={departureDate}
                setDepartureDate={setDepartureDate}
                onContinue={handleTransferContinue}
                translations={transferTranslations}
              />
            ) : (
              <EventsTourForm
                tripType={tripType}
                passengers={tourPassengers}
                showPassengersDropdown={showPassengersDropdown}
                setShowPassengersDropdown={setShowPassengersDropdown}
                passengersRef={passengersRef}
                setPassengers={setTourPassengers}
                selectedItem={tripType === "events" ? selectedEvent : selectedTour}
                setSelectedItem={tripType === "events" ? setSelectedEvent : setSelectedTour}
                departureDateTime={departureDateTime}
                setDepartureDateTime={setDepartureDateTime}
                items={tripType === "events" ? widgetEventsItems : widgetToursItems}
                onContinue={handleEventsTourContinue}
                translations={eventTranslations}
              />
            )}
          </>
        )}
      </div>

      {mounted && isTransferMode && (
        <div className="mt-1 flex flex-col gap-2.5 w-full px-0.5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 lg:gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              {destinations.length === 1 ? (
                <button
                  onClick={addDestination}
                  className="flex items-center gap-2 text-[14px] font-medium text-[var(--lm-accent,#C9A96E)] hover:text-[var(--lm-accent,#C9A96E)]/80 transition-colors cursor-pointer shrink-0"
                >
                  <Image src="/shared/icons/stop-toggle.svg" alt="" width={16} height={16} />
                  {t("addStop")}
                </button>
              ) : (
                <button
                  onClick={removeDestination}
                  className="flex items-center gap-2 text-[14px] font-medium text-[var(--lm-accent,#C9A96E)] hover:text-[var(--lm-accent,#C9A96E)]/80 transition-colors cursor-pointer shrink-0"
                >
                  <CircleMinus className="w-4 h-4" strokeWidth={1.2} />
                  {t("removeStop")}
                </button>
              )}

              <div className="hidden lg:flex items-center gap-2">
                <div className="h-3 w-px bg-[rgba(var(--lm-text-rgb,255,255,255),0.1)]" />
                <BadgeCheck className="size-3.5 text-[var(--lm-accent,#C9A96E)]" />
                <span className="text-[12px] font-semibold text-[rgba(var(--lm-text-rgb,255,255,255),0.7)] tracking-[0.33px]">{trustTranslations.exclusive}</span>
                <div className="h-3 w-px bg-[rgba(var(--lm-text-rgb,255,255,255),0.1)]" />
                <ShieldCheck className="size-3.5 text-[var(--lm-accent,#C9A96E)]" />
                <span className="text-[12px] font-semibold text-[rgba(var(--lm-text-rgb,255,255,255),0.7)] tracking-[0.33px]">{trustTranslations.flexibleCancellation}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="relative inline-flex size-2 mr-0.5">
                <span className="absolute inset-0 rounded-full bg-[#4ADE80] animate-ping-strong" />
                <span className="relative inline-flex size-2 rounded-full bg-[#4ADE80]" />
              </span>
              <span className="text-[11px] lg:text-[12px] font-semibold text-[var(--lm-accent,#C9A96E)]">
                {t("reservations", { count: reservationCount ?? 12 })}
              </span>
              <span className="text-[10px] lg:text-[12px] text-[rgba(var(--lm-text-rgb,255,255,255),0.55)]">
                {t("reservationTime")}
              </span>
            </div>
          </div>

          <div className="flex lg:hidden flex-col gap-2">
            <div className="flex items-center gap-2">
              <BadgeCheck className="size-3.5 text-[var(--lm-accent,#C9A96E)]" />
              <span className="text-[12px] font-semibold text-[var(--lm-accent,#C9A96E)] tracking-[0.33px]">{trustTranslations.exclusive}</span>
              <div className="h-3 w-px bg-[rgba(var(--lm-accent-rgb,201,169,110),0.25)]" />
              <ShieldCheck className="size-3.5 text-[var(--lm-accent,#C9A96E)]" />
              <span className="text-[12px] font-semibold text-[var(--lm-accent,#C9A96E)] tracking-[0.33px]">{trustTranslations.flexibleCancellation}</span>
            </div>
          </div>
        </div>
      )}

      {mounted && !isTransferMode && (
        <div className="mt-2 flex flex-col gap-2 items-start px-0.5">
          <div className="flex items-center gap-2">
            <BadgeCheck className="size-3.5 text-[var(--lm-accent,#C9A96E)]" />
            <span className="text-[12px] font-semibold text-[var(--lm-accent,#C9A96E)] tracking-[0.33px]">{trustTranslations.exclusive}</span>
            <div className="h-3 w-px bg-[rgba(var(--lm-accent-rgb,201,169,110),0.25)]" />
            <ShieldCheck className="size-3.5 text-[var(--lm-accent,#C9A96E)]" />
            <span className="text-[12px] font-semibold text-[var(--lm-accent,#C9A96E)] tracking-[0.33px]">{trustTranslations.flexibleCancellation}</span>
          </div>
        </div>
      )}
    </motion.div>
  )
}
