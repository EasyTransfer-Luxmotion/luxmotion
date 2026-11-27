"use client"

import Image from "next/image"
import { Plane, Search, Info, Backpack, Luggage, Briefcase, Lock, Plus, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { DateTimePicker } from "@/components/customizable-checkout/date-time-picker"
import { Counter } from "@/components/ui/counter"
import { InputWithIcon } from "@/components/ui/input-with-icon"
import { ChildSeatCard, ExtrasCard, AnimatedCollapse, LuggageSection, FormField } from "@/components/customizable-checkout/shared"
import { useTranslations } from "next-intl"
import { useCheckout } from "@/components/customizable-checkout/checkout-context"
import { usePartnershipSlug } from "@/components/customizable-checkout/checkout-page"
import { GooglePlacesInput } from "@/components/ui/google-places-input"
import { initOrder, createReturnOrder, registTrip, selectCar, toBackendLocation, formatLocalDate, formatLocalDateTime, lookupFlight } from "@/lib/orders"
import { readReferralCookie } from "@/lib/referral"
import { useConvex } from "convex/react"
import { useState, useMemo } from "react"
import { calculatePriceBreakdown } from "@/lib/format"
import { api } from "@workspace/convex/api"
import { readAdSourceCookie, readOppref } from "@/lib/ad-source"
import { relogioDeLisboa } from "@/lib/hora-lisboa"
import { useExtraPrices } from "@/hooks/use-site-settings"

interface TransferInfoStepProps {
  onContinue: () => void
}

function RoundTripInfoPopoverMobile({ label, content }: { label: string; content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="md:hidden">
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-[#dff7ff] border border-[#27c7ff]/40 text-[#27c7ff] hover:bg-[#c5eef9] focus:outline-none focus:ring-2 focus:ring-[#27c7ff] focus:ring-offset-1 touch-manipulation"
            aria-label={label}
          >
            <Info
              data-theme-color="checkoutFormInfoBoxIcon"
              className="w-4 h-4"
              strokeWidth={2.5}
              style={{
                color: "var(--theme-checkout-form-info-box-icon, #27C7FF)",
                stroke: "var(--theme-checkout-form-info-box-icon, #27C7FF)",
                fill: "none",
              }}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" sideOffset={6} align="start" className="max-w-[280px] text-left z-[100] !bg-white !text-[#222222] shadow-lg border border-[#e0e0e0] text-sm p-3">
          {content}
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function TransferInfoStep({ onContinue }: TransferInfoStepProps) {
  const t = useTranslations("transfer")
  const convex = useConvex()
  const tCommon = useTranslations("common")
  const partnershipSlug = usePartnershipSlug()
  const { state, updateTransfer, setOrder, setStep, setUpgradeMode, setShowTransferForm } = useCheckout()
  const extraPrices = useExtraPrices()
  const { transfer, selectedVehicle, distance, routeDuration, orderId, payment, experiences } = state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [flightSuccess, setFlightSuccess] = useState("")
  // Aviso suave (neutro) quando o voo não é confirmado — nunca um erro técnico.
  const [flightNotice, setFlightNotice] = useState("")

  const isRoundTrip = transfer.bookReturn // Se bookReturn está marcado, é round trip (independente da aba)
  const isReturnTab = transfer.transferType === "volta"
  const activeFlightNumber = isReturnTab ? transfer.returnFlightNumber : transfer.outboundFlightNumber
  const activeAirlineCompany = isReturnTab ? transfer.returnAirlineCompany : transfer.outboundAirlineCompany
  const activeFlightDate = isReturnTab ? transfer.returnDate : transfer.departureDate
  const basePrice = selectedVehicle?.price ?? 0
  const baseTotalPrice = basePrice

  const buildFlightTransferUpdate = (updates: {
    flightNumber?: string
    arrivalDate?: string | null
    airlineCompany?: string | null
    amadeusFlightInfo?: typeof transfer.outboundAmadeusFlightInfo
  }) => {
    if (isReturnTab) {
      return {
        returnFlightNumber: updates.flightNumber ?? transfer.returnFlightNumber,
        returnArrivalDate:
          updates.arrivalDate === undefined ? transfer.returnArrivalDate : updates.arrivalDate,
        returnAirlineCompany:
          updates.airlineCompany === undefined ? transfer.returnAirlineCompany : updates.airlineCompany,
        returnAmadeusFlightInfo:
          updates.amadeusFlightInfo === undefined
            ? transfer.returnAmadeusFlightInfo
            : updates.amadeusFlightInfo,
      }
    }

    return {
      outboundFlightNumber: updates.flightNumber ?? transfer.outboundFlightNumber,
      outboundArrivalDate:
        updates.arrivalDate === undefined ? transfer.outboundArrivalDate : updates.arrivalDate,
      outboundAirlineCompany:
        updates.airlineCompany === undefined
          ? transfer.outboundAirlineCompany
          : updates.airlineCompany,
      outboundAmadeusFlightInfo:
        updates.amadeusFlightInfo === undefined
          ? transfer.outboundAmadeusFlightInfo
          : updates.amadeusFlightInfo,
    }
  }

  const setTransferType = (transferType: "ida" | "volta") => {
    setError("")
    setFlightSuccess("")
    setFlightNotice("")
    updateTransfer({ transferType })
  }
  
  // Calculate insurance totals (same as invoice)
  const premiumInsurancePrice = payment.premiumInsurance ? (isRoundTrip ? 18 : 9) : 0
  const refundTermsPrice = payment.refundTerms ? (isRoundTrip ? 8 : 4) : 0
  const comfortConnectionPrice = payment.comfortConnection ? (isRoundTrip ? 14 : 7) : 0
  const insuranceTotal = premiumInsurancePrice + refundTermsPrice + comfortConnectionPrice
  const cardFeeRate = payment.method === "cartao" ? 0.02 : 0

  // Calculate extras costs (child seats, surfboards, pets)
  /* Per-unit prices from Configurações → Preços, as in the summary and the
     payment (they were written out here: 5, 5 and 10). */
  const multiplier = isRoundTrip ? 2 : 1
  const totalChildSeats = transfer.childSeatChecked ? (transfer.childSeats.baby + transfer.childSeats.child + transfer.childSeats.booster) : 0
  const totalSurfboards = transfer.surfboardChecked ? (transfer.surfboard.standard + transfer.surfboard.upgraded) : 0
  const totalPets = transfer.petChecked ? (transfer.pet.small + transfer.pet.large) : 0
  const childSeatsCost = totalChildSeats * extraPrices.childSeat * multiplier
  const surfboardsCost = totalSurfboards * extraPrices.surfboard * multiplier
  const petsCost = totalPets * extraPrices.pet * multiplier
  const extrasTotal = childSeatsCost + surfboardsCost + petsCost

  const experiencesTotal = experiences.reduce((sum, exp) => sum + exp.totalPrice, 0)

  // Calculate price breakdown with all fees included in rounding (same as invoice)
  const priceBreakdown = useMemo(() => calculatePriceBreakdown({
    basePrice: baseTotalPrice,
    cardFeeRate,
    insuranceTotal: insuranceTotal + extrasTotal,
  }), [baseTotalPrice, cardFeeRate, insuranceTotal, extrasTotal])

  const continueButtonTotal = priceBreakdown.total + experiencesTotal

  const childSeats = [
    {
      id: "baby",
      title: t("babySeat"),
      ageRange: t("babySeatAge"),
      image: "/shared/c589411c-9d31-4b5a-82af.jpeg",
      value: transfer.childSeats.baby,
      onChange: (v: number) => updateTransfer({ childSeats: { ...transfer.childSeats, baby: v } }),
    },
    {
      id: "child",
      title: t("childSeatLabel"),
      ageRange: t("childSeatAge"),
      image: "/shared/cadeira-crianca.jpeg",
      value: transfer.childSeats.child,
      onChange: (v: number) => updateTransfer({ childSeats: { ...transfer.childSeats, child: v } }),
    },
    {
      id: "booster",
      title: t("boosterSeat"),
      ageRange: t("boosterSeatAge"),
      image: "/shared/banco-elevatorio.jpeg",
      value: transfer.childSeats.booster,
      onChange: (v: number) => updateTransfer({ childSeats: { ...transfer.childSeats, booster: v } }),
    },
  ]

  const surfboards = [
    {
      id: "standard",
      title: t("standardSurfboard"),
      subtitle: t("standardSurfboardSize"),
      image: "/checkout/surfboard-standard.webp",
      value: transfer.surfboard.standard,
      onChange: (v: number) => updateTransfer({ surfboard: { ...transfer.surfboard, standard: v } }),
      imageRotation: "-rotate-[20deg] scale-[1.5]",
    },
    {
      id: "upgraded",
      title: t("biggerSurfboard"),
      subtitle: t("biggerSurfboardSize"),
      image: "/checkout/surfboard-upgraded.webp",
      value: transfer.surfboard.upgraded,
      onChange: (v: number) => updateTransfer({ surfboard: { ...transfer.surfboard, upgraded: v } }),
      badge: t("autoUpgrade"),
      infoText: t("requiresXlVehicle"),
      imageRotation: "rotate-[25deg] scale-110",
    },
  ]

  const pets = [
    {
      id: "small",
      title: t("smallPet"),
      subtitle: t("smallPetWeight"),
      image: "/checkout/pet-small.webp",
      value: transfer.pet.small,
      onChange: (v: number) => updateTransfer({ pet: { ...transfer.pet, small: v } }),
      imageRotation: "scale-[1.5]",
    },
    {
      id: "large",
      title: t("largePet"),
      subtitle: t("largePetWeight"),
      image: "/checkout/pet-large.png",
      value: transfer.pet.large,
      onChange: (v: number) => updateTransfer({ pet: { ...transfer.pet, large: v } }),
      badge: t("autoUpgrade"),
      infoText: t("requiresXlVehicle"),
    },
  ]

  const showLocationFields = transfer.transferType === "ida" || (transfer.transferType === "volta" && transfer.bookReturn)
  const stops = transfer.stops || []

  const handleAddStop = () => {
    if (stops.length < 1) {
      updateTransfer({ stops: [...stops, { text: "", placeId: null, lat: null, lng: null }] })
    }
  }

  const handleRemoveStop = (index: number) => {
    updateTransfer({ stops: stops.filter((_, i) => i !== index) })
  }

  const handleUpdateStop = (
    index: number,
    v: { location: string; placeId: string | null; lat: number | null; lng: number | null }
  ) => {
    const nextStops = [...stops]
    nextStops[index] = { text: v.location, placeId: v.placeId, lat: v.lat, lng: v.lng }
    updateTransfer({ stops: nextStops })
  }

  const handleFlightLookup = async () => {
    setError("")
    setFlightSuccess("")
    setFlightNotice("")
    if (!activeFlightNumber) {
      setFlightNotice(t("enterFlightNumber"))
      return
    }
    if (!activeFlightDate) {
      setFlightNotice(t("selectDateFirst"))
      return
    }

    // Confirmação do voo = extra de conveniência (à Welcome Pickups): se
    // encontrarmos, preenchemos companhia + hora de chegada; se não, ou se a
    // API falhar, guardamos à mesma o número e deixamos seguir. Sem erros
    // técnicos, sem bloquear o checkout.
    try {
      const depDate = formatLocalDate(activeFlightDate)
      const resp = await lookupFlight(convex, {
        flightNumber: activeFlightNumber,
        departureDate: depDate,
      })

      if (resp) {
        updateTransfer(
          buildFlightTransferUpdate({
            arrivalDate: resp.arrivalDateTimeLocal,
            airlineCompany: resp.airlineCompany,
            amadeusFlightInfo: resp.amadeusFlightInfo ?? null,
          })
        )
        setFlightSuccess(t("flightVerified", { airline: resp.airlineCompany }))
      } else {
        setFlightNotice(t("flightNotConfirmed"))
      }
    } catch (e: any) {
      // Best-effort: uma falha na pesquisa não pode partir o checkout.
      console.error("Flight lookup failed:", e)
      setFlightNotice(t("flightNotConfirmed"))
    }
  }

  const resolvePlaceFromText = async (
    text: string
  ): Promise<{ placeId: string; lat: number | null; lng: number | null } | null> => {
    const trimmed = String(text || "").trim()
    if (!trimmed) return null
    const google = (globalThis as any).google
    const svc = google?.maps?.places?.AutocompleteService
    const PlacesService = google?.maps?.places?.PlacesService
    if (!svc || !PlacesService) return null

    const service = new svc()
    const placeId = await new Promise<string | null>((resolve) => {
      service.getPlacePredictions({ input: trimmed }, (predictions: Array<{ place_id?: string }> | null) => {
        resolve(predictions?.[0]?.place_id ?? null)
      })
    })

    if (!placeId) return null

    const placesService = new PlacesService(document.createElement("div"))
    const details = await new Promise<{ lat: number | null; lng: number | null }>((resolve) => {
      placesService.getDetails({ placeId, fields: ["geometry"] }, (place: any, status: string) => {
        if (status === "OK" && place?.geometry?.location) {
          resolve({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() })
        } else {
          resolve({ lat: null, lng: null })
        }
      })
    })

    return { placeId, lat: details.lat, lng: details.lng }
  }

  const handleContinue = async () => {
    // Se estiver na aba "ida" (outbound), mudar para aba "volta" (return)
    if (transfer.transferType === "ida") {
      setTransferType("volta")
      // Scroll para o topo após mudar de aba
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    // Se estiver na aba "volta" (return), validar e continuar
    setError("")
    if (!selectedVehicle) {
      setError("Please select a vehicle first.")
      return
    }
    if (!transfer.departureDate) {
      setError("Please choose the departure date and time.")
      return
    }
    const departureDate =
      transfer.departureDate instanceof Date ? transfer.departureDate : new Date(transfer.departureDate as any)
    if (!Number.isFinite(departureDate.getTime())) {
      updateTransfer({ departureDate: undefined })
      setError("Please choose the departure date and time.")
      return
    }
    if (!transfer.fromLocation || !transfer.toLocation) {
      setError(t("fillLocations"))
      return
    }

    if (isRoundTrip && !transfer.returnDate) {
      setError(t("returnDateRequired"))
      return
    }

    // Não bloqueamos a continuação quando o voo não foi confirmado — o número é
    // opcional e guardado tal como escrito; a submissão usa "Unknown" como
    // fallback da companhia. (comportamento à Welcome Pickups)

    setIsSubmitting(true)
    try {
      let fromPlaceId = transfer.fromPlaceId
      let fromLat = transfer.fromLat
      let fromLng = transfer.fromLng
      let toPlaceId = transfer.toPlaceId
      let toLat = transfer.toLat
      let toLng = transfer.toLng

      if (!fromPlaceId) {
        const resolved = await resolvePlaceFromText(transfer.fromLocation)
        if (resolved) {
          fromPlaceId = resolved.placeId
          fromLat = resolved.lat
          fromLng = resolved.lng
          updateTransfer({ fromPlaceId, fromLat, fromLng })
        }
      }
      if (!toPlaceId) {
        const resolved = await resolvePlaceFromText(transfer.toLocation)
        if (resolved) {
          toPlaceId = resolved.placeId
          toLat = resolved.lat
          toLng = resolved.lng
          updateTransfer({ toPlaceId, toLat, toLng })
        }
      }

      const resolvedStops = await Promise.all(
        stops.map(async (stop) => {
          if (stop.placeId) return stop
          const resolved = await resolvePlaceFromText(stop.text)
          return {
            text: stop.text,
            placeId: resolved?.placeId ?? null,
            lat: resolved?.lat ?? null,
            lng: resolved?.lng ?? null,
          }
        })
      )
      updateTransfer({ stops: resolvedStops })

      if (!fromPlaceId || !toPlaceId) {
        setError("Please select a suggestion for both origin and destination.")
        return
      }

      const departure = toBackendLocation({
        location: transfer.fromLocation,
        placeId: fromPlaceId,
        lat: fromLat,
        lng: fromLng,
      })
      const arrival = toBackendLocation({ location: transfer.toLocation, placeId: toPlaceId, lat: toLat, lng: toLng })
      const backendStops = resolvedStops.map((s) =>
        toBackendLocation({ location: s.text, placeId: s.placeId, lat: s.lat, lng: s.lng })
      )

      // Usar ordem existente ou criar nova se não existir
      let currentOrderId = orderId
      let returnOrderId: string | null = null
      
      if (!currentOrderId) {
        const initOrderPayload = {
          departure,
          arrival,
          stops: backendStops,
          passengers: transfer.passengers,
          adults: transfer.adults,
          children: transfer.children,
          departureDate: formatLocalDateTime(departureDate, true),
          isRoundTrip: false, // Sempre criar apenas 1 ordem inicialmente
          returnDate: undefined,
          partnershipSlug: partnershipSlug || readReferralCookie() || undefined,
          /* A origem vai junto mas fica gravada à parte do parceiro: uma é
             campanha de anúncios, o outro é uma relação comercial nossa. */
          adSource: readAdSourceCookie() ?? undefined,
          opprefId: readOppref(),
        }
        const initResp = await initOrder(convex, initOrderPayload)
        currentOrderId = initResp.order.id
        setOrder(currentOrderId, initResp.order)
      } else {
        // Verificar se já existe ordem de retorno
        const existingOrder = await convex.query(api.orders.getByOrderNumber, { orderNumber: String(currentOrderId) })
        if (existingOrder?.relatedOrderId) {
          const returnOrder = await convex.query(api.orders.getById, { orderId: existingOrder.relatedOrderId })
          returnOrderId = returnOrder?.orderNumber || null
        }
        /* Desmarcou "ida e volta" depois de a volta existir: desliga-a, ou o
           servidor contava a volta no preço e recusava o pagamento. */
        if (existingOrder && !isRoundTrip && returnOrderId) {
          await convex.mutation(api.orders.desligarVolta, { orderId: existingOrder._id })
          returnOrderId = null
        }
      }

      // Se for round trip mas ainda não existe ordem de retorno, criar agora (mesmo sem returnDate ainda)
      if (isRoundTrip && !returnOrderId) {
        // Se não tiver returnDate ainda, usar uma data placeholder (será atualizada depois)
        const returnDate = transfer.returnDate 
          ? new Date(transfer.returnDate)
          : departureDate ? new Date(departureDate.getTime() + 24 * 60 * 60 * 1000) : relogioDeLisboa() // 1 dia depois se não tiver
        
        if (Number.isFinite(returnDate.getTime())) {
          const returnOrderResp = await createReturnOrder(convex, currentOrderId, {
            departure: arrival, // Return starts from arrival
            arrival: departure, // Return ends at departure
            departureDate: formatLocalDateTime(returnDate, true),
            passengers: transfer.passengers,
            adults: transfer.adults,
            children: transfer.children,
          })
          returnOrderId = returnOrderResp.order.id
        }
      }

      // Select car for outbound order - usar preço base do veículo (não o total com taxas)
      const vehicleBasePrice = basePrice // Preço base do veículo (ex: 51)
      const selectCarPayload = {
        carId: String(selectedVehicle.id),
        type: selectedVehicle.name,
        price: vehicleBasePrice, // Preço base do veículo (mesmo valor para ambas as ordens em round trip)
        passengerCapacity: selectedVehicle.passengers,
      }
      await selectCar(convex, currentOrderId, selectCarPayload)

      // If round trip, also select car for return order (sempre atualizar ambas)
      if (isRoundTrip && returnOrderId) {
        await selectCar(convex, returnOrderId, selectCarPayload)
      }

      // Register outbound trip
      const registTripPayload = {
        flightNumber: transfer.outboundFlightNumber || "",
        departureDate: formatLocalDateTime(departureDate, false),
        backpacks: transfer.luggage.backpack,
        handbaggage: transfer.luggage.handLuggage,
        pets: transfer.petChecked ? transfer.pet.small + transfer.pet.large : 0,
        smallPets: transfer.petChecked ? transfer.pet.small : 0,
        largePets: transfer.petChecked ? transfer.pet.large : 0,
        childSeats: transfer.childSeatChecked ? transfer.childSeats.child : 0,
        babySeats: transfer.childSeatChecked ? transfer.childSeats.baby : 0,
        boosterSeats: transfer.childSeatChecked ? transfer.childSeats.booster : 0,
        checkedBaggage: transfer.luggage.checkedBaggage,
        surfboards: transfer.surfboardChecked ? transfer.surfboard.standard + transfer.surfboard.upgraded : 0,
        standardSurfboards: transfer.surfboardChecked ? transfer.surfboard.standard : 0,
        largeSurfboards: transfer.surfboardChecked ? transfer.surfboard.upgraded : 0,
        passengers: transfer.passengers,
        adults: transfer.adults,
        children: transfer.children,
        flightType: "IDA" as const,
        departure,
        arrival,
        arrivalDate: transfer.outboundArrivalDate as any,
        airlineCompany:
          transfer.outboundAirlineCompany ||
          (transfer.outboundFlightNumber ? "Unknown" : null),
        amadeusFlightInfo: transfer.outboundAmadeusFlightInfo,
        distance: distance ?? undefined,
        routeDurationMinutes: routeDuration ?? undefined,
      }
      await registTrip(convex, currentOrderId, registTripPayload)

      // If round trip, register return trip in separate order (sempre com os mesmos dados de bagagem/equipamento)
      if (isRoundTrip && returnOrderId) {
        // Se não tiver returnDate ainda, usar uma data placeholder (será atualizada depois)
        const returnDate = transfer.returnDate 
          ? new Date(transfer.returnDate)
          : departureDate ? new Date(departureDate.getTime() + 24 * 60 * 60 * 1000) : relogioDeLisboa() // 1 dia depois se não tiver
        
        if (Number.isFinite(returnDate.getTime())) {
          const returnTripPayload = {
            flightNumber: transfer.returnFlightNumber || "",
            departureDate: formatLocalDateTime(returnDate, false),
            // Return trip usa os mesmos dados de bagagem/equipamento da ida
            backpacks: transfer.luggage.backpack,
            handbaggage: transfer.luggage.handLuggage,
            pets: transfer.petChecked ? transfer.pet.small + transfer.pet.large : 0,
            smallPets: transfer.petChecked ? transfer.pet.small : 0,
            largePets: transfer.petChecked ? transfer.pet.large : 0,
            childSeats: transfer.childSeatChecked ? transfer.childSeats.child : 0,
            babySeats: transfer.childSeatChecked ? transfer.childSeats.baby : 0,
            boosterSeats: transfer.childSeatChecked ? transfer.childSeats.booster : 0,
            checkedBaggage: transfer.luggage.checkedBaggage,
            surfboards: transfer.surfboardChecked ? transfer.surfboard.standard + transfer.surfboard.upgraded : 0,
            standardSurfboards: transfer.surfboardChecked ? transfer.surfboard.standard : 0,
            largeSurfboards: transfer.surfboardChecked ? transfer.surfboard.upgraded : 0,
            passengers: transfer.passengers,
            adults: transfer.adults,
            children: transfer.children,
            flightType: "VOLTA" as const,
            // Locations swapped for return trip
            departure: arrival,
            arrival: departure,
            arrivalDate: transfer.returnArrivalDate,
            airlineCompany:
              transfer.returnAirlineCompany ||
              (transfer.returnFlightNumber ? "Unknown" : null),
            amadeusFlightInfo: transfer.returnAmadeusFlightInfo,
            distance: distance ?? undefined,
            routeDurationMinutes: routeDuration ?? undefined,
          }
          await registTrip(convex, returnOrderId, returnTripPayload)
        }
      }

      onContinue()
    } catch (e: any) {
      setError(e?.message || "Failed to submit transfer details.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const luggageCapacity = selectedVehicle?.luggage ?? Infinity
  const currentTotalLuggage = transfer.luggage.backpack + transfer.luggage.handLuggage + transfer.luggage.checkedBaggage
  const remainingLuggageCapacity = Math.max(0, luggageCapacity - currentTotalLuggage)

  const passengerCapacity = selectedVehicle?.passengers ?? Infinity
  const isEditingReturn = isReturnTab && transfer.bookReturn
  const displayFromLocation = isReturnTab ? transfer.toLocation : transfer.fromLocation
  const displayFromPlaceId = isReturnTab ? transfer.toPlaceId : transfer.fromPlaceId
  const displayFromLat = isReturnTab ? transfer.toLat : transfer.fromLat
  const displayFromLng = isReturnTab ? transfer.toLng : transfer.fromLng
  const displayToLocation = isReturnTab ? transfer.fromLocation : transfer.toLocation
  const displayToPlaceId = isReturnTab ? transfer.fromPlaceId : transfer.toPlaceId
  const displayToLat = isReturnTab ? transfer.fromLat : transfer.toLat
  const displayToLng = isReturnTab ? transfer.fromLng : transfer.toLng

  const handleUpgrade = () => {
    setUpgradeMode(true)
    setShowTransferForm(false)
    setStep(1)
  }

  const luggageItems = [
    {
      label: t("backpack"),
      icon: Backpack,
      value: transfer.luggage.backpack,
      onChange: (v: number) => updateTransfer({ luggage: { ...transfer.luggage, backpack: v } }),
      max: transfer.luggage.backpack + remainingLuggageCapacity,
    },
    {
      label: t("handLuggage"),
      icon: Luggage,
      value: transfer.luggage.handLuggage,
      onChange: (v: number) => updateTransfer({ luggage: { ...transfer.luggage, handLuggage: v } }),
      max: transfer.luggage.handLuggage + remainingLuggageCapacity,
    },
    {
      label: t("checkedBaggage"),
      icon: Briefcase,
      value: transfer.luggage.checkedBaggage,
      onChange: (v: number) => updateTransfer({ luggage: { ...transfer.luggage, checkedBaggage: v } }),
      max: transfer.luggage.checkedBaggage + remainingLuggageCapacity,
    },
  ]

  return (
    <div className="w-full">
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-[22px] font-bold text-[#222222] mb-6">{t("title")}</h2>

        <div className="flex gap-3 mb-6 relative">
          <button
            onClick={() => setTransferType("ida")}
            className={`flex-1 py-3 rounded-lg font-semibold text-[15px] transition-colors ${
              transfer.transferType === "ida" ? "bg-[#27c7ff] text-white" : "bg-[#f7f7f7] text-[#222222]"
            }`}
          >
            {t("outbound")}
          </button>
          <button
            onClick={() => setTransferType("volta")}
            className={`flex-1 py-3 rounded-lg font-semibold text-[15px] transition-colors ${
              transfer.transferType === "volta" ? "bg-[#27c7ff] text-white" : "bg-[#f7f7f7] text-[#222222]"
            }`}
          >
            {t("return")}
          </button>
        </div>

        {transfer.transferType === "volta" && (
          <div className="mb-4 bg-[#f7f7f7] p-2.5 rounded">
            <label htmlFor="book-return" className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="book-return"
                checked={transfer.bookReturn}
                onCheckedChange={(checked: boolean) => updateTransfer({ bookReturn: checked })}
              />
              <span className="text-[13px] text-[#222222]">{t("bookReturn")}</span>
            </label>
          </div>
        )}

        <AnimatedCollapse isOpen={showLocationFields}>
          <FormField label={t("from")}>
            <GooglePlacesInput
              value={{
                location: displayFromLocation,
                placeId: displayFromPlaceId,
                lat: displayFromLat,
                lng: displayFromLng,
              }}
              onChange={(v) => {
                if (isReturnTab) {
                  updateTransfer({
                    toLocation: v.location,
                    toPlaceId: v.placeId,
                    toLat: v.lat,
                    toLng: v.lng,
                  })
                  return
                }

                updateTransfer({
                  fromLocation: v.location,
                  fromPlaceId: v.placeId,
                  fromLat: v.lat,
                  fromLng: v.lng,
                })
              }}
              placeholder={t("departureLocation")}
            />
          </FormField>

          {stops.map((stop, index) => (
            <div key={index} className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[15px] font-semibold text-[#222222]">{t("extraStop")}</label>
                <button
                  onClick={() => handleRemoveStop(index)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <GooglePlacesInput
                value={{ location: stop.text, placeId: stop.placeId, lat: stop.lat, lng: stop.lng }}
                onChange={(v) => handleUpdateStop(index, v)}
                placeholder={t("destinationLocation")}
              />
            </div>
          ))}

          <FormField label={t("to")}>
            <GooglePlacesInput
              value={{
                location: displayToLocation,
                placeId: displayToPlaceId,
                lat: displayToLat,
                lng: displayToLng,
              }}
              onChange={(v) => {
                if (isReturnTab) {
                  updateTransfer({
                    fromLocation: v.location,
                    fromPlaceId: v.placeId,
                    fromLat: v.lat,
                    fromLng: v.lng,
                  })
                  return
                }

                updateTransfer({
                  toLocation: v.location,
                  toPlaceId: v.placeId,
                  toLat: v.lat,
                  toLng: v.lng,
                })
              }}
              placeholder={t("destinationLocation")}
            />
          </FormField>

          {stops.length < 1 && (
            <button
              onClick={handleAddStop}
              className="flex items-center gap-2 text-[14px] font-semibold text-[#27c7ff] hover:text-[#23b3e6] transition-colors mb-6"
            >
              <Plus className="w-4 h-4" />
              {t("addStop") || "Add stop"}
            </button>
          )}

          {!isReturnTab && (
            <FormField label={isRoundTrip ? t("departureDateLabel") : t("dateTime")}>
              <DateTimePicker
                value={transfer.departureDate}
                onChange={(d) => updateTransfer({ departureDate: d })}
              />
            </FormField>
          )}

          <AnimatedCollapse
            isOpen={isEditingReturn}
            className={isEditingReturn ? "mb-6" : "mb-0"}
          >
            <FormField label={t("returnDateLabel")} className="mb-0">
              <DateTimePicker 
                value={transfer.returnDate} 
                onChange={(d) => updateTransfer({ returnDate: d })} 
                placeholder={t("return") || "Regresso"}
              />
            </FormField>
          </AnimatedCollapse>

          <div className="mb-4">
            <label className="block text-[15px] font-semibold text-[#222222] mb-2">{t("flightNumber")}</label>
            <InputWithIcon
              icon={<Plane className="w-5 h-5" />}
              value={activeFlightNumber}
              onChange={(v) => {
                setFlightSuccess("")
                setFlightNotice("")
                updateTransfer(
                  buildFlightTransferUpdate({
                    flightNumber: v,
                    arrivalDate: null,
                    airlineCompany: null,
                    amadeusFlightInfo: null,
                  })
                )
              }}
              placeholder="TP1691"
              rightIcon={
                <Search 
                  className={`w-5 h-5 cursor-pointer transition-colors ${activeAirlineCompany ? "text-[#27c7ff]" : "text-[#bfbfbf] hover:text-[#808080]"}`} 
                  onClick={handleFlightLookup}
                />
              }
            />
            {activeAirlineCompany && (
              <p className="mt-1.5 text-xs font-semibold text-[#27c7ff]">
                ✓ {activeAirlineCompany}
              </p>
            )}
            {!activeAirlineCompany && flightNotice && (
              <p className="mt-1.5 text-xs text-[#808080] leading-[1.5]">
                {flightNotice}
              </p>
            )}
          </div>

          <div className="flex gap-3 bg-[#f5f5f5] p-3 rounded-lg mb-6">
            <Info
              data-theme-color="checkoutFormInfoBoxIcon"
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{
                color: "var(--theme-checkout-form-info-box-icon, #27C7FF)",
                stroke: "var(--theme-checkout-form-info-box-icon, #27C7FF)",
                fill: "none",
              }}
            />
            <p className="text-[13px] text-[#404040] leading-relaxed">{t("flightInfo")}</p>
          </div>

          <div className="mb-6">
            <label className="block text-[15px] font-semibold text-[#222222] mb-3">{t("passengers")}</label>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <span className="text-[13px] text-[#65758b] block mb-1">{t("adults")}</span>
                <Counter
                  value={transfer.adults}
                  onChange={(v) => updateTransfer({ adults: v, passengers: v + transfer.children })}
                  min={1}
                  max={passengerCapacity}
                  variant="mobile"
                />
              </div>
              <div className="flex-1">
                <span className="text-[13px] text-[#65758b] block mb-1">{t("children")}</span>
                <Counter
                  value={transfer.children}
                  onChange={(v) => updateTransfer({ children: v, passengers: transfer.adults + v })}
                  min={0}
                  max={Math.max(0, passengerCapacity - transfer.adults)}
                  variant="mobile"
                />
              </div>
            </div>
          </div>

          {transfer.passengers >= passengerCapacity && (
            <div className="flex items-center justify-between bg-[#dff7ff] p-4 rounded-lg mb-6 animate-in fade-in duration-300">
              <p className="text-[14px] text-[#0e4659]">{t("passengerLimit")}</p>
              <Button
                onClick={handleUpgrade}
                className="bg-[#27c7ff] hover:bg-[#23b3e6] text-white px-5 h-9 text-[14px] font-semibold"
              >
                {tCommon("upgrade").toUpperCase()}
              </Button>
            </div>
          )}

          <div className="mb-4">
            <div className="grid grid-cols-3 gap-3 md:hidden">
              {luggageItems.map((item) => (
                <LuggageSection
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  value={item.value}
                  onChange={item.onChange}
                  max={item.max}
                  variant="mobile"
                />
              ))}
            </div>

            <div className="hidden md:grid grid-cols-3 gap-4">
              {luggageItems.map((item) => (
                <LuggageSection
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  value={item.value}
                  onChange={item.onChange}
                  max={item.max}
                  variant="desktop"
                />
              ))}
            </div>
          </div>

          {remainingLuggageCapacity === 0 && (
            <div className="flex items-center justify-between bg-[#dff7ff] p-4 rounded-lg mb-6 animate-in fade-in duration-300">
              <p className="text-[14px] text-[#0e4659]">{t("luggageLimit")}</p>
              <Button
                onClick={handleUpgrade}
                className="bg-[#27c7ff] hover:bg-[#23b3e6] text-white px-5 h-9 text-[14px] font-semibold"
              >
                {tCommon("upgrade").toUpperCase()}
              </Button>
            </div>
          )}

          {isRoundTrip && (
            <div className="mb-3 flex items-center">
              <RoundTripInfoPopoverMobile
                label={t("extrasRoundTripTooltip")}
                content={t("extrasRoundTripTooltip")}
              />
              <div className="hidden md:block">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#dff7ff] border border-[#27c7ff]/40 text-[#27c7ff] hover:bg-[#c5eef9] focus:outline-none focus:ring-2 focus:ring-[#27c7ff] focus:ring-offset-1"
                      aria-label={t("extrasRoundTripTooltip")}
                    >
                      <Info
                        data-theme-color="checkoutFormInfoBoxIcon"
                        className="w-4 h-4"
                        strokeWidth={2.5}
                        style={{
                          color: "var(--theme-checkout-form-info-box-icon, #27C7FF)",
                          stroke: "var(--theme-checkout-form-info-box-icon, #27C7FF)",
                          fill: "none",
                        }}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={6} className="max-w-[260px] text-left z-[100] !bg-white !text-[#222222] shadow-lg border border-[#e0e0e0] [&>svg]:!fill-white [&>svg]:!stroke-white">
                    {t("extrasRoundTripTooltip")}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}

          <div className="mb-6">
            <div className="mb-4 flex items-center gap-2">
              <Checkbox
                id="child-seat"
                checked={transfer.childSeatChecked}
                onCheckedChange={(checked: boolean) => updateTransfer({ childSeatChecked: checked })}
              />
              <label
                htmlFor="child-seat"
                className="text-base font-semibold text-[#222222] inline-flex items-center gap-2 cursor-pointer"
              >
                <Image
                  src="/shared/icons/baby-car-seat.svg"
                  alt="Baby car seat"
                  width={24}
                  height={24}
                  className="w-6 h-6 text-[#27c7ff]"
                />
                {t("childSeat")}
              </label>
            </div>

            <AnimatedCollapse isOpen={transfer.childSeatChecked}>
              <div className="sm:hidden grid grid-cols-2 gap-2 pt-4">
                {childSeats.map((seat, index) => (
                  <ChildSeatCard
                    key={seat.id}
                    title={seat.title}
                    ageRange={seat.ageRange}
                    image={seat.image}
                    value={seat.value}
                    onChange={seat.onChange}
                    isSelected={index === 0}
                    variant="mobile"
                  />
                ))}
              </div>

              <div className="hidden sm:grid grid-cols-3 gap-4">
                {childSeats.map((seat, index) => (
                  <ChildSeatCard
                    key={seat.id}
                    title={seat.title}
                    ageRange={seat.ageRange}
                    image={seat.image}
                    value={seat.value}
                    onChange={seat.onChange}
                    isSelected={index === 0}
                    variant="desktop"
                  />
                ))}
              </div>
            </AnimatedCollapse>
          </div>

          <div className="mb-6">
            <div className="mb-4 flex items-center gap-2">
              <Checkbox
                id="surfboard"
                checked={transfer.surfboardChecked}
                onCheckedChange={(checked: boolean) => updateTransfer({ surfboardChecked: checked })}
              />
              <label
                htmlFor="surfboard"
                className="text-base font-semibold text-[#222222] inline-flex items-center gap-2 cursor-pointer"
              >
                <Image src="/shared/icons/surf.svg" alt="Surfboard" width={24} height={24} className="w-6 h-6" />
                {t("surfboard")}
              </label>
            </div>

            <AnimatedCollapse isOpen={transfer.surfboardChecked}>
              <div className="sm:hidden grid grid-cols-2 gap-2 pt-4">
                {surfboards.map((item) => (
                  <ExtrasCard
                    key={item.id}
                    title={item.title}
                    subtitle={item.subtitle}
                    image={item.image}
                    value={item.value}
                    onChange={item.onChange}
                    isSelected={item.value > 0}
                    badge={item.badge}
                    infoText={item.infoText}
                    imageRotation={item.imageRotation}
                    variant="mobile"
                  />
                ))}
              </div>
              <div className="hidden sm:grid grid-cols-2 gap-4">
                {surfboards.map((item) => (
                  <ExtrasCard
                    key={item.id}
                    title={item.title}
                    subtitle={item.subtitle}
                    image={item.image}
                    value={item.value}
                    onChange={item.onChange}
                    isSelected={item.value > 0}
                    badge={item.badge}
                    infoText={item.infoText}
                    imageRotation={item.imageRotation}
                    variant="desktop"
                  />
                ))}
              </div>

              {transfer.surfboard.upgraded > 0 && passengerCapacity <= 5 && (
                <div className="flex items-center justify-between bg-[#dff7ff] p-4 rounded-lg mt-3 animate-in fade-in duration-300">
                  <p className="text-[14px] text-[#0e4659]">{t("surfboardUpgradeNeeded")}</p>
                  <Button
                    onClick={handleUpgrade}
                    className="bg-[#27c7ff] hover:bg-[#23b3e6] text-white px-5 h-9 text-[14px] font-semibold"
                  >
                    {tCommon("upgrade").toUpperCase()}
                  </Button>
                </div>
              )}
            </AnimatedCollapse>
          </div>

          <div className="mb-6">
            <div className="mb-4 flex items-center gap-2">
              <Checkbox
                id="pet"
                checked={transfer.petChecked}
                onCheckedChange={(checked: boolean) => updateTransfer({ petChecked: checked })}
              />
              <label
                htmlFor="pet"
                className="text-base font-semibold text-[#222222] inline-flex items-center gap-2 cursor-pointer"
              >
                <Image src="/shared/icons/paw.svg" alt="Pet" width={24} height={24} className="w-6 h-6" />
                {t("pet")}
              </label>
            </div>

            <AnimatedCollapse isOpen={transfer.petChecked}>
              <div className="sm:hidden grid grid-cols-2 gap-2 pt-4">
                {pets.map((item) => (
                  <ExtrasCard
                    key={item.id}
                    title={item.title}
                    subtitle={item.subtitle}
                    image={item.image}
                    value={item.value}
                    onChange={item.onChange}
                    isSelected={item.value > 0}
                    badge={item.badge}
                    infoText={item.infoText}
                    imageRotation={item.imageRotation}
                    variant="mobile"
                  />
                ))}
              </div>
              <div className="hidden sm:grid grid-cols-2 gap-4">
                {pets.map((item) => (
                  <ExtrasCard
                    key={item.id}
                    title={item.title}
                    subtitle={item.subtitle}
                    image={item.image}
                    value={item.value}
                    onChange={item.onChange}
                    isSelected={item.value > 0}
                    badge={item.badge}
                    infoText={item.infoText}
                    imageRotation={item.imageRotation}
                    variant="desktop"
                  />
                ))}
              </div>

              {transfer.pet.large > 0 && passengerCapacity <= 5 && (
                <div className="flex items-center justify-between bg-[#dff7ff] p-4 rounded-lg mt-3 animate-in fade-in duration-300">
                  <p className="text-[14px] text-[#0e4659]">{t("petUpgradeNeeded")}</p>
                  <Button
                    onClick={handleUpgrade}
                    className="bg-[#27c7ff] hover:bg-[#23b3e6] text-white px-5 h-9 text-[14px] font-semibold"
                  >
                    {tCommon("upgrade").toUpperCase()}
                  </Button>
                </div>
              )}
            </AnimatedCollapse>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-3 bg-[#dff7ff] p-4 rounded-lg">
              <Checkbox
                id="terms"
                checked={transfer.acceptTerms}
                onCheckedChange={(checked: boolean) => updateTransfer({ acceptTerms: checked })}
              />
              <label htmlFor="terms" className="text-[14px] text-[#0e4659]">
                {t("agreeTerms")}
              </label>
            </div>
          </div>
        </AnimatedCollapse>

        {error && (
          <div className="mb-4 text-[13px] text-[#d60510]" aria-live="polite">
            {error}
          </div>
        )}

        {flightSuccess && (
          <div className="mb-4 text-[13px] text-[#27c7ff]" aria-live="polite">
            {flightSuccess}
          </div>
        )}

        <Button
          onClick={handleContinue}
          disabled={isSubmitting || !transfer.acceptTerms}
          className="w-full bg-[#27c7ff] hover:bg-[#23b3e6] text-white h-14 text-[16px] font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Lock className="w-5 h-5 mr-2" />
          {transfer.transferType === "ida" 
            ? tCommon("continue") 
            : t("continueWithPrice", { price: continueButtonTotal.toFixed(2).replace(".", ",") })
          }
        </Button>
      </div>
    </div>
  )
}
