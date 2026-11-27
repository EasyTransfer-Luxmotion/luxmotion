"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  Shield,
  Users,
  Clock,
  Package,
  Check,
  ShieldCheck,
} from "lucide-react"
import { PhoneInput } from "@/components/ui/phone-input"
import { useTranslations, useLocale } from "next-intl"
import { useCheckout } from "@/components/checkout/checkout-context"
import { insurancePrice, calcExtras } from "@/components/checkout/pricing"
import {
  calculatePriceBreakdown,
} from "@/lib/format"
import {
  startPayment,
  useSubscribeToOrderStatus,
  type PaymentMethod as BackendPaymentMethod,
  type StartPaymentRequest,
} from "@/lib/orders"
import { api } from "@workspace/convex/api"
import type { Id } from "@workspace/convex/dataModel"
import { toPendingExperience } from "@/lib/pending-checkout-experiences"
import { useConvex } from "convex/react"
import { ConvexError } from "convex/values"
import { cn } from "@workspace/ui/lib/utils"
import { AnimatedCollapse } from "@/components/checkout/shared"
import { useExtraPrices } from "@/hooks/use-site-settings"

const SERIF_FONT = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

type UiPaymentMethod = "cartao" | "cash" | "multibanco" | "mbway" | "pix" | "googlepay"

interface PaymentStepProps {
  onContinue: () => void
  onBack?: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b-[0.8px] border-[rgba(var(--ck-text-rgb,247,244,239),0.08)] pb-[0.8px] h-6 flex items-center w-full">
      <span className="text-[12px] font-bold text-[var(--ck-accent,#c9a96e)] uppercase tracking-[1.152px] leading-none">
        {children}
      </span>
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] font-bold text-[var(--ck-accent,#c9a96e)] uppercase tracking-[1.152px] leading-none">
      {children}
    </span>
  )
}

interface AddonCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  bullets: string[]
  priceLabel: string
  active: boolean
  onToggle: () => void
  badge?: string
  addLabel: string
  removeLabel: string
  tagline?: string
}

function AddonCard({
  icon,
  title,
  subtitle,
  bullets,
  priceLabel,
  active,
  onToggle,
  badge,
  addLabel,
  removeLabel,
  tagline,
}: AddonCardProps) {
  return (
    <div className="relative bg-[var(--ck-surface,#1e1d1b)] border-2 border-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.22)] flex flex-col gap-[10px] px-6 py-4">
      {badge && (
        <div className="absolute top-[-2px] right-[22.8px] bg-[var(--ck-accent-hover,#b89558)] px-2 py-1">
          <span className="block translate-y-[1px] text-[8px] font-semibold text-[var(--ck-text,#f7f4ef)] uppercase tracking-[1px] leading-[14.08px]">
            {badge}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 w-full">
        <div className="bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.07)] border border-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.22)] p-[10px] shrink-0">
          <div className="w-5 h-5 text-[var(--ck-accent,#c9a96e)] flex items-center justify-center">
            {icon}
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <p className="text-[14px] font-bold text-[var(--ck-text,#f7f4ef)] leading-[22.528px]">{title}</p>
          <p className="text-[12px] text-[var(--ck-text-muted,#999999)] leading-[19.2px]">{subtitle}</p>
        </div>
        <p className="text-[16px] font-bold text-[var(--ck-accent,#c9a96e)] leading-[24.32px] whitespace-nowrap">
          {priceLabel}
        </p>
      </div>

      <ul className="flex flex-col gap-1 w-full">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-center gap-[6px]">
            <Check className="w-3 h-3 text-[var(--ck-accent,#c9a96e)] shrink-0" strokeWidth={3} />
            <span className="text-[12px] text-[var(--ck-text-muted,#999999)] leading-[19.2px]">{b}</span>
          </li>
        ))}
      </ul>

      {tagline && (
        <p className="text-[12px] text-[var(--ck-accent,#c9a96e)] leading-[19.2px]">{tagline}</p>
      )}

      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "h-10 w-full flex items-center justify-center gap-1 px-[22px] py-[9px] text-[14px] font-medium uppercase tracking-[1.1px] border transition-colors",
          active
            ? "bg-[var(--ck-accent,#c9a96e)] border-[var(--ck-accent,#c9a96e)] text-[var(--ck-bg,#0d0d0d)] hover:bg-[var(--ck-accent-hover,#b89558)] hover:border-[var(--ck-accent-hover,#b89558)]"
            : "bg-[var(--ck-accent-hover,#b89558)] border-[var(--ck-accent,#c9a96e)] text-[var(--ck-text,#f7f4ef)] hover:bg-[#8f6420]",
        )}
      >
        <span>{active ? removeLabel : addLabel}</span>
        <span className="font-bold">{priceLabel}</span>
      </button>
    </div>
  )
}

function TipChip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 h-10 flex items-center justify-center text-[14px] font-medium border transition-colors",
        selected
          ? "border-[var(--ck-accent,#c9a96e)] text-[var(--ck-accent,#c9a96e)] bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.07)]"
          : "border-[var(--ck-border,rgba(var(--ck-text-rgb,255,255,255),0.12))] text-[var(--ck-text-muted,#999999)] hover:border-[rgba(var(--ck-text-rgb,255,255,255),0.3)] hover:text-[var(--ck-text,#f7f4ef)]",
      )}
    >
      {label}
    </button>
  )
}

function GooglePayLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 26" className={className} xmlns="http://www.w3.org/2000/svg">
      <path fill="#5F6368" d="M30.3 12.6v7h-2.2V2.3h5.9c1.5 0 2.7.5 3.7 1.5s1.5 2.2 1.5 3.6-.5 2.6-1.5 3.6-2.3 1.5-3.7 1.5h-3.7zm0-8.2v6.1h3.8c.9 0 1.6-.3 2.2-.9s.9-1.3.9-2.1c0-.8-.3-1.5-.9-2.1s-1.3-.9-2.2-.9h-3.8zm13.5 2.8c1.6 0 2.9.4 3.8 1.3s1.4 2 1.4 3.5v7.1h-2.1v-1.6h-.1c-.9 1.3-2.1 2-3.6 2-1.3 0-2.4-.4-3.3-1.1s-1.3-1.7-1.3-2.8c0-1.2.5-2.2 1.4-2.9s2.1-1.1 3.6-1.1c1.3 0 2.3.2 3.2.7V12c0-.8-.3-1.4-.9-2-.6-.5-1.4-.8-2.2-.8-1.3 0-2.3.5-3.1 1.6L36.6 9.5c1.1-1.5 2.8-2.3 4.9-2.3zm-2.8 8.6c0 .6.2 1 .7 1.4s1.1.6 1.8.6c1 0 1.9-.4 2.7-1.1.8-.8 1.2-1.6 1.2-2.7-.7-.5-1.7-.8-3-.8-.9 0-1.7.2-2.3.7s-1.1 1.1-1.1 1.9z"/>
      <path fill="#4285F4" d="M60.7 7.7l-7.4 17h-2.3l2.7-5.9-4.9-11.1h2.4l3.5 8.5h.1l3.4-8.5z"/>
      <path fill="#4285F4" d="M20.7 11.2c0-.7-.1-1.4-.2-2h-9.3v3.8h5.3c-.2 1.3-.9 2.3-2 3v2.5h3.3c1.9-1.7 3-4.3 3-7.3z"/>
      <path fill="#34A853" d="M11.2 20.8c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H2.2v2.6c1.6 3.3 5 5.4 9 5.4z"/>
      <path fill="#FBBC04" d="M5.6 12.8c-.4-1.3-.4-2.6 0-3.9V6.3H2.2c-1.4 2.7-1.4 5.9 0 8.6z"/>
      <path fill="#EA4335" d="M11.2 4.8c1.4 0 2.7.5 3.7 1.5l2.9-2.9C16 1.8 13.7.8 11.2.8c-4 0-7.4 2.1-9 5.4l3.4 2.6c.8-2.2 3-4 5.6-4z"/>
    </svg>
  )
}

function PixLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#32BCAD"
        d="M18.3 15.4a2.7 2.7 0 01-1.9-.8l-2.8-2.8a.5.5 0 00-.7 0l-2.8 2.8a2.7 2.7 0 01-1.9.8H7.6l3.6 3.6a2.7 2.7 0 003.8 0l3.6-3.6h-.3zm-9.6-6.8c.7 0 1.4.3 1.9.8l2.8 2.8c.2.2.5.2.7 0l2.8-2.8a2.7 2.7 0 011.9-.8h.3l-3.6-3.6a2.7 2.7 0 00-3.8 0L7.6 8.6h1.1zm10.5.9l-2.2-2.2h-.3a1.8 1.8 0 00-1.3.5l-2.8 2.8a1.4 1.4 0 01-2 0L8 7.8a1.8 1.8 0 00-1.3-.5h-.3L4 9.5a2.7 2.7 0 000 3.8l2.2 2.2h.3a1.8 1.8 0 001.3-.5l2.8-2.8a1.4 1.4 0 012 0l2.8 2.8a1.8 1.8 0 001.3.5h.3l2.2-2.2a2.7 2.7 0 000-3.8z"
      />
    </svg>
  )
}

export function PaymentStep({ onContinue, onBack }: PaymentStepProps) {
  const convex = useConvex()
  const locale = useLocale()
  const t = useTranslations("payment")
  const tCommon = useTranslations("common")
  const { state, updatePayment, setTip, submitCheckout, setStep } = useCheckout()
  const extraPrices = useExtraPrices()
  const {
    payment,
    orderId,
    selectedVehicle,
    passenger,
    transfer,
    currentStep,
    experiences,
    order: orderObj,
    hasNearbyTours,
  } = state
  const confirmationStep = hasNearbyTours ? 5 : 4

  const orderStatus = useSubscribeToOrderStatus(orderId ? String(orderId) : null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")

  const isRoundTrip = transfer.bookReturn
  const baseVehiclePrice = selectedVehicle?.price ?? 0
  const baseTotalPrice = baseVehiclePrice
  const multiplier = isRoundTrip ? 2 : 1

  // Add-on prices from the shared ./pricing module (single source of truth) so the option
  // cards, the invoice and the charge can never drift.
  const airportGuaranteePrice = payment.premiumInsurance ? insurancePrice("premiumInsurance", isRoundTrip) : 0
  const meetGreetPrice = payment.refundTerms ? insurancePrice("refundTerms", isRoundTrip) : 0
  const priorityPickupPrice = payment.priorityPickup ? insurancePrice("priorityPickup", isRoundTrip) : 0
  const comfortPackPrice = payment.comfortConnection ? insurancePrice("comfortConnection", isRoundTrip) : 0
  const addonsTotal =
    airportGuaranteePrice + meetGreetPrice + priorityPickupPrice + comfortPackPrice

  // Luggage extras (child seats / surfboards / pets) — same helper the summary uses, so the
  // charged amount always == the displayed invoice. (These were shown but never charged.)
  const extrasTotal = calcExtras(transfer, isRoundTrip, extraPrices).total

  // Taxa de cartão removida — o Stripe escolhe o método (não sabemos se é cartão à partida) e
  // cobrar sobretaxa em cartões de consumidor é proibido na UE.
  const cardFeeRate = 0

  const experiencesTotal = experiences.reduce((sum, exp) => sum + exp.totalPrice, 0)
  const tipAmount = state.tipAmount ?? 0

  const priceBreakdown = useMemo(
    () =>
      calculatePriceBreakdown({
        basePrice: baseTotalPrice,
        cardFeeRate,
        insuranceTotal: addonsTotal + extrasTotal,
      }),
    [baseTotalPrice, cardFeeRate, addonsTotal, extrasTotal],
  )

  const totalToPay = priceBreakdown.total + experiencesTotal + tipAmount

  const { tipPercent } = state

  const tipOptions = useMemo(
    () => [
      { percent: 0, label: "0%" },
      { percent: 10, label: "10%" },
      { percent: 20, label: "20%" },
      { percent: -1, label: t("tipCustom") },
    ],
    [t],
  )

  useEffect(() => {
    if (tipPercent > 0) {
      const amount = Math.round((baseTotalPrice * tipPercent) / 100)
      if (amount !== tipAmount) {
        setTip(tipPercent, amount)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseTotalPrice])

  const handleTipSelect = useCallback(
    (percent: number, customValue?: number) => {
      if (percent >= 0) {
        const amount = Math.round((baseTotalPrice * percent) / 100)
        setTip(percent, amount)
      } else {
        setTip(percent, customValue ?? 0)
      }
    },
    [baseTotalPrice, setTip],
  )

  const selectedCheckoutAddons = useMemo(() => {
    const addons: StartPaymentRequest["selectedCheckoutAddons"] = []
    if (payment.premiumInsurance) {
      addons.push({
        code: "airportGuarantee",
        label: t("addons.airportGuarantee.title"),
        price: airportGuaranteePrice,
      })
    }
    if (payment.refundTerms) {
      addons.push({
        code: "meetGreet",
        label: t("addons.meetGreet.title"),
        price: meetGreetPrice,
      })
    }
    if (payment.priorityPickup) {
      addons.push({
        code: "priorityPickup",
        label: t("addons.priorityPickup.title"),
        price: priorityPickupPrice,
      })
    }
    if (payment.comfortConnection) {
      addons.push({
        code: "comfortPack",
        label: t("addons.comfortPack.title"),
        price: comfortPackPrice,
      })
    }
    return addons
  }, [
    payment.premiumInsurance,
    payment.refundTerms,
    payment.priorityPickup,
    payment.comfortConnection,
    airportGuaranteePrice,
    meetGreetPrice,
    priorityPickupPrice,
    comfortPackPrice,
    t,
  ])

  const handlePay = async () => {
    setSubmitError("")
    if (!orderId) {
      setSubmitError(t("orderNotInitialized"))
      return
    }
    if (!selectedVehicle) {
      setSubmitError(t("vehicleMissing"))
      return
    }

    const mapMethod = (m: UiPaymentMethod): BackendPaymentMethod => {
      if (m === "mbway") return "mbway"
      if (m === "multibanco") return "mb"
      if (m === "cash") return "cash"
      return "ccard"
    }

    const method = mapMethod(payment.method)

    updatePayment({ acceptTerms: true })

    const totalAmount = totalToPay
    const basePrice = priceBreakdown.transferPrice
    const taxAmount = priceBreakdown.tax

    const outboundAmount = isRoundTrip ? totalAmount / 2 : totalAmount
    const returnAmount = isRoundTrip ? totalAmount / 2 : 0
    const outboundBasePrice = isRoundTrip ? basePrice / 2 : basePrice
    const returnBasePrice = isRoundTrip ? basePrice / 2 : 0
    const outboundTax = isRoundTrip ? taxAmount / 2 : taxAmount
    const returnTax = isRoundTrip ? taxAmount / 2 : 0

    const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
    const successUrl = `${baseUrl}/checkout?success=true`
    const errorUrl = `${baseUrl}/checkout?success=false`
    const cancelUrl = `${baseUrl}/checkout?success=false`

    const payload: StartPaymentRequest = {
      /* The route priced on screen: it can change after the trip step. */
      distance: state.distance ?? undefined,
      routeDurationMinutes: state.routeDuration ?? undefined,
      amount: outboundAmount,
      amountReturn: returnAmount,
      basePrice: outboundBasePrice,
      basePriceReturn: returnBasePrice,
      discountAmount: 0,
      discountAmountReturn: 0,
      additionalFees: outboundTax,
      additionalFeesReturn: returnTax,
      nightTax: selectedVehicle.nightTaxOutbound ?? 0,
      nightTaxReturn: selectedVehicle.nightTaxReturn ?? 0,
      airportServiceFee: 0,
      cancellationFee: 0,
      refundFee: priceBreakdown.refundTax,
      refundToOriginalPaymentMethod: payment.agreeRefund,
      nif: passenger.nif?.trim() ? passenger.nif.trim() : undefined,
      phoneNumber: (() => {
        if (method === "mbway" && payment.mbwayPhone?.trim()) {
          return payment.mbwayPhone.trim()
        }
        const contactPhone = passenger.isMainPassenger ? passenger.phone : passenger.passengerPhone
        return contactPhone?.trim() ? contactPhone.trim() : undefined
      })(),
      email: passenger.email?.trim() ? passenger.email.trim() : undefined,
      driverNotes: payment.specialRequest?.trim() ? payment.specialRequest.trim() : undefined,
      selectedCheckoutAddons: selectedCheckoutAddons?.length ? selectedCheckoutAddons : undefined,
      // Todos os métodos Stripe são redirect → enviar sempre os URLs de retorno.
      successUrl,
      errorUrl,
      cancelUrl,
      language: locale === "pt" ? "pt" : "en",
    }

    setIsSubmitting(true)
    try {
      if (experiences.length > 0) {
        let convexOrderIdForExp = (orderObj as { _id?: string })?._id
        if (!convexOrderIdForExp && typeof orderId === "string" && !orderId.startsWith("j")) {
          const orderByNum = await convex.query(api.orders.getByOrderNumber, { orderNumber: orderId })
          convexOrderIdForExp = orderByNum?._id
        }
        if (convexOrderIdForExp) {
          await convex.mutation(api.orders.setPendingCheckoutExperiences, {
            orderId: convexOrderIdForExp as Id<"orders">,
            experiences: experiences.map(toPendingExperience),
          })
        }
      }

      const resp = (await startPayment(convex, orderId, method, payload)) as {
        checkoutUrl?: string
        success?: boolean
      }

      // Cash: pago presencialmente — sem Stripe.
      if (method === "cash") {
        submitCheckout()
        setIsSubmitting(false)
        setStep(confirmationStep)
        return
      }

      // Cartão / MB WAY / Multibanco → Stripe Checkout (hosted). O webhook confirma o
      // pagamento; ao voltar para ?success=true mostramos a confirmação.
      if (resp?.checkoutUrl) {
        window.location.href = resp.checkoutUrl
        return
      }
      throw new Error("Checkout URL not received from payment provider")
    } catch (e: any) {
      /* O cliente via "[CONVEX A(orders:startPaymentAction)] [Request ID: …]
         Server Error": o e.message de um erro do servidor é o técnico. O
         motivo escrito para o cliente vem no data do ConvexError. */
      setSubmitError(e instanceof ConvexError && typeof e.data === "string" ? e.data : t("paymentError"))
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (currentStep === confirmationStep) return
    if (payment.method === "mbway") return
    if (orderStatus?.paymentStatus === "completed") {
      submitCheckout()
      setIsSubmitting(false)
      setStep(confirmationStep)
    } else if (orderStatus?.paymentStatus === "failed") {
      setSubmitError(t("paymentFailed"))
      setIsSubmitting(false)
    }
  }, [
    orderStatus?.paymentStatus,
    submitCheckout,
    setStep,
    t,
    currentStep,
    orderStatus,
    payment.method,
    confirmationStep,
  ])

  const addLabel = t("addAddon")
  const removeLabel = tCommon("remove")

  const addons: AddonCardProps[] = [
    {
      icon: <Shield className="w-5 h-5" strokeWidth={2} />,
      title: t("addons.airportGuarantee.title"),
      subtitle: t("addons.airportGuarantee.subtitle"),
      bullets: [
        t("addons.airportGuarantee.b1"),
        t("addons.airportGuarantee.b2"),
        t("addons.airportGuarantee.b3"),
      ],
      priceLabel: `+€${insurancePrice("premiumInsurance", isRoundTrip)}`,
      active: payment.premiumInsurance,
      onToggle: () => updatePayment({ premiumInsurance: !payment.premiumInsurance }),
      badge: t("addons.airportGuarantee.badge"),
      addLabel,
      removeLabel,
    },
    {
      icon: <Users className="w-5 h-5" strokeWidth={2} />,
      title: t("addons.meetGreet.title"),
      subtitle: t("addons.meetGreet.subtitle"),
      bullets: [
        t("addons.meetGreet.b1"),
        t("addons.meetGreet.b2"),
        t("addons.meetGreet.b3"),
      ],
      priceLabel: `+€${insurancePrice("refundTerms", isRoundTrip)}`,
      active: payment.refundTerms,
      onToggle: () => updatePayment({ refundTerms: !payment.refundTerms }),
      addLabel,
      removeLabel,
      tagline: t("addons.meetGreet.tagline"),
    },
    {
      icon: <Clock className="w-5 h-5" strokeWidth={2} />,
      title: t("addons.priorityPickup.title"),
      subtitle: t("addons.priorityPickup.subtitle"),
      bullets: [
        t("addons.priorityPickup.b1"),
        t("addons.priorityPickup.b2"),
        t("addons.priorityPickup.b3"),
      ],
      priceLabel: `+€${insurancePrice("priorityPickup", isRoundTrip)}`,
      active: payment.priorityPickup,
      onToggle: () => updatePayment({ priorityPickup: !payment.priorityPickup }),
      addLabel,
      removeLabel,
    },
    {
      icon: <Package className="w-5 h-5" strokeWidth={2} />,
      title: t("addons.comfortPack.title"),
      subtitle: t("addons.comfortPack.subtitle"),
      bullets: [
        t("addons.comfortPack.b1"),
        t("addons.comfortPack.b2"),
        t("addons.comfortPack.b3"),
      ],
      priceLabel: `+€${insurancePrice("comfortConnection", isRoundTrip)}`,
      active: payment.comfortConnection,
      onToggle: () => updatePayment({ comfortConnection: !payment.comfortConnection }),
      addLabel,
      removeLabel,
    },
  ]

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1
        className="text-[24px] font-semibold leading-none text-[var(--ck-text,#f7f4ef)]"
        style={SERIF_FONT}
      >
        {t("title")}
      </h1>

      <SectionLabel>{t("addonsHeading")}</SectionLabel>

      <div className="flex flex-col gap-4">
        {addons.map((a) => (
          <AddonCard key={a.title} {...a} />
        ))}
      </div>

      <div className="flex flex-col gap-4 pt-2">
        <SectionLabel>{t("tipHeading")}</SectionLabel>
        <div className="flex items-center gap-[10px]">
          {tipOptions.map((opt) => (
            <TipChip
              key={opt.percent}
              label={opt.label}
              selected={tipPercent === opt.percent}
              onClick={() =>
                handleTipSelect(
                  opt.percent,
                  opt.percent >= 0 ? Math.round((baseTotalPrice * opt.percent) / 100) : 0,
                )
              }
            />
          ))}
        </div>
        <AnimatedCollapse isOpen={tipPercent === -1}>
          <div
            className={cn(
              "transition-[opacity,transform] duration-300 ease-out pt-1",
              tipPercent === -1 ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
            )}
          >
            <label className="block text-[12px] text-[var(--ck-text-muted,#999999)] mb-1">{t("tipCustomPercent")}</label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className="w-full h-[44px] px-[13px] bg-[var(--ck-surface,#1e1d1b)] border border-[var(--ck-border,rgba(var(--ck-text-rgb,255,255,255),0.12))] text-[14px] text-[var(--ck-text,#f7f4ef)] placeholder:text-[var(--ck-text-subtle,#696969)] focus:outline-none focus:border-[var(--ck-accent,#c9a96e)] transition-colors"
              placeholder="e.g. 5"
              onChange={(e) => {
                const p = parseFloat(e.target.value) || 0
                handleTipSelect(-1, Math.round((baseTotalPrice * p) / 100))
              }}
            />
          </div>
        </AnimatedCollapse>
      </div>

      <div className="flex flex-col gap-4 pt-2">
        <SectionLabel>{t("specialRequestHeading")}</SectionLabel>
        <textarea
          value={payment.specialRequest}
          onChange={(e) => updatePayment({ specialRequest: e.target.value })}
          placeholder={t("specialRequestPlaceholderNew")}
          className="w-full min-h-[80px] px-4 py-2 bg-[var(--ck-surface,#1e1d1b)] border border-[var(--ck-border,rgba(var(--ck-text-rgb,255,255,255),0.12))] text-[14px] text-[var(--ck-text,#f7f4ef)] placeholder:text-[var(--ck-text-subtle,#696969)] focus:outline-none focus:border-[var(--ck-accent,#c9a96e)] transition-colors resize-none"
        />
      </div>

      <div className="flex items-center gap-3 bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.07)] border border-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.22)] px-4 py-2">
        <ShieldCheck className="w-6 h-6 text-[var(--ck-accent,#c9a96e)] shrink-0" strokeWidth={2} />
        <p className="text-[12px] text-[var(--ck-text,#f7f4ef)] leading-[18px]">
          <span className="font-semibold">{t("sslBannerLead")} </span>
          {t("sslBannerMid")}{" "}
          <Link href="/terms-and-conditions" target="_blank" className="text-[var(--ck-accent,#c9a96e)] underline">
            {t("termsAndConditions")}
          </Link>{" "}
          {t("acceptTermsAnd")}{" "}
          <Link href="/refund" target="_blank" className="text-[var(--ck-accent,#c9a96e)] underline">
            {t("privacyPolicy")}
          </Link>
          .
        </p>
      </div>

      <button
        type="button"
        onClick={handlePay}
        disabled={isSubmitting}
        className="h-12 w-full bg-[var(--ck-accent,#c9a96e)] border border-[var(--ck-accent,#c9a96e)] text-[var(--ck-bg,#0d0d0d)] text-[14px] font-medium uppercase tracking-[1.1px] inline-flex items-center justify-center gap-1 hover:bg-[var(--ck-accent-hover,#b89558)] hover:border-[var(--ck-accent-hover,#b89558)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{t("payButton")}</span>
        <span className="font-bold">€{Math.round(totalToPay)}</span>
      </button>

      <AnimatedCollapse isOpen={!!submitError}>
        <div
          className={cn(
            "text-[13px] text-[#E32828] transition-[opacity,transform] duration-300 ease-out",
            submitError ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
          )}
          aria-live="polite"
        >
          {submitError}
        </div>
      </AnimatedCollapse>

      <div className="pt-2">
        <button
          type="button"
          onClick={onBack}
          className="h-12 px-8 border border-[var(--ck-text-muted,#999999)] text-[var(--ck-text-muted,#999999)] text-[14px] font-medium uppercase tracking-[1.1px] inline-flex items-center gap-2 hover:border-[var(--ck-text,#f7f4ef)] hover:text-[var(--ck-text,#f7f4ef)] transition-colors"
        >
          <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={2} />
          <span className="px-2">{tCommon("back")}</span>
        </button>
      </div>
    </div>
  )
}
