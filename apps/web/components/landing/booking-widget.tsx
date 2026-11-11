"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { Plus, CircleMinus } from "lucide-react"
import { useTranslations } from "next-intl"
import { precoPrivado } from "@/hooks/use-event-data"
import { cn } from "@workspace/ui/lib/utils"
import { motion } from "framer-motion"
import { TransferForm } from "./booking/transfer-form"
import { EventsTourForm } from "./booking/events-tour-form"
import { TrustBanner } from "./booking/trust-banner"
import type { TripType, PassengerState, TourPassengerState, LuggageState, WidgetProductItem } from "./booking/types"
import { useQuery } from "convex/react"
import { api } from "@workspace/convex/api"

interface BookingWidgetProps {
  className?: string
  compact?: boolean
}

interface LocationState {
  text: string
  placeId: string | null
  lat: number | null
  lng: number | null
}

export function BookingWidget({ className }: BookingWidgetProps) {
  const t = useTranslations("hero")
  const tCommon = useTranslations("common")
  const tTransfer = useTranslations("transfer")
  const router = useRouter()
  const params = useParams()
  const referral = params?.referral as string | undefined

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

    const checkoutPath = referral ? `/${referral}${basePath}/${item.slug}?${params.toString()}` : `${basePath}/${item.slug}?${params.toString()}`
    router.push(checkoutPath)
  }

  useEffect(() => {
    setMounted(true)
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
    excellent: tCommon("excellent"),
    reviewsOn: tCommon("reviewsOn"),
  }

  const STORAGE_KEY = "easytransfer_customizable_checkout"

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
            departureDate,
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
            acceptTerms: true, // Pre-accept terms like main checkout
          },
        }

        sessionStorage.setItem(STORAGE_KEY, serializeCheckoutState(merged))
      } catch {
        console.warn("Failed to persist widget data to checkout storage")
      }
    }

    const checkoutPath = referral ? `/${referral}/checkout` : "/checkout"
    router.push(checkoutPath)
  }

  return (
    <motion.div 
      layout
      initial={false}
      animate={{
        maxWidth: isTransferMode ? (hasExtraStop ? 1400 : 1280) : 1080
      }}
      transition={{ 
        type: "spring", 
        stiffness: 300, 
        damping: 30 
      }}
      className={cn("relative z-20 mx-auto booking-widget-trip-types BookingWidget w-full px-2 sm:px-4", className)}
    >
      <div className="flex flex-nowrap gap-[12px] md:gap-[24px] mb-4 px-2 justify-center lg:justify-start overflow-x-auto snap-x snap-mandatory [&>*]:snap-start" style={{ WebkitOverflowScrolling: 'touch' }}>
        {tripTypes.map((type) => (
          <label
            key={type.key}
            className="flex items-center gap-[6px] md:gap-[8px] cursor-pointer group select-none shrink-0"
            style={{ scrollSnapStop: 'always' }}
            onClick={() => setTripType(type.key)}
          >
            <div
              className={cn(
                "relative w-[16px] h-[16px] md:w-[18px] md:h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                tripType === type.key ? "border-[#27C7FF]" : "border-gray-300 group-hover:border-[#27C7FF]"
              )}
              style={{ 
                borderColor: tripType === type.key 
                  ? "var(--theme-hero-booking-accent, #27C7FF)" 
                  : "var(--theme-input-border, #D1D5DB)" 
              }}
            >
              <div
                className={cn(
                  "absolute left-1/2 top-1/2 w-[6px] h-[6px] md:w-[8px] md:h-[8px] rounded-full bg-[#27C7FF] transition-all duration-200 ease-out transform -translate-x-1/2 -translate-y-1/2",
                  tripType === type.key ? "scale-100 opacity-100" : "scale-0 opacity-0"
                )}
                style={{ backgroundColor: "var(--theme-hero-booking-accent, #27C7FF)" }}
              />
            </div>
            <span
              className={cn(
                "text-[13px] md:text-[15px] font-medium transition-colors duration-200 whitespace-nowrap",
                tripType === type.key ? "text-[#222]" : "text-[#808080] group-hover:text-[#222]"
              )}
              style={{ color: tripType === type.key ? "var(--theme-hero-title, #222)" : "var(--theme-hero-booking-text, #808080)" }}
            >
              {type.label}
            </span>
          </label>
        ))}
      </div>

      <div
        className="rounded-[20px] shadow-[0px_4px_24px_rgba(0,0,0,0.06)] border border-[#f0f0f0] overflow-hidden"
        style={{
          backgroundColor: "var(--theme-hero-booking-bg, #ffffff)",
          borderColor: "var(--theme-card-border, #f0f0f0)"
        }}
        suppressHydrationWarning
      >
        {mounted && (
          <>
            {isTransferMode ? (
              <>
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
                <div
                  className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4 px-4 py-3 border-t"
                  style={{ borderColor: "var(--theme-hero-booking-border, #f0f0f0)" }}
                >
                  <div className="flex justify-start w-full md:w-auto">
                    {destinations.length === 1 ? (
                      <button
                        onClick={addDestination}
                        type="button"
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-[14px] font-bold hover:bg-zinc-50 transition-all cursor-pointer"
                        style={{ color: "var(--theme-hero-booking-text, #808080)" }}
                      >
                        <Plus data-theme-color="heroBookingIcon" className="w-5 h-5 shrink-0" strokeWidth={2.5} style={{ color: "var(--theme-hero-booking-icon, #27C7FF)" }} />
                        {t("addStop")}
                      </button>
                    ) : (
                      <button
                        onClick={removeDestination}
                        type="button"
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-[14px] font-bold hover:bg-zinc-50 transition-all cursor-pointer"
                        style={{ color: "var(--theme-hero-booking-text, #808080)" }}
                      >
                        <CircleMinus data-theme-color="heroBookingIcon" className="w-5 h-5 shrink-0" strokeWidth={2.5} style={{ color: "var(--theme-hero-booking-icon, #27C7FF)" }} />
                        {t("removeStop")}
                      </button>
                    )}
                  </div>
                  <TrustBanner translations={trustTranslations} />
                  <div className="flex-1 hidden md:block min-w-0" />
                </div>
              </>
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

      {mounted && !isTransferMode && (
        <div className="mt-4 flex items-center justify-center">
          <TrustBanner translations={trustTranslations} />
        </div>
      )}
    </motion.div>
  )
}
