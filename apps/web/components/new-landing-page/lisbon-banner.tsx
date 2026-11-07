"use client"

import { useEffect, useRef } from "react"
import { cdn } from "@/lib/cdn"

/**
 * Este vídeo tem 43 MB e está a meio da página: com autoPlay e sem preload
 * definido, o browser começava a descarregá-lo no carregamento, competindo com
 * o conteúdo que o visitante está mesmo a ver. Passa a arrancar quando entra no
 * ecrã, como o cinematic-banner já fazia.
 */
function useLazyVideo() {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        if (entry.isIntersecting) {
          void el.play().catch(() => {})
        } else {
          el.pause()
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return ref
}

export function LisbonBanner() {
  const videoRef = useLazyVideo()
  return (
    <section className="relative w-full py-[40px] md:py-[64px] px-0 overflow-hidden">
      {/* Video container: full width, fixed height, stretched horizontally */}
      <div className="relative w-full h-[280px] md:h-[400px] lg:h-[480px]">
        <video
          ref={videoRef}
          src={cdn("/video/ad.mp4")}
          loop
          playsInline
          muted
          preload="none"
          className="absolute inset-0 w-full h-full object-cover"
        >
          Your browser does not support the video tag.
        </video>
        {/* Faixa branca a vir de cima: 100% branco no topo (cobre o canto e o preto), depois gradiente */}
        <div className="absolute top-0 left-0 right-0 h-[120px] md:h-[56px] pointer-events-none" style={{ background: "linear-gradient(to bottom, white 0%, white 35%, rgba(var(--lm-text-rgb,255,255,255),0.6) 55%, transparent 100%)" }} />
        {/* Fade bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[48px] md:h-[40px] bg-gradient-to-t from-white via-[rgba(var(--lm-text-rgb,255,255,255),0.6)] to-transparent pointer-events-none" />
      </div>
    </section>
  )
}