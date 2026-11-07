import { poppinsSans } from "@/app/fonts"

import "@workspace/ui/globals.css";
import { GoogleMapsProvider } from "@/components/providers/google-maps-provider";
import { createNoIndexMetadata } from "@/lib/seo";

const fontSans = poppinsSans;

export const metadata = createNoIndexMetadata("Partner Checkout");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${fontSans.variable} font-sans `}>
      <GoogleMapsProvider>{children}</GoogleMapsProvider>
    </div>
  );
}
