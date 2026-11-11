"use client"

import { Check, Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { useTranslations } from "next-intl"
import { useCheckout } from "@/components/customizable-checkout/checkout-context"
import { usePartnershipSlug } from "@/components/customizable-checkout/checkout-page"
import { useCheckoutPaymentOutcome } from "@/hooks/use-checkout-payment-outcome"
import { CheckoutStepLayout } from "@/components/customizable-checkout/shared/checkout-step-layout"

export function ConfirmationModal({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations("confirmation")
  const router = useRouter()
  const { resetCheckout, state } = useCheckout()
  const partnershipSlug = usePartnershipSlug()
  const { orderId } = state
  const outcome = useCheckoutPaymentOutcome(orderId)
  const bookingConfirmed = outcome === "paid" || outcome === "cash"
  const paymentFailed = outcome === "failed"
  const isWaitingPayment = outcome === "pending"
  const resultHeading = isWaitingPayment ? "pendingHeading" : paymentFailed ? "paymentIncomplete" : "unverifiedHeading"

  const handleBackToHome = () => {
    resetCheckout()
    // Redirect to partnership page if we're in a partnership checkout, otherwise go to home
    const redirectPath = partnershipSlug ? `/${partnershipSlug}` : "/"
    router.push(redirectPath)
  }

  return (
    <CheckoutStepLayout>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[440px] md:max-w-[1080px] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 mx-auto">
        <div className="bg-[#27c7ff] px-6 py-4 md:px-12 md:py-8">
          <h1 className="text-white text-[20px] md:text-[42px] font-bold leading-tight">{t(bookingConfirmed ? "title" : resultHeading)}</h1>
        </div>

        <div className="px-6 py-6 md:px-12 md:py-10 space-y-6">
          {bookingConfirmed ? <>
          <p className="text-[16px] md:text-[19px] leading-[1.5]">
            <span className="text-black">{t("thankYou")} </span>
            <span className="text-[#27c7ff]">{t("emailWhatsapp")}</span>
          </p>

          <p className="text-[16px] md:text-[19px] text-black leading-[1.5]">
            <span className="font-bold">{t("teamConfirmation")}</span> {t("driverDetails")}
          </p>

          <p className="text-[16px] md:text-[19px] text-black leading-[1.5]">
            {t("tipRequest")} <span className="font-bold">{t("considerTip")}</span> {t("tipMessage")}
          </p>

          </> : (
            <p role={isWaitingPayment ? "status" : "alert"} className="text-[16px] md:text-[19px] leading-[1.5] text-black">
              {t(isWaitingPayment ? "pendingSubtext" : paymentFailed ? "paymentRejectedSubtext" : "unverifiedSubtext")}
            </p>
          )}

          <div className="space-y-3 md:space-y-4 pt-2 md:pt-4">
            {!bookingConfirmed && !isWaitingPayment ? (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl px-5 py-4 md:px-8 md:py-5 flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <X className="w-5 h-5 text-red-600" strokeWidth={2.5} />
                </div>
                <div>
                  <span className="text-red-700 text-[18px] md:text-[22px] font-bold block">{t(resultHeading)}</span>
                  <span className="text-red-600 text-sm md:text-base">{t(paymentFailed ? "paymentRejectedSubtext" : "unverifiedSubtext")}</span>
                </div>
              </div>
            ) : isWaitingPayment ? (
              <div className="bg-[#fff3cd] border border-[#ffc107]/60 rounded-xl px-5 py-4 md:px-8 md:py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 md:w-8 md:h-8 text-[#ffc107] animate-spin" />
                  <span className="text-[#856404] text-[18px] md:text-[22px] font-semibold">
                    {t("waitingPayment")}
                  </span>
                </div>
              </div>
            ) : (
              <>
                {outcome === "cash" && <p className="text-black">{t("payOnArrival")}</p>}
                {outcome === "paid" && (
                  <div className="bg-[#d5f6ea] border border-[#48d9a4]/60 rounded-xl px-5 py-4 md:px-8 md:py-5 flex items-center justify-between">
                    <span className="text-[#48d9a4] text-[18px] md:text-[22px] font-semibold">{t("paymentDone")}</span>
                    <Check className="w-7 h-7 md:w-9 md:h-9 text-[#48d9a4]" strokeWidth={2.5} />
                  </div>
                )}

                <div className="bg-[#d5f6ea] border border-[#48d9a4]/60 rounded-xl px-5 py-4 md:px-8 md:py-5 flex items-center justify-between">
                  <span className="text-[#48d9a4] text-[18px] md:text-[22px] font-semibold">{t("bookingDone")}</span>
                  <Check className="w-7 h-7 md:w-9 md:h-9 text-[#48d9a4]" strokeWidth={2.5} />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-4 justify-center pt-4 md:pt-8 pb-2">
            {!bookingConfirmed && orderId && onRetry && <Button onClick={onRetry} variant="outline">{t("returnToPayment")}</Button>}
            <Button 
              onClick={handleBackToHome}
              className="w-full md:w-auto bg-[#27c7ff] hover:bg-[#1fb3e8] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[16px] md:text-[17px] font-bold tracking-wide px-6 py-4 md:px-24 md:py-7 rounded-xl h-auto uppercase"
            >
              {t("backToHome")}
            </Button>
          </div>
        </div>
      </div>
    </CheckoutStepLayout>
  )
}
