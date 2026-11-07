import { v } from "convex/values";
import { internalAction } from "./_generated/server";

/*
 * Stripe integration (replaces ifthenpay.ts).
 *
 * Uses the Stripe REST API directly via fetch + Web Crypto for webhook signature
 * verification — no `stripe` SDK dependency, runs in the default Convex isolate
 * (same approach the old ifthenpay.ts used). Hosted Stripe Checkout: we create a
 * Checkout Session for the chosen method and redirect the customer to `session.url`.
 */

const STRIPE_API = "https://api.stripe.com/v1";

function secretKey(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY not configured");
  return k;
}

/** Our internal method codes → Stripe payment_method_types. (cash never hits Stripe.) */
const METHOD_TO_STRIPE: Record<string, string> = {
  ccard: "card",
  mbway: "mb_way",
  mb: "multibanco",
};

/**
 * Create a hosted Stripe Checkout Session and return its redirect URL.
 *
 * The orderNumber goes into both `client_reference_id` and `metadata` so the webhook
 * matches the order EXACTLY — no 15/25-char truncation like IfThenPay (which is what
 * left orders stuck "pending"). One session covers the whole booking total (incl. the
 * return leg); the completion webhook cascades to the related order.
 */
/**
 * Interna: recebe o valor a cobrar de quem a chama, por isso só o servidor a
 * pode chamar — depois de ele próprio ter calculado esse valor. Pública, era
 * uma forma de criar uma sessão de 1 € para uma encomenda de 300 €.
 */
export const createCheckoutSession = internalAction({
  args: {
    kind: v.union(v.literal("transfer"), v.literal("tour")),
    // Optional: when omitted, the Stripe page shows all online methods and the customer picks.
    method: v.optional(v.union(v.literal("ccard"), v.literal("mbway"), v.literal("mb"))),
    orderNumber: v.string(),
    orderId: v.string(),
    amount: v.number(), // major units (EUR)
    description: v.string(),
    email: v.optional(v.string()),
    language: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{ checkoutUrl: string; sessionId: string; paymentIntentId: string | null }> => {
    // Offer all online methods on the Stripe page unless a specific one is requested.
    const methods: string[] = args.method
      ? [METHOD_TO_STRIPE[args.method]!]
      : ["card", "mb_way", "multibanco"];

    const unitAmount = Math.round(args.amount * 100); // cents
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      throw new Error(`Invalid amount for Stripe: ${args.amount}`);
    }

    const p = new URLSearchParams();
    p.set("mode", "payment");
    p.set("success_url", args.successUrl);
    p.set("cancel_url", args.cancelUrl);
    methods.forEach((m, i) => p.set(`payment_method_types[${i}]`, m));
    p.set("line_items[0][quantity]", "1");
    p.set("line_items[0][price_data][currency]", "eur");
    p.set("line_items[0][price_data][unit_amount]", String(unitAmount));
    p.set(
      "line_items[0][price_data][product_data][name]",
      (args.description || "Easy Transfer").slice(0, 250),
    );
    p.set("client_reference_id", args.orderNumber);
    p.set("metadata[orderNumber]", args.orderNumber);
    p.set("metadata[orderId]", args.orderId);
    p.set("metadata[kind]", args.kind);
    p.set("payment_intent_data[metadata][orderNumber]", args.orderNumber);
    p.set("payment_intent_data[metadata][kind]", args.kind);
    p.set("locale", args.language === "pt" ? "pt" : "en");
    if (args.email) p.set("customer_email", args.email);
    // MB WAY: Stripe collects the customer's phone on its hosted page — we don't pass it.

    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: p.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Stripe Checkout Session failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as {
      id: string;
      url: string;
      payment_intent: string | null;
    };
    return {
      checkoutUrl: data.url,
      sessionId: data.id,
      paymentIntentId: data.payment_intent ?? null,
    };
  },
});

/** Stripe payment_method type → our internal method code. */
const STRIPE_TO_METHOD: Record<string, "ccard" | "mbway" | "mb"> = {
  card: "ccard",
  mb_way: "mbway",
  multibanco: "mb",
};

/**
 * After a Checkout Session completes, look up its PaymentIntent to learn which method the
 * customer actually chose on Stripe's page, mapped to our internal code (undefined if it
 * can't be determined — the order just keeps whatever method it had).
 */
export async function getUsedMethod(
  paymentIntentId: string,
): Promise<"ccard" | "mbway" | "mb" | undefined> {
  try {
    const res = await fetch(
      `${STRIPE_API}/payment_intents/${paymentIntentId}?expand[]=payment_method`,
      { headers: { Authorization: `Bearer ${secretKey()}` } },
    );
    if (!res.ok) return undefined;
    const pi = (await res.json()) as { payment_method?: { type?: string } };
    const type = pi?.payment_method?.type;
    return type ? STRIPE_TO_METHOD[type] : undefined;
  } catch {
    return undefined;
  }
}

/* ── Webhook signature verification (Web Crypto, no SDK) ──────────────────────
 * Implements the same scheme as stripe.webhooks.constructEvent. Pure async helper
 * (no ctx) so http.ts can import + call it inside the Stripe webhook httpAction.
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i]!.toString(16).padStart(2, "0");
  return s;
}

/**
 * Verify a Stripe webhook signature and return the parsed event, or throw. The raw
 * request body (exact bytes) and the `Stripe-Signature` header must be passed in.
 */
export async function constructStripeEvent(
  payload: string,
  sigHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): Promise<any> {
  if (!sigHeader) throw new Error("Missing Stripe-Signature header");

  let t: string | undefined;
  const v1s: string[] = [];
  for (const part of sigHeader.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key === "t") t = val;
    else if (key === "v1") v1s.push(val);
  }
  if (!t || v1s.length === 0) throw new Error("Malformed Stripe-Signature header");

  const signedPayload = `${t}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = toHex(sigBuf);

  if (!v1s.some((s) => timingSafeEqual(s, expected))) {
    throw new Error("Stripe signature mismatch");
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > toleranceSeconds) {
    throw new Error("Stripe signature timestamp outside tolerance");
  }

  return JSON.parse(payload);
}
