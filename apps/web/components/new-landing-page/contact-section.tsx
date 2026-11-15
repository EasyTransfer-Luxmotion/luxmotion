"use client"

import { useState } from "react"
import Image from "next/image"
import { Phone, Mail, Check, ShieldCheck } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@workspace/ui/lib/utils"
import { useMutation } from "convex/react"
import { api } from "@workspace/convex/api"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { PhoneInput } from "@/components/ui/phone-input"
import { CountryCombobox } from "@/components/ui/country-combobox"
import { DateTimePicker } from "@/components/checkout/date-time-picker"
import { readReferralCookie } from "@/lib/referral"
import { textoDoRelogio } from "@/lib/hora-lisboa"

const INPUT =
  "w-full h-[44px] bg-[var(--lm-surface,#1E1D1B)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] px-[13px] text-[14px] text-[var(--lm-text,#fff)] placeholder:text-[var(--lm-muted,#696969)] outline-none focus:border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] transition-colors"

const SELECT_TRIGGER =
  "w-full h-[44px] bg-[var(--lm-surface,#1E1D1B)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] px-[13px] text-[14px] text-[var(--lm-text,#fff)] data-[placeholder]:text-[var(--lm-muted,#696969)] rounded-none focus:ring-0 focus:border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] focus-visible:ring-0 transition-colors"

const SELECT_CONTENT =
  "bg-[var(--lm-surface,#1E1D1B)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] text-[var(--lm-text,#fff)] rounded-none"

const SELECT_ITEM =
  "text-[14px] text-[var(--lm-text,#fff)] data-[highlighted]:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.12)] data-[highlighted]:text-[var(--lm-text,#fff)] focus:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.12)] rounded-none cursor-pointer"

const BUDGET_MIN = 150
const BUDGET_MAX = 50000
const BUDGET_STEP = 50

const RANGE_THUMB =
  "absolute top-0 w-full h-[14px] bg-transparent appearance-none pointer-events-none cursor-pointer [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-[14px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--lm-accent,#C9A96E)] [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-[14px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--lm-accent,#C9A96E)] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"

function BudgetRange({
  min,
  max,
  onChange,
}: {
  min: number
  max: number
  onChange: (min: number, max: number) => void
}) {
  const pct = (v: number) => ((v - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100
  const labelFor = (v: number) =>
    v >= BUDGET_MAX ? "+€50000" : `€${v.toLocaleString("pt-PT")}`
  return (
    <div className="pt-2">
      <div className="relative h-7">
        {([
          [min, pct(min)],
          [max, pct(max)],
        ] as const).map(([v, p], i) => (
          <span
            key={i}
            className="pointer-events-none absolute -top-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--lm-accent,#C9A96E)] px-2 py-[2px] text-[11px] font-medium text-[#0D0D0D] shadow-[0_2px_8px_rgba(var(--lm-accent-rgb,201,169,110),0.35)]"
            style={{ left: `calc(${p}% + ${7 - (p / 100) * 14}px)` }}
          >
            {labelFor(v)}
          </span>
        ))}
      </div>
      <div className="relative h-[14px]">
        <div className="absolute top-1/2 -translate-y-1/2 h-[4px] w-full bg-[#222]" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[4px] bg-[var(--lm-accent,#C9A96E)]"
          style={{ left: `${pct(min)}%`, right: `${100 - pct(max)}%` }}
        />
        <input
          type="range"
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={BUDGET_STEP}
          value={min}
          onChange={(e) => onChange(Math.min(Number(e.target.value), max - BUDGET_STEP), max)}
          className={RANGE_THUMB}
        />
        <input
          type="range"
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={BUDGET_STEP}
          value={max}
          onChange={(e) => onChange(min, Math.max(Number(e.target.value), min + BUDGET_STEP))}
          className={RANGE_THUMB}
        />
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-[12px] text-[var(--lm-text,#fff)]">€{min.toLocaleString()}</span>
        <span className="text-[12px] text-[var(--lm-text,#fff)]">
          €{max.toLocaleString()}
          {max === BUDGET_MAX ? "+" : ""}
        </span>
      </div>
    </div>
  )
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label
      className="text-[12px] font-semibold text-[var(--lm-text,#F7F4EF)] leading-none"
      style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
    >
      {text}
      {required && <span className="text-[#E32828]">*</span>}
    </label>
  )
}

export function ContactSection() {
  const t = useTranslations("contact")
  const [form, setForm] = useState({
    name: "",
    email: "",
    country: "",
    phone: "",
    region: "",
    regionOther: "",
    date: "",
    flexibleDates: false,
    travelers: "",
    budgetMin: 150,
    budgetMax: 50000,
    interests: "",
    ageRange: "",
    newsletter: true,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitContact = useMutation(api.contactSubmissions.submit)

  const set = (key: string, val: string | boolean | number) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const parts = [
      form.country && `Country: ${form.country}`,
      form.region && `Region: ${form.region === "other" ? form.regionOther : form.region}`,
      // Era o ISO em UTC ("…T15:00:00.000Z" para as 10h00 de quem escolhia em
      // Nova Iorque). O selector já dá a hora de Lisboa: escreve-se essa.
      form.date && `Date: ${textoDoRelogio(new Date(form.date))} (Lisbon)`,
      form.flexibleDates && "Flexible dates: Yes",
      form.travelers && `Travelers: ${form.travelers}`,
      (form.budgetMin > 150 || form.budgetMax < 50000) &&
        `Budget/person: €${form.budgetMin}–€${form.budgetMax}`,
      form.interests && `Interests: ${form.interests}`,
      form.ageRange && `Age range: ${form.ageRange}`,
      form.newsletter && "Newsletter: Yes",
    ]
      .filter(Boolean)
      .join("\n")

    try {
      await submitContact({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        message: parts || "(no details)",
        referralSlug: readReferralCookie() ?? undefined,
      })
      toast.success(t("submitSuccess"))
      setForm({
        name: "", email: "", country: "", phone: "", region: "", regionOther: "",
        date: "", flexibleDates: false, travelers: "", budgetMin: 150, budgetMax: 50000,
        interests: "", ageRange: "", newsletter: true,
      })
    } catch {
      toast.error(t("submitError"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section id="contact" className="scroll-mt-[80px] bg-[var(--lm-bg,#0D0D0D)] pt-[100px] pb-[60px] px-4 md:px-[82px]">
      <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row items-stretch gap-0 md:gap-12">
        <div className="relative w-full md:flex-1 h-[300px] md:h-auto md:min-h-[800px] overflow-hidden">
          <Image
            src="/tours/contact-left.webp"
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[42%] to-[rgba(var(--lm-bg-rgb,0,0,0),0.74)] to-[82%]" />
          <div className="absolute bottom-6 left-6 right-6">
            <h2
              className="text-[48px] md:text-[96px] leading-[0.93] text-[var(--lm-text,#fff)] opacity-[0.68]"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              <span className="italic">{t("redesign.heroLine1")} </span>
              <span className="italic text-[var(--lm-accent,#C9A96E)]">{t("redesign.heroLine2")}</span>
            </h2>
          </div>
        </div>

        <div className="w-full md:w-[667px] shrink-0 py-10">
          <div className="flex flex-col gap-2 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-[82px] h-px bg-[var(--lm-accent,#C9A96E)]" />
              <span
                className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent,#C9A96E)]"
                style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              >
                {t("redesign.label")}
              </span>
            </div>
            <h3
              className="text-[32px] md:text-[48px] leading-[1.3] text-[var(--lm-text,#fff)] italic"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {t("redesign.heading")}
            </h3>
            <p
              className="text-[18px] text-[var(--lm-muted,#999)] leading-[1.3]"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {t("redesign.subtitle")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <Label text={t("redesign.form.name")} required />
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder={t("redesign.form.namePlaceholder")}
                  className={INPUT}
                />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <Label text={t("redesign.form.email")} required />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder={t("redesign.form.emailPlaceholder")}
                  className={INPUT}
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <Label text={t("redesign.form.country")} required />
                <CountryCombobox
                  value={form.country}
                  onChange={(v) => set("country", v)}
                  placeholder={t("redesign.form.countryPlaceholder")}
                  emptyLabel={t("redesign.form.countryPlaceholder")}
                  inputClassName="h-[44px] py-0 px-[13px] text-[14px] bg-[var(--lm-surface,#1E1D1B)] border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] placeholder:!text-[var(--lm-muted,#696969)] focus:border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)]"
                />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <Label text={t("redesign.form.phone")} required />
                <PhoneInput
                  dark
                  value={form.phone}
                  onChange={(v) => set("phone", v)}
                  placeholder={t("redesign.form.phonePlaceholder")}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label text={t("redesign.form.region")} required />
              <Select value={form.region} onValueChange={(v) => set("region", v)}>
                <SelectTrigger className={SELECT_TRIGGER}>
                  <SelectValue placeholder={t("redesign.form.regionPlaceholder")} />
                </SelectTrigger>
                <SelectContent className={SELECT_CONTENT}>
                  <SelectItem value="lisboa" className={SELECT_ITEM}>Lisboa</SelectItem>
                  <SelectItem value="porto" className={SELECT_ITEM}>Porto</SelectItem>
                  <SelectItem value="algarve" className={SELECT_ITEM}>Algarve</SelectItem>
                  <SelectItem value="alentejo" className={SELECT_ITEM}>Alentejo</SelectItem>
                  <SelectItem value="madeira" className={SELECT_ITEM}>Madeira</SelectItem>
                  <SelectItem value="acores" className={SELECT_ITEM}>Açores</SelectItem>
                  <SelectItem value="sintra" className={SELECT_ITEM}>Sintra</SelectItem>
                  <SelectItem value="ericeira" className={SELECT_ITEM}>Ericeira</SelectItem>
                  <SelectItem value="other" className={SELECT_ITEM}>{t("redesign.form.regionOther")}</SelectItem>
                </SelectContent>
              </Select>
              {form.region === "other" && (
                <input
                  type="text"
                  required
                  value={form.regionOther}
                  onChange={(e) => set("regionOther", e.target.value)}
                  placeholder={t("redesign.form.regionOtherPlaceholder")}
                  className={INPUT}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label text={t("redesign.form.date")} required />
              <div className="h-[44px] bg-[var(--lm-surface,#1E1D1B)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] px-[13px] flex items-center transition-colors focus-within:border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)]">
                <DateTimePicker
                  variant="new-widget"
                  hideLeftIcon
                  value={form.date || null}
                  onChange={(d) => set("date", d ? d.toISOString() : "")}
                  placeholder="00/00/0000"
                  label={t("redesign.form.datePlaceholder")}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <div
                className={cn(
                  "size-[18px] rounded-[2px] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex items-center justify-center transition-colors",
                  form.flexibleDates && "bg-[rgba(var(--lm-accent-rgb,154,117,53),0.22)]"
                )}
              >
                {form.flexibleDates && <Check className="size-[12px] text-[var(--lm-accent,#C9A96E)]" />}
              </div>
              <span className="text-[14px] text-[var(--lm-text,#fff)]">{t("redesign.form.flexibleDates")}</span>
              <input
                type="checkbox"
                checked={form.flexibleDates}
                onChange={(e) => set("flexibleDates", e.target.checked)}
                className="sr-only"
              />
            </label>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <Label text={t("redesign.form.travelers")} required />
                <input
                  type="number"
                  required
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={form.travelers}
                  onChange={(e) => set("travelers", e.target.value)}
                  placeholder={t("redesign.form.travelersPlaceholder")}
                  className={INPUT}
                />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <Label text={t("redesign.form.budget")} />
                <BudgetRange
                  min={form.budgetMin}
                  max={form.budgetMax}
                  onChange={(lo, hi) =>
                    setForm((prev) => ({ ...prev, budgetMin: lo, budgetMax: hi }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label text={t("redesign.form.interests")} required />
              <textarea
                required
                value={form.interests}
                onChange={(e) => set("interests", e.target.value)}
                placeholder={t("redesign.form.interestsPlaceholder")}
                className={cn(INPUT, "h-[170px] resize-none py-[14px]")}
              />
              <span className="text-[12px] font-light text-[var(--lm-muted,#696969)]">
                {t("redesign.form.interestsHelp")}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <Label text={t("redesign.form.ageRange")} />
              <Select value={form.ageRange} onValueChange={(v) => set("ageRange", v)}>
                <SelectTrigger className={SELECT_TRIGGER}>
                  <SelectValue placeholder={t("redesign.form.ageRangePlaceholder")} />
                </SelectTrigger>
                <SelectContent className={SELECT_CONTENT}>
                  <SelectItem value="1-30" className={SELECT_ITEM}>1-30</SelectItem>
                  <SelectItem value="18-30" className={SELECT_ITEM}>18-30</SelectItem>
                  <SelectItem value="30-50" className={SELECT_ITEM}>30-50</SelectItem>
                  <SelectItem value="50-65" className={SELECT_ITEM}>50-65</SelectItem>
                  <SelectItem value="65+" className={SELECT_ITEM}>65+</SelectItem>
                  <SelectItem value="mixed" className={SELECT_ITEM}>Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer bg-[rgba(var(--lm-accent-rgb,154,117,53),0.22)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] px-[13px] py-[14px]">
              <div
                className={cn(
                  "size-[18px] rounded-[2px] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex items-center justify-center shrink-0 transition-colors",
                  form.newsletter && "bg-[rgba(var(--lm-accent-rgb,154,117,53),0.22)]"
                )}
              >
                {form.newsletter && <Check className="size-[12px] text-[var(--lm-accent,#C9A96E)]" />}
              </div>
              <span className="text-[14px] text-[var(--lm-text,#fff)] leading-normal">
                {t("redesign.form.newsletter")}
              </span>
              <input
                type="checkbox"
                checked={form.newsletter}
                onChange={(e) => set("newsletter", e.target.checked)}
                className="sr-only"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-[48px] bg-[var(--lm-accent,#C9A96E)] border border-[var(--lm-accent,#C9A96E)] text-[14px] font-medium uppercase tracking-[1.1px] text-[#0D0D0D] hover:bg-[#b8954f] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(var(--lm-accent-rgb,201,169,110),0.35)] active:translate-y-0 active:scale-[0.99] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-300 ease-out"
            >
              {isSubmitting ? "..." : t("redesign.form.submit")}
            </button>

            <div className="group bg-[var(--lm-surface,#1E1D1B)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] p-6 flex gap-4 items-center hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] hover:shadow-[0_12px_34px_rgba(0,0,0,0.45)] hover:-translate-y-0.5 transition-all duration-300 ease-out">
              <div className="relative size-[80px] md:size-[114px] shrink-0 rounded-full overflow-hidden">
                <Image
                  src="/tours/support-avatar.webp"
                  alt="Carolina Pinheiro"
                  fill
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-[14px] font-bold text-[var(--lm-muted,#999)] leading-[1.3]">
                    {t("redesign.support.name")}
                  </span>
                  <span className="text-[12px] font-medium text-[var(--lm-muted,#999)] leading-[1.3]">
                    {t("redesign.support.role")}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <a
                    href={`tel:${t("redesign.support.phone").replace(/\s/g, "")}`}
                    className="group/row flex items-center gap-2 w-fit hover:translate-x-1 transition-transform duration-300 ease-out"
                  >
                    <Phone className="size-4 text-[var(--lm-accent,#C9A96E)] shrink-0 transition-transform duration-300 group-hover/row:scale-110" />
                    <span className="text-[12px] text-[var(--lm-muted,#999)] leading-[14px] group-hover/row:text-[var(--lm-accent,#C9A96E)] transition-colors duration-300">
                      {t("redesign.support.phone")}
                    </span>
                  </a>
                  <a
                    href={`mailto:${t("redesign.support.email")}`}
                    className="group/row flex items-center gap-2 w-fit hover:translate-x-1 transition-transform duration-300 ease-out"
                  >
                    <Mail className="size-4 text-[var(--lm-accent,#C9A96E)] shrink-0 transition-transform duration-300 group-hover/row:scale-110" />
                    <span className="text-[12px] text-[var(--lm-muted,#999)] leading-[1.2] group-hover/row:text-[var(--lm-accent,#C9A96E)] transition-colors duration-300">
                      {t("redesign.support.email")}
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </form>

          <div className="flex items-center gap-2 justify-center mt-4">
            <ShieldCheck className="size-6 text-[var(--lm-accent,#C9A96E)] shrink-0" />
            <span className="text-[14px] text-[var(--lm-accent,#C9A96E)] leading-[20px]">
              {t("redesign.responseTime")}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
