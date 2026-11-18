"use client"

import Image from "next/image"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { AirVent, Briefcase, ChevronLeft, ChevronRight, User, Wifi } from "lucide-react"

export type FleetBadge = "available" | "eco" | "electric"

export type FleetVehicle = {
  id: string
  name: string
  image: string
  /** Fotos extra (frente, trás, interior). Sem isto o card mostra só `image`. */
  images?: string[]
  badges: FleetBadge[]
  paxMin: number
  paxMax: number
  bags: number
  hasAc?: boolean
  hasWifi?: boolean
}

const BADGE_STYLES: Record<FleetBadge, string> = {
  available: "bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.5)]",
  eco: "bg-[rgba(76,175,80,0.2)] border-[rgba(76,175,80,0.3)] text-[#81c784]",
  electric: "bg-[rgba(33,150,243,0.15)] border-[rgba(33,150,243,0.3)] text-[#64b5f6]",
}

export function FleetVehicleCardDark({ vehicle }: { vehicle: FleetVehicle }) {
  const t = useTranslations("fleetPage")

  return (
    <div className="bg-[#1a1a1a] group-hover:bg-[#1e1c1a] hover:bg-[#1e1c1a] transition-colors duration-500 ease-out flex flex-col overflow-clip relative group">
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-[1.5px] w-full origin-center scale-x-0 group-hover:scale-x-100 transition-transform duration-700 ease-out z-[4]"
        style={{
          background:
            "linear-gradient(to right, transparent 0%, rgba(201,169,110,0) 8%, #C9A96E 50%, rgba(201,169,110,0) 92%, transparent 100%)",
        }}
      />
      <div className="absolute top-3 left-3 right-3 flex gap-[2px] z-[3]">
        {vehicle.badges.map((b) => (
          <span
            key={b}
            className={`inline-flex items-center px-[8.8px] py-[3.8px] border text-[8px] font-semibold tracking-[0.8px] uppercase whitespace-nowrap ${BADGE_STYLES[b]}`}
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t(`badges.${b}`)}
          </span>
        ))}
      </div>

      <VehiclePhotos vehicle={vehicle} />

      <div className="flex flex-col gap-3 px-5 pt-[18px] pb-6 flex-1 z-[1]">
        <h3
          className="text-[24px] leading-[1.3] text-white font-semibold transition-colors duration-500 ease-out group-hover:text-[#C9A96E]"
          style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
        >
          {vehicle.name}
        </h3>

        <div
          className="flex flex-wrap gap-x-3 gap-y-2 text-[12px] text-[#999999]"
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
        >
          <MetaItem icon={<User className="size-[14px]" strokeWidth={1.5} />}>
            {/* Num clássico de dois lugares dava "1–1 pax". */}
            {t("meta.pax", { min: vehicle.paxMin, max: vehicle.paxMax, same: vehicle.paxMin === vehicle.paxMax ? "sim" : "nao" })}
          </MetaItem>
          <MetaItem icon={<Briefcase className="size-[14px]" strokeWidth={1.5} />}>
            {t("meta.bags", { count: vehicle.bags })}
          </MetaItem>
          {vehicle.hasAc && (
            <MetaItem icon={<AirVent className="size-[14px]" strokeWidth={1.5} />}>
              {t("meta.ac")}
            </MetaItem>
          )}
          {vehicle.hasWifi && (
            <MetaItem icon={<Wifi className="size-[14px]" strokeWidth={1.5} />}>
              {t("meta.wifi")}
            </MetaItem>
          )}
        </div>
      </div>
    </div>
  )
}

function MetaItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[5px] h-[15px]">
      <span className="shrink-0 text-[#999999]">{icon}</span>
      <span className="leading-none whitespace-nowrap">{children}</span>
    </div>
  )
}

/**
 * Fotos do veículo. Com mais do que uma (frente, trás, interior) mostra setas e
 * pontos; com uma só é uma imagem estática, sem controlos.
 */
function VehiclePhotos({ vehicle }: { vehicle: FleetVehicle }) {
  const photos = vehicle.images?.length ? vehicle.images : [vehicle.image]
  const [idx, setIdx] = useState(0)
  const many = photos.length > 1
  // As setas vivem dentro do card, que já tem hover próprio — parar a
  // propagação evita disparar o link/hover do card ao trocar de foto.
  const go = (e: React.MouseEvent, delta: number) => {
    e.preventDefault()
    e.stopPropagation()
    setIdx((i) => (i + delta + photos.length) % photos.length)
  }

  return (
    <div className="relative h-[180px] w-full bg-[#0d0d0d] z-[2] overflow-hidden">
      {photos.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt={vehicle.name}
          fill
          className={`object-contain transition-opacity duration-300 ${
            i === idx ? "opacity-100" : "opacity-0"
          }`}
          sizes="(min-width: 768px) 25vw, 50vw"
        />
      ))}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.1) 33.22%, rgba(201,169,110,0.1) 100%)",
        }}
      />

      {many && (
        <>
          <button
            type="button"
            onClick={(e) => go(e, -1)}
            aria-label="Foto anterior"
            className="absolute left-1 top-1/2 -translate-y-1/2 z-[3] grid size-7 place-items-center rounded-full bg-black/40 text-white/80 opacity-0 transition group-hover:opacity-100 hover:bg-black/70 hover:text-white"
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={(e) => go(e, 1)}
            aria-label="Foto seguinte"
            className="absolute right-1 top-1/2 -translate-y-1/2 z-[3] grid size-7 place-items-center rounded-full bg-black/40 text-white/80 opacity-0 transition group-hover:opacity-100 hover:bg-black/70 hover:text-white"
          >
            <ChevronRight className="size-4" strokeWidth={2} />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[3] flex gap-1">
            {photos.map((src, i) => (
              <span
                key={src}
                className={`h-[3px] rounded-full transition-all ${
                  i === idx ? "w-4 bg-[#C9A96E]" : "w-[3px] bg-white/40"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
