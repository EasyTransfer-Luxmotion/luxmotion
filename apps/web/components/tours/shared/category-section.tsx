"use client"

import { useMemo } from "react"
import { Link } from "@/i18n/navigation"
import { TourCard, TourData } from "./tour-card"

interface CategorySectionProps {
  /** Frase inteira, já traduzida: "Tours em destaque de". Eram duas metades
   *  coladas, e uma frase partida ao meio não se traduz para todas as línguas. */
  title: string
  destination: string
  tours: TourData[]
  searchQuery: string
}

export function CategorySection({
  title,
  destination,
  tours,
  searchQuery
}: CategorySectionProps) {
  const filteredTours = useMemo(() => {
    return tours.filter((tour) => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return (
        tour.title.toLowerCase().includes(query) ||
        tour.location.toLowerCase().includes(query) ||
        tour.duration.toLowerCase().includes(query)
      )
    })
  }, [tours, searchQuery])

  if (filteredTours.length === 0) {
    return null
  }

  return (
    <section className="w-full">
      <h2
        className="text-[32px] md:text-[48px] leading-[1.1] text-[var(--lm-text,#f5f5f5)] mb-6"
        style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
      >
        <span>{title} </span>
        <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]">{destination}</span>
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-[2px]">
        {filteredTours.map((tour) => (
          <Link key={tour.id} href={`/tours/tour/${tour.id}`} className="flex">
            <TourCard tour={tour} className="w-full" />
          </Link>
        ))}
      </div>
    </section>
  )
}
