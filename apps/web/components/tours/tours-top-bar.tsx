"use client"

import { useRef } from "react"
import { useTranslations } from "next-intl"
import { useAutoScrollMarquee } from "@/hooks/use-auto-scroll-marquee"

/*
 * A altura da faixa vive só no CSS: a página declara `--tours-bar-h` (30px, 36
 * acima de md) e o header fixo desce exactamente esse valor. Chegou a ser
 * calculada aqui a partir do `window.innerWidth`, o que duplicava o breakpoint
 * em JS e deixava a variável dessincronizada da altura real sempre que o evento
 * de resize se perdia.
 */
const SANS_FONT = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const

type Item = { pre: string; accent?: string; post?: string }

export function ToursTopBar() {
  const t = useTranslations("toursTopBar")
  const marqueeRef = useRef<HTMLDivElement>(null)

  // `activeBelow` alto porque a faixa anda em todos os tamanhos, não só no
  // telemóvel — é o mesmo truque da barra de anúncios.
  useAutoScrollMarquee(marqueeRef, { activeBelow: 99999, speedPxPerSec: 34 })

  const items = t.raw("items") as Item[]

  if (!items?.length) return null

  // Duplicado uma vez para o ciclo fechar sem salto: o hook faz reset a meio da
  // largura total.
  const loop = [...items, ...items]

  return (
    <div
      className="fixed left-0 right-0 z-[44] border-y border-[rgba(var(--lm-accent-rgb,201,169,110),0.22)] bg-[var(--lm-bg,#0D0D0D)] h-[30px] md:h-[36px]"
      style={{ top: "var(--promo-h, 0px)" }}
      role="region"
      aria-label={t("ariaLabel")}
    >
      <div
        ref={marqueeRef}
        className="h-full w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,#000_4%,#000_96%,transparent)]"
      >
        <div className="flex h-full w-max items-center px-5 md:px-6">
          {loop.map((item, i) => (
            <span key={i} className="flex shrink-0 items-center">
              <span
                className="whitespace-nowrap text-[9px] font-medium uppercase tracking-[1.4px] text-[var(--lm-text,#D9D2C7)] md:text-[11px] md:tracking-[2px]"
                style={SANS_FONT}
              >
                {item.pre}
                {item.accent && (
                  <span className="text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{item.accent}</span>
                )}
                {item.post}
              </span>
              <span
                aria-hidden
                className="mx-5 text-[7px] text-[rgba(var(--lm-accent-rgb,201,169,110),0.55)] md:mx-9 md:text-[8px]"
              >
                ◆
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
