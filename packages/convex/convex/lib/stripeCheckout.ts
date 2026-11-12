export interface StripeCheckoutInput {
  kind: "transfer" | "tour";
  method?: "ccard" | "mbway" | "mb";
  orderNumber: string;
  orderId: string;
  amount: number;
  description: string;
  email?: string;
  language?: string;
  successUrl: string;
  cancelUrl: string;
}

const LEGACY_METHODS = { ccard: "card", mbway: "mb_way", mb: "multibanco" } as const;

/** Omitting payment_method_types enables the account's dynamic payment methods. */
export function stripeCheckoutParams(args: StripeCheckoutInput): URLSearchParams {
  const cents = Math.round(args.amount * 100);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error(`Invalid amount for Stripe: ${args.amount}`);
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("success_url", args.successUrl);
  p.set("cancel_url", args.cancelUrl);
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "eur");
  p.set("line_items[0][price_data][unit_amount]", String(cents));
  p.set("line_items[0][price_data][product_data][name]", (args.description || "Easy Transfer").slice(0, 250));
  p.set("client_reference_id", args.orderNumber);
  p.set("metadata[orderNumber]", args.orderNumber);
  p.set("metadata[orderId]", args.orderId);
  p.set("metadata[kind]", args.kind);
  p.set("payment_intent_data[metadata][orderNumber]", args.orderNumber);
  p.set("payment_intent_data[metadata][kind]", args.kind);
  p.set("locale", args.language === "pt" ? "pt" : "en");
  if (args.email) p.set("customer_email", args.email);
  // Preserve compatibility for internal callers that intentionally request one method.
  if (args.method) p.set("payment_method_types[0]", LEGACY_METHODS[args.method]);
  return p;
}

/** Keep the actual new Stripe method instead of mislabelling it as a credit card. */
export function stripeMethodCode(type?: string): string {
  if (!type) return "stripe";
  if (type === "card") return "ccard";
  if (type === "mb_way") return "mbway";
  if (type === "multibanco") return "mb";
  return type;
}

export function stripeCheckoutPaymentStatus(type: string, status?: string): "completed" | "failed" | null {
  if (type === "checkout.session.completed") return status === "paid" ? "completed" : null;
  if (type === "checkout.session.async_payment_succeeded") return "completed";
  if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") return "failed";
  return null;
}
