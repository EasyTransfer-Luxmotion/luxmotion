"use client"

import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  STANDARD_VEHICLES,
  XL_VEHICLES,
  EXECUTIVE_VEHICLES,
  VAN_VEHICLES,
  MINIBUS_VEHICLES,
  COACH_VEHICLES,
} from "@/lib/fleet-vehicles-data"
import type { FleetVehicle } from "@/components/fleet/fleet-vehicle-card-dark"

type CategoryId = "standard" | "xl" | "executivo" | "van" | "minibus" | "bus"

const CATEGORIES: readonly { id: CategoryId; image: string; active?: boolean }[] = [
  { id: "standard", image: "/fleet/cat-standard.webp", active: true },
  { id: "xl", image: "/fleet/cat-xl.png" },
  { id: "executivo", image: "/fleet/cat-executivo.png" },
  { id: "van", image: "/fleet/cat-van.webp" },
  { id: "minibus", image: "/fleet/cat-minibus.png" },
  { id: "bus", image: "/fleet/cat-bus.png" },
] as const

const VEHICLES_BY_CATEGORY: Record<CategoryId, FleetVehicle[]> = {
  standard: STANDARD_VEHICLES,
  xl: XL_VEHICLES,
  executivo: EXECUTIVE_VEHICLES,
  van: VAN_VEHICLES,
  minibus: MINIBUS_VEHICLES,
  bus: COACH_VEHICLES,
}

export function Fleet({ showControls = true }: { showControls?: boolean } = {}) {
  const t = useTranslations("fleet")
  const [activeCategory, setActiveCategory] = useState<CategoryId>("standard")
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [perView, setPerView] = useState(1)

  const vehicles = useMemo(() => VEHICLES_BY_CATEGORY[activeCategory], [activeCategory])
  const categoryLabel = t(`categories.${activeCategory}.label`)

  const measurePerView = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const first = el.querySelector<HTMLElement>("[data-card]")
    const step = first ? first.offsetWidth + 2 : el.clientWidth
    setPerView(Math.max(1, Math.round(el.clientWidth / step)))
  }, [])

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0
    setActiveIndex(0)
    measurePerView()
  }, [activeCategory, measurePerView])

  useEffect(() => {
    measurePerView()
    window.addEventListener("resize", measurePerView)
    return () => window.removeEventListener("resize", measurePerView)
  }, [measurePerView])

  const pageCount = Math.max(1, vehicles.length - perView + 1)
  const currentPage = Math.min(activeIndex, pageCount - 1)

  const scrollByCards = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    const first = el.querySelector<HTMLElement>("[data-card]")
    const step = first ? first.offsetWidth + 2 : el.clientWidth
    el.scrollBy({ left: dir * step, behavior: "smooth" })
  }

  const onScroll = () => {
    const el = scrollerRef.current
    if (!el) return
    const first = el.querySelector<HTMLElement>("[data-card]")
    const step = first ? first.offsetWidth + 2 : 1
    setActiveIndex(Math.round(el.scrollLeft / step))
  }

  return (
    <section
      id="fleet"
      className={`bg-[var(--lm-bg,#0D0D0D)] pt-10 px-4 md:px-[82px] ${showControls ? "pb-16" : "pb-2"}`}
    >
      <div className="max-w-[1280px] mx-auto flex flex-col items-center gap-6">
        <div
          className="flex flex-col items-start gap-2 w-full"
          style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-px bg-[var(--lm-accent,#C9A96E)]" />
            <span className="text-[12px] font-semibold tracking-[2px] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] leading-none">
              {t("sectionLabel")}
            </span>
          </div>
          <h2
            className="text-[32px] md:text-[48px] font-normal text-[var(--lm-text,#F5F5F5)] leading-none"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            {t("titleHeading")}
          </h2>
          <p className="text-[15px] md:text-[18px] leading-[1.42] text-[var(--lm-muted,#999)]">
            {t("subtitle")}
          </p>
        </div>

        <div className="flex flex-col gap-[2px] w-full">
          <div className="grid grid-cols-2 md:flex md:flex-row gap-[2px] w-full">
            {CATEGORIES.map((cat) => (
              <CategoryCard
                key={cat.id}
                image={cat.image}
                label={t(`categories.${cat.id}.label`)}
                passengers={t(`categories.${cat.id}.passengers`)}
                active={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
              />
            ))}
          </div>

          <div
            ref={scrollerRef}
            onScroll={onScroll}
            key={activeCategory}
            className="flex md:h-[340px] w-full overflow-x-auto snap-x snap-mandatory scroll-smooth gap-[2px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden animate-in fade-in duration-300"
          >
            {vehicles.map((v) => (
              <FeaturedCard
                key={v.id}
                image={v.image}
                label={categoryLabel}
                name={v.name}
                specs={`${v.paxMin}-${v.paxMax} pax · ${v.bags} ${v.bags === 1 ? "bag" : "bags"}`}
              />
            ))}
          </div>
        </div>

        {showControls && (
          <>
            <div className="flex items-center justify-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => scrollByCards(-1)}
                aria-label={t("previousSlide")}
                className="size-12 border-[1.714px] border-[rgba(var(--lm-accent-rgb,154,117,53),0.22)] flex items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:border-[var(--lm-accent,#C9A96E)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] transition cursor-pointer"
              >
                <ArrowRight className="size-[18px] rotate-180" strokeWidth={1.7} />
              </button>
              <div className="flex items-center gap-[6px] px-2">
                {Array.from({ length: pageCount }).map((_, i) => (
                  <span
                    key={i}
                    className={`rounded-full transition-all duration-300 ${
                      i === currentPage
                        ? "size-[6px] bg-[var(--lm-accent,#C9A96E)]"
                        : "size-[5px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.35)]"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => scrollByCards(1)}
                aria-label={t("nextSlide")}
                className="size-12 border-[1.714px] border-[rgba(var(--lm-accent-rgb,154,117,53),0.22)] flex items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:border-[var(--lm-accent,#C9A96E)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] transition cursor-pointer"
              >
                <ArrowRight className="size-[18px]" strokeWidth={1.7} />
              </button>
            </div>

            <Link
              href="/fleet"
              className="group inline-flex items-center justify-center gap-2 border border-[var(--lm-accent,#C9A96E)] h-12 px-6 mt-2 text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] transition-colors"
              style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
            >
              <span className="text-[14px] font-medium tracking-[1.1px] uppercase">
                {t("exploreFleet")}
              </span>
              <ArrowUpRight
                className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2}
              />
            </Link>
          </>
        )}
      </div>
    </section>
  )
}

function CategoryCard({
  image,
  label,
  passengers,
  active,
  onClick,
}: {
  image: string
  label: string
  passengers: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 min-w-0 border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex flex-col items-center cursor-pointer transition-colors duration-200 hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.10)] overflow-hidden ${
        active ? "bg-[var(--lm-bg,#0D0D0D)]" : "bg-[var(--lm-surface,#1A1A1A)]"
      }`}
    >
      <div className={`absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--lm-accent,#C9A96E)] transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`} />
      <div className="relative h-[118px] w-[114px] mt-4">
        <Image
          src={image}
          alt={label}
          fill
          className="object-contain"
          sizes="114px"
        />
      </div>
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-4 w-full">
        <span
          className={`text-[12px] font-semibold tracking-[2px] uppercase leading-none transition-colors duration-200 ${
            active ? "text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" : "text-[var(--lm-muted,#999)]"
          }`}
          style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
        >
          {label}
        </span>
        <span
          className="text-[12px] text-[var(--lm-text,#fff)]/55 leading-[1.2] text-center"
          style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
        >
          {passengers}
        </span>
      </div>
    </button>
  )
}

function FeaturedCard({
  image,
  label,
  name,
  specs,
}: {
  image: string
  label: string
  name: string
  specs: string
}) {
  return (
    <div
      data-card
      className="snap-start shrink-0 basis-full md:basis-1/3 min-w-0 border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex flex-col overflow-hidden"
    >
      <div className="relative h-[200px] md:h-auto md:flex-1">
        <div className="absolute inset-0 bg-gradient-to-b from-[33.22%] from-[rgba(var(--lm-bg-rgb,0,0,0),0.1)] to-[rgba(var(--lm-accent-rgb,201,169,110),0.1)] z-[1] pointer-events-none" />
        <Image
          src={image}
          alt={name}
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
      </div>
      <div className="relative h-[120px] flex flex-col justify-center gap-2 px-6 py-5 bg-gradient-to-t from-[var(--lm-bg,#000)] to-[rgba(var(--lm-bg-rgb,13,13,13),0.9)]">
        <span
          className="text-[12px] font-semibold tracking-[2px] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] leading-none"
          style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
        >
          {label}
        </span>
        <span
          className="text-[24px] md:text-[20px] font-semibold md:font-normal text-[var(--lm-text,#fff)] leading-none"
          style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
        >
          {name}
        </span>
        <span
          className="text-[12px] text-[var(--lm-text,#fff)]/55 leading-[1.2]"
          style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
        >
          {specs}
        </span>
      </div>
    </div>
  )
}
