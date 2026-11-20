"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import { TourRouteMap } from "@/components/tours/tour-route-map"

interface ItineraryItem {
  time: string
  title: string
  description: string
  image?: string
  lat?: number
  lng?: number
}

interface MeetingPoint {
  title: string
  address: string
  description?: string
  lat?: number
  lng?: number
}

interface TourItineraryProps {
  items: ItineraryItem[]
  mapCenter?: {
    lat: number
    lng: number
  }
  pickup?: MeetingPoint
  dropoff?: MeetingPoint
}

function ItineraryCard({
  item,
  isOpen,
  onToggle,
}: {
  item: ItineraryItem
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      className="w-full border-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.04)] flex items-stretch cursor-pointer hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] transition-colors"
    >
      <div className="w-[56px] md:w-[70px] shrink-0 border-r-[0.8px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] py-[16px] flex justify-center items-start">
        <span
          className="text-[10px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] tracking-[0.6px]"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          {item.time}
        </span>
      </div>

      {item.image && (
        <div className="shrink-0 self-stretch flex items-center p-[14px]">
          <div
            className={cn(
              "relative overflow-hidden transition-all duration-300 ease-out",
              isOpen
                ? "border-[2.38px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.1)] w-[100px] md:w-[152px] h-[96px] md:h-[114px]"
                : "border-0 w-[72px] h-[54px]"
            )}
          >
            <Image src={item.image} alt={item.title} fill className="object-cover" />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col py-[14px]">
        <div className="flex items-center justify-between gap-3 pr-[16px] pl-[14px]">
          <span
            className="text-[14px] font-medium text-[var(--lm-text,#fff)] leading-[1.3]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {item.title}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            aria-expanded={isOpen}
            className={cn(
              "size-[32px] shrink-0 flex items-center justify-center border transition-colors duration-300",
              isOpen
                ? "bg-[var(--lm-accent,#c9a96e)] border-[rgba(var(--lm-accent-rgb,154,117,53),0.22)]"
                : "bg-transparent border-[rgba(var(--lm-accent-rgb,201,169,110),0.25)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
            )}
          >
            <ChevronDown
              className={cn(
                "size-[16px] transition-all duration-300",
                isOpen ? "text-[#0D0D0D] rotate-180" : "text-[var(--lm-accent,#c9a96e)]"
              )}
            />
          </button>
        </div>
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-out pr-[16px] pl-[14px]",
            isOpen ? "max-h-[400px] opacity-100 mt-[8px]" : "max-h-0 opacity-0 mt-0"
          )}
        >
          <p
            className="text-[13px] font-light text-[var(--lm-muted,#999)] leading-[1.3]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {item.description}
          </p>
        </div>
      </div>
    </div>
  )
}

export function TourItinerary({ items, mapCenter, pickup, dropoff }: TourItineraryProps) {
  const t = useTranslations("tourDetails")
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="w-full">
      <h2
        className="text-[24px] font-light italic text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] leading-none mb-5"
        style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
      >
        {t("itinerary")}
      </h2>

      <TourRouteMap
        pickup={pickup}
        dropoff={dropoff}
        stops={items}
        className="h-[400px] md:h-[500px] mb-6"
      />

      <div className="flex flex-col gap-0">
        {items.map((item, index) => (
          <ItineraryCard
            key={index}
            item={item}
            isOpen={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? null : index)}
          />
        ))}
      </div>
    </div>
  )
}
