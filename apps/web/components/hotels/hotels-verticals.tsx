"use client"

import { useTranslations } from "next-intl"
import { Gem } from "lucide-react"

const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

type Vertical = { eyebrow: string; title: string; accent: string; body: string }

export function HotelsVerticals() {
  const t = useTranslations("hotels.verticals")
  const items = t.raw("items") as Vertical[]

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] px-4 py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
            <span className="font-sans text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
              {t("eyebrow")}
            </span>
            <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
          </div>
          <h2 className="text-[40px] leading-none text-[var(--lm-text,#f5f5f5)] md:text-[52px]" style={serif}>
            {t("titlePrefix")} <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("titleAccent")}</span>
          </h2>
          <p className="max-w-[760px] text-[16px] leading-[1.4] text-[var(--lm-text,#fff)]/55 md:text-[18px]">
            {t("subtitle")}
          </p>
        </div>

        <div className="border border-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]">
          <div className="grid grid-cols-1 gap-px bg-[rgba(var(--lm-text-rgb,255,255,255),0.08)] sm:grid-cols-2 md:grid-cols-3">
            {items.map((v, i) => (
              <div
                key={v.eyebrow}
                className="group relative flex cursor-default flex-col gap-[18px] bg-[var(--lm-surface,#1a1a1a)] px-6 py-8 transition-all duration-300 ease-out hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)] hover:ring-1 hover:ring-inset hover:ring-[rgba(var(--lm-accent-rgb,201,169,110),0.22)] md:px-9 md:py-10"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center border border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
                    <Gem className="size-6 transition-transform duration-300 ease-out group-hover:scale-110" strokeWidth={1.5} />
                  </span>
                  <span className="text-[26px] leading-none text-[rgba(var(--lm-accent-rgb,201,169,110),0.45)]" style={serif}>
                    0{i + 1}
                  </span>
                </div>
                <div className="flex flex-col gap-[10px]">
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--lm-muted,#8c8680)]">
                    {v.eyebrow}
                  </span>
                  <h3 className="text-[20px] font-medium leading-[1.2] text-[var(--lm-text,#fff)] md:text-[24px]" style={serif}>
                    {v.title} <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{v.accent}</span>
                  </h3>
                  <p className="text-[13px] leading-[1.35] text-[var(--lm-muted,#999)] md:text-[14px]">{v.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
