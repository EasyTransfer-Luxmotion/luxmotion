"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { cdn } from "@/lib/cdn"

/**
 * Vídeo de fundo, mudo e em ciclo. Só arranca quando entra no ecrã — e pára
 * ao sair, para não estar a descodificar fora de vista (bateria/rede).
 */
function CinematicVideo({ label }: { label: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        if (entry.isIntersecting) {
          // play() rejeita se o browser bloquear — mudo, não deve acontecer.
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

  return (
    <video
      ref={ref}
      className="absolute inset-0 h-full w-full object-cover"
      src={cdn("/video/home-cinematic.mp4")}
      poster={cdn("/video/home-cinematic-poster.webp")}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={label}
    />
  )
}

export function CinematicBanner() {
  const t = useTranslations("cinematicBanner")

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(to right, #0a0a0a 0%, #1a1005 50%, #0a0a0a 100%)",
      }}
    >
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[1535px] h-[960px] pointer-events-none select-none">
        <Image
          src={cdn("/home/cinematic/lines-grid.svg")}
          alt=""
          fill
          className="object-cover"
          unoptimized
          aria-hidden
        />
      </div>

      <div className="relative w-full h-[340px] md:h-[480px] lg:h-[590px] pointer-events-none select-none">
        <div className="absolute inset-0">
          <CinematicVideo label={t("photoAlt")} />
        </div>
        {/* Fundido a subir: o vídeo dissolve-se no fundo da secção em vez de
            acabar num corte reto por cima do texto. */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.75) 35%, rgba(10,10,10,0) 100%)",
          }}
        />
      </div>

      <div className="relative z-10 px-6 md:px-12 lg:px-[82px] pt-10 md:pt-12 lg:pt-[39px] pb-12 md:pb-16 lg:pb-[39px]">
        <div className="relative max-w-[1440px] mx-auto flex flex-col lg:flex-row lg:items-center gap-8 lg:gap-12">
          <div
            className="flex flex-col lg:flex-1"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            {/* Champanhe: a meio caminho entre o branco e o dourado da linha
                seguinte. Cor fixa, não --lm-text — a faixa é escura nos dois
                temas e no claro o token é escuro, fazendo sumir o texto. */}
            <p className="font-light text-[32px] md:text-[40px] leading-none text-[#E4D5B7]">
              {t("line1")}
            </p>
            <p className="font-light italic text-[32px] md:text-[40px] leading-none text-[var(--lm-accent,#C9A96E)]">
              {t("line2")}
            </p>
          </div>

          <Link
            href="/tours"
            className="group inline-flex items-center justify-center h-12 border border-[var(--lm-accent,#C9A96E)] px-[22px] py-[9px] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] transition-colors w-full lg:w-fit shrink-0 self-stretch lg:self-auto"
          >
            <span
              className="px-2 text-[14px] tracking-[1.1px] uppercase text-[var(--lm-accent,#C9A96E)] font-medium whitespace-nowrap"
              style={{ fontFamily: "var(--font-sans), Inter, system-ui, sans-serif" }}
            >
              {t("cta")}
            </span>
            <ArrowRight
              className="size-[18px] text-[var(--lm-accent,#C9A96E)] transition-transform group-hover:translate-x-1"
              strokeWidth={1.5}
            />
          </Link>
        </div>
      </div>
    </section>
  )
}
