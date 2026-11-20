"use client"

import { Link } from "@/i18n/navigation"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

export function CTABanner() {
  const t = useTranslations("ctaBanner")

  return (
    <section
      className="relative overflow-hidden pt-10 pb-16 px-4 md:px-[82px] flex flex-col items-center justify-center gap-6 bg-[var(--lm-bg,#0D0D0D)]"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to right, rgba(var(--lm-bg-rgb,13,13,13),1) 0%, rgba(var(--lm-bg-rgb,26,16,5),0.95) 28%, rgba(var(--lm-bg-rgb,26,16,5),1) 50%, rgba(var(--lm-bg-rgb,26,16,5),0.95) 72%, rgba(var(--lm-bg-rgb,13,13,13),1) 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, transparent 0, transparent 119px, rgba(var(--lm-accent-rgb,201,169,110),0.12) 119px, rgba(var(--lm-accent-rgb,201,169,110),0.12) 120px)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)",
        }}
      />
      <div className="flex flex-col items-center gap-2 text-center max-w-[1280px] relative z-10">
        <h2
          className="text-[36px] md:text-[48px] text-[var(--lm-text,#F5F5F5)] leading-none"
          style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif", fontWeight: 300 }}
        >
          {t("line1")}
          <br />
          <span className="italic font-medium text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("line2")}</span>
        </h2>
        <p
          className="text-[16px] md:text-[18px] leading-[1.3] text-[var(--lm-muted,#999)] text-center"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {t("subtitle1")}
          <br />
          {t("subtitle2")}
        </p>
      </div>

      <Link
        href="/tours"
        className="group relative z-10 inline-flex items-center gap-2 border border-[var(--lm-accent,#C9A96E)] h-12 px-6 text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] transition-colors"
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        <span className="text-[14px] font-medium tracking-[1.1px] uppercase">
          {t("cta")}
        </span>
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
      </Link>
    </section>
  )
}
