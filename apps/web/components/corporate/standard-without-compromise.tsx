"use client"

import { useTranslations } from "next-intl"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

const CARD_KEYS = ["fleet", "drivers", "schedules", "discretion", "coverage", "billing"] as const

export function StandardWithoutCompromise() {
  const t = useTranslations("corporatePage.standard")

  return (
    <section className="flex w-full flex-col items-center justify-center gap-6 bg-[var(--lm-bg,#0D0D0D)] px-4 py-12 md:px-[82px] md:py-[60px]">
      <div className="flex w-full max-w-[1280px] flex-col items-start gap-4">
        <div className="flex items-center gap-2">
          <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
          <span
            className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
            style={sans}
          >
            {t("eyebrow")}
          </span>
        </div>

        <h2
          className="w-full text-[36px] leading-none text-[var(--lm-text,#F5F5F5)] md:text-[48px]"
          style={serif}
        >
          {t("headingPart1")}{" "}
          <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("headingPart2")}</span>.
        </h2>

        <p
          className="w-full text-[16px] leading-[1.3] text-[var(--lm-muted,#999)] md:max-w-[909px] md:text-[18px]"
          style={sans}
        >
          {t("subtitle")}
        </p>
      </div>

      <div className="w-full max-w-[1280px] border border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] p-px">
        <div className="grid grid-cols-2 gap-px bg-[rgba(var(--lm-text-rgb,255,255,255),0.08)]">
          {CARD_KEYS.map((key, i) => (
            <div
              key={key}
              className="flex flex-col items-start justify-center gap-[18px] bg-[var(--lm-bg,#0D0D0D)] px-5 py-6 md:px-9"
            >
              <div className="flex items-center gap-2">
                <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
                <span
                  className="text-[24px] font-semibold uppercase leading-none tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
                  style={serif}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              <div className="flex w-full flex-col items-start gap-[10px]">
                <h3
                  className="w-full text-[24px] font-medium leading-[1.2] text-[var(--lm-text,#fff)]"
                  style={serif}
                >
                  {t(`cards.${key}.title`)}
                </h3>
                <p
                  className="w-full text-[14px] leading-[1.3] text-[var(--lm-muted,#999)]"
                  style={sans}
                >
                  {t(`cards.${key}.body`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
