"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const

const TABS = [
  { id: "servicos", key: "services" },
  { id: "vantagens", key: "advantages" },
  { id: "sobre-nos", key: "about" },
  { id: "como-funciona", key: "how" },
  { id: "comissoes", key: "commissions" },
  { id: "planos", key: "plans" },
  { id: "frota", key: "fleet" },
  { id: "casos", key: "cases" },
] as const

export function HotelsSectionNav() {
  const t = useTranslations("hotels.nav")
  const [active, setActive] = useState<string>(TABS[0].id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id)
        })
      },
      { rootMargin: "-20% 0px -75% 0px", threshold: 0 },
    )
    TABS.forEach((tab) => {
      const el = document.getElementById(tab.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <nav className="sticky top-[60px] z-30 border-b border-[rgba(var(--lm-accent-rgb,201,169,110),0.12)] bg-[rgba(var(--lm-bg-rgb,13,13,13),0.95)] backdrop-blur lg:top-[72px]">
      <div className="mx-auto flex max-w-[1280px] items-stretch justify-start overflow-x-auto px-2 lg:justify-center [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const on = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => go(tab.id)}
              className={`relative shrink-0 whitespace-nowrap px-4 py-4 text-[11.5px] font-semibold uppercase tracking-[1.4px] transition-colors lg:px-5 ${
                on
                  ? "text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
                  : "text-[var(--lm-muted,#8c8680)] hover:text-[var(--lm-text,#fff)]"
              }`}
              style={sans}
            >
              {t(tab.key)}
              {on && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[2px] bg-[var(--lm-accent,#C9A96E)]" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
