"use client"

import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, Check } from "lucide-react"
import { useMoney } from "@/components/currency-provider"

/*
 * A escolha das saídas de um evento partilhado (E3A): a ida, o regresso ou
 * os dois, cada um com o seu dia e hora. O preço por pessoa é a soma das
 * duas. Uma saída sem lugares para o grupo não se pode escolher. As regras
 * são as do servidor (convex/lib/saidas.ts), que volta a conferir tudo.
 */

export type SaidaPublica = {
  id: string
  sentido: "ida" | "regresso"
  partida: number
  origem: string
  destino: string
  preco: number
  livres: number
}

export type EscolhaDeSaidas = { ida?: SaidaPublica; regresso?: SaidaPublica }

export function EscolhaSaidas({
  saidas,
  escolha,
  aoMudar,
  pessoas,
}: {
  saidas: SaidaPublica[]
  escolha: EscolhaDeSaidas
  aoMudar: (e: EscolhaDeSaidas) => void
  pessoas: number
}) {
  const t = useTranslations("tourDetails.departures")
  const locale = useLocale()
  const { format } = useMoney()
  const quando = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Lisbon",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

  if (saidas.length === 0) {
    return <p className="text-[13px] text-[var(--lm-muted,#999)]">{t("none")}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {(["ida", "regresso"] as const).map((sentido) => {
        const daqui = saidas.filter((s) => s.sentido === sentido).sort((a, b) => a.partida - b.partida)
        if (daqui.length === 0) return null
        const escolhida = escolha[sentido]
        return (
          <fieldset key={sentido} className="flex flex-col gap-2">
            <legend className="mb-2 flex w-full items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[1.35px] text-[var(--lm-muted,#999)]">
                {sentido === "ida" ? t("outbound") : t("return")}
              </span>
              {escolhida && (
                <button
                  type="button"
                  onClick={() => aoMudar({ ...escolha, [sentido]: undefined })}
                  className="text-[12px] text-[var(--lm-muted,#999)] underline underline-offset-2 hover:text-[var(--lm-text,#fff)]"
                >
                  {sentido === "ida" ? t("noOutbound") : t("noReturn")}
                </button>
              )}
            </legend>
            {daqui.map((s) => {
              const on = escolhida?.id === s.id
              const semLugar = s.livres < Math.max(1, pessoas)
              /* O regresso antes da ida escolhida (ou a ida depois do regresso)
                 não se pode juntar: o servidor recusava. */
              const outra = sentido === "ida" ? escolha.regresso : escolha.ida
              const foraDeOrdem = outra ? (sentido === "ida" ? s.partida >= outra.partida : s.partida <= outra.partida) : false
              const desligada = !on && (semLugar || foraDeOrdem)
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  disabled={desligada}
                  onClick={() => aoMudar({ ...escolha, [sentido]: on ? undefined : s })}
                  className={[
                    "flex w-full items-start gap-3 border px-[13px] py-[10px] text-left transition-colors duration-150",
                    on
                      ? "border-[var(--lm-accent,#C9A96E)] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
                      : "border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] bg-[var(--lm-surface,#1E1D1B)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)]",
                    desligada ? "cursor-not-allowed opacity-45" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-full border",
                      on ? "border-[var(--lm-accent,#C9A96E)] bg-[var(--lm-accent,#C9A96E)]" : "border-[rgba(var(--lm-text-rgb,255,255,255),0.3)]",
                    ].join(" ")}
                    aria-hidden
                  >
                    {on && <Check className="size-3 text-[var(--lm-bg,#0D0D0D)]" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-[var(--lm-text,#fff)]">{maiuscula(quando.format(s.partida))}</span>
                    <span className="mt-[2px] flex flex-wrap items-center gap-x-1 text-[12px] text-[var(--lm-muted,#999)]">
                      {s.origem}
                      <ArrowRight className="size-3" aria-hidden />
                      {s.destino}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[14px] font-semibold text-[var(--lm-text,#fff)]">{format(s.preco)}</span>
                    <span className={["block text-[11px]", s.livres === 0 ? "text-[#E5484D]" : "text-[var(--lm-muted,#999)]"].join(" ")}>
                      {s.livres === 0
                        ? t("soldOut")
                        : foraDeOrdem && !on
                          ? sentido === "ida"
                            ? t("afterReturn")
                            : t("beforeOutbound")
                          : t("seatsLeft", { count: s.livres })}
                    </span>
                  </span>
                </button>
              )
            })}
          </fieldset>
        )
      })}
      {!escolha.ida && !escolha.regresso && <p className="text-[12px] text-[var(--lm-muted,#999)]">{t("pickOne")}</p>}
    </div>
  )
}

/* Só a primeira letra: o "capitalize" do CSS punha "9 De Jul." em português. */
function maiuscula(t: string) {
  return t.charAt(0).toLocaleUpperCase() + t.slice(1)
}
