"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import { useSwipe } from "@/hooks/use-swipe"

const DESTINATIONS = [
  // Mesma foto de Lisboa que a home usa (a anterior mostrava Óbidos).
  { id: "lisboa", image: "/tours/regions/regions-lisboa.webp" },
  { id: "porto", image: "/tours/dest-porto.webp" },
  { id: "algarve", image: "/tours/dest-algarve.webp" },
  { id: "ericeira", image: "/tours/dest-ericeira.webp" },
  { id: "alentejo", image: "/tours/regions/regions-alentejo.webp" },
  { id: "madeira", image: "/tours/regions/regions-madeira.webp" },
  /* Escalas de cruzeiro: quem chega ao porto de Lisboa por um dia. Não é
     uma região, é um ponto de partida — e é assim que se vende. */
  { id: "cruzeiros", image: "/tours/dest-cruzeiros.webp" },
]

const DESKTOP_VISIBLE = 4
const MOBILE_VISIBLE = 2

function DestinationCard({
  name,
  label,
  subtitle,
  image,
  href,
}: {
  name: string
  label: string
  subtitle: string
  image: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="relative overflow-hidden cursor-pointer group block shrink-0 h-full"
    >
      <Image
        src={image}
        alt={name}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        sizes="(max-width: 768px) 50vw, 25vw"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[42%] to-[var(--lm-bg,#000)] to-[82%]" />
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 flex flex-col gap-2">
            <span
              className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] leading-none"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {label}
            </span>
            <span
              className="text-[24px] font-medium text-[var(--lm-text,#fff)] leading-normal"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {name}
            </span>
            <span
              className="text-[14px] font-light text-[var(--lm-muted,#999)] leading-[1.2] tracking-[0.14px]"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {subtitle}
            </span>
          </div>
          <div className="size-[32px] border border-[rgba(var(--lm-text-rgb,255,255,255),0.3)] flex items-center justify-center shrink-0 transition-colors duration-300 group-hover:border-[var(--lm-accent,#C9A96E)] group-hover:bg-[var(--lm-accent,#C9A96E)]">
            <ChevronRight className="size-[18px] text-[var(--lm-accent,#C9A96E)] transition-colors duration-300 group-hover:text-[#0d0d0d]" />
          </div>
        </div>
      </div>
    </Link>
  )
}

export function DestinationsSection() {
  const t = useTranslations("destinations")
  const [offset, setOffset] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const visible = isMobile ? MOBILE_VISIBLE : DESKTOP_VISIBLE
  const maxOffset = Math.max(DESTINATIONS.length - visible, 0)

  const next = useCallback(() => {
    setOffset((prev) => Math.min(prev + 1, maxOffset))
  }, [maxOffset])

  const prev = useCallback(() => {
    setOffset((prev) => Math.max(prev - 1, 0))
  }, [])

  const swipeHandlers = useSwipe(next, prev)

  const totalDots = useMemo(() => maxOffset + 1, [maxOffset])
  const currentDot = offset

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] pt-10 pb-10 px-4 md:px-[82px]">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-9">
        <div className="flex flex-col gap-2">
          <h2
            className="text-[32px] md:text-[48px] leading-[1.3] text-[var(--lm-text,#fff)]"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            {t("redesign.heading")}{" "}
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("redesign.headingAccent")}</span>
          </h2>
          <p
            className="text-[18px] text-[var(--lm-muted,#999)] leading-[1.3]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("redesign.subtitle")}
          </p>
        </div>

        <div className="relative">
          <div className="overflow-hidden touch-pan-y select-none cursor-grab active:cursor-grabbing" {...swipeHandlers}>
            <div
              className="flex gap-[2px] transition-transform duration-500 ease-out"
              style={{
                transform: `translateX(calc(-${offset} * (${100 / visible}% + ${2 * (visible - 1) / visible}px)))`,
              }}
            >
              {DESTINATIONS.map((dest) => (
                <div
                  key={dest.id}
                  className="shrink-0 h-[486px] md:h-[486px]"
                  style={{ width: `calc(${100 / visible}% - ${2 * (visible - 1) / visible}px)` }}
                >
                  <DestinationCard
                    name={t(`redesign.cards.${dest.id}.name`)}
                    label={t(`redesign.cards.${dest.id}.label`)}
                    subtitle={t(`redesign.cards.${dest.id}.subtitle`)}
                    image={dest.image}
                    href={`/tours/${dest.id}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={prev}
            className={cn(
              "hidden md:flex absolute left-[-18px] top-1/2 -translate-y-1/2 z-10 size-[36px] items-center justify-center bg-[#111110] border border-[rgba(201,169,110,0.5)] shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-opacity",
              offset === 0 ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
            aria-label="Previous"
          >
            <ChevronLeft className="size-[14px] text-[#C9A96E]" />
          </button>
          <button
            onClick={next}
            className={cn(
              "hidden md:flex absolute right-[-18px] top-1/2 -translate-y-1/2 z-10 size-[36px] items-center justify-center bg-[#111110] border border-[rgba(201,169,110,0.5)] shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-opacity",
              offset >= maxOffset ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
            aria-label="Next"
          >
            <ChevronRight className="size-[14px] text-[#C9A96E]" />
          </button>
        </div>

        <div className="flex gap-4 items-center justify-center">
          <button
            onClick={prev}
            className={cn(
              "md:hidden size-[36px] flex items-center justify-center bg-[var(--lm-bg,#0D0D0D)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] transition-opacity",
              offset === 0 ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
            aria-label="Previous"
          >
            <ChevronLeft className="size-[14px] text-[var(--lm-accent,#C9A96E)]" />
          </button>

          <div className="flex gap-[6px] items-center">
            {Array.from({ length: totalDots }).map((_, i) => (
              <button
                key={i}
                onClick={() => setOffset(i)}
                className={cn(
                  "rounded-full transition-all",
                  i === currentDot
                    ? "size-[10px] bg-[var(--lm-accent,#C9A96E)]"
                    : "size-[6px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.3)]"
                )}
                aria-label={t("goToSlide", { number: i + 1 })}
              />
            ))}
          </div>

          <button
            onClick={next}
            className={cn(
              "md:hidden size-[36px] flex items-center justify-center bg-[var(--lm-bg,#0D0D0D)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] transition-opacity",
              offset >= maxOffset ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
            aria-label="Next"
          >
            <ChevronRight className="size-[14px] text-[var(--lm-accent,#C9A96E)]" />
          </button>
        </div>
      </div>
    </section>
  )
}
