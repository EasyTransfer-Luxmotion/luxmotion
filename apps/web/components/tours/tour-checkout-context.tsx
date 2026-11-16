"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { clearTourCart, saveTourCart } from "@/lib/tour-cart"
import type { EscolhaDeSaidas } from "@/components/events/escolha-saidas"

export interface TourCheckoutPickup {
  title: string
  address: string
  description?: string
  lat?: number
  lng?: number
  placeId?: string
}

export type ProductType = "tour" | "experience" | "event"

export interface TourCheckoutTour {
  _id: string
  title: string
  slug: string
  price: number
  currency?: string
  /** Só nos eventos com lugar partilhado; segue para a reserva. */
  sharingMode?: "private" | "shared"
  /** `price` é por viatura e não por pessoa: não se multiplica pelos passageiros. */
  perVehicle?: boolean
  /** Lugares da viatura; é o limite do "quantas pessoas vão" no checkout. */
  vehicleSeats?: number
  /** Alternativa quando não há viatura ligada ao evento. */
  maxPassengers?: number
  /** Thumbnail/banner image URL for the modal header and summary */
  image?: string
  pickup?: TourCheckoutPickup
  /** For events, use meetingPoint (same shape as pickup) */
  meetingPoint?: TourCheckoutPickup
  /** Evento partilhado com saídas (E3A): a ida, o regresso ou os dois. `price`
   *  já é a soma das duas por pessoa. */
  saidas?: EscolhaDeSaidas
}

export interface TourCheckoutBookingData {
  date: Date | null
  time: string | null
  adults: number
  children: number
  infants: number
  total: number
  selectedAddons?: Array<{
    addonId?: string
    universalAddonId?: string
    title: string
    price: number
    pricingType: "per_person" | "flat"
    quantity: number
    subtotal: number
  }>
  addonsTotal?: number
}

export interface TourCheckoutContact {
  name: string
  email: string
  phone: string
  nif: string
  observations: string
}

export interface TourCheckoutPayment {
  method: "cash" | "mbway" | "cartao"
  mbwayPhone: string
}

export interface TourCheckoutCardReturn {
  success: boolean
  bookingNumber: string
}

export interface TourCheckoutState {
  currentStep: number
  productType: ProductType
  tour: TourCheckoutTour | null
  bookingData: TourCheckoutBookingData | null
  bookingId: string | null
  bookingNumber: string | null
  contact: TourCheckoutContact
  selectedPickup: TourCheckoutPickup | null
  tipPercent: number
  tipAmount: number
  totalAmount: number
  payment: TourCheckoutPayment
  /** Preenchido ao regressar do pagamento com cartão (abre modal só com resultado) */
  cardReturnResult: TourCheckoutCardReturn | null
}

const initialContact: TourCheckoutContact = {
  name: "",
  email: "",
  phone: "",
  nif: "",
  observations: "",
}

const initialPayment: TourCheckoutPayment = {
  method: "cash",
  mbwayPhone: "",
}

const initialState: TourCheckoutState = {
  currentStep: 1,
  productType: "tour",
  tour: null,
  bookingData: null,
  bookingId: null,
  bookingNumber: null,
  contact: initialContact,
  selectedPickup: null,
  tipPercent: 0,
  tipAmount: 0,
  totalAmount: 0,
  payment: initialPayment,
  cardReturnResult: null,
}

interface TourCheckoutContextValue {
  state: TourCheckoutState
  setStep: (step: number) => void
  openCheckout: (productType: ProductType, product: TourCheckoutTour, bookingData: TourCheckoutBookingData) => void
  openCheckoutFromCardReturn: (success: boolean, bookingNumber: string) => void
  closeCheckout: () => void
  setBookingId: (id: string | null, bookingNumber: string | null) => void
  updateContact: (updates: Partial<TourCheckoutContact>) => void
  setSelectedPickup: (pickup: TourCheckoutPickup | null) => void
  setTip: (percent: number, amount: number) => void
  updateTotalAmount: (total: number) => void
  updatePayment: (updates: Partial<TourCheckoutPayment>) => void
  isOpen: boolean
}

const TourCheckoutContext = createContext<TourCheckoutContextValue | null>(null)

export function TourCheckoutProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TourCheckoutState>(initialState)
  const [isOpen, setIsOpen] = useState(false)

  const setStep = useCallback((step: number) => {
    setState((prev) => ({ ...prev, currentStep: step }))
  }, [])

  const openCheckout = useCallback(
    (productType: ProductType, product: TourCheckoutTour, bookingData: TourCheckoutBookingData) => {
      const totalGuests = bookingData.adults + bookingData.children + bookingData.infants
      const baseTotal = product.perVehicle
        ? product.price
        : product.price * (totalGuests || 1)
      const addonsTotal = bookingData.addonsTotal ?? 0
      const pickup = product.pickup ?? product.meetingPoint ?? null
      setState({
        ...initialState,
        productType,
        tour: product,
        bookingData,
        tipPercent: 0,
        tipAmount: 0,
        totalAmount: baseTotal + addonsTotal,
        selectedPickup: pickup,
        contact: initialContact,
        payment: initialPayment,
        currentStep: 1,
      })
      setIsOpen(true)
      // Guardado para a barra de carrinho o poder mostrar (e reabrir) se a
      // pessoa fechar o checkout sem concluir.
      saveTourCart(productType, product, bookingData)
    },
    []
  )

  const openCheckoutFromCardReturn = useCallback((success: boolean, bookingNumber: string) => {
    setState((prev) => ({
      ...prev,
      ...initialState,
      cardReturnResult: { success, bookingNumber },
      bookingNumber,
      currentStep: 4,
    }))
    setIsOpen(true)
  }, [])

  const closeCheckout = useCallback(() => {
    setState((prev) => ({ ...prev, cardReturnResult: null }))
    setState(initialState)
    setIsOpen(false)
  }, [])

  const setBookingId = useCallback((bookingId: string | null, bookingNumber: string | null) => {
    // Feita a reserva, já não há nada pendente para a barra de carrinho mostrar.
    if (bookingNumber) clearTourCart()
    setState((prev) => ({ ...prev, bookingId, bookingNumber }))
  }, [])

  const updateContact = useCallback((updates: Partial<TourCheckoutContact>) => {
    setState((prev) => ({
      ...prev,
      contact: { ...prev.contact, ...updates },
    }))
  }, [])

  const setSelectedPickup = useCallback((pickup: TourCheckoutPickup | null) => {
    setState((prev) => ({ ...prev, selectedPickup: pickup }))
  }, [])

  const setTip = useCallback((tipPercent: number, tipAmount: number) => {
    setState((prev) => {
      const basePrice = (prev.tour?.price ?? 0) * (prev.bookingData ? prev.bookingData.adults + prev.bookingData.children + prev.bookingData.infants || 1 : 1)
      const addonsTotal = prev.bookingData?.addonsTotal ?? 0
      return {
        ...prev,
        tipPercent,
        tipAmount,
        totalAmount: basePrice + addonsTotal + tipAmount,
      }
    })
  }, [])

  const updateTotalAmount = useCallback((totalAmount: number) => {
    setState((prev) => ({ ...prev, totalAmount }))
  }, [])

  const updatePayment = useCallback((updates: Partial<TourCheckoutPayment>) => {
    setState((prev) => ({
      ...prev,
      payment: { ...prev.payment, ...updates },
    }))
  }, [])

  return (
    <TourCheckoutContext.Provider
      value={{
        state,
        setStep,
        openCheckout,
        openCheckoutFromCardReturn,
        closeCheckout,
        setBookingId,
        updateContact,
        setSelectedPickup,
        setTip,
        updateTotalAmount,
        updatePayment,
        isOpen,
      }}
    >
      {children}
    </TourCheckoutContext.Provider>
  )
}

export function useTourCheckout() {
  const ctx = useContext(TourCheckoutContext)
  if (!ctx) {
    throw new Error("useTourCheckout must be used within TourCheckoutProvider")
  }
  return ctx
}
