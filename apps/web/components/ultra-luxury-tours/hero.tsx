"use client"

import { useTranslations } from "next-intl"
import { cdn } from "@/lib/cdn"

const SERIF_FONT = "var(--font-title), 'Cormorant Garamond', serif"

const METRICS = [
  { value: "+311", labelKey: "metricReviewsLabel" },
  { value: "5.0", labelKey: "metricRatingLabel" },
  { value: "100%", labelKey: "metricTailoredLabel" },
] as const

export function UltraLuxuryToursHero() {
  const t = useTranslations("ultraLuxuryTours.hero")

  return (
    <section className="relative isolate flex flex-col items-center justify-center overflow-hidden bg-[#0D0D0D] px-4 py-6 md:min-h-[600px] md:px-12 md:py-10">
      {/* Mesmo vídeo cinemático da home, silenciado e em loop. */}
      <video
        src={cdn("/video/home-cinematic.mp4")}
        poster={cdn("/video/home-cinematic-poster.webp")}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full object-cover"
      />
      {/* Véu escuro para o texto continuar legível por cima do vídeo. */}
      <div className="absolute inset-0 -z-10 bg-[rgba(13,13,13,0.72)]" />
      {/* Fade em baixo: o vídeo dissolve-se no fundo da página em vez de
          cortar a direito. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-b from-transparent to-[#0D0D0D] md:h-44" />

      <div className="relative flex w-full max-w-[680px] flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <div className="h-px w-8 max-w-[82px] min-w-[32px] bg-[#C9A96E]" />
          <span className="text-[12px] font-semibold uppercase leading-none tracking-[2px] text-[#C9A96E]">
            {t("eyebrow")}
          </span>
          <div className="h-px w-8 max-w-[82px] min-w-[32px] bg-[#C9A96E]" />
        </div>

        <h1
          className="text-center leading-none"
          style={{ fontFamily: SERIF_FONT }}
        >
          <span className="block text-[48px] text-white md:text-[64px]">
            {t("titleLine1")}
          </span>
          <span className="block text-[48px] italic text-[#C9A96E] md:text-[64px]">
            {t("titleLine2")}
          </span>
        </h1>

        <p className="text-center text-[18px] font-light leading-[1.3] text-[#999]">
          {t("subtitle")}
        </p>

        {/* Sem caixa: as métricas assentam direto sobre o vídeo. */}
        <div className="flex h-[104px] w-full items-stretch justify-center gap-[2px] p-px md:h-[84px]">
          {METRICS.map((metric) => (
            <div key={metric.labelKey} className="flex flex-col gap-1 px-4 py-[18px]">
              <span
                className="text-[32px] italic leading-[30px] text-[#C9A96E]"
                style={{ fontFamily: SERIF_FONT }}
              >
                {metric.value}
              </span>
              <span className="text-[12px] uppercase leading-[1.3] tracking-[2px] text-[#999]">
                {t(metric.labelKey)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
