import { setRequestLocale } from "next-intl/server"
import { PartnershipLanding } from "@/components/partnerships/partnership-landing";
import { fetchQuery } from "convex/nextjs";
import { api } from "@workspace/convex/api";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { CaptureReferral } from "@/components/referral/capture-referral";
import { JsonLd } from "@/components/seo/json-ld";
import { createNoIndexMetadata, createPageMetadata } from "@/lib/seo";
import { buildBreadcrumbSchema, buildServiceSchema } from "@/lib/structured-data";
import { resolvePartnershipLandingTemplate } from "@/lib/partnership-landing-templates";
import { decodeReferralSlug } from "@/lib/partnership-slug";

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ locale: string; referral: string }>;
}) {
  const { locale, referral: referralCodificado } = await params;
  const referral = decodeReferralSlug(referralCodificado);
  setRequestLocale(locale);

  const partnership = await fetchQuery(api.partnerships.getBySlug, {
    slug: referral,
  });

  if (!partnership || partnership.status === "inactive") {
    notFound();
  }
  /* Um endereço antigo da parceria: o "kiss&tell" passou a "kiss-tell" e os
     links já impressos continuam a dar lá (lib/parceriaPorSlug.ts no Convex). */
  if (partnership.slug !== referral) {
    permanentRedirect(`/${locale}/${encodeURIComponent(partnership.slug)}`);
  }

  const seoTitle =
    partnership.content?.seoTitle ||
    partnership.content?.heroTitle ||
    partnership.name;

  const seoDescription =
    partnership.content?.seoDescription ||
    partnership.welcomeMessage ||
    `Custom landing page for ${partnership.name} powered by LuxMotion.`;

  const landingTemplate = resolvePartnershipLandingTemplate(
    partnership.landingTemplate,
  );

  return (
    <>
      {/* Valid, active partnership: drop a first-party referral cookie so lead
          forms and checkouts elsewhere on the site can attribute back here. */}
      <CaptureReferral slug={referral} />
      <JsonLd
        data={buildBreadcrumbSchema([
          { name: "Home", url: "/" },
          { name: partnership.name, url: `/${referral}` },
        ])}
      />
      <JsonLd
        data={buildServiceSchema({
          name: seoTitle,
          description: seoDescription,
          path: `/${referral}`,
          image: partnership.logoUrl,
        })}
      />
      <PartnershipLanding
        template={landingTemplate}
        theme={partnership.theme}
        logoUrl={partnership.logoUrl}
        heroImageUrl={partnership.heroImageUrl}
        partnerName={partnership.name}
        partnershipSlug={referral}
      />
    </>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; referral: string }>;
}): Promise<Metadata> {
  const { locale, referral: referralCodificado } = await params;
  /* Codificado não encontrava o "kiss&tell": a página abria e o título caía no genérico. */
  const referral = decodeReferralSlug(referralCodificado);
  setRequestLocale(locale);
  const partnership = await fetchQuery(api.partnerships.getBySlug, {
    slug: referral,
  });

  // Continua a servir para não partir links de parceiros antigos sem estado,
  // mas só entra no índice quem está explicitamente activo — a mesma regra do
  // sitemap.
  if (!partnership || partnership.status !== "active") {
    return createNoIndexMetadata(partnership?.name ?? "Partner page");
  }

  const seoTitle =
    partnership.content?.seoTitle ||
    partnership.content?.heroTitle ||
    partnership.name;

  const seoDescription =
    partnership.content?.seoDescription ||
    partnership.welcomeMessage ||
    `Custom landing page for ${partnership.name} powered by LuxMotion.`;

  return createPageMetadata({
    title: seoTitle,
    description: seoDescription,
    path: `/${referral}`,
    image: partnership.logoUrl,
  });
}
