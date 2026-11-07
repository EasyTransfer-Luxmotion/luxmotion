"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { ArrowLeft, ArrowRight, BadgeCheck, Star } from "lucide-react"
import { useSwipe } from "@/hooks/use-swipe"
import {
  GOOGLE_REVIEWS_URL,
  TRUSTPILOT_REVIEWS_URL,
  REVIEW_LINK_PROPS,
} from "@/lib/review-links"
import { cdn } from "@/lib/cdn"

const SERIF_FONT = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const
const SANS_FONT = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const

interface WhitelabelReview {
  initial: string
  color: string
  nameKey: string
  textKey: string
}

const REVIEWS: WhitelabelReview[] = [
  { initial: "S", color: "#9c27b0", nameKey: "review1.name", textKey: "review1.text" },
  { initial: "R", color: "#1565c0", nameKey: "review2.name", textKey: "review2.text" },
  { initial: "M", color: "#2e7d32", nameKey: "review3.name", textKey: "review3.text" },
  { initial: "A", color: "#b71c1c", nameKey: "review4.name", textKey: "review4.text" },
]

function ReviewCard({
  review,
  source,
  textSizeCls,
}: {
  review: { name: string; text: string; initial: string; color: string }
  source: string
  textSizeCls: string
}) {
  return (
    <div className="group relative bg-white shadow-[0_2px_6px_rgba(0,0,0,0.04)] flex flex-col gap-2 px-[24.8px] pt-[25.6px] pb-[24.8px] flex-1 min-w-0 self-stretch">
      <span className="absolute top-0 inset-x-0 h-[2px] bg-[#a8833a] opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out" />
      <div className="flex gap-[10px] items-center">
        <div
          className="size-[34px] rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: review.color }}
        >
          <span
            className="text-[13px] font-semibold text-white leading-none"
            style={SANS_FONT}
          >
            {review.initial}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span
            className="text-[12px] font-semibold text-[#1a1612] leading-tight whitespace-nowrap"
            style={SANS_FONT}
          >
            {review.name}
          </span>
          <span
            className="text-[9px] text-[#7a746e] leading-tight tracking-[0.54px] whitespace-nowrap"
            style={SANS_FONT}
          >
            {source}
          </span>
        </div>
      </div>
      <div className="pt-[4.8px]">
        <span className="text-[12px] tracking-[1px] text-[#a8833a] leading-none">★★★★★</span>
      </div>
      <p
        className={`${textSizeCls} leading-[1.2] text-[rgba(26,22,18,0.5)]`}
        style={SANS_FONT}
      >
        {review.text}
      </p>
    </div>
  )
}

function NavArrow({
  direction,
  onClick,
  disabled,
}: {
  direction: "left" | "right"
  onClick: () => void
  disabled?: boolean
}) {
  const Icon = direction === "left" ? ArrowLeft : ArrowRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Previous" : "Next"}
      className="size-12 border-[1.714px] border-[rgba(154,117,53,0.22)] flex items-center justify-center hover:border-[#a08248] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
    >
      <Icon className="size-[18px] text-[#a08248]" strokeWidth={1.5} />
    </button>
  )
}

function Dots({ pages, current }: { pages: number; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: pages }).map((_, i) => (
        <span
          key={i}
          className={`size-[5.352px] rounded-full ${
            i === current ? "bg-[#a08248]" : "bg-[rgba(168,131,53,0.3)]"
          }`}
        />
      ))}
    </div>
  )
}

function HeaderBlock({
  pillLabel,
  countText,
  headingLabel,
  subtitle,
}: {
  pillLabel: string
  countText: string
  headingLabel: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="inline-flex items-center gap-2 px-4 py-2 border border-[#a08248] backdrop-blur-[2px]">
        <BadgeCheck className="size-6 text-[#a08248]" strokeWidth={1.5} />
        <span
          className="text-[14px] tracking-[0.28px] text-[#a08248] leading-none"
          style={SANS_FONT}
        >
          {pillLabel}
        </span>
      </div>

      <h2 className="text-center" style={SERIF_FONT}>
        <span className="block md:inline">
          <span className="text-[#a08248] font-medium text-[48px] md:text-[64px] leading-none">
            {countText}
          </span>{" "}
        </span>
        <span className="block md:inline text-[32px] md:text-[48px] leading-none text-[#1a1612] font-normal">
          {headingLabel}
        </span>
      </h2>

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="size-6 text-[#a8833a]" fill="#a8833a" strokeWidth={0} />
          ))}
        </div>
        <div className="flex items-center gap-[18.834px]">
          <a href={GOOGLE_REVIEWS_URL} {...REVIEW_LINK_PROPS} aria-label="Google" className="transition-opacity hover:opacity-70">
            <Image
            src="/shared/logos/google-logo.png"
            alt="Google"
            width={94}
            height={32}
            className="h-8 w-auto object-contain"
          />
          </a>
          <a href={TRUSTPILOT_REVIEWS_URL} {...REVIEW_LINK_PROPS} aria-label="Trustpilot" className="transition-opacity hover:opacity-70">
            <Image
            src={cdn("/shared/logos/trustpilot-logo-dark.svg")}
            alt="Trustpilot"
            width={104}
            height={28}
            className="h-7 w-auto"
            unoptimized
          />
          </a>
        </div>
        <p
          className="text-[18px] font-light text-[#696969] leading-[1.3] text-center"
          style={SANS_FONT}
        >
          {subtitle}
        </p>
      </div>
    </div>
  )
}

export function WeddingWhitelabelTestimonials() {
  const t = useTranslations("weddingWhitelabel.testimonials")
  const [page, setPage] = useState(0)

  const next = useCallback(() => setPage((p) => (p + 1) % REVIEWS.length), [])
  const prev = useCallback(
    () => setPage((p) => (p - 1 + REVIEWS.length) % REVIEWS.length),
    [],
  )
  const swipe = useSwipe(next, prev)

  const source = t("source")
  const mobileReview = REVIEWS[page]!
  const DESKTOP_PER_PAGE = 4
  const visibleDesktop = Array.from({ length: DESKTOP_PER_PAGE }, (_, i) => {
    return REVIEWS[(page + i) % REVIEWS.length]!
  })

  return (
    <section className="bg-[#f7f4ef] px-4 md:px-20 py-14 md:py-24">
      <div className="max-w-[1280px] mx-auto flex flex-col items-center gap-6 md:gap-8">
        <HeaderBlock
          pillLabel={t("pill")}
          countText={t("count")}
          headingLabel={t("countLabel")}
          subtitle={t("trustedSubtitle")}
        />

        <div className="hidden md:flex flex-col gap-4 w-full pt-2">
          <div
            key={page}
            className="flex gap-[3px] items-stretch justify-center w-full animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            {visibleDesktop.map((r, i) => (
              <ReviewCard
                key={`${page}-${i}`}
                review={{
                  initial: r.initial,
                  color: r.color,
                  name: t(r.nameKey),
                  text: t(r.textKey),
                }}
                source={source}
                textSizeCls="text-[12px]"
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 pt-2">
            <NavArrow direction="left" onClick={prev} />
            <Dots pages={REVIEWS.length} current={page} />
            <NavArrow direction="right" onClick={next} />
          </div>
        </div>

        <div className="md:hidden flex flex-col gap-4 w-full pt-2" {...swipe}>
          <ReviewCard
            review={{
              initial: mobileReview.initial,
              color: mobileReview.color,
              name: t(mobileReview.nameKey),
              text: t(mobileReview.textKey),
            }}
            source={source}
            textSizeCls="text-[14px]"
          />

          <div className="flex items-center justify-center gap-2 pt-2">
            <NavArrow direction="left" onClick={prev} />
            <Dots pages={REVIEWS.length} current={page} />
            <NavArrow direction="right" onClick={next} />
          </div>
        </div>
      </div>
    </section>
  )
}
