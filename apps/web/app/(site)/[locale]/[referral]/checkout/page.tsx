import { setRequestLocale } from "next-intl/server"
import { CheckoutPage as TransferThemedCheckout } from "@/components/customizable-checkout/checkout-page"
import { CheckoutPage as LuxMotionCheckout } from "@/components/checkout/checkout-page"
import { resolvePartnershipLandingTemplate } from "@/lib/partnership-landing-templates"
import { DynamicThemeProvider } from "@/components/dynamic-theme-provider"
import { fetchQuery } from "convex/nextjs";
import { api } from "@workspace/convex/api";
import { notFound, permanentRedirect } from "next/navigation";
import { CaptureReferral } from "@/components/referral/capture-referral";
import { decodeReferralSlug } from "@/lib/partnership-slug";

export default async function Page({
  params
}: {
  params: Promise<{ locale: string; referral: string }>
}) {
  const { locale, referral: referralCodificado } = await params;
  const referral = decodeReferralSlug(referralCodificado);
  setRequestLocale(locale);

  const partnership = await fetchQuery(api.partnerships.getBySlug, { slug: referral });

  if (!partnership || partnership.status === "inactive") {
    notFound();
  }
  /* Um endereço antigo da parceria (lib/parceriaPorSlug.ts no Convex). */
  if (partnership.slug !== referral) {
    permanentRedirect(`/${locale}/${encodeURIComponent(partnership.slug)}/checkout`)
  }

  /* O checkout segue o template da landing.
  
     A personalização de cores só existe para o template Transfer — é o próprio
     admin que o diz. Um parceiro em whitelabel tem uma landing com o visual
     LuxMotion, e mandá-lo depois para um checkout com o azul por omissão era a
     marca a mudar a meio da reserva. */
  const template = resolvePartnershipLandingTemplate(partnership.landingTemplate)

  /* Valid, active partnership: drop a first-party referral cookie so a later
     order (even one placed on the main-site checkout) still attributes here. */
  if (template !== "transfer") {
    return (
      <>
        <CaptureReferral slug={referral} />
        <LuxMotionCheckout logoUrl={partnership.logoUrl} partnershipSlug={partnership.slug} />
      </>
    )
  }

  return (
    <DynamicThemeProvider theme={partnership.theme}>
      <CaptureReferral slug={referral} />
      <TransferThemedCheckout partnershipSlug={referral} />
    </DynamicThemeProvider>
  )
}
