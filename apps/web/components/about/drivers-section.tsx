"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import Image from "next/image"
import { usePublishedDrivers, type PublicDriver as Driver } from "@/hooks/use-published-drivers"

function DriverCard({ d }: { d: Driver }) {
  const tDrivers = useTranslations("drivers")
  return (
    <div className="group relative bg-[#0D0D0D] hover:bg-[#161412] transition-colors duration-500 ease-out border border-[rgba(154,117,53,0.22)] flex flex-col items-center px-9 py-12 h-full w-full">
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-px w-full -translate-x-1/2 origin-center scale-x-0 transition-transform duration-700 ease-out group-hover:scale-x-100"
        style={{
          background:
            "linear-gradient(to right, transparent 0%, rgba(201,169,110,0) 8%, #C9A96E 50%, rgba(201,169,110,0) 92%, transparent 100%)",
        }}
      />
      <div className="size-20 rounded-full overflow-hidden bg-[#1a1a1a] border border-[rgba(201,169,110,0.2)] mb-5">
        <Image src={d.image} alt={d.name} width={80} height={80} className="object-cover size-full" />
      </div>
      <h3
        className="text-white text-[18px] font-medium text-center mb-[6px]"
        style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
      >
        {d.name}
      </h3>
      <p
        className="text-[#C9A96E] text-[12px] uppercase tracking-[1.5px] text-center mb-4"
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        {d.location}
      </p>
      <p
        className="text-[#999] text-[12px] leading-[1.3] text-center"
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        {d.quote}
      </p>

      <p
        className="text-[#8c8680] text-[12px] leading-[1.4] text-center mt-4"
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        {d.description}
      </p>

      <div className="mt-auto pt-6 flex flex-col items-center gap-3 w-full">
        <div className="flex flex-col items-center gap-[6px]">
          <span
            className="text-[10px] font-semibold uppercase tracking-[1.5px] text-white"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {tDrivers("languages")}
          </span>
          <span
            className="text-[12px] text-[#999] text-center"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {d.languages}
          </span>
        </div>

        <div className="inline-flex items-center gap-[7px] px-4 py-3 bg-[rgba(201,169,110,0.08)] border border-[rgba(201,169,110,0.2)]">
          <span className="text-[12px] font-semibold text-[#C9A96E] leading-none">{d.rating}</span>
          <span className="text-[12px] text-[#C9A96E] tracking-[2px] leading-none">★★★★★</span>
          <span className="text-[12px] text-[#8c8680] tracking-[0.44px] leading-none">
            · {d.rides.toLocaleString()} {tDrivers("rides")}
          </span>
        </div>
      </div>
    </div>
  )
}

function CarouselArrow({
  direction,
  onClick,
  disabled,
}: {
  direction: "left" | "right"
  onClick: () => void
  disabled: boolean
}) {
  const Icon = direction === "left" ? ArrowLeft : ArrowRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "size-12 bg-[#0D0D0D] border border-[rgba(154,117,53,0.4)] flex items-center justify-center text-[#C9A96E] transition-colors",
        disabled ? "opacity-30 cursor-not-allowed" : "hover:bg-[rgba(201,169,110,0.08)] hover:border-[#C9A96E]",
      )}
      aria-label={direction === "left" ? "Previous" : "Next"}
    >
      <Icon className="size-[18px]" strokeWidth={1.5} />
    </button>
  )
}

export function DriversSection() {
  const t = useTranslations("aboutPage.drivers")
  const [idx, setIdx] = useState(0)
  const [pageSize, setPageSize] = useState(3)
  const drivers = usePublishedDrivers()

  useEffect(() => {
    const update = () => setPageSize(window.innerWidth >= 768 ? 3 : 1)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const maxIdx = Math.max(0, drivers.length - pageSize)
  const safeIdx = Math.min(idx, maxIdx)
  const pageCount = Math.max(1, drivers.length - pageSize + 1)
  const slidePercent = 100 / pageSize

  return (
    /* id: o "Ver no site" dos Motoristas no back-office abre /about-us#drivers,
       e sem ele a página abria no topo. */
    <section id="drivers" className="scroll-mt-[56px] bg-[#0D0D0D] flex flex-col items-center px-4 md:px-[82px] py-16 md:py-20">
      <div className="flex flex-col gap-6 items-center w-full max-w-[1280px]">
        <div className="flex flex-col items-center w-full gap-2">
          <div className="flex gap-2 items-center justify-center w-full">
            <div className="w-8 h-px bg-[#C9A96E]" />
            <span
              className="text-[12px] font-semibold uppercase tracking-[2px] text-[#C9A96E] whitespace-nowrap"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {t("eyebrow")}
            </span>
            <div className="w-8 h-px bg-[#C9A96E]" />
          </div>
          <h2
            className="text-white font-normal text-center leading-[1.2]"
            style={{
              fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
              fontSize: "clamp(2rem, 3.4vw, 3rem)",
            }}
          >
            {t("heading")}
          </h2>
        </div>

        <div className="relative w-full">
          <div className="w-full overflow-hidden bg-[rgba(201,169,110,0.07)]">
            <div
              className="flex gap-[2px] transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${safeIdx * slidePercent}%)` }}
            >
              {drivers.map((d) => (
                <div
                  key={d.id}
                  className="shrink-0"
                  style={{ width: `calc(${slidePercent}% - ${(2 * (pageSize - 1)) / pageSize}px)` }}
                >
                  <DriverCard d={d} />
                </div>
              ))}
            </div>
          </div>

          <div className="absolute left-3 lg:-left-6 top-1/2 -translate-y-1/2 z-10">
            <CarouselArrow
              direction="left"
              onClick={() => setIdx((i) => Math.max(i - 1, 0))}
              disabled={safeIdx === 0}
            />
          </div>
          <div className="absolute right-3 lg:-right-6 top-1/2 -translate-y-1/2 z-10">
            <CarouselArrow
              direction="right"
              onClick={() => setIdx((i) => Math.min(i + 1, maxIdx))}
              disabled={safeIdx >= maxIdx}
            />
          </div>
        </div>

        {pageCount > 1 && (
          <div className="flex gap-2 items-center justify-center px-4">
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Go to driver ${i + 1}`}
                className={cn(
                  "rounded-full transition-all",
                  i === safeIdx ? "size-[6px] bg-[#C9A96E]" : "size-[5px] bg-[rgba(201,169,110,0.4)]",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
