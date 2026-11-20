"use client"

import { useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Info } from "lucide-react"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

function money(n: number) {
  return "€ " + Math.round(n).toLocaleString("de-DE")
}

export function HotelsCalculator() {
  const t = useTranslations("hotels.revenueCalc")
  const [rooms, setRooms] = useState(90)
  const [commission, setCommission] = useState(13)

  const monthly = rooms * commission * 3
  const yearly = monthly * 12
  const roomsPct = ((rooms - 10) / (300 - 10)) * 100

  return (
    <section id="calcular" className="scroll-mt-24 bg-[var(--lm-bg,#0D0D0D)] px-4 py-16 lg:px-12 lg:py-24">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-10 flex flex-col gap-3">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={sans}>
            <span className="h-px w-7 bg-[var(--lm-accent,#C9A96E)]" />
            {t("eyebrow")}
          </span>
          <h2 className="text-[40px] leading-none text-[var(--lm-text,#f5f5f5)] md:text-[48px]" style={serif}>
            {t("title")}
          </h2>
        </div>

        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
          {/* image */}
          {/* Uma fotografia só, em vez do retrato de banco de imagens com as
              moedas douradas coladas ao canto. Esta mostra a coisa: um
              hoteleiro a olhar para a página de reserva da própria marca. */}
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            <Image
              src="/hotels/calculator-revenue.webp"
              alt={t("photoAlt")}
              fill
              className="object-cover"
              sizes="(min-width:1024px) 50vw, 100vw"
            />
          </div>

          {/* calculator */}
          <div className="border border-[rgba(var(--lm-accent-rgb,201,169,110),0.18)] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.05)] p-6 sm:p-8">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-[var(--lm-muted,#bdb7ad)]" style={sans}>{t("roomsLabel")}</span>
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-16 shrink-0 items-center justify-center border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] bg-[rgba(var(--lm-text-rgb,255,255,255),0.03)] text-[15px] text-[var(--lm-text,#fff)]" style={sans}>
                  {rooms}
                </span>
                <input
                  type="range"
                  min={10}
                  max={300}
                  value={rooms}
                  onChange={(e) => setRooms(Number(e.target.value))}
                  className="budget-slider flex-1"
                  style={{
                    background: `linear-gradient(to right, var(--lm-accent,#C9A96E) ${roomsPct}%, rgba(var(--lm-text-rgb,255,255,255),0.12) ${roomsPct}%)`,
                  }}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-[13px] text-[var(--lm-muted,#bdb7ad)]" style={sans}>
                {t("commissionLabel")} <Info className="h-3.5 w-3.5 text-[var(--lm-muted,#8c8680)]" />
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--lm-muted,#8c8680)]">€</span>
                <input
                  type="number"
                  min={5}
                  max={30}
                  value={commission}
                  onChange={(e) => setCommission(Math.max(0, Number(e.target.value) || 0))}
                  className="h-11 w-full border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] bg-[rgba(var(--lm-text-rgb,255,255,255),0.03)] pl-8 pr-3 text-[14px] text-[var(--lm-text,#fff)] outline-none transition-colors focus:border-[var(--lm-accent,#C9A96E)]"
                  style={sans}
                />
              </div>
            </div>

            <p className="mt-7 text-[14px] leading-[1.45] text-[var(--lm-muted,#9a9a9a)]" style={sans}>{t("intro")}</p>

            <div className="mt-5 flex flex-col gap-3">
              <div className="flex flex-col gap-1 border border-[rgba(var(--lm-text-rgb,255,255,255),0.1)] bg-[rgba(var(--lm-text-rgb,255,255,255),0.02)] px-5 py-4">
                <span className="text-[12px] text-[var(--lm-muted,#9a9a9a)]" style={sans}>{t("monthlyLabel")}</span>
                <span className="text-[26px] font-semibold leading-none text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={serif}>{money(monthly)}</span>
              </div>
              <div
                className="flex flex-col gap-1 border border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] px-5 py-4"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(var(--lm-accent-rgb,201,169,110),0.14) 0%, rgba(var(--lm-accent-rgb,201,169,110),0.06) 100%)",
                }}
              >
                <span className="text-[12px] text-[var(--lm-muted,#9a9a9a)]" style={sans}>{t("yearlyLabel")}</span>
                <span className="text-[28px] font-semibold leading-none text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={serif}>{money(yearly)}</span>
              </div>
            </div>

            <p className="mt-5 text-[11px] leading-[1.4] text-[var(--lm-muted,#6f6a62)]" style={sans}>{t("note")}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
