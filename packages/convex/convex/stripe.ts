import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { stripeCheckoutParams, stripeMethodCode } from "./lib/stripeCheckout";

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
    // Default: Stripe selects the eligible methods enabled in its Dashboard.
    const p = stripeCheckoutParams(args);

    const criar = (corpo: URLSearchParams) =>
      fetch(`${STRIPE_API}/checkout/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey()}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: corpo.toString(),
      });

    let res = await criar(p);
    // Legacy internal callers may explicitly choose one method; newer Stripe accounts
    // can require Dashboard-managed methods instead. Never retry an unrelated failure.
    if (args.method && res.status === 400) {
      const error = await res.clone().text();
      if (error.includes("payment_method_types") && error.includes("no longer supported")) {
        const dynamic = new URLSearchParams(p);
        dynamic.delete("payment_method_types[0]");
        res = await criar(dynamic);
      }
    }

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

/**
 * After a Checkout Session completes, look up its PaymentIntent to learn which method the
 * customer actually chose on Stripe's page, mapped to a legacy code or its Stripe type. If lookup fails, use the neutral
 * "stripe" code instead of incorrectly recording the preselected card method.
 */
export async function getUsedMethod(
  paymentIntentId: string,
): Promise<string> {
  try {
    const res = await fetch(
      `${STRIPE_API}/payment_intents/${paymentIntentId}?expand[]=payment_method`,
      { headers: { Authorization: `Bearer ${secretKey()}` } },
    );
    if (!res.ok) return "stripe";
    const pi = (await res.json()) as { payment_method?: { type?: string } };
    const type = pi?.payment_method?.type;
    return stripeMethodCode(type);
  } catch {
    return "stripe";
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
