// node --experimental-strip-types --test scripts/test-checkout-payment-outcome.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { checkoutPaymentOutcome } from "../apps/web/lib/checkout-payment-outcome.ts";
import { renderCheckoutConfirmation } from "./lib/render-checkout-confirmation.mjs";

test("returning from a cancelled/declined payment never confirms the booking", () => {
  for (const status of [undefined, null, {}, { paymentStatus: "pending" }, { paymentStatus: "failed" }]) {
    assert.equal(checkoutPaymentOutcome(status, "false", true), "failed");
  }
});

test("success URL and a selected cash method cannot substitute for server confirmation", () => {
  assert.equal(checkoutPaymentOutcome(undefined, "true", true), "pending");
  assert.equal(checkoutPaymentOutcome({ paymentStatus: "pending" }, "true", true), "pending");
  assert.equal(checkoutPaymentOutcome({ paymentStatus: "pending", paymentMethod: "cash" }, null, true), "pending");
  assert.equal(checkoutPaymentOutcome({ paymentStatus: "failed" }, "true", true), "failed");
});

test("a late successful webhook is authoritative over a stale cancellation URL", () => {
  assert.equal(checkoutPaymentOutcome({ paymentStatus: "completed", paymentMethod: "ccard" }, "false", true), "paid");
});

test("cash is confirmed only after the backend accepts it and is not labelled paid online", () => {
  assert.equal(checkoutPaymentOutcome({ paymentStatus: "completed", paymentMethod: "cash" }, null, true), "cash");
});

test("missing order/session stays unverified, including a direct success URL", () => {
  assert.equal(checkoutPaymentOutcome(null, "true", true), "unverified");
  assert.equal(checkoutPaymentOutcome(undefined, "true", false), "unverified");
});

for (const family of ["checkout", "customizable-checkout"]) {
  for (const outcome of ["failed", "pending", "unverified"]) {
    test(`${family}: ${outcome} has no success title, booking claims or payment completion in all six languages`, () => {
      for (const locale of ["pt", "en", "es", "fr", "de", "nl"]) {
        const messages = JSON.parse(readFileSync(new URL(`../apps/web/messages/${locale}.json`, import.meta.url), "utf8")).confirmation;
        const html = renderCheckoutConfirmation(family, outcome, locale);
        assert.ok(!html.includes(messages.thankYou), locale);
        assert.ok(!html.includes(messages.bookingDone), locale);
        assert.ok(!html.includes(messages.paymentDone), locale);
        assert.ok(!html.includes(messages.emailWhatsapp), locale);
        assert.ok(!html.includes(messages.driverConfirmed.title), locale);
        assert.ok(html.includes(messages.returnToPayment), locale);
        const expected = outcome === "failed" ? messages.paymentIncomplete : outcome === "pending" ? messages.pendingHeading : messages.unverifiedHeading;
        assert.ok(html.includes(expected), locale);
      }
    });
  }
  test(`${family}: received payment and pay-to-driver confirmations retain distinct messages`, () => {
    const paid = renderCheckoutConfirmation(family, "paid");
    assert.ok(paid.includes("Thank you for your booking"));
    assert.ok(paid.includes("Payment done"));
    const cash = renderCheckoutConfirmation(family, "cash");
    assert.ok(cash.includes("Booking done"));
    assert.ok(cash.includes("Payment to the driver"));
    assert.ok(!cash.includes("Payment done"));
  });
}
