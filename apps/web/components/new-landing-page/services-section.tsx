"use client"

import { useState, useCallback } from "react"
import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import { useSwipe } from "@/hooks/use-swipe"

const services = [
  { id: "transfers", image: "/services/transfers.webp", href: "/#booking" },
  { id: "tours", image: "/services/tours.webp", href: "/tours" },
  { id: "weddings", image: "/services/weddings.webp", href: "/wedding" },
  { id: "events", image: "/services/events.webp", href: "/events" },
  { id: "corporate", image: "/services/corporate.webp", href: "/corporate" },
]

interface ServiceCardProps {
  title: string
  image: string
  href: string
  className?: string
}

function ServiceCard({ title, image, href, className }: ServiceCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex flex-col justify-end overflow-clip h-[430px] group",
        className
      )}
    >
      <Image
        src={image}
        alt={title}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        sizes="(max-width: 768px) 50vw, 20vw"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[47%] to-[var(--lm-bg,#000)] to-[84%]" />
      <div className="relative flex items-center justify-between p-4">
        <span
          className="font-semibold text-[24px] text-[var(--lm-text,#fff)] leading-normal"
          style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
        >
          {title}
        </span>
        <div className="size-8 border-[1.143px] border-[rgba(var(--lm-text-rgb,255,255,255),0.3)] flex items-center justify-center group-hover:border-[rgba(var(--lm-text-rgb,255,255,255),0.5)] transition-colors">
          <ArrowRight className="size-[18px] text-[var(--lm-text,#fff)]" />
        </div>
      </div>
    </Link>
  )
}

export function ServicesSection() {
  const t = useTranslations("services")
  const [currentSlide, setCurrentSlide] = useState(0)

  const slides: (typeof services)[] = []
  for (let i = 0; i < services.length; i += 2) {
    slides.push(services.slice(i, i + 2))
  }
  const maxSlide = slides.length - 1

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, maxSlide))
  }, [maxSlide])

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0))
  }, [])

  const swipeHandlers = useSwipe(nextSlide, prevSlide)

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] pt-14 pb-16">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-6 items-center px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-px bg-[var(--lm-accent,#C9A96E)]" />
          <span className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] font-sans">
            {t("sectionLabel")}
          </span>
          <div className="w-8 h-px bg-[var(--lm-accent,#C9A96E)]" />
        </div>

        <div className="hidden md:flex gap-[5px] w-full overflow-hidden">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              title={t(service.id)}
              image={service.image}
              href={service.href}
              className="flex-1"
            />
          ))}
        </div>

        <div className="md:hidden relative w-full">
          <div className="overflow-hidden" {...swipeHandlers}>
            <div
              className="flex transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {slides.map((group, i) => (
                <div key={i} className="grid grid-cols-2 gap-[5px] w-full shrink-0">
                  {group.map((service) => (
                    <ServiceCard
                      key={service.id}
                      title={t(service.id)}
                      image={service.image}
                      href={service.href}
                      className=""
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={prevSlide}
            className={cn(
              "absolute left-2 top-1/2 -translate-y-1/2 size-12 bg-[var(--lm-bg,#0D0D0D)] border-[1.333px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] flex items-center justify-center transition-opacity",
              currentSlide === 0 && "opacity-0 pointer-events-none"
            )}
            aria-label="Previous"
          >
            <ChevronLeft className="size-[18px] text-[var(--lm-accent,#C9A96E)]" />
          </button>
          <button
            onClick={nextSlide}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 size-12 bg-[var(--lm-bg,#0D0D0D)] border-[1.333px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] flex items-center justify-center transition-opacity",
              currentSlide >= maxSlide && "opacity-0 pointer-events-none"
            )}
            aria-label="Next"
          >
            <ChevronRight className="size-[18px] text-[var(--lm-accent,#C9A96E)]" />
          </button>
        </div>
      </div>
    </section>
  )
}
