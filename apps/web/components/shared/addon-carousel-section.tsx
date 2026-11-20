"use client"

import { useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import { useSwipe } from "@/hooks/use-swipe"
import { useMoney } from "@/components/currency-provider"

const SERIF_FONT = "var(--font-title), 'Cormorant Garamond', serif"
const SANS_FONT = "var(--font-sans), system-ui, sans-serif"

export interface AddonItem {
  _id: string
  title: string
  description?: string
  imageUrl?: string | null
  price: number
  pricingType: "per_person" | "flat"
  currency: string
}

interface AddonCarouselSectionProps {
  addons: AddonItem[]
}

export function AddonCarouselSection({ addons }: AddonCarouselSectionProps) {
  const t = useTranslations("tourDetails")
  const [currentSlide, setCurrentSlide] = useState(0)
  const [visibleCards, setVisibleCards] = useState(3)

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) {
        setVisibleCards(1)
      } else if (window.innerWidth < 1024) {
        setVisibleCards(2)
      } else {
        setVisibleCards(3)
      }
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const maxSlide = Math.max(0, Math.ceil(addons.length / visibleCards) - 1)
  const showNavigation = addons.length > visibleCards

  const handlePrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(0, prev - 1))
  }, [])

  const handleNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, maxSlide))
  }, [maxSlide])

  const addonSwipe = useSwipe(handleNext, handlePrev)

  const { format } = useMoney()

  if (addons.length === 0) return null

  const slideOffset = currentSlide * visibleCards
  const cardWidth = `calc(${100 / visibleCards}% - ${(24 * (visibleCards - 1)) / visibleCards}px)`
  const slideTranslate = `calc(-${(slideOffset * 100) / visibleCards}% - ${(slideOffset * 24) / visibleCards}px)`

  return (
    <div
      className="mt-10 border-t border-[rgba(201,169,110,0.28)] pt-10 touch-pan-y"
      style={{ fontFamily: SANS_FONT }}
      {...addonSwipe}
    >
      <div className="flex items-center justify-between mb-6">
        {/* A mesma tipografia do "Ponto de Encontro" logo abaixo
            (`tour-meeting-points.tsx:53`): serifa em itálico, dourada. Estava
            em corpo maior, direita e na cor do texto — duas secções seguidas da
            mesma página a anunciarem-se de maneiras diferentes. */}
        <h2
          className="text-[24px] font-medium italic leading-none text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]"
          style={{ fontFamily: SERIF_FONT }}
        >
          {t("addOns")}
        </h2>
        {showNavigation && (
          <div className="flex items-center gap-[8.842px]">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentSlide === 0}
              className={cn(
                "size-[36px] flex items-center justify-center border transition-colors",
                currentSlide === 0
                  ? "border-[rgba(201,169,110,0.16)] text-[rgba(201,169,110,0.35)] cursor-not-allowed"
                  : "border-[rgba(var(--lm-accent-rgb,201,169,110),0.36)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:border-[var(--lm-accent,#C9A96E)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
              )}
            >
              <ChevronLeft className="size-[16px]" strokeWidth={1.6} />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentSlide >= maxSlide}
              className={cn(
                "size-[36px] flex items-center justify-center border transition-colors",
                currentSlide >= maxSlide
                  ? "border-[rgba(201,169,110,0.16)] text-[rgba(201,169,110,0.35)] cursor-not-allowed"
                  : "border-[rgba(var(--lm-accent-rgb,201,169,110),0.36)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:border-[var(--lm-accent,#C9A96E)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
              )}
            >
              <ChevronRight className="size-[16px]" strokeWidth={1.6} />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden">
        <div
          className="flex gap-6 transition-transform duration-500 ease-out will-change-transform"
          style={{
            transform: `translateX(${slideTranslate})`,
          }}
        >
          {addons.map((addon) => (
            <div key={addon._id} className="shrink-0" style={{ width: cardWidth }}>
              <div className="h-full overflow-hidden border border-[rgba(var(--lm-accent-rgb,201,169,110),0.18)] bg-[var(--lm-surface,#1A1A1A)] transition-colors hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.42)]">
                {addon.imageUrl ? (
                  <div className="relative aspect-[183/120] w-full overflow-hidden bg-[rgba(var(--lm-text-rgb,255,255,255),0.06)]">
                    <Image
                      src={addon.imageUrl}
                      alt={addon.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                ) : (
                  <div className="aspect-[183/120] w-full bg-[rgba(var(--lm-text-rgb,255,255,255),0.06)]" />
                )}

                <div className="flex min-h-[148px] flex-col gap-[8px] bg-[var(--lm-surface,#1A1A1A)] px-4 py-4">
                  <h3
                    className="text-[20px] font-medium leading-[1.1] text-[var(--lm-text,#fff)]"
                    style={{ fontFamily: SERIF_FONT }}
                  >
                    {addon.title}
                  </h3>
                  <div className="flex items-center">
                    <span
                      className="text-[20px] font-semibold leading-none text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
                      style={{ fontFamily: SERIF_FONT }}
                    >
                      {/* A barra só se escreve quando há unidade a seguir: num
                          preço fixo ficava "€ 15/" pendurado. */}
                      {format(addon.price)}
                      {addon.pricingType === "per_person" ? "/" : ""}
                    </span>
                    {addon.pricingType === "per_person" && (
                      <span className="ml-1 text-[12px] font-medium text-[var(--lm-muted,#8c8680)]">
                        {t("perPerson")}
                      </span>
                    )}
                  </div>
                  {addon.description && (
                    <p className="line-clamp-2 text-[13px] leading-[1.45] text-[var(--lm-muted,#999)]">
                      {addon.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showNavigation && (
        <div className="mt-5 flex justify-center gap-[6px]">
          {Array.from({ length: maxSlide + 1 }).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentSlide(index)}
              aria-label={`${index + 1}`}
              className={cn(
                "h-[2px] transition-all",
                index === currentSlide
                  ? "w-8 bg-[var(--lm-accent,#C9A96E)]"
                  : "w-4 bg-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.55)]"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
