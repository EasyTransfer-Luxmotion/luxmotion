"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, BadgeEuro, Car, Clock, LucideIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import { cdn } from "@/lib/cdn"

const FEATURE_BADGES = [
  { icon: Car, key: "premium", order: { desktop: 0, mobile: 0 } },
  { icon: BadgeEuro, key: "comfort", order: { desktop: 1, mobile: 2 } },
  { icon: ShieldCheck, key: "safety", order: { desktop: 2, mobile: 1 } },
  { icon: Clock, key: "available", order: { desktop: 3, mobile: 3 } },
] as const

interface FeatureBadgeProps {
  icon: LucideIcon
  label: string
  className?: string
}

function FeatureBadge({ icon: Icon, label, className }: FeatureBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-[8px] pl-[8px] pr-[16px] py-[9px]",
        "bg-white rounded-[48px]",
        "shadow-[0px_4px_4px_0px_rgba(97,236,154,0.2)]",
        className
      )}
    >
      <Icon className="w-[20px] h-[20px] text-[#27C7FF]" />
      <span className="text-[16px] text-[#0e4659] font-normal leading-none whitespace-nowrap">
        {label}
      </span>
    </div>
  )
}

export function FleetHero() {
  const t = useTranslations("fleetPage")
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const desktopBadges = [...FEATURE_BADGES].sort((a, b) => a.order.desktop - b.order.desktop)
  const mobileBadges = [...FEATURE_BADGES].sort((a, b) => a.order.mobile - b.order.mobile)

  return (
    <section className="relative w-full h-[459px] md:h-[520px] lg:h-[600px] xl:h-[690px] overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${cdn("/fleet/hero-fleet.jpeg")}')` }}
      />

      <div className="absolute inset-0 bg-black/30" />

      <div className="absolute top-0 left-0 right-0 h-[220px] md:h-[260px] lg:h-[300px] bg-gradient-to-b from-white via-white/90 via-40% to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 h-[180px] md:h-[200px] lg:h-[240px] bg-gradient-to-t from-white via-white/80 via-40% to-transparent" />

      <div className="relative z-10 h-full flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-[16px] w-full max-w-[395px] md:max-w-[777px]">
          <h1
            className={cn(
              "text-center text-white mix-blend-screen transition-all duration-700 ease-out",
              "text-[40px] md:text-[72px] min-[1440px]:text-[82px] min-[1920px]:text-[72px] leading-[1.3] md:leading-[72px]",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            <span className="font-extrabold">{t("heroTitle")}</span>
          </h1>

          <p
            className={cn(
              "text-center text-white/90 text-[16px] md:text-[20px] leading-[1.4] max-w-[600px]",
              "transition-all duration-700 ease-out delay-150",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            {t("heroSubtitle")}
          </p>

          <div
            className={cn(
              "hidden md:flex flex-row items-center justify-center gap-[16px] w-full",
              "transition-all duration-700 ease-out delay-300",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            {desktopBadges.map((badge) => (
              <FeatureBadge key={badge.key} icon={badge.icon} label={t(`badges.${badge.key}`)} />
            ))}
          </div>

          <div
            className={cn(
              "flex md:hidden flex-wrap justify-center content-start gap-[16px] w-full",
              "transition-all duration-700 ease-out delay-300",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            {mobileBadges.map((badge) => (
              <FeatureBadge key={badge.key} icon={badge.icon} label={t(`badges.${badge.key}`)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
