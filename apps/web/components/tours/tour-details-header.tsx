"use client"

import { useTranslations } from "next-intl"
import { TourInfoBoxes } from "./tour-info-boxes"

interface TourDetailsHeaderProps {
  title: string
  rating: number
  reviewCount?: number
  tags: string[]
  duration: string
  tourType: string
  groupSize: string
  languages: string[]
}

export function TourDetailsHeader({
  title,
  rating,
  reviewCount,
  tags,
  duration,
  tourType,
  groupSize,
  languages,
}: TourDetailsHeaderProps) {
  const t = useTranslations("tourDetails")
  const words = title.split(" ")
  const lastWord = words.pop() || ""
  const restWords = words.join(" ")

  return (
    <div className="pt-[20px] md:pt-[28px] pb-[17px] flex flex-col gap-[13.2px] items-start">
      <TourInfoBoxes
        duration={duration}
        tourType={tourType}
        groupSize={groupSize}
        languages={languages}
      />

      {tags.length > 0 && (
        <div className="flex items-center gap-[10px] pt-[16px] w-full">
          <div className="w-[20px] h-px bg-[var(--lm-accent,#C9A96E)]" />
          <span
            className="text-[12px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] tracking-[2.25px] uppercase"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {tags.join(" · ")}
          </span>
        </div>
      )}

      <div className="flex flex-col items-start w-full">
        <h1
          className="text-[36px] md:text-[48px] text-[var(--lm-text,#fff)] leading-[1.17] font-light"
          style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
        >
          {restWords}
          {restWords ? " " : ""}
          <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] font-light">{lastWord}</span>
        </h1>

        {reviewCount ? (
          <div className="flex items-center gap-[10px] pt-[2.8px] w-full">
            <span className="text-[14px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] tracking-[1px] leading-none">★★★★★</span>
            <span
              className="text-[32px] md:text-[16px] text-[var(--lm-text,#fff)] leading-none font-normal"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {rating > 0 ? rating.toFixed(1) : "5.0"}
            </span>
            <span
              className="text-[14px] md:text-[12px] text-[var(--lm-muted,#999)] leading-none"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              · {reviewCount} {t("reviews")}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
