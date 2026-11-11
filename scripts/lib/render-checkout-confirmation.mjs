// Render the real result components with isolated order status; never calls a service.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const webRequire = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const React = webRequire("react");
const { renderToStaticMarkup } = webRequire("react-dom/server");
const ts = webRequire("typescript");

export function renderCheckoutConfirmation(family, outcome, locale = "en") {
  const path = new URL(`../../apps/web/components/${family}/confirmation-modal.tsx`, import.meta.url);
  const messages = JSON.parse(readFileSync(new URL(`../../apps/web/messages/${locale}.json`, import.meta.url), "utf8")).confirmation;
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: fileURLToPath(path),
  }).outputText;
  const module = { exports: {} };
  const mockRequire = (name) => {
    if (name === "next/navigation") return { useRouter: () => ({ push() {} }) };
    if (name === "next-intl") return { useTranslations: () => (key) => {
      const value = key.split(".").reduce((obj, field) => obj?.[field], messages);
      if (typeof value !== "string") throw new Error(`Missing ${locale}: confirmation.${key}`);
      return value;
    } };
    if (name.endsWith("/checkout-context")) return { useCheckout: () => ({ resetCheckout() {}, state: { orderId: "ET-TEST", payment: { method: "card" } } }) };
    if (name === "@/hooks/use-checkout-payment-outcome") return { useCheckoutPaymentOutcome: () => outcome };
    if (name.endsWith("/checkout-page")) return { usePartnershipSlug: () => "test-partner" };
    if (name.endsWith("/checkout-step-layout")) return { CheckoutStepLayout: ({ children }) => React.createElement("div", null, children) };
    if (name === "@workspace/ui/components/button") return { Button: ({ variant: _, ...props }) => React.createElement("button", props) };
    if (name === "@workspace/ui/lib/utils") return { cn: (...values) => values.filter(Boolean).join(" ") };
    return webRequire(name);
  };
  new Function("require", "module", "exports", source)(mockRequire, module, module.exports);
  return renderToStaticMarkup(React.createElement(module.exports.ConfirmationModal, { onRetry() {} }));
}
