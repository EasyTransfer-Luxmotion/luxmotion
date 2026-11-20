"use client"

import Image from "next/image"
import { useTranslations } from "next-intl"

const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const
type Row = { eyebrow: string; title: string; accent: string; body: string[] }

function TextCell({ row }: { row: Row }) {
  return (
    <div className="flex flex-col justify-center gap-5 bg-[var(--lm-bg,#0D0D0D)] px-7 py-10 md:px-12 md:py-14">
      <span className="flex items-center gap-2 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
        <span className="h-px w-6 bg-[var(--lm-accent,#C9A96E)]" />
        {row.eyebrow}
      </span>
      <h3 className="text-[30px] leading-[1.12] text-[var(--lm-text,#fff)] md:text-[36px]" style={serif}>
        {row.title} <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{row.accent}</span>
      </h3>
      <div className="flex flex-col gap-3.5">
        {row.body.map((p, i) => (
          <p key={i} className="font-sans text-[13.5px] leading-[1.55] text-[var(--lm-muted,#9a9a9a)]">
            {p}
          </p>
        ))}
      </div>
    </div>
  )
}

/* Painel dos wireframes: véu dourado sobre o fundo da secção, para continuar a
   destacar-se da célula de texto nos dois temas (areia no claro, castanho
   escuro no escuro). */
function MockupCell({ src, alt }: { src: string; alt: string }) {
  return (
    /* A imagem preenche a célula toda, sem margem. O `min-h` só conta em
       coluna única, onde a célula não tem irmã ao lado que lhe dê altura; em
       duas colunas é a célula de texto que manda. */
    <div className="relative min-h-[300px] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.1)] sm:min-h-[380px] lg:min-h-0">
      <Image src={src} alt={alt} fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
    </div>
  )
}

export function HotelsPlatform() {
  const t = useTranslations("hotels.platform")
  const rows = t.raw("rows") as Row[]

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] px-4 py-16 lg:py-20">
      <div className="mx-auto max-w-[1280px] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]">
        <div className="grid grid-cols-1 gap-px bg-[rgba(var(--lm-text-rgb,255,255,255),0.08)] lg:grid-cols-2">
          {rows[0] && <TextCell row={rows[0]} />}
          <MockupCell src="/hotels/platform-landing.webp" alt={rows[0]?.eyebrow ?? ""} />
          <MockupCell src="/hotels/platform-dashboard.webp" alt={rows[1]?.eyebrow ?? ""} />
          {rows[1] && <TextCell row={rows[1]} />}
          {rows[2] && <TextCell row={rows[2]} />}
          <MockupCell src="/hotels/platform-integration.webp" alt={rows[2]?.eyebrow ?? ""} />
        </div>
      </div>
    </section>
  )
}
