"use client"

import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { cdn } from "@/lib/cdn"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

type Metric = { value: string; label: string }

/** `overMedia` marca o bloco que assenta sobre o vídeo da hero: aí o contraste
 *  vem do vídeo, por isso as cores ficam fixas em vez de seguirem o tema. */
function Eyebrow({ label, overMedia = false }: { label: string; overMedia?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={overMedia ? "h-px w-8 bg-[#C9A96E]" : "h-px w-8 bg-[var(--lm-accent,#C9A96E)]"} />
      <span
        className={
          overMedia
            ? "text-[12px] font-semibold uppercase tracking-[2px] text-[#C9A96E]"
            : "text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent,#C9A96E)]"
        }
        style={sans}
      >
        {label}
      </span>
    </div>
  )
}

function MetricsGrid({ metrics, overMedia = false }: { metrics: Metric[]; overMedia?: boolean }) {
  return (
    <div
      /* A moldura e os 2px entre células são a cor do fundo: sobre o vídeo é o
         quase-preto original; fora dele acompanha o tema, senão no claro ficava
         uma grelha cinzenta a atravessar o creme. */
      className={`grid w-full grid-cols-3 gap-[2px] p-px md:w-auto md:inline-grid md:grid-cols-3 ${
        overMedia
          ? "border border-[rgba(28,27,24,0.4)] bg-[rgba(28,27,24,0.4)]"
          : "border border-[rgba(var(--lm-bg-rgb,28,27,24),0.4)] bg-[rgba(var(--lm-bg-rgb,28,27,24),0.4)]"
      }`}
    >
      {metrics.map((m) => (
        <div
          key={m.label}
          className="flex flex-col items-start justify-center gap-2 border border-[rgba(154,117,53,0.22)] bg-[rgba(154,117,53,0.07)] px-4 py-[14px] md:gap-4"
        >
          <p
            className={
              overMedia
                ? "text-[32px] italic leading-[30px] text-[#C9A96E]"
                : "text-[32px] italic leading-[30px] text-[var(--lm-accent,#C9A96E)]"
            }
            style={serif}
          >
            {m.value}
          </p>
          <p
            className={
              overMedia
                ? "text-[12px] font-normal uppercase leading-[1.3] tracking-[2px] text-[#999]"
                : "text-[12px] font-normal uppercase leading-[1.3] tracking-[2px] text-[var(--lm-muted,#999)]"
            }
            style={sans}
          >
            {m.label}
          </p>
        </div>
      ))}
    </div>
  )
}

export function CorporateHero() {
  const t = useTranslations("corporatePage.hero")

  const metrics: Metric[] = [
    { value: t("metrics.reviews.value"), label: t("metrics.reviews.label") },
    { value: t("metrics.events.value"), label: t("metrics.events.label") },
    { value: t("metrics.drivers.value"), label: t("metrics.drivers.label") },
  ]

  return (
    <>
      <section className="relative hidden h-[680px] w-full overflow-hidden md:block">
        {/* Vídeo de fundo, silenciado e em loop. O poster segura o
            enquadramento enquanto o primeiro frame não pinta. */}
        <video
          src={cdn("/video/corporate-hero.mp4")}
          poster={cdn("/video/corporate-hero-poster.webp")}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(44,44,44,0.043) 17.7%, rgba(0,0,0,0.84) 74.8%), linear-gradient(90deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.5) 100%)",
          }}
        />
        {/* Fade em baixo, como nos tours: o vídeo escurece até preto em vez de
            cortar a direito. Aqui a secção seguinte é creme, por isso não
            dissolve para dentro dela — só remata a hero. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#0D0D0D] md:h-44" />

        <div className="relative mx-auto flex h-full max-w-[1440px] flex-col items-start justify-center gap-6 px-[48px] py-[40px]">
          <div className="flex w-[680px] max-w-full flex-col items-start gap-6">
            <Eyebrow label={t("eyebrow")} overMedia />

            <h1 className="text-[0px]" style={serif}>
              <span className="text-[64px] font-normal leading-none text-white">
                {t("headingLine1")}{" "}
              </span>
              <span className="text-[64px] font-normal italic leading-none text-[#C9A96E]">
                {t("headingLine2")}
              </span>
            </h1>

            <p
              className="max-w-[592px] text-[18px] font-light leading-[1.3] text-[#F7F4EF]"
              style={sans}
            >
              {t("subtitle")}
            </p>

            <MetricsGrid metrics={metrics} overMedia />

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="#request-proposal"
                className="inline-flex h-12 items-center bg-[#A08248] px-6 py-[9px] text-white transition-colors hover:bg-[#b89558]"
                style={sans}
              >
                <span className="px-2 text-[14px] font-medium uppercase tracking-[1.1px]">
                  {t("ctaPrimary")}
                </span>
                <ArrowRight className="size-[14px]" strokeWidth={2} />
              </Link>

              <Link
                href="/corporate/experiences"
                className="inline-flex h-12 items-center border border-[#999] px-6 py-[9px] text-[#999] transition-colors hover:border-[#F7F4EF] hover:text-[#F7F4EF]"
                style={sans}
              >
                <span className="px-2 text-[14px] font-medium uppercase tracking-[1.1px]">
                  {t("ctaSecondary")}
                </span>
                <ArrowRight className="size-[14px]" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="flex w-full flex-col items-start gap-6 px-4 md:hidden">
        <div className="relative aspect-[416/344] w-full">
          <Image
            src="/corporate/hero-mobile.webp"
            alt=""
            fill
            priority
            className="object-contain"
          />
        </div>

        <div className="flex w-full flex-col items-start gap-6 pb-2">
          <Eyebrow label={t("eyebrow")} />

          <h1 className="text-[0px]" style={serif}>
            <span className="text-[48px] font-normal leading-none text-[var(--lm-text,#fff)]">
              {t("headingLine1")}{" "}
            </span>
            <span className="text-[48px] font-normal italic leading-none text-[var(--lm-accent,#C9A96E)]">
              {t("headingLine2")}
            </span>
          </h1>

          <p
            className="w-full text-[18px] font-light leading-[1.3] text-[var(--lm-muted,#999)]"
            style={sans}
          >
            {t("subtitle")}
          </p>

          <MetricsGrid metrics={metrics} />
        </div>
      </section>
    </>
  )
}
