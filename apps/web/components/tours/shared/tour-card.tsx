"use client"

import Image from "next/image"
import { ArrowRight, MapPin, Clock, Users } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"

export interface TourData {
  id: string
  image: string
  rating: number
  reviewCount: number
  title: string
  location: string
  duration: string
  originalPrice: number
  discountedPrice: number
  savings: number
  isBestSeller: boolean
  category: "tours" | "experiences" | "private"
  pax?: string
}

function Stars({ rating }: { rating: number }) {
  const clamped = Math.max(0, Math.min(5, rating))
  const full = Math.floor(clamped)
  const hasHalf = clamped - full >= 0.5
  return (
    <span className="text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] text-[12px] tracking-[1px] leading-none whitespace-nowrap">
      {Array.from({ length: 5 }).map((_, i) => {
        if (i < full) return "★"
        if (i === full && hasHalf) return "★"
        return "☆"
      }).join("")}
    </span>
  )
}

interface TourCardProps {
  tour: TourData
  className?: string
}

export function TourCard({ tour, className }: TourCardProps) {
  const t = useTranslations("topPicks")
  const savePercent =
    tour.originalPrice > 0 && tour.savings > 0
      ? Math.round((tour.savings / tour.originalPrice) * 100)
      : 0
  const formattedPrice = `${tour.discountedPrice.toFixed(0)} €`

  return (
    <div
      className={cn(
        "group relative bg-[var(--lm-surface,#1a1a1a)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex flex-col overflow-hidden h-full transition-colors duration-500 ease-out hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)]",
        className
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-[1.5px] w-full origin-center scale-x-0 group-hover:scale-x-100 transition-transform duration-700 ease-out z-[4]"
        style={{
          background:
            "linear-gradient(to right, transparent 0%, rgba(var(--lm-accent-rgb,201,169,110),0) 8%, var(--lm-accent,#C9A96E) 50%, rgba(var(--lm-accent-rgb,201,169,110),0) 92%, transparent 100%)",
        }}
      />

      {savePercent > 0 && (
        <div className="absolute top-[11px] left-[11px] z-[3] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.92)] px-[8px] py-[5px] inline-flex items-center leading-none">
          <span
            className="text-[10px] font-semibold text-[#0d0d0d] tracking-[0.5px] uppercase leading-none whitespace-nowrap"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("savePercent", { percent: savePercent })}
          </span>
        </div>
      )}

      <div className="relative w-full h-[210px] bg-[var(--lm-bg,#0d0d0d)] z-[2] overflow-hidden">
        <Image
          src={tour.image}
          alt={tour.title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 50vw, 33vw"
        />
      </div>

      <div className="flex flex-col gap-[8px] pt-[20px] pb-[24px] px-[20px] flex-1 z-[1]">
        <div className="flex gap-[6px] items-center">
          <Stars rating={tour.rating} />
          <span
            className="text-[12px] text-[var(--lm-muted,rgba(255,255,255,0.3))] tracking-[0.3px] leading-none whitespace-nowrap"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {tour.reviewCount} {t("reviews")}
          </span>
        </div>

        <h3
          className="text-[20px] md:text-[24px] font-semibold text-[var(--lm-text,#fff)] leading-[1.3] transition-colors duration-300 group-hover:text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]"
          style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
        >
          {tour.title}
        </h3>

        <div className="flex flex-col items-start gap-[6px] pt-[2px]">
          <div className="flex items-center gap-[5px]">
            <MapPin className="size-[14px] text-[var(--lm-muted,#999)]" strokeWidth={1.6} />
            <span
              className="text-[12px] text-[var(--lm-muted,#999)] leading-none"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {tour.location}
            </span>
          </div>
          <div className="flex items-center gap-[5px]">
            <Clock className="size-[14px] text-[var(--lm-muted,#999)]" strokeWidth={1.6} />
            <span
              className="text-[12px] text-[var(--lm-muted,#999)] leading-none"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {tour.duration}
            </span>
          </div>
          {tour.pax && (
            <div className="flex items-center gap-[5px]">
              <Users className="size-[14px] text-[var(--lm-muted,#999)]" strokeWidth={1.6} />
              <span
                className="text-[12px] text-[var(--lm-muted,#999)] leading-none"
                style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              >
                {tour.pax}
              </span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-[12.8px] border-t-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex items-center justify-between">
          <div className="flex flex-row items-baseline gap-2">
            <span
              className="text-[12px] font-semibold text-[var(--lm-muted,#8c8680)] tracking-[0.9px] uppercase leading-none"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {t("fromShort")}
            </span>
            <span
              className="text-[32px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] leading-[1.2]"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {formattedPrice}
            </span>
          </div>
          <div className="size-[32px] border border-[rgba(var(--lm-text-rgb,255,255,255),0.3)] flex items-center justify-center transition-colors duration-300 group-hover:border-[var(--lm-accent,#c9a96e)] group-hover:bg-[var(--lm-accent,#c9a96e)]">
            <ArrowRight className="size-[18px] text-[var(--lm-text,#fff)] transition-colors duration-300 group-hover:text-[#0d0d0d]" strokeWidth={1.5} />
          </div>
        </div>
      </div>
    </div>
  )
}
