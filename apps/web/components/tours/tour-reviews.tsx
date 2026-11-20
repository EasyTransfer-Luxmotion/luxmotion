"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import type { Id } from "@workspace/convex/dataModel"
import { TourReviewForm } from "./tour-review-form"
import { LuxmotionReviewCard, type LuxmotionReview } from "@/components/shared/luxmotion-review-card"

interface Review extends LuxmotionReview {
  date?: string
}

interface TourReviewsProps {
  tourId: Id<"tours">
  rating: number
  reviewCount: number
  reviews: Review[]
}

function CarouselButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="size-[44px] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] flex items-center justify-center transition-colors hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

export function TourReviews({ tourId, rating, reviewCount, reviews }: TourReviewsProps) {
  const t = useTranslations("tourDetails")
  const [mobileIndex, setMobileIndex] = useState(0)
  const canPrev = mobileIndex > 0
  const canNext = mobileIndex < reviews.length - 1

  return (
    <div className="w-full flex flex-col gap-[20px]">
      <h2
        className="text-[24px] italic font-light text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] leading-none"
        style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
      >
        {t("reviewsTitle")}
      </h2>

      <div className="flex flex-col gap-[4px]">
        <div className="flex items-baseline gap-[8px]">
          <span
            className="text-[56px] font-light text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] leading-[56px]"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            {rating.toFixed(1)}
          </span>
          <span
            className="text-[14px] text-[var(--lm-muted,rgba(255,255,255,0.3))]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            / 5
          </span>
        </div>
        <div className="flex items-center gap-[8px]">
          <span className="text-[16px] text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] tracking-[1px] leading-none pt-[2.4px]">
            ★★★★★
          </span>
          <span
            className="text-[12px] text-[var(--lm-muted,#8c8680)]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {reviewCount} {t("verifiedReviews")}
          </span>
        </div>
      </div>

      {reviews.length > 0 && (
        <>
          <div className="hidden md:flex flex-col gap-[3px] pt-[12px]">
            {reviews.map((review, index) => (
              <LuxmotionReviewCard key={index} review={review} />
            ))}
          </div>

          <div className="md:hidden flex flex-col gap-4 pt-[12px]">
            <div className="overflow-hidden">
              <div
                className="flex transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${mobileIndex * 100}%)` }}
              >
                {reviews.map((review, index) => (
                  <div key={index} className="w-full shrink-0">
                    <LuxmotionReviewCard review={review} />
                  </div>
                ))}
              </div>
            </div>
            {reviews.length > 1 && (
              <div className="flex items-center justify-center gap-4">
                <CarouselButton
                  onClick={() => canPrev && setMobileIndex((i) => i - 1)}
                  disabled={!canPrev}
                >
                  <ChevronLeft className="size-5" />
                </CarouselButton>
                <div className="flex items-center gap-[6px]">
                  {reviews.map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "size-[6px] rounded-full transition-colors",
                        i === mobileIndex ? "bg-[var(--lm-accent,#c9a96e)]" : "bg-[rgba(var(--lm-accent-rgb,201,169,110),0.25)]"
                      )}
                    />
                  ))}
                </div>
                <CarouselButton
                  onClick={() => canNext && setMobileIndex((i) => i + 1)}
                  disabled={!canNext}
                >
                  <ChevronRight className="size-5" />
                </CarouselButton>
              </div>
            )}
          </div>
        </>
      )}

      <div className="w-full pt-[12px]">
        <TourReviewForm tourId={tourId} />
      </div>
    </div>
  )
}
