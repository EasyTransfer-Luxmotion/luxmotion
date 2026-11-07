"use client"
import { cdn } from "@/lib/cdn"

export function LisbonBanner() {
  return (
    <section
      data-theme-color="lisbonBannerBg"
      className="relative w-full py-[40px] md:py-[64px] px-0 overflow-hidden"
      style={{ backgroundColor: "var(--theme-lisbon-banner-bg, #ffffff)" }}
    >
      {/* Video container: full width, fixed height, stretched horizontally */}
      <div className="relative w-full h-[280px] md:h-[400px] lg:h-[480px]">
        <video
          src={cdn("/video/ad.mp4")}
          loop
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        >
          Your browser does not support the video tag.
        </video>
        {/* Faixa branca a vir de cima: 100% branco no topo (cobre o canto e o preto), depois gradiente */}
        <div
          data-theme-color="lisbonBannerTopFade"
          className="absolute top-0 left-0 right-0 h-[120px] md:h-[56px] pointer-events-none"
          style={{ background: "linear-gradient(to bottom, var(--theme-lisbon-banner-top-fade, #ffffff) 0%, var(--theme-lisbon-banner-top-fade, #ffffff) 35%, color-mix(in srgb, var(--theme-lisbon-banner-top-fade, #ffffff) 60%, transparent) 55%, transparent 100%)" }}
        />
        {/* Fade bottom */}
        <div
          data-theme-color="lisbonBannerBottomFade"
          className="absolute bottom-0 left-0 right-0 h-[48px] md:h-[40px] pointer-events-none"
          style={{ background: "linear-gradient(to top, var(--theme-lisbon-banner-bottom-fade, #ffffff), color-mix(in srgb, var(--theme-lisbon-banner-bottom-fade, #ffffff) 60%, transparent), transparent)" }}
        />
      </div>
    </section>
  )
}
