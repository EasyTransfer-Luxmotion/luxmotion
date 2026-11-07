"use client"

import Image from "next/image"
import { useTranslations } from "next-intl"
import { ArrowRight, BadgeCheck, Check, MessageSquare, Star } from "lucide-react"
import { TRUSTPILOT_REVIEWS_URL, REVIEW_LINK_PROPS } from "@/lib/review-links"
import { cdn } from "@/lib/cdn"

const SERIF_FONT = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const
const SANS_FONT = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const

const PARTNER_NAME_PLACEHOLDER = "{{PARTNER_NAME}}"

const REVIEW_AVATARS = [
  { src: "/schools/avatar-1.png", alt: "Reviewer 1" },
  { src: "/schools/avatar-2.png", alt: "Reviewer 2" },
  { src: "/schools/avatar-3.png", alt: "Reviewer 3" },
] as const

function HeroPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center bg-[rgba(201,169,110,0.12)] border border-[rgba(201,169,110,0.25)] px-[9px] py-[7px]">
      <span
        className="text-[12px] font-medium uppercase tracking-[1.8px] text-[#a08248]"
        style={SANS_FONT}
      >
        {label}
      </span>
    </div>
  )
}

function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center justify-center size-5 rounded-[10px] bg-[rgba(201,169,110,0.1)] border border-[rgba(201,169,110,0.25)]">
        <Check className="size-[10px] text-[#a08248]" strokeWidth={3} />
      </span>
      <span className="text-[14px] leading-[1.2] text-[#696969]" style={SANS_FONT}>
        {children}
      </span>
    </div>
  )
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[rgba(255,255,255,0.97)] border border-[rgba(168,131,58,0.25)] shadow-[0_8px_40px_rgba(0,0,0,0.1)] w-[189.2px] h-[110.8px] relative">
      <div className="absolute left-[23.8px] top-[19.8px] w-[139.6px] h-px bg-gradient-to-r from-[#a8833a] to-transparent" />
      <div
        className="absolute left-[23.8px] top-[34.8px] text-[40px] leading-none font-light text-[#a8833a]"
        style={SERIF_FONT}
      >
        {value}
      </div>
      <div
        className="absolute left-[23.8px] top-[78.8px] text-[9px] uppercase tracking-[1.08px] text-[#7a746e]"
        style={SANS_FONT}
      >
        {label}
      </div>
    </div>
  )
}

function TrustStrip({
  excellent,
  verifiedBy,
  fromReviews,
  poweredBy,
}: {
  excellent: string
  verifiedBy: string
  fromReviews: string
  poweredBy: string
}) {
  return (
    <div
      className="hidden md:flex h-[70px] items-center gap-3 px-4 py-3 bg-[rgba(255,255,255,0.06)] border border-[rgba(28,27,24,0.08)] w-max shrink-0"
      style={SANS_FONT}
    >
      <div className="flex flex-col gap-2 shrink-0">
        <span
          className="text-[14px] font-bold text-[#999] whitespace-nowrap leading-none"
          style={{ fontFamily: "Montserrat, var(--font-sans), sans-serif" }}
        >
          {excellent}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <BadgeCheck className="size-4 text-[#00B67A] shrink-0" strokeWidth={2.2} />
          <span className="text-[12px] text-[#999] whitespace-nowrap shrink-0">{verifiedBy}</span>
          <a href={TRUSTPILOT_REVIEWS_URL} {...REVIEW_LINK_PROPS} aria-label="Trustpilot"
             className="shrink-0 transition-opacity hover:opacity-70">
            <Image
            src="/schools/trustpilot.svg"
            alt="Trustpilot"
            width={68}
            height={19}
            className="h-[18px] w-[68px] shrink-0"
          />
          </a>
        </div>
      </div>

      <div className="flex items-center gap-[17px] pl-2 pr-4 py-2 rounded-full bg-[rgba(9,9,9,0.05)] backdrop-blur-[6.15px] shrink-0">
        <div className="relative h-10 w-[104px] shrink-0">
          {REVIEW_AVATARS.map((a, i) => (
            <span
              key={a.src}
              className="absolute top-0 size-10 rounded-full border border-white overflow-hidden"
              style={{ left: `${3 + i * 30.5}px` }}
            >
              <Image src={a.src} alt={a.alt} fill className="object-cover" sizes="40px" />
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-[2px] justify-center shrink-0">
          <span className="text-[14px] leading-[19.5px] text-[#696969] whitespace-nowrap">
            {fromReviews}
          </span>
          <div className="flex items-center gap-[2px] shrink-0">
            <span className="text-[14px] leading-[19.5px] text-[#696969]">4.9</span>
            <span className="text-[12px] leading-[16.5px] tracking-[0.33px] text-[#00B67A] whitespace-nowrap">
              ★★★★★
            </span>
          </div>
        </div>
      </div>

      <div className="h-full w-px bg-[rgba(28,27,24,0.08)] shrink-0" />

      <div className="flex flex-col gap-2 h-full justify-center shrink-0">
        <span className="text-[14px] leading-[19.5px] text-[#696969] whitespace-nowrap">
          {poweredBy}
        </span>
        <div className="flex items-center shrink-0">
          <Image
            src="/wedding/google-g.svg"
            alt="Google"
            width={15}
            height={15}
            className="size-[14.5px] object-contain shrink-0 mr-[1px]"
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <Star
              key={i}
              className="size-[17.5px] text-[#FBBC05] shrink-0"
              fill="#FBBC05"
              strokeWidth={0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CtaButtons({
  primary,
  secondary,
  layout,
}: {
  primary: string
  secondary: string
  layout: "desktop" | "mobile"
}) {
  const containerCls =
    layout === "desktop"
      ? "hidden md:flex items-center gap-3"
      : "flex md:hidden flex-col gap-3 w-full"

  const primaryBtn = (
    <a
      href="#wedding-quote"
      className={
        "group h-12 px-6 inline-flex items-center justify-center bg-[#a08248] hover:bg-[#8a6f3c] hover:-translate-y-0.5 transition-[background-color,transform] duration-200 cursor-pointer " +
        (layout === "desktop" ? "w-[300px]" : "w-full")
      }
    >
      <span
        className="px-2 text-[14px] font-medium uppercase tracking-[1.1px] text-white"
        style={SANS_FONT}
      >
        {primary}
      </span>
      <MessageSquare className="size-4 text-white" strokeWidth={2} />
    </a>
  )

  const secondaryBtn = (
    <a
      href="/fleet"
      className={
        "group h-12 px-6 inline-flex items-center justify-center border border-[#999] hover:border-[#a08248] hover:text-[#a08248] transition-colors duration-200 cursor-pointer " +
        (layout === "desktop" ? "" : "w-full")
      }
    >
      <span
        className="px-2 text-[14px] font-medium uppercase tracking-[1.1px] text-[#999] group-hover:text-[#a08248] transition-colors duration-200"
        style={SANS_FONT}
      >
        {secondary}
      </span>
      <ArrowRight
        className="size-[14px] text-[#999] group-hover:text-[#a08248] transition-colors duration-200"
        strokeWidth={2}
      />
    </a>
  )

  return (
    <div className={containerCls}>
      {layout === "desktop" ? (
        <>
          {primaryBtn}
          {secondaryBtn}
        </>
      ) : (
        <>
          {secondaryBtn}
          {primaryBtn}
        </>
      )}
    </div>
  )
}

function LuxMotionAttribution() {
  return (
    <div className="flex items-center gap-[10px] shrink-0">
      <div className="relative w-[40px] h-[40px] border-[1.9px] border-[#C9A96E] flex items-center justify-center shrink-0">
        <div className="relative w-[20px] h-[11px]">
          <Image src="/shared/icons/lm-monogram.svg" alt="" fill className="object-contain" />
        </div>
      </div>
      <div className="flex flex-col justify-center">
        <div className="relative w-[72px] h-[8px]">
          <Image
            src="/shared/icons/luxmotion-text.svg"
            alt="LuxMotion"
            fill
            className="object-contain object-left"
            style={{ filter: "brightness(0)" }}
          />
        </div>
        <span className="text-[6.5px] tracking-[1px] text-[#999] mt-[3px] whitespace-nowrap">
          BY EASYTRANSFER
        </span>
      </div>
    </div>
  )
}

export function WeddingWhitelabelHero({
  partnerName = PARTNER_NAME_PLACEHOLDER,
  heroImageUrl,
}: {
  partnerName?: string;
  heroImageUrl?: string | null;
}) {
  const t = useTranslations("weddingWhitelabel.hero")

  const pillLabel = t("pill", { partnerName })
  const subtitle = t("subtitle", { partnerName })

  return (
    <section className="bg-[#EFE8DC] relative overflow-hidden">
      {/* Mobile */}
      <div className="md:hidden px-4 pt-6 pb-10 flex flex-col gap-6">
        <div className="relative h-[358px] w-full">
          <div className="absolute inset-0 overflow-hidden">
            <Image
              src={cdn(heroImageUrl || "/wedding/couple.webp")}
              alt={t("photoAlt")}
              fill
              priority
              sizes="100vw"
              className="object-cover object-[60%_center]"
              unoptimized={!!heroImageUrl}
            />
          </div>
          <div className="absolute right-4 bottom-[6px] w-[178px] h-[62px]">
            <Image
              src="/wedding/cars.webp"
              alt={t("carsAlt")}
              fill
              sizes="178px"
              className="object-contain object-right-bottom"
            />
          </div>
          <div className="absolute left-0 bottom-[34px]">
            <StatCard value={t("statValue")} label={t("statLabel")} />
          </div>
        </div>

        <div className="flex flex-col gap-5 items-start">
          <HeroPill label={pillLabel} />

          <h1 className="flex flex-col w-full" style={SERIF_FONT}>
            <span className="text-[44px] leading-[1.02] text-[#0d0d0d] font-normal">
              {t("titlePrimary")}
            </span>
            <span className="text-[44px] leading-[1.02] italic font-light text-[#a08248]">
              {t("titleAccent")}
            </span>
          </h1>

          <p className="text-[18px] leading-[1.3] text-[#696969] max-w-[420px]" style={SANS_FONT}>
            {subtitle}
          </p>

          <div className="flex flex-col gap-[10px] pt-3 w-full">
            <CheckRow>{t("check1")}</CheckRow>
            <CheckRow>{t("check2")}</CheckRow>
            <CheckRow>{t("check3")}</CheckRow>
          </div>

          <CtaButtons primary={t("ctaPrimary")} secondary={t("ctaSecondary")} layout="mobile" />

          <div className="flex items-center gap-3 pt-2">
            <span
              className="text-[12px] text-[#696969] leading-[1.2]"
              style={SANS_FONT}
            >
              {t("poweredByLabel")}
            </span>
            <LuxMotionAttribution />
            <div className="h-5 w-px bg-[rgba(28,27,24,0.12)]" />
            <span
              className="text-[12px] font-medium text-[#696969] tracking-[0.56px] leading-[1.2]"
              style={SANS_FONT}
            >
              {t("licenseLabel")}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block relative h-[800px]">
        <div className="absolute top-0 right-0 h-[800px] w-[1058px] overflow-hidden pointer-events-none">
          <Image
            src={cdn(heroImageUrl || "/wedding/couple.webp")}
            alt={t("photoAlt")}
            fill
            priority
            sizes="1058px"
            className="object-cover"
            style={{ objectPosition: "center" }}
            unoptimized={!!heroImageUrl}
          />
        </div>

        <div className="absolute right-0 bottom-[-2px] w-[403px] h-[139px] pointer-events-none">
          <Image
            src="/wedding/cars.webp"
            alt={t("carsAlt")}
            fill
            sizes="403px"
            className="object-contain object-right-bottom"
          />
        </div>

        <div className="absolute right-[544px] bottom-[71px] z-10">
          <StatCard value={t("statValue")} label={t("statLabel")} />
        </div>

        <div className="relative w-full max-w-[1440px] mx-auto h-[800px] flex items-center pl-12">
          <div className="flex-1 min-w-0 max-w-[640px] h-full flex flex-col gap-5 items-start justify-center py-20">
            <HeroPill label={pillLabel} />

            <h1 className="flex flex-col" style={SERIF_FONT}>
              <span className="text-[64px] leading-none text-[#0d0d0d] font-normal max-w-[560px]">
                {t("titlePrimary")}
              </span>
              <span className="text-[64px] leading-none italic font-light text-[#a08248] max-w-[560px]">
                {t("titleAccent")}
              </span>
            </h1>

            <p
              className="text-[18px] font-light leading-[1.3] text-[#696969] max-w-[574px]"
              style={SANS_FONT}
            >
              {subtitle}
            </p>

            <div className="flex flex-col gap-[10px] pt-3 w-full">
              <CheckRow>{t("check1")}</CheckRow>
              <CheckRow>{t("check2")}</CheckRow>
              <CheckRow>{t("check3")}</CheckRow>
            </div>

            <TrustStrip
              excellent={t("excellentRating")}
              verifiedBy={t("verifiedBy")}
              fromReviews={t("fromReviews")}
              poweredBy={t("poweredBy")}
            />

            <CtaButtons primary={t("ctaPrimary")} secondary={t("ctaSecondary")} layout="desktop" />

            <div className="flex items-center gap-4 pt-1">
              <span
                className="text-[14px] text-[#696969] leading-[1.2]"
                style={SANS_FONT}
              >
                {t("poweredByLabel")}
              </span>
              <LuxMotionAttribution />
              <div className="h-[39px] w-px bg-[rgba(28,27,24,0.12)]" />
              <span
                className="text-[14px] font-medium text-[#696969] tracking-[0.56px] leading-[1.2]"
                style={SANS_FONT}
              >
                {t("licenseLabel")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
