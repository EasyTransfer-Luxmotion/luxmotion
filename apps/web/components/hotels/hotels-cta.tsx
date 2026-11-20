"use client"

import { Link } from "@/i18n/navigation"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

const MASK = "linear-gradient(to bottom, transparent 0%, black 35%, black 65%, transparent 100%)"

export function HotelsCta({ messageKey = "ctaFinal" }: { messageKey?: string }) {
  const t = useTranslations(`hotels.${messageKey}`)

  return (
    <section className="relative overflow-hidden bg-[var(--lm-bg,#0D0D0D)] px-4 py-14 md:px-[82px] lg:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(to right, rgba(154,117,53,0.22) 0%, rgba(154,117,53,0) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-7 lg:flex-row lg:items-center">
        <div className="flex flex-col gap-2.5">
          <h2 className="text-[32px] leading-[1.1] text-[var(--lm-text,#F5F5F5)] md:text-[44px]" style={serif}>
            {t("titlePrefix")} <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("titleAccent")}</span>
            {t("titleSuffix")}
          </h2>
          <p className="max-w-[620px] text-[15px] leading-[1.4] text-[var(--lm-muted,#999)] md:text-[16px]" style={sans}>
            {t("subtitle")}
          </p>
        </div>

        <Link
          href="/hotels/candidatura"
          className="group inline-flex h-[52px] shrink-0 items-center gap-2 bg-[var(--lm-accent,#C9A96E)] px-7 text-[#1a1510] transition-colors hover:bg-[#d4b87f]"
          style={sans}
        >
          <span className="text-[13px] font-semibold uppercase tracking-[1.1px]">{t("button")}</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  )
}
