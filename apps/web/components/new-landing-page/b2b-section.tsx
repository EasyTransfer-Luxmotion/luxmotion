"use client"

import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { ArrowRight, Clock, Mail, Phone, Plane } from "lucide-react"
import { useTranslations } from "next-intl"

export function B2BSection() {
  const t = useTranslations("b2b")

  return (
    <section
      id="b2b-hotels"
      className="bg-[var(--lm-bg,#0D0D0D)] pt-10 pb-[56px] px-4 md:px-[82px]"
    >
      <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row md:items-center gap-10 md:gap-20">
        <div className="flex-1 flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-px bg-[var(--lm-accent,#C9A96E)]" />
            <span
              className="text-[11px] md:text-[12px] tracking-[0.24em] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {t("sectionLabel")}
            </span>
          </div>
          <h2
            className="text-[36px] md:text-[48px] leading-[1.05] text-[var(--lm-text,#fff)]"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            {t("titleMain")}
            <br />
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("titleItalic")}</span>
          </h2>
          <p
            className="text-[15px] md:text-[16px] leading-[1.7] text-[var(--lm-muted,#C9C9C9)] max-w-[520px]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("body1")}
          </p>
          <p
            className="text-[14px] md:text-[15px] leading-[1.7] text-[var(--lm-muted,#999)] max-w-[520px]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("body2")}
          </p>
          <Link
            href="/partner-guide"
            className="group inline-flex items-center gap-2 text-[14px] tracking-[0.12em] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:text-[var(--lm-text,#fff)] transition-colors w-fit"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            <span>{t("cta")}</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="flex-1 relative">
          <div className="relative w-full aspect-[4/3] overflow-hidden rounded-[2px]">
            <Image
              src="/hotels/b2b/hotel-arrival.webp"
              alt={t("photoAlt")}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--lm-bg,#000)]/50 via-transparent to-transparent" />
          </div>

          <GuestCheckInCard />
        </div>
      </div>
    </section>
  )
}

function GuestCheckInCard() {
  const t = useTranslations("b2b.card")

  return (
    <div className="absolute bottom-[-24px] right-[-10px] md:right-[-16px] w-[200px] xl:w-[232px] 2xl:w-[248px] bg-[var(--lm-surface,#141414)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.22)] rounded-[4px] p-4 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[9px] tracking-[0.2em] uppercase text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {t("label")}
        </span>
        <span className="relative inline-flex size-2">
          <span className="absolute inset-0 rounded-full bg-[#4ADE80] animate-ping-strong" />
          <span className="relative inline-flex size-2 rounded-full bg-[#4ADE80] shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
        </span>
      </div>

      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="w-8 h-8 rounded-full bg-[rgba(var(--lm-accent-rgb,201,169,110),0.12)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] flex items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] text-[12px]"
          style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
        >
          {t("guestInitial")}
        </div>
        <div className="flex flex-col">
          <span
            className="text-[12px] text-[var(--lm-text,#fff)]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("guestName")}
          </span>
          <span
            className="text-[10px] text-[var(--lm-muted,#999)]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("guestMeta")}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mb-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--lm-muted,#C9C9C9)]">
          <Plane className="w-3 h-3 text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" />
          <span style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
            {t("tag1")}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[var(--lm-muted,#C9C9C9)]">
          <Clock className="w-3 h-3 text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" />
          <span style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
            {t("tag2")}
          </span>
        </div>
      </div>

      <div className="flex gap-2 pt-3 border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.08)]">
        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[2px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.12)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] text-[10px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] transition-colors"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          <Phone className="w-3 h-3" />
          {t("call")}
        </button>
        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[2px] bg-[rgba(var(--lm-text-rgb,255,255,255),0.04)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] text-[10px] text-[var(--lm-muted,#C9C9C9)] hover:bg-[rgba(var(--lm-text-rgb,255,255,255),0.08)] transition-colors"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          <Mail className="w-3 h-3" />
          {t("message")}
        </button>
      </div>
    </div>
  )
}
