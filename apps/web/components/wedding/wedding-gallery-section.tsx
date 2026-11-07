"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useSwipe } from "@/hooks/use-swipe"
import { cn } from "@workspace/ui/lib/utils"
import { cdn } from "@/lib/cdn"

const SERIF_FONT = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const
const SANS_FONT = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const

// Fotos de casamentos reais, com a zona em Portugal identificada ou atribuída.
type GalleryPhoto = {
  src: string
  /** Quando presente, o cartão mostra vídeo em vez da fotografia. */
  video?: string
  /** Sem `primary` não se desenha legenda nenhuma — é o caso dos vídeos. */
  primary?: string
  subtitle?: "Portugal"
  tagline?: string
}

const PHOTOS: readonly GalleryPhoto[] = [
  /* Os três primeiros são vídeos e não levam legenda. O `src` serve de chave
     na lista, que aparece três vezes no carrossel. */
  { src: "/wedding/recent/video-01.mp4", video: "/wedding/recent/video-01.mp4" },
  { src: "/wedding/recent/video-02.mp4", video: "/wedding/recent/video-02.mp4" },
  { src: "/wedding/recent/video-03.mp4", video: "/wedding/recent/video-03.mp4" },
  { src: "/wedding/recent/1055587.webp", primary: "Sintra", subtitle: "Portugal" },
  { src: "/wedding/recent/1528188276.webp", primary: "Lisboa", subtitle: "Portugal" },
  { src: "/wedding/recent/carro-casamento-classico.webp", primary: "Cascais", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-02-convidados-coach-quinta.webp", primary: "Alentejo", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-03-noiva-sai-v-class.webp", primary: "Sintra", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-04-noivos-beijo-classico-ribbons.webp", primary: "Óbidos", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-05-convidados-v-class-regaleira.webp", primary: "Sintra", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-06-noivo-padrinhos-s-class.webp", primary: "Cascais", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-08-saida-confetti-mercedes.webp", primary: "Lisboa", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-09-convidados-coach-vinha-douro.webp", primary: "Douro", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-10-noivos-banco-traseiro-mercedes.webp", primary: "Comporta", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-12-convoy-dois-mercedes-alameda.webp", primary: "Lisboa", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-13-noivos-caminham-calcada-mercedes.webp", primary: "Sintra", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-14-convidados-v-class-cascais-mar.webp", primary: "Cascais", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-18-mercedes-entrada-quinta-decor.webp", primary: "Alentejo", subtitle: "Portugal" },
  { src: "/wedding/recent/casamento-foto-frota.webp", primary: "Lisboa", subtitle: "Portugal" },
  { src: "/wedding/recent/casamentos.webp", primary: "Óbidos", subtitle: "Portugal" },
  { src: "/wedding/recent/cascais-wedding.webp", primary: "Cascais", subtitle: "Portugal" },
  { src: "/wedding/recent/comporta-wedding.webp", primary: "Comporta", subtitle: "Portugal" },
  { src: "/wedding/recent/foto-frota-casamento.webp", primary: "Sintra", subtitle: "Portugal" },
  { src: "/wedding/recent/foto-sintra-2.webp", primary: "Sintra", subtitle: "Portugal" },
  { src: "/wedding/recent/foto-sintra-3.webp", primary: "Sintra", subtitle: "Portugal" },
  { src: "/wedding/recent/foto-sintra.webp", primary: "Sintra", subtitle: "Portugal" },
  { src: "/wedding/recent/lisboa-wedding.webp", primary: "Lisboa", subtitle: "Portugal" },
  { src: "/wedding/recent/portfolio-wedding-02-vclass-coastal.webp", primary: "Arrábida", subtitle: "Portugal" },
  { src: "/wedding/recent/portfolio-wedding-03-chauffeur-sclass-palace.webp", primary: "Sintra", subtitle: "Portugal" },
  { src: "/wedding/recent/porto-wedding.webp", primary: "Porto", subtitle: "Portugal" },
  { src: "/wedding/recent/service-casamentos-eqs-arrival.webp", primary: "Sintra", subtitle: "Portugal" },
  { src: "/wedding/recent/wedding-car.webp", primary: "Algarve", subtitle: "Portugal" },
  { src: "/wedding/recent/wedding-van.webp", primary: "Alentejo", subtitle: "Portugal" },
  { src: "/wedding/recent/wedding.webp", primary: "Óbidos", subtitle: "Portugal" },
]

function TiltCard({
  src,
  video,
  alt,
  primary,
  subtitle,
  tagline,
  className,
  restRotateY = 0,
}: {
  src: string
  video?: string
  alt: string
  primary?: string
  subtitle?: string
  tagline?: string
  /** Substitui o dimensionamento por omissão (usado para destacar o do meio). */
  className?: string
  /**
   * Rotação 3D em repouso. As laterais viram para dentro (aresta exterior
   * afastada), o centro fica direito. A inclinação do rato soma-se a esta.
   */
  restRotateY?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50 })

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    const ry = (x - 0.5) * 22
    const rx = -(y - 0.5) * 22
    setTilt({ rx, ry, mx: x * 100, my: y * 100 })
  }

  const onLeave = () => setTilt({ rx: 0, ry: 0, mx: 50, my: 50 })

  return (
    <div
      className={cn("relative min-w-0", className ?? "flex-1 self-stretch")}
      style={{ perspective: "1200px" }}
    >
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="group relative h-full w-full bg-white overflow-hidden shadow-[0_10px_30px_-10px_rgba(13,13,13,0.25)] hover:shadow-[0_40px_70px_-20px_rgba(13,13,13,0.5)]"
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${restRotateY + tilt.ry}deg)`,
          transformStyle: "preserve-3d",
          transition: "transform 350ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 350ms ease-out",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: "translateZ(0px)",
            transformStyle: "preserve-3d",
          }}
        >
          {video ? (
            /* Mudo e em ciclo: é decoração, não conteúdo com som. O browser
               só o põe a andar quando está à vista, por isso as cópias do
               carrossel que estão fora do ecrã não gastam nada. */
            <video
              src={cdn(video)}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={alt}
              className="absolute inset-0 h-full w-full object-cover select-none"
            />
          ) : (
          <Image
            src={cdn(src)}
            alt={alt}
            fill
            /* O cartão é retrato e há fotos horizontais: com object-cover corta-se
               a largura, por isso é preciso pedir bem mais px do que a largura do
               cartão — senão vinham imagens baixas e ampliadas. */
            sizes="(min-width: 768px) 80vw, 160vw"
            className="object-cover select-none"
            draggable={false}
            /* WebP já à medida — servidas directamente (ver testimonials). */
            unoptimized
          />
          )}
        </div>

        <div
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%)`,
            mixBlendMode: "overlay",
          }}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(13,13,13,0.78)] from-0% via-[rgba(13,13,13,0.25)] via-35% to-transparent to-65%" />

        {primary && (
        <div
          className="pointer-events-none absolute left-7 right-7 bottom-7 flex flex-col gap-1"
          style={{
            transform: `translate3d(${-(tilt.mx - 50) * 0.18}px, ${-(tilt.my - 50) * 0.18}px, 90px)`,
            transformStyle: "preserve-3d",
            transition: "transform 350ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <span
            className="text-[34px] md:text-[40px] leading-none font-semibold uppercase tracking-[2.5px] text-white drop-shadow-[0_6px_22px_rgba(0,0,0,0.65)]"
            style={SANS_FONT}
          >
            {primary}
          </span>
          {subtitle && (
            <span
              className="text-[14px] md:text-[15px] font-semibold uppercase tracking-[3.5px] text-white/85 drop-shadow-[0_3px_14px_rgba(0,0,0,0.6)]"
              style={SANS_FONT}
            >
              {subtitle}
            </span>
          )}
          {tagline && (
            <span
              className="mt-2 text-[14px] md:text-[15px] italic text-white/80 drop-shadow-[0_3px_14px_rgba(0,0,0,0.55)]"
              style={SERIF_FONT}
            >
              {tagline}
            </span>
          )}
        </div>
        )}
      </div>
    </div>
  )
}

function NavArrow({
  direction,
  onClick,
  disabled,
}: {
  direction: "left" | "right"
  onClick: () => void
  disabled?: boolean
}) {
  const Icon = direction === "left" ? ArrowLeft : ArrowRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Previous" : "Next"}
      className="size-12 border-[1.714px] border-[rgba(154,117,53,0.22)] flex items-center justify-center hover:border-[#a08248] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer"
    >
      <Icon className="size-[18px] text-[#a08248]" strokeWidth={1.5} />
    </button>
  )
}

function Dots({ pages, current }: { pages: number; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: pages }).map((_, i) => (
        <span
          key={i}
          className={`size-[5.352px] rounded-full transition-colors duration-300 ${
            i === current ? "bg-[#a08248]" : "bg-[rgba(168,131,58,0.3)]"
          }`}
        />
      ))}
    </div>
  )
}

function SectionHeading({
  eyebrow,
  headingStart,
  headingAccent,
}: {
  eyebrow: string
  headingStart: string
  headingAccent: string
}) {
  return (
    <div className="flex flex-col gap-2 items-center w-full">
      <div className="flex gap-2 items-center justify-center">
        <span className="h-px w-8 bg-[#a08248]" />
        <span
          className="text-[12px] font-semibold uppercase tracking-[2px] text-[#a08248] whitespace-nowrap"
          style={SANS_FONT}
        >
          {eyebrow}
        </span>
        <span className="h-px w-8 bg-[#a08248]" />
      </div>
      <h2
        className="text-[32px] md:text-[48px] leading-[1.1] font-normal text-[#1a1612] text-center"
        style={SERIF_FONT}
      >
        <span>{headingStart} </span>
        <span className="italic text-[#a08248]">{headingAccent}</span>
      </h2>
    </div>
  )
}

const N = PHOTOS.length
/** A lista aparece três vezes; andamos sempre pela cópia do meio, e ao sair
 *  dela saltamos de volta sem animação. Assim nunca há um lugar vazio nas
 *  pontas e o carrossel nunca para. */
const TRACK = [...PHOTOS, ...PHOTOS, ...PHOTOS]

export function WeddingGallerySection() {
  const t = useTranslations("wedding.gallery")
  const [index, setIndex] = useState(N)
  const [animate, setAnimate] = useState(true)

  const next = useCallback(() => {
    setAnimate(true)
    setIndex((i) => i + 1)
  }, [])
  const prev = useCallback(() => {
    setAnimate(true)
    setIndex((i) => i - 1)
  }, [])
  const swipe = useSwipe(next, prev)

  // Ao terminar a transição, se saímos da cópia do meio voltamos à posição
  // equivalente com a animação desligada — o salto é invisível.
  const handleTransitionEnd = useCallback(() => {
    setIndex((i) => {
      if (i >= 2 * N) {
        setAnimate(false)
        return i - N
      }
      if (i < N) {
        setAnimate(false)
        return i + N
      }
      return i
    })
  }, [])

  // Repõe a animação no frame seguinte ao salto.
  useEffect(() => {
    if (animate) return
    const id = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [animate])

  const current = ((index % N) + N) % N
  const slide = animate
    ? "transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
    : ""

  return (
    <section className="bg-[#f7f4ef] px-4 md:px-20 py-14 md:py-24">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-4 items-center">
        <SectionHeading
          eyebrow={t("eyebrow")}
          headingStart={t("headingStart")}
          headingAccent={t("headingAccent")}
        />

        {/* Faixa com TODAS as fotos que desliza. Antes desenhavam-se três com
            key={page}: cada passo desmontava e remontava os cartões, e a foto
            nova entrava em branco enquanto carregava — era esse o flash. Assim
            os cartões ficam montados e só se translada a faixa. A do meio
            domina: à altura toda; as laterais recolhem e viram para dentro. */}
        <div className="hidden md:block w-full pt-[42px] overflow-hidden">
          <div
            className={cn("flex items-center h-[608.21px]", slide)}
            style={{ transform: `translateX(${(1 - index) * (100 / 3)}%)` }}
            onTransitionEnd={handleTransitionEnd}
          >
            {TRACK.map((photo, i) => (
              <div
                key={`${photo.src}-${i}`}
                className="shrink-0 basis-1/3 h-full flex items-center px-[5px]"
              >
                <TiltCard
                  src={photo.src}
                  video={photo.video}
                  primary={photo.primary}
                  subtitle={photo.subtitle}
                  tagline={photo.tagline}
                  alt={t("photoAlt", { index: (i % N) + 1 })}
                  className={cn(
                    "w-full transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                    i === index ? "h-full" : "h-[86%]",
                  )}
                  // 6.1° dá o rácio 0.970 entre arestas medido na referência.
                  restRotateY={i === index ? 0 : i < index ? -6.1 : 6.1}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="md:hidden w-full pt-2 overflow-hidden" {...swipe}>
          <div
            className={cn("flex h-[531.21px]", slide)}
            style={{ transform: `translateX(-${index * 100}%)` }}
            onTransitionEnd={handleTransitionEnd}
          >
            {TRACK.map((photo, i) => (
              <div key={`${photo.src}-${i}`} className="relative shrink-0 basis-full h-full">
                <TiltCard
                  src={photo.src}
                  video={photo.video}
                  primary={photo.primary}
                  subtitle={photo.subtitle}
                  tagline={photo.tagline}
                  alt={t("photoAlt", { index: (i % N) + 1 })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 pt-2">
          <NavArrow direction="left" onClick={prev} />
          {/* Com esta quantidade de fotos, uma fila de pontos era só ruído. */}
          {N > 8 ? (
            <span
              className="text-[13px] tabular-nums tracking-[2px] text-[#a08248] select-none"
              style={SANS_FONT}
              aria-live="polite"
            >
              {String(current + 1).padStart(2, "0")} / {String(N).padStart(2, "0")}
            </span>
          ) : (
            <Dots pages={N} current={current} />
          )}
          <NavArrow direction="right" onClick={next} />
        </div>
      </div>
    </section>
  )
}
