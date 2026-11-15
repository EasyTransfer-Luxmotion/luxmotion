"use client"

import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@workspace/convex/api"
import type { Id } from "@workspace/convex/dataModel"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, Clock, ShieldCheck, MapPin, UserRound, ArrowRight } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { LightSelect } from "@/components/applications/shared/light-select"
import { PhoneInput } from "@/components/ui/phone-input"
import { TourDateTimePicker } from "@/components/tours/tour-date-time-picker"
import { InquiryConfirmationModal } from "@/components/ultra-luxury-tours/detail/inquiry-confirmation-modal"
import { useMoney } from "@/components/currency-provider"
import { readReferralCookie } from "@/lib/referral"
import { diaDoRelogio } from "@/lib/hora-lisboa"

const SERIF_FONT = "var(--font-title), 'Cormorant Garamond', serif"

const INPUT_CLS =
  "h-[44px] w-full border border-[rgba(154,117,53,0.22)] bg-white px-[13px] text-[14px] text-[#1c1b18] placeholder:text-[#999] focus:border-[#a08248] focus:outline-none transition-colors"

const BUDGET_MIN = 500
const BUDGET_MAX = 50000

interface UltraTourInquiryWidgetProps {
  price: number
  currency?: string
  rating: number
  reviewCount: number
  tourTitle: string
  tourId?: string
  tourSlug?: string
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[1.35px] text-[#7a746e]">
      {children}
      {required && <span className="text-[#e32828]">*</span>}
    </span>
  )
}

const toOptions = (arr: string[]) => arr.map((o) => ({ value: o, label: o }))

function inquiryReference(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  const year = new Date().getFullYear()
  return `LM-${year}-${String(hash % 100000).padStart(5, "0")}`
}

function Pillar({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center gap-[3px] px-2 py-3 text-center">
      <span className="flex size-6 items-center justify-center text-[#a08248]">{icon}</span>
      <span className="pt-[5px] text-[10px] font-semibold uppercase tracking-[1.35px] text-[#0d0d0d]">{title}</span>
      <span className="text-[10px] leading-[14px] text-[#696969]">{desc}</span>
    </div>
  )
}

export function UltraTourInquiryWidget({ price, currency = "€", rating, reviewCount, tourTitle, tourId, tourSlug }: UltraTourInquiryWidgetProps) {
  const t = useTranslations("tourDetails")
  const ti = useTranslations("tourDetails.inquiry")
  const submitInquiry = useMutation(api.tourInquiries.submit)
  const { format } = useMoney()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [country, setCountry] = useState("")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [flexible, setFlexible] = useState(false)
  const [people, setPeople] = useState("")
  const [ageRange, setAgeRange] = useState("")
  const [budget, setBudget] = useState<[number, number]>([2500, 8000])
  const [interests, setInterests] = useState("")
  const [optIn, setOptIn] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<{ name: string; email: string; reference: string } | null>(null)

  const asList = (key: string): string[] => {
    const v = ti.raw(key)
    return Array.isArray(v) ? (v as string[]) : []
  }
  const countries = asList("countryOptions")
  const peopleOptions = asList("peopleOptions")
  const ageOptions = asList("ageOptions")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !phone.trim() || !interests.trim()) return
    setIsSubmitting(true)
    const submittedName = name.trim()
    const submittedEmail = email.trim()
    try {
      const id = await submitInquiry({
        tourId: tourId ? (tourId as Id<"tours">) : undefined,
        tourTitle,
        tourSlug,
        name: submittedName,
        email: submittedEmail,
        phone: phone.trim(),
        country: country || undefined,
        // Dia do calendário, não toISOString: a leste de UTC dava o dia anterior.
        date: date ? diaDoRelogio(date) : undefined,
        datesFlexible: flexible,
        people: people || undefined,
        ageRange: ageRange || undefined,
        budgetMin: budget[0],
        budgetMax: budget[1],
        interests: interests.trim(),
        marketingOptIn: optIn,
        referralSlug: readReferralCookie() ?? undefined,
      })
      setConfirmation({ name: submittedName, email: submittedEmail, reference: inquiryReference(String(id)) })
      setName("")
      setEmail("")
      setPhone("")
      setCountry("")
      setDate(undefined)
      setFlexible(false)
      setPeople("")
      setAgeRange("")
      setBudget([2500, 8000])
      setInterests("")
    } catch {
      toast.error(ti("errorTitle"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const pct = (v: number) => ((v - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100

  return (
    <div className="flex flex-col">
      {confirmation && (
        <InquiryConfirmationModal
          name={confirmation.name}
          email={confirmation.email}
          reference={confirmation.reference}
          onClose={() => setConfirmation(null)}
        />
      )}
      <div className="border border-[rgba(154,117,53,0.22)] bg-white">
        <div className="h-[2px] bg-[#c9a96e]" />

        <div className="flex flex-col gap-[6px] border-b-[0.8px] border-[rgba(154,117,53,0.22)] px-6 pb-[21px] pt-6">
          <span className="text-[12px] font-semibold uppercase tracking-[1.35px] text-[#8c8680]">{ti("from")}</span>
          <span className="leading-none" style={{ fontFamily: SERIF_FONT }}>
            <span className="text-[48px] font-semibold text-[#a08248]">{format(price)}</span>
            <span className="text-[14px] text-[#0d0d0d]">{ti("perPerson")}</span>
          </span>
          <span className="flex items-center gap-[6px] pt-[2px]">
            <span className="text-[12px] tracking-[0.5px] text-[#c9a96e]">★★★★★</span>
            <span className="text-[12px] font-semibold text-[#0d0d0d]">{rating.toFixed(1)}</span>
            <span className="text-[12px] text-[#696969]">· {reviewCount} {t("reviews")}</span>
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-[20px] leading-none text-[#0d0d0d]" style={{ fontFamily: SERIF_FONT }}>
              {ti("planTitle")} <span className="italic text-[#a08248]">{ti("planTitleAccent")}</span>
            </h3>
            <p className="text-[13px] leading-[1.4] text-[#696969]">{ti("planSubtitle")}</p>
          </div>

          <label className="flex flex-col gap-2">
            <FieldLabel required>{ti("fullName")}</FieldLabel>
            <input className={INPUT_CLS} value={name} onChange={(e) => setName(e.target.value)} placeholder={ti("fullNamePlaceholder")} required suppressHydrationWarning />
          </label>

          <label className="flex flex-col gap-2">
            <FieldLabel required>{ti("email")}</FieldLabel>
            <input type="email" className={INPUT_CLS} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={ti("emailPlaceholder")} required suppressHydrationWarning />
          </label>

          <div className="flex flex-col gap-2">
            <FieldLabel required>{ti("phone")}</FieldLabel>
            <PhoneInput partner value={phone} onChange={setPhone} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <FieldLabel required>{ti("country")}</FieldLabel>
              <LightSelect value={country} onChange={setCountry} placeholder={ti("select")} options={toOptions(countries)} />
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel required>{ti("date")}</FieldLabel>
              <TourDateTimePicker
                light
                hideTime
                availability={[]}
                placeholder={ti("datePlaceholder")}
                value={{ date: date ?? null, time: null }}
                onChange={(v) => setDate(v.date ?? undefined)}
              />
            </div>
          </div>

          <button type="button" onClick={() => setFlexible((f) => !f)} className="flex items-center gap-[10px] text-left">
            <span className={cn("flex size-[18px] shrink-0 items-center justify-center border transition-colors", flexible ? "border-[#a08248] bg-[#a08248]" : "border-[rgba(28,27,24,0.25)]")}>
              {flexible && <Check className="size-[12px] text-[#f7f4ef]" strokeWidth={3} />}
            </span>
            <span className="text-[13px] text-[#1c1b18]">{ti("flexibleDates")}</span>
          </button>

          <div className="flex flex-col gap-2">
            <FieldLabel required>{ti("people")}</FieldLabel>
            <LightSelect value={people} onChange={setPeople} placeholder={ti("select")} options={toOptions(peopleOptions)} />
          </div>

          <div className="flex flex-col gap-2">
            <FieldLabel>{ti("ageRange")}</FieldLabel>
            <LightSelect value={ageRange} onChange={setAgeRange} placeholder={ti("select")} options={toOptions(ageOptions)} />
          </div>

          <div className="flex flex-col gap-3">
            <FieldLabel>{ti("budget")}</FieldLabel>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between" style={{ fontFamily: SERIF_FONT }}>
                <span className="text-[18px] text-[#a08248]">{format(budget[0])}</span>
                <span className="text-[18px] text-[#a08248]">{format(budget[1])}</span>
              </div>
              <div className="relative h-[3px] w-full bg-[rgba(28,27,24,0.16)]">
                <div className="absolute h-full bg-[#a08248]" style={{ left: `${pct(budget[0])}%`, right: `${100 - pct(budget[1])}%` }} />
                <input
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={500}
                  value={budget[0]}
                  onChange={(e) => setBudget([Math.min(Number(e.target.value), budget[1]), budget[1]])}
                  className="pointer-events-none absolute -top-[8px] h-[18px] w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-[14px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#a08248] [&::-webkit-slider-thumb]:bg-[#f7f4ef]"
                />
                <input
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={500}
                  value={budget[1]}
                  onChange={(e) => setBudget([budget[0], Math.max(Number(e.target.value), budget[0])])}
                  className="pointer-events-none absolute -top-[8px] h-[18px] w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-[14px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#a08248] [&::-webkit-slider-thumb]:bg-[#f7f4ef]"
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#696969]">
                <span>{format(500)}</span>
                <span>{format(25000)}</span>
                <span>{format(50000)}+</span>
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <FieldLabel required>{ti("interests")}</FieldLabel>
            <textarea
              className="min-h-[150px] w-full resize-none border border-[rgba(154,117,53,0.22)] bg-white px-[13px] py-[13px] text-[14px] leading-[1.5] text-[#1c1b18] transition-colors placeholder:text-[#999] focus:border-[#a08248] focus:outline-none"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder={ti("interestsPlaceholder")}
              required
              suppressHydrationWarning
            />
          </label>

          <button type="button" onClick={() => setOptIn((o) => !o)} className="flex items-start gap-[10px] text-left">
            <span className={cn("mt-[1px] flex size-[18px] shrink-0 items-center justify-center border transition-colors", optIn ? "border-[#a08248] bg-[#a08248]" : "border-[rgba(28,27,24,0.25)]")}>
              {optIn && <Check className="size-[12px] text-[#f7f4ef]" strokeWidth={3} />}
            </span>
            <span className="text-[13px] leading-[1.35] text-[#1c1b18]">{ti("marketingOptIn")}</span>
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-[48px] items-center justify-center gap-2 bg-[#a08248] transition-colors hover:bg-[#8a6f3c] disabled:opacity-50"
          >
            <span className="text-[14px] font-medium uppercase tracking-[1.1px] text-[#f7f4ef]">
              {isSubmitting ? ti("sending") : ti("send")}
            </span>
            {!isSubmitting && <ArrowRight className="size-[18px] text-[#f7f4ef]" strokeWidth={2} />}
          </button>
        </form>

        <div className="flex items-center justify-center gap-2 border-t border-[rgba(154,117,53,0.22)] px-6 py-4">
          <Clock className="size-[14px] text-[#a08248]" strokeWidth={1.8} />
          <span className="text-[12px] text-[#696969]">{ti.rich("responseNote", { b: (c) => <span className="font-semibold text-[#1c1b18]">{c}</span> })}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-[rgba(154,117,53,0.22)] px-8 py-6">
          <Pillar icon={<ShieldCheck className="size-5" strokeWidth={1.6} />} title={ti("pillarInclusiveTitle")} desc={ti("pillarInclusiveDesc")} />
          <Pillar icon={<Clock className="size-5" strokeWidth={1.6} />} title={ti("pillarTailoredTitle")} desc={ti("pillarTailoredDesc")} />
          <Pillar icon={<MapPin className="size-5" strokeWidth={1.6} />} title={ti("pillarExpertsTitle")} desc={ti("pillarExpertsDesc")} />
          <Pillar icon={<UserRound className="size-5" strokeWidth={1.6} />} title={ti("pillarConciergeTitle")} desc={ti("pillarConciergeDesc")} />
        </div>
      </div>
    </div>
  )
}
