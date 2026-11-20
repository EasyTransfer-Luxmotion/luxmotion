"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { useQuery } from "convex/react"
import { api } from "@workspace/convex/api"
import { ShieldCheck, UserCheck, MapPin, ArrowRight, ArrowLeft } from "lucide-react"
import type { LucideIcon } from "lucide-react"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

type Destination = {
  id: string
  image: string
  href: string
  matchKeys: string[]
}

const DESTINATIONS: Destination[] = [
  { id: "lisboa", image: "/tours/regions/regions-lisboa.webp", href: "/tours/lisboa", matchKeys: ["lisboa", "lisbon", "lisbon area"] },
  { id: "porto", image: "/tours/regions/regions-porto.webp", href: "/tours/porto", matchKeys: ["porto", "oporto"] },
  { id: "algarve", image: "/tours/regions/regions-algarve.webp", href: "/tours/algarve", matchKeys: ["algarve"] },
  { id: "alentejo", image: "/tours/regions/regions-alentejo.webp", href: "/tours/alentejo", matchKeys: ["alentejo"] },
  { id: "acores", image: "/tours/regions/regions-acores.webp", href: "/tours/acores", matchKeys: ["acores", "açores", "azores"] },
  { id: "madeira", image: "/tours/regions/regions-madeira.webp", href: "/tours/madeira", matchKeys: ["madeira"] },
]

const FEATURES: { id: string; icon: LucideIcon }[] = [
  { id: "authentic", icon: ShieldCheck },
  { id: "guides", icon: UserCheck },
  { id: "flexibility", icon: MapPin },
]

const PER_PAGE_DESKTOP = 3

function FeaturePill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-[10px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] px-[16.8px] py-[14.8px] flex-1 min-w-0">
      <Icon className="size-[14px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] shrink-0" strokeWidth={2} />
      <span
        className="text-[11px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] whitespace-nowrap overflow-hidden text-ellipsis"
        style={sans}
      >
        {label}
      </span>
    </div>
  )
}

function DestinationCard({ d, name, meta }: { d: Destination; name: string; meta: string }) {
  return (
    <Link
      href={d.href}
      className="relative flex flex-col justify-end overflow-hidden h-[420px] md:h-[486px] group w-full"
    >
      <Image
        src={d.image}
        alt={name}
        fill
        className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        sizes="(max-width: 768px) 100vw, 33vw"
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 41.9%, rgba(0,0,0,1) 82.4%)" }}
      />
      <div className="relative p-4 flex items-end gap-2 w-full">
        <div className="flex flex-1 min-w-0 flex-col gap-2">
          <h3
            className="text-white text-[24px] font-medium leading-none whitespace-nowrap"
            style={serif}
          >
            {name}
          </h3>
          <p
            className="text-[14px] text-[#999] leading-[1.2] tracking-[0.14px] whitespace-nowrap"
            style={sans}
          >
            {meta}
          </p>
        </div>
        {/* Cartão inteiro sobre fotografia + gradiente preto: cores fixas nos dois temas. */}
        <span className="size-8 border border-[rgba(255,255,255,0.3)] flex items-center justify-center shrink-0 transition-colors duration-200 group-hover:border-[#C9A96E] group-hover:bg-[#C9A96E]">
          <ArrowRight className="size-[18px] text-white group-hover:text-[#0D0D0D] transition-colors duration-200" strokeWidth={1.5} />
        </span>
      </div>
    </Link>
  )
}

export function ImmersiveToursSection() {
  const t = useTranslations("blogsPage.immersiveTours")
  const tours = useQuery(api.tours.listPublished)
  const [page, setPage] = useState(0)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    if (!tours) return map
    for (const tour of tours) {
      const dest = (tour.destination ?? "").toLowerCase().trim()
      const match = DESTINATIONS.find((d) => d.matchKeys.includes(dest))
      if (!match) continue
      map.set(match.id, (map.get(match.id) ?? 0) + 1)
    }
    return map
  }, [tours])

  const totalPagesDesktop = Math.max(1, Math.ceil(DESTINATIONS.length / PER_PAGE_DESKTOP))
  const totalPagesMobile = DESTINATIONS.length
  const desktopPage = Math.min(page, totalPagesDesktop - 1)
  const mobilePage = Math.min(page, totalPagesMobile - 1)

  const renderMeta = (id: string) => {
    const count = counts.get(id) ?? 0
    return t("destinations.routes", { count })
  }

  const renderName = (id: string) => t(`destinations.${id}.name`)

  return (
    <section className="bg-[var(--lm-surface,#141414)] border-y-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] px-4 md:px-[80px] py-14 md:py-[72.8px]">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-2 items-start">
          <div className="flex items-center gap-2">
            <div className="h-px w-[82px] min-w-8 bg-[var(--lm-accent,#C9A96E)]" />
            <span
              className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] whitespace-nowrap leading-none"
              style={sans}
            >
              {t("eyebrow")}
            </span>
          </div>
          <h2
            className="text-[var(--lm-text,#fff)] font-normal leading-tight text-[36px] md:text-[48px]"
            style={serif}
          >
            {t("headingLead")}{" "}
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("headingAccent")}</span>
          </h2>
        </div>

        <div className="flex flex-col md:flex-row gap-[2px]">
          {FEATURES.map((f) => (
            <FeaturePill key={f.id} icon={f.icon} label={t(`features.${f.id}`)} />
          ))}
        </div>

        <div className="relative">
          <div className="hidden md:block overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${desktopPage * 100}%)` }}
            >
              {Array.from({ length: totalPagesDesktop }).map((_, p) => {
                const slice = DESTINATIONS.slice(p * PER_PAGE_DESKTOP, (p + 1) * PER_PAGE_DESKTOP)
                return (
                  <div key={p} className="shrink-0 w-full flex gap-[2px]">
                    {slice.map((d) => (
                      <div key={d.id} className="flex-1 min-w-0">
                        <DestinationCard d={d} name={renderName(d.id)} meta={renderMeta(d.id)} />
                      </div>
                    ))}
                    {slice.length < PER_PAGE_DESKTOP &&
                      Array.from({ length: PER_PAGE_DESKTOP - slice.length }).map((_, i) => (
                        <div key={`empty-${i}`} className="flex-1 min-w-0" />
                      ))}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="md:hidden overflow-hidden">
            <div
              className="flex gap-[2px] transition-transform duration-500 ease-out"
              style={{ transform: `translateX(calc(-${mobilePage} * (100% + 2px)))` }}
            >
              {DESTINATIONS.map((d) => (
                <div key={d.id} className="shrink-0 w-full flex">
                  <DestinationCard d={d} name={renderName(d.id)} meta={renderMeta(d.id)} />
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
            aria-label={t("prev")}
            className="hidden md:flex absolute -left-12 top-1/2 -translate-y-1/2 size-9 bg-[var(--lm-bg,#0d0d0d)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:bg-[var(--lm-accent,#C9A96E)] hover:text-[#0D0D0D] hover:border-[var(--lm-accent,#C9A96E)] transition-colors duration-200 disabled:opacity-30"
            disabled={page === 0}
          >
            <ArrowLeft className="size-[14px]" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(p + 1, totalPagesDesktop - 1))}
            aria-label={t("next")}
            className="hidden md:flex absolute -right-12 top-1/2 -translate-y-1/2 size-9 bg-[var(--lm-bg,#0d0d0d)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:bg-[var(--lm-accent,#C9A96E)] hover:text-[#0D0D0D] hover:border-[var(--lm-accent,#C9A96E)] transition-colors duration-200 disabled:opacity-30"
            disabled={page >= totalPagesDesktop - 1}
          >
            <ArrowRight className="size-[14px]" strokeWidth={2} />
          </button>

          {totalPagesDesktop > 1 && (
            <div className="hidden md:flex items-center justify-center gap-2 pt-4">
              {Array.from({ length: totalPagesDesktop }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-label={`${t("goTo")} ${i + 1}`}
                  className={`rounded-full transition-all ${
                    i === page ? "size-[6px] bg-[var(--lm-accent,#C9A96E)]" : "size-[5px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.4)]"
                  }`}
                />
              ))}
            </div>
          )}

          <div className="md:hidden flex items-center justify-center gap-3 pt-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              aria-label={t("prev")}
              disabled={page === 0}
              className="size-9 bg-[var(--lm-bg,#0d0d0d)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] flex items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] disabled:opacity-30"
            >
              <ArrowLeft className="size-[14px]" strokeWidth={2} />
            </button>
            <div className="flex gap-2 items-center">
              {Array.from({ length: totalPagesMobile }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-label={`${t("goTo")} ${i + 1}`}
                  className={`rounded-full transition-all ${
                    i === page ? "size-[6px] bg-[var(--lm-accent,#C9A96E)]" : "size-[5px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.4)]"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, totalPagesMobile - 1))}
              aria-label={t("next")}
              disabled={page >= totalPagesMobile - 1}
              className="size-9 bg-[var(--lm-bg,#0d0d0d)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] flex items-center justify-center text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] disabled:opacity-30"
            >
              <ArrowRight className="size-[14px]" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
