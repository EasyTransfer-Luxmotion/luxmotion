"use client"

import * as React from "react"
import { Plane, Phone, ShieldCheck, BadgeCheck } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import { BookingWidget } from "./booking-widget"
import { useEnterAnimation } from "@/hooks/use-enter-animation"
import {
  GOOGLE_REVIEWS_URL,
  TRUSTPILOT_REVIEWS_URL,
  REVIEW_LINK_PROPS,
} from "@/lib/review-links"
import { cdn } from "@/lib/cdn"

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="relative flex-1 flex items-center gap-4 px-12 py-6 lg:p-6 lg:justify-center group cursor-default overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100" />
      <div className="absolute top-0 left-0 h-[2px] w-0 bg-gradient-to-r from-[var(--lm-accent,#C9A96E)] to-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] transition-all duration-300 ease-out group-hover:w-full" />
      <div className="relative shrink-0 flex items-center justify-center p-4 rounded-full bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border-2 border-[rgba(var(--lm-accent-rgb,201,169,110),0.25)] transition-all duration-300 group-hover:border-[var(--lm-accent,#C9A96E)] group-hover:shadow-[0_0_16px_rgba(var(--lm-accent-rgb,201,169,110),0.2)] group-hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.12)]">
        {icon}
      </div>
      <p className="relative text-[16px] leading-[1.3] text-[var(--lm-muted,#999)] transition-colors duration-300 group-hover:text-[var(--lm-text,#fff)]">
        {title}
        <br />
        {description}
      </p>
    </div>
  )
}

// Total real da ficha Google (confirmado na API: 324, média 4.9).
const REVIEW_COUNT = 324

// Retratos genéricos (os do desenho). Não usar as fotos dos clientes reais das
// reviews aqui — e as /reviews/review-*.webp são fotos de local, que dentro de
// um círculo mostravam céu e pedra em vez de caras.
const SOCIAL_AVATARS = ["/shared/avatars/reviewer-1.png", "/shared/avatars/reviewer-2.png", "/shared/avatars/reviewer-3.png"]

/**
 * Barra de prova social, partilhada pela página principal e pela dos hotéis —
 * é o único sítio onde este desenho existe, e é aqui que se mexe nele.
 *
 * `escala` multiplica as medidas da versão de ecrã largo. 0,8 é a versão
 * comprimida, que é a que se usa; passa-se 1 para o tamanho original.
 */
export function SocialProofBar({ escala = 0.8 }: { escala?: number }) {
  const t = useTranslations("hero")

  // Fundo dourado da marca (#9A7535) a 7%, cantos vivos.
  const shell =
    "border border-[rgba(var(--lm-text-rgb,26,22,18),0.14)] bg-[rgba(154,117,53,0.07)]"
  const vDivider = (
    <div className="w-px self-stretch shrink-0 bg-[rgba(var(--lm-text-rgb,26,22,18),0.14)]" />
  )

  /* Célula 1 — 4.9 grande em serif, estrelas e EXCELLENT RATING, alinhados à
     esquerda. */
  const rating = (s: number) => (
    <div className="flex flex-1 flex-col items-start justify-center min-w-0">
      <span
        className="font-normal leading-[0.85] text-[var(--lm-text,#1a1612)]"
        style={{
          fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
          fontSize: `${45 * s}px`,
        }}
      >
        4.9
      </span>
      <span
        className="leading-none text-[var(--lm-accent,#a08248)]"
        style={{ fontSize: `${18 * s}px`, letterSpacing: `${2.5 * s}px`, marginTop: `${8 * s}px` }}
      >
        ★★★★★
      </span>
      <span
        className="font-semibold uppercase leading-none text-[var(--lm-accent,#a08248)]"
        style={{ fontSize: `${12 * s}px`, letterSpacing: `${2.4 * s}px`, marginTop: `${9 * s}px` }}
      >
        {t("excellentRating")}
      </span>
    </div>
  )

  /* Célula 2 — avatares POR CIMA, depois "From N Reviews" e "Verified guests",
     tudo centrado. */
  const reviews = (s: number) => {
    const av = 34 * s
    const step = 23 * s
    return (
      <div className="flex flex-1 flex-col items-center justify-center min-w-0">
        <div
          className="relative shrink-0"
          style={{ height: `${av}px`, width: `${(SOCIAL_AVATARS.length - 1) * step + av}px` }}
        >
          {SOCIAL_AVATARS.map((src, i) => (
            <div
              key={src}
              className="absolute top-0 overflow-hidden rounded-full bg-white"
              style={{
                left: `${i * step}px`,
                zIndex: i,
                width: `${av}px`,
                height: `${av}px`,
                boxShadow: `0 0 0 ${2.5 * s}px #fff`,
              }}
            >
              <Image src={src} alt="" fill className="object-cover" sizes="48px" />
            </div>
          ))}
        </div>
        <span
          className={`font-semibold leading-tight text-center text-[var(--lm-text,#1a1612)] ${s === 1 ? "whitespace-nowrap" : ""}`}
          style={{ fontSize: `${14 * s}px`, marginTop: `${9 * s}px` }}
        >
          {t("fromReviews", { count: REVIEW_COUNT })}
        </span>
        <span
          className="flex items-center leading-none text-[var(--lm-muted,#6b6259)] whitespace-nowrap"
          style={{ fontSize: `${15 * s}px`, gap: `${6 * s}px`, marginTop: `${8 * s}px` }}
        >
          <BadgeCheck
            className="shrink-0 fill-[#22A45D] text-[var(--lm-bg,#efe8dc)]"
            style={{ width: `${18 * s}px`, height: `${18 * s}px` }}
            strokeWidth={2}
          />
          {t("verifiedGuests")}
        </span>
      </div>
    )
  }

  /* Célula 3 — Trustpilot e Google EMPILHADOS, sem divisor entre eles.
     As marcas usam Montserrat (a fonte dos próprios logótipos). */
  const MONTSERRAT = "var(--font-montserrat), Montserrat, var(--font-sans), sans-serif"
  /* nameNudge: acerto óptico só no nome da marca (px, negativo = para a
     esquerda). A estrela do Trustpilot é um glifo com folga lateral, por isso
     a palavra parecia mais afastada do que "Google" do seu ícone. */
  const verified = (
    mark: React.ReactNode,
    name: string,
    s: number,
    href: string,
    nameNudge = 0,
  ) => (
    <a
      href={href}
      {...REVIEW_LINK_PROPS}
      aria-label={`${name} — ${name === "Google" ? "Google" : "Trustpilot"}`}
      className="flex items-center shrink-0 transition-opacity hover:opacity-70"
      style={{ gap: `${10 * s}px` }}
    >
      {mark}
      <div className="flex flex-col" style={{ gap: `${6 * s}px` }}>
        <span
          className="font-medium uppercase leading-none text-[var(--lm-muted,#8a8178)] whitespace-nowrap"
          style={{ fontSize: `${10 * s}px`, letterSpacing: `${2.6 * s}px`, fontFamily: MONTSERRAT }}
        >
          {t("verifiedBy")}
        </span>
        <span
          className="font-semibold leading-none text-[var(--lm-text,#1a1612)] whitespace-nowrap"
          style={{
            fontSize: `${15 * s}px`,
            fontFamily: MONTSERRAT,
            marginLeft: nameNudge ? `${nameNudge * s}px` : undefined,
          }}
        >
          {name}
        </span>
      </div>
    </a>
  )

  const trustpilotMark = (s: number) => (
    <span
      className="leading-none text-[#00B67A] shrink-0"
      style={{ fontSize: `${26 * s}px` }}
      aria-hidden="true"
    >
      ★
    </span>
  )
  const googleMark = (s: number) => (
    <Image
      src="/shared/icons/google-icon.svg"
      alt=""
      width={26}
      height={26}
      className="shrink-0"
      style={{ width: `${23 * s}px`, height: `${23 * s}px` }}
    />
  )

  /* Célula 3 ocupa o seu terço, com o conteúdo encostado à esquerda logo a
     seguir ao divisor (como no desenho). No mobile o avanço é menor — a essa
     escala 34px comeria a largura de que a coluna precisa. */
  const verifiedStack = (s: number, leftPad: number) => (
    <div
      className="flex flex-1 flex-col justify-center min-w-0"
      style={{ gap: `${12 * s}px`, paddingLeft: `${leftPad * s}px` }}
    >
      {verified(trustpilotMark(s), "Trustpilot", s, TRUSTPILOT_REVIEWS_URL, -4)}
      {verified(googleMark(s), "Google", s, GOOGLE_REVIEWS_URL)}
    </div>
  )

  /* Três colunas iguais separadas por divisores, a ocupar a largura toda — é
     assim que o desenho está construído (divisores a ~1/3 e ~2/3). */
  const bar = (s: number, className: string, leftPad: number) => (
    <div
      className={`items-stretch rounded-none w-full ${shell} ${className}`}
      style={{ gap: `${20 * s}px`, padding: `${10 * s}px ${20 * s}px` }}
    >
      {rating(s)}
      {vDivider}
      {reviews(s)}
      {vDivider}
      {verifiedStack(s, leftPad)}
    </div>
  )

  /* Mesma estrutura nas duas larguras — o mobile é só a mesma barra à escala.
     A `escala` toca só na de ecrã largo: a do telemóvel já corre a 62%, medida
     para o espaço que lá há, e multiplicá-la outra vez punha-a a 50% do
     original, com o "4.9" a 22px. */
  return (
    <>
      {bar(1 * escala, "hidden lg:flex", 34 * escala)}
      {bar(0.62, "flex lg:hidden", 6)}
    </>
  )
}

// Ordem definida pelo prefixo numérico dos ficheiros originais:
// geral → corporate → wedding → tour → school (as verticais do negócio).
const HERO_SLIDES = [
  "/hero/1-luxmotion.webp",
  "/hero/2-corporate.webp",
  "/hero/3-wedding.webp",
  "/hero/4-tour.webp",
  "/hero/5-school.webp",
] as const

const SLIDE_INTERVAL_MS = 5500

/**
 * Avança sozinho, mas com timeout em vez de interval: como o efeito depende do
 * índice, clicar num ponto reinicia a contagem em vez de saltar logo a seguir.
 */
function useHeroSlideshow(enabled: boolean) {
  const [index, setIndex] = React.useState(0)

  React.useEffect(() => {
    if (!enabled) return
    // Quem pediu menos animação ao sistema fica com a primeira imagem fixa.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const id = window.setTimeout(
      () => setIndex((i) => (i + 1) % HERO_SLIDES.length),
      SLIDE_INTERVAL_MS,
    )
    return () => window.clearTimeout(id)
  }, [enabled, index])

  return [index, setIndex] as const
}

function HeroSlides({
  activeIndex,
  positionClass,
  sizes,
}: {
  activeIndex: number
  positionClass: string
  sizes: string
}) {
  return (
    <>
      {HERO_SLIDES.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          sizes={sizes}
          // Só a primeira conta para o LCP; as outras entram depois.
          priority={i === 0}
          className={cn(
            "object-cover transition-opacity duration-[1200ms] ease-in-out",
            positionClass,
            i === activeIndex ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
    </>
  )
}

const WHITELABEL_BG = "linear-gradient(180deg, rgba(var(--lm-bg-rgb,13,13,13),0.20) 0%, rgba(var(--lm-bg-rgb,13,13,13),0.55) 50%, rgba(var(--lm-bg-rgb,13,13,13),0.96) 82%, var(--lm-bg,#0D0D0D) 100%)"

export function Hero({
  whitelabel = false,
  heroImageUrl,
  partnerName,
  checkoutBasePath = "",
}: {
  whitelabel?: boolean
  heroImageUrl?: string | null
  /** Nome do parceiro, para a frase de boas-vindas da landing dele. */
  partnerName?: string
  checkoutBasePath?: string
} = {}) {
  const t = useTranslations("hero")
  const { enter } = useEnterAnimation()
  // As parcerias fixam a sua própria imagem; só o hero principal roda.
  const slideshow = !heroImageUrl
  const [activeSlide] = useHeroSlideshow(slideshow)

  return (
    <section
      className="relative bg-[var(--lm-bg,#0D0D0D)] overflow-hidden"
      style={whitelabel ? { background: WHITELABEL_BG } : undefined}
    >
      <div className="absolute top-0 right-0 w-[46%] xl:w-[48%] 2xl:w-[50%] max-w-[850px] h-[540px] hidden lg:block">
        {slideshow ? (
          <HeroSlides
            activeIndex={activeSlide}
            positionClass="object-[20%_center]"
            sizes="(min-width: 1024px) 50vw, 100vw"
          />
        ) : (
          <Image
            src={cdn(heroImageUrl)}
            alt=""
            fill
            className="object-cover object-[20%_center]"
            priority
            unoptimized
          />
        )}
      </div>

      <div className="relative lg:hidden overflow-hidden h-[320px]">
        {slideshow ? (
          <HeroSlides
            activeIndex={activeSlide}
            positionClass="object-[center_30%]"
            sizes="100vw"
          />
        ) : (
          <Image
            src={cdn(heroImageUrl)}
            alt=""
            fill
            className="object-cover object-[center_30%]"
            priority
            unoptimized
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(transparent 20%, rgba(var(--lm-bg-rgb,13,13,13),0.6) 65%, var(--lm-bg,#0D0D0D) 100%)",
          }}
        />
      </div>

      <div className="relative z-10 max-w-[1440px] mx-auto px-4 lg:px-12 lg:pt-[136px] lg:pb-[96px] -mt-10 lg:mt-0 flex flex-col gap-6 lg:gap-12">
        <div className="max-w-[680px] flex flex-col gap-6 lg:gap-9">
          <div className={cn("flex items-center gap-2", enter("delay-0"))}>
            <div className="h-px bg-[var(--lm-accent,#C9A96E)] w-[32px] lg:w-[40px]" />
            <span className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent,#C9A96E)] whitespace-nowrap">
              {t("label")}
            </span>
          </div>

          <h1 className={enter("delay-100")}>
            <span
              className="text-[var(--lm-text,#fff)] text-[48px] lg:text-[96px] min-[1440px]:text-[82px] min-[1920px]:text-[96px] leading-[1.2] lg:leading-none block"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              Portugal,
            </span>
            <span
              className="italic text-[var(--lm-accent,#C9A96E)] text-[48px] lg:text-[96px] min-[1440px]:text-[82px] min-[1920px]:text-[96px] leading-[1.2] lg:leading-none block"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {t("titleHighlight")}
            </span>
          </h1>

          <p className={cn("text-[18px] font-light leading-[1.3] text-[var(--lm-muted,#999)] max-w-[591px]", enter("delay-200"))}>
            {/* A frase de boas-vindas do parceiro vive nas traduções: a landing
                serve seis idiomas e esta linha estava fixa em português.

                O nome entra sem artigo à frente de propósito — "O {nome}" só
                funciona para nomes masculinos, e daria "O Quinta da Pacheca". */}
            {whitelabel
              ? partnerName?.trim()
                ? t("whitelabelDescription", { partner: partnerName.trim() })
                : t("whitelabelDescriptionGeneric")
              : t("description")}
          </p>

          {!whitelabel && (
            <div className={enter("delay-300")}>
              <SocialProofBar />
            </div>
          )}
        </div>

        <div id="booking" className={cn("w-full scroll-mt-24", enter("delay-[400ms]"))}>
          <BookingWidget checkoutBasePath={checkoutBasePath} />
        </div>

        <div className={cn("flex flex-col lg:flex-row border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] divide-y lg:divide-y-0 lg:divide-x divide-[rgba(var(--lm-text-rgb,255,255,255),0.12)]", enter("delay-[500ms]"))}>
          <FeatureCard
            icon={<Plane className="size-6 text-[var(--lm-accent,#C9A96E)]" />}
            title={t("flightMonitoring")}
            description={t("flightMonitoringDesc")}
          />
          <FeatureCard
            icon={<Phone className="size-6 text-[var(--lm-accent,#C9A96E)]" />}
            title={t("conciergeSupport")}
            description={t("conciergeSupportDesc")}
          />
          <FeatureCard
            icon={<ShieldCheck className="size-6 text-[var(--lm-accent,#C9A96E)]" />}
            title={t("privateTransfers")}
            description={t("privateTransfersDesc")}
          />
        </div>
      </div>
    </section>
  )
}
