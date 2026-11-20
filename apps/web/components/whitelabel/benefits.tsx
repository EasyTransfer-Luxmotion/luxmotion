"use client"

import { cn } from "@workspace/ui/lib/utils"
import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import {
  Clock,
  MapPin,
  MessageSquare,
  Shield,
  SquareCheckBig,
  User,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

const SERIF_FONT = {
  fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
} as const

const SANS_FONT = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
} as const

type Benefit = { id: string; Icon: LucideIcon }

const BENEFITS: Benefit[] = [
  { id: "reliable", Icon: Shield },
  { id: "certified", Icon: User },
  { id: "always", Icon: Clock },
  { id: "cancellation", Icon: SquareCheckBig },
  { id: "support", Icon: MessageSquare },
  { id: "meetingPoint", Icon: MapPin },
]

function BenefitCard({ benefit }: { benefit: Benefit }) {
  const t = useTranslations(`whitelabel.benefits.${benefit.id}`)
  const { Icon } = benefit
  return (
    <div className="bg-[var(--lm-surface,#141414)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] transition-colors duration-200 flex flex-col gap-[5px] p-6">
      <div className="size-10 flex items-center justify-center bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.22)]">
        <Icon className="size-[18px] text-[var(--lm-accent,#c9a96e)]" strokeWidth={1.5} />
      </div>
      <h3
        className="text-[22px] lg:text-[24px] font-medium text-[var(--lm-text,#fff)] leading-normal pt-2"
        style={SERIF_FONT}
      >
        {t("title")}
      </h3>
      <p
        className="text-[14px] leading-[1.2] text-[rgba(var(--lm-text-rgb,255,255,255),0.4)]"
        style={SANS_FONT}
      >
        {t("body")}
      </p>
    </div>
  )
}

export function Benefits() {
  const t = useTranslations("whitelabel.benefits")
  const { ref, reveal } = useScrollReveal<HTMLDivElement>()

  return (
    <section className="bg-[var(--lm-bg,#0d0d0d)] px-4 lg:px-[82px] pt-14 lg:pt-[72px] pb-14 lg:pb-[72px]">
      <div ref={ref} className="max-w-[1280px] mx-auto flex flex-col gap-4">
        <div className={cn("flex flex-col gap-2 items-center text-center", reveal())}>
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-[var(--lm-accent,#c9a96e)]" />
            <span
              className="text-[12px] font-medium uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))] leading-none"
              style={SANS_FONT}
            >
              {t("eyebrow")}
            </span>
            <div className="h-px w-8 bg-[var(--lm-accent,#c9a96e)]" />
          </div>
          <h2
            className="text-[32px] lg:text-[48px] font-light leading-[1.1] text-[var(--lm-text,#fff)]"
            style={SERIF_FONT}
          >
            {t("titlePre")}{" "}
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]">{t("titleAccent")}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[2px]">
          {BENEFITS.map((benefit, i) => (
            <div
              key={benefit.id}
              className={cn("flex", reveal())}
              style={{ transitionDelay: `${120 + i * 80}ms` }}
            >
              <BenefitCard benefit={benefit} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
