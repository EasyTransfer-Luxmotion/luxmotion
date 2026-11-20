"use client"

import { useTranslations } from "next-intl"
import { Wallet, Check } from "lucide-react"

const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

type Plan = { label: string; body: string; feature: string }

export function HotelsPayment() {
  const t = useTranslations("hotels.payment")
  const options = t.raw("options") as Plan[]

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
          <div className="grid grid-cols-1 gap-px bg-[rgba(var(--lm-text-rgb,255,255,255),0.08)] md:grid-cols-3">
            {options.map((o, i) => (
              <div
                key={o.label}
                className="group relative flex cursor-default flex-col gap-5 bg-[var(--lm-surface,#1a1a1a)] px-6 py-8 transition-all duration-300 ease-out hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)] hover:ring-1 hover:ring-inset hover:ring-[rgba(var(--lm-accent-rgb,201,169,110),0.22)] md:px-9 md:py-10"
              >
                <span className="flex h-12 w-12 items-center justify-center border border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
                  <Wallet className="size-6 transition-transform duration-300 ease-out group-hover:scale-110" strokeWidth={1.5} />
                </span>

                <div className="flex flex-col gap-[10px]">
                  <h3 className="text-[24px] leading-none text-[var(--lm-text,#fff)] md:text-[26px]" style={serif}>
                    {t("optionWord")} <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{i + 1}</span>
                  </h3>
                  <span className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
                    {o.label}
                  </span>
                  <p className="text-[13.5px] leading-[1.45] text-[var(--lm-muted,#999)]">{o.body}</p>
                </div>

                <div className="mt-auto flex flex-col gap-4 pt-2">
                  <div className="h-px w-full bg-[rgba(var(--lm-text-rgb,255,255,255),0.08)]" />
                  <div className="flex items-start gap-2.5 text-[13.5px] text-[var(--lm-muted,#d8d3c8)]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" strokeWidth={2} />
                    {o.feature}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
