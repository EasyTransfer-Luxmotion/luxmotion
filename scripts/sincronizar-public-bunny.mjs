#!/usr/bin/env node
/**
 * Envia para a storage zone do Bunny os ficheiros de apps/web/public que lá
 * faltam ou mudaram de tamanho. Corre antes de cada build.
 *
 * Porquê: com NEXT_PUBLIC_CDN_URL definido, o site vai buscar /fleet/x.webp à
 * CDN e não ao próprio servidor. Uma imagem nova acrescentada ao public/ e
 * nunca enviada aparecia partida — e só no Railway, porque em local e na
 * Vercel continua a sair do servidor.
 *
 * Sem BUNNY_STORAGE_ZONE e BUNNY_STORAGE_PASSWORD (a Vercel, um build local)
 * não faz nada. Nunca apaga: um ficheiro tirado do public/ pode ainda estar
 * referenciado por uma página em cache.
 */
import { readdir, stat, readFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ZONA = process.env.BUNNY_STORAGE_ZONE
const PASSWORD = process.env.BUNNY_STORAGE_PASSWORD
const HOST = process.env.BUNNY_STORAGE_HOST || "storage.bunnycdn.com"
const PUBLIC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "apps", "web", "public")

if (!ZONA || !PASSWORD) {
  console.log("[bunny] sem storage zone configurada — o public/ continua a sair do servidor.")
  process.exit(0)
}

const codificar = (caminho) => caminho.split("/").map(encodeURIComponent).join("/")
const base = `https://${HOST}/${ZONA}/`

async function locais(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await locais(p)))
    else if (e.name !== ".DS_Store") {
      // NFC: o macOS pode gravar "á" decomposto; o caminho no Bunny e o que o
      // código pede vêm compostos.
      const rel = relative(PUBLIC, p).split(sep).join("/").normalize("NFC")
      out.push({ rel, abs: p, tamanho: (await stat(p)).size })
    }
  }
  return out
}

async function remotos(pasta = "") {
  const r = await fetch(base + codificar(pasta), { headers: { AccessKey: PASSWORD } })
  if (r.status === 404) return new Map()
  if (!r.ok) throw new Error(`listar ${pasta || "/"}: ${r.status}`)
  const mapa = new Map()
  for (const e of await r.json()) {
    const rel = (pasta + e.ObjectName).normalize("NFC")
    if (e.IsDirectory) for (const [k, v] of await remotos(rel + "/")) mapa.set(k, v)
    else mapa.set(rel, e.Length)
  }
  return mapa
}

async function enviar({ rel, abs }) {
  const corpo = await readFile(abs)
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const r = await fetch(base + codificar(rel), {
      method: "PUT",
      headers: { AccessKey: PASSWORD, "Content-Type": "application/octet-stream" },
      body: corpo,
    })
    if (r.status === 201) return
    if (tentativa === 3) throw new Error(`enviar ${rel}: ${r.status}`)
  }
}

const todos = await locais(PUBLIC)
let existentes
try {
  existentes = await remotos()
} catch (erro) {
  // Sem conseguir listar não se sabe o que falta. Não vale a pena bloquear
  // todos os deploys por isso: o que já lá estava continua a ser servido.
  console.warn(`[bunny] não consegui listar a storage zone (${erro.message}); sigo sem sincronizar.`)
  process.exit(0)
}
const pendentes = todos.filter((f) => existentes.get(f.rel) !== f.tamanho)
console.log(`[bunny] ${ZONA}: ${todos.length} ficheiros no public/, ${pendentes.length} por enviar.`)

// Oito de cada vez: o suficiente para não atrasar o build, pouco para o Bunny
// começar a recusar.
for (let i = 0; i < pendentes.length; i += 8) {
  await Promise.all(pendentes.slice(i, i + 8).map(enviar))
}
if (pendentes.length) console.log(`[bunny] ${pendentes.length} enviados.`)
