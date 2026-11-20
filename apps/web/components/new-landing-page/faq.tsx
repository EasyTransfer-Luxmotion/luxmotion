"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"

const FAQ_KEYS = [
  "booking",
  "flightDelay",
  "private",
  "vehicles",
  "coverage",
] as const

export function FAQ() {
  const t = useTranslations("faq.redesign")
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section
      id="faq"
      className="bg-[var(--lm-bg,#0D0D0D)] py-10 md:py-16 px-4 md:px-[82px]"
    >
      <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row md:items-start gap-8 md:gap-20">
        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-px bg-[var(--lm-accent,#C9A96E)]" />
            <span
              className="text-[12px] tracking-[1.8px] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] font-semibold"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {t("sectionLabel")}
            </span>
          </div>

          <h2
            className="text-[32px] md:text-[48px] leading-none text-[var(--lm-text,#fff)] tracking-[0.52px]"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            {t("titleLine1")}
            <br />
            {t("titleLine2")}
          </h2>

          <div className="flex flex-col pt-6 md:pt-9">
            {FAQ_KEYS.map((key, i) => (
              <div
                key={key}
                className="border-b border-[rgba(var(--lm-text-rgb,255,255,255),0.07)]"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="flex items-center justify-between w-full py-[22px] text-left group"
                >
                  <span
                    className="text-[14px] font-medium text-[var(--lm-text,#fff)] pr-4"
                    style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                  >
                    {t(`items.${key}.question`)}
                  </span>
                  <div className="size-8 border-[1.143px] border-[rgba(var(--lm-text-rgb,255,255,255),0.3)] flex items-center justify-center shrink-0 group-hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] transition-colors">
                    <Plus
                      className={`w-[18px] h-[18px] text-[var(--lm-text,#fff)]/50 transition-transform duration-300 ${openIndex === i ? "rotate-45" : ""}`}
                    />
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${openIndex === i ? "max-h-96" : "max-h-0"}`}
                >
                  <p
                    className="text-[14px] leading-[1.6] text-[var(--lm-muted,#999)] pb-5"
                    style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                  >
                    {t(`items.${key}.answer`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full md:w-[380px] xl:w-[605px] shrink-0 aspect-[605/577] rounded-[4px] overflow-hidden relative">
          {/* Sem o zoom/offset antigo: estava calibrado para a foto anterior
              e nesta cortava a cara. object-top mantém o rosto no enquadramento. */}
          <Image
            src="/faq/driver-photo.webp"
            alt={t("photoAlt")}
            fill
            className="object-cover object-top"
            sizes="(max-width: 768px) 100vw, 605px"
            priority={false}
            quality={90}
          />
        </div>
      </div>
    </section>
  )
}
