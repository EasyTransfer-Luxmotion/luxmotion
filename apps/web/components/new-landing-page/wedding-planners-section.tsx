"use client"

import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

export function WeddingPlannersSection() {
  const t = useTranslations("weddingPlanners")

  return (
    <section
      id="b2b-wedding-planners"
      className="bg-[var(--lm-bg,#0D0D0D)] py-10 md:py-24 px-4 md:px-[82px]"
    >
      <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row md:items-center gap-6 md:gap-20">
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
            href="/wedding"
            className="group inline-flex items-center gap-2 text-[14px] tracking-[0.12em] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:text-[var(--lm-text,#fff)] transition-colors w-fit pt-4"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            <span>{t("cta")}</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="flex-1 relative">
          <div className="relative w-full aspect-[4/3] rounded-[4px] overflow-hidden">
            <Image
              src="/hotels/b2b/wedding-planners.webp"
              alt={t("photoAlt")}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          <RideStatusCard />
        </div>
      </div>
    </section>
  )
}

function RideStatusCard() {
  const t = useTranslations("weddingPlanners.card")

  return (
    <div className="absolute bottom-[-20px] right-[-10px] md:right-[-20px] min-w-[220px] backdrop-blur-[6px] bg-[rgba(var(--lm-surface-rgb,20,20,20),0.95)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.15)] p-4 flex flex-col gap-3 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.6)]">
      <div>
        <span
          className="inline-block bg-[var(--lm-accent,#C9A96E)] text-[#0D0D0D] text-[9px] tracking-[0.9px] uppercase font-bold px-[10px] py-1"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {t("badge")}
        </span>
      </div>

      <div className="h-[3px] rounded-[2px] bg-gradient-to-r from-[var(--lm-accent,#C9A96E)] to-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] w-full" />

      <div className="flex items-center gap-1">
        <span
          className="text-[12px] font-semibold text-[var(--lm-text,#fff)]"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {t("arrival")}
        </span>
        <span
          className="bg-[rgba(var(--lm-accent-rgb,201,169,110),0.1)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] px-[11px] py-1 text-[9px] tracking-[0.72px] uppercase font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {t("status")}
        </span>
      </div>
    </div>
  )
}
