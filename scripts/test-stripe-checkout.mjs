// node --experimental-strip-types --test scripts/test-stripe-checkout.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { stripeCheckoutParams, stripeMethodCode, stripeCheckoutPaymentStatus } from "../packages/convex/convex/lib/stripe-checkout.ts";

const booking = {
  kind: "transfer", orderNumber: "ET1793292767485091", orderId: "test-order",
  amount: 49, description: "Easy Transfer ET1793292767485091",
  email: "customer@example.test", language: "pt",
  successUrl: "https://example.test/checkout?success=true",
  cancelUrl: "https://example.test/checkout?success=false",
};

test("website sessions use Stripe Dashboard methods instead of a fixed list, for transfers and tours", () => {
  for (const kind of ["transfer", "tour"]) {
    const params = stripeCheckoutParams({ ...booking, kind });
    assert.ok(![...params.keys()].some(key => key.startsWith("payment_method_types")));
    assert.ok(![...params.keys()].some(key => key.startsWith("allowed_payment_method_types")));
    assert.equal(params.get("mode"), "payment");
    assert.equal(params.get("metadata[kind]"), kind);
  }
});

test("enabling dynamic methods preserves EUR amount, full booking reference and return URLs", () => {
  const params = stripeCheckoutParams(booking);
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "4900");
  assert.equal(params.get("line_items[0][price_data][currency]"), "eur");
  assert.equal(params.get("client_reference_id"), booking.orderNumber);
  assert.equal(params.get("metadata[orderNumber]"), booking.orderNumber);
  assert.equal(params.get("payment_intent_data[metadata][orderNumber]"), booking.orderNumber);
  assert.equal(params.get("success_url"), booking.successUrl);
  assert.equal(params.get("cancel_url"), booking.cancelUrl);
});

test("invalid amounts cannot create a payment request", () => {
  for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => stripeCheckoutParams({ ...booking, amount }));
  }
});

test("explicit legacy internal method requests remain supported", () => {
  assert.equal(stripeCheckoutParams({ ...booking, method: "mbway" }).get("payment_method_types[0]"), "mb_way");
});

test("the real dynamic method is retained without falsely classifying PayPal, Link or Klarna as card", () => {
  for (const method of ["paypal", "link", "klarna", "revolut_pay", "ideal", "bancontact"]) {
    assert.equal(stripeMethodCode(method), method);
  }
  assert.equal(stripeMethodCode("card"), "ccard");
  assert.equal(stripeMethodCode("mb_way"), "mbway");
  assert.equal(stripeMethodCode("multibanco"), "mb");
  assert.equal(stripeMethodCode(undefined), "stripe");
});

test("a completed checkout with an asynchronous unpaid method does not confirm the booking", () => {
  assert.equal(stripeCheckoutPaymentStatus("checkout.session.completed", "unpaid"), null);
  assert.equal(stripeCheckoutPaymentStatus("checkout.session.completed", "no_payment_required"), null);
  assert.equal(stripeCheckoutPaymentStatus("checkout.session.completed", "paid"), "completed");
  assert.equal(stripeCheckoutPaymentStatus("checkout.session.async_payment_succeeded", "paid"), "completed");
});

test("failed/expired methods stay failed and unrelated webhook events cannot confirm payment", () => {
  assert.equal(stripeCheckoutPaymentStatus("checkout.session.async_payment_failed"), "failed");
  assert.equal(stripeCheckoutPaymentStatus("checkout.session.expired"), "failed");
  assert.equal(stripeCheckoutPaymentStatus("payment_intent.created", "paid"), null);
});
