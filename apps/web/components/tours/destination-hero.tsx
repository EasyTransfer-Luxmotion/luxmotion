"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"
import { type GooglePlaceValue } from "@/components/ui/google-places-input"
import { ToursSearchBar } from "@/components/tours/shared/tours-search-bar"
import { cdn } from "@/lib/cdn"

interface DestinationHeroProps {
  destination: string
  searchQuery: string
  onSearchChange: (query: string) => void
}

export function DestinationHero({ destination, searchQuery, onSearchChange }: DestinationHeroProps) {
  const t = useTranslations("toursHero")
  const router = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [placeValue, setPlaceValue] = useState<GooglePlaceValue>({
    location: searchQuery,
    placeId: null,
    lat: null,
    lng: null,
  })

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const handlePlaceChange = (value: GooglePlaceValue) => {
    setPlaceValue(value)
    onSearchChange(value.location)
  }

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

  return (
    <section className="relative w-full overflow-hidden bg-[var(--lm-bg,#0D0D0D)]">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat hidden md:block"
        style={{ backgroundImage: `url('${cdn("/tours/lisbonbanner-desktop.webp")}')` }}
      />
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat md:hidden"
        style={{ backgroundImage: `url('${cdn("/tours/lisbonbanner-mobile.webp")}')` }}
      />

      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(161deg, rgba(10,16,24,0.8) 0%, rgba(15,24,32,0.8) 40%, rgba(19,16,16,0.8) 80%, rgba(13,13,13,0.8) 100%)",
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(var(--lm-accent-rgb,201,169,110),0.10) 0%, rgba(var(--lm-accent-rgb,201,169,110),0) 65%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center gap-[16px] px-4 py-[80px] md:py-[120px]">
        <h1
          className={cn(
            "text-center text-[#f5f5f5] font-normal transition-all duration-700 ease-out",
            "text-[56px] md:text-[72px] lg:text-[96px] leading-[1]",
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}
          style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
        >
          {destination}
        </h1>

        <ToursSearchBar
          value={placeValue}
          onChange={handlePlaceChange}
          onSearch={handleSearch}
          placeholder={t("redesign.searchPlaceholder")}
          className={cn(
            "transition-all duration-700 ease-out delay-150",
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}
        />
      </div>
    </section>
  )
}
