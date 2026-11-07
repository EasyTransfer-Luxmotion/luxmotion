import { interSans } from "@/app/fonts"

import { Suspense } from "react"
import "@workspace/ui/globals.css"
import { GoogleMapsProvider } from "@/components/providers/google-maps-provider"
import { TourCheckoutProvider } from "@/components/tours/tour-checkout-context"
import { TourCheckoutModal } from "@/components/tours/tour-checkout-modal"
import { TourCheckoutReturnHandler } from "@/components/tours/tour-checkout-return-handler"
import { WhatsAppFloat } from "@/components/new-landing-page/whatsapp-float"
import { PromoBar } from "@/components/new-landing-page/promo-bar"

const fontSans = interSans

export default function RootLayout({
    children,
  }: Readonly<{
    children: React.ReactNode
  }>) {
    return (
        /* O Cormorant estava a ser carregado outra vez aqui, com a mesma
           configuração da raiz: eram duas instâncias da mesma família de letra
           em todas as páginas públicas. Fica só a da raiz. */
        <div className={`${fontSans.variable} font-sans`}>
            <PromoBar />
            <GoogleMapsProvider>
                <TourCheckoutProvider>
                    {children}
                    <Suspense fallback={null}>
                        <TourCheckoutReturnHandler />
                    </Suspense>
                    <TourCheckoutModal />
                    <WhatsAppFloat />
                </TourCheckoutProvider>
            </GoogleMapsProvider>
        </div>
    )
}