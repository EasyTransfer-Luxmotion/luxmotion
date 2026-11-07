"use client"

import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { Facebook, Instagram, Linkedin, Lock } from "lucide-react"
import { useTranslations } from "next-intl"
import { LogoPlaceholder } from "@/components/whitelabel/logo-placeholder"
import { cdn } from "@/lib/cdn"

const BADGES: Array<{ src: string; alt: string; w: number; h: number; mask?: boolean; cover?: boolean }> = [
  // Selo circular: object-contain (sem cover) para não cortar o texto do aro.
  { src: "/footer/badges/clean-safe.webp", alt: "Clean & Safe", w: 44, h: 44 },
  { src: "/footer/badges/scoring-top5.webp", alt: "Scoring Top 5%", w: 44, h: 44 },
  { src: "/footer/badges/pme.png", alt: "PME Líder", w: 38, h: 44 },
  { src: "/footer/badges/tripadvisor-choice.svg", alt: "Tripadvisor Travelers' Choice", w: 43, h: 44, mask: true },
  /* Silhueta, como o Travelers\' Choice aqui em cima: o ficheiro é branco com
     acentos pretos, e por isso não se via inteiro em fundo nenhum — faltava-lhe
     sempre metade, ora o texto ora o desenho. Assim segue a cor do tema. */
  { src: "/footer/badges/tripadvisor-top3.svg", alt: "Tripadvisor Top 3", w: 40, h: 44, mask: true },
  { src: "/footer/badges/turismo-portugal.png", alt: "Turismo de Portugal", w: 84, h: 38, mask: true },
  { src: "/footer/badges/rnvat.svg", alt: "RNVAT 8510", w: 61, h: 38, mask: true },
  { src: "/footer/badges/livro-reclamacoes.png", alt: "Livro de Reclamações", w: 84, h: 39, mask: true },
]

// `mono` marca os logos que contêm branco e desaparecem no tema claro. O
// mastercard é só cor de marca, por isso fica intacto.
const PAYMENTS = [
  { src: "/shared/payments/visa.svg", alt: "Visa", w: 48, h: 16, mono: true },
  { src: "/shared/payments/mastercard.svg", alt: "Mastercard", w: 40, h: 24, mono: false },
  { src: "/shared/payments/mbway.svg", alt: "MB WAY", w: 42, h: 20, mono: true },
  { src: "/shared/payments/multibanco.svg", alt: "Multibanco", w: 57, h: 20, mono: true },
  { src: "/shared/payments/paypal.svg", alt: "PayPal", w: 67, h: 16, mono: true },
]

const SOCIALS = [
  { href: "https://www.facebook.com/luxmotioneasytransferportugal/", icon: Facebook, label: "Facebook" },
  { href: "https://www.instagram.com/luxmotion.tours/", icon: Instagram, label: "Instagram" },
  { href: "https://www.linkedin.com/company/luxmotion-easytransferportugal/", icon: Linkedin, label: "LinkedIn" },
]

export function Footer({
  whitelabel = false,
  logoUrl,
}: { whitelabel?: boolean; logoUrl?: string | null } = {}) {
  const t = useTranslations("footer")
  const r = useTranslations("footer.redesign")

  return (
    <footer className="bg-[var(--lm-bg,#0D0D0D)] pt-8 px-4 md:px-[82px] min-[1440px]:px-[300px] border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.05)]">
      <div className="max-w-[1280px] mx-auto">
        <div className="border-b border-[rgba(var(--lm-text-rgb,255,255,255),0.05)] pb-11 grid grid-cols-1 md:grid-cols-[2.2fr_1fr_1fr_1fr] gap-10 md:gap-[60px]">
          <BrandColumn
            tagline1={r("tagline1")}
            tagline2={r("tagline2")}
            whitelabel={whitelabel}
            logoUrl={logoUrl}
          />

          <NavColumn
            title={t("navigation")}
            links={[
              { href: "/", label: t("home") },
              { href: "/about-us", label: t("aboutUs") },
              { href: "/#services", label: t("services") },
              { href: "/ultra-luxury-tours", label: t("luxuryTours") },
              { href: "/corporate", label: t("corporate") },
              { href: "/fleet", label: t("fleet") },
              { href: "/#companies", label: t("whoTrustsUs") },
            ]}
          />

          <NavColumn
            title={t("usefulLinks")}
            links={[
              // /corporate/contact fora da navegação — chega-se lá pelas experiências.
              { href: "/faqs", label: t("faqs") },
              { href: "/terms-and-conditions", label: t("termsAndConditions") },
              { href: "/refund", label: t("refund") },
              { href: "/privacy-policy", label: t("privacyPolicy") },
              { href: "https://www.centroarbitragemlisboa.pt/", label: t("arbitrationCenter"), external: true },
              { href: "https://commission.europa.eu/live-work-travel-eu/consumer-rights-and-complaints/resolve-your-consumer-complaint/alternative-dispute-resolution-consumers_en", label: t("alternativeDispute"), external: true },
            ]}
          />

          <SupportColumn followLabel={r("follow")} />
        </div>

        <div id="payment-methods" className="scroll-mt-[100px] border-b border-[rgba(var(--lm-text-rgb,255,255,255),0.05)] py-6 flex flex-wrap items-center gap-[10px]">
          <span
            className="text-[12px] tracking-[1.62px] uppercase text-[var(--lm-muted,#999)] font-semibold pr-2"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {r("acceptedPayments")}
          </span>
          <div className="w-px h-[22px] bg-[rgba(var(--lm-text-rgb,255,255,255),0.06)]" />
          {PAYMENTS.map((p) => (
            <div
              key={p.alt}
              className="relative h-[34px] bg-[rgba(var(--lm-text-rgb,255,255,255),0.03)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] rounded-[3px] opacity-55 flex items-center justify-center px-[15px] cursor-default transition-all duration-300 ease-out hover:opacity-100 hover:scale-110 hover:-translate-y-1 hover:z-10 hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] hover:shadow-[0_8px_20px_-6px_rgba(var(--lm-accent-rgb,201,169,110),0.4)]"
            >
              <Image
                src={p.src}
                alt={p.alt}
                width={p.w}
                height={p.h}
                className={`object-contain ${p.mono ? "[.home-theme:not(.dark)_&]:brightness-0" : ""}`}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between pt-5 pb-8 gap-2">
          <div
            /* Lado a lado com o copyright; em ecrãs estreitos passa para baixo
               em vez de espremer as duas linhas. */
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--lm-muted,#999)] tracking-[0.44px]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            <span>{r("copyright")}</span>
            <span aria-hidden="true" className="hidden sm:inline opacity-60">
              ·
            </span>
            {/* Ligação externa: <a> em vez do Link do next-intl, que serve para
                caminhos internos e não deve levar prefixo de idioma. */}
            <span>
              {r("platformBy")}{" "}
              <a
                href="https://impact-origin.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--lm-text,#fff)] underline underline-offset-2 decoration-[rgba(var(--lm-text-rgb,255,255,255),0.3)] transition-colors hover:text-[#C9A96E]"
              >
                Impact
              </a>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="w-[10px] h-[11px] text-[var(--lm-muted,#999)]" />
            <span
              className="text-[10px] text-[var(--lm-muted,#999)] tracking-[0.44px]"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {r("securePayments")}
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

function BrandColumn({
  tagline1,
  tagline2,
  whitelabel = false,
  logoUrl,
}: {
  tagline1: string
  tagline2: string
  whitelabel?: boolean
  logoUrl?: string | null
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-[13px]">
        {whitelabel ? (
          <LogoPlaceholder logoUrl={logoUrl} />
        ) : (
          <div className="flex items-center gap-3">
            <div className="size-[41px] border-[1.7px] border-[var(--lm-accent,#C9A96E)] flex items-center justify-center">
              <Image src="/footer/logo-lm.svg" alt="LM" width={20} height={11} />
            </div>
            <div className="flex flex-col">
              <Image src="/footer/logo-luxmotion.svg" alt="LuxMotion" width={73} height={8} className="[.home-theme:not(.dark)_&]:brightness-0" />
              <span
                className="text-[6.4px] text-[var(--lm-muted,#999)] tracking-[0.9px] mt-1"
                style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              >
                BY EASYTRANSFER
              </span>
            </div>
          </div>
        )}
        {whitelabel ? null : (
          <div className="max-w-[260px]">
            <p
              className="text-[12px] leading-[1.3] text-[var(--lm-muted,#999)]"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {tagline1}
              <br />
              {tagline2}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-3 max-w-[341px]">
        {BADGES.map((badge) => (
          <div
            key={badge.alt}
            className="group bg-[rgba(var(--lm-text-rgb,255,255,255),0.02)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.05)] h-[72px] flex items-center justify-center px-[11px] transition-colors duration-300 hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.04)]"
          >
            {badge.mask ? (
              <span
                role="img"
                aria-label={badge.alt}
                className="block bg-[var(--lm-text,#fff)] transition-transform duration-300 ease-out group-hover:scale-[1.15] group-hover:drop-shadow-[0_0_12px_rgba(var(--lm-accent-rgb,201,169,110),0.35)]"
                style={{
                  width: `${badge.w}px`,
                  height: `${badge.h}px`,
                  WebkitMaskImage: `url(${cdn(badge.src)})`,
                  maskImage: `url(${cdn(badge.src)})`,
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskPosition: "center",
                  WebkitMaskSize: "contain",
                  maskSize: "contain",
                }}
              />
            ) : (
              <Image
                src={cdn(badge.src)}
                alt={badge.alt}
                width={badge.w}
                height={badge.h}
                className={`${badge.cover ? "object-cover" : "object-contain"} transition-transform duration-300 ease-out group-hover:scale-[1.15] group-hover:drop-shadow-[0_0_12px_rgba(var(--lm-accent-rgb,201,169,110),0.35)]`}
                style={{ width: `${badge.w}px`, height: `${badge.h}px` }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function NavColumn({
  title,
  links,
}: {
  title: string
  links: Array<{ href: string; label: string; external?: boolean }>
}) {
  return (
    <div className="flex flex-col gap-4">
      <span
        className="text-[12px] tracking-[1.8px] uppercase text-[var(--lm-accent,#C9A96E)] font-semibold"
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        {title}
      </span>
      <nav className="flex flex-col gap-[10px]">
        {links.map((link) =>
          link.external || link.href.startsWith("#") ? (
            <a
              key={link.href}
              href={link.href}
              {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="text-[12px] text-[var(--lm-muted,#999)] hover:text-[var(--lm-text,#fff)] transition-colors leading-[1.3]"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {link.label}
            </a>
          ) : (
            <Link
              key={link.href}
              href={link.href}
              className="text-[12px] text-[var(--lm-muted,#999)] hover:text-[var(--lm-text,#fff)] transition-colors"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {link.label}
            </Link>
          )
        )}
      </nav>
    </div>
  )
}

function SupportColumn({ followLabel }: { followLabel: string }) {
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-4">
        <span
          className="text-[12px] tracking-[1.8px] uppercase text-[var(--lm-accent,#C9A96E)] font-semibold"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          Support
        </span>
        <div
          className="flex flex-col gap-2"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          <a href="tel:+351963650278" className="text-[12px] text-[var(--lm-muted,#999)] hover:text-[var(--lm-text,#fff)] transition-colors">
            +351 963 650 278
          </a>
          <a href="mailto:geral@easytransferportugal.com" className="text-[11px] text-[var(--lm-muted,#999)] hover:text-[var(--lm-text,#fff)] transition-colors">
            geral@easytransferportugal.com
          </a>
          <a
            href="https://maps.google.com/?q=Rua+Prud%C3%AAncio+Franco+da+Trindade+4,+2655-344+Ericeira,+Portugal"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-[var(--lm-muted,#999)] hover:text-[var(--lm-text,#fff)] transition-colors leading-[1.4]"
          >
            Ericeira Business Factory<br />
            Rua Prudêncio Franco da Trindade 4<br />
            2655-344 Ericeira, Portugal
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-[10px]">
        <span
          className="text-[12px] tracking-[1.8px] uppercase text-[var(--lm-accent,#C9A96E)] font-semibold"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {followLabel}
        </span>
        <div className="flex items-center gap-4">
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--lm-muted,#999)] hover:text-[var(--lm-accent,#C9A96E)] transition-colors"
              aria-label={s.label}
            >
              <s.icon className="w-7 h-7" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
