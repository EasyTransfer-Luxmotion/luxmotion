"use client"

import { useLocale } from "next-intl"
import { localizeVehicle, localizeSelection, type CatalogTranslation } from "@/lib/catalog-translations"

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import type { AmadeusFlightInfo } from "@/lib/orders"
import type { NearbyCategory } from "@/components/checkout/experiences-step"
import type { SelectedAddonLine } from "@/components/checkout/add-experience-modal"

export const DEV_ALLOW_STEP_SKIP = true

export interface Vehicle {
  id: string
  name: string
  originalName?: string
  originalExamples?: string
  translations?: CatalogTranslation[]
  /** Modelos concretos desta classe, ex. "Renault Clio, Fiat Tipo". */
  examples?: string
  price: number
  dayPrice?: number
  nightTaxAmount?: number
  nightTaxOutbound?: number
  nightTaxReturn?: number
  pricePerKm?: number
  hasDistance?: boolean
  image: string
  passengers: number
  luggage: number
  isElectric: boolean
  hasWifi?: boolean
  order?: number
  /** Standard vehicle this one is a premium upgrade of (checkout upsell). */
  upgradeFromVehicleId?: string
}

export interface TransferState {
  transferType: "ida" | "volta"
  bookReturn: boolean
  departureDate: Date | undefined
  returnDate: Date | undefined
  fromLocation: string
  fromPlaceId: string | null
  fromLat: number | null
  fromLng: number | null
  toLocation: string
  toPlaceId: string | null
  toLat: number | null
  toLng: number | null
  stops: { text: string; placeId: string | null; lat: number | null; lng: number | null }[]
  outboundFlightNumber: string
  outboundArrivalDate: string | null
  outboundAirlineCompany: string | null
  outboundAmadeusFlightInfo: AmadeusFlightInfo | null
  returnFlightNumber: string
  returnArrivalDate: string | null
  returnAirlineCompany: string | null
  returnAmadeusFlightInfo: AmadeusFlightInfo | null
  passengers: number
  adults: number
  children: number
  luggage: { backpack: number; handLuggage: number; checkedBaggage: number }
  childSeats: { baby: number; child: number; booster: number }
  childSeatChecked: boolean
  surfboardChecked: boolean
  petChecked: boolean
  surfboard: { standard: number; upgraded: number }
  pet: { small: number; large: number }
  shareTrip: boolean
  acceptTerms: boolean
}

export interface ExperienceSelection {
  experienceId: string
  slug: string
  category: NearbyCategory
  title: string
  originalTitle?: string
  translations?: CatalogTranslation[]
  passengers: number
  date: Date | undefined
  time: string | null
  /** Ids dos extras marcados — mantido para a UI. */
  extras: string[]
  /** Os mesmos extras, já valorizados: é isto que chega à order. */
  selectedAddons?: SelectedAddonLine[]
  /** Local do upsell, para a order saber onde é a paragem. */
  location?: {
    title: string
    address: string
    lat?: number
    lng?: number
    placeId?: string
  } | null
  specialRequest: string
  totalPrice: number
}

export interface PassengerState {
  isMainPassenger: boolean
  name: string
  email: string
  phone: string
  nif: string
  passengerName: string
  passengerEmail: string
  passengerPhone: string
  relationship: string
}

export interface PaymentState {
  method: "cartao" | "cash" | "multibanco" | "mbway"
  cardNumber: string
  expiry: string
  cvc: string
  mbwayPhone: string
  coupon: string
  specialRequest: string
  agreeRefund: boolean
  premiumInsurance: boolean
  refundTerms: boolean
  comfortConnection: boolean
  acceptTerms: boolean
}

export interface CheckoutState {
  currentStep: number
  direction: "left" | "right"
  selectedVehicle: Vehicle | null
  showTransferForm: boolean
  transfer: TransferState
  orderId: string | number | null
  order: unknown | null
  distance: number | null
  routeDuration: number | null
  experiences: ExperienceSelection[]
  passenger: PassengerState
  payment: PaymentState
  tipPercent: number
  tipAmount: number
  upgradeMode: boolean
  hasNearbyTours: boolean
  nearbyToursLoaded: boolean
}

const initialTransferState: TransferState = {
  transferType: "ida",
  bookReturn: false,
  departureDate: undefined,
  returnDate: undefined,
  fromLocation: "",
  fromPlaceId: null,
  fromLat: null,
  fromLng: null,
  toLocation: "",
  toPlaceId: null,
  toLat: null,
  toLng: null,
  stops: [],
  outboundFlightNumber: "",
  outboundArrivalDate: null,
  outboundAirlineCompany: null,
  outboundAmadeusFlightInfo: null,
  returnFlightNumber: "",
  returnArrivalDate: null,
  returnAirlineCompany: null,
  returnAmadeusFlightInfo: null,
  passengers: 1,
  adults: 1,
  children: 0,
  luggage: { backpack: 0, handLuggage: 0, checkedBaggage: 0 },
  childSeats: { baby: 0, child: 0, booster: 0 },
  childSeatChecked: false,
  surfboardChecked: false,
  petChecked: false,
  surfboard: { standard: 0, upgraded: 0 },
  pet: { small: 0, large: 0 },
  shareTrip: false,
  acceptTerms: false,
}

const initialPassengerState: PassengerState = {
  isMainPassenger: true,
  name: "",
  email: "",
  phone: "",
  nif: "",
  passengerName: "",
  passengerEmail: "",
  passengerPhone: "",
  relationship: "family",
}

const initialPaymentState: PaymentState = {
  method: "cartao",
  cardNumber: "",
  expiry: "",
  cvc: "",
  mbwayPhone: "",
  coupon: "",
  specialRequest: "",
  agreeRefund: true,
  premiumInsurance: false,
  refundTerms: false,
  comfortConnection: false,
  acceptTerms: false,
}

const initialState: CheckoutState = {
  currentStep: 1,
  direction: "right",
  selectedVehicle: null,
  showTransferForm: false,
  transfer: initialTransferState,
  orderId: null,
  order: null,
  distance: null,
  routeDuration: null,
  experiences: [],
  passenger: initialPassengerState,
  payment: initialPaymentState,
  tipPercent: 0,
  tipAmount: 0,
  upgradeMode: false,
  hasNearbyTours: false,
  nearbyToursLoaded: false,
}

const STORAGE_KEY = "easytransfer_customizable_checkout"
const SESSION_KEY = "easytransfer_customizable_checkout_session"

function isPageReload(): boolean {
  if (typeof window === "undefined") return false
  try {
    // Verificar se há dados válidos no sessionStorage
    const hasStoredData = sessionStorage.getItem(STORAGE_KEY)
    if (hasStoredData) {
      try {
        const parsed = JSON.parse(hasStoredData)
        // Se há dados válidos com transfer, provavelmente é navegação normal, não reload
        if (parsed?.transfer && (parsed.transfer.fromLocation || parsed.transfer.toLocation)) {
          return false
        }
      } catch {
        // Se não conseguir parsear, tratar como reload
      }
    }
    
    // Verificar tipo de navegação
    const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[]
    if (navEntries.length > 0 && navEntries[0]) {
      const navType = navEntries[0].type
      // "reload" significa reload explícito (F5)
      // "navigate" significa navegação normal
      return navType === "reload"
    }
    
    // Fallback para navegadores antigos
    return performance.navigation?.type === 1
  } catch {
    return false
  }
}

interface CheckoutContextValue {
  isHydrated: boolean
  state: CheckoutState
  setStep: (step: number) => void
  setSelectedVehicle: (vehicle: Vehicle | null) => void
  setShowTransferForm: (show: boolean) => void
  updateTransfer: (updates: Partial<TransferState>) => void
  setOrder: (orderId: string | number | null, order: unknown | null) => void
  updateDistance: (distance: number | null, routeDuration?: number | null) => void
  addExperience: (experience: ExperienceSelection) => void
  removeExperience: (experienceId: string) => void
  updatePassenger: (updates: Partial<PassengerState>) => void
  updatePayment: (updates: Partial<PaymentState>) => void
  setTip: (tipPercent: number, tipAmount: number) => void
  resetCheckout: () => void
  submitCheckout: () => void
  setUpgradeMode: (upgradeMode: boolean) => void
  setNearbyTours: (has: boolean) => void
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null)

function serializeState(state: CheckoutState): string {
  return JSON.stringify(state, (key, value) => {
    if (value instanceof Date) {
      return { __type: "Date", value: value.toISOString() }
    }
    return value
  })
}

function deserializeState(json: string): CheckoutState {
  return JSON.parse(json, (key, value) => {
    if (value && typeof value === "object" && value.__type === "Date") {
      return new Date(value.value)
    }
    return value
  })
}

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const [state, setState] = useState<CheckoutState>(initialState)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    // Clear checkout data on page refresh
    if (isPageReload()) {
      sessionStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(SESSION_KEY)
      setIsHydrated(true)
      return
    }

    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = deserializeState(stored)
        const parsedTransfer = parsed.transfer || {}
        const {
          flightNumber: legacyFlightNumber,
          arrivalDate: legacyArrivalDate,
          airlineCompany: legacyAirlineCompany,
          ...parsedTransferRest
        } = parsedTransfer as typeof parsedTransfer & {
          flightNumber?: string
          arrivalDate?: string | null
          airlineCompany?: string | null
        }
        const passengers = parsedTransfer.passengers ?? initialTransferState.passengers
        const adults = parsedTransfer.adults ?? initialTransferState.adults
        const children = parsedTransfer.children ?? initialTransferState.children
        const sum = adults + children
        const finalAdults = sum === passengers ? adults : passengers
        const finalChildren = sum === passengers ? children : 0
        setState({
          ...initialState,
          ...parsed,
          transfer: {
            ...initialTransferState,
            ...parsedTransferRest,
            stops: Array.isArray(parsedTransferRest.stops) ? parsedTransferRest.stops : [],
            outboundFlightNumber: parsedTransferRest.outboundFlightNumber ?? legacyFlightNumber ?? initialTransferState.outboundFlightNumber,
            outboundArrivalDate: parsedTransferRest.outboundArrivalDate ?? legacyArrivalDate ?? initialTransferState.outboundArrivalDate,
            outboundAirlineCompany: parsedTransferRest.outboundAirlineCompany ?? legacyAirlineCompany ?? initialTransferState.outboundAirlineCompany,
            passengers,
            adults: finalAdults,
            children: finalChildren,
          },
        })
      }
    } catch {
      console.warn("Failed to load checkout state from sessionStorage")
    }
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return
    try {
      sessionStorage.setItem(STORAGE_KEY, serializeState(state))
    } catch {
      console.warn("Failed to save checkout state to sessionStorage")
    }
  }, [state, isHydrated])

  const setStep = useCallback((step: number) => {
    setState((prev) => {
      /* Voltar ao início limpa as experiências — ver o contexto do checkout
         principal para o porquê. */
      const recuaAoInicio = step === 1 && prev.currentStep > 1
      const newState: CheckoutState = {
        ...prev,
        direction: (step > prev.currentStep ? "right" : "left") as "left" | "right",
        currentStep: step,
        ...(recuaAoInicio ? { experiences: [] } : {}),
      }
      // Immediately save to sessionStorage when moving to step 4 to prevent state loss
      if (step >= 4 && typeof window !== "undefined" && isHydrated) {
        try {
          sessionStorage.setItem(STORAGE_KEY, serializeState(newState))
        } catch {
          console.warn("Failed to save checkout state to sessionStorage")
        }
      }
      return newState
    })
  }, [isHydrated])

  const setSelectedVehicle = useCallback((vehicle: Vehicle | null) => {
    setState((prev) => ({ ...prev, selectedVehicle: vehicle }))
  }, [])

  const setShowTransferForm = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showTransferForm: show }))
  }, [])

  const updateTransfer = useCallback((updates: Partial<TransferState>) => {
    setState((prev) => ({
      ...prev,
      transfer: { ...prev.transfer, ...updates },
    }))
  }, [])

  const updateDistance = useCallback((distance: number | null, routeDuration?: number | null) => {
    setState((prev) => ({
      ...prev,
      distance,
      routeDuration: routeDuration !== undefined ? routeDuration : prev.routeDuration,
    }))
  }, [])

  const setOrder = useCallback((orderId: string | number | null, order: any | null) => {
    setState((prev) => {
      const distance =
        order?.outboundCarTrip?.distance ??
        order?.order?.outboundCarTrip?.distance ??
        prev.distance

      return {
        ...prev,
        orderId,
        order,
        distance: distance != null ? Number(distance) : prev.distance,
      }
    })
  }, [])

  const addExperience = useCallback((experience: ExperienceSelection) => {
    setState((prev) => ({
      ...prev,
      experiences: [...prev.experiences, experience],
    }))
  }, [])

  const removeExperience = useCallback((experienceId: string) => {
    setState((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((e) => e.experienceId !== experienceId),
    }))
  }, [])

  const updatePassenger = useCallback((updates: Partial<PassengerState>) => {
    setState((prev) => ({
      ...prev,
      passenger: { ...prev.passenger, ...updates },
    }))
  }, [])

  const updatePayment = useCallback((updates: Partial<PaymentState>) => {
    setState((prev) => ({
      ...prev,
      payment: { ...prev.payment, ...updates },
    }))
  }, [])

  const setTip = useCallback((tipPercent: number, tipAmount: number) => {
    setState((prev) => ({ ...prev, tipPercent, tipAmount }))
  }, [])

  const resetCheckout = useCallback(() => {
    setState(initialState)
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(SESSION_KEY)
    }
  }, [])

  const submitCheckout = useCallback(() => {
  }, [state])

  const setUpgradeMode = useCallback((upgradeMode: boolean) => {
    setState((prev) => ({ ...prev, upgradeMode }))
  }, [])

  const setNearbyTours = useCallback((has: boolean) => {
    setState((prev) => ({ ...prev, hasNearbyTours: has, nearbyToursLoaded: true }))
  }, [])

  const value: CheckoutContextValue = {
    isHydrated,
    state: {
      ...state,
      selectedVehicle: state.selectedVehicle ? localizeVehicle(state.selectedVehicle, locale) : null,
      experiences: state.experiences.map((item) => localizeSelection(item, locale)),
    },
    setStep,
    setSelectedVehicle,
    setShowTransferForm,
    updateTransfer,
    setOrder,
    updateDistance,
    addExperience,
    removeExperience,
    updatePassenger,
    updatePayment,
    setTip,
    resetCheckout,
    submitCheckout,
    setUpgradeMode,
    setNearbyTours,
  }

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>
}

export function useCheckout() {
  const context = useContext(CheckoutContext)
  if (!context) {
    throw new Error("useCheckout must be used within a CheckoutProvider")
  }
  return context
}
