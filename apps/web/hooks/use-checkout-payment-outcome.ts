"use client"

import { useSearchParams } from "next/navigation"
import { useSubscribeToOrderStatus } from "@/lib/orders"
import { checkoutPaymentOutcome } from "@/lib/checkout-payment-outcome"

export function useCheckoutPaymentOutcome(orderId: string | number | null) {
  const searchParams = useSearchParams()
  const order = useSubscribeToOrderStatus(orderId ? String(orderId) : null)
  return checkoutPaymentOutcome(order, searchParams?.get("success") ?? null, Boolean(orderId))
}
