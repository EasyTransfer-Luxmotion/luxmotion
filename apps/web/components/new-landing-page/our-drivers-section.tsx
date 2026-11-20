"use client"

import { useCallback, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Search,
  CircleAlert,
  Check,
} from "lucide-react"
import { useSwipe } from "@/hooks/use-swipe"
import { usePublishedDrivers, type PublicDriver as Driver } from "@/hooks/use-published-drivers"

const VETTING_STEPS = [
  { key: "step1", icon: ListChecks, gold: false },
  { key: "step2", icon: Search, gold: false },
  { key: "step3", icon: CircleAlert, gold: false },
  { key: "step4", icon: Check, gold: true },
] as const

export function OurDriversSection() {
  const t = useTranslations("drivers")
  const DRIVERS = usePublishedDrivers()
  const [rawCurrent, setCurrent] = useState(0)
  const total = DRIVERS.length
  // The list length can change once Convex resolves, so never point past the end.
  const current = Math.min(rawCurrent, total - 1)

  const goPrev = useCallback(() => {
    setCurrent((c) => (c > 0 ? c - 1 : c))
  }, [])

  const goNext = useCallback(() => {
    setCurrent((c) => (c < total - 1 ? c + 1 : c))
  }, [total])

  const swipeHandlers = useSwipe(goNext, goPrev)

  return (
    <section id="drivers" className="bg-[var(--lm-bg,#0D0D0D)] pt-16 lg:pt-6 pb-16">
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex items-center gap-2"
            style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
          >
            <div className="w-[42.5px] h-px bg-[var(--lm-accent,#C9A96E)]" />
            <span className="text-[12px] font-semibold tracking-[2px] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] leading-none">
              {t("sectionLabel")}
            </span>
            <div className="w-[42.5px] h-px bg-[var(--lm-accent,#C9A96E)]" />
          </div>
          <h2
            className="flex flex-col items-center text-center text-[36px] sm:text-[40px] lg:text-[48px] leading-none tracking-[0.52px] font-light"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            <span className="text-[var(--lm-text,#fff)]">{t("titlePart1")}</span>
            <span className="text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] italic">{t("titlePart2")}</span>
          </h2>
        </div>

        <div
          className="relative w-full max-w-[1080px]"
          style={{ marginTop: "-10px" }}
          {...swipeHandlers}
        >
          <div className="relative grid">
            {DRIVERS.map((driver, i) => {
              const active = i === current
              return (
                <div
                  key={driver.id}
                  aria-hidden={!active}
                  className={`col-start-1 row-start-1 transition-[opacity,transform,filter] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    active
                      ? "opacity-100 translate-x-0 blur-0 pointer-events-auto"
                      : "opacity-0 translate-x-6 blur-[2px] pointer-events-none"
                  }`}
                >
                  <DriverSlide
                    driver={driver}
                    active={active}
                    vehicleLabel={t("vehicle")}
                    languagesLabel={t("languages")}
                    ridesLabel={t("rides")}
                    statusLabel={t("onTripNow")}
                  />
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={goPrev}
            aria-label={t("prevDriver")}
            className={`absolute left-6 lg:left-0 top-[130px] sm:top-[140px] lg:top-1/2 -translate-y-1/2 size-9 bg-[var(--lm-bg,#0D0D0D)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] flex items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.1)] ${
              current === 0 ? "opacity-0 pointer-events-none" : ""
            }`}
          >
            <ChevronLeft className="size-[14px]" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={t("nextDriver")}
            className={`absolute right-6 lg:right-0 top-[130px] sm:top-[140px] lg:top-1/2 -translate-y-1/2 size-9 bg-[var(--lm-bg,#0D0D0D)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] flex items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.1)] ${
              current === total - 1 ? "opacity-0 pointer-events-none" : ""
            }`}
          >
            <ChevronRight className="size-[14px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {DRIVERS.map((driver, i) => (
            <button
              key={driver.id}
              type="button"
              onClick={() => setCurrent(i)}
              aria-label={`${t("goToDriver")} ${i + 1}`}
              className={`h-[6px] rounded-[3px] transition-all duration-300 ${
                i === current
                  ? "w-5 bg-[var(--lm-accent,#C9A96E)]"
                  : "w-[6px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.5)]"
              }`}
            />
          ))}
        </div>

        <div className="w-full max-w-[960px] mt-4">
          <div className="bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] px-6 sm:px-10 lg:px-[48.8px] py-8 lg:py-[40.8px] flex flex-col lg:flex-row gap-8 lg:gap-12 items-center justify-center">
            <div className="w-full lg:w-[272px] lg:shrink-0 text-left">
              <p className="text-[14px] font-semibold text-[var(--lm-text,#fff)] leading-[21px] max-w-[245px] lg:max-w-none text-balance">
                {t("vettingHeading")}
              </p>
              <p className="italic text-[12px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] leading-[25.2px] mt-1">
                {t("vettingSubtext")}
              </p>
            </div>
            <div className="w-full lg:w-[574px] lg:shrink-0 relative flex justify-between items-start gap-2 sm:gap-4">
              <div className="absolute top-[22px] lg:top-[28px] left-[12.5%] right-[12.5%] h-0 border-t-2 border-dashed border-[var(--lm-accent,#C9A96E)]" />
              {VETTING_STEPS.map((step) => {
                const Icon = step.icon
                return (
                  <div
                    key={step.key}
                    className="flex-1 flex flex-col items-center gap-3 relative z-10"
                  >
                    <div
                      className={`size-11 sm:size-12 lg:size-14 rounded-full border-2 border-[rgba(var(--lm-accent-rgb,201,169,110),0.25)] flex items-center justify-center shrink-0 ${
                        step.gold ? "bg-[var(--lm-accent,#C9A96E)]" : "bg-white"
                      }`}
                    >
                      <Icon
                        className={`size-5 lg:size-6 ${
                          step.gold ? "text-[var(--lm-text,#fff)]" : "text-[var(--lm-accent,#C9A96E)]"
                        }`}
                        strokeWidth={2}
                      />
                    </div>
                    <p className="text-[11px] lg:text-[12px] text-[var(--lm-muted,#999)] text-center leading-[1.2] max-w-[90px]">
                      {t(step.key)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function DriverSlide({
  driver,
  active,
  vehicleLabel,
  languagesLabel,
  ridesLabel,
  statusLabel,
}: {
  driver: Driver
  active: boolean
  vehicleLabel: string
  languagesLabel: string
  ridesLabel: string
  statusLabel: string
}) {
  const imgMotion = active
    ? "opacity-100 scale-100"
    : "opacity-0 scale-[0.94]"
  const textMotion = active
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-2"
  const ease = "cubic-bezier(0.22,1,0.36,1)"

  return (
    <div className="w-full shrink-0 px-0 sm:px-16">
      <div className="mx-auto max-w-[960px] flex flex-col lg:flex-row items-center lg:items-start gap-8 lg:gap-0">
        <div className="relative w-[260px] sm:w-[320px] lg:w-[380px] h-[260px] sm:h-[280px] lg:h-[300px] flex items-start justify-center shrink-0">
          <div
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+15px)] size-[220px] sm:size-[260px] rounded-full bg-[rgba(var(--lm-accent-rgb,201,169,110),0.07)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] transition-all duration-[700ms] ${
              active ? "opacity-100 scale-100" : "opacity-0 scale-[0.9]"
            }`}
            style={{ transitionTimingFunction: ease, transitionDelay: active ? "80ms" : "0ms" }}
          />
          <div
            className={`relative w-[176px] sm:w-[220px] h-[248px] sm:h-[300px] rounded-t-[88px] sm:rounded-t-[100px] border border-[var(--lm-accent,#C9A96E)] overflow-hidden z-10 transition-all duration-[700ms] ${imgMotion}`}
            style={{
              transitionTimingFunction: ease,
              transitionDelay: active ? "120ms" : "0ms",
              backgroundImage:
                "linear-gradient(rgba(15, 15, 15, 1) 0%, rgba(25, 25, 25, 1) 87.98%, rgba(201, 169, 110, 0.04) 94.71%)",
            }}
          >
            <Image
              src={driver.image}
              alt={driver.name}
              fill
              sizes="(max-width: 640px) 200px, 220px"
              className="object-cover object-top"
            />
          </div>
        </div>

        <div
          className={`w-full flex-1 lg:w-[580px] lg:mt-16 flex flex-col gap-[10px] items-start text-left transition-all duration-[650ms] ${textMotion}`}
          style={{ transitionTimingFunction: ease, transitionDelay: active ? "200ms" : "0ms" }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <h3
              className="text-[28px] lg:text-[32px] leading-[1.1] lg:leading-[36px] text-[var(--lm-text,#fff)]"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {driver.name}
            </h3>
            <span className="inline-flex items-center gap-2">
              <span className="relative inline-flex size-2">
                <span className="absolute inset-0 rounded-full bg-[#4ADE80] animate-ping-strong" />
                <span className="relative inline-flex size-2 rounded-full bg-[#4ADE80] shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
              </span>
              <span className="text-[12px] tracking-[0.5px] text-[var(--lm-muted,#8c8680)] leading-none">
                {statusLabel}
              </span>
            </span>
          </div>
          <p className="text-[14px] leading-[1.3] text-[var(--lm-muted,#999)] max-w-[513px]">
            {driver.description}
          </p>

          <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 pt-4 items-start justify-start lg:justify-start w-full">
            <div className="flex items-start gap-2">
              <div className="relative w-16 h-12 shrink-0 mt-1">
                <Image
                  src="/drivers/mercedes-s-class.png"
                  alt={driver.vehicle}
                  fill
                  sizes="64px"
                  className="object-contain"
                />
              </div>
              <div className="flex flex-col gap-3 items-start">
                <span className="text-[12px] font-semibold tracking-[2px] uppercase text-[var(--lm-text,#fff)] leading-none">
                  {vehicleLabel}
                </span>
                <span className="text-[14px] text-[var(--lm-muted,#999)] leading-none whitespace-nowrap">
                  {driver.vehicle}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 items-center sm:items-start">
              <span className="text-[12px] font-semibold tracking-[2px] uppercase text-[var(--lm-text,#fff)] leading-none">
                {languagesLabel}
              </span>
              <span className="text-[14px] text-[var(--lm-muted,#999)] leading-none">
                {driver.languages}
              </span>
            </div>
          </div>

          <div className="-mt-1">
            <div className="inline-flex items-center gap-[7px] px-4 py-3 bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.2)]">
              <span className="text-[12px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] leading-none">
                {driver.rating}
              </span>
              <span className="text-[12px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] tracking-[2px] leading-none">
                ★★★★★
              </span>
              <span className="text-[12px] text-[var(--lm-muted,#8c8680)] tracking-[0.44px] leading-none">
                · {driver.rides.toLocaleString()} {ridesLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
