"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import { cn } from "@workspace/ui/lib/utils"
import Image from "next/image"
import { Lock, ShieldCheck } from "lucide-react"
import { useTranslations } from "next-intl"

const SERIF_FONT = {
  fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
} as const

const SANS_FONT = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
} as const

/* `mono`: o ficheiro é branco e só se vê sobre fundo escuro. Em tema claro é
   invertido para preto — mesma regra do rodapé. O Mastercard traz as suas
   próprias cores e fica de fora. */
type Logo = { src: string; alt: string; w: number; h: number; mono: boolean }

// Mirrors what Stripe Checkout actually offers: card (Visa/Mastercard), MB WAY
// and Multibanco. PayPal was removed — it isn't a payment method we accept.
const LOGOS: Logo[] = [
  { src: "/shared/payments/visa.svg", alt: "Visa", w: 48, h: 16, mono: true },
  { src: "/shared/payments/mastercard.svg", alt: "Mastercard", w: 40, h: 24, mono: false },
  { src: "/shared/payments/mbway.svg", alt: "MB Way", w: 42, h: 20, mono: true },
  { src: "/shared/payments/multibanco.svg", alt: "Multibanco", w: 57, h: 20, mono: true },
]

function LogoPill({ logo }: { logo: Logo }) {
  return (
    <div className="bg-[rgba(var(--lm-text-rgb,255,255,255),0.03)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] rounded-[3px] h-10 px-[15px] flex items-center justify-center opacity-90">
      <Image
        src={logo.src}
        alt={logo.alt}
        width={logo.w}
        height={logo.h}
        className={cn(
          "object-contain",
          logo.mono && "[.home-theme:not(.dark)_&]:brightness-0",
        )}
        style={{ width: `${logo.w}px`, height: `${logo.h}px` }}
      />
    </div>
  )
}

export function Payment() {
  const { ref, reveal } = useScrollReveal<HTMLDivElement>()

  const t = useTranslations("whitelabel.payment")
  return (
    <section className="bg-[var(--lm-bg,#0d0d0d)] px-4 lg:px-[82px] pt-12 lg:pt-16 pb-12 lg:pb-16">
      <div ref={ref} className={cn("max-w-[1280px] mx-auto flex flex-col lg:flex-row items-center gap-8 lg:gap-12", reveal())}>
        <div className="flex-1 flex flex-col gap-4 items-start w-full">
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-[var(--lm-accent,#c9a96e)]" />
            <span
              className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] leading-none"
              style={SANS_FONT}
            >
              {t("eyebrow")}
            </span>
          </div>
          <h2
            className="text-[36px] lg:text-[48px] font-light leading-[1.05] text-[var(--lm-text,#fff)]"
            style={SERIF_FONT}
          >
            {t("titlePre")}{" "}
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]">{t("titleAccent")}</span>
          </h2>
          <p
            className="text-[16px] lg:text-[18px] leading-[1.3] text-[rgba(var(--lm-text-rgb,255,255,255),0.55)]"
            style={SANS_FONT}
          >
            {t("subtitle")}
          </p>

          <div className="flex flex-wrap gap-[10px] items-center pt-1">
            {LOGOS.map((logo) => (
              <LogoPill key={logo.alt} logo={logo} />
            ))}
          </div>

          <div className="flex flex-wrap gap-4 items-center pt-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-[14px] text-[var(--lm-accent,#c9a96e)]" strokeWidth={1.75} />
              <span
                className="text-[12px] text-[var(--lm-muted,#999)] leading-none"
                style={SANS_FONT}
              >
                {t("secure")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="size-[14px] text-[var(--lm-accent,#c9a96e)]" strokeWidth={1.75} />
              <span
                className="text-[12px] text-[var(--lm-muted,#999)] leading-none"
                style={SANS_FONT}
              >
                {t("ssl")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 relative w-full aspect-[562/432]">
          <Image
            src="/whitelabel/payment-partner.webp"
            alt={t("imageAlt")}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
            priority={false}
          />
        </div>
      </div>
    </section>
  )
}
