import { cormorantTitle, interSans } from "@/app/fonts"

import "@workspace/ui/globals.css";
import { GoogleMapsProvider } from "@/components/providers/google-maps-provider";
import { createNoIndexMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { OpenAIPixel } from "@/components/analytics/openai-pixel";
import { CaptureAdSource } from "@/components/analytics/capture-ad-source";

const fontSans = interSans;

const fontTitle = cormorantTitle;

export const metadata = createNoIndexMetadata("Checkout");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${fontSans.variable} ${fontTitle.variable} font-sans checkout-dark`}>
      <GoogleMapsProvider>{children}</GoogleMapsProvider>
      <Suspense fallback={null}>
        <CaptureAdSource />
      </Suspense>
      <OpenAIPixel />
    </div>
  );
}
