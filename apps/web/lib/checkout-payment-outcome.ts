export type CheckoutPaymentOutcome = "paid" | "cash" | "pending" | "failed" | "unverified"

interface PaymentStatusSnapshot {
  paymentStatus?: string
  paymentMethod?: string
}

/** Redirect parameters describe navigation, never proof that a payment completed. */
export function checkoutPaymentOutcome(
  order: PaymentStatusSnapshot | null | undefined,
  returnResult: string | null,
  hasOrder: boolean,
): CheckoutPaymentOutcome {
  if (order?.paymentStatus === "completed") {
    return order.paymentMethod === "cash" ? "cash" : "paid"
  }
  if (order?.paymentStatus === "failed" || returnResult === "false") return "failed"
  if (!hasOrder || order === null) return "unverified"
  return "pending"
}
