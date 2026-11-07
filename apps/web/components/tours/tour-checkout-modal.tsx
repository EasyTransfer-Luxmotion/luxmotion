"use client"

import { useState, useMemo, useEffect, useRef, type ReactNode, type InputHTMLAttributes } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@workspace/ui/components/dialog"
import { User, Users, Mail, FileText, MapPin, CheckCircle2, CreditCard, Banknote, ChevronLeft, X, MessageSquare, ArrowRight } from "lucide-react"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useTranslations } from "next-intl"
import { useTourCheckout } from "@/components/tours/tour-checkout-context"
import { PhoneInput } from "@/components/ui/phone-input"
import { cn } from "@workspace/ui/lib/utils"
import { useConvex, useQuery } from "convex/react"
import { api } from "@workspace/convex/api"
import type { Id } from "@workspace/convex/dataModel"
import type { TourCheckoutTour } from "@/components/tours/tour-checkout-context"
import { useMoney } from "@/components/currency-provider"
import { readReferralCookie } from "@/lib/referral"

const SERIF_FONT = "'Cormorant Garamond', serif"

const STEP_KEYS = ["tourCheckout.summary", "tourCheckout.contact", "tourCheckout.pickup", "tourCheckout.payment"] as const
function getStepLabel(index: number, productType: "tour" | "experience" | "event") {
  if (index === 2) return productType === "event" ? "tourCheckout.meetingPoint" : STEP_KEYS[2]
  return STEP_KEYS[index]
}

const RESERVATION_MINUTES = 30

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="block text-[12px] font-semibold text-white mb-2 leading-none">
      {children}
      {required && <span className="text-[#E32828]">*</span>}
    </label>
  )
}

function DarkInput({
  icon,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-[13px] top-1/2 -translate-y-1/2 text-[#696969]">
          {icon}
        </div>
      )}
      <input
        {...props}
        className={cn(
          "w-full h-[44px] bg-[#1E1D1B] border border-[rgba(255,255,255,0.12)] text-[14px] text-white placeholder:text-[#696969] focus:outline-none focus:border-[#C9A96E] transition-colors",
          icon ? "pl-[40px] pr-[13px]" : "px-[13px]",
          className,
        )}
      />
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="border-b-[0.8px] border-[rgba(247,244,239,0.08)] pb-[0.8px] h-6 flex items-center mb-4">
      <span className="text-[12px] font-bold text-[#999] uppercase tracking-[1.152px] leading-none">
        {children}
      </span>
    </div>
  )
}

function OrderSummarySidebar({
  tour,
  bookingData,
  basePrice,
  totalAmount,
  isStep4,
  onContinue,
  isSubmitting,
  reservationTimeLabel,
  addonsTotal,
  selectedAddons,
  t,
}: {
  tour: TourCheckoutTour | null
  bookingData: { date: Date | null; time: string | null; adults: number; children: number } | null
  basePrice: number
  totalAmount: number
  currentStep: number
  isStep4: boolean
  onContinue: () => void
  isSubmitting: boolean
  reservationTimeLabel?: string | null
  addonsTotal?: number
  selectedAddons?: Array<{ addonId?: string; universalAddonId?: string; title: string; price: number; pricingType: "per_person" | "flat"; quantity: number; subtotal: number }>
  t: (key: string) => string
}) {
  const { format, isEur } = useMoney()
  /* O `t` que chega por prop não interpola; a linha dos lugares precisa do
     número lá dentro. */
  const tSharing = useTranslations("tourDetails.sharing")
  if (!tour) return null
  const dateTime =
    bookingData?.date && bookingData.time
      ? `${bookingData.date.toLocaleDateString()} - ${bookingData.time}`
      : bookingData?.date
        ? bookingData.date.toLocaleDateString()
        : "—"
  const guests = bookingData ? bookingData.adults + bookingData.children : 0

  return (
    <div className="flex flex-col bg-[#1A1918] border-t lg:border-t-0 lg:border-l border-[rgba(255,255,255,0.06)] w-full lg:w-[380px] shrink-0 min-h-0">
      <div className="p-4 sm:p-5 lg:p-6 flex flex-col">
        <h3
          className="text-[20px] sm:text-[24px] font-semibold text-[#F7F4EF] leading-none mb-5"
          style={{ fontFamily: SERIF_FONT }}
        >
          {t("orderSummary.title")}
        </h3>

        <div className="flex gap-3 p-3 bg-[#0D0D0D] border border-[rgba(255,255,255,0.06)]">
          {tour.image ? (
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 overflow-hidden shrink-0 bg-[#1E1D1B]">
              <Image src={tour.image} alt="" fill className="object-cover" sizes="64px" />
            </div>
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#1E1D1B] shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#F7F4EF] text-[13px] sm:text-[14px] leading-tight line-clamp-2">
              {tour.title}
            </p>
            <p className="text-[11px] sm:text-[12px] text-[#999] mt-1 leading-[1.2]">{dateTime}</p>
            {/* Por viatura não há "N × preço": vende-se o carro, e o que
                interessa é quantos lugares tem. */}
            {tour.perVehicle ? (
              <p className="text-[11px] sm:text-[12px] text-[#696969] mt-0.5">
                {tour.vehicleSeats ?? tour.maxPassengers
                  ? tSharing("upToPassengers", {
                      count: (tour.vehicleSeats ?? tour.maxPassengers)!,
                    })
                  : tSharing("perVehicle")}
              </p>
            ) : guests > 0 ? (
              <p className="text-[11px] sm:text-[12px] text-[#696969] mt-0.5">
                {t("tourCheckout.passengers")}: {guests} × €{tour.price.toFixed(2)}
              </p>
            ) : null}
          </div>
          <div className="text-right shrink-0 self-start">
            <span className="font-bold text-[#F7F4EF] text-[14px] sm:text-[16px]">€{basePrice.toFixed(2)}</span>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-[rgba(255,255,255,0.06)] space-y-1.5">
          <div className="flex justify-between text-[12px] sm:text-[13px]">
            <span className="text-[#999]">{t("tourCheckout.subtotal")}</span>
            <span className="font-medium text-[#F7F4EF]">€{basePrice.toFixed(2)}</span>
          </div>
          {selectedAddons && selectedAddons.length > 0 && (
            <>
              <div className="flex justify-between text-[12px] sm:text-[13px] pt-1">
                <span className="text-[#999] font-medium">{t("tourCheckout.addOns")}</span>
                <span />
              </div>
              {selectedAddons.map((addon) => (
                <div key={addon.addonId} className="flex justify-between text-[12px] sm:text-[13px] pl-2">
                  <span className="text-[#999]">
                    {addon.title}{addon.pricingType === "per_person" ? ` (×${addon.quantity})` : ""}
                  </span>
                  <span className="font-medium text-[#F7F4EF]">€{addon.subtotal.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between text-[12px] sm:text-[13px]">
                <span className="text-[#999]">{t("tourCheckout.addOnsTotal")}</span>
                <span className="font-medium text-[#F7F4EF]">€{(addonsTotal ?? 0).toFixed(2)}</span>
              </div>
            </>
          )}
          {isStep4 && totalAmount !== basePrice + (addonsTotal ?? 0) && (
            <div className="flex justify-between text-[12px] sm:text-[13px]">
              <span className="text-[#999]">{t("tourCheckout.tip")}</span>
              <span className="font-medium text-[#F7F4EF]">€{(totalAmount - basePrice - (addonsTotal ?? 0)).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-3">
            <span
              className="font-semibold text-[#F7F4EF] text-[20px] sm:text-[22px]"
              style={{ fontFamily: SERIF_FONT }}
            >
              {t("common.total")}
            </span>
            <span
              className="text-[22px] sm:text-[24px] font-bold text-[#C9A96E]"
              style={{ fontFamily: SERIF_FONT }}
            >
              €{totalAmount.toFixed(2)}
            </span>
          </div>
          {!isEur && (
            <p className="text-[11px] text-[#999] text-right pt-1">
              ≈ {format(totalAmount)}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onContinue}
          disabled={isSubmitting}
          className="mt-6 w-full h-12 bg-[#C9A96E] border border-[#C9A96E] text-[#0D0D0D] text-[14px] font-medium uppercase tracking-[1.1px] inline-flex items-center justify-center gap-2 hover:bg-[#b89558] hover:border-[#b89558] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <span className="px-2">
            {isSubmitting ? t("common.loading") : isStep4 ? t("payment.payButton") : t("common.continue")}
          </span>
          {!isSubmitting && <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2} />}
        </button>
        {reservationTimeLabel && (
          <p className="mt-3 text-[11px] sm:text-[12px] text-[#C9A96E] text-center uppercase tracking-[0.72px]">
            {reservationTimeLabel}
          </p>
        )}
      </div>
    </div>
  )
}

export function TourCheckoutModal() {
  const t = useTranslations()
  const convex = useConvex()
  const { state, setStep, closeCheckout, setBookingId, updateContact, setTip, updateTotalAmount, updatePayment, isOpen } = useTourCheckout()
  const { currentStep, productType, tour, bookingData, bookingId, bookingNumber, contact, selectedPickup, tipPercent, tipAmount, totalAmount, payment, cardReturnResult } = state

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [paymentComplete, setPaymentComplete] = useState(false)
  const [waitingMbway, setWaitingMbway] = useState(false)
  const [paymentRejected, setPaymentRejected] = useState(false)
  const [reservationSecondsLeft, setReservationSecondsLeft] = useState<number | null>(null)
  const reservedAtRef = useRef<number | null>(null)

  const paymentStatus = useQuery(
    api.tourBookings.subscribeToStatus,
    (waitingMbway || paymentComplete) && bookingNumber ? { bookingNumber } : "skip"
  )

  useEffect(() => {
    if (isOpen && currentStep === 1 && !bookingId) {
      setPaymentComplete(false)
      setPaymentRejected(false)
      setWaitingMbway(false)
    }
  }, [isOpen, currentStep, bookingId])

  const basePrice = useMemo(() => {
    if (!tour || !bookingData) return 0
    // Por viatura vende-se o carro uma vez, como no contexto e no servidor. Sem
    // isto a base mostrada multiplicava-o pelas pessoas, e a gorjeta escolhida
    // a seguir punha esse valor errado no total.
    if (tour.perVehicle) return tour.price
    const guests = bookingData.adults + bookingData.children + bookingData.infants || 1
    return tour.price * guests
  }, [tour, bookingData])

  useEffect(() => {
    if (!bookingId) {
      reservedAtRef.current = null
      setReservationSecondsLeft(null)
      return
    }
    if (reservedAtRef.current === null) reservedAtRef.current = Date.now()
    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - (reservedAtRef.current ?? 0)) / 1000
      const totalSec = RESERVATION_MINUTES * 60
      const left = Math.max(0, Math.ceil(totalSec - elapsedSec))
      setReservationSecondsLeft(left)
    }, 1000)
    return () => clearInterval(interval)
  }, [bookingId])

  useEffect(() => {
    if (!paymentStatus) return
    if (paymentStatus.paymentStatus === "completed") {
      if (waitingMbway) setWaitingMbway(false)
      setPaymentComplete(true)
      setPaymentRejected(false)
    } else if (paymentStatus.paymentStatus === "failed") {
      setWaitingMbway(false)
      setPaymentComplete(false)
      setPaymentRejected(true)
    }
  }, [paymentStatus?.paymentStatus, waitingMbway])

  // Sem polling de MB Way — o estado é confirmado pelo webhook do Stripe e chega por
  // `paymentStatus` (subscrição reativa) ao useEffect acima.

  const tipOptions = [
    { percent: 0, label: "0%" },
    { percent: 10, label: "10%" },
    { percent: 20, label: "20%" },
    { percent: -1, label: "tourCheckout.custom" },
  ]

  /* Quantas pessoas vão numa viatura privada. Fica em branco de propósito: um
     "1" pré-preenchido passava despercebido e a reserva ia com o número errado. */
  const [pessoas, setPessoas] = useState("")
  const porViatura = tour?.perVehicle === true
  const limiteDeLugares = tour?.vehicleSeats ?? tour?.maxPassengers

  const handleStep1Continue = async () => {
    if (!tour || !bookingData) return
    setSubmitError("")
    setIsSubmitting(true)
    try {
      const dateStr = bookingData.date ? bookingData.date.toISOString().slice(0, 10) : ""
      const timeStr = bookingData.time || ""
      const guests = bookingData.adults + bookingData.children + bookingData.infants || 1
      const isEvent = productType === "event"
      const useMockTours = typeof process.env.NEXT_PUBLIC_USE_MOCK_TOURS === "string" && process.env.NEXT_PUBLIC_USE_MOCK_TOURS === "true"
      const looksLikeMockId = (id: string) => typeof id === "string" && (id.startsWith("tour-") || id.startsWith("event-") || id.length < 15)
      const canUseTourId = !useMockTours && tour._id && !looksLikeMockId(tour._id)
      const selectedAddons = bookingData.selectedAddons?.map((a) => ({
        // Um ou outro: um extra próprio do tour ou um universal, que vive noutra tabela.
        addonId: a.addonId as Id<"tourAddons"> | undefined,
        universalAddonId: a.universalAddonId as Id<"universalAddons"> | undefined,
        title: a.title,
        price: a.price,
        pricingType: a.pricingType as "per_person" | "flat",
        quantity: a.quantity,
        subtotal: a.subtotal,
      }))
      const result = await convex.mutation(api.tourBookings.init, {
        productType,
        tourId: !isEvent && canUseTourId ? (tour._id as Id<"tours">) : undefined,
        eventId: isEvent && canUseTourId ? (tour._id as Id<"events">) : undefined,
        tourTitle: tour.title,
        tourSlug: tour.slug,
        passengers: guests,
        selectedDate: dateStr,
        selectedTime: timeStr,
        // Sem valores: o preço da base e dos extras é calculado no servidor a
        // partir do tour (convex/lib/precoTours.ts). Só vão as escolhas.
        sharingMode: tour.sharingMode,
        selectedAddons: selectedAddons?.length ? selectedAddons : undefined,
        referralSlug: readReferralCookie() ?? undefined,
      })
      const bookingNumber = (result as { bookingNumber?: string })?.bookingNumber
      const bookingId = (result as { bookingId?: string })?.bookingId ?? (result as { booking?: { _id: string } })?.booking?._id
      if (bookingNumber && bookingId) {
        setBookingId(bookingId, bookingNumber)
        setStep(2)
      }
    } catch (e: any) {
      setSubmitError((typeof e?.data === "string" && e.data) || e?.message || "Failed to create booking")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStep2Continue = async () => {
    if (!bookingId || !contact.name || !contact.email || !contact.phone) {
      setSubmitError(t("passengerForm.fillRequired"))
      return
    }
    if (porViatura) {
      const n = parseInt(pessoas, 10)
      if (!Number.isFinite(n) || n < 1) {
        setSubmitError(t("passengerForm.howManyRequired"))
        return
      }
      if (limiteDeLugares && n > limiteDeLugares) {
        setSubmitError(t("passengerForm.seatLimit", { count: limiteDeLugares }))
        return
      }
    }
    setSubmitError("")
    setIsSubmitting(true)
    try {
      await convex.mutation(api.tourBookings.updateContact, {
        bookingId: bookingId as Id<"tourBookings">,
        customerName: contact.name.trim(),
        customerEmail: contact.email.trim(),
        customerPhone: contact.phone.trim(),
        customerNif: contact.nif?.trim() || undefined,
        passengers: porViatura ? parseInt(pessoas, 10) : undefined,
      })
      setStep(3)
    } catch (e: any) {
      setSubmitError(e?.message || t("passengerForm.saveError"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStep3Continue = async () => {
    if (!bookingId) return
    setSubmitError("")
    setIsSubmitting(true)
    try {
      await convex.mutation(api.tourBookings.updatePickup, {
        bookingId: bookingId as Id<"tourBookings">,
        pickup: selectedPickup ?? undefined,
      })
      if (tipPercent > 0 && tipAmount === 0) {
        const addons = bookingData?.addonsTotal ?? 0
        const defaultTipAmount = Math.round((basePrice * tipPercent) / 100)
        setTip(tipPercent, defaultTipAmount)
        updateTotalAmount(basePrice + addons + defaultTipAmount)
      }
      setStep(4)
    } catch (e: any) {
      setSubmitError(e?.message || "Failed to save pickup")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePay = async () => {
    if (!bookingId) {
      setSubmitError(t("payment.orderNotInitialized"))
      return
    }
    if (!contact.name?.trim() || !contact.email?.trim() || !contact.phone?.trim()) {
      setSubmitError(t("passengerForm.fillRequired"))
      return
    }
    if (payment.method === "mbway" && !payment.mbwayPhone?.trim()) {
      setSubmitError(t("payment.mbwayPhoneRequired"))
      return
    }
    setSubmitError("")
    setIsSubmitting(true)
    try {
      await convex.mutation(api.tourBookings.updateContact, {
        bookingId: bookingId as Id<"tourBookings">,
        customerName: contact.name.trim(),
        customerEmail: contact.email.trim(),
        customerPhone: contact.phone.trim(),
        customerNif: contact.nif?.trim() || undefined,
      })
      await convex.mutation(api.tourBookings.updateTipAndTotal, {
        bookingId: bookingId as Id<"tourBookings">,
        tipPercent,
        tipAmount,
      })

      const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
      const returnPath = typeof window !== "undefined" ? window.location.pathname || "/" : "/"
      const returnQuery = `tourCheckoutReturn=1&bookingNumber=${encodeURIComponent(bookingNumber ?? "")}`
      const successUrl = `${baseUrl}${returnPath}?${returnQuery}&payment=success`
      const errorUrl = `${baseUrl}${returnPath}?${returnQuery}&payment=failed`
      const cancelUrl = `${baseUrl}${returnPath}?${returnQuery}&payment=failed`
      const method = payment.method === "cartao" ? "ccard" : payment.method
      const result = await convex.action(api.tourBookings.startPaymentAction, {
        bookingId: bookingId as Id<"tourBookings">,
        method,
        amount: totalAmount,
        phoneNumber: payment.method === "mbway" ? payment.mbwayPhone?.trim() : undefined,
        email: contact.email?.trim() || undefined,
        successUrl,
        errorUrl,
        cancelUrl,
        language: "pt",
      }) as any

      if (payment.method === "cash") {
        setPaymentComplete(true)
      } else if (result?.checkoutUrl) {
        // Cartão / MB WAY / Multibanco → Stripe Checkout (hosted).
        window.location.href = result.checkoutUrl
        return
      } else {
        throw new Error("Checkout URL not received from payment provider")
      }
    } catch (e: any) {
      setSubmitError((typeof e?.data === "string" && e.data) || e?.message || t("payment.paymentError"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const setTipPercent = (percent: number, customValue?: number) => {
    const addons = bookingData?.addonsTotal ?? 0
    if (percent >= 0) {
      const amount = Math.round((basePrice * percent) / 100)
      setTip(percent, amount)
      updateTotalAmount(basePrice + addons + amount)
    } else {
      const amount = customValue ?? 0
      setTip(percent, amount)
      updateTotalAmount(basePrice + addons + amount)
    }
  }

  const getContinueHandler = () => {
    if (currentStep === 1) return handleStep1Continue
    if (currentStep === 2) return handleStep2Continue
    if (currentStep === 3) return handleStep3Continue
    return handlePay
  }

  const isMobile = useIsMobile()
  const isConfirmed = paymentComplete || cardReturnResult?.success === true

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeCheckout()}>
      <DialogContent
        className="max-sm:inset-0 max-sm:translate-none max-sm:w-full max-sm:h-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:shadow-none max-sm:min-h-full max-w-5xl w-[95vw] h-[90vh] min-h-[480px] overflow-hidden flex flex-col p-0 rounded-none border border-[rgba(255,255,255,0.12)] bg-[#0D0D0D] shadow-[0_30px_80px_rgba(0,0,0,0.6)] sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 checkout-dark"
        showCloseButton={false}
      >
        <motion.div
          key="tour-checkout-inner"
          initial={isMobile ? { y: "100%" } : false}
          animate={isMobile ? { y: 0 } : false}
          transition={isMobile ? { type: "tween", duration: 0.35, ease: [0.32, 0.72, 0, 1] } : undefined}
          className="h-full w-full flex flex-col overflow-hidden min-h-0 bg-[#0D0D0D]"
        >
        <div className="shrink-0 px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-2 min-h-[36px]">
            <DialogTitle
              className="text-[20px] sm:text-[24px] font-semibold text-[#F7F4EF] block flex-1 min-w-0 leading-none"
              style={{ fontFamily: SERIF_FONT }}
            >
              {isConfirmed ? t("tourCheckout.bookingConfirmed") : t("tourCheckout.finalizePurchase")}
            </DialogTitle>
            <DialogClose
              className="shrink-0 h-9 w-9 sm:h-10 sm:w-10 flex items-center justify-center border border-[rgba(255,255,255,0.12)] text-[#999] hover:border-[#C9A96E] hover:text-[#C9A96E] transition-colors focus:outline-none touch-manipulation"
              aria-label="Close"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
            </DialogClose>
          </div>
          {!isConfirmed && (
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto -mx-1 min-h-[36px] pb-0.5 mt-3">
              {STEP_KEYS.map((_, i) => {
                const key = getStepLabel(i, productType)
                const stepNum = i + 1
                const isActive = currentStep === stepNum
                const isPast = currentStep > stepNum
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => currentStep > stepNum && setStep(stepNum)}
                    className={cn(
                      "flex items-center gap-1.5 py-1.5 px-2.5 text-[11px] sm:text-[12px] font-medium uppercase tracking-[0.72px] transition-colors shrink-0 touch-manipulation border",
                      isActive && "bg-[rgba(154,117,53,0.22)] border-[#C9A96E] text-[#C9A96E]",
                      isPast && "border-[rgba(255,255,255,0.12)] text-[#F7F4EF] hover:border-[#C9A96E]",
                      !isActive && !isPast && "border-[rgba(255,255,255,0.06)] text-[#696969]",
                    )}
                  >
                    <span>{stepNum}</span>
                    <span className="hidden xs:inline whitespace-nowrap">{t(key as string)}</span>
                    {i < STEP_KEYS.length - 1 && <span className="text-[#696969] hidden sm:inline">›</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {(paymentComplete || (cardReturnResult?.success === true)) ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
            <div className="max-w-md w-full text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 border border-[#C9A96E] bg-[rgba(154,117,53,0.07)] mb-6">
                <CheckCircle2 className="w-12 h-12 text-[#C9A96E]" strokeWidth={1.5} />
              </div>
              <DialogTitle
                className="text-[28px] font-semibold text-[#F7F4EF] mb-3 leading-tight"
                style={{ fontFamily: SERIF_FONT }}
              >
                {t("tourCheckout.prepareForExperience")}
              </DialogTitle>
              <p className="text-[#999] text-[14px] mb-6">
                {t("tourCheckout.emailConfirmation")}
              </p>
              {(bookingNumber || cardReturnResult?.bookingNumber) && (
                <p className="text-[12px] text-[#696969] mb-6 uppercase tracking-[0.72px]">
                  {t("tourCheckout.bookingNumber")}:{" "}
                  <strong className="text-[#C9A96E]">{bookingNumber || cardReturnResult?.bookingNumber}</strong>
                </p>
              )}
              <button
                type="button"
                onClick={closeCheckout}
                className="h-12 px-8 bg-[#C9A96E] border border-[#C9A96E] text-[#0D0D0D] text-[14px] font-medium uppercase tracking-[1.1px] inline-flex items-center gap-2 hover:bg-[#b89558] hover:border-[#b89558] transition-colors"
              >
                <span className="px-2">{t("tourCheckout.letsGo")}</span>
                <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2} />
              </button>
            </div>
          </div>
        ) : (paymentRejected || cardReturnResult?.success === false) ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
            <div className="max-w-md w-full text-center p-6 border border-[rgba(227,40,40,0.3)] bg-[rgba(227,40,40,0.05)]">
              <div className="inline-flex items-center justify-center w-16 h-16 border border-[#E32828] mb-4">
                <X className="w-8 h-8 text-[#E32828]" strokeWidth={2} aria-hidden />
              </div>
              <p className="text-[#E32828] font-semibold text-[16px] mb-6">
                {cardReturnResult ? t("tourCheckout.paymentRejectedCard") : t("tourCheckout.paymentRejectedMbway")}
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <button
                  type="button"
                  onClick={() => { if (cardReturnResult) closeCheckout(); else { setPaymentRejected(false); setStep(4); } }}
                  className="h-11 px-6 border border-[#E32828] text-[#E32828] text-[13px] font-medium uppercase tracking-[1.1px] hover:bg-[rgba(227,40,40,0.08)] transition-colors"
                >
                  {t("tourCheckout.tryAgain")}
                </button>
                <button
                  type="button"
                  onClick={closeCheckout}
                  className="h-11 px-6 border border-[rgba(255,255,255,0.12)] text-[#999] text-[13px] font-medium uppercase tracking-[1.1px] hover:border-[#F7F4EF] hover:text-[#F7F4EF] transition-colors"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : waitingMbway ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
            <div className="max-w-md w-full text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-2 border-[#C9A96E] border-t-transparent mx-auto mb-4" />
              <DialogTitle
                className="text-[22px] font-semibold text-[#F7F4EF] mb-2"
                style={{ fontFamily: SERIF_FONT }}
              >
                {t("tourCheckout.waitingMbway")}
              </DialogTitle>
              <p className="text-[14px] text-[#999]">
                {t("payment.awaitingConfirmation")}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
            <div className="flex-1 min-w-0 min-h-0 overflow-y-auto px-4 sm:px-5 lg:px-8 py-5 sm:py-7">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(currentStep - 1)}
                  className="flex items-center gap-1 text-[#C9A96E] text-[12px] font-medium uppercase tracking-[1.1px] mb-6 hover:text-[#b89558] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t("tourCheckout.previous")}
                </button>
              )}

              {currentStep === 1 && tour && bookingData && (
                <div className="space-y-6">
                  <div className="flex gap-4 p-4 bg-[#1A1918] border border-[rgba(255,255,255,0.06)]">
                    {tour.image ? (
                      <div className="relative w-24 h-24 overflow-hidden shrink-0 bg-[#1E1D1B]">
                        <Image src={tour.image} alt="" fill className="object-cover" sizes="96px" />
                      </div>
                    ) : (
                      <div className="w-24 h-24 bg-[#1E1D1B] shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3
                        className="font-semibold text-[#F7F4EF] text-[20px] leading-tight"
                        style={{ fontFamily: SERIF_FONT }}
                      >
                        {tour.title}
                      </h3>
                      <p className="text-[13px] text-[#999] mt-2">
                        {t("tourCheckout.passengers")}: {bookingData.adults + bookingData.children} ({bookingData.adults} {t("tourDetails.adult").toLowerCase()}, {bookingData.children} {t("tourDetails.children").toLowerCase()})
                      </p>
                      {bookingData.date && (
                        <p className="text-[13px] text-[#999] mt-0.5">
                          {t("tourCheckout.date")}: {bookingData.date.toLocaleDateString()}
                          {bookingData.time && ` · ${bookingData.time}`}
                        </p>
                      )}
                    </div>
                  </div>
                  {submitError && (
                    <p className="text-[13px] text-[#E32828]" role="alert">{submitError}</p>
                  )}
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-5">
                  <SectionLabel>{t("passengerForm.mainPassengerData")}</SectionLabel>
                  <p className="text-[13px] text-[#999] -mt-2">{t("tourCheckout.fillContactInfo")}</p>
                  <div className="grid gap-4">
                    <div>
                      <FieldLabel required>{t("passengerForm.name")}</FieldLabel>
                      <DarkInput
                        icon={<User className="w-4 h-4" strokeWidth={2} />}
                        value={contact.name}
                        onChange={(e) => updateContact({ name: e.target.value })}
                        placeholder={t("passengerForm.namePlaceholder")}
                      />
                    </div>
                    <div>
                      <FieldLabel required>{t("passengerForm.email")}</FieldLabel>
                      <DarkInput
                        icon={<Mail className="w-4 h-4" strokeWidth={2} />}
                        value={contact.email}
                        onChange={(e) => updateContact({ email: e.target.value })}
                        placeholder={t("passengerForm.emailPlaceholder")}
                        type="email"
                      />
                    </div>
                    <div>
                      <FieldLabel required>{t("passengerForm.whatsapp")}</FieldLabel>
                      <PhoneInput
                        value={contact.phone}
                        onChange={(v) => updateContact({ phone: v })}
                        defaultCountry="pt"
                        dark
                      />
                    </div>
                    {/* Numa viatura privada não há contadores na barra — vende-se
                        o carro. O número real pergunta-se aqui, limitado aos
                        lugares, senão a reserva seguia com uma pessoa e o
                        motorista aparecia para levar três. */}
                    {porViatura && (
                      <div>
                        <FieldLabel required>
                          {t("passengerForm.howManyPeople")}
                        </FieldLabel>
                        <DarkInput
                          icon={<Users className="w-4 h-4" strokeWidth={2} />}
                          value={pessoas}
                          onChange={(e) => setPessoas(e.target.value)}
                          placeholder="1"
                          type="number"
                          min={1}
                          max={limiteDeLugares}
                        />
                        {limiteDeLugares ? (
                          <p className="mt-1 text-[11px] text-[#696969]">
                            {t("passengerForm.seatLimit", { count: limiteDeLugares })}
                          </p>
                        ) : null}
                      </div>
                    )}

                    <div>
                      <FieldLabel>{t("passengerForm.nifVat")}</FieldLabel>
                      <DarkInput
                        icon={<FileText className="w-4 h-4" strokeWidth={2} />}
                        value={contact.nif}
                        onChange={(e) => updateContact({ nif: e.target.value })}
                        placeholder={t("passengerForm.nifPlaceholder")}
                      />
                    </div>
                  </div>
                  {submitError && (
                    <p className="text-[13px] text-[#E32828]" role="alert">{submitError}</p>
                  )}
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-5">
                  {selectedPickup ? (
                    <>
                      <div className="flex gap-4 p-5 bg-[#1A1918] border border-[rgba(255,255,255,0.06)]">
                        <MapPin className="w-6 h-6 text-[#C9A96E] shrink-0 mt-0.5" strokeWidth={1.5} />
                        <div>
                          <p className="font-semibold text-[#F7F4EF] text-[15px]">{selectedPickup.title}</p>
                          <p className="text-[13px] text-[#999] mt-1">{selectedPickup.address}</p>
                          {selectedPickup.description && (
                            <p className="text-[12px] text-[#696969] mt-2 leading-[1.5]">{selectedPickup.description}</p>
                          )}
                        </div>
                      </div>
                      <p className="text-[12px] text-[#696969]">{t("tourCheckout.pickupDescription")}</p>
                    </>
                  ) : (
                    <p className="text-[13px] text-[#696969]">{t("tourCheckout.noPickup")}</p>
                  )}

                  <div>
                    <FieldLabel>{t("tourCheckout.observations")}</FieldLabel>
                    <div className="relative">
                      <MessageSquare className="absolute left-[13px] top-3 w-4 h-4 text-[#696969]" strokeWidth={2} />
                      <textarea
                        value={contact.observations}
                        onChange={(v) => updateContact({ observations: v.target.value })}
                        placeholder={t("tourCheckout.observationsPlaceholder")}
                        className="w-full min-h-[100px] pl-[40px] pr-[13px] py-3 bg-[#1E1D1B] border border-[rgba(255,255,255,0.12)] text-[14px] text-white placeholder:text-[#696969] resize-none focus:outline-none focus:border-[#C9A96E] transition-colors"
                      />
                    </div>
                  </div>

                  {submitError && (
                    <p className="text-[13px] text-[#E32828]" role="alert">{submitError}</p>
                  )}
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-7">
                  <div>
                    <SectionLabel>{t("tourCheckout.addTip")}</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {tipOptions.map((opt) => {
                        const selected = tipPercent === opt.percent
                        return (
                          <button
                            key={opt.percent}
                            type="button"
                            onClick={() => setTipPercent(opt.percent, opt.percent >= 0 ? Math.round((basePrice * opt.percent) / 100) : 0)}
                            className={cn(
                              "h-11 px-5 text-[13px] font-medium uppercase tracking-[1.1px] border transition-colors",
                              selected
                                ? "bg-[rgba(154,117,53,0.07)] border-[#C9A96E] text-[#C9A96E]"
                                : "bg-[#1E1D1B] border-[rgba(255,255,255,0.12)] text-[#F7F4EF] hover:border-[rgba(255,255,255,0.25)]",
                            )}
                          >
                            {opt.percent === -1 ? t("tourCheckout.custom") : opt.label}
                          </button>
                        )
                      })}
                    </div>
                    {tipPercent === -1 && (
                      <div className="mt-4">
                        <FieldLabel>{t("tourCheckout.customTipPercent")}</FieldLabel>
                        <DarkInput
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          placeholder="5"
                          onChange={(e) => {
                            const p = parseFloat(e.target.value) || 0
                            setTipPercent(-1, Math.round((basePrice * p) / 100))
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <SectionLabel>{t("payment.title")}</SectionLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {([
                        { method: "cash" as const, icon: <Banknote className="w-7 h-7" strokeWidth={1.5} />, label: t("payment.cash") },
                        { method: "mbway" as const, icon: <Image src="/shared/payments/mbway-checkout.png" alt="MBWay" width={28} height={28} className="w-7 h-7 object-contain" />, label: t("payment.mbway") },
                        { method: "cartao" as const, icon: <CreditCard className="w-7 h-7" strokeWidth={1.5} />, label: t("payment.card") },
                      ]).map(({ method, icon, label }) => {
                        const selected = payment.method === method
                        return (
                          <button
                            key={method}
                            type="button"
                            onClick={() => updatePayment({ method })}
                            className={cn(
                              "flex flex-col items-center gap-2 p-5 border transition-colors",
                              selected
                                ? "bg-[rgba(154,117,53,0.07)] border-[#C9A96E]"
                                : "bg-[#1E1D1B] border-[rgba(255,255,255,0.12)] hover:border-[rgba(255,255,255,0.25)]",
                            )}
                          >
                            <span className={cn(selected ? "text-[#C9A96E]" : "text-[#F7F4EF]")}>{icon}</span>
                            <span className={cn(
                              "text-[12px] font-medium uppercase tracking-[1.1px]",
                              selected ? "text-[#C9A96E]" : "text-[#F7F4EF]",
                            )}>
                              {label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {payment.method === "mbway" && (
                    <div>
                      <FieldLabel required>{t("payment.mbwayPhoneNumber")}</FieldLabel>
                      <PhoneInput
                        value={payment.mbwayPhone}
                        onChange={(v) => updatePayment({ mbwayPhone: v })}
                        defaultCountry="pt"
                        placeholder={t("payment.mbwayPhonePlaceholder")}
                        dark
                      />
                    </div>
                  )}

                  {submitError && (
                    <p className="text-[13px] text-[#E32828]" role="alert">{submitError}</p>
                  )}
                </div>
              )}
            </div>

            <OrderSummarySidebar
              tour={tour}
              bookingData={bookingData}
              basePrice={basePrice}
              totalAmount={totalAmount}
              currentStep={currentStep}
              isStep4={currentStep === 4}
              onContinue={currentStep === 4 ? handlePay : getContinueHandler()}
              isSubmitting={isSubmitting}
              addonsTotal={bookingData?.addonsTotal}
              selectedAddons={bookingData?.selectedAddons}
              reservationTimeLabel={
                bookingId && reservationSecondsLeft !== null && reservationSecondsLeft > 0
                  ? t("tourCheckout.reservedForMinutes", {
                      time: `${Math.floor(reservationSecondsLeft / 60)}:${String(reservationSecondsLeft % 60).padStart(2, "0")}`,
                    })
                  : null
              }
              t={t}
            />
          </div>
        )}
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
