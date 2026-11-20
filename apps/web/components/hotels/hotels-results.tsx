"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Check, Star, Quote, ArrowLeft, ArrowRight } from "lucide-react"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

type Stat = { value: string; label: string }
type Column = { title: string; items: string[] }
type Case = {
  /** Fotografia do hotel deste caso. */
  photo: string
  name: string
  stars: string
  rooms: string
  profile: string[]
  quote: string
  quoteAuthor: string
  stats: Stat[]
  columns: Column[]
  activatedBold: string
  activatedRest: string
}

export function HotelsResults() {
  const t = useTranslations("hotels.results")
  const cases = t.raw("cases") as Case[]
  const [idx, setIdx] = useState(0)
  /* De que lado entra o caso seguinte. Sem isto a transição era igual nos dois
     sentidos e a seta para trás parecia avançar. */
  const [direcao, setDireccao] = useState<1 | -1>(1)
  /* Índices já mostrados, para não pedir as seis fotografias de uma vez. */
  const [vistos, setVistos] = useState<number[]>([0])
  const total = cases.length

  useEffect(() => {
    setVistos((v) => (v.includes(idx) ? v : [...v, idx]))
  }, [idx])

  const ir = (destino: number, sentido: 1 | -1) => {
    setDireccao(sentido)
    setIdx(destino)
  }
  const go = (d: number) => ir((idx + d + total) % total, d >= 0 ? 1 : -1)

  if (total === 0) return null

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] px-4 py-16 lg:px-12 lg:py-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
            <span className="font-sans text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("eyebrow")}</span>
            <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
          </div>
          <h2 className="text-[40px] leading-none text-[var(--lm-text,#f5f5f5)] md:text-[52px]" style={serif}>
            {t("titlePrefix")} <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("titleAccent")}</span> {t("titleSuffix")}
          </h2>
        </div>

        {/* Os seis casos ocupam a mesma célula da grelha: a altura do bloco
            passa a ser a do maior e deixa de saltar ao mudar de caso, e é isto
            que torna a transição possível — os dois estão no sítio ao mesmo
            tempo. Escalonada de propósito: o que sai desaparece em 150ms e o
            que entra só começa aí, senão viam-se os dois a meio tom, um por
            cima do outro. */}
        <div className="grid">
          {cases.map((caso, i) => {
            const activo = i === idx
            return (
              <div
                key={caso.photo + i}
                aria-hidden={!activo}
                inert={!activo}
                className={`col-start-1 row-start-1 transition-[opacity,translate] ease-out motion-reduce:transition-none ${
                  activo
                    ? "translate-x-0 opacity-100 delay-150 duration-300"
                    : `pointer-events-none opacity-0 duration-150 ${
                        direcao === 1 ? "translate-x-4" : "-translate-x-4"
                      }`
                }`}
              >
            {/* `h-full`: a célula da grelha tem a altura do caso mais alto, mas
                sem isto o cartão desenhado mantinha a sua altura natural lá
                dentro — e era essa que se via a variar. */}
            <div className="grid h-full grid-cols-1 overflow-hidden border border-[rgba(var(--lm-accent-rgb,201,169,110),0.18)] lg:min-h-[830px] lg:grid-cols-[0.88fr_1.6fr]">
              {/* LEFT — perfil do hotel por cima da fotografia: o contraste vem do
                  véu escuro sobre a foto, não do tema, por isso fica fixo. */}
              <div className="relative flex min-h-[540px] flex-col gap-5 p-6 lg:p-7">
                {/* A fotografia acompanha o caso — era a mesma para os seis. */}
                {/* Só as fotografias já mostradas: empilhar seis <Image> punha
                    o browser a descarregar as seis de uma vez. */}
                {vistos.includes(i) && (
                  <Image src={caso.photo} alt="" fill className="object-cover" sizes="(min-width:1024px) 35vw, 100vw" />
                )}
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(180deg, rgba(13,13,13,0.78) 0%, rgba(13,13,13,0.55) 40%, rgba(13,13,13,0.92) 100%)" }}
                />
                <div className="relative z-[1] flex h-full flex-col gap-5">
                  <span className="self-start bg-[#C9A96E] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[1.4px] text-[#1a1510]" style={sans}>
                    {t("badge")}
                  </span>

                  <div className="flex flex-col gap-1.5">
                    <h3 className="flex items-center gap-2 text-[25px] leading-none text-white md:text-[28px]" style={serif}>
                      {caso.stars ? (
                        <span className="flex items-center gap-1.5">
                          {caso.stars}
                          <Star className="h-[18px] w-[18px] text-[#C9A96E]" fill="#C9A96E" strokeWidth={0} />
                          <span>·</span>
                        </span>
                      ) : null}
                      <span>{caso.rooms}</span>
                    </h3>
                    <span className="text-[15px] font-medium text-[#dcd6c9]" style={sans}>{caso.name}</span>
                  </div>

                  <div className="h-px w-full bg-[rgba(201,169,110,0.25)]" />

                  <span className="text-[12px] font-semibold uppercase tracking-[1.5px] text-[#C9A96E]" style={sans}>{t("profileLabel")}</span>
                  <ul className="flex flex-col gap-2.5">
                    {caso.profile.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-[14px] text-[#d8d3c8]" style={sans}>
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A96E]" strokeWidth={2} />
                        {p}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto border border-[rgba(201,169,110,0.22)] bg-[rgba(0,0,0,0.5)] p-5 backdrop-blur-sm">
                    <Quote className="h-6 w-6 text-[#C9A96E]" fill="#C9A96E" strokeWidth={0} />
                    <p className="mt-2 text-[14px] leading-[1.5] text-[#cfcabf]" style={sans}>{caso.quote}</p>
                    <p className="mt-3 text-[12px] text-[#8c8680]" style={sans}>{caso.quoteAuthor}</p>
                  </div>
                </div>
              </div>

              {/* RIGHT — results */}
              <div className="flex flex-col gap-5 border-t border-[rgba(var(--lm-accent-rgb,201,169,110),0.12)] bg-[var(--lm-bg,#0f0d0a)] p-6 lg:border-l lg:border-t-0 lg:p-8">
                {/* stat bar */}
                <div className="border border-[rgba(var(--lm-accent-rgb,201,169,110),0.18)] px-5 py-6">
                  <span className="text-[11px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={sans}>{t("statsLabel")}</span>
                  <div className="mt-5 grid grid-cols-2 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-[rgba(var(--lm-text-rgb,255,255,255),0.08)]">
                    {caso.stats.map((s) => (
                      <div key={s.label} className="flex flex-col items-center gap-1.5 px-2 text-center lg:px-3">
                        <span className="text-[30px] leading-none text-[var(--lm-accent-text,var(--lm-accent,#dcc99e))] md:text-[34px]" style={serif}>{s.value}</span>
                        <span className="text-[11px] leading-[1.3] text-[var(--lm-muted,#9a9a9a)]" style={sans}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3 columns */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {caso.columns.map((col) => (
                    <div key={col.title} className="border border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] p-5">
                      <h4 className="mb-5 text-[18px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={sans}>{col.title}</h4>
                      <ul className="flex flex-col gap-3.5">
                        {col.items.map((it, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-[13px] leading-[1.4] text-[var(--lm-muted,#b8b3a9)]" style={sans}>
                            <Check className="mt-[3px] h-[14px] w-[14px] shrink-0 text-[var(--lm-accent,#C9A96E)]" strokeWidth={1.75} />
                            {it}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* activation bar */}
                <div className="mt-auto border border-[rgba(var(--lm-accent-rgb,201,169,110),0.35)] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.05)] py-3.5 text-center">
                  <span className="text-[12px] uppercase tracking-[1.5px] text-[var(--lm-muted,#8c8680)]" style={sans}>
                    <span className="font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{caso.activatedBold}</span> {caso.activatedRest}
                  </span>
                </div>
              </div>
            </div>
              </div>
            )
          })}
        </div>

        {/* carousel controls */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            className="flex h-11 w-11 items-center justify-center border border-[rgba(var(--lm-accent-rgb,201,169,110),0.35)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
            aria-label="Previous case"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 px-2">
            {cases.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => ir(i, i > idx ? 1 : -1)}
                aria-label={`Case ${i + 1}`}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${i === idx ? "bg-[var(--lm-accent,#C9A96E)]" : "bg-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.6)]"}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            className="flex h-11 w-11 items-center justify-center border border-[rgba(var(--lm-accent-rgb,201,169,110),0.35)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
            aria-label="Next case"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  )
}
