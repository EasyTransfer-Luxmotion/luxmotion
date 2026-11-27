"use client"

import { CheckoutHeader } from "@/components/customizable-checkout/checkout-header"
import { TrustBanner } from "@/components/customizable-checkout/trust-banner"
import { VehicleCard } from "@/components/customizable-checkout/vehicle-card"
import { TransferInfoStep } from "@/components/customizable-checkout/transfer-info-step"
import { OrderSummarySidebar } from "@/components/customizable-checkout/order-summary-sidebar"
import { OrderSummaryMobile } from "@/components/customizable-checkout/order-summary-mobile"
import { Footer } from "@/components/common/footer"
import { PassengerInfoForm } from "@/components/customizable-checkout/passenger-info-form"
import { PaymentStep } from "@/components/customizable-checkout/payment-step"
import { ConfirmationModal } from "@/components/customizable-checkout/confirmation-modal"
import { ExperiencesStep } from "@/components/customizable-checkout/experiences-step"
import { CheckoutStepLayout } from "@/components/customizable-checkout/shared/checkout-step-layout"
import { CheckoutProvider, useCheckout, DEV_ALLOW_STEP_SKIP, type Vehicle } from "@/components/customizable-checkout/checkout-context"
import { useVehicles } from "@/hooks/use-vehicles"
import { calculatePriceBreakdown } from "@/lib/format"
import { ExperienceUpgradeModal } from "@/components/checkout/experience-upgrade-modal"
import { isAirportPickup } from "@/lib/airport"
import { useRouteDistance } from "@/hooks/use-route-distance"
import { useNearbyTours } from "@/hooks/use-nearby-tours"
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { initOrder, toBackendLocation, formatLocalDateTime } from "@/lib/orders"
import { readReferralCookie } from "@/lib/referral"
import { useConvex } from "convex/react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCheckoutPaymentOutcome } from "@/hooks/use-checkout-payment-outcome"
import { useTranslations } from "next-intl"
import { readAdSourceCookie, readOppref } from "@/lib/ad-source"
import { MeasureOrderCreated } from "@/components/analytics/measure-order-created"

const PartnershipContext = createContext<string | undefined>(undefined)

export function usePartnershipSlug() {
  return useContext(PartnershipContext)
}

interface CheckoutPageProps {
  partnershipSlug?: string
}

export function CheckoutPage({ partnershipSlug }: CheckoutPageProps) {
  return (
    <PartnershipContext.Provider value={partnershipSlug}>
      <CheckoutProvider>
        <CheckoutPageContent />
      </CheckoutProvider>
    </PartnershipContext.Provider>
  )
}

function CheckoutPageContent() {
  const convex = useConvex()
  const partnershipSlug = usePartnershipSlug()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const handledPaymentReturn = useRef<string | null>(null)
  const { state, isHydrated, setStep, setSelectedVehicle, setShowTransferForm, setOrder, updateDistance, setUpgradeMode, setNearbyTours } = useCheckout()
  const { currentStep, direction, selectedVehicle, showTransferForm, transfer, distance: storedDistance, orderId, upgradeMode, hasNearbyTours, nearbyToursLoaded } = state

  const paymentOutcome = useCheckoutPaymentOutcome(orderId)
  const bookingConfirmed = paymentOutcome === "paid" || paymentOutcome === "cash"
  const confirmationStep = hasNearbyTours ? 5 : 4
  const passengerStep = hasNearbyTours ? 3 : 2
  const paymentStep = hasNearbyTours ? 4 : 3
  const experiencesStep = 2
  const isRoundTrip = transfer.bookReturn

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
    partnershipSlug,
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
          partnershipSlug: partnershipSlug || readReferralCookie() || undefined,
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

  const handleStepChange = (newStep: number) => {
    if (currentStep === confirmationStep) {
      if (!bookingConfirmed && newStep === paymentStep) handleReturnToPayment()
      return
    }
    if (newStep < currentStep) setStep(newStep)
  }

  // Experience-upgrade upsell modal (premium vehicle offered for the selected standard one).
  const [upgradeCandidate, setUpgradeCandidate] = useState<Vehicle | null>(null)
  const [upgradeOfferSeen, setUpgradeOfferSeen] = useState(false)

  // €-difference (tax-inclusive, whole euros) between a premium vehicle and the base one.
  const upgradeDelta = (base: Vehicle, premium: Vehicle) =>
    calculatePriceBreakdown(premium.price).total -
    calculatePriceBreakdown(base.price).total

  const handleVehicleSelect = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle)
    setUpgradeMode(false)
    // If an admin mapped a premium vehicle to this (standard) one, offer the
    // upgrade once per session before opening the transfer form.
    if (!upgradeOfferSeen) {
      const premium = vehicles.find(
        (v) => v.upgradeFromVehicleId === vehicle.id,
      )
      if (premium && upgradeDelta(vehicle, premium) > 0) {
        setUpgradeCandidate(premium)
        setUpgradeOfferSeen(true)
        return
      }
    }
    setShowTransferForm(true)
  }

  const handleUpgradeAccept = () => {
    if (upgradeCandidate) setSelectedVehicle(upgradeCandidate)
    setUpgradeCandidate(null)
    setShowTransferForm(true)
  }

  const handleUpgradeDecline = () => {
    setUpgradeCandidate(null)
    setShowTransferForm(true)
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

    <MeasureOrderCreated orderNumber={orderId ? String(orderId) : null} />
      <CheckoutHeader
        currentStep={currentStep === confirmationStep && !bookingConfirmed ? paymentStep : currentStep}
        onStepClick={handleStepChange}
        allowStepSkip={DEV_ALLOW_STEP_SKIP}
        hasNearbyTours={hasNearbyTours}
      />

      {/* `clip` e não `hidden` — ver checkout/checkout-page.tsx: o `hidden`
          matava o `sticky` do resumo do pedido. */}
      <main className="flex-1 bg-[#F5F5F5] overflow-x-clip pb-16">
        <div key={currentStep} className={getAnimationClass()} style={getAnimationStyle()}>
          {currentStep === 1 && (
            <VehicleSelectionStep
              vehicles={vehicles}
              isLoading={vehiclesLoading || isCalculatingDistance}
              selectedVehicle={selectedVehicle}
              showTransferForm={showTransferForm}
              onVehicleSelect={handleVehicleSelect}
              onContinue={handleContinue}
              routeError={routeError}
              isRoundTrip={isRoundTrip}
            />
          )}

          {currentStep === experiencesStep && hasNearbyTours && (
            <ExperiencesStep onContinue={handleContinue} nearbyTours={nearbyTours} />
          )}

          {currentStep === passengerStep && (
            <CheckoutStepLayout>
              <PassengerInfoForm onContinue={handleContinue} />
            </CheckoutStepLayout>
          )}

          {currentStep === paymentStep && (
            <CheckoutStepLayout>
              <PaymentStep onContinue={handleContinue} />
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
          variant="light"
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
  onContinue,
  routeError,
  isRoundTrip,
}: VehicleSelectionStepProps) {
  const t = useTranslations("checkout")
  return (
    <>
      <div className={`mx-auto pt-8 transition-all duration-300 ${showTransferForm && selectedVehicle ? "max-w-[1200px] px-6" : "max-w-[1400px] px-4"}`}>
        <TrustBanner />
      </div>

      {showTransferForm && selectedVehicle ? (
        <div className="max-w-[1200px] mx-auto px-6 py-6 pt-8">
          <OrderSummaryMobile />
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 mt-6 lg:mt-0">
            <TransferInfoStep onContinue={onContinue} />
            <div className="hidden lg:block">
              <OrderSummarySidebar />
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-[1400px] mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {isLoading ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[285px] bg-white rounded-2xl animate-pulse" />
              ))
            ) : routeError === "no_route" ? (
              <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-[#DEDEDE]">
                <p className="text-[#0E4659] font-medium mb-2">No driving route found between these locations.</p>
                <p className="text-[#808080] text-sm">Please check if both locations are accessible by car.</p>
              </div>
            ) : routeError === "api_error" ? (
              <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-[#DEDEDE]">
                <p className="text-[#0E4659] font-medium mb-2">Unable to calculate route.</p>
                <p className="text-[#808080] text-sm">Please try again or contact support.</p>
              </div>
            ) : vehicles.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-[#DEDEDE]">
                <p className="text-[#0E4659] font-medium">{t("noVehicles")}</p>
              </div>
            ) : (
              vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} isRoundTrip={isRoundTrip} onSelect={onVehicleSelect} />
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}
