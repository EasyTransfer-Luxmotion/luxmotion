"use client"

import { useState } from "react"
import Image from "next/image"
import { ArrowRight, Calendar, CheckCircle2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMutation } from "convex/react"
import { api } from "@workspace/convex/api"
import { PhoneInput } from "@/components/ui/phone-input"
import { DateTimePicker } from "@/components/checkout/date-time-picker"
import { readReferralCookie } from "@/lib/referral"
import { medirPedidoDeOrcamento } from "@/lib/oaiq"
import { instanteDoRelogio } from "@/lib/hora-lisboa"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

// Por capacidade, do mais pequeno ao maior.
const VEHICLES = [
  { id: "standard" as const, image: "/fleet/cat-standard.webp" },
  { id: "executive" as const, image: "/fleet/cat-executivo.png" },
  { id: "van" as const, image: "/fleet/cat-van.webp" },
  { id: "minibus" as const, image: "/fleet/cat-minibus.png" },
  { id: "bus" as const, image: "/fleet/cat-bus.png" },
]

const BUDGET_MIN = 500
const BUDGET_MAX = 50000

type VehicleId = (typeof VEHICLES)[number]["id"]

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label
      className="text-[10px] font-semibold uppercase tracking-[1.35px] text-[#7a746e]"
      style={sans}
    >
      {children}
      {required && <span className="text-[#e32828]">*</span>}
    </label>
  )
}

function DarkInput({
  placeholder,
  type = "text",
  value,
  onChange,
  required,
}: {
  placeholder: string
  type?: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <div className="flex h-11 w-full items-center border border-[rgba(154,117,53,0.22)] bg-[#0D0D0D] px-3 py-[14px]">
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="flex-1 bg-transparent px-2 text-[14px] text-white placeholder:text-[#696969] focus:outline-none"
        style={sans}
      />
    </div>
  )
}

export function RequestProposal() {
  const t = useTranslations("corporatePage.requestProposal")
  const submit = useMutation(api.corporateRequests.submit)

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [eventDate, setEventDate] = useState<Date | undefined>(undefined)
  const [guests, setGuests] = useState("")
  const [budget, setBudget] = useState(BUDGET_MIN)
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleId>("standard")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (!fullName || !email || !phone || !companyName) {
      setError(t("errors.missing"))
      return
    }

    setSubmitting(true)
    try {
      await submit({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        companyName: companyName.trim(),
        // O selector dá a hora de Lisboa; getTime() gravava a mesma hora no
        // fuso do browser — horas ao lado para quem pedia do estrangeiro.
        eventDate: eventDate ? (instanteDoRelogio(eventDate) ?? undefined) : undefined,
        guests: guests ? Number(guests) : undefined,
        budget,
        vehicleType: selectedVehicle,
        notes: notes.trim() || undefined,
        referralSlug: readReferralCookie() ?? undefined,
      })
      /* Só aqui: a mutation já resolveu, ou seja o pedido está guardado. Antes
         disto — ao abrir o formulário, ao carregar em enviar — contaria leads
         que não existem. O `catch` abaixo não mede nada, de propósito. */
      medirPedidoDeOrcamento()
      setSubmitted(true)
    } catch (err) {
      console.error(err)
      setError(t("errors.generic"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      id="request-proposal"
      className="flex w-full flex-col items-center justify-center gap-9 bg-[var(--lm-bg,#F7F4EF)] px-4 py-10 md:px-[82px] md:py-[40px]"
    >
      <div className="flex w-full max-w-[1280px] flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2">
          <div className="h-px w-8 bg-[var(--lm-accent,#A08248)]" />
          <span
            className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#A08248))]"
            style={sans}
          >
            {t("eyebrow")}
          </span>
          <div className="h-px w-8 bg-[var(--lm-accent,#A08248)]" />
        </div>
        <h2
          className="text-[32px] leading-none text-[var(--lm-text,#0D0D0D)] md:text-[48px]"
          style={serif}
        >
          {t("titlePart1")}{" "}
          <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#A08248))]">{t("titleItalic1")}</span>{" "}
          <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#A08248))]">{t("titleItalic2")}</span>.
        </h2>
        <p
          className="text-[16px] leading-[1.3] text-[var(--lm-muted,#696969)] md:text-[18px]"
          style={sans}
        >
          {t("subtitleLine1")}
          <br />
          {t("subtitleLine2")}
        </p>
      </div>

      {/* O cartão do formulário é deliberadamente escuro nos dois temas: no
          claro destaca-se do creme, no escuro fica um degrau acima do fundo
          (#1e1d1b sobre #0d0d0d). Por isso o interior mantém as cores fixas. */}
      {submitted ? (
        <div
          className="relative flex w-full max-w-[900px] flex-col items-center gap-4 border border-[rgba(168,131,58,0.15)] bg-[#1e1d1b] px-6 py-16 text-center shadow-[0_4px_40px_0_rgba(0,0,0,0.07)] md:px-[48px]"
        >
          <div
            className="absolute inset-x-0 top-0 h-[2px]"
            style={{
              background:
                "linear-gradient(90deg, #a8833a 0%, rgba(201,169,110,0.2) 100%)",
            }}
          />
          <CheckCircle2 className="size-12 text-[#C9A96E]" strokeWidth={1.5} />
          <h3 className="text-[32px] leading-none text-white" style={serif}>
            {t("success.title")}
          </h3>
          <p className="max-w-[480px] text-[14px] leading-[1.5] text-[#999]" style={sans}>
            {t("success.body")}
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="relative flex w-full max-w-[900px] flex-col items-stretch gap-4 border border-[rgba(168,131,58,0.15)] bg-[#1e1d1b] px-6 pb-12 pt-[91px] shadow-[0_4px_40px_0_rgba(0,0,0,0.07)] md:px-[48px]"
        >
          <div
            className="absolute inset-x-0 top-[42px] h-[2px]"
            style={{
              background:
                "linear-gradient(90deg, #a8833a 0%, rgba(201,169,110,0.2) 100%)",
            }}
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex flex-col items-start gap-2">
              <FieldLabel required>{t("fields.fullName.label")}</FieldLabel>
              <DarkInput
                placeholder={t("fields.fullName.placeholder")}
                value={fullName}
                onChange={setFullName}
                required
              />
            </div>
            <div className="flex flex-col items-start gap-2">
              <FieldLabel required>{t("fields.email.label")}</FieldLabel>
              <DarkInput
                type="email"
                placeholder={t("fields.email.placeholder")}
                value={email}
                onChange={setEmail}
                required
              />
            </div>
            <div className="flex flex-col items-start gap-2">
              <FieldLabel required>{t("fields.phone.label")}</FieldLabel>
              <div className="w-full [&>div]:w-full">
                <PhoneInput
                  corporate
                  value={phone}
                  onChange={setPhone}
                  defaultCountry="pt"
                  placeholder="000 000 000"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex flex-col items-start gap-2">
              <FieldLabel required>{t("fields.companyName.label")}</FieldLabel>
              <DarkInput
                placeholder={t("fields.companyName.placeholder")}
                value={companyName}
                onChange={setCompanyName}
                required
              />
            </div>
            <div className="flex flex-col items-start gap-2">
              <FieldLabel required>{t("fields.eventDate.label")}</FieldLabel>
              <div className="flex h-11 w-full items-center border border-[rgba(154,117,53,0.22)] bg-[#0D0D0D] px-3">
                <div className="min-w-0 flex-1">
                  <DateTimePicker
                    variant="new-widget"
                    value={eventDate}
                    onChange={setEventDate}
                    placeholder={t("fields.eventDate.placeholder")}
                    label={t("fields.eventDate.label")}
                    hideLeftIcon
                  />
                </div>
                <Calendar className="size-4 shrink-0 text-[#C9A96E]" strokeWidth={1.5} />
              </div>
            </div>
            <div className="flex flex-col items-start gap-2">
              <FieldLabel required>{t("fields.guests.label")}</FieldLabel>
              <DarkInput
                type="number"
                placeholder={t("fields.guests.placeholder")}
                value={guests}
                onChange={setGuests}
              />
            </div>
          </div>

          <div className="flex flex-col items-start gap-2">
            <FieldLabel>{t("fields.budget.label")}</FieldLabel>
            <div className="flex w-full flex-col gap-2 bg-[#0D0D0D] px-4 py-3">
              <div className="flex items-end justify-between">
                <p className="text-[24px] leading-none text-[#C9A96E]" style={serif}>
                  €{budget.toLocaleString("en-US")}
                </p>
                <p className="text-[12px] text-[#999]" style={sans}>
                  {t("fields.budget.helper")}
                </p>
              </div>
              <input
                type="range"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={500}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="h-1 w-full cursor-pointer appearance-none bg-[#222] accent-[#C9A96E] [&::-webkit-slider-thumb]:size-[14px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#C9A96E]"
              />
              <div className="flex justify-between text-[12px] text-[#999]" style={sans}>
                <span>€500</span>
                <span>€25.000</span>
                <span>+€50.000</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2">
            <FieldLabel>{t("fields.vehicleType.label")}</FieldLabel>
            <div className="relative w-full">
              <div className="-mx-1 flex gap-[3px] overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {VEHICLES.map((v) => {
                  const isActive = selectedVehicle === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVehicle(v.id)}
                      className={`flex h-[134px] w-[158px] shrink-0 flex-col items-center gap-2 border px-3 py-4 transition-colors ${
                        isActive
                          ? "border-[#A08248] bg-[rgba(168,131,58,0.16)]"
                          : "border-[rgba(168,131,58,0.4)] bg-[rgba(168,131,58,0.08)] hover:bg-[rgba(168,131,58,0.12)]"
                      }`}
                    >
                      <div className="relative h-20 w-full">
                        <Image
                          src={v.image}
                          alt=""
                          fill
                          className="object-contain"
                          sizes="158px"
                        />
                      </div>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.72px] text-[#A08248]"
                        style={sans}
                      >
                        {t(`fields.vehicleType.options.${v.id}`)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2">
            <FieldLabel>{t("fields.notes.label")}</FieldLabel>
            <textarea
              placeholder={t("fields.notes.placeholder")}
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none border border-[rgba(154,117,53,0.22)] bg-[#0D0D0D] px-5 py-[14px] text-[14px] text-white placeholder:text-[#696969] focus:outline-none"
              style={sans}
            />
          </div>

          {error && (
            <p className="text-[12px] text-[#e32828]" style={sans} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-12 items-center justify-center bg-[#A08248] px-[22px] py-[9px] text-white transition-colors hover:bg-[#b89558] disabled:cursor-not-allowed disabled:opacity-60"
            style={sans}
          >
            <span className="text-[14px] font-medium uppercase tracking-[1.1px]">
              {submitting ? t("submitting") : t("submit")}
            </span>
            <ArrowRight className="ml-2 size-[14px]" strokeWidth={2} />
          </button>
        </form>
      )}
    </section>
  )
}
