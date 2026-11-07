'use client'

import { ReactNode } from 'react'
import { ConvexProvider, ConvexReactClient } from 'convex/react'

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error('Missing NEXT_PUBLIC_CONVEX_URL in your .env file')
}

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL.replace(/\/+$/, ''),
)

/**
 * O cliente Convex das páginas públicas, sem autenticação.
 *
 * Nenhuma query pública precisa de sessão. As que precisam são do admin, que
 * vive no dashboard — o site não carrega SDK de autenticação nenhum.
 */
export function ConvexPublicProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>
}
