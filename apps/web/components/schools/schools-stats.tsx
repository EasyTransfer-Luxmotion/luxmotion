"use client"

import Image from "next/image"
import { useTranslations } from "next-intl"
import { Award, Baby, Shield, type LucideIcon } from "lucide-react"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import { cn } from "@workspace/ui/lib/utils"
import { cdn } from "@/lib/cdn"

const SERIF_FONT = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const
const SANS_FONT = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const

type StatKey = "fleet" | "children" | "trips"

const STATS: { key: StatKey; Icon: LucideIcon }[] = [
  { key: "fleet", Icon: Award },
  { key: "children", Icon: Baby },
  { key: "trips", Icon: Shield },
]

function StatCard({
  Icon,
  value,
  label,
}: {
  Icon: LucideIcon
  value: string
  label: string
}) {
  return (
    <div className="bg-white border border-[rgba(28,27,24,0.08)] hover:border-[rgba(154,117,53,0.4)] hover:bg-[rgba(154,117,53,0.04)] transition-colors duration-200 flex flex-col gap-4 items-center px-[24.8px] py-[32.8px] w-full md:w-[411.34px] md:h-full">
      <div className="size-12 bg-[rgba(154,117,53,0.07)] flex items-center justify-center shrink-0">
        <Icon className="size-6 text-[#a08248]" strokeWidth={1.75} />
      </div>
      <div className="pt-[8.8px] w-full flex justify-center">
        <span
          className="text-[60px] leading-[60px] font-bold text-[#a08248] whitespace-nowrap"
          style={SERIF_FONT}
        >
          {value}
        </span>
      </div>
      <p
        className="text-[14px] leading-[1.2] text-[#696969] text-center w-full md:min-h-[34px]"
        style={SANS_FONT}
      >
        {label}
      </p>
    </div>
  )
}

export function SchoolsStats() {
  const t = useTranslations("schools.stats")
  const { ref, reveal } = useScrollReveal<HTMLDivElement>()

  return (
    <section className="relative overflow-hidden px-4 md:px-[52px] py-[96px] md:py-[120px] bg-white">
      <img
        aria-hidden
        src={cdn("/schools/stats-backdrop.svg")}
        alt=""
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-0 w-[1905px] min-w-[100vw] max-w-none h-[686px] mix-blend-multiply"
      />
      <div ref={ref} className="relative max-w-[1280px] mx-auto flex flex-col gap-6 items-center">
        <div className={cn("flex flex-col gap-2 items-center w-full", reveal())}>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-[#a08248]" />
            <span
              className="text-[12px] font-semibold uppercase tracking-[2px] text-[#a08248] whitespace-nowrap leading-none"
              style={SANS_FONT}
            >
              {t("eyebrow")}
            </span>
            <div className="h-px w-8 bg-[#a08248]" />
          </div>

          <h2
            className="text-[32px] md:text-[48px] leading-none text-[#0d0d0d] text-center font-normal px-2"
            style={SERIF_FONT}
          >
            <span className="block md:inline">{t("title1")}</span>{" "}
            <span className="italic font-medium text-[#a08248]">{t("titleAccent")}</span>
          </h2>
        </div>

        <p
          className={cn("text-[18px] leading-[1.3] text-[#696969] text-center max-w-[1080px] px-2", reveal())}
          style={{ ...SANS_FONT, transitionDelay: "120ms" }}
        >
          {t("subtitle")}
        </p>

        <div
          className={cn("relative w-full flex justify-center pt-12 md:pt-24", reveal())}
          style={{ transitionDelay: "240ms" }}
        >
          <div className="relative w-[280px] sm:w-[398px] md:w-[648px] aspect-[648/308]">
            <Image
              src="/schools/fleet-lineup.webp"
              alt={t("fleetAlt")}
              fill
              priority={false}
              sizes="(max-width: 768px) 398px, 648px"
              className="object-contain object-bottom pointer-events-none"
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:justify-center gap-[2px] md:gap-[3px] w-full pt-[17px] md:items-stretch">
          {STATS.map(({ key, Icon }, i) => (
            <div
              key={key}
              className={cn("flex md:flex-1 md:max-w-[411.34px]", reveal())}
              style={{ transitionDelay: `${360 + i * 110}ms` }}
            >
              <StatCard
                Icon={Icon}
                value={t(`items.${key}.value`)}
                label={t(`items.${key}.label`)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
