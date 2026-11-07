import { montserratSans } from "@/app/fonts"
import { Suspense } from "react"

import "@workspace/ui/globals.css"
import { GoogleMapsProvider } from "@/components/providers/google-maps-provider"
import { TourCheckoutProvider } from "@/components/tours/tour-checkout-context"
import { TourCheckoutModal } from "@/components/tours/tour-checkout-modal"
import { TourCheckoutReturnHandler } from "@/components/tours/tour-checkout-return-handler"

const fontSans = montserratSans


export default function RootLayout({
    children,
  }: Readonly<{
    children: React.ReactNode
  }>) {
    return (
        <div className={`${fontSans.variable} font-sans `}>
            <GoogleMapsProvider>
                <TourCheckoutProvider>
                    {children}
                    <Suspense fallback={null}>
                        <TourCheckoutReturnHandler />
                    </Suspense>
                    <TourCheckoutModal />
                </TourCheckoutProvider>
            </GoogleMapsProvider>
        </div>
    )
}