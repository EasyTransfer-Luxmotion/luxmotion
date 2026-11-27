"use client"

import Image from "next/image"
import { User, Briefcase, Wifi, Leaf, Loader2 } from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "@workspace/convex/api"
import { useTranslations } from "next-intl"

export function FleetVehicles() {
  const t = useTranslations("fleetPage")
  const vehicles = useQuery(api.vehicles.listActive, {})

  if (vehicles === undefined) {
    return (
      <section className="py-[40px] md:py-[64px] px-4 md:px-8 lg:px-[60px] xl:px-[100px]">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-8">
          <Loader2 className="size-8 animate-spin text-[#27c7ff]" />
          <p className="text-[#7a7a7a] text-lg">{t("loading")}</p>
        </div>
      </section>
    )
  }

  if (vehicles.length === 0) {
    return (
      <section className="py-[40px] md:py-[64px] px-4 md:px-8 lg:px-[60px] xl:px-[100px]">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-4">
          <p className="text-[#7a7a7a] text-lg">{t("noVehicles")}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="py-[40px] md:py-[64px] px-4 md:px-8 lg:px-[60px] xl:px-[100px] bg-white">
      <div className="max-w-7xl mx-auto flex flex-col gap-8 md:gap-12">
        <div className="flex flex-col gap-3 items-center text-center">
          <h2 className="text-[28px] md:text-[36px] font-bold text-[#222222] leading-normal">
            {t("vehiclesTitle")}
          </h2>
          <p className="text-[#7a7a7a] text-md md:text-lg max-w-[700px] leading-[1.4]">
            {t("vehiclesSubtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
          {vehicles.map((vehicle) => (
            <div
              key={vehicle._id}
              className="bg-white rounded-2xl border-2 border-[#0E4659]/10 overflow-hidden hover:shadow-lg transition-all duration-300 group relative shadow-sm"
            >
              {vehicle.isElectric && (
                <div className="absolute left-0 top-4 z-10">
                  <div className="inline-flex items-center gap-1.5 bg-[#ABEDD5] text-[#008354] pl-3 pr-4 py-1.5 rounded-r-full text-sm font-medium">
                    {t("electricVehicle")}
                    <Leaf className="size-4 shrink-0" />
                  </div>
                </div>
              )}

              <div className={`relative w-full h-[180px] md:h-[200px] bg-gradient-to-b from-[#f8fbff] to-[#eef5fa] flex items-center justify-center ${vehicle.isElectric ? "pt-8" : "pt-4"} px-6`}>
                <Image
                  src={vehicle.imageUrl || "/shared/image-54.png"}
                  alt={vehicle.name}
                  width={320}
                  height={180}
                  className="w-auto h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
              </div>

              <div className="p-5 md:p-6 bg-white">
                <h3 className="text-xl md:text-2xl font-bold text-[#222222] mb-3">
                  {vehicle.name}
                </h3>
                <div className="flex items-center gap-2 flex-nowrap overflow-x-auto pb-0.5">
                  <div className="flex items-center gap-1.5 bg-[#E9F9FF] px-2.5 py-1.5 rounded-xl shrink-0">
                    <User className="w-4 h-4 text-[#0E4659] shrink-0" />
                    <span className="text-sm font-semibold text-[#0E4659]">{vehicle.passengers}</span>
                    <span className="text-[11px] text-[#0E4659]/70 hidden sm:inline">{t("passengers")}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#E9F9FF] px-2.5 py-1.5 rounded-xl shrink-0">
                    <Briefcase className="w-4 h-4 text-[#0E4659] shrink-0" />
                    <span className="text-sm font-semibold text-[#0E4659]">{vehicle.luggage}</span>
                    <span className="text-[11px] text-[#0E4659]/70 hidden sm:inline">{t("luggage")}</span>
                  </div>
                  {vehicle.hasWifi && (
                    <div className="flex items-center gap-1.5 bg-[#E9F9FF] px-2.5 py-1.5 rounded-xl shrink-0">
                      <Wifi className="w-4 h-4 text-[#0E4659] shrink-0" />
                      <span className="text-[11px] text-[#0E4659]/70">{t("wifi")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
