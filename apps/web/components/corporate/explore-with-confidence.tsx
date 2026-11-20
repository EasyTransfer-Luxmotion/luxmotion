"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { useSwipe } from "@/hooks/use-swipe"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

type DestinationId = "lisboa" | "porto" | "algarve" | "ericeira" | "alentejo" | "madeira"

const DESTINATIONS: readonly { id: DestinationId; image: string }[] = [
  { id: "lisboa", image: "/corporate/destinations/lisboa.webp" },
  { id: "porto", image: "/corporate/destinations/porto.webp" },
  { id: "algarve", image: "/corporate/destinations/algarve.webp" },
  { id: "ericeira", image: "/corporate/destinations/ericeira.webp" },
  { id: "alentejo", image: "/tours/regions/regions-alentejo.webp" },
  { id: "madeira", image: "/tours/regions/regions-madeira.webp" },
] as const

const VISIBLE_DESKTOP = 4
const STEP_DESKTOP = 2

export function ExploreWithConfidence() {
  const t = useTranslations("corporatePage.explore")
  const [offset, setOffset] = useState(0)
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
  const maxOffset = Math.max(0, DESTINATIONS.length - visible)

  const goPrev = useCallback(() => {
    setOffset((c) => Math.max(0, c - step))
  }, [step])

  const goNext = useCallback(() => {
    setOffset((c) => Math.min(maxOffset, c + step))
  }, [step, maxOffset])

  const swipeHandlers = useSwipe(goNext, goPrev)

  const totalPages = Math.ceil(maxOffset / step) + 1
  const currentPage = Math.min(Math.floor(offset / step), totalPages - 1)
  const translatePercent = isMobile ? offset * 100 : offset * (100 / VISIBLE_DESKTOP)

  const goToPage = (page: number) => {
    setOffset(Math.min(maxOffset, page * step))
  }

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] px-4 py-12 md:px-[82px] md:py-[60px]">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-6 md:gap-9">
        <div className="flex w-full flex-col items-center gap-2 text-center">
          <h2
            className="text-[32px] leading-tight text-[var(--lm-text,#fff)] md:text-[48px]"
            style={serif}
          >
            {t("titleRest")}{" "}
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("titleGold")}</span>
          </h2>
          <p
            className="text-[16px] leading-[1.3] text-[var(--lm-muted,#999)] md:text-[18px]"
            style={sans}
          >
            {t("subtitle")}
          </p>
        </div>

        <div className="relative w-full">
          <div className="overflow-hidden" {...swipeHandlers}>
            <div
              className="flex h-[400px] gap-[2px] transition-transform duration-500 ease-out md:h-[486px]"
              style={{ transform: `translateX(-${translatePercent}%)` }}
            >
              {DESTINATIONS.map((d) => (
                <div
                  key={d.id}
                  className="group relative flex h-full w-full shrink-0 flex-col justify-end overflow-hidden md:w-[calc((100%-6px)/4)]"
                >
                  <Image
                    src={d.image}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 25vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[42%] to-black to-[82%]" />
                  <div className="relative flex items-end gap-2 p-4">
                    <p
                      className="flex-1 text-[24px] font-medium leading-tight text-white"
                      style={serif}
                    >
                      {t(`destinations.${d.id}`)}
                    </p>
                    <div className="flex size-8 shrink-0 items-center justify-center border border-[rgba(255,255,255,0.3)] transition-colors group-hover:border-[#C9A96E] group-hover:bg-[rgba(201,169,110,0.15)]">
                      <ArrowRight
                        className="size-[18px] text-white transition-colors group-hover:text-[#C9A96E]"
                        strokeWidth={1.5}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={goPrev}
            disabled={offset === 0}
            aria-label={t("previous")}
            className={`absolute left-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] bg-[var(--lm-bg,#0D0D0D)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition md:-left-[42px] ${
              offset === 0
                ? "cursor-not-allowed opacity-30"
                : "hover:border-[var(--lm-accent,#C9A96E)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
            }`}
          >
            <ArrowRight className="size-[14px] rotate-180" strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={offset >= maxOffset}
            aria-label={t("next")}
            className={`absolute right-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] bg-[var(--lm-bg,#0D0D0D)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition md:-right-[42px] ${
              offset >= maxOffset
                ? "cursor-not-allowed opacity-30"
                : "hover:border-[var(--lm-accent,#C9A96E)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
            }`}
          >
            <ArrowRight className="size-[14px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex items-center gap-[6px]">
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
      </div>
    </section>
  )
}
