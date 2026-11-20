"use client"

import Image from "next/image"
import { useTranslations } from "next-intl"

const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const
/**
 * Os três ecrãs da parceria, pela ordem dos passos: a página de reserva com a
 * marca do hotel, o convite que o cliente recebe, e o dashboard.
 *
 * Caixa comum e `object-cover`, senão os três cartões ficavam com alturas
 * diferentes: as origens não têm a mesma proporção, porque o convite é um
 * telemóvel e é mais alto. 5:4 e não 4:3 — a 4:3 o convite perdia 15,6% em
 * cima e em baixo, e o telemóvel está centrado com pouca margem. A 5:4 o
 * pior caso desce para 9,9% e os outros dois pagam 6,7% nos lados, onde só
 * há fundo escuro.
 */
const PASSOS = [
  "/hotels/how/how-1-booking.webp",
  "/hotels/how/how-2-invite.webp",
  "/hotels/how/how-3-dashboard.webp",
] as const

function StepIllustration({ index, alt }: { index: number; alt: string }) {
  const src = PASSOS[index]
  if (!src) return null
  return (
    /* `-mx` cancela o padding do cartão: as imagens passam a ocupar a largura
       toda em vez de ficarem uma coluna estreita ao centro.

       `mix-blend-lighten` só no escuro. O fundo destas imagens é preto puro
       (#000 a #010102, medido), e sobre o cartão lia-se como um rectângulo mais
       escuro; o `lighten` deixa passar o cartão onde a imagem é mais escura do
       que ele, e não toca no resto. No tema claro seria o contrário — lavava a
       imagem toda — por isso fica de fora.

       A ampliação do hover vive aqui e não num invólucro: um `transform` num
       antepassado cria contexto de composição e o blend deixaria de ver o
       cartão por baixo. */
    <div className="relative -mx-7 aspect-[5/4] overflow-hidden transition-transform duration-300 ease-out group-hover:scale-[1.03] dark:mix-blend-lighten md:-mx-8">
      <Image src={src} alt={alt} fill sizes="(min-width:768px) 40vw, 100vw" className="object-cover" />
    </div>
  )
}
export function HotelsHow() {
  const t = useTranslations("hotels.how")
  const steps = t.raw("steps") as { title: string; body: string }[]

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] px-4 py-16 lg:py-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-12 flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
            <span className="font-sans text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
              {t("eyebrow")}
            </span>
            <div className="h-px w-8 bg-[var(--lm-accent,#C9A96E)]" />
          </div>
          <h2 className="text-[40px] leading-none text-[var(--lm-text,#f5f5f5)] md:text-[52px]" style={serif}>
            {t("titlePrefix")} <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("titleAccent")}</span>
          </h2>
          <p className="max-w-[720px] text-[16px] leading-[1.4] text-[var(--lm-text,#fff)]/55 md:text-[18px]">
            {t("subtitle")}
          </p>
        </div>

        <div className="border border-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]">
          <div className="grid grid-cols-1 gap-px bg-[rgba(var(--lm-text-rgb,255,255,255),0.08)] md:grid-cols-3">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="group flex cursor-default flex-col bg-[var(--lm-surface,#1a1a1a)] transition-all duration-300 ease-out hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)] hover:ring-1 hover:ring-inset hover:ring-[rgba(var(--lm-accent-rgb,201,169,110),0.22)]"
              >
                <div className="flex flex-col gap-6 px-7 pb-9 pt-7 md:px-8">
                  <span className="flex h-10 w-10 items-center justify-center border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] text-[17px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={serif}>
                    0{i + 1}
                  </span>
                  <StepIllustration index={i} alt={s.title} />
                </div>
                <div className="border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] px-7 py-6 md:px-8">
                  <h3 className="font-sans text-[15px] font-semibold text-[var(--lm-text,#fff)]">{s.title}</h3>
                  <p className="mt-2 font-sans text-[13px] leading-[1.45] text-[var(--lm-muted,#999)]">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonial */}
        <div
          className="relative mx-auto mt-16 max-w-[920px] overflow-hidden border border-[rgba(var(--lm-accent-rgb,201,169,110),0.14)] px-8 py-12 lg:px-16 lg:py-14"
          style={{
            background:
              "radial-gradient(120% 100% at 50% -10%, rgba(var(--lm-accent-rgb,201,169,110),0.10), transparent 55%), radial-gradient(90% 120% at 100% 100%, rgba(var(--lm-accent-rgb,201,169,110),0.05), transparent 50%), var(--lm-surface,#131210)",
          }}
        >
          <span aria-hidden className="absolute left-1/2 top-0 h-[3px] w-20 -translate-x-1/2 bg-[var(--lm-accent,#C9A96E)]" />
          <span aria-hidden className="absolute left-8 top-7 text-[60px] leading-none text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] lg:left-12" style={serif}>
            &ldquo;
          </span>
          <p className="mx-auto max-w-[760px] text-center text-[22px] italic leading-[1.5] text-[var(--lm-text,#fff)]/90 md:text-[26px]" style={serif}>
            {t("quote")}
          </p>
          <span aria-hidden className="absolute bottom-12 right-8 text-[60px] leading-none text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] lg:right-12" style={serif}>
            &rdquo;
          </span>
          <div className="mt-8 text-center">
            <p className="font-sans text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-text,#fff)]">{t("quoteRole")}</p>
            <p className="mt-1 font-sans text-[11px] uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("quoteCompany")}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
