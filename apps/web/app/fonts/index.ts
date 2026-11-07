import localFont from "next/font/local"

/*
 * Fontes alojadas no próprio projecto, em vez de next/font/google.
 *
 * O next/font/google descarrega as fontes durante o build e assume que cada
 * URL do Google acaba em .woff2. Conforme a região do servidor de build, o
 * Google responde com URLs do tipo `fonts.gstatic.com/l/font?kit=…`, sem
 * extensão, e o Next rebenta com "Cannot read properties of null (reading
 * '1')". Nos builders do Railway isto acontecia em builds seguidos, num layout
 * diferente de cada vez.
 *
 * São os mesmos ficheiros que o Google servia (subconjunto latin). As
 * variáveis são fontes de peso variável — um ficheiro cobre a gama toda; a
 * Poppins não tem versão variável, daí um ficheiro por peso.
 *
 * Uma instância por combinação de família e variável CSS: `--font-sans` é a
 * Inter nuns layouts, a Poppins noutros e a Montserrat num.
 *
 * Os argumentos estão todos escritos por extenso de propósito: o next/font lê-os
 * durante a compilação e só aceita literais.
 */

export const interSans = localFont({
  src: [{ path: "./inter-normal-100-900.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-sans",
  display: "swap",
})

export const poppinsSans = localFont({
  src: [
    { path: "./poppins-normal-300.woff2", weight: "300", style: "normal" },
    { path: "./poppins-normal-400.woff2", weight: "400", style: "normal" },
    { path: "./poppins-normal-500.woff2", weight: "500", style: "normal" },
    { path: "./poppins-normal-600.woff2", weight: "600", style: "normal" },
    { path: "./poppins-normal-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
})

export const montserratSans = localFont({
  src: [{ path: "./montserrat-normal-100-900.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-sans",
  display: "swap",
})

export const montserrat = localFont({
  src: [{ path: "./montserrat-normal-100-900.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-montserrat",
  display: "swap",
})

export const cormorantTitle = localFont({
  src: [
    { path: "./cormorant-normal-300-700.woff2", weight: "300 700", style: "normal" },
    { path: "./cormorant-italic-300-700.woff2", weight: "300 700", style: "italic" },
  ],
  variable: "--font-title",
  display: "swap",
})

export const geistMono = localFont({
  src: [{ path: "./geist-mono-normal-100-900.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-mono",
  display: "swap",
})
