"use client"

import { useTranslations } from "next-intl"
import { Clock, Shield, Users, BriefcaseBusiness, TrendingUp, House } from "lucide-react"

const features = [
  { id: "alwaysOnTime", icon: Clock },
  { id: "privateAlways", icon: Shield },
  { id: "meetAndGreet", icon: Users },
  { id: "fleet", icon: BriefcaseBusiness },
  { id: "confirmed", icon: TrendingUp },
  { id: "partners", icon: House },
]

export function WhyScheduleSection() {
  const t = useTranslations("whyLuxMotion")

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] pt-10 pb-6">
      <div className="max-w-[1280px] mx-auto px-4">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-px bg-[var(--lm-accent,#C9A96E)]" />
            <span className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] font-sans">
              {t("sectionLabel")}
            </span>
          </div>
          <h2
            className="text-[36px] md:text-[48px] text-[var(--lm-text,#f5f5f5)] leading-none"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            {t("heading")}
          </h2>
          <p className="text-[16px] md:text-[18px] text-[var(--lm-text,#fff)]/55 leading-[1.4] max-w-[900px]">
            {t("subtitle")}
          </p>
        </div>

        <div className="border border-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-px bg-[rgba(var(--lm-text-rgb,255,255,255),0.08)]">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.id}
                  className="group relative bg-[var(--lm-surface,#1a1a1a)] flex flex-col gap-[18px] px-6 py-8 md:px-9 md:py-10 transition-all duration-300 ease-out hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)] hover:ring-1 hover:ring-inset hover:ring-[rgba(var(--lm-accent-rgb,201,169,110),0.22)] cursor-default"
                >
                  <div className="p-2">
                    <Icon className="size-6 text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-transform duration-300 ease-out group-hover:scale-110" strokeWidth={1.5} />
                  </div>
                  <div className="flex flex-col gap-[10px]">
                    <h3
                      className="font-medium text-[20px] md:text-[24px] text-[var(--lm-text,#fff)] leading-[1.2]"
                      style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
                    >
                      {t(`${feature.id}.title`)}
                    </h3>
                    <p className="text-[13px] md:text-[14px] text-[var(--lm-muted,#999)] leading-[1.2]">
                      {t(`${feature.id}.description`)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
