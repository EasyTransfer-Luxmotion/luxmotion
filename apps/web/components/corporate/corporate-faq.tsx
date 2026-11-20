"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

const FAQ_KEYS = ["multiPickup", "wifi", "branding", "lastMinute", "invoices"] as const

export function CorporateFAQ() {
  const t = useTranslations("corporatePage.faq")
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section id="faq" className="bg-[var(--lm-bg,#0D0D0D)] px-4 py-12 md:px-[82px] md:py-[60px]">
      <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-9">
        <div className="flex w-full flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
            <span
              className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
              style={sans}
            >
              {t("eyebrow")}
            </span>
            <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
          </div>
          <h2
            className="text-[32px] leading-tight text-[var(--lm-text,#fff)] md:text-[48px]"
            style={serif}
          >
            {t("titleRest")}{" "}
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("titleGold")}</span>.
          </h2>
        </div>

        <div className="flex w-full max-w-[824px] flex-col">
          {FAQ_KEYS.map((key, i) => {
            const isOpen = openIndex === i
            return (
              <div key={key} className="border-b border-[rgba(var(--lm-text-rgb,255,255,255),0.07)]">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="group flex w-full items-center justify-between gap-4 py-[22px] text-left"
                >
                  <span
                    className="flex-1 text-[14px] font-medium leading-snug text-[var(--lm-text,#fff)]"
                    style={sans}
                  >
                    {t(`items.${key}.question`)}
                  </span>
                  <div className="flex size-8 shrink-0 items-center justify-center border-[1.143px] border-[rgba(var(--lm-text-rgb,255,255,255),0.3)] transition-colors group-hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)]">
                    <Plus
                      className={`size-[18px] text-[rgba(var(--lm-text-rgb,255,255,255),0.5)] transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
                    />
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${isOpen ? "max-h-96" : "max-h-0"}`}
                >
                  <p
                    className="pb-5 text-[14px] leading-[1.6] text-[var(--lm-muted,#999)]"
                    style={sans}
                  >
                    {t(`items.${key}.answer`)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
