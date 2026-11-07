"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { cdn } from "@/lib/cdn"

export function FleetCta() {
  const t = useTranslations("fleetPage")

  return (
    <section className="py-[40px] md:py-[64px] px-4 md:px-8 lg:px-[60px] xl:px-[100px]">
      <div className="max-w-7xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0e4659] to-[#1a6b85] p-8 md:p-12 lg:p-16 flex flex-col items-center gap-6 text-center">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-10"
            style={{ backgroundImage: `url('${cdn("/fleet/tesla-bridge.webp")}')` }}
          />

          <div className="relative z-10 flex flex-col items-center gap-6">
            <h2 className="text-[28px] md:text-[40px] font-bold text-white leading-[1.2]">
              {t("ctaTitle")}
            </h2>
            <p className="text-white/80 text-[16px] md:text-[18px] max-w-[500px] leading-[1.4]">
              {t("ctaSubtitle")}
            </p>
            <Link
              href="/#booking"
              className="group flex items-center gap-3 pl-8 pr-6 py-4 bg-[#27c7ff] rounded-2xl shadow-[0px_4px_8px_rgba(0,0,0,0.1),0px_18px_20px_rgba(0,0,0,0.05)] hover:bg-[#20b8ef] transition-colors"
            >
              <span className="text-[16px] font-bold text-white uppercase tracking-[0.16px]">
                {t("ctaButton")}
              </span>
              <ArrowUpRight className="size-6 text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
