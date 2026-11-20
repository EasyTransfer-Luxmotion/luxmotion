"use client"

import { MapPin } from "lucide-react"
import { useTranslations } from "next-intl"

interface MeetingPoint {
  title: string
  address: string
  description?: string
  lat?: number
  lng?: number
}

interface TourMeetingPointsProps {
  pickup: MeetingPoint
  dropoff: MeetingPoint
  hasMapSection?: boolean
}

export function TourMeetingPoints({ pickup, dropoff, hasMapSection }: TourMeetingPointsProps) {
  const t = useTranslations("tourDetails")

  const handleClick = (point: MeetingPoint, type: "pickup" | "dropoff") => {
    if (hasMapSection) {
      const mapSection = document.getElementById("tour-map")
      if (mapSection) {
        mapSection.scrollIntoView({ behavior: "smooth" })
        if (point.lat && point.lng) {
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent("tour-map-focus", {
                detail: { type, lat: point.lat, lng: point.lng },
              })
            )
          }, 500)
        }
      }
    } else {
      if (point.lat && point.lng) {
        window.open(
          `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`,
          "_blank"
        )
      } else {
        const query = encodeURIComponent(point.address || point.title)
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank")
      }
    }
  }

  return (
    <div className="w-full">
      <h2
        className="text-[24px] italic text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] mb-5 font-medium"
        style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
      >
        {t("meetingPoints")}
      </h2>

      <div className="flex flex-col md:flex-row gap-[2px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.05)]">
        <button
          type="button"
          onClick={() => handleClick(pickup, "pickup")}
          className="flex-1 text-left bg-[var(--lm-surface,#1a1a1a)] border-l-[1.6px] border-transparent p-[24px] flex flex-col gap-[8px] transition-colors hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] hover:border-[var(--lm-accent,#c9a96e)] cursor-pointer"
        >
          <div className="size-[24px] rounded-[12px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.15)] border-[0.857px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] flex items-center justify-center">
            <MapPin className="size-[10px] text-[var(--lm-accent,#c9a96e)]" strokeWidth={2} />
          </div>
          <span
            className="text-[8px] font-bold text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] tracking-[1.2px] uppercase"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("pickupTag")}
          </span>
          <div className="flex flex-col gap-[2px]">
            <span
              className="text-[20px] text-[var(--lm-text,#fff)] leading-[1.2]"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {pickup.title}
            </span>
            <span
              className="text-[12px] text-[var(--lm-muted,#8c8680)]"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {pickup.address}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleClick(dropoff, "dropoff")}
          className="flex-1 text-left bg-[rgba(var(--lm-text-rgb,255,255,255),0.02)] p-[24px] flex flex-col gap-[6px] transition-colors hover:bg-[rgba(var(--lm-text-rgb,255,255,255),0.035)] cursor-pointer"
        >
          <span
            className="text-[8px] font-semibold text-[var(--lm-muted,#8c8680)] tracking-[1.2px] uppercase"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("meetingLocationLabel")}
          </span>
          <div className="flex flex-col gap-[2px]">
            <span
              className="text-[20px] font-light text-[var(--lm-text,#fff)] leading-[1.2]"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {dropoff.title}
            </span>
            <span
              className="text-[12px] text-[var(--lm-muted,rgba(255,255,255,0.3))]"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {dropoff.address}
            </span>
          </div>
          <p
            className="text-[11px] text-[var(--lm-muted,rgba(255,255,255,0.3))] leading-[17.6px]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {dropoff.description || t("meetingNote")}
          </p>
        </button>
      </div>
    </div>
  )
}
