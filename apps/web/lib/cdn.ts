/**
 * Os ficheiros de `public/` estão espelhados no Bunny, um storage zone por
 * ambiente, com os mesmos caminhos: `/fleet/x.webp` existe em
 * `${NEXT_PUBLIC_CDN_URL}/fleet/x.webp`.
 *
 * Sem a variável, tudo continua a sair do próprio servidor, como sempre. É isso
 * que deixa a mudança sem risco: um ambiente sem CDN configurada (a Vercel,
 * enquanto existir) não sente diferença nenhuma.
 */
const BASE = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/+$/, "") || null

export function cdn(caminho: string): string {
  // Só caminhos do próprio site. `//host/x` é um URL sem protocolo, não nosso.
  if (!BASE || !caminho.startsWith("/") || caminho.startsWith("//")) return caminho
  return BASE + caminho
}
