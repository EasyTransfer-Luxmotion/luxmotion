"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, MapPinned, UserRoundCheck, type LucideIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"
import { GooglePlacesInput, type GooglePlaceValue } from "@/components/ui/google-places-input"
import { cdn } from "@/lib/cdn"

const TRUST_BADGES: { icon: LucideIcon; key: string }[] = [
  { icon: ShieldCheck, key: "safe" },
  { icon: MapPinned, key: "authenticExperiences" },
  { icon: UserRoundCheck, key: "expertGuides" },
]

export function ToursHero() {
  const t = useTranslations("toursHero")
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isVisible, setIsVisible] = useState(false)
  const [placeValue, setPlaceValue] = useState<GooglePlaceValue>({
    location: "",
    placeId: null,
    lat: null,
    lng: null,
  })

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (searchParams.get("focus") === "search") {
      setTimeout(() => {
        const input = document.getElementById("tours-search-input") as HTMLInputElement | null
        if (input) input.focus()
      }, 500)
    }
  }, [searchParams])

  const handleSearch = (override?: GooglePlaceValue) => {
    const v = override ?? placeValue
    if (v.location.trim()) {
      const params = new URLSearchParams()
      params.set("q", v.location.trim())
      if (v.lat !== null && v.lng !== null) {
        params.set("lat", v.lat.toString())
        params.set("lng", v.lng.toString())
      }
      router.push(`/tours/results?${params.toString()}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch()
  }

  const handlePlaceChange = (next: GooglePlaceValue) => {
    setPlaceValue(next)
    if (next.lat !== null && next.lng !== null) handleSearch(next)
  }

  return (
    <section className="relative w-full min-h-[500px] md:min-h-[596px] flex items-center justify-center overflow-hidden">
      {/* Vídeo de fundo, silenciado e em loop. O poster mantém o enquadramento
          anterior enquanto o vídeo não pinta o primeiro frame. */}
      <video
        src={cdn("/video/tours-hero.mp4")}
        poster={cdn("/video/tours-hero-poster.webp")}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
      />

      <div
        className="absolute inset-0 md:hidden"
        style={{
          backgroundImage:
            "linear-gradient(127.5deg, rgba(10,14,15,0.7) 0%, rgba(15,26,20,0.7) 35%, rgba(20,17,10,0.7) 70%, rgba(13,13,13,0.7) 100%)",
        }}
      />
      <div
        className="absolute inset-0 hidden md:block"
        style={{
          backgroundImage:
            "linear-gradient(155deg, rgba(10,14,15,0.8) 0%, rgba(15,26,20,0.8) 35%, rgba(20,17,10,0.8) 70%, rgba(13,13,13,0.8) 100%)",
        }}
      />
      {/* Fade em baixo: o vídeo dissolve-se na secção seguinte (#0D0D0D) em
          vez de cortar a direito, como nos ultra luxury. O vídeo e o texto
          por cima dele ficam escuros nos dois temas — só o fim do fade segue o
          fundo da página. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[var(--lm-bg,#0D0D0D)] md:h-44" />

      <div className="relative z-10 flex flex-col items-center gap-6 md:gap-7 px-4 md:px-8 py-[89px] w-full max-w-[710px]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-px bg-[#C9A96E]" />
          <span
            className="text-[12px] font-semibold uppercase tracking-[2px] text-[#C9A96E] whitespace-nowrap"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("redesign.label")}
          </span>
          <div className="w-8 h-px bg-[#C9A96E]" />
        </div>

        <h1
          className={cn(
            "text-center text-[48px] md:text-[96px] min-[1440px]:text-[82px] min-[1920px]:text-[96px] leading-[1.2] md:leading-[0.95] transition-all duration-700 ease-out",
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}
          style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
        >
          <span className="text-[#F5F5F5]">{t("redesign.headingLine1")}</span>
          <br />
          <span className="italic text-[#C9A96E]">{t("redesign.headingLine2")}</span>
        </h1>

        <p
          className={cn(
            "text-[18px] text-[#999] text-center leading-[1.3] max-w-[597px]",
            "transition-all duration-700 ease-out delay-100",
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {t("redesign.subtitle")}
        </p>

        <div className="flex flex-col gap-2 w-full max-w-[552px]">
          <div
            className={cn(
              "flex flex-col w-full",
              "transition-all duration-700 ease-out delay-150",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
            onKeyDown={handleKeyDown}
          >
            <div className="w-full h-[56px] bg-[#1E1D1B] border border-[rgba(255,255,255,0.12)] flex items-center">
              <GooglePlacesInput
                value={placeValue}
                onChange={handlePlaceChange}
                placeholder={t("redesign.searchPlaceholder")}
                variant="tours-hero-dark"
                showDefaultSuggestions={false}
                className="flex-1 h-full"
              />
            </div>
            {/* Duas ações lado a lado: pesquisar o que está escrito, ou saltar
                directamente para a lista completa sem escrever nada. */}
            <div className="flex w-full items-stretch">
              <button
                onClick={() => handleSearch()}
                className="flex flex-1 h-[56px] items-center justify-center border border-[#C9A96E] bg-[#C9A96E] transition-colors hover:bg-[#b8954f]"
              >
                <span
                  className="text-[14px] font-medium uppercase tracking-[1.1px] text-[#0D0D0D] whitespace-nowrap"
                  style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                >
                  {t("redesign.searchButton")}
                </span>
              </button>
              <button
                onClick={() => router.push("/tours/results")}
                className="flex flex-1 h-[56px] items-center justify-center border border-l-0 border-[#C9A96E] bg-[#EFE8DC] transition-colors hover:bg-[#e3d9c8]"
              >
                <span
                  className="text-[14px] font-medium uppercase tracking-[1.1px] text-[#1a1612] whitespace-nowrap"
                  style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                >
                  {t("redesign.viewAllButton")}
                </span>
              </button>
            </div>
          </div>

          <div
            className={cn(
              "flex items-stretch gap-2 w-full",
              "transition-all duration-700 ease-out delay-300",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            {TRUST_BADGES.map((badge) => (
              <div
                key={badge.key}
                /* Fundo próprio em vez de branco a 4%: estes selos assentam no
                   vídeo, e o cinzento perdia-se assim que passava um fotograma
                   claro — mais ainda em tema claro, onde o fade do fundo da
                   hero termina em creme. */
                className="flex-1 flex items-center justify-center gap-2 bg-[rgba(13,13,13,0.55)] backdrop-blur-[2px] border border-[rgba(255,255,255,0.18)] px-3 py-2"
              >
                <badge.icon className="w-5 h-5 text-[#E4DED4] shrink-0" />
                <span
                  className="text-[12px] font-medium text-[#E4DED4] leading-[1.3] md:whitespace-nowrap"
                  style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                >
                  {t(`redesign.badges.${badge.key}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
