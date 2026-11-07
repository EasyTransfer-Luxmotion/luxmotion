"use client"

import Image from "next/image"
import { useTranslations } from "next-intl"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import { cn } from "@workspace/ui/lib/utils"
import { cdn } from "@/lib/cdn"

const SERIF_FONT = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

// Medidas exactas do viewBox de cada SVG, como no /schools. O Visa vinha a
// 30x14 (2.14:1) contra um viewBox de 3.09:1 — com object-contain encaixava
// pela largura e ficava com 9.7px de altura, ao lado de um Mastercard de 24.
const METHODS = [
  { src: "/wedding/pay-visa.svg", alt: "Visa", w: 36.727, h: 11.875 },
  { src: "/wedding/pay-mastercard.svg", alt: "Mastercard", w: 40, h: 24 },
  { src: "/wedding/pay-mbway.svg", alt: "MB Way", w: 41.956, h: 20.383 },
  { src: "/wedding/pay-multibanco.svg", alt: "Multibanco", w: 56.789, h: 20.408 },
  { src: "/wedding/pay-paypal.svg", alt: "PayPal", w: 67.492, h: 16.351 },
] as const

function PaymentPill({
  src,
  alt,
  w,
  h,
}: {
  src: string
  alt: string
  w: number
  h: number
}) {
  return (
    <div className="bg-white border border-[rgba(193,166,114,0.21)] shadow-[0_2px_4px_rgba(0,0,0,0.05)] rounded-[3px] h-8 px-[15px] flex items-center justify-center shrink-0 transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-[rgba(160,130,72,0.5)] hover:shadow-[0_6px_16px_-8px_rgba(26,22,18,0.3)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <Image
        src={cdn(src)}
        alt={alt}
        width={w}
        height={h}
        className="object-contain"
        unoptimized
      />
    </div>
  )
}

export function WeddingPaymentSection() {
  const t = useTranslations("wedding.payment")
  const { ref, reveal } = useScrollReveal<HTMLDivElement>()

  return (
    <section className="bg-[#faf7f2] px-4 md:px-20 py-14 md:py-14">
      <div ref={ref} className="max-w-[1280px] mx-auto flex flex-col items-center gap-7">
        <h2
          className={cn("text-[36px] md:text-[44px] leading-tight font-normal text-[#1a1612] text-center", reveal())}
          style={SERIF_FONT}
        >
          <span>{t("headingStart")} </span>
          <span className="italic text-[#a8833a]">{t("headingAccent")}</span>
        </h2>

        <div className="hidden md:flex gap-[10px] items-center justify-center">
          {METHODS.map((m, i) => (
            <div
              key={m.alt}
              className={reveal()}
              style={{ transitionDelay: `${140 + i * 80}ms` }}
            >
              <PaymentPill src={m.src} alt={m.alt} w={m.w} h={m.h} />
            </div>
          ))}
        </div>

        <div className="md:hidden grid grid-cols-2 gap-[10px] place-items-center">
          {METHODS.map((m, i) => (
            <div
              key={m.alt}
              className={reveal()}
              style={{ transitionDelay: `${140 + i * 80}ms` }}
            >
              <PaymentPill src={m.src} alt={m.alt} w={m.w} h={m.h} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
