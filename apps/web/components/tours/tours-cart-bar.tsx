"use client"

import { useEffect, useRef } from "react"
import { ArrowRight, X } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useTourCheckout } from "@/components/tours/tour-checkout-context"
import { clearTourCart, formatCountdown, useTourCart } from "@/lib/tour-cart"

const SANS_FONT = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const SERIF_FONT = {
  fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
} as const

function Diamond() {
  return (
    <span aria-hidden className="mx-2 text-[6px] text-[rgba(var(--lm-accent-rgb,201,169,110),0.6)]">
      ◆
    </span>
  )
}

/** "Sintra, Cascais e Estoril" → a última palavra sai em itálico dourado. */
function SplitTitle({ title }: { title: string }) {
  const trimmed = title.trim()
  const cut = trimmed.lastIndexOf(" ")
  if (cut <= 0) return <span className="text-[var(--lm-text,#fff)]">{trimmed}</span>
  return (
    <>
      <span className="text-[var(--lm-text,#fff)]">{trimmed.slice(0, cut)} </span>
      <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{trimmed.slice(cut + 1)}</span>
    </>
  )
}

export function ToursCartBar() {
  const t = useTranslations("toursCartBar")
  const locale = useLocale()
  const { cart, secondsLeft } = useTourCart()
  const { openCheckout, isOpen, state } = useTourCheckout()
  const barRef = useRef<HTMLDivElement>(null)

  // Concluída a reserva, deixa de haver carrinho pendente.
  useEffect(() => {
    if (state.bookingNumber) clearTourCart()
  }, [state.bookingNumber])

  // Enquanto o checkout está aberto a barra só duplicava a informação do modal.
  const visible = Boolean(cart) && !isOpen

  // Publica a altura real da barra: o rodapé ganha essa margem em baixo e o
  // botão do WhatsApp sobe o mesmo, em vez de ficar por cima.
  //
  // Sem lista de dependências de propósito — `useTourCart` já repinta a cada
  // segundo por causa da contagem decrescente, por isso a medida corrige-se
  // sozinha. Um ResizeObserver seria mais elegante, mas obrigava a acertar
  // quando reobservar; assim não há evento nenhum que se possa perder.
  useEffect(() => {
    const root = document.documentElement
    const el = barRef.current
    root.style.setProperty(
      "--cart-bar-h",
      visible && el ? `${el.offsetHeight}px` : "0px",
    )
  })

  useEffect(
    () => () => {
      document.documentElement.style.setProperty("--cart-bar-h", "0px")
    },
    [],
  )

  if (!cart || isOpen) return null

  const { product, bookingData, productType } = cart
  const guests =
    bookingData.adults + bookingData.children + bookingData.infants

  const dateLabel = bookingData.date
    ? [
        bookingData.date.getDate(),
        bookingData.date.toLocaleDateString(locale, { month: "long" }),
        bookingData.date.getFullYear(),
      ]
        .join(" ")
        .toUpperCase()
    : null

  const total = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: product.currency || "EUR",
    maximumFractionDigits: 0,
  }).format(cart.bookingData.total || product.price * (guests || 1))

  const meta = (
    <>
      {/* Escondido no telemóvel: é a parte menos informativa e, sem ela, a data
          deixa de ser cortada a meio pelo espaço da contagem decrescente. */}
      <span className="hidden md:inline">
        {productType === "event" ? t("eventLabel") : t("tourLabel")}
      </span>
      <span className="hidden md:inline">
        <Diamond />
      </span>
      {dateLabel && <span>{dateLabel}</span>}
      {bookingData.time && (
        <>
          <Diamond />
          <span>{bookingData.time}</span>
        </>
      )}
      <Diamond />
      <span>{t("guests", { count: guests })}</span>
    </>
  )

  const countdown = (
    <div className="flex shrink-0 items-center gap-2.5 border border-[rgba(var(--lm-accent-rgb,201,169,110),0.45)] px-3 py-1.5 md:gap-3 md:px-4 md:py-2">
      <span
        className="text-[7px] uppercase leading-[1.35] tracking-[1.3px] text-[var(--lm-muted,#8A8377)] md:text-[8px] md:tracking-[1.6px]"
        style={SANS_FONT}
      >
        {t("heldLine1")}
        <br />
        {t("heldLine2")}
      </span>
      <span
        className="text-[17px] leading-none tracking-[1px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] tabular-nums md:text-[21px] md:tracking-[2px]"
        style={SERIF_FONT}
      >
        {formatCountdown(secondsLeft)}
      </span>
    </div>
  )

  const reopen = () => openCheckout(productType, product, bookingData)

  return (
    <div
      ref={barRef}
      className="fixed inset-x-0 bottom-0 z-[48] border-t border-[rgba(var(--lm-accent-rgb,201,169,110),0.55)] bg-[var(--lm-surface,#111110)]"
      role="region"
      aria-label={t("ariaLabel")}
    >
      <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-4 py-2.5 md:gap-6 md:px-6 md:py-3">
        {/* ── Desktop ─────────────────────────────────────────────── */}
        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <span className="h-[34px] w-px bg-[var(--lm-accent,#C9A96E)]" />
          <span className="flex flex-col gap-1">
            <span
              className="text-[9px] uppercase leading-none tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
              style={SANS_FONT}
            >
              {t("label")}
            </span>
            <span
              className="text-[8px] uppercase leading-none tracking-[1.6px] text-[var(--lm-muted,#6E675C)]"
              style={SANS_FONT}
            >
              {t("sublabel")}
            </span>
          </span>
        </div>

        <div className="hidden min-w-0 flex-1 flex-col gap-1 md:flex">
          <p
            className="truncate text-[21px] leading-none"
            style={SERIF_FONT}
          >
            <SplitTitle title={product.title} />
          </p>
          <p
            className="flex items-center truncate text-[9px] uppercase leading-none tracking-[1.5px] text-[var(--lm-muted,#8A8377)]"
            style={SANS_FONT}
          >
            {meta}
          </p>
        </div>

        <div className="hidden md:block">{countdown}</div>

        <div className="hidden shrink-0 flex-col items-end gap-1 md:flex">
          <span
            className="text-[8px] uppercase leading-none tracking-[1.6px] text-[var(--lm-muted,#6E675C)]"
            style={SANS_FONT}
          >
            {t("total")}
          </span>
          <span
            className="text-[23px] leading-none text-[var(--lm-text,#fff)]"
            style={SERIF_FONT}
          >
            {total}
          </span>
        </div>

        <button
          onClick={reopen}
          className="hidden shrink-0 items-center gap-3 bg-[var(--lm-accent,#C9A96E)] px-6 py-3.5 transition-colors hover:bg-[#b8954f] md:flex"
        >
          <span
            className="text-[11px] font-semibold uppercase leading-none tracking-[1.6px] text-[#0D0D0D]"
            style={SANS_FONT}
          >
            {t("cta")}
          </span>
          <ArrowRight className="size-[14px] text-[#0D0D0D]" strokeWidth={2} />
        </button>

        {/* ── Mobile ──────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 md:hidden">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <span
                className="text-[8px] uppercase leading-none tracking-[1.8px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
                style={SANS_FONT}
              >
                {t("label")}
              </span>
              <p
                className="mt-1.5 truncate text-[17px] leading-none"
                style={SERIF_FONT}
              >
                <SplitTitle title={product.title} />
              </p>
              <p
                className="mt-1.5 flex items-center truncate text-[8px] uppercase leading-none tracking-[1.2px] text-[var(--lm-muted,#8A8377)]"
                style={SANS_FONT}
              >
                {meta}
              </p>
            </div>
            {countdown}
          </div>

          <div className="flex items-center gap-3">
            <span className="flex shrink-0 flex-col gap-1">
              <span
                className="text-[7px] uppercase leading-none tracking-[1.6px] text-[var(--lm-muted,#6E675C)]"
                style={SANS_FONT}
              >
                {t("total")}
              </span>
              <span
                className="text-[19px] leading-none text-[var(--lm-text,#fff)]"
                style={SERIF_FONT}
              >
                {total}
              </span>
            </span>
            <button
              onClick={reopen}
              className="flex flex-1 items-center justify-center gap-2 bg-[var(--lm-accent,#C9A96E)] py-3 transition-colors active:bg-[#b8954f]"
            >
              <span
                className="text-[10px] font-semibold uppercase leading-none tracking-[1.4px] text-[#0D0D0D]"
                style={SANS_FONT}
              >
                {t("cta")}
              </span>
              <ArrowRight className="size-[13px] text-[#0D0D0D]" strokeWidth={2} />
            </button>
          </div>
        </div>

        <button
          onClick={clearTourCart}
          aria-label={t("dismiss")}
          className="shrink-0 self-start p-1 text-[var(--lm-muted,#6E675C)] transition-colors hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] md:self-center"
        >
          <X className="size-4" strokeWidth={1.6} />
        </button>
      </div>
    </div>
  )
}
