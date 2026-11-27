"use client"

import { useMutation, useQuery, useAction } from "convex/react"
import { api } from "@workspace/convex/api"
import type { Id } from "@workspace/convex/dataModel"
import type { AdSource } from "@/lib/ad-source"

// ===================== Types =====================

export interface Location {
  location: string
  placeId: string | null
  lat: number | null
  lng: number | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null
  name?: string | null
  terminal?: string | null
}

export interface Order {
  _id: Id<"orders">
  orderNumber?: string
  status: "draft" | "pending" | "confirmed" | "paid" | "completed" | "cancelled"
  distance?: number
  price?: number
  totalAmount?: number
  // ... outros campos
}

export interface InitOrderResponse {
  order: {
    id: string // orderNumber
    _id: Id<"orders">
    [key: string]: any
  }
}

export type FlightType = "IDA" | "VOLTA"

export interface SelectFlightRequest {
  flightNumber: string
  departureDate: string
}

export interface AmadeusFlightInfo {
  carrier?: string | null
  flightNumber?: string | null
  airlineCompany?: string | null
  scheduledDepartureDate?: string | null
  departureAirportCode?: string | null
  departureTerminal?: string | null
  departureDateTimeLocal?: string | null
  departureTimingSource?: string | null
  arrivalAirportCode?: string | null
  arrivalTerminal?: string | null
  arrivalDateTimeLocal?: string | null
  arrivalTimingSource?: string | null
  aircraftCode?: string | null
  operatingCarrierCode?: string | null
  rawFlightData?: Record<string, unknown> | null
}

export interface SelectFlightResponse {
  carrier: string
  flightNumber: string
  airlineCompany: string
  arrivalDateTimeLocal: string
  amadeusFlightInfo?: AmadeusFlightInfo | null
}

export type PaymentMethod = "mbway" | "mb" | "ccard" | "cash"

export interface StartPaymentRequest {
  /** The route the customer saw priced; the server checks the price with it. */
  distance?: number
  routeDurationMinutes?: number
  amount: number
  amountReturn?: number // Opcional para compatibilidade
  basePrice: number
  basePriceReturn?: number // Opcional para compatibilidade
  discountAmount: number
  discountAmountReturn?: number // Opcional para compatibilidade
  additionalFees: number
  additionalFeesReturn?: number // Opcional para compatibilidade
  nightTax: number
  nightTaxReturn?: number // Opcional para compatibilidade
  airportServiceFee: number
  cancellationFee: number
  refundFee: number
  refundToOriginalPaymentMethod: boolean
  nif?: string
  phoneNumber?: string
  email?: string
  driverNotes?: string
  selectedCheckoutAddons?: {
    code: string
    label: string
    price: number
  }[]
  successUrl?: string
  errorUrl?: string
  cancelUrl?: string
  language?: string
  expiryDays?: number
  description?: string
  useSandbox?: boolean
}

function sanitizeAmadeusFlightInfo(
  flightInfo?: AmadeusFlightInfo | null
): AmadeusFlightInfo | undefined {
  if (!flightInfo) {
    return undefined
  }

  const sanitizedEntries = Object.entries(flightInfo).filter(
    ([, value]) => value !== null && value !== undefined
  )

  if (sanitizedEntries.length === 0) {
    return undefined
  }

  return Object.fromEntries(sanitizedEntries) as AmadeusFlightInfo
}

// ===================== Utility Functions =====================

export function toBackendLocation(input: {
  location: string
  placeId: string | null
  lat?: number | null
  lng?: number | null
}): Location {
  return {
    location: input.location,
    placeId: input.placeId,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    city: null,
    state: null,
    zip_code: null,
    country: null,
    name: null,
    terminal: null,
  }
}

/** Formato para API: "YYYY-MM-DD HH:mm" ou "YYYY-MM-DD HH:mm:ss" (espaço, sem T). */
export function formatLocalDateTime(dateLike: Date | string | number, withSeconds = true): string {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid date")
  }

  const pad = (n: number) => String(n).padStart(2, "0")
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return withSeconds ? `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}` : `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

/** Formato para APIs que aceitam apenas a data: "YYYY-MM-DD". */
export function formatLocalDate(dateLike: Date | string | number): string {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid date")
  }

  const pad = (n: number) => String(n).padStart(2, "0")
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  return `${yyyy}-${mm}-${dd}`
}

// ===================== Hooks for Convex =====================

/**
 * Hook para criar uma ordem
 * Retorna a mutation do Convex
 */
export function useInitOrder() {
  return useMutation(api.orders.init)
}

/**
 * Hook para selecionar um veículo
 */
export function useSelectCar() {
  return useMutation(api.orders.selectCar)
}

/**
 * Hook para registrar uma viagem
 */
export function useRegistTrip() {
  return useMutation(api.orders.registTrip)
}

/**
 * Hook para registrar informações de contato
 */
export function useRegistContactInformation() {
  return useMutation(api.orders.registContactInformation)
}

/**
 * Hook para iniciar pagamento (action)
 */
export function useStartPayment() {
  return useAction(api.orders.startPaymentAction)
}

/**
 * Hook para lookup de voo
 */
export function useLookupFlight() {
  return useAction(api.flights.lookupFlightAction)
}

/**
 * Hook para buscar nome da companhia aérea
 * @param code - Código IATA ou ICAO da companhia aérea (ex: "EK", "UAE")
 */
export function useGetAirlineName(code: string | null) {
  return useQuery(
    api.flights.getAirlineName,
    code ? { code } : "skip"
  )
}

/**
 * Hook para monitorar status da ordem (substitui WebSocket)
 * @param orderId - Pode ser orderNumber (string) ou Convex _id
 */
export function useSubscribeToOrderStatus(orderId: string | number | null) {
  const orderNumber = orderId ? String(orderId) : null
  return useQuery(
    api.orders.subscribeToOrderStatus,
    orderNumber ? { orderNumber } : "skip"
  )
}

// ===================== Helper Functions (para compatibilidade) =====================

/**
 * Função helper para criar ordem (usa mutation diretamente)
 * Use esta função quando não estiver dentro de um componente React
 */
export async function initOrder(
  convex: any,
  payload: {
    departure: Location
    arrival: Location
    stops: Location[]
    passengers: number
    adults?: number
    children?: number
    departureDate: string
    isRoundTrip?: boolean
    returnDate?: string
    /** Slug da parceria no URL (ex: "vila-gale"). Omitir = site principal "Easy Transfer". */
    partnershipSlug?: string
    /** De onde veio a visita. Separado do parceiro — ver `lib/ad-source.ts`. */
    adSource?: AdSource
    /** O `__oppref` do Pixel, tal e qual. */
    opprefId?: string
  }
): Promise<InitOrderResponse> {
  const passengers = payload.passengers ?? (payload.adults ?? 0) + (payload.children ?? 0)
  const result = await convex.mutation(api.orders.init, {
    partnershipSlug: payload.partnershipSlug,
    adSource: payload.adSource,
    opprefId: payload.opprefId,
    departure: {
      location: payload.departure.location,
      placeId: payload.departure.placeId ?? undefined,
      lat: payload.departure.lat ?? undefined,
      lng: payload.departure.lng ?? undefined,
    },
    arrival: {
      location: payload.arrival.location,
      placeId: payload.arrival.placeId ?? undefined,
      lat: payload.arrival.lat ?? undefined,
      lng: payload.arrival.lng ?? undefined,
    },
    stops: payload.stops?.map(s => ({
      location: s.location,
      placeId: s.placeId ?? undefined,
      lat: s.lat ?? undefined,
      lng: s.lng ?? undefined,
    })),
    passengers,
    adults: payload.adults ?? undefined,
    children: payload.children ?? undefined,
    departureDate: payload.departureDate,
    isRoundTrip: payload.isRoundTrip,
    returnDate: payload.returnDate,
  })

  // Converter para formato compatível
  return {
    order: {
      id: result.order.orderNumber || result.order._id,
      ...result.order,
    },
  }
}

/**
 * Função helper para selecionar carro
 */
export async function selectCar(
  convex: any,
  orderId: string | number,
  payload: { carId: string; type: string; price: number; passengerCapacity: number }
): Promise<{ order: any }> {
  // Buscar ordem por orderNumber se necessário
  let convexOrderId: Id<"orders"> | string = orderId as any
  
  if (typeof orderId === "string" && !orderId.startsWith("j")) {
    // É um orderNumber, precisa buscar o _id
    const order = await convex.query(api.orders.getByOrderNumber, { orderNumber: orderId })
    if (!order) {
      throw new Error("Order not found")
    }
    convexOrderId = order._id
  }

  const result = await convex.mutation(api.orders.selectCar, {
    orderId: convexOrderId as Id<"orders">,
    vehicleId: payload.carId as Id<"vehicles">,
    vehicleName: payload.type,
    price: payload.price,
    passengerCapacity: payload.passengerCapacity,
  })

  return {
    order: {
      id: result.order.orderNumber || result.order._id,
      ...result.order,
    },
  }
}

/**
 * Função helper para criar ordem de retorno separadamente
 */
export async function createReturnOrder(
  convex: any,
  outboundOrderId: string | number,
  payload: {
    departure: Location
    arrival: Location
    departureDate: string
    passengers: number
    adults?: number
    children?: number
  }
): Promise<{ order: any }> {
  let convexOutboundOrderId: Id<"orders"> | string = outboundOrderId as any
  
  if (typeof outboundOrderId === "string" && !outboundOrderId.startsWith("j")) {
    const order = await convex.query(api.orders.getByOrderNumber, { orderNumber: outboundOrderId })
    if (!order) {
      throw new Error("Outbound order not found")
    }
    convexOutboundOrderId = order._id
  }

  const result = await convex.mutation(api.orders.createReturnOrder, {
    outboundOrderId: convexOutboundOrderId as Id<"orders">,
    departure: {
      location: payload.departure.location,
      placeId: payload.departure.placeId ?? undefined,
      lat: payload.departure.lat ?? undefined,
      lng: payload.departure.lng ?? undefined,
    },
    arrival: {
      location: payload.arrival.location,
      placeId: payload.arrival.placeId ?? undefined,
      lat: payload.arrival.lat ?? undefined,
      lng: payload.arrival.lng ?? undefined,
    },
    departureDate: payload.departureDate,
    passengers: payload.passengers,
    adults: payload.adults ?? undefined,
    children: payload.children ?? undefined,
  })

  return {
    order: {
      id: result.order.orderNumber || result.order._id,
      ...result.order,
    },
  }
}

/**
 * Função helper para registrar viagem
 */
export async function registTrip(
  convex: any,
  orderId: string | number,
  payload: {
    flightNumber: string
    departureDate: string
    backpacks: number
    handbaggage: number
    pets: number
    childSeats: number
    babySeats: number
    boosterSeats: number
    checkedBaggage: number
    surfboards: number
    smallPets?: number
    largePets?: number
    standardSurfboards?: number
    largeSurfboards?: number
    passengers: number
    adults?: number
    children?: number
    flightType: FlightType
    departure?: Location
    arrival?: Location
    arrivalDate?: string | null
    airlineCompany?: string | null
    amadeusFlightInfo?: AmadeusFlightInfo | null
    distance?: number
    routeDurationMinutes?: number
  }
): Promise<{ order: any }> {
  let convexOrderId: Id<"orders"> | string = orderId as any
  
  if (typeof orderId === "string" && !orderId.startsWith("j")) {
    const order = await convex.query(api.orders.getByOrderNumber, { orderNumber: orderId })
    if (!order) {
      throw new Error("Order not found")
    }
    convexOrderId = order._id
  }

  const result = await convex.mutation(api.orders.registTrip, {
    orderId: convexOrderId as Id<"orders">,
    flightNumber: payload.flightNumber.trim() || undefined,
    departureDate: payload.departureDate,
    arrivalDate: payload.arrivalDate ?? undefined,
    backpacks: payload.backpacks ?? undefined,
    handbaggage: payload.handbaggage ?? undefined,
    checkedBaggage: payload.checkedBaggage ?? undefined,
    pets: payload.pets ?? undefined,
    smallPets: payload.smallPets ?? undefined,
    largePets: payload.largePets ?? undefined,
    surfboards: payload.surfboards ?? undefined,
    standardSurfboards: payload.standardSurfboards ?? undefined,
    largeSurfboards: payload.largeSurfboards ?? undefined,
    childSeats: payload.childSeats ?? undefined,
    babySeats: payload.babySeats ?? undefined,
    boosterSeats: payload.boosterSeats ?? undefined,
    passengers: payload.passengers,
    adults: payload.adults ?? undefined,
    children: payload.children ?? undefined,
    flightType: payload.flightType ?? undefined,
    airlineCompany: payload.airlineCompany ?? undefined,
    amadeusFlightInfo: sanitizeAmadeusFlightInfo(payload.amadeusFlightInfo),
    distance: payload.distance ?? undefined,
    routeDurationMinutes: payload.routeDurationMinutes ?? undefined,
    departure: payload.departure ? {
      location: payload.departure.location,
      placeId: payload.departure.placeId ?? undefined,
      lat: payload.departure.lat ?? undefined,
      lng: payload.departure.lng ?? undefined,
    } : undefined,
    arrival: payload.arrival ? {
      location: payload.arrival.location,
      placeId: payload.arrival.placeId ?? undefined,
      lat: payload.arrival.lat ?? undefined,
      lng: payload.arrival.lng ?? undefined,
    } : undefined,
  })

  return {
    order: {
      id: result.order.orderNumber || result.order._id,
      ...result.order,
    },
  }
}

/**
 * Função helper para registrar informações de contato
 */
export async function registContactInformation(
  convex: any,
  orderId: string | number,
  payload: {
    name: string
    email: string
    phoneNumber: string
    nif?: string
    bookedForAnotherPerson?: boolean
    passengerName?: string
    passengerEmail?: string
    passengerWhatsapp?: string
    passengerRelationship?: string
  }
): Promise<{ order: any }> {
  let convexOrderId: Id<"orders"> | string = orderId as any
  
  if (typeof orderId === "string" && !orderId.startsWith("j")) {
    const order = await convex.query(api.orders.getByOrderNumber, { orderNumber: orderId })
    if (!order) {
      throw new Error("Order not found")
    }
    convexOrderId = order._id
  }

  console.log("[Orders] registContactInformation - Calling with:", {
    orderId: convexOrderId,
    name: payload.name,
    email: payload.email,
    phoneNumber: payload.phoneNumber,
    nif: payload.nif,
    bookedForAnotherPerson: payload.bookedForAnotherPerson,
    passengerName: payload.passengerName,
    passengerEmail: payload.passengerEmail,
    passengerWhatsapp: payload.passengerWhatsapp,
    passengerRelationship: payload.passengerRelationship,
  });

  const result = await convex.mutation(api.orders.registContactInformation, {
    orderId: convexOrderId as Id<"orders">,
    name: payload.name,
    email: payload.email,
    phoneNumber: payload.phoneNumber,
    nif: payload.nif ?? undefined,
    bookedForAnotherPerson: payload.bookedForAnotherPerson ?? undefined,
    passengerName: payload.passengerName ?? undefined,
    passengerEmail: payload.passengerEmail ?? undefined,
    passengerWhatsapp: payload.passengerWhatsapp ?? undefined,
    passengerRelationship: payload.passengerRelationship ?? undefined,
  })

  console.log("[Orders] registContactInformation - Result:", {
    orderId: result.order?._id,
    customerPhone: (result.order as any)?.customerPhone,
  });

  return {
    order: {
      id: result.order.orderNumber || result.order._id,
      ...result.order,
    },
  }
}

/**
 * Função helper para iniciar pagamento
 */
export async function startPayment(
  convex: any,
  orderId: string | number,
  method: PaymentMethod,
  payload: StartPaymentRequest
): Promise<unknown> {
  let convexOrderId: Id<"orders"> | string = orderId as any
  
  if (typeof orderId === "string" && !orderId.startsWith("j")) {
    const order = await convex.query(api.orders.getByOrderNumber, { orderNumber: orderId })
    if (!order) {
      throw new Error("Order not found")
    }
    convexOrderId = order._id
  }

  return await convex.action(api.orders.startPaymentAction, {
    orderId: convexOrderId as Id<"orders">,
    method,
    ...payload,
  })
}

/**
 * Função helper para lookup de voo
 */
export async function lookupFlight(
  convex: any,
  payload: SelectFlightRequest
): Promise<SelectFlightResponse | null> {
  return await convex.action(api.flights.lookupFlightAction, payload)
}
