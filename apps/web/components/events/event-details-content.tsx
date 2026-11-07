"use client"

import { Suspense, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Calendar, Clock, MapPin, Users } from "lucide-react"
import type { Id } from "@workspace/convex/dataModel"
import { TipTapRenderer } from "@/components/shared/tiptap-renderer"
import { TourBookingCard } from "@/components/tours/tour-booking-card"
import { useTourCheckout } from "@/components/tours/tour-checkout-context"
import { TourDetailsHero, type MediaItem } from "@/components/tours/tour-details-hero"
import { TourIncludedExcluded } from "@/components/tours/tour-included-excluded"
import { EventLocationMap } from "./event-location-map"
import { EventReviews } from "./event-reviews"
import { AddonCarouselSection } from "@/components/shared/addon-carousel-section"
import { validEventSelection } from "@/lib/event-date-time"

export interface EventDetailsData {
  _id?: string
  slug: string
  title: string
  subtitle?: string
  description: string | Record<string, any>
  location: string
  venue?: string
  eventDate: number
  endDate?: number
  /** Preço por pessoa em lugar partilhado; sem ele o evento só se vende em privado. */
  sharedPrice?: number
  /** Hora de regresso ao ponto de encontro. */
  returnAt?: number
  /** Horas antes da partida em que a viagem se confirma; 72 por omissão. */
  confirmationHours?: number
  /** A viatura do serviço, já resolvida pela query. */
  vehicle?: { name: string; examples?: string; passengers: number } | null
  bannerImage: string
  additionalBannerImages?: string[]
  images?: string[]
  /** Viatura inteira. */
  privatePrice: number
  originalPrice?: number
  currency: string
  maxCapacity?: number
  minPassengers?: number
  maxPassengers?: number
  rating?: number
  reviewCount?: number
  tags?: string[]
  included?: string[]
  excluded?: string[]
  meetingPoint?: {
    title: string
    address: string
    description?: string
    lat?: number
    lng?: number
  }
  addons?: {
    _id: string
    title: string
    description?: string
    imageUrl?: string | null
    price: number
    pricingType: "per_person" | "flat"
    currency: string
  }[]
  reviews?: {
    author: string
    avatar?: string
    rating: number
    text: string
    source?: string
    nationality?: string
    createdAt?: number
  }[]
}

interface EventDetailsContentProps {
  event: EventDetailsData
}

function InfoBox({
  icon,
  label,
  value,
  size = "desktop",
}: {
  icon: React.ReactNode
  label: string
  value: string
  size?: "desktop" | "mobile"
}) {
  const iconSize = size === "mobile" ? "size-[40px] border-[1.667px]" : "size-[32px] border-[1.333px]"
  return (
    <div className="flex-1 min-w-0 flex items-center gap-[10px] bg-[var(--lm-surface,#141414)] border-[0.8px] border-[rgba(var(--lm-accent-rgb,154,117,53),0.22)] pl-[16.8px] pr-[16.8px] py-[8.8px]">
      <div className={`shrink-0 ${iconSize} bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border-[rgba(var(--lm-accent-rgb,201,169,110),0.25)] flex items-center justify-center`}>
        {icon}
      </div>
      <div className="flex flex-col gap-[8px] min-w-0">
        <span
          className="text-[10px] font-semibold text-[var(--lm-muted,#999)] tracking-[1.2px] uppercase leading-none whitespace-nowrap"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {label}
        </span>
        <span
          className="text-[14px] font-medium text-[var(--lm-text,#fff)] leading-none whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {value}
        </span>
      </div>
    </div>
  )
}

function EventCheckoutAutoOpen({ event }: { event: any }) {
  const { openCheckout } = useTourCheckout()
  const searchParams = useSearchParams()
  const hasOpenedCheckout = useRef(false)

  useEffect(() => {
    if (searchParams.get("openCheckout") === "true" && event._id && !hasOpenedCheckout.current) {
      const dateStr = searchParams.get("date")
      const date = dateStr ? new Date(dateStr) : null
      const time = searchParams.get("time")
      // The widget must supply a chosen pickup; never silently reserve midnight.
      if (!validEventSelection({ date, time }, event.eventDate, event.endDate)) return
      hasOpenedCheckout.current = true
      const adults = parseInt(searchParams.get("adults") || "1", 10)
      const children = parseInt(searchParams.get("children") || "0", 10)
      const infants = parseInt(searchParams.get("infants") || "0", 10)
      const guests = adults + children + infants || 1
      /* As mesmas regras do cartão de reserva: com opção partilhada, o preço
         privado é o da viatura e vende-se uma vez. Aqui multiplicava-se pelas
         pessoas — quatro pessoas pagavam quatro viaturas. O widget da página
         inicial não deixa escolher, e mostra o preço da viatura. */
      const temEscolha = typeof event.sharedPrice === "number" && event.sharedPrice > 0
      const total = temEscolha ? event.privatePrice : event.privatePrice * guests

      setTimeout(() => {
        openCheckout(
          "event",
          {
            _id: event._id!,
            title: event.title,
            slug: event.slug,
            price: event.privatePrice,
            ...(temEscolha && { sharingMode: "private" as const, perVehicle: true }),
            vehicleSeats: event.vehicle?.passengers,
            maxPassengers: event.maxPassengers,
            currency: event.currency ?? "€",
            image: event.bannerImage,
            meetingPoint: event.meetingPoint,
          },
          {
            date,
            time,
            adults,
            children,
            infants,
            total,
          }
        )
      }, 100)
    }
  }, [searchParams, event, openCheckout])
  return null
}

export function EventDetailsContent({ event }: EventDetailsContentProps) {
  const t = useTranslations("eventDetails")
  const { openCheckout } = useTourCheckout()
  /* O auto-abrir do checkout lê os parâmetros do endereço, e isso impede a
     página de ser pré-gerada. Isolado aqui dentro, só esta parte espera pelo
     cliente — o conteúdo do event continua a sair no HTML. */


  const handleBook = (data: {
    date: Date | null
    time: string | null
    adults: number
    children: number
    infants: number
    total: number
    sharingMode?: "private" | "shared"
    unitPrice?: number
    perVehicle?: boolean
    selectedAddons?: Array<{
      addonId?: string
      universalAddonId?: string
      title: string
      price: number
      pricingType: "per_person" | "flat"
      quantity: number
      subtotal: number
    }>
    addonsTotal?: number
  }) => {
    if (!event._id) return
    openCheckout(
      "event",
      {
        _id: event._id,
        title: event.title,
        slug: event.slug,
        /* O preço que segue para o checkout é o da opção escolhida — o
           `openCheckout` multiplica-o pelos passageiros. */
        price: data.unitPrice ?? event.privatePrice,
        sharingMode: data.sharingMode,
        perVehicle: data.perVehicle,
        vehicleSeats: event.vehicle?.passengers,
        maxPassengers: event.maxPassengers,
        currency: event.currency ?? "€",
        image: event.bannerImage,
        meetingPoint: event.meetingPoint,
      },
      {
        date: data.date,
        time: data.time,
        adults: data.adults,
        children: data.children,
        infants: data.infants,
        total: data.total,
        selectedAddons: data.selectedAddons,
        addonsTotal: data.addonsTotal,
      }
    )
  }

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    })

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })

  const titleWords = event.title.split(" ")
  const lastTitleWord = titleWords.pop() || ""
  const restTitle = titleWords.join(" ")

  const timeRange = event.endDate
    ? `${formatTime(event.eventDate)} - ${formatTime(event.endDate)}`
    : formatTime(event.eventDate)

  /* O que a barra de reserva mostra sobre o serviço. A rota sai do ponto de
     encontro e do local — não há campo para ela, nem precisa. */
  const servico = {
    origin: event.meetingPoint?.title || event.location,
    destination: event.venue || event.location,
    returnTime: event.returnAt
      ? new Date(event.returnAt).toLocaleTimeString("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : undefined,
    vehicleName: event.vehicle?.name,
    vehicleSeats: event.vehicle?.passengers,
    confirmationHours: event.confirmationHours,
  }

  const infoItems = [
    { key: "date", icon: Calendar, label: t("date"), value: formatDate(event.eventDate) },
    { key: "time", icon: Clock, label: t("time"), value: timeRange },
    { key: "location", icon: MapPin, label: t("location"), value: event.venue || event.location },
    ...(event.maxCapacity
      ? [
          {
            key: "capacity",
            icon: Users,
            label: t("capacity"),
            value: t("maxCapacity", { count: event.maxCapacity }),
          },
        ]
      : []),
  ]

  return (
    <>
      <Suspense fallback={null}>
        <EventCheckoutAutoOpen event={event} />
      </Suspense>
    <div className="w-full">
      <TourDetailsHero
        image={event.bannerImage}
        additionalBanners={(event.additionalBannerImages ?? []).map(
          (url): MediaItem => ({ url, type: "image" })
        )}
        alt={event.title}
      />

      <div className="px-4 md:px-5 lg:px-6 xl:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:gap-8">
            <div className="flex-1 min-w-0">
              <div className="pt-[20px] md:pt-[28px] pb-[17px] flex flex-col gap-[13.2px] items-start">
                <div className="hidden md:flex gap-4 w-full max-w-[1280px]">
                  {infoItems.map(({ key, icon: Icon, label, value }) => (
                    <InfoBox
                      key={key}
                      icon={<Icon className="size-[16px] text-[var(--lm-accent,#C9A96E)]" strokeWidth={1.5} />}
                      label={label}
                      value={value}
                    />
                  ))}
                </div>
                <div className="md:hidden grid grid-cols-2 gap-3 w-full">
                  {infoItems.map(({ key, icon: Icon, label, value }) => (
                    <InfoBox
                      key={key}
                      size="mobile"
                      icon={<Icon className="size-[20px] text-[var(--lm-accent,#C9A96E)]" strokeWidth={1.5} />}
                      label={label}
                      value={value}
                    />
                  ))}
                </div>

                {event.tags && event.tags.length > 0 && (
                  <div className="flex items-center gap-[10px] pt-[16px] w-full">
                    <div className="w-[20px] h-px bg-[var(--lm-accent,#C9A96E)]" />
                    <span
                      className="text-[12px] font-semibold text-[var(--lm-accent,#C9A96E)] tracking-[2.25px] uppercase"
                      style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                    >
                      {event.tags.join(" · ")}
                    </span>
                  </div>
                )}

                <div className="flex flex-col items-start w-full">
                  <h1
                    className="text-[36px] md:text-[48px] text-[var(--lm-text,#fff)] leading-[1.17] font-light break-words"
                    style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
                  >
                    {restTitle}
                    {restTitle ? " " : ""}
                    <span className="italic text-[var(--lm-accent,#C9A96E)] font-light">{lastTitleWord}</span>
                  </h1>

                  {event.rating !== undefined && event.rating > 0 && (
                    <div className="flex items-center gap-[10px] pt-[2.8px] w-full">
                      <span className="text-[14px] text-[var(--lm-accent,#C9A96E)] tracking-[1px] leading-none">★★★★★</span>
                      <span
                        className="text-[16px] text-[var(--lm-text,#fff)] leading-none font-normal"
                        style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
                      >
                        {event.rating.toFixed(1)}
                      </span>
                      <span
                        className="text-[12px] text-[var(--lm-muted,#999)] leading-none"
                        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                      >
                        · {event.reviewCount ?? 0} {t("reviewsCount")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <h2
                  className="text-[24px] md:text-[32px] text-[var(--lm-text,#fff)] leading-[1.3] mb-6"
                  style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
                >
                  {t("aboutPrefix")}{" "}
                  <span className="italic text-[var(--lm-accent,#C9A96E)]">{t("aboutAccent")}</span>
                </h2>
                <TipTapRenderer
                  content={event.description}
                  className="text-[14px] lg:text-[16px] text-[var(--lm-muted,#999)] leading-[1.6]"
                />
              </div>

              {((event.included?.length ?? 0) > 0 || (event.excluded?.length ?? 0) > 0) && (
                <div className="mt-10">
                  <TourIncludedExcluded
                    included={event.included ?? []}
                    excluded={event.excluded ?? []}
                  />
                </div>
              )}

              {event.addons && event.addons.length > 0 && (
                <AddonCarouselSection addons={event.addons} />
              )}

              {event.meetingPoint?.lat && event.meetingPoint?.lng && (
                <div
                  id="event-location"
                  className="border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.06)] mt-10 pt-10 scroll-mt-24"
                >
                  <h2
                    className="text-[24px] italic text-[var(--lm-accent,#c9a96e)] mb-5 font-medium"
                    style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
                  >
                    {t("location")}
                  </h2>
                  <div className="overflow-hidden border border-[rgba(var(--lm-accent-rgb,201,169,110),0.22)]">
                    <EventLocationMap
                      title={event.meetingPoint.title}
                      address={event.meetingPoint.address}
                      lat={event.meetingPoint.lat}
                      lng={event.meetingPoint.lng}
                      className="h-[500px]"
                    />
                  </div>
                </div>
              )}

              {event.meetingPoint && (
                <div className="border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.06)] mt-10 pt-10">
                  <h2
                    className="text-[24px] italic text-[var(--lm-accent,#c9a96e)] mb-5 font-medium"
                    style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
                  >
                    {t("meetingPoint")}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      if (event.meetingPoint?.lat && event.meetingPoint?.lng) {
                        const locationSection = document.getElementById("event-location")
                        if (locationSection) {
                          locationSection.scrollIntoView({ behavior: "smooth" })
                          setTimeout(() => {
                            window.dispatchEvent(new CustomEvent("event-map-focus"))
                          }, 500)
                        }
                      } else {
                        const query = encodeURIComponent(
                          event.meetingPoint?.address || event.meetingPoint?.title || ""
                        )
                        window.open(
                          `https://www.google.com/maps/search/?api=1&query=${query}`,
                          "_blank"
                        )
                      }
                    }}
                    className="w-full text-left bg-[var(--lm-surface,#1a1a1a)] border-l-[1.6px] border-transparent p-[24px] flex flex-col gap-[8px] transition-colors hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] hover:border-[var(--lm-accent,#c9a96e)] cursor-pointer"
                  >
                    <div className="size-[24px] rounded-[12px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.15)] border-[0.857px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] flex items-center justify-center">
                      <MapPin className="size-[10px] text-[var(--lm-accent,#c9a96e)]" strokeWidth={2} />
                    </div>
                    <span
                      className="text-[8px] font-bold text-[var(--lm-accent,#c9a96e)] tracking-[1.2px] uppercase"
                      style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                    >
                      {t("meetingLocationLabel")}
                    </span>
                    <div className="flex flex-col gap-[2px]">
                      <span
                        className="text-[20px] text-[var(--lm-text,#fff)] leading-[1.2]"
                        style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
                      >
                        {event.meetingPoint.title}
                      </span>
                      <span
                        className="text-[12px] text-[var(--lm-muted,#8c8680)]"
                        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                      >
                        {event.meetingPoint.address}
                      </span>
                    </div>
                    {event.meetingPoint.description && (
                      <p
                        className="text-[11px] text-[var(--lm-muted,rgba(255,255,255,0.3))] leading-[17.6px]"
                        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                      >
                        {event.meetingPoint.description}
                      </p>
                    )}
                  </button>
                </div>
              )}

              {event._id && (
                <div className="border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.06)] mt-10 pt-10 pb-10">
                  <EventReviews
                    eventId={event._id as Id<"events">}
                    rating={event.rating ?? 0}
                    reviewCount={event.reviewCount ?? 0}
                    initialReviews={event.reviews}
                  />
                </div>
              )}
            </div>

            <div className="hidden lg:block w-[29%] min-w-[320px] max-w-[380px] shrink-0 pt-[20px] md:pt-[28px]">
              <div className="sticky top-[70px]">
                <TourBookingCard
                  price={event.privatePrice}
                  sharedPrice={event.sharedPrice}
                  service={servico}
                  rating={event.rating ?? 0}
                  reviewCount={event.reviewCount ?? 0}
                  tourId={event._id}
                  skipAvailability
                  fixedDateTime={event.eventDate}
                  eventEndDate={event.endDate}
                  hideReviews
                  minPassengers={event.minPassengers}
                  maxPassengers={event.maxPassengers}
                  addons={event.addons}
                  onBook={handleBook}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:hidden px-4 pb-8">
        <TourBookingCard
          price={event.privatePrice}
          sharedPrice={event.sharedPrice}
          service={servico}
          rating={event.rating ?? 0}
          reviewCount={event.reviewCount ?? 0}
          tourId={event._id}
          skipAvailability
          fixedDateTime={event.eventDate}
          eventEndDate={event.endDate}
          hideReviews
          minPassengers={event.minPassengers}
          maxPassengers={event.maxPassengers}
          addons={event.addons}
          onBook={handleBook}
        />
      </div>
    </div>
    </>
  )
}
