"use client"

import { BadgeCheck } from "lucide-react"
import { useTranslations } from "next-intl"

export function ExclusiveBadge() {
  const t = useTranslations()

  return (
    <div className="flex flex-col justify-center items-center gap-2 py-2 px-4 rounded-full border border-[var(--lm-accent,#C9A96E)] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]">
      <div className="flex items-center">
        <BadgeCheck className="size-6 text-[var(--lm-accent,#C9A96E)]" />
        <div className="flex justify-center items-center gap-2.5 py-0 px-2 text-[var(--lm-text,#fff)] text-sm leading-[normal]">
          {t("exclusive")}
        </div>
      </div>
    </div>
  )
}
