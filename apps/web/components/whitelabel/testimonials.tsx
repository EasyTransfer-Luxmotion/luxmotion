"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import { cn } from "@workspace/ui/lib/utils"
import { useMemo } from "react"
import Image from "next/image"
import { Star } from "lucide-react"
import { useTranslations } from "next-intl"
import { useQuery } from "convex/react"
import { api } from "@workspace/convex/api"
import {
  GOOGLE_REVIEWS_URL,
  TRUSTPILOT_REVIEWS_URL,
  REVIEW_LINK_PROPS,
} from "@/lib/review-links"
import { cdn } from "@/lib/cdn"

const SERIF_FONT = {
  fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
} as const

const SANS_FONT = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
} as const

const REVIEW_PHOTOS = [
  "/reviews/review-1.webp",
  "/reviews/review-2.webp",
  "/reviews/review-3.webp",
] as const

const AVATAR_COLORS = ["#9c27b0", "#1976d2", "#43a047"] as const

const FALLBACK_REVIEWS = [
  {
    name: "Yasminn Rezende",
    date: "23/11/2025",
    text: "On time, really attentive and nice music. Exactly what you want after a long flight.",
  },
  {
    name: "Ricardo van Mildert",
    date: "21/11/2025",
    text: "Had some delay with my plane, but it was absolutely no problem. Great conversation, great service!",
  },
  {
    name: "Rebecca P.",
    date: "13/11/2025",
    text: "Flawless. Driver was professional, courteous and the car was immaculate. Would book again without hesitation.",
  },
] as const

type Review = {
  name: string
  date: string
  text: string
}

function ReviewCard({ review, color }: { review: Review; color: string }) {
  const initial = review.name.charAt(0).toUpperCase()
  return (
    <div className="relative bg-[var(--lm-surface,#1a1a1a)] flex flex-col gap-[10px] p-5 group overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--lm-accent,#c9a96e)] to-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
      <div className="flex items-center gap-[10px]">
        <div
          className="size-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: color }}
        >
          <span className="text-[14px] text-[var(--lm-text,#fff)]" style={SANS_FONT}>
            {initial}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[14px] font-semibold text-[var(--lm-text,#fff)] leading-none"
            style={SANS_FONT}
          >
            {review.name}
          </p>
          <p
            className="text-[12px] text-[var(--lm-muted,#8c8680)] leading-none mt-1"
            style={SANS_FONT}
          >
            {review.date}
          </p>
        </div>
      </div>
      <span className="text-[14px] text-[var(--lm-accent,#c9a96e)] tracking-[1px] leading-none">
        ★★★★★
      </span>
      <p
        className="text-[13px] text-[rgba(var(--lm-text-rgb,255,255,255),0.55)] leading-[1.35]"
        style={SANS_FONT}
      >
        {review.text}
      </p>
    </div>
  )
}

function LogoPill({
  src,
  srcLight,
  alt,
  width,
  height,
  label,
  href,
}: {
  src: string
  /** Variante para tema claro, quando o ficheiro principal é branco. */
  srcLight?: string
  alt: string
  width: number
  height: number
  label?: string
  /** Abre a ficha de avaliações da plataforma. */
  href?: string
}) {
  const Tag = href ? "a" : "div"
  return (
    <Tag
      {...(href ? { href, ...REVIEW_LINK_PROPS, "aria-label": alt } : {})}
      className="bg-[rgba(var(--lm-text-rgb,255,255,255),0.04)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] flex items-center gap-1.5 px-2.5 h-7 transition-opacity hover:opacity-70"
    >
      <Image
        src={cdn(src)}
        alt={alt}
        width={width}
        height={height}
        className={cn("h-3 w-auto", srcLight && "[.home-theme:not(.dark)_&]:hidden")}
        unoptimized
      />
      {srcLight ? (
        <Image
          src={cdn(srcLight)}
          alt=""
          width={width}
          height={height}
          className="h-3 w-auto hidden [.home-theme:not(.dark)_&]:block"
          unoptimized
        />
      ) : null}
      {label ? (
        <span
          className="text-[11px] font-medium text-[rgba(var(--lm-text-rgb,255,255,255),0.75)] leading-none"
          style={SANS_FONT}
        >
          {label}
        </span>
      ) : null}
    </Tag>
  )
}

function RatingBlock({ reviewsCount }: { reviewsCount: string }) {
  return (
    <div className="flex items-center gap-4">
      <span
        className="text-[64px] leading-none text-[var(--lm-accent,#c9a96e)] font-light"
        style={SERIF_FONT}
      >
        4.9
      </span>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className="size-[14px] text-[var(--lm-accent,#c9a96e)] fill-[var(--lm-accent,#c9a96e)]"
              strokeWidth={0}
            />
          ))}
        </div>
        <p
          className="text-[12px] text-[rgba(var(--lm-text-rgb,255,255,255),0.55)] leading-none"
          style={SANS_FONT}
        >
          {reviewsCount}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <LogoPill
            src="/shared/icons/google-icon.svg"
            alt="Google"
            width={12}
            height={12}
            label="Google"
            href={GOOGLE_REVIEWS_URL}
          />
          {/* O ficheiro tem a palavra "Trustpilot" a branco: em tema claro
              desaparecia e sobrava a estrela verde. A variante escura já existia
              e é a que as páginas de casamentos usam. */}
          <LogoPill
            src="/shared/icons/trustpilot-logo.svg"
            srcLight="/shared/logos/trustpilot-logo-dark.svg"
            alt="Trustpilot"
            width={56}
            height={12}
            href={TRUSTPILOT_REVIEWS_URL}
          />
        </div>
      </div>
    </div>
  )
}

export function Testimonials() {
  const { ref, reveal } = useScrollReveal<HTMLDivElement>()

  const t = useTranslations("whitelabel.testimonials")
  const featuredReviews = useQuery(api.tourReviews.listFeatured)

  const reviews: Review[] = useMemo(() => {
    const dbReviews: Review[] = (featuredReviews ?? []).slice(0, 3).map((r) => ({
      name: r.author,
      date: new Date(r.createdAt).toLocaleDateString("en-GB"),
      text: r.text,
    }))
    return dbReviews.length > 0 ? dbReviews : [...FALLBACK_REVIEWS]
  }, [featuredReviews])

  return (
    <section className="bg-[var(--lm-surface,#141414)] px-4 lg:px-[82px] pt-14 lg:pt-20 pb-14 lg:pb-20">
      <div ref={ref} className={cn("max-w-[1280px] mx-auto flex flex-col gap-10 lg:gap-12", reveal())}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-[var(--lm-accent,#c9a96e)]" />
            <span
              className="text-[12px] font-medium uppercase tracking-[2px] text-[var(--lm-accent,#c9a96e)] leading-none"
              style={SANS_FONT}
            >
              {t("eyebrow")}
            </span>
            <div className="h-px w-8 bg-[var(--lm-accent,#c9a96e)]" />
          </div>
          <h2
            className="text-[32px] lg:text-[48px] font-light leading-[1.1] text-[var(--lm-text,#fff)]"
            style={SERIF_FONT}
          >
            {t("titlePre")}{" "}
            <span className="italic text-[var(--lm-accent,#c9a96e)]">{t("titleAccent")}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-14">
          <div className="grid grid-cols-2 grid-rows-2 gap-[3px] h-[420px] lg:h-[560px]">
            <div className="relative row-span-2">
              <Image
                src={REVIEW_PHOTOS[0]}
                alt=""
                fill
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="relative">
              <Image
                src={REVIEW_PHOTOS[1]}
                alt=""
                fill
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="relative">
              <Image
                src={REVIEW_PHOTOS[2]}
                alt=""
                fill
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <RatingBlock reviewsCount={t("reviewsCount")} />
            <div className="flex flex-col gap-[3px]">
              {reviews.map((review, i) => (
                <ReviewCard
                  key={`${review.name}-${i}`}
                  review={review}
                  color={AVATAR_COLORS[i % AVATAR_COLORS.length] ?? "#5f6368"}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
