import "@workspace/ui/globals.css"
import { Providers } from "@/components/providers"
import { getLocale, getMessages, getTimeZone } from "next-intl/server"
import { ConvexClientProvider } from "@/components/providers/convex-client-provider"
import { geistMono, interSans } from "@/app/fonts"
import { createNoIndexMetadata } from "@/lib/seo"

const fontSans = interSans

const fontMono = geistMono

export const metadata = createNoIndexMetadata("Preview")

export default async function PreviewLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()
  const timeZone = await getTimeZone()

  return (
    <html lang={locale} suppressHydrationWarning className={`${fontSans.variable} ${fontMono.variable}`}>
      <body className="antialiased font-sans">
        <ConvexClientProvider>
          <Providers locale={locale} messages={messages as Record<string, unknown>} timeZone={timeZone}>
            {children}
          </Providers>
        </ConvexClientProvider>
      </body>
    </html>
  )
}
