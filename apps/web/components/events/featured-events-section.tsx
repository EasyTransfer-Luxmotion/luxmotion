"use client"

import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { useLocale, useTranslations } from "next-intl"
import { dataDoEvento } from "@/lib/hora-lisboa"
import { precoDeMontra } from "@/hooks/use-event-data"
import { Calendar, MapPin, ArrowRight, Star, Loader2 } from "lucide-react"
import { useFeaturedEvents, type EventData } from "@/hooks/use-event-data"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const


/* Os três badges assentam sobre a fotografia do evento: o contraste vem da
   foto, não do tema, por isso ficam escuros nos dois modos. */
function DateBadge({ date, endDate }: { date: number; endDate?: number }) {
  // Dia e hora de Lisboa, na língua da página (lib/hora-lisboa.ts).
  const locale = useLocale()
  return (
    <div className="absolute top-3 left-3 backdrop-blur-[4px] bg-[rgba(13,13,13,0.82)] border border-[rgba(201,169,110,0.2)] flex items-center gap-[7px] px-3 py-[6px]">
      <Calendar className="size-[11px] text-white" strokeWidth={1.5} />
      <span className="text-[12px] font-medium text-white whitespace-nowrap" style={sans}>
        {dataDoEvento(date, endDate, locale)}
      </span>
    </div>
  )
}

function FeaturedBadge({ label }: { label: string }) {
  return (
    <div className="absolute top-3 right-3 bg-[#C9A96E] flex items-center gap-1 px-[9px] py-1">
      <Star className="size-[14px] text-[#0D0D0D]" fill="#0D0D0D" strokeWidth={0} />
      <span className="text-[12px] font-medium text-[#0D0D0D] uppercase tracking-[1.12px]" style={sans}>
        {label}
      </span>
    </div>
  )
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <div className="absolute bottom-3 left-3 backdrop-blur-[3px] bg-[rgba(13,13,13,0.75)] border border-[rgba(255,255,255,0.1)] px-[10px] py-1">
      <span className="text-[12px] text-[rgba(255,255,255,0.6)] uppercase tracking-[0.72px]" style={sans}>
        {category}
      </span>
    </div>
  )
}

function CardFooter({ event, isHero }: { event: Partial<EventData>; isHero?: boolean }) {
  const t = useTranslations("eventsPage")
  /* O mesmo critério da grelha logo abaixo: o lugar partilhado, que é o mais
     barato. Estas duas secções vivem na mesma página — o destaque a dizer €135
     e a grelha a dizer €35 era pior do que estava. */
  const montra = precoDeMontra(event)
  // "€0" lia-se como grátis; a maioria dos eventos ainda não tem preço.
  const price = montra.valor > 0 ? `€${montra.valor}` : t("priceOnRequest")
  const unidade = montra.unidade === "person" ? t("perPerson") : t("perVehicle")
  return (
    <div className="border-t-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex items-center justify-between pt-[13px]">
      <div className="flex items-baseline gap-2">
        <span
          className={`${isHero ? "text-[24px]" : "text-[18px]"} font-bold text-[var(--lm-accent,#C9A96E)] leading-none`}
          style={serif}
        >
          {montra.valor > 0 && !isHero ? `${t("from")} ${price}` : price}
        </span>
        {montra.valor > 0 && (
          <span className="text-[11px] text-[var(--lm-muted,#999)]" style={sans}>
            {unidade}
          </span>
        )}
      </div>
      <div className="size-8 border-[1.143px] border-[rgba(var(--lm-accent-rgb,154,117,53),0.22)] flex items-center justify-center">
        <ArrowRight className="size-[18px] text-[var(--lm-accent,#C9A96E)]" strokeWidth={1.5} />
      </div>
    </div>
  )
}

function HeroCard({ event, featuredLabel }: { event: Partial<EventData>; featuredLabel: string }) {
  return (
    <Link
      href={`/events/${event.slug}`}
      className="bg-[var(--lm-surface,#1e1e1e)] flex flex-col overflow-clip group flex-1 min-w-0 h-[550px] md:h-full"
    >
      <div className="relative h-[250px] md:h-[411px] shrink-0 overflow-clip">
        {event.bannerImageUrl && (
          <Image
            src={event.bannerImageUrl}
            alt={event.title ?? ""}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 60vw"
          />
        )}
        <DateBadge date={event.eventDate!} endDate={event.endDate} />
        {event.isFeatured && <FeaturedBadge label={featuredLabel} />}
        {event.tags?.[0] && <CategoryBadge category={event.tags[0]} />}
      </div>
      <div className="flex flex-col flex-1 px-6 py-[18px]">
        <div className="flex items-center gap-1 pb-[7px]">
          <MapPin className="size-4 text-[var(--lm-muted,#999)]" strokeWidth={1.5} />
          <span className="text-[12px] text-[var(--lm-muted,#999)]" style={sans}>{event.location}</span>
          {event.venue && (
            <>
              <span className="text-[10px] text-[var(--lm-muted,rgba(255,255,255,0.18))] px-[2px]">·</span>
              <span className="text-[12px] text-[var(--lm-muted,#999)]" style={sans}>{event.venue}</span>
            </>
          )}
        </div>
        <h3 className="text-[18px] md:text-[18px] font-bold text-[var(--lm-text,#fff)] leading-[24px] pb-[6px]" style={serif}>
          {event.title}
        </h3>
        <p className="text-[14px] text-[var(--lm-muted,#999)] leading-[1.26] flex-1 pb-[14px]" style={sans}>
          {event.subtitle}
        </p>
        <CardFooter event={event} isHero />
      </div>
    </Link>
  )
}

function SideCard({ event }: { event: Partial<EventData> }) {
  return (
    <Link
      href={`/events/${event.slug}`}
      className="bg-[var(--lm-surface,#1e1e1e)] flex flex-col overflow-clip group flex-1 min-h-0 h-[340px] md:h-auto"
    >
      <div className="relative h-[155px] shrink-0 overflow-clip">
        {event.bannerImageUrl && (
          <Image
            src={event.bannerImageUrl}
            alt={event.title ?? ""}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 40vw"
          />
        )}
        <DateBadge date={event.eventDate!} endDate={event.endDate} />
        {event.tags?.[0] && <CategoryBadge category={event.tags[0]} />}
      </div>
      <div className="flex flex-col flex-1 px-6 py-[18px]">
        <div className="flex items-center gap-1 pb-[7px]">
          <MapPin className="size-4 text-[var(--lm-muted,#999)]" strokeWidth={1.5} />
          <span className="text-[12px] text-[var(--lm-muted,#999)]" style={sans}>{event.location}</span>
          {event.venue && (
            <>
              <span className="text-[10px] text-[var(--lm-muted,rgba(255,255,255,0.18))] px-[2px]">·</span>
              <span className="text-[12px] text-[var(--lm-muted,#999)]" style={sans}>{event.venue}</span>
            </>
          )}
        </div>
        <h3 className="text-[18px] md:text-[18px] font-bold text-[var(--lm-text,#fff)] leading-[19px] pb-[6px]" style={serif}>
          {event.title}
        </h3>
        <p className="text-[14px] text-[var(--lm-muted,#999)] leading-[1.3] pb-[14px]" style={sans}>
          {event.subtitle}
        </p>
        <CardFooter event={event} />
      </div>
    </Link>
  )
}

export function FeaturedEventsSection({
  initialFeatured,
}: {
  /** Resolvidos no servidor: é o que põe os eventos no HTML do índice. */
  initialFeatured?: EventData[] | null
} = {}) {
  const t = useTranslations("eventsPage")
  const { events: dbEvents, isLoading } = useFeaturedEvents(3, initialFeatured)

  // Só os eventos reais. Havia aqui um conjunto fixo (Rock in Rio, NOS Alive,
  // Estoril Classics) que entrava sempre que a base de dados devolvia vazio —
  // a secção parecia povoada e escondia o facto de nada estar publicado.
  const events = dbEvents.map((e) => ({
    ...e,
    subtitle: e.subtitle ?? "",
  }))

  if (isLoading) {
    return (
      <section className="bg-[var(--lm-bg,#161616)] border-b-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] py-[72px] px-4 md:px-[82px]">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-[var(--lm-muted,#999)]" />
        </div>
      </section>
    )
  }

  if (events.length === 0) return null

  const hero = events[0]!
  const side = events.slice(1, 3)

  return (
    <section className="bg-[var(--lm-bg,#161616)] border-b-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] py-6 md:py-[72px] px-4 md:px-[82px]">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-9">
        <div className="flex flex-col items-center gap-[10px]">
          <div className="flex items-center gap-[10px]">
            <div className="w-5 h-px bg-[var(--lm-accent,#C9A96E)]" />
            <span className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent,#C9A96E)]" style={sans}>
              {t("featured")}
            </span>
            <div className="w-5 h-px bg-[var(--lm-accent,#C9A96E)]" />
          </div>
          <h2 className="text-[32px] md:text-[48px] font-light text-[var(--lm-text,#fff)] text-center" style={serif}>
            {t("featuredHeading")}{" "}
            <span className="italic text-[var(--lm-accent,#C9A96E)]">{t("featuredHeadingAccent")}</span>
          </h2>
        </div>

        <div className="flex flex-col md:flex-row gap-[3px] md:h-[667px]">
          <HeroCard event={hero} featuredLabel={t("featured")} />
          {side.length > 0 && (
            <div className="flex flex-col gap-[3px] md:w-[532px] md:shrink-0">
              {side.map((event) => (
                <SideCard key={event._id} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
