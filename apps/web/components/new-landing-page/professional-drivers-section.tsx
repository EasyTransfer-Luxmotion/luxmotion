"use client"

import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

export function ProfessionalDriversSection() {
  const t = useTranslations("professionalDrivers")

  return (
    <section
      id="b2b-professional-drivers"
      className="bg-[var(--lm-surface,#1A1A1A)] py-10 md:py-24 px-4 md:px-[82px]"
    >
      <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row md:items-center gap-6 md:gap-20">
        <div className="flex-1 relative mb-32 md:mb-0">
          <div className="relative w-full aspect-[4/3] rounded-[4px] overflow-hidden">
            <Image
              src="/hotels/b2b/professional-drivers.webp"
              alt={t("photoAlt")}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          <DriverScheduleCard />
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center gap-[10px]">
            <div className="w-8 h-px bg-[var(--lm-accent,#C9A96E)]" />
            <span
              className="text-[12px] tracking-[1.8px] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] font-semibold"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {t("sectionLabel")}
            </span>
          </div>

          <h2
            className="text-[32px] md:text-[48px] leading-none text-[var(--lm-text,#fff)]"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            {t("titleLine1")}
            <br />
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("titleLine2")}</span>
          </h2>

          <p
            className="text-[14px] leading-[1.5] text-[var(--lm-muted,#999)]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("body")}
          </p>

          <Link
            href="/drivers/apply"
            className="group inline-flex items-center gap-2 text-[14px] tracking-[0.12em] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:text-[var(--lm-text,#fff)] transition-colors w-fit pt-4"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            <span>{t("cta")}</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  )
}

function DriverScheduleCard() {
  const t = useTranslations("professionalDrivers.card")

  const rides = [
    { time: "09:15", badge: t("onTime"), route: t("route1"), status: "ontime" as const },
    { time: "14:30", badge: t("onTime"), route: t("route2"), status: "ontime" as const },
    { time: "19:00", badge: t("scheduled"), route: t("route3"), status: "scheduled" as const },
  ]

  return (
    <div className="absolute bottom-[-16px] right-[-8px] md:right-[-16px] w-[208px] xl:w-[252px] backdrop-blur-[6px] bg-[rgba(var(--lm-surface-rgb,20,20,20),0.95)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.15)] px-3.5 pt-3.5 pb-1.5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-1 mb-3">
        <span
          className="text-[11px] text-[var(--lm-muted,#999)]"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {t("dateLabel")}
        </span>
        <span
          className="text-[11px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {t("ridesCount")}
        </span>
      </div>

      {rides.map((ride, i) => (
        <div
          key={ride.time}
          className={`flex items-center gap-2 py-2 ${i < rides.length - 1 ? "border-b border-[rgba(var(--lm-text-rgb,255,255,255),0.06)]" : ""}`}
        >
          <span
            className="text-[12px] font-semibold text-[var(--lm-text,#fff)] min-w-[36px]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {ride.time}
          </span>
          <span
            className={`text-[7px] font-bold tracking-[0.64px] uppercase text-center min-w-[50px] px-[9px] py-[2px] border ${
              ride.status === "ontime"
                ? "bg-[rgba(76,175,80,0.15)] border-[rgba(76,175,80,0.25)] text-[#4CAF50]"
                : "bg-[rgba(var(--lm-accent-rgb,201,169,110),0.1)] border-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
            }`}
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {ride.badge}
          </span>
          <span
            className="text-[10px] text-[var(--lm-muted,#999)] whitespace-nowrap"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {ride.route}
          </span>
        </div>
      ))}
    </div>
  )
}
