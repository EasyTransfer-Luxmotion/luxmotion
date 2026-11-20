"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { Plane, House, MapPinned, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import { useSwipe } from "@/hooks/use-swipe"

interface ServiceCard {
  id: string
  icon: LucideIcon
  image: string
  href: string
}

const SERVICES: ServiceCard[] = [
  { id: "luxury", icon: Plane, image: "/tours/svc-luxury.webp", href: "/ultra-luxury-tours" },
  { id: "itineraries", icon: House, image: "/tours/svc-itineraries.webp", href: "/tours" },
  { id: "transfers", icon: MapPinned, image: "/tours/svc-transfers.webp", href: "/#booking" },
]

function ServiceCardItem({
  icon: Icon,
  label,
  title,
  description,
  image,
  href,
}: {
  icon: LucideIcon
  label: string
  title: string
  description: string
  image: string
  href: string
}) {
  return (
    <Link href={href} className="relative overflow-hidden block h-full group cursor-pointer">
      <Image src={image} alt={title} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="(max-width: 768px) 100vw, 33vw" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[42%] to-[var(--lm-bg,#000)] to-[82%]" />
      <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col gap-4">
        {/* Dourado cheio com o ícone escuro. Antes era dourado a 8% de fundo,
            borda a 25% e ícone dourado — sobre uma fotografia, os três tons
            perdiam-se uns nos outros e o ícone mal se via.

            O escuro é fixo e não `--lm-bg`: sobre dourado quer-se sempre um
            ícone escuro, e num tema claro o `--lm-bg` seria creme. */}
        <div className="size-[48px] bg-[var(--lm-accent,#C9A96E)] flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
          <Icon className="size-6 text-[#0d0d0d]" strokeWidth={1.75} />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 flex flex-col gap-2">
            <span
              className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] leading-none"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {label}
            </span>
            <span
              className="text-[24px] text-[var(--lm-text,#fff)] leading-normal"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {title}
            </span>
            <p
              className="text-[14px] text-[var(--lm-muted,#999)] leading-[1.2] tracking-[0.14px]"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {description}
            </p>
          </div>
          <div className="size-[32px] border border-[rgba(var(--lm-text-rgb,255,255,255),0.3)] flex items-center justify-center shrink-0 transition-colors duration-300 group-hover:border-[var(--lm-accent,#C9A96E)] group-hover:bg-[var(--lm-accent,#C9A96E)]">
            <ChevronRight className="size-[18px] text-[var(--lm-accent,#C9A96E)] transition-colors duration-300 group-hover:text-[#0d0d0d]" />
          </div>
        </div>
      </div>
    </Link>
  )
}

export function TopPicksSection() {
  const t = useTranslations("topPicks")
  const [offset, setOffset] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const maxOffset = isMobile ? SERVICES.length - 1 : 0

  const next = useCallback(() => {
    setOffset((prev) => Math.min(prev + 1, maxOffset))
  }, [maxOffset])

  const prev = useCallback(() => {
    setOffset((prev) => Math.max(prev - 1, 0))
  }, [])

  const swipeHandlers = useSwipe(next, prev)

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] pt-10 pb-16 px-4 md:px-[82px]">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2
            className="text-[32px] md:text-[48px] leading-[1.3] text-[var(--lm-text,#fff)]"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            {t("redesign.heading")}{" "}
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("redesign.headingAccent")}</span>
          </h2>
          <p
            className="text-[18px] text-[var(--lm-muted,#999)] leading-[1.3] max-w-[536px]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("redesign.subtitle")}
          </p>
        </div>

        <div className="hidden md:flex gap-[2px] h-[550px]">
          {SERVICES.map((svc) => (
            <div key={svc.id} className="flex-1 h-full">
              <ServiceCardItem
                icon={svc.icon}
                label={t(`redesign.cards.${svc.id}.label`)}
                title={t(`redesign.cards.${svc.id}.title`)}
                description={t(`redesign.cards.${svc.id}.description`)}
                image={svc.image}
                href={svc.href}
              />
            </div>
          ))}
        </div>

        <div className="md:hidden">
          <div className="overflow-hidden touch-pan-y" {...swipeHandlers}>
            <div
              className="flex gap-[2px] transition-transform duration-500 ease-out"
              style={{ transform: `translateX(calc(-${offset} * (100% + 2px)))` }}
            >
              {SERVICES.map((svc) => (
                <div key={svc.id} className="shrink-0 w-full h-[450px]">
                  <ServiceCardItem
                    icon={svc.icon}
                    label={t(`redesign.cards.${svc.id}.label`)}
                    title={t(`redesign.cards.${svc.id}.title`)}
                    description={t(`redesign.cards.${svc.id}.description`)}
                    image={svc.image}
                    href={svc.href}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4 items-center justify-center mt-4">
            <button
              onClick={prev}
              className={cn(
                "size-[36px] flex items-center justify-center bg-[var(--lm-bg,#0D0D0D)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] transition-opacity",
                offset === 0 ? "opacity-0 pointer-events-none" : "opacity-100"
              )}
              aria-label="Previous"
            >
              <ChevronLeft className="size-[14px] text-[var(--lm-accent,#C9A96E)]" />
            </button>

            <div className="flex gap-[6px] items-center">
              {SERVICES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setOffset(i)}
                  className={cn(
                    "rounded-full transition-all",
                    i === offset ? "size-[10px] bg-[var(--lm-accent,#C9A96E)]" : "size-[6px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.3)]"
                  )}
                />
              ))}
            </div>

            <button
              onClick={next}
              className={cn(
                "size-[36px] flex items-center justify-center bg-[var(--lm-bg,#0D0D0D)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] transition-opacity",
                offset >= maxOffset ? "opacity-0 pointer-events-none" : "opacity-100"
              )}
              aria-label="Next"
            >
              <ChevronRight className="size-[14px] text-[var(--lm-accent,#C9A96E)]" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
