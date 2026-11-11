"use client"

import { CheckoutHeader } from "@/components/checkout/checkout-header"
import { VehicleCard } from "@/components/checkout/vehicle-card"
import { TransferInfoStep } from "@/components/checkout/transfer-info-step"
import { OrderSummarySidebar } from "@/components/checkout/order-summary-sidebar"
import { Footer } from "@/components/new-landing-page/footer"
import { PassengerInfoForm } from "@/components/checkout/passenger-info-form"
import { PaymentStep } from "@/components/checkout/payment-step"
import { ConfirmationModal } from "@/components/checkout/confirmation-modal"
import { ExperiencesStep } from "@/components/checkout/experiences-step"
import { CheckoutStepLayout } from "@/components/checkout/shared/checkout-step-layout"
import { CheckoutProvider, useCheckout, DEV_ALLOW_STEP_SKIP, type Vehicle } from "@/components/checkout/checkout-context"
import { useVehicles } from "@/hooks/use-vehicles"
import { calculatePriceBreakdown } from "@/lib/format"
import { ExperienceUpgradeModal } from "@/components/checkout/experience-upgrade-modal"
import { CheckoutThemeProvider, useCheckoutTheme } from "@/components/checkout/checkout-theme"
import { isAirportPickup } from "@/lib/airport"
import { useRouteDistance } from "@/hooks/use-route-distance"
import { useNearbyTours } from "@/hooks/use-nearby-tours"
import { useEffect, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"
import { initOrder, toBackendLocation, formatLocalDateTime } from "@/lib/orders"
import { readReferralCookie } from "@/lib/referral"
import { useConvex } from "convex/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCheckoutPaymentOutcome } from "@/hooks/use-checkout-payment-outcome"
import { useTranslations } from "next-intl"
import { readAdSourceCookie, readOppref } from "@/lib/ad-source"
import { MeasureOrderCreated } from "@/components/analytics/measure-order-created"

export function CheckoutPage({ logoUrl }: { logoUrl?: string | null } = {}) {
  return (
    <CheckoutThemeProvider>
      <CheckoutProvider>
        <CheckoutPageContent logoUrl={logoUrl} />
      </CheckoutProvider>
    </CheckoutThemeProvider>
  )
}

function CheckoutPageContent({ logoUrl }: { logoUrl?: string | null }) {
  const convex = useConvex()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const handledPaymentReturn = useRef<string | null>(null)
  const { state, isHydrated, setStep, setSelectedVehicle, setShowTransferForm, setOrder, updateDistance, setUpgradeMode, setNearbyTours } = useCheckout()
  const { theme } = useCheckoutTheme()
  const { currentStep, direction, selectedVehicle, showTransferForm, transfer, distance: storedDistance, orderId, upgradeMode, hasNearbyTours, nearbyToursLoaded } = state

  // Experience-upgrade upsell modal (premium vehicle offered for the selected standard one).
  const [upgradeCandidate, setUpgradeCandidate] = useState<Vehicle | null>(null)
  const [upgradeOfferSeen, setUpgradeOfferSeen] = useState(false)

  const paymentOutcome = useCheckoutPaymentOutcome(orderId)
  const bookingConfirmed = paymentOutcome === "paid" || paymentOutcome === "cash"
  const confirmationStep = hasNearbyTours ? 5 : 4
  const passengerStep = hasNearbyTours ? 3 : 2
  const paymentStep = hasNearbyTours ? 4 : 3
  const experiencesStep = 2

  // A gateway return opens a result view. Only the server status can confirm payment.
  useEffect(() => {
    if (!isHydrated) return
    const result = searchParams?.get("success") ?? null
    if (result === null) {
      handledPaymentReturn.current = null
      return
    }
    const returnKey = `${result}:${confirmationStep}`
    if ((result === "true" || result === "false") && handledPaymentReturn.current !== returnKey) {
      handledPaymentReturn.current = returnKey
      setStep(confirmationStep)
    }
  }, [searchParams, setStep, confirmationStep, isHydrated])

  const handleReturnToPayment = () => {
    const params = new URLSearchParams(searchParams?.toString())
    params.delete("success")
    const query = params.toString()
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false })
    setStep(paymentStep)
  }

  const { distance: calculatedDistance, duration: calculatedDuration, isCalculating: isCalculatingDistance, error: routeError } = useRouteDistance({
    from: { lat: transfer.fromLat, lng: transfer.fromLng },
    to: { lat: transfer.toLat, lng: transfer.toLng },
    stops: transfer.stops.map(s => ({ lat: s.lat, lng: s.lng })),
  })

  const distance = calculatedDistance ?? (routeError ? null : storedDistance)

  useEffect(() => {
    if (
      calculatedDistance !== null &&
      (calculatedDistance !== storedDistance || calculatedDuration !== state.routeDuration)
    ) {
      updateDistance(calculatedDistance, calculatedDuration)
    }
  }, [calculatedDistance, calculatedDuration, storedDistance, state.routeDuration, updateDistance])

  const { tours: nearbyTours, isLoading: nearbyToursLoading } = useNearbyTours({
    lat: transfer.toLat,
    lng: transfer.toLng,
  })

  useEffect(() => {
    if (!nearbyToursLoading && transfer.toLat != null && transfer.toLng != null) {
      setNearbyTours(nearbyTours.length > 0)
    }
  }, [nearbyTours, nearbyToursLoading, transfer.toLat, transfer.toLng, setNearbyTours])

  useEffect(() => {
    if (nearbyToursLoaded && !hasNearbyTours && currentStep === experiencesStep) {
      setStep(passengerStep)
    }
  }, [nearbyToursLoaded, hasNearbyTours, currentStep, experiencesStep, passengerStep, setStep])

  /* A decisão de noite/dia passou para o servidor: manda-se a data como texto
     e o preço vem calculado de lá, com a mesma regra que grava a encomenda. */
  const departureDateArg = transfer.departureDate
    ? formatLocalDateTime(transfer.departureDate, false)
    : undefined
  const returnDateArg =
    transfer.bookReturn && transfer.returnDate
      ? formatLocalDateTime(transfer.returnDate, false)
      : undefined
  const isRoundTrip = transfer.bookReturn

  const { vehicles, isLoading: vehiclesLoading } = useVehicles({
    passengers: transfer.passengers,
    luggage: transfer.luggage,
    distance: distance ?? undefined,
    departureDate: departureDateArg,
    returnDate: returnDateArg,
    bookReturn: transfer.bookReturn,
    isAirportPickup: isAirportPickup({
      text: transfer.fromLocation,
      placeId: transfer.fromPlaceId,
      lat: transfer.fromLat,
      lng: transfer.fromLng,
    }),
    upgradeMode: upgradeMode,
    currentVehiclePassengers: selectedVehicle?.passengers ?? 0,
    currentVehicleLuggage: selectedVehicle?.luggage ?? 0,
  })

  useEffect(() => {
    if (selectedVehicle && vehicles.length > 0) {
      const updatedVehicle = vehicles.find(v => v.id === selectedVehicle.id)
      /* Comparava só o total. O que segue para o pagamento é esta fotografia,
         incluindo a taxa noturna que vai na linha do detalhe: se ela mudar sem
         o total mudar, a encomenda ficava a dizer zero. */
      const changed =
        updatedVehicle &&
        (updatedVehicle.name !== selectedVehicle.name ||
          updatedVehicle.originalName !== selectedVehicle.originalName ||
          updatedVehicle.examples !== selectedVehicle.examples ||
          JSON.stringify(updatedVehicle.translations) !== JSON.stringify(selectedVehicle.translations) ||
          updatedVehicle.price !== selectedVehicle.price ||
          updatedVehicle.nightTaxOutbound !== selectedVehicle.nightTaxOutbound ||
          updatedVehicle.nightTaxReturn !== selectedVehicle.nightTaxReturn)
      if (updatedVehicle && changed) {
        setSelectedVehicle(updatedVehicle)
      }
    }
  }, [vehicles, selectedVehicle, setSelectedVehicle])

  useEffect(() => {
    async function ensureOrder() {
      if (currentStep === confirmationStep) return
      if (orderId || !transfer.fromLocation || !transfer.toLocation || !transfer.departureDate) return

      try {
        const departure = toBackendLocation({
          location: transfer.fromLocation,
          placeId: transfer.fromPlaceId,
          lat: transfer.fromLat,
          lng: transfer.fromLng,
        })
        const arrival = toBackendLocation({
          location: transfer.toLocation,
          placeId: transfer.toPlaceId,
          lat: transfer.toLat,
          lng: transfer.toLng,
        })
        const stops = (transfer.stops || []).map((s) =>
          toBackendLocation({ location: s.text, placeId: s.placeId, lat: s.lat, lng: s.lng })
        )

        const resp = await initOrder(convex, {
          departure,
          arrival,
          stops,
          passengers: transfer.passengers,
          adults: transfer.adults,
          children: transfer.children,
          departureDate: formatLocalDateTime(transfer.departureDate, true),
          isRoundTrip: false,
          returnDate: undefined,
          // Main-site checkout has no on-page partner slug; attribute via the
          // affiliate referral cookie if one was set on a partner landing.
          partnershipSlug: readReferralCookie() || undefined,
          /* A origem vai junto mas fica gravada à parte do parceiro: uma é
             campanha de anúncios, o outro é uma relação comercial nossa. */
          adSource: readAdSourceCookie() ?? undefined,
          opprefId: readOppref(),
        })

        setOrder(resp.order.id, resp.order)
      } catch (e: unknown) {
        console.error("Failed to init order:", e)
      }
    }

    ensureOrder()
  }, [orderId, transfer, setOrder, currentStep, confirmationStep])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentStep])

  const handleStepChange = (newStep: number) => {
    // Sequential checkout: a step in the indicator can only go BACK to an
    // already-completed step. Forward progression happens exclusively via the
    // Continue button (which validates the current step), so the client can't
    // skip ahead to Payment/Confirmation. A placed order (confirmation) is locked.
    if (currentStep === confirmationStep) {
      if (!bookingConfirmed && newStep === paymentStep) handleReturnToPayment()
      return
    }
    if (newStep < currentStep) setStep(newStep)
  }

  const handleVehicleSelect = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle)
    setUpgradeMode(false)
  }

  const proceedToTransferForm = () => {
    setShowTransferForm(true)
    // Showing the transfer form doesn't change currentStep (so the step-change
    // scroll effect doesn't fire). On desktop, jump back to the top so the form
    // starts in view instead of staying scrolled down at the vehicle list.
    if (window.innerWidth >= 1024) {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  // €-difference (tax-inclusive, whole euros) between a premium vehicle and the base one.
  const upgradeDelta = (base: Vehicle, premium: Vehicle) =>
    calculatePriceBreakdown(premium.price).total -
    calculatePriceBreakdown(base.price).total

  const handleContinueFromVehicle = () => {
    if (!selectedVehicle) return
    // If an admin mapped a premium vehicle to the selected (standard) one, offer
    // the upgrade once per session before advancing to the transfer form.
    if (!upgradeOfferSeen) {
      // O mapa de upgrade pode estar guardado em qualquer um dos dois veículos
      // do par: o rótulo do admin pede que o premium aponte para o standard, mas
      // os dados reais têm o standard a apontar para o premium. Aceitamos as duas
      // direções e, com o guard de delta > 0, oferecemos sempre só o mais caro.
      const linked =
        vehicles.find((v) => v.id === selectedVehicle.upgradeFromVehicleId) ??
        vehicles.find((v) => v.upgradeFromVehicleId === selectedVehicle.id)
      if (linked && upgradeDelta(selectedVehicle, linked) > 0) {
        setUpgradeCandidate(linked)
        setUpgradeOfferSeen(true)
        return
      }
    }
    proceedToTransferForm()
  }

  const handleUpgradeAccept = () => {
    if (upgradeCandidate) setSelectedVehicle(upgradeCandidate)
    setUpgradeCandidate(null)
    proceedToTransferForm()
  }

  const handleUpgradeDecline = () => {
    setUpgradeCandidate(null)
    proceedToTransferForm()
  }

  const handleContinue = () => {
    setStep(currentStep + 1)
  }

  const getAnimationClass = () => {
    if (currentStep === confirmationStep) return ""
    return "animate-in fade-in slide-in-from-right-4 duration-500"
  }

  const getAnimationStyle = () => {
    if (currentStep === confirmationStep) return {}
    return { animationName: direction === "right" ? "slideInRight" : "slideInLeft" }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* A conversão sai daqui e não da página de sucesso: quem decide é o
          estado da encomenda, não o facto de um ecrã ter aberto. */}
      <MeasureOrderCreated orderNumber={orderId ? String(orderId) : null} />
      <CheckoutHeader
        logoUrl={logoUrl}
        currentStep={currentStep === confirmationStep && !bookingConfirmed ? paymentStep : currentStep}
        onStepClick={handleStepChange}
        allowStepSkip={DEV_ALLOW_STEP_SKIP}
        hasNearbyTours={hasNearbyTours}
      />

      {/* `clip` e não `hidden`: o `overflow-x: hidden` faz o eixo vertical
          computar para `auto`, o que torna isto um contentor de scroll e mata
          o `sticky` do resumo do pedido sem dar erro nenhum. O `clip` corta na
          horizontal na mesma e deixa o vertical em `visible`. */}
      <main className="flex-1 bg-[var(--ck-bg,#0d0d0d)] text-[var(--ck-text,#f7f4ef)] overflow-x-clip pb-16">
        <div key={currentStep} className={getAnimationClass()} style={getAnimationStyle()}>
          {currentStep === 1 && (
            <VehicleSelectionStep
              vehicles={vehicles}
              isLoading={vehiclesLoading || isCalculatingDistance}
              selectedVehicle={selectedVehicle}
              showTransferForm={showTransferForm}
              onVehicleSelect={handleVehicleSelect}
              onContinueFromVehicle={handleContinueFromVehicle}
              onContinue={handleContinue}
              routeError={routeError}
              isRoundTrip={isRoundTrip}
            />
          )}

          {currentStep === experiencesStep && hasNearbyTours && (
            <ExperiencesStep
              onContinue={handleContinue}
              onBack={() => setStep(currentStep - 1)}
              nearbyTours={nearbyTours}
            />
          )}

          {currentStep === passengerStep && (
            <CheckoutStepLayout>
              <PassengerInfoForm
                onContinue={handleContinue}
                onBack={() => setStep(currentStep - 1)}
              />
            </CheckoutStepLayout>
          )}

          {currentStep === paymentStep && (
            <CheckoutStepLayout>
              <PaymentStep
                onContinue={handleContinue}
                onBack={() => setStep(currentStep - 1)}
              />
            </CheckoutStepLayout>
          )}

          {currentStep === confirmationStep && (
            <ConfirmationModal onRetry={handleReturnToPayment} />
          )}
        </div>
      </main>

      <Footer />

      {upgradeCandidate && selectedVehicle && (
        <ExperienceUpgradeModal
          open
          variant={theme}
          onDecline={handleUpgradeDecline}
          onAccept={handleUpgradeAccept}
          vehicleName={upgradeCandidate.name}
          vehicleImage={upgradeCandidate.image}
          priceDelta={upgradeDelta(selectedVehicle, upgradeCandidate)}
        />
      )}
    </div>
  )
}

interface VehicleSelectionStepProps {
  vehicles: Vehicle[]
  isLoading?: boolean
  selectedVehicle: Vehicle | null
  showTransferForm: boolean
  onVehicleSelect: (vehicle: Vehicle) => void
  onContinueFromVehicle: () => void
  onContinue: () => void
  routeError?: "no_route" | "api_error" | null
  isRoundTrip: boolean
}

function VehicleSelectionStep({
  vehicles,
  isLoading,
  selectedVehicle,
  showTransferForm,
  onVehicleSelect,
  onContinueFromVehicle,
  onContinue,
  routeError,
  isRoundTrip,
}: VehicleSelectionStepProps) {
  const t = useTranslations("checkout")
  const tCommon = useTranslations("common")

  if (showTransferForm && selectedVehicle) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 pb-6">
        <div className="lg:hidden mb-6 -mx-6">
          <OrderSummarySidebar collapsible />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1.9fr_1fr] gap-0 mt-6 lg:mt-0 items-start">
          <div className="pt-8 lg:pr-6">
            <TransferInfoStep onContinue={onContinue} />
          </div>
          <div className="hidden lg:block">
            <OrderSummarySidebar />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 pb-6">
      <div className="lg:hidden mb-6 -mx-6">
        <OrderSummarySidebar collapsible />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.9fr_1fr] gap-0 items-start">
        <div className="flex flex-col pt-8 lg:pr-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h2
              className="text-[28px] lg:text-[36px] font-normal text-[var(--ck-text,#f7f4ef)] leading-none"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {t("chooseYourVehicle")}
            </h2>
            <button
              type="button"
              onClick={onContinueFromVehicle}
              disabled={!selectedVehicle}
              className="hidden sm:inline-flex items-center gap-2 bg-[var(--ck-accent,#c9a96e)] hover:bg-[var(--ck-accent-hover,#b89558)] text-[#1E1D1B] font-semibold uppercase tracking-[0.08em] text-[13px] px-6 py-3.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {tCommon("continue")}
              <ArrowRight className="size-4" strokeWidth={2} />
            </button>
          </div>
          {/* Mobile: the same Continue at the top too (desktop shows it inline beside
              the heading). Identical styling to the one below the vehicle list. */}
          <div className="sm:hidden flex justify-end mb-5">
            <button
              type="button"
              onClick={onContinueFromVehicle}
              disabled={!selectedVehicle}
              className="inline-flex items-center gap-2 bg-[var(--ck-accent,#c9a96e)] hover:bg-[var(--ck-accent-hover,#b89558)] text-[#1E1D1B] font-semibold uppercase tracking-[0.08em] text-[13px] px-8 py-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tCommon("continue")}
              <ArrowRight className="size-4" strokeWidth={2} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {isLoading ? (
              [1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-[285px] bg-[var(--ck-surface,#1a1a1a)] border border-[rgba(var(--ck-accent-rgb,201,169,110),0.08)] animate-pulse"
                />
              ))
            ) : routeError === "no_route" ? (
              <div className="col-span-full py-20 text-center bg-[var(--ck-surface-sunken,#141414)] border border-dashed border-[rgba(var(--ck-accent-rgb,201,169,110),0.22)]">
                <p className="text-[#F5F5F5] font-medium mb-2">No driving route found between these locations.</p>
                <p className="text-[rgba(var(--ck-text-rgb,255,255,255),0.55)] text-sm">Please check if both locations are accessible by car.</p>
              </div>
            ) : routeError === "api_error" ? (
              <div className="col-span-full py-20 text-center bg-[var(--ck-surface-sunken,#141414)] border border-dashed border-[rgba(var(--ck-accent-rgb,201,169,110),0.22)]">
                <p className="text-[#F5F5F5] font-medium mb-2">Unable to calculate route.</p>
                <p className="text-[rgba(var(--ck-text-rgb,255,255,255),0.55)] text-sm">Please try again or contact support.</p>
              </div>
            ) : vehicles.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-[var(--ck-surface-sunken,#141414)] border border-dashed border-[rgba(var(--ck-accent-rgb,201,169,110),0.22)]">
                <p className="text-[var(--ck-accent,#c9a96e)] font-medium">{t("noVehicles")}</p>
              </div>
            ) : (
              vehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  isRoundTrip={isRoundTrip}
                  onSelect={onVehicleSelect}
                  selected={selectedVehicle?.id === vehicle.id}
                />
              ))
            )}
          </div>
          <div className="flex justify-end mt-8">
            <button
              type="button"
              onClick={onContinueFromVehicle}
              disabled={!selectedVehicle}
              className="inline-flex items-center gap-2 bg-[var(--ck-accent,#c9a96e)] hover:bg-[var(--ck-accent-hover,#b89558)] text-[#1E1D1B] font-semibold uppercase tracking-[0.08em] text-[13px] px-8 py-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tCommon("continue")}
              <ArrowRight className="size-4" strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="hidden lg:block">
          <OrderSummarySidebar />
        </div>
      </div>
    </div>
  )
}
