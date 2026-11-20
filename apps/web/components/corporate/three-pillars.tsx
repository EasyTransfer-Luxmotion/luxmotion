"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

/** Cada pilar tem três fotos que se sucedem em fade. */
const PILLARS = [
  {
    id: "standard" as const,
    images: [
      "/corporate/pillars/standard-1.webp",
      "/corporate/pillars/standard-2.webp",
      "/corporate/pillars/standard-3.webp",
    ],
    items: ["incentive", "gala", "conventions", "congresses", "meetings", "cultural"],
  },
  {
    id: "experiences" as const,
    images: [
      "/corporate/pillars/experiences-1.webp",
      "/corporate/pillars/experiences-2.webp",
      "/corporate/pillars/experiences-3.webp",
    ],
    items: ["teambuilding", "activities", "sightseeing", "foodwine", "sport", "entertainment"],
  },
  {
    id: "logistics" as const,
    images: [
      "/corporate/pillars/logistics-1.webp",
      "/corporate/pillars/logistics-2.webp",
      "/corporate/pillars/logistics-3.webp",
    ],
    items: ["airport", "premium", "hotels", "guides"],
  },
]

const SLIDE_MS = 4500

export function ThreePillars() {
  const t = useTranslations("corporatePage.pillars")
  const [active, setActive] = useState(0)
  const [slide, setSlide] = useState(0)
  const pillar = PILLARS[active]!
  const pillarKey = pillar.id

  // As fotos do pilar activo passam sozinhas; trocar de pilar recomeça no 1.
  useEffect(() => {
    setSlide(0)
  }, [active])

  useEffect(() => {
    const id = window.setInterval(
      () => setSlide((s) => (s + 1) % pillar.images.length),
      SLIDE_MS
    )
    return () => window.clearInterval(id)
  }, [pillar.images.length])

  return (
    <section className="flex w-full flex-col items-center justify-center gap-6 bg-[var(--lm-bg,#0D0D0D)] px-4 py-12 md:px-[82px] md:py-[60px]">
      <div className="flex w-full max-w-[1280px] flex-col items-start gap-4">
        <div className="flex items-center gap-2">
          <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
          <span
            className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
            style={sans}
          >
            {t("eyebrow")}
          </span>
        </div>

        <h2 className="text-[28px] leading-tight md:text-[48px] md:leading-none" style={serif}>
          <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("headingItalic")}</span>
          <br />
          <span className="text-[var(--lm-text,#F5F5F5)]">{t("headingRest")}</span>
        </h2>
      </div>

      <div className="flex h-[68px] w-full max-w-[1280px] items-stretch gap-[2px]">
        {PILLARS.map((p, i) => {
          const isActive = active === i
          return (
            <button
              key={p.id}
              onClick={() => setActive(i)}
              className={`relative flex flex-1 flex-col items-center justify-center gap-2 border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] px-3 py-4 transition-colors md:px-6 ${
                isActive
                  ? "bg-[var(--lm-bg,#0D0D0D)]"
                  : "bg-transparent hover:bg-[rgba(var(--lm-text-rgb,255,255,255),0.02)]"
              }`}
              style={sans}
            >
              <div className="flex items-center gap-2">
                <div className="h-px w-6 bg-[var(--lm-accent,#C9A96E)]" />
                <span
                  className="text-[18px] font-semibold uppercase leading-none tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] md:text-[24px]"
                  style={serif}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <p
                className={`text-center text-[10px] font-semibold uppercase leading-tight tracking-[2px] md:text-[12px] ${
                  isActive ? "text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" : "text-[var(--lm-muted,#696969)]"
                }`}
              >
                {t(`tabs.${p.id}`)}
              </p>
              {isActive && (
                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--lm-accent,#C9A96E)]" />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex w-full max-w-[1280px] flex-col items-stretch gap-6 md:flex-row md:gap-12">
        <div className="relative h-[400px] w-full shrink-0 overflow-hidden md:h-[525px] md:w-[425px]">
          {/* As três ficam montadas e alternam em opacidade — assim o fade é
              suave e não há salto enquanto a seguinte carrega. */}
          {pillar.images.map((src, i) => (
            <Image
              key={src}
              src={src}
              alt=""
              fill
              /* A caixa é retrato e as fotos são horizontais: com object-cover
                 corta-se a largura, por isso é preciso pedir muito mais px do
                 que os 425 da caixa — senão vinham imagens baixas e ampliadas. */
              sizes="(max-width: 768px) 160vw, 1000px"
              priority={i === 0}
              className={`object-cover transition-opacity duration-700 ease-out ${
                i === slide ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

          {/* Pontos: mostram em que foto vai e deixam saltar para outra. */}
          <div className="absolute right-4 top-4 flex items-center gap-1.5">
            {pillar.images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setSlide(i)}
                aria-label={`Foto ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === slide ? "w-4 bg-[#C9A96E]" : "w-1.5 bg-white/45 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4">
            <p
              className="text-[12px] font-semibold uppercase tracking-[2px] text-[#C9A96E]"
              style={sans}
            >
              {t("featuredLabel", { number: String(active + 1).padStart(2, "0") })}
            </p>
            <p
              className="text-[24px] font-medium italic leading-snug text-white"
              style={serif}
            >
              {t(`bodies.${pillarKey}.featuredCaption`)}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-6 self-stretch">
          <h3 className="text-[32px] leading-none md:text-[48px]" style={serif}>
            <span className="text-[var(--lm-text,#F5F5F5)]">{t(`bodies.${pillarKey}.titlePart1`)} </span>
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t(`bodies.${pillarKey}.titlePart2`)}</span>
            <span className="text-[var(--lm-text,#F5F5F5)]">.</span>
          </h3>

          <p className="w-full text-[14px] leading-[1.3] text-[var(--lm-muted,#999)]" style={sans}>
            {t(`bodies.${pillarKey}.description`)}
          </p>

          <div className="grid w-full grid-cols-2 gap-px border border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] bg-[rgba(var(--lm-text-rgb,255,255,255),0.08)]">
            {pillar.items.map((key) => (
              <div
                key={key}
                className="flex items-center gap-2 bg-[var(--lm-bg,#0D0D0D)] px-5 py-5 md:px-9 md:py-6"
              >
                <ArrowRight
                  className="size-[18px] shrink-0 text-[var(--lm-accent,#C9A96E)]"
                  strokeWidth={2}
                />
                <p
                  className="text-[14px] font-medium leading-[1.2] text-[var(--lm-text,#fff)]"
                  style={sans}
                >
                  {t(`bodies.${pillarKey}.items.${key}`)}
                </p>
              </div>
            ))}
          </div>

          <Link
            href="/corporate/experiences"
            className="inline-flex h-12 w-full items-center justify-center border border-[var(--lm-accent,#C9A96E)] px-[22px] py-[9px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] md:w-[240px]"
            style={sans}
          >
            <span className="px-2 text-[14px] font-medium uppercase tracking-[1.1px]">
              {t("seeMore")}
            </span>
            <ArrowRight className="size-[14px]" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </section>
  )
}
