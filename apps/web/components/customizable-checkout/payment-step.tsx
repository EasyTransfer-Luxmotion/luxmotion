"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { ChevronDown, X, Lock, CheckCircle2, CreditCard, Calendar, MessageSquare, ShieldCheck, Info } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { InputWithIcon } from "@/components/ui/input-with-icon"
import { InsuranceOptionCard, AnimatedCollapse, FormField } from "@/components/customizable-checkout/shared"
import { PhoneInput } from "@/components/ui/phone-input"
import { useTranslations, useLocale } from "next-intl"
import { useCheckout } from "@/components/customizable-checkout/checkout-context"
import { usePartnershipSlug } from "@/components/customizable-checkout/checkout-page"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { calculatePriceBreakdown } from "@/lib/format"
import { insurancePrice, calcExtras } from "@/components/customizable-checkout/pricing"
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
import { cdn } from "@/lib/cdn"

type UiPaymentMethod = "cartao" | "cash" | "multibanco" | "mbway"

interface PaymentStepProps {
  onContinue: () => void
}

export function PaymentStep({ onContinue }: PaymentStepProps) {
  const convex = useConvex()
  const locale = useLocale()
  const t = useTranslations("payment")
  const tTransfer = useTranslations("transfer")
  const tCommon = useTranslations("common")
  const { state, updatePayment, setTip, submitCheckout, setStep } = useCheckout()
  const { payment, orderId, selectedVehicle, passenger, transfer, currentStep, experiences, order: orderObj, hasNearbyTours } = state
  const confirmationStep = hasNearbyTours ? 5 : 4
  const partnershipSlug = usePartnershipSlug()
  
  // Subscribe to order status (substitui WebSocket)
  const orderStatus = useSubscribeToOrderStatus(orderId ? String(orderId) : null)

  const [extrasExpanded, setExtrasExpanded] = useState(false)
  const [roundTripPopoverRefund, setRoundTripPopoverRefund] = useState(false)
  const [roundTripPopoverComfort, setRoundTripPopoverComfort] = useState(false)
  const isMobile = useIsMobile()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [paymentData, setPaymentData] = useState<{
    entity?: string
    reference?: string
    amount?: number
    mbwayMessage?: string
  } | null>(null)

  const isRoundTrip = transfer.bookReturn // Se bookReturn está marcado, é round trip (independente da aba)
  const baseVehiclePrice = selectedVehicle?.price ?? 0
  const baseTotalPrice = baseVehiclePrice
  // Se for round trip, dobrar insurance e refund terms
  // All add-on prices come from the shared ./pricing module (single source of truth) so the
  // option cards, the invoice and the charge can never drift apart.
  const premiumInsurancePrice = payment.premiumInsurance ? insurancePrice("premiumInsurance", isRoundTrip) : 0
  const refundTermsPrice = payment.refundTerms ? insurancePrice("refundTerms", isRoundTrip) : 0
  const comfortConnectionPrice = payment.comfortConnection ? insurancePrice("comfortConnection", isRoundTrip) : 0
  const insuranceTotal = premiumInsurancePrice + refundTermsPrice + comfortConnectionPrice
  const cardFeeRate = 0

  // Luggage extras (child seats / surfboards / pets) — same helper the summary uses, so the
  // charged amount always == the displayed invoice. (Surfboards were shown but never charged.)
  const extrasTotal = calcExtras(transfer, isRoundTrip).total

  // Price breakdown with all fees + extras included in rounding (clean whole-number total).
  const priceBreakdown = useMemo(() => calculatePriceBreakdown({
    basePrice: baseTotalPrice,
    cardFeeRate,
    insuranceTotal: insuranceTotal + extrasTotal,
  }), [baseTotalPrice, cardFeeRate, insuranceTotal, extrasTotal])

  // Tip logic
  const { tipPercent, tipAmount } = state
  const tipOptions = [
    { percent: 0, label: "0%" },
    { percent: 10, label: "10%" },
    { percent: 20, label: "20%" },
    { percent: -1, label: t("tipCustom") },
  ]

  // Initialize tip amount when base price changes and tip percent is set
  useEffect(() => {
    if (tipPercent > 0) {
      const amount = Math.round((baseTotalPrice * tipPercent) / 100)
      if (amount !== tipAmount) {
        setTip(tipPercent, amount)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseTotalPrice])

  const handleTipSelect = useCallback((percent: number, customValue?: number) => {
    if (percent >= 0) {
      const amount = Math.round((baseTotalPrice * percent) / 100)
      setTip(percent, amount)
    } else {
      setTip(percent, customValue ?? 0)
    }
  }, [baseTotalPrice, setTip])

  const premiumBenefits = [
    { text: t("cancelUpTo4h") },
    { text: t("fullRefund"), subtext: t("fullRefundDesc") },
    { text: t("dateTimeChangeFree") },
  ]

  const refundBenefits = [
    { text: t("covidInfection"), subtext: t("byCovid") },
    { text: t("illnessOrInjury") },
    { text: t("preExistingConditions"), subtext: t("preExistingDesc") },
    { text: t("familyDeath"), subtext: t("familyDeathDesc") },
  ]

  const selectedCheckoutAddons = useMemo(() => {
    const addons: StartPaymentRequest["selectedCheckoutAddons"] = []
    if (payment.premiumInsurance) {
      addons.push({
        code: "premiumInsurance",
        label: t("premiumInsurance"),
        price: premiumInsurancePrice,
      })
    }
    if (payment.refundTerms) {
      addons.push({
        code: "refundTerms",
        label: t("refundTerms"),
        price: refundTermsPrice,
      })
    }
    if (payment.comfortConnection) {
      addons.push({
        code: "comfortConnection",
        label: t("comfortConnection"),
        price: comfortConnectionPrice,
      })
    }
    return addons
  }, [
    comfortConnectionPrice,
    payment.comfortConnection,
    payment.premiumInsurance,
    payment.refundTerms,
    premiumInsurancePrice,
    refundTermsPrice,
    t,
  ])

  const handlePay = async () => {
    setSubmitError("")
    setStatusMessage("")
    if (!orderId) {
      setSubmitError(t("orderNotInitialized") || "Order is not initialized yet.")
      return
    }
    if (!selectedVehicle) {
      setSubmitError(t("vehicleMissing") || "Vehicle is missing.")
      return
    }

    const mapMethod = (m: UiPaymentMethod): BackendPaymentMethod => {
      if (m === "mbway") return "mbway"
      if (m === "cash") return "cash"
      return "ccard"
    }

    const method = mapMethod(payment.method)
    
    // MB WAY: o número é recolhido na página do Stripe — sem validação aqui.

    // Use the pre-calculated values from priceBreakdown (all fees included in rounding).
    // Upsell experiences are billed in THIS payment (added flat, untaxed — same as the
    // order summary's `total + experiencesTotal`). Required: on confirmation, payments.ts
    // creates each experience booking already marked "paid"/"completed", assuming this
    // transfer charge covered it — so it must be included in the amount, or they ship free.
    const experiencesTotal = experiences.reduce((sum, exp) => sum + exp.totalPrice, 0)
    // Charge = transfer + upsell experiences + gratuity, matching the order summary's
    // totalPriceWithExtras (priceBreakdownWithExtras.total + experiencesTotal + tipAmount).
    // The tip was shown in the summary but never added to the charged amount.
    const totalAmount = priceBreakdown.total + experiencesTotal + tipAmount
    const basePrice = priceBreakdown.transferPrice + experiencesTotal
    const taxAmount = priceBreakdown.tax

    const outboundAmount = isRoundTrip ? totalAmount / 2 : totalAmount
    const returnAmount = isRoundTrip ? totalAmount / 2 : 0
    const outboundBasePrice = isRoundTrip ? basePrice / 2 : basePrice
    const returnBasePrice = isRoundTrip ? basePrice / 2 : 0

    const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
    // Include partnership slug in payment return URLs if we're in a partnership checkout
    const partnerPath = partnershipSlug ? `/${partnershipSlug}` : ""
    const successUrl = `${baseUrl}${partnerPath}/checkout?success=true`
    const errorUrl = `${baseUrl}${partnerPath}/checkout?success=false`
    const cancelUrl = `${baseUrl}${partnerPath}/checkout?success=false`

    // Fees da ida e da volta separadas (na ida não guardar o total das fees)
    const outboundTax = isRoundTrip ? taxAmount / 2 : taxAmount
    const returnTax = isRoundTrip ? taxAmount / 2 : 0

    const payload: StartPaymentRequest = {
      amount: outboundAmount,
      amountReturn: returnAmount,
      basePrice: outboundBasePrice,
      basePriceReturn: returnBasePrice,
      discountAmount: 0,
      discountAmountReturn: 0,
      additionalFees: outboundTax, // Só fees da ida
      additionalFeesReturn: returnTax, // Só fees da volta
      nightTax: selectedVehicle.nightTaxOutbound ?? 0,
      nightTaxReturn: selectedVehicle.nightTaxReturn ?? 0,
      airportServiceFee: 0,
      cancellationFee: 0,
      refundFee: priceBreakdown.refundTax,
      refundToOriginalPaymentMethod: payment.agreeRefund,
      nif: passenger.nif?.trim() ? passenger.nif.trim() : undefined,
       phoneNumber: (() => {
        if (method === "mbway" && payment.mbwayPhone?.trim()) {
          return payment.mbwayPhone.trim();
        }
        const contactPhone = passenger.isMainPassenger ? passenger.phone : passenger.passengerPhone;
        return contactPhone?.trim() ? contactPhone.trim() : undefined;
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
      // Guardar tours/experiências do upsell na order antes de iniciar pagamento (para criar orders após confirmação)
      if (experiences.length > 0) {
        let convexOrderIdForExp = (orderObj as { _id?: string })?. _id
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

      const resp = await startPayment(convex, orderId, method, payload) as { checkoutUrl?: string; success?: boolean }

      // Cash: pago presencialmente — sem Stripe.
      if (method === "cash") {
        submitCheckout()
        setIsSubmitting(false)
        setStep(confirmationStep)
        return
      }

      // Cartão / MB WAY / Multibanco → Stripe Checkout (hosted).
      if (resp?.checkoutUrl) {
        window.location.href = resp.checkoutUrl
        return
      }
      throw new Error("Checkout URL not received from payment provider")
    } catch (e: any) {
      setSubmitError(e?.message || t("paymentError") || "An error occurred during payment. Please try again.")
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (currentStep === confirmationStep) {
      return
    }
    
    if (payment.method === "mbway") {
      return
    }
    if (orderStatus) {
      console.log("[PaymentStep] Order status updated:", {
        paymentStatus: orderStatus.paymentStatus,
        status: orderStatus.status,
        orderNumber: orderStatus.orderNumber,
      })
    }
    
    if (orderStatus?.paymentStatus === "completed") {
      submitCheckout()
      setIsSubmitting(false)
      setStep(confirmationStep)
    } else if (orderStatus?.paymentStatus === "failed") {
      console.log("[PaymentStep] Payment failed")
      setSubmitError(t("paymentFailed") || "Payment failed")
      setIsSubmitting(false)
    }
  }, [orderStatus?.paymentStatus, submitCheckout, setStep, t, currentStep, orderStatus, payment.method, confirmationStep])

  return (
    <div className="w-full">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-[22px] font-bold text-[#222222] mb-6">{t("title")}</h2>

        {paymentData && (
          <div className="mb-8 p-6 bg-[#f0f9ff] border-2 border-[#27c7ff] rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
            <h3 className="text-lg font-bold text-[#0e4659] mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-[#27c7ff]" />
              {t("mbwayTitle")}
            </h3>
            
            {payment.method === "mbway" && (
              <div className="text-center py-4">
                <div className="mb-4 flex justify-center">
                  <Image
                    src="/shared/payments/mbway-checkout.png"
                    alt="MBWay"
                    width={300}
                    height={200}
                    className="w-full max-w-[300px] h-auto object-contain"
                  />
                </div>
                <p className="text-[#222222] font-semibold text-lg leading-relaxed">
                  {paymentData.mbwayMessage || t("mbwayInstructions")}
                </p>
                <div className="mt-4 flex justify-center">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 border-4 border-[#27c7ff] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                </div>
              </div>
            )}
            
            <p className="mt-4 text-sm text-[#177799] italic text-center">
              {t("awaitingConfirmation")}
            </p>
          </div>
        )}

        {/* Tip section */}
        <div className="mb-6 border border-[#e0e0e0] rounded-lg p-5">
          <h3 className="text-[15px] font-bold text-[#222222] mb-3">{t("addTip")}</h3>
          <div className="flex gap-2">
            {tipOptions.map((opt) => (
              <button
                key={opt.percent}
                type="button"
                onClick={() => handleTipSelect(opt.percent, opt.percent >= 0 ? Math.round((baseTotalPrice * opt.percent) / 100) : 0)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors text-center ${
                  tipPercent === opt.percent
                    ? "border-[#27c7ff] bg-[#e0f4fc] text-[#0e4659]"
                    : "border-[#e8eaed] bg-white text-[#222222] hover:border-[#27c7ff]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {tipPercent === -1 && (
            <div className="mt-3">
              <label className="block text-xs text-[#808080] mb-1">{t("tipCustomPercent")}</label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className="w-full border border-[#e8eaed] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#27c7ff]"
                placeholder="e.g. 5"
                onChange={(e) => {
                  const p = parseFloat(e.target.value) || 0
                  handleTipSelect(-1, Math.round((baseTotalPrice * p) / 100))
                }}
              />
            </div>
          )}
        </div>

        {payment.method === "cartao" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <span className="text-[14px] text-[#808080]">{t("cardFee")}</span>
              <span className="text-[16px] font-semibold text-[#222222]">
                € {priceBreakdown.cardFee.toFixed(2).replace(".", ",")}
              </span>
            </div>

            <FormField label={t("cardNumber")} required>
              <InputWithIcon
                icon={<CreditCard className="w-5 h-5" />}
                value={payment.cardNumber}
                onChange={(v) => updatePayment({ cardNumber: v })}
                placeholder={t("cardPlaceholder")}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <FormField label={t("expiry")} required className="mb-0">
                <InputWithIcon
                  icon={<Calendar className="w-5 h-5" />}
                  value={payment.expiry}
                  onChange={(v) => updatePayment({ expiry: v })}
                  placeholder={t("expiryPlaceholder")}
                />
              </FormField>

              <FormField label={t("cvc")} required className="mb-0">
                <InputWithIcon
                  icon={<Lock className="w-5 h-5" />}
                  value={payment.cvc}
                  onChange={(v) => updatePayment({ cvc: v })}
                  placeholder={t("cvcPlaceholder")}
                />
              </FormField>
            </div>
          </>
        )}

        {payment.method === "mbway" && (
          <div className="mb-6">
            <label className="block text-[15px] font-semibold text-[#222222] mb-2">MB Way</label>
            <PhoneInput
              value={payment.mbwayPhone}
              onChange={(v) => updatePayment({ mbwayPhone: v })}
              defaultCountry="pt"
              placeholder="910 000 000"
            />
          </div>
        )}

        <div className="mb-6 rounded-lg border border-[#e0e0e0] overflow-hidden">
          <button
            onClick={() => setExtrasExpanded(!extrasExpanded)}
            className={`w-full flex items-center justify-between ${isMobile ? "bg-[#e9f9ff] px-4 py-3" : "bg-[#dff7ff] p-4 hover:bg-[#d0f4ff]"} transition-all ${extrasExpanded ? "" : "rounded-lg"}`}
          >
            <h3 className={`font-bold text-[#222222] ${isMobile ? "text-[16px]" : "text-[15px]"}`}>{t("extras")}</h3>
            <ChevronDown
              className={`w-5 h-5 text-[#27c7ff] transition-transform duration-300 ${extrasExpanded ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatedCollapse isOpen={extrasExpanded}>
            <div className={`bg-white ${isMobile ? "px-4 pb-4 pt-2" : "p-4"}`}>
              {isMobile ? (
                <div className="border border-[#f7f7f7] rounded-[8px] p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-[54px] h-[54px] rounded-[3px] overflow-hidden flex-shrink-0 -mt-1 -ml-1">
                      <Image
                        src={cdn("/shared/extras.png")}
                        alt={t("comfortConnection")}
                        width={54}
                        height={54}
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-[14px] font-bold text-[#222222] leading-tight mb-1">
                        {t("comfortConnection")} ({t("comfortConnectionPrice")})
                      </h4>
                      <ul className="list-disc text-[12px] text-[#222222] space-y-0.5 ml-4">
                        <li>{t("freshWater")}</li>
                        <li>{t("unlimitedWifi")}</li>
                        <li>{t("chargers")}</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3 flex-wrap">
                    {isRoundTrip && (
                      <span className="inline-flex shrink-0">
                        <Popover open={roundTripPopoverRefund} onOpenChange={setRoundTripPopoverRefund} modal={false}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-[#dff7ff] border border-[#27c7ff]/40 text-[#27c7ff] hover:bg-[#c5eef9] focus:outline-none focus:ring-2 focus:ring-[#27c7ff] focus:ring-offset-1 shrink-0 touch-manipulation"
                              aria-label={tTransfer("extrasRoundTripTooltip")}
                            >
                              <Info className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent side="bottom" sideOffset={6} align="start" className="max-w-[280px] text-left z-[100] !bg-white !text-[#222222] shadow-lg border border-[#e0e0e0] text-sm p-3">
                            {tTransfer("extrasRoundTripTooltip")}
                          </PopoverContent>
                        </Popover>
                      </span>
                    )}
                    <Button 
                      onClick={() => updatePayment({ comfortConnection: !payment.comfortConnection })}
                      className={payment.comfortConnection 
                        ? "bg-[#d60510] hover:bg-[#b0040d] text-white h-9 px-5 text-[14px] font-bold uppercase rounded-[8px]"
                        : "bg-[#27c7ff] hover:bg-[#23b3e6] text-white h-9 px-5 text-[14px] font-bold uppercase rounded-[8px]"
                      }
                    >
                      {payment.comfortConnection ? tCommon("remove")?.toUpperCase() || "REMOVE" : tCommon("upgrade").toUpperCase()}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="w-[60px] h-[60px] rounded overflow-hidden flex-shrink-0">
                    <Image
                      src={cdn("/shared/extras.png")}
                      alt={t("comfortConnection")}
                      width={60}
                      height={60}
                      unoptimized
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-[15px] font-bold text-[#222222] mb-1">
                      {t("comfortConnection")} ({t("comfortConnectionPrice")})
                    </h4>
                    <ul className="text-[13px] text-[#222222] space-y-0.5">
                      <li>• {t("freshWater")}</li>
                      <li>• {t("unlimitedWifi")}</li>
                      <li>• {t("chargers")}</li>
                    </ul>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button 
                      onClick={() => updatePayment({ comfortConnection: !payment.comfortConnection })}
                      className={payment.comfortConnection 
                        ? "bg-[#d60510] hover:bg-[#b0040d] text-white h-8 px-4 text-[13px] font-bold rounded"
                        : "bg-[#27c7ff] hover:bg-[#23b3e6] text-white h-8 px-4 text-[13px] font-bold rounded"
                      }
                    >
                      {payment.comfortConnection ? tCommon("remove")?.toUpperCase() || "REMOVE" : tCommon("upgrade").toUpperCase()}
                    </Button>
                    <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                      {isRoundTrip && (
                        <span className="inline-flex shrink-0">
                          <span className="md:hidden">
                            <Popover open={roundTripPopoverComfort} onOpenChange={setRoundTripPopoverComfort} modal={false}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-[#dff7ff] border border-[#27c7ff]/40 text-[#27c7ff] hover:bg-[#c5eef9] focus:outline-none focus:ring-2 focus:ring-[#27c7ff] focus:ring-offset-1 shrink-0 touch-manipulation"
                                  aria-label={tTransfer("extrasRoundTripTooltip")}
                                >
                                  <Info className="w-4 h-4" strokeWidth={2.5} />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="bottom" sideOffset={6} align="start" className="max-w-[280px] text-left z-[100] !bg-white !text-[#222222] shadow-lg border border-[#e0e0e0] text-sm p-3">
                                {tTransfer("extrasRoundTripTooltip")}
                              </PopoverContent>
                            </Popover>
                          </span>
                          <span className="hidden md:inline-flex">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#dff7ff] border border-[#27c7ff]/40 text-[#27c7ff] hover:bg-[#c5eef9] focus:outline-none focus:ring-2 focus:ring-[#27c7ff] focus:ring-offset-1 shrink-0"
                                  aria-label={tTransfer("extrasRoundTripTooltip")}
                                >
                                  <Info className="w-4 h-4" strokeWidth={2.5} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" sideOffset={6} className="max-w-[260px] text-left z-[100] !bg-white !text-[#222222] shadow-lg border border-[#e0e0e0] [&>svg]:!fill-white [&>svg]:!stroke-white">
                                {tTransfer("extrasRoundTripTooltip")}
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </span>
                      )}
                      <span className="text-[15px] font-bold text-[#222222] whitespace-nowrap">+€ {insurancePrice("comfortConnection", isRoundTrip)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AnimatedCollapse>
        </div>

        <div className="mb-6 border border-[#e0e0e0] rounded-lg p-5">
          <h3 className="text-[15px] font-bold text-[#222222] mb-3">{t("discountCoupon")}</h3>
          <div className="relative">
            <InputWithIcon
              icon={<span />}
              value={payment.coupon}
              onChange={(v) => updatePayment({ coupon: v })}
              placeholder={t("couponPlaceholder")}
              containerClassName="[&>div:first-child]:hidden"
              inputClassName="pl-4"
              rightIcon={
                <button type="button">
                  <CheckCircle2 className="size-8 text-[#27c7ff]" />
                </button>
              }
            />
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-[15px] font-bold text-[#222222] mb-3">{t("specialRequest")}</h3>
          <div className="relative">
            <MessageSquare className="absolute left-3 top-3.5 w-5 h-5 text-[#bfbfbf]" />
            <textarea
              value={payment.specialRequest}
              onChange={(e) => updatePayment({ specialRequest: e.target.value })}
              placeholder={t("specialRequestPlaceholder")}
              className="w-full min-h-[100px] pl-10 pr-10 py-3 border border-[#e0e0e0] rounded-lg text-[15px] text-[#222222] placeholder:text-[#a2a2a2] resize-none focus:outline-none focus:ring-2 focus:ring-[#27c7ff]"
            />
            {payment.specialRequest && (
              <button
                type="button"
                onClick={() => updatePayment({ specialRequest: "" })}
                className="absolute right-3 top-3 w-5 h-5 text-[#bfbfbf] hover:text-[#808080] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-[#e0e0e0] mb-6" />

        <div className="mb-6">
          <div className="flex items-start gap-3 bg-[#e9f9ff] p-3 rounded-lg">
            <Checkbox
              id="refund"
              checked={payment.agreeRefund}
              onCheckedChange={(checked: boolean) => updatePayment({ agreeRefund: checked })}
              className="mt-0.5"
            />
            <label htmlFor="refund" className="text-[14px] text-[#0e4659] leading-relaxed">
              <span className="font-bold">{t("refundToOriginal")}</span>
              <br />
              {t("refundToOriginalDesc")}
            </label>
          </div>
        </div>

        <div className="mb-6">
          <InsuranceOptionCard
            id="premium"
            title={t("premiumInsurance")}
            price={`€ ${insurancePrice("premiumInsurance", isRoundTrip)}`}
            subtitle={t("cancellationProtection")}
            benefits={premiumBenefits}
            checked={payment.premiumInsurance}
            onCheckedChange={(v) => updatePayment({ premiumInsurance: v })}
            recommendedLabel={tCommon("recommended")}
          />
        </div>

        <div className="mb-6">
          <InsuranceOptionCard
            id="terms-refund"
            title={t("refundTerms")}
            price={`€ ${insurancePrice("refundTerms", isRoundTrip)}`}
            subtitle={t("refundTermsDesc")}
            benefits={refundBenefits}
            checked={payment.refundTerms}
            onCheckedChange={(v) => updatePayment({ refundTerms: v })}
            recommendedLabel={tCommon("recommended")}
          />
        </div>

        <div className="flex items-center gap-4 bg-[#e9f9ff] border border-[#1d95bf] rounded-[8px] p-4 mb-6">
          <div className="shrink-0 w-8 h-8">
            <ShieldCheck className="w-full h-full text-[#0e4659]" />
          </div>
          <p className="flex-1 text-[16px] font-bold text-[#0e4659] leading-[1.2] tracking-[0.16px]">
            {t("sslProtection")}
          </p>
          <div className="shrink-0 w-[1.5px] h-[44px] bg-[#9a9a9a]" />
          <p className="flex-1 text-[14px] text-[#177799] leading-[1.2] tracking-[0.12px]">{t("termsAcceptance")}</p>
        </div>

        <div className="flex items-start gap-3 mb-6">
          <Checkbox
            id="accept-terms"
            checked={payment.acceptTerms}
            onCheckedChange={(checked: boolean) => updatePayment({ acceptTerms: checked })}
            className="mt-0.5"
          />
          <label htmlFor="accept-terms" className="text-[14px] text-[#222222] leading-relaxed">
            {t("acceptTermsLabel")}{" "}
            <Link href="/terms-and-conditions" target="_blank" className="text-[#27c7ff] underline">
              {t("termsAndConditions")}
            </Link>{" "}
            {t("acceptTermsAnd")}{" "}
            <Link href="/refund" target="_blank" className="text-[#27c7ff] underline">
              {t("refundPolicy")}
            </Link>
          </label>
        </div>

        <Button
          onClick={handlePay}
          disabled={isSubmitting || !payment.acceptTerms}
          className="w-full bg-[#27c7ff] hover:bg-[#23b3e6] text-white h-14 text-[16px] font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Lock className="w-5 h-5 mr-2" />
          {t("payButton")}
        </Button>

        {submitError && (
          <div className="mt-3 text-[13px] text-[#d60510]" aria-live="polite">
            {submitError}
          </div>
        )}

        {!submitError && statusMessage && (
          <div className="mt-3 text-[13px] text-[#404040]" aria-live="polite">
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  )
}
