"use client"

import { useScrollReveal } from "@/hooks/use-scroll-reveal"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useRef, useState } from "react"
import {
  ArrowRight,
  CircleCheckBig,
  ClipboardCheck,
  FileText,
  Users,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAutoScrollMarquee } from "@/hooks/use-auto-scroll-marquee"

const SERIF_FONT = {
  fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
} as const

const SANS_FONT = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
} as const

type Step = {
  num: string
  Icon: LucideIcon
  heading: string
  body: string
}

function StepCard({ step }: { step: Step }) {
  const { Icon } = step
  return (
    <div className="bg-[rgba(var(--lm-text-rgb,255,255,255),0.03)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] transition-colors duration-200 p-6 flex flex-col gap-3 w-[317px] lg:w-auto lg:flex-1 shrink-0 self-stretch">
      <p
        className="text-[48px] font-medium leading-none text-[rgba(var(--lm-text-rgb,255,255,255),0.12)]"
        style={SERIF_FONT}
      >
        {step.num}
      </p>
      <div className="size-11 flex items-center justify-center bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.18)]">
        <Icon className="size-[18px] text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]" strokeWidth={1.75} />
      </div>
      <h3
        className="text-[14px] font-bold text-[var(--lm-text,#fff)] leading-normal"
        style={SANS_FONT}
      >
        {step.heading}
      </h3>
      <p
        className="text-[14px] leading-[1.2] text-[rgba(var(--lm-text-rgb,255,255,255),0.4)]"
        style={SANS_FONT}
      >
        {step.body}
      </p>
    </div>
  )
}

function ArrowConnector({ leftPercent }: { leftPercent: number }) {
  return (
    <div
      className="hidden lg:flex absolute size-8 bg-[var(--lm-surface,#1c1b18)] items-center justify-center pointer-events-none -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${leftPercent}%`, top: "50%" }}
    >
      <ArrowRight className="size-[18px] text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]" strokeWidth={2} />
    </div>
  )
}

export function QualityProcess() {
  const { ref, reveal } = useScrollReveal<HTMLDivElement>()

  const t = useTranslations("whitelabel.qualityProcess")
  const marqueeRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  useAutoScrollMarquee(marqueeRef, { activeBelow: 1024 })

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    if (headerRef.current) observer.observe(headerRef.current)
    return () => observer.disconnect()
  }, [])

  const steps: Step[] = [
    {
      num: "01",
      Icon: Users,
      heading: t("step1.heading"),
      body: t("step1.body"),
    },
    {
      num: "02",
      Icon: FileText,
      heading: t("step2.heading"),
      body: t("step2.body"),
    },
    {
      num: "03",
      Icon: ClipboardCheck,
      heading: t("step3.heading"),
      body: t("step3.body"),
    },
    {
      num: "04",
      Icon: CircleCheckBig,
      heading: t("step4.heading"),
      body: t("step4.body"),
    },
  ]

  return (
    <section className="bg-[var(--lm-bg,#0d0d0d)] px-4 lg:px-[82px] pt-8 lg:pt-10 pb-8 lg:pb-20">
      <div ref={ref} className={cn("max-w-[1280px] mx-auto flex flex-col gap-10 lg:gap-[52px]", reveal())}>
        <div
          ref={headerRef}
          className={`flex flex-col gap-4 items-center text-center transition-opacity duration-700 ease-out ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
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
            className="text-[36px] lg:text-[48px] font-light leading-[1.05] text-[var(--lm-text,#fff)]"
            style={SERIF_FONT}
          >
            {t("titlePre")}{" "}
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]">{t("titleAccent")}</span>
          </h2>
          <p
            className="text-[16px] lg:text-[18px] leading-[1.3] text-[rgba(var(--lm-text-rgb,255,255,255),0.55)] max-w-[926px]"
            style={SANS_FONT}
          >
            {t("subtitle")}
          </p>
        </div>

        <div className="relative">
          <div
            ref={marqueeRef}
            className="flex gap-[3px] lg:items-stretch overflow-x-auto lg:overflow-visible scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0"
          >
            {steps.map((step, i) => (
              <StepCard key={`primary-${i}`} step={step} />
            ))}
            <div className="lg:hidden flex gap-[3px]" aria-hidden>
              {steps.map((step, i) => (
                <StepCard key={`clone-${i}`} step={step} />
              ))}
            </div>
          </div>

          <ArrowConnector leftPercent={25} />
          <ArrowConnector leftPercent={50} />
          <ArrowConnector leftPercent={75} />
        </div>
      </div>
    </section>
  )
}
