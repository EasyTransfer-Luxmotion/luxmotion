import "@workspace/ui/globals.css";
import { Providers } from "@/components/providers";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { cormorantTitle, geistMono, montserrat, poppinsSans } from "@/app/fonts"
import type { Metadata } from "next";

const fontSans = poppinsSans;

const fontMono = geistMono;

const fontMontserrat = montserrat;

const fontTitle = cormorantTitle;

/* Nada disto é para indexar: o checkout e o pagamento não são páginas de
   pesquisa, e as de pré-visualização muito menos. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * A segunda raiz da aplicação.
 *
 * As páginas públicas vivem em (site)/[locale] e tiram o idioma do endereço.
 * Estas ficaram de fora de propósito: o /checkout e o /payment são o destino de
 * retorno dos gateways de pagamento, portanto os endereços não podem mudar.
 * Aqui o idioma continua a vir do cookie.
 *
 * O admin já não vive aqui: está no dashboard (repositório próprio), e o site
 * não usa sessão. Um /admin antigo é reencaminhado no middleware.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = await getTimeZone();

  return (
    <ConvexClientProvider>
      <html
        lang={locale}
        suppressHydrationWarning
        className={`${fontSans.variable} ${fontMono.variable} ${fontTitle.variable} ${fontMontserrat.variable}`}
      >
        <body className="antialiased font-sans">
          <Providers
            locale={locale}
            messages={messages as Record<string, unknown>}
            timeZone={timeZone}
          >
            {children}
          </Providers>
        </body>
      </html>
    </ConvexClientProvider>
  );
}
