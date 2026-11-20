"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Check, Info } from "lucide-react"
import { PartnerSelect } from "./partner-select"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

const PER_KM = { classic: 0.86, business: 1.45, firstClass: 2.4 } as const
type Tier = keyof typeof PER_KM
const TIERS: Tier[] = ["classic", "business", "firstClass"]

function euro(n: number) {
  return "€ " + n.toFixed(2).replace(".", ",")
}

type TierData = { name: string; subtitle: string; vehicle: string; features: string[] }

export function HotelsCommission() {
  const t = useTranslations("hotels.commission")
  const [tier, setTier] = useState<Tier>("classic")
  const [distance, setDistance] = useState(45)
  const [commission, setCommission] = useState(13)

  const data = t.raw(`tiers.${tier}`) as TierData
  const base = distance * PER_KM[tier]
  const client = base / (1 - commission / 100)
  const earnings = client - base
  const pct = ((commission - 5) / (20 - 5)) * 100

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] px-4 py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2">
            <span className="h-px w-7 bg-[var(--lm-accent,#C9A96E)]" />
            <span className="text-[11px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={sans}>
              {t("eyebrow")}
            </span>
            <span className="h-px w-7 bg-[var(--lm-accent,#C9A96E)]" />
          </div>
          <h2 className="text-[40px] leading-none text-[var(--lm-text,#f5f5f5)] md:text-[48px]" style={serif}>
            {t("titlePrefix")} <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("titleAccent")}</span>
          </h2>
        </div>

        {/* O cartão é um véu dourado sobre o fundo da secção: castanho quase
            preto no tema escuro, creme quente no claro. */}
        <div className="mx-auto max-w-[640px] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.18)] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.05)] p-6 sm:p-8">
          {/* tabs */}
          <div className="grid grid-cols-3 gap-1 border border-[rgba(var(--lm-text-rgb,255,255,255),0.1)] p-1">
            {TIERS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTier(k)}
                className={`py-2.5 text-[12px] font-semibold uppercase tracking-[0.5px] transition-colors ${
                  tier === k
                    ? "bg-[var(--lm-accent,#C9A96E)] text-[#1a1510]"
                    : "text-[var(--lm-muted,#9a9a9a)] hover:text-[var(--lm-text,#fff)]"
                }`}
                style={sans}
              >
                {t(`tabs.${k}`)}
              </button>
            ))}
          </div>

          <div className="mt-7 text-center">
            <h3 className="text-[30px] leading-none text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={serif}>{data.name}</h3>
            <p className="mt-2 text-[13px] text-[var(--lm-muted,#9a9a9a)]" style={sans}>{data.subtitle}</p>
          </div>

          {/* inputs */}
          <div className="mt-7 grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-[12px] text-[var(--lm-muted,#9a9a9a)]" style={sans}>{t("distanceLabel")}</span>
              <input
                type="number"
                min={1}
                value={distance}
                onChange={(e) => setDistance(Math.max(1, Number(e.target.value) || 0))}
                className="h-11 w-full border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] bg-[rgba(var(--lm-text-rgb,255,255,255),0.03)] px-3 text-[14px] text-[var(--lm-text,#fff)] outline-none transition-colors focus:border-[var(--lm-accent,#C9A96E)]"
                style={sans}
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-[12px] text-[var(--lm-muted,#9a9a9a)]" style={sans}>{t("vehicleLabel")}</span>
              <PartnerSelect
                value={tier}
                onChange={(v) => setTier(v as Tier)}
                ariaLabel={t("vehicleLabel")}
                triggerClassName="h-11 border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] bg-[rgba(var(--lm-text-rgb,255,255,255),0.03)] px-3 text-[14px]"
                options={TIERS.map((k) => ({ value: k, label: (t.raw(`tiers.${k}`) as TierData).vehicle }))}
              />
            </div>
          </div>

          {/* commission slider */}
          <div className="mt-6">
            <span className="text-[12px] text-[var(--lm-muted,#9a9a9a)]" style={sans}>{t("commissionLabel")}</span>
            <div className="mt-5 flex items-center gap-4">
              <div className="relative flex-1">
                <span
                  className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold text-[var(--lm-text,#fff)]"
                  style={{ left: `${pct}%`, ...sans }}
                >
                  {commission}%
                </span>
                <input
                  type="range"
                  min={5}
                  max={20}
                  value={commission}
                  onChange={(e) => setCommission(Number(e.target.value))}
                  className="budget-slider w-full"
                  style={{ background: "linear-gradient(to right, #5bbd6b 0%, #e0c14e 50%, #d9534f 100%)" }}
                />
              </div>
              <span
                className="flex h-10 w-14 shrink-0 items-center justify-center border border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] text-[14px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
                style={sans}
              >
                {commission}%
              </span>
            </div>
          </div>

          {/* prices */}
          <div className="mt-7 flex flex-col gap-3 border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.1)] pt-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[14px] text-[var(--lm-muted,#bdb7ad)]" style={sans}>
                {t("basePrice")} <Info className="h-3.5 w-3.5 text-[var(--lm-muted,#8c8680)]" />
              </span>
              <span className="text-[15px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={sans}>{euro(base)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-[var(--lm-muted,#bdb7ad)]" style={sans}>{t("clientPrice")}</span>
              <span className="text-[15px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={sans}>{euro(client)}</span>
            </div>
          </div>

          {/* earnings */}
          <div
            className="mt-5 flex flex-col items-center gap-1 border border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] py-5 text-center"
            style={{
              background:
                "linear-gradient(180deg, rgba(var(--lm-accent-rgb,201,169,110),0.14) 0%, rgba(var(--lm-accent-rgb,201,169,110),0.06) 100%)",
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={sans}>
              {t("earnings")}
            </span>
            <span className="text-[34px] font-semibold leading-none text-[var(--lm-text,#fff)]" style={serif}>{euro(earnings)}</span>
          </div>

          {/* features */}
          <ul className="mt-6 flex flex-col gap-3 border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.1)] pt-5">
            {data.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-[var(--lm-muted,#bdb7ad)]" style={sans}>
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" strokeWidth={2} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
