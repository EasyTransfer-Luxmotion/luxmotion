"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { User, ArrowLeft, ArrowRight } from "lucide-react"
import { Reveal } from "@/components/common/reveal"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

type Badge = "premium" | "eco" | "electric"
type Veh = { name: string; image: string; paxMin: number; paxMax: number; badges: Badge[] }

/* Assentam sempre sobre o palco escuro da fotografia do veículo (ver abaixo),
   por isso mantêm as cores fixas — o verde/azul também são semânticos. */
const BADGE_STYLES: Record<Badge, string> = {
  premium: "bg-[rgba(201,169,110,0.15)] border-[rgba(201,169,110,0.45)] text-[#C9A96E]",
  eco: "bg-[rgba(76,175,80,0.2)] border-[rgba(76,175,80,0.35)] text-[#81c784]",
  electric: "bg-[rgba(33,150,243,0.15)] border-[rgba(33,150,243,0.35)] text-[#64b5f6]",
}

const EXECUTIVE: Veh[] = [
  { name: "Mercedes S400", image: "/fleet/vehicles/mercedes-s400.png", paxMin: 1, paxMax: 3, badges: [] },
  { name: "Porsche Panamera", image: "/fleet/vehicles/porsche-panamera.png", paxMin: 1, paxMax: 4, badges: [] },
  { name: "Mercedes Sprinter", image: "/fleet/vehicles/mercedes-sprinter.webp", paxMin: 1, paxMax: 16, badges: ["premium"] },
  { name: "Mercedes EQV", image: "/fleet/executive/van-executiva.webp", paxMin: 1, paxMax: 8, badges: ["premium", "eco", "electric"] },
  { name: "Bus Executive", image: "/fleet/vehicles/executive-coach.png", paxMin: 1, paxMax: 3, badges: [] },
]

const STANDARD: Veh[] = [
  { name: "Dacia S. ECO-G 100", image: "/fleet/vehicles/dacia-sandero.webp", paxMin: 1, paxMax: 3, badges: [] },
  { name: "Peugeot e-208", image: "/fleet/vehicles/peugeot-e208.png", paxMin: 1, paxMax: 4, badges: [] },
  { name: "Renault Clio", image: "/fleet/vehicles/renault-clio.webp", paxMin: 1, paxMax: 4, badges: [] },
  { name: "Dacia Jogger", image: "/fleet/vehicles/dacia-jogger.webp", paxMin: 1, paxMax: 5, badges: ["premium"] },
  { name: "Tesla Model Y", image: "/fleet/vehicles/tesla-model-y.png", paxMin: 1, paxMax: 4, badges: ["premium", "eco", "electric"] },
]

const GALLERY = [
  { src: "/planners/fleet/mercedes-s-class.webp", name: "Mercedes S-Class" },
  { src: "/planners/fleet/rolls-royce-phantom.webp", name: "Rolls-Royce Phantom" },
  { src: "/planners/fleet/mercedes-v-class.webp", name: "Mercedes V-Class" },
  { src: "/planners/fleet/mercedes-sprinter.webp", name: "Mercedes Sprinter" },
  { src: "/planners/fleet/man-coach.webp", name: "MAN Coach" },
  { src: "/planners/fleet/mini-classico.webp", name: "Mini Clássico" },
]

/**
 * Galeria da frota em carrossel, um cartão de cada vez.
 *
 * Era uma grelha de seis com cinco estrelas por baixo de cada foto. As
 * estrelas não diziam nada (eram sempre cinco) e a grelha empurrava o resto da
 * página para baixo. O carrossel é o mesmo padrão já usado na página do wedding
 * planner.
 */
function FleetGallerySlider() {
  const trackRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const sync = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setAtStart(el.scrollLeft <= 8)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8)
  }, [])

  useEffect(() => {
    sync()
    const el = trackRef.current
    if (!el) return
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [sync])

  // Anda um cartão de cada vez, seja qual for a largura do ecrã.
  const scrollByCard = (dir: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>("[data-card]")
    const step = card ? card.offsetWidth + 8 : el.clientWidth * 0.8
    el.scrollBy({ left: dir * step, behavior: "smooth" })
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        ref={trackRef}
        onScroll={sync}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {GALLERY.map((g) => (
          <div
            key={g.src}
            data-card
            className="group w-[calc(100%-8px)] shrink-0 snap-start sm:w-[calc(50%-8px)] lg:w-[calc(33.333%-8px)]"
          >
            <div className="relative aspect-[324/323] w-full overflow-hidden">
              <Image
                src={g.src}
                alt={g.name}
                fill
                sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{ background: "linear-gradient(to top, rgba(var(--lm-accent-rgb,201,169,110),0.18), transparent 55%)" }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3">
        {([-1, 1] as const).map((dir) => {
          const Icon = dir === -1 ? ArrowLeft : ArrowRight
          return (
            <button
              key={dir}
              type="button"
              onClick={() => scrollByCard(dir)}
              disabled={dir === -1 ? atStart : atEnd}
              aria-label={dir === -1 ? "Anterior" : "Seguinte"}
              className="flex size-11 shrink-0 items-center justify-center border border-[rgba(var(--lm-accent-rgb,201,169,110),0.35)] text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] transition-colors hover:border-[var(--lm-accent,#c9a96e)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Icon className="size-[18px]" strokeWidth={1.5} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function VehicleCard({ v }: { v: Veh }) {
  const t = useTranslations("hotels.fleet")
  return (
    <div className="group relative flex flex-col overflow-clip bg-[var(--lm-surface,#1a1a1a)] transition-colors duration-500 ease-out hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)]">
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 z-[4] h-[1.5px] w-full -translate-x-1/2 origin-center scale-x-0 transition-transform duration-700 ease-out group-hover:scale-x-100"
        style={{ background: "linear-gradient(to right, transparent 0%, rgba(var(--lm-accent-rgb,201,169,110),0) 8%, var(--lm-accent,#C9A96E) 50%, rgba(var(--lm-accent-rgb,201,169,110),0) 92%, transparent 100%)" }}
      />
      {v.badges.length > 0 && (
        <div className="absolute left-2.5 top-2.5 z-[3] flex flex-wrap gap-[3px]">
          {v.badges.map((b) => (
            <span
              key={b}
              className={`inline-flex items-center border px-[7px] py-[3px] text-[8px] font-semibold uppercase tracking-[0.8px] ${BADGE_STYLES[b]}`}
              style={sans}
            >
              {t(`badges.${b}`)}
            </span>
          ))}
        </div>
      )}
      {/* Palco escuro fixo: os recortes dos veículos e os badges por cima foram
          desenhados para fundo preto — mantém-se igual nos dois temas. */}
      <div className="relative h-[160px] w-full bg-[#0d0d0d]">
        <Image
          src={v.image}
          alt={v.name}
          fill
          sizes="(min-width:1024px) 20vw, 50vw"
          className="object-contain transition-transform duration-500 group-hover:scale-[1.015]"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.1) 33%, rgba(201,169,110,0.1) 100%)" }}
        />
      </div>
      <div className="flex flex-col gap-2.5 px-5 pb-6 pt-4">
        <h3 className="text-[20px] leading-tight text-[var(--lm-text,#fff)] transition-colors duration-500 group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] md:text-[22px]" style={serif}>
          {v.name}
        </h3>
        <div className="flex items-center gap-[7px] text-[13px] text-[var(--lm-muted,#9a9a9a)]" style={sans}>
          <User className="size-[15px]" strokeWidth={1.5} />
          <span>{v.paxMin}–{v.paxMax} {t("pax")}</span>
        </div>
      </div>
    </div>
  )
}

function TierRow({ label, vehicles }: { label: string; vehicles: Veh[] }) {
  return (
    <div className="flex flex-col gap-7">
      <div className="relative flex justify-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(var(--lm-accent-rgb,201,169,110),0.05) 24%, rgba(var(--lm-accent-rgb,201,169,110),0.85) 50%, rgba(var(--lm-accent-rgb,201,169,110),0.05) 76%, transparent 100%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 h-[88px] w-[500px] -translate-x-1/2"
          style={{ background: "radial-gradient(50% 72% at 50% 100%, rgba(var(--lm-accent-rgb,201,169,110),0.13), transparent 72%)" }}
        />
        <span className="relative z-[1] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.45)] bg-[var(--lm-bg,#0D0D0D)] px-7 py-2.5 text-[11px] font-semibold uppercase tracking-[2.5px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={sans}>
          {label}
        </span>
      </div>
      <div className="w-full border border-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]">
        <div className="grid grid-cols-2 gap-px bg-[rgba(var(--lm-text-rgb,255,255,255),0.08)] sm:grid-cols-3 lg:grid-cols-5">
          {vehicles.map((v) => (
            <VehicleCard key={v.name} v={v} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function HotelsFleet() {
  const t = useTranslations("hotels.fleet")
  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] px-4 py-16 lg:px-12 lg:py-24">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
            <span className="font-sans text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("eyebrow")}</span>
            <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
          </div>
          <h2 className="text-[40px] leading-none text-[var(--lm-text,#f5f5f5)] md:text-[52px]" style={serif}>
            {t("titlePrefix")} <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("titleAccent")}</span> {t("titleSuffix")}
          </h2>
        </div>

        <TierRow label={t("tierExecutive")} vehicles={EXECUTIVE} />
        <TierRow label={t("tierStandard")} vehicles={STANDARD} />

        <FleetGallerySlider />

        <div className="flex justify-center">
          <Link
            href="/fleet"
            className="group inline-flex h-[52px] items-center gap-2 border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] px-7 text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
            style={sans}
          >
            <span className="text-[13px] font-semibold uppercase tracking-[1.5px]">{t("cta")}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  )
}
