"use client"

import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@workspace/convex/api"
import { Star } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { Id } from "@workspace/convex/dataModel"
import { CountryCombobox } from "@/components/ui/country-combobox"

interface TourReviewFormProps {
  tourId: Id<"tours">
}

function StarRating({
  rating,
  onRatingChange,
}: {
  rating: number
  onRatingChange: (rating: number) => void
}) {
  const [hovered, setHovered] = useState(0)

  return (
    <div className="flex gap-[6px]">
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1
        const isFilled = starValue <= (hovered || rating)

        return (
          <button
            key={i}
            type="button"
            onClick={() => onRatingChange(starValue)}
            onMouseEnter={() => setHovered(starValue)}
            onMouseLeave={() => setHovered(0)}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={`size-[20px] transition-colors ${
                isFilled
                  ? "text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] fill-[var(--lm-accent,#c9a96e)]"
                  : "text-[rgba(var(--lm-text-rgb,255,255,255),0.15)] fill-[rgba(var(--lm-text-rgb,255,255,255),0.15)] hover:text-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] hover:fill-[rgba(var(--lm-accent-rgb,201,169,110),0.5)]"
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}

export function TourReviewForm({ tourId }: TourReviewFormProps) {
  const t = useTranslations("tourDetails")
  const submitReview = useMutation(api.tourReviews.submit)

  const [rating, setRating] = useState(0)
  const [author, setAuthor] = useState("")
  const [nationality, setNationality] = useState("")
  const [text, setText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const title = t("writeReview")
  const titleWords = title.split(" ")
  const titleAccent = titleWords.pop() || ""
  const titleLead = titleWords.join(" ")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (rating === 0) {
      toast.error(t("ratingRequired"))
      return
    }

    if (!author.trim() || !text.trim()) {
      return
    }

    setIsSubmitting(true)

    try {
      await submitReview({
        tourId,
        author: author.trim(),
        rating,
        text: text.trim(),
        nationality: nationality.trim() || undefined,
      })

      toast.success(t("reviewSubmitted"), {
        description: t("reviewPending"),
      })

      setRating(0)
      setAuthor("")
      setNationality("")
      setText("")
    } catch {
      toast.error(t("errorSubmitting"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-[var(--lm-surface,#1a1a1a)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] p-[24px] md:p-[33px] flex flex-col gap-[19px]">
      <div className="h-[2px] w-[40px] bg-[var(--lm-accent,#c9a96e)]" />
      <h3
        className="text-[22px] font-light text-[var(--lm-text,#fff)] leading-none"
        style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
      >
        {titleLead}
        {titleLead ? " " : ""}
        <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]">{titleAccent}</span>
      </h3>

      <form onSubmit={handleSubmit} className="flex flex-col gap-[14px]">
        <StarRating rating={rating} onRatingChange={setRating} />

        <input
          suppressHydrationWarning
          type="text"
          placeholder={t("yourName")}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          required
          className="w-full bg-[rgba(var(--lm-text-rgb,255,255,255),0.04)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] px-[14.8px] py-[13.8px] text-[13px] font-light text-[var(--lm-text,#fff)] placeholder:text-[var(--lm-muted,rgba(255,255,255,0.2))] focus:outline-none focus:border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] transition-colors"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        />

        <CountryCombobox
          value={nationality}
          onChange={setNationality}
          placeholder={t("yourNationality")}
          emptyLabel={`— ${t("yourNationality")}`}
        />

        <textarea
          suppressHydrationWarning
          placeholder={t("yourReview")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          rows={4}
          className="w-full bg-[rgba(var(--lm-text-rgb,255,255,255),0.04)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] px-[14.8px] py-[13.8px] text-[13px] font-light text-[var(--lm-text,#fff)] placeholder:text-[var(--lm-muted,rgba(255,255,255,0.2))] resize-none focus:outline-none focus:border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] transition-colors min-h-[100px]"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        />

        <button
          type="submit"
          disabled={isSubmitting || rating === 0}
          className="w-full bg-[var(--lm-accent,#c9a96e)] p-[14px] flex items-center justify-center transition-colors hover:bg-[#b8954f] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span
            className="text-[11px] font-bold text-[#0d0d0d] tracking-[1.32px] uppercase"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {isSubmitting ? t("submitting") : t("submitReview")}
          </span>
        </button>
      </form>
    </div>
  )
}
