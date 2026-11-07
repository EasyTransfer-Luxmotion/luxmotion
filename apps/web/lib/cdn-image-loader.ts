"use client"

import type { ImageLoaderProps } from "next/image"
import { cdn } from "./cdn"

/**
 * Loader do `<Image>` quando há CDN. Cobre de uma vez as centenas de imagens
 * do site sem tocar em nenhuma delas.
 *
 * O `width` vai na query string: o Bunny ignora-o enquanto o Optimizer estiver
 * desligado e serve o original, que já é WebP a 1920px. Se um dia for ligado,
 * passa a redimensionar por dispositivo sem mudar uma linha aqui.
 *
 * Os URLs remotos (Convex, Google, Instagram e as imagens carregadas no admin,
 * que já vêm da CDN) passam tal como estão — acrescentar-lhes parâmetros podia
 * partir assinaturas que não são nossas.
 */
export default function cdnImageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!src.startsWith("/") || src.startsWith("//")) return src
  const q = quality ? `&quality=${quality}` : ""
  return `${cdn(src)}?width=${width}${q}`
}
