"use client"

import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { useSwipe } from "@/hooks/use-swipe"

type TourId = "lisboa" | "porto" | "algarve" | "alentejo" | "acores" | "madeira"

const TOURS: readonly { id: TourId; image: string }[] = [
  { id: "lisboa", image: "/tours/regions/regions-lisboa.webp" },
  { id: "porto", image: "/tours/regions/regions-porto.webp" },
  { id: "algarve", image: "/tours/regions/regions-algarve.webp" },
  { id: "alentejo", image: "/tours/regions/regions-alentejo.webp" },
  { id: "acores", image: "/tours/regions/regions-acores.webp" },
  { id: "madeira", image: "/tours/regions/regions-madeira.webp" },
] as const

const VISIBLE_DESKTOP = 3
const STEP_DESKTOP = 2

export function ToursSection() {
  const t = useTranslations("tours")
  const [page, setPage] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)")
    const update = () => setIsMobile(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  const visible = isMobile ? 1 : VISIBLE_DESKTOP
  const step = isMobile ? 1 : STEP_DESKTOP
  const maxOffset = Math.max(0, TOURS.length - visible)
  const totalPages = Math.ceil(maxOffset / step) + 1

  const currentPage = Math.min(page, totalPages - 1)
  const offset = Math.min(maxOffset, currentPage * step)

  const goPrev = useCallback(() => {
    setPage((p) => Math.max(0, p - 1))
  }, [])

  const goNext = useCallback(() => {
    setPage((p) => Math.min(totalPages - 1, p + 1))
  }, [totalPages])

  const goToPage = (p: number) => {
    setPage(p)
  }

  const swipeHandlers = useSwipe(goNext, goPrev)

  const translatePercent = isMobile ? offset * 100 : offset * (100 / 3)

  return (
    <section
      id="tours"
      className="bg-[var(--lm-bg,#0D0D0D)] pt-10 pb-16"
    >
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col items-center gap-6">
        <div className="flex flex-col items-start gap-2 w-full">
          <div
            className="flex items-center gap-2"
            style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
          >
            <div className="w-8 h-px bg-[var(--lm-accent,#C9A96E)]" />
            <span className="text-[10px] font-semibold tracking-[2px] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] leading-none">
              {t("sectionLabel")}
            </span>
          </div>
          <h2
            className="text-[36px] sm:text-[42px] lg:text-[48px] font-light leading-[1.05] text-[var(--lm-text,#F5F5F5)]"
            style={{
              fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
              whiteSpace: "pre-line",
            }}
          >
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] font-medium">{t("titleGold")}</span>{" "}
            {t("titleRest")}
          </h2>
          <p
            className="text-[13px] lg:text-[14px] leading-[1.4] text-[var(--lm-muted,#999)] max-w-[995px] mt-1"
            style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
          >
            {t("description")}
          </p>
        </div>

        <div
          className="w-full overflow-hidden mt-10 lg:mt-16"
          {...swipeHandlers}
        >
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${translatePercent}%)` }}
          >
            {TOURS.map((tour) => (
              <div
                key={tour.id}
                className="flex-none w-full md:w-1/3 md:pr-[6px] md:last:pr-0"
              >
                <TourCard
                  id={tour.id}
                  image={tour.image}
                  name={t(`destinations.${tour.id}.name`)}
                  description={t(`destinations.${tour.id}.description`)}
                  label={t("cardLabel")}
                />
              </div>
            ))}
          </div>
        </div>

        <div
          className="flex items-center gap-2 mt-2"
          style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
        >
          <button
            type="button"
            onClick={goPrev}
            disabled={offset === 0}
            aria-label={t("previousSlide")}
            className={`size-8 border border-[rgba(var(--lm-accent-rgb,154,117,53),0.4)] flex items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition ${
              offset === 0
                ? "opacity-30 cursor-not-allowed"
                : "hover:border-[var(--lm-accent,#C9A96E)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
            }`}
          >
            <ArrowRight className="size-[14px] rotate-180" strokeWidth={2} />
          </button>

          <div className="flex items-center gap-[6px] px-2">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goToPage(i)}
                aria-label={t("goToSlide", { number: i + 1 })}
                className={`rounded-full transition-all ${
                  i === currentPage
                    ? "size-[6px] bg-[var(--lm-accent,#C9A96E)]"
                    : "size-[5px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.35)]"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={offset >= maxOffset}
            aria-label={t("nextSlide")}
            className={`size-8 border border-[rgba(var(--lm-accent-rgb,154,117,53),0.4)] flex items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition ${
              offset >= maxOffset
                ? "opacity-30 cursor-not-allowed"
                : "hover:border-[var(--lm-accent,#C9A96E)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
            }`}
          >
            <ArrowRight className="size-[14px]" strokeWidth={2} />
          </button>
        </div>

        <Link
          href="/tours"
          className="group inline-flex items-center justify-center gap-2 border border-[var(--lm-accent,#C9A96E)] h-12 px-6 w-full sm:w-auto mt-2 text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] transition-colors"
          style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
        >
          <span className="text-[14px] font-medium tracking-[1.1px] uppercase">
            {t("exploreAll")}
          </span>
          <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2} />
        </Link>
      </div>
    </section>
  )
}

function TourCard({
  id,
  image,
  name,
  description,
  label,
}: {
  id: TourId
  image: string
  name: string
  description: string
  label: string
}) {
  return (
    <Link
      href={`/tours/${id}`}
      className="relative block h-[420px] sm:h-[460px] lg:h-[500px] overflow-hidden group"
    >
      <Image
        src={image}
        alt={name}
        fill
        sizes="(max-width: 768px) 100vw, 33vw"
        className="object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[42%] to-[var(--lm-bg,#000)] to-[82%] pointer-events-none" />
      <div className="relative h-full flex flex-col justify-end p-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <span
              className="text-[12px] font-semibold tracking-[2px] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] leading-none"
              style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
            >
              {label}
            </span>
            <span
              className="text-[24px] text-[var(--lm-text,#fff)] leading-[1.1]"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {name}
            </span>
            <p
              className="text-[12px] leading-[1.2] text-[var(--lm-muted,#999)] tracking-[0.14px] max-w-[287px]"
              style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
            >
              {description}
            </p>
          </div>
          <div className="size-8 border border-[rgba(var(--lm-text-rgb,255,255,255),0.3)] flex items-center justify-center shrink-0 transition-colors group-hover:border-[var(--lm-accent,#C9A96E)] group-hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.15)]">
            <ArrowRight className="size-[18px] text-[var(--lm-text,#fff)] transition-colors group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" strokeWidth={1.5} />
          </div>
        </div>
      </div>
    </Link>
  )
}
