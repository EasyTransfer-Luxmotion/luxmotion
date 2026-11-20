"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import { cn } from "@workspace/ui/lib/utils"
import { useState } from "react"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"

const SERIF_FONT = {
  fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
} as const

const SANS_FONT = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
} as const

const FAQ_KEYS = [
  "payment",
  "flightDelay",
  "booking",
  "shareDiscount",
  "roundTrip",
  "outsideLisbon",
] as const

type FaqId = (typeof FAQ_KEYS)[number]

function FaqItem({
  id,
  isOpen,
  onToggle,
}: {
  id: FaqId
  isOpen: boolean
  onToggle: () => void
}) {
  const t = useTranslations(`whitelabel.faq.items.${id}`)
  return (
    <div className="border-b border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] lg:pr-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full py-[22px] text-left group gap-3"
      >
        <span
          className="text-[14px] font-medium text-[var(--lm-text,#fff)]"
          style={SANS_FONT}
        >
          {t("question")}
        </span>
        <div className="size-8 border-[1.143px] border-[rgba(var(--lm-text-rgb,255,255,255),0.3)] flex items-center justify-center shrink-0 group-hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] transition-colors">
          <Plus
            className={`size-[18px] text-[rgba(var(--lm-text-rgb,255,255,255),0.6)] transition-transform duration-300 ${
              isOpen ? "rotate-45" : ""
            }`}
          />
        </div>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          isOpen ? "max-h-96 pb-5" : "max-h-0"
        }`}
      >
        <p
          className="text-[14px] leading-[1.6] text-[var(--lm-muted,#999)]"
          style={SANS_FONT}
        >
          {t("answer")}
        </p>
      </div>
    </div>
  )
}

export function FAQ() {
  const { ref, reveal } = useScrollReveal<HTMLDivElement>()

  const t = useTranslations("whitelabel.faq")
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="bg-[var(--lm-surface,#141414)] border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] px-4 lg:px-[82px] pt-14 lg:pt-[72px] pb-14 lg:pb-[72px]">
      <div ref={ref} className={cn("max-w-[1280px] mx-auto flex flex-col gap-6 items-center", reveal())}>
        <div className="flex flex-col gap-2 items-center text-center">
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-[var(--lm-accent,#c9a96e)]" />
            <span
              className="text-[12px] font-medium uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] leading-none"
              style={SANS_FONT}
            >
              {t("eyebrow")}
            </span>
            <div className="h-px w-8 bg-[var(--lm-accent,#c9a96e)]" />
          </div>
          <h2
            className="text-[32px] lg:text-[48px] font-light leading-[1.1] text-[var(--lm-text,#fff)]"
            style={SERIF_FONT}
          >
            {t("titlePre")}{" "}
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]">{t("titleAccent")}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-[2px] w-full">
          {FAQ_KEYS.map((id, i) => (
            <FaqItem
              key={id}
              id={id}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
