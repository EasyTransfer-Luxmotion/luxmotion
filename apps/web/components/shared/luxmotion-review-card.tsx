"use client"

import { useLocale, useTranslations } from "next-intl"

export interface LuxmotionReview {
  author: string
  avatar?: string
  rating: number
  text: string
  source?: string
  nationality?: string
  createdAt?: number
}

const AVATAR_PALETTE = [
  "#7b1fa2",
  "#1565c0",
  "#c62828",
  "#2e7d32",
  "#ef6c00",
  "#4527a0",
  "#00838f",
  "#ad1457",
]

export function avatarColorFor(name: string) {
  const code = (name.charCodeAt(0) || 65) - 65
  return AVATAR_PALETTE[Math.abs(code) % AVATAR_PALETTE.length]
}

interface LuxmotionReviewCardProps {
  review: LuxmotionReview
  translationsNamespace?: string
}

export function LuxmotionReviewCard({
  review,
  translationsNamespace = "tourDetails",
}: LuxmotionReviewCardProps) {
  const t = useTranslations(translationsNamespace)
  const locale = useLocale()
  const name = review.source || review.author
  const initial = name.charAt(0).toUpperCase()
  const dateLabel = review.createdAt
    ? new Date(review.createdAt).toLocaleDateString(locale, {
        month: "long",
        year: "numeric",
      })
    : ""

  return (
    <div className="bg-[var(--lm-surface,#1a1a1a)] border-l-[1.6px] border-transparent hover:border-[var(--lm-accent,#c9a96e)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] transition-colors p-[24px] flex flex-col gap-[8px] w-full">
      <div className="flex gap-[12px] items-center">
        <div
          className="size-[36px] rounded-[18px] flex items-center justify-center shrink-0"
          style={{ backgroundColor: avatarColorFor(name) }}
        >
          <span
            className="text-[14px] font-semibold text-white leading-none"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {initial}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span
            className="text-[12px] font-semibold text-[var(--lm-text,#fff)] leading-[1.3] truncate"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {name}
          </span>
          <span
            className="text-[10px] text-[var(--lm-muted,#8c8680)] leading-[1.3]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {dateLabel}
            {dateLabel ? " · " : ""}
            {t("verifiedBooking")}
          </span>
        </div>
      </div>
      <div
        className="text-[12px] text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] tracking-[1px] leading-none pt-[0.8px]"
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        {"★★★★★".slice(0, review.rating).padEnd(5, "☆")}
      </div>
      <p
        className="text-[12px] text-[var(--lm-muted,rgba(255,255,255,0.45))] leading-[19.8px]"
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        {review.text}
      </p>
    </div>
  )
}
