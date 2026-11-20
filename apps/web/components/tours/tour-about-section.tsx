"use client"

import { useTranslations } from "next-intl"
import { TipTapRenderer } from "@/components/shared/tiptap-renderer"

interface TourAboutSectionProps {
  description: string | Record<string, any>
}

export function TourAboutSection({ description }: TourAboutSectionProps) {
  const t = useTranslations("tourDetails")

  return (
    <div className="w-full">
      <h2
        className="text-[24px] md:text-[32px] text-[var(--lm-text,#fff)] leading-[1.3] mb-6"
        style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
      >
        {t("aboutPrefix")}{" "}
        <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("aboutAccent")}</span>
      </h2>
      <TipTapRenderer
        content={description}
        className="text-[14px] lg:text-[16px] text-[var(--lm-muted,#999)] leading-[1.6]"
      />
    </div>
  )
}
