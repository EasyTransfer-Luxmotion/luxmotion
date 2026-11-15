/*
 * Datas e horas sempre em Lisboa, seja qual for o fuso de quem visita.
 *
 * Os eventos guardam `eventDate`/`endDate`/`returnAt` em ms (UTC) e o site
 * formatava-os com toLocaleTimeString sem `timeZone`: um evento às 10h00 de
 * Lisboa aparecia às 05h00 a quem abria a página em Nova Iorque e às 11h00 em
 * Berlim. A maioria dos clientes é estrangeira; a partida é em Portugal e a
 * hora que conta é a de Lisboa. No servidor (Railway, em UTC) dava ainda uma
 * hora a menos no verão.
 *
 * Dois tipos de valor andam por aqui, e não se misturam:
 *
 *  - **instantes** (ms): o que vem do Convex. Formatam-se com `timeZone`.
 *  - **relógio de Lisboa** (`Date` cujos campos locais — getHours, getDate… —
 *    dizem a hora de Lisboa, independentemente do fuso do browser). É o que os
 *    selectores de data trabalham e o que os transfers e tours enviam como
 *    "AAAA-MM-DD HH:mm". Passa-se de um para o outro com `relogioDeLisboa` e
 *    `instanteDoRelogio`.
 *
 * Mesmo padrão que `features/catalogo/hora-lisboa.ts` no dashboard, que grava.
 */

export const ZONA_LISBOA = "Europe/Lisbon"

const PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_LISBOA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

function partes(ms: number) {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
    segundo: Number(p.second),
  }
}

const dois = (n: number) => String(n).padStart(2, "0")

/** ms → { dia: "AAAA-MM-DD", hora: "HH:MM" } em Lisboa. */
export function emLisboa(ms: number): { dia: string; hora: string } {
  const p = partes(ms)
  return { dia: `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`, hora: `${dois(p.hora)}:${dois(p.minuto)}` }
}

/**
 * "AAAA-MM-DD" + "HH:MM" em Lisboa → ms. Faz-se de conta que é UTC, vê-se que
 * hora isso dá em Lisboa e corrige-se a diferença (duas voltas chegam para a
 * mudança da hora). Numa hora que não existe (o salto de Março), fica a seguinte.
 */
export function deLisboa(dia: string, hora = "00:00"): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia)
  const h = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(hora || "00:00")
  if (!m || !h) return null
  const alvo = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +h[1]!, +h[2]!, +(h[3] ?? 0))
  let ms = alvo
  for (let i = 0; i < 2; i++) {
    const p = partes(ms)
    ms += alvo - Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
  }
  return ms
}

/** Instante → `Date` de relógio: os campos locais passam a ser a hora de Lisboa. */
export function relogioDeLisboa(ms: number = Date.now()): Date {
  const p = partes(ms)
  return new Date(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
}

/** `Date` de relógio de Lisboa → instante (ms). */
export function instanteDoRelogio(relogio: Date): number | null {
  if (!Number.isFinite(relogio.getTime())) return null
  return deLisboa(diaDoRelogio(relogio), `${dois(relogio.getHours())}:${dois(relogio.getMinutes())}`)
}

/** "AAAA-MM-DD" a partir dos campos locais — nunca `toISOString`, que passa a UTC e muda o dia. */
export function diaDoRelogio(relogio: Date): string {
  return `${relogio.getFullYear()}-${dois(relogio.getMonth() + 1)}-${dois(relogio.getDate())}`
}

/** Hoje, à meia-noite, no relógio de Lisboa. */
export function hojeEmLisboa(): Date {
  const agora = relogioDeLisboa()
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
}

/** Último instante do dia de Lisboa a que `ms` pertence. */
export function fimDoDiaEmLisboa(ms: number): number {
  const { dia } = emLisboa(ms)
  return (deLisboa(dia, "23:59") ?? ms) + 59_999
}

/* ---------------------------------------------------------------- formatar */

/** Formata um instante em Lisboa, na língua da página. */
export function formatarEmLisboa(ms: number, locale: string, opcoes: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { ...opcoes, timeZone: ZONA_LISBOA }).format(new Date(ms))
}

/** "10:00" — sempre 24 h, em Lisboa. */
export function horaEmLisboa(ms: number): string {
  return emLisboa(ms).hora
}

/** "sáb., 20 de nov. de 2026" / "Sat, Nov 20, 2026", em Lisboa. */
export function dataEmLisboa(ms: number, locale: string): string {
  return formatarEmLisboa(ms, locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}

/** "20–22 nov. 2026": intervalo de dias, em Lisboa. */
export function intervaloEmLisboa(inicio: number, fim: number, locale: string): string {
  const f = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: ZONA_LISBOA })
  return f.formatRange(new Date(inicio), new Date(Math.max(inicio, fim)))
}

/**
 * A data de um evento nos cartões: "20–22 nov. 2026" quando tem fim, senão
 * "sáb., 20 nov. 2026 · 10:00" (sem hora quando é meia-noite em Lisboa — um
 * evento sem hora marcada).
 */
export function dataDoEvento(inicio: number, fim: number | undefined, locale: string): string {
  if (fim) return intervaloEmLisboa(inicio, fim, locale)
  const hora = horaEmLisboa(inicio)
  const data = dataEmLisboa(inicio, locale)
  return hora === "00:00" ? data : `${data} · ${hora}`
}

/** "AAAA-MM-DD HH:mm" de um `Date` de relógio — para texto que a operação lê. */
export function textoDoRelogio(relogio: Date): string {
  return `${diaDoRelogio(relogio)} ${dois(relogio.getHours())}:${dois(relogio.getMinutes())}`
}

/** `Date` de relógio de Lisboa → ISO do instante verdadeiro (em UTC). */
export function isoDoRelogio(relogio: Date): string | undefined {
  const ms = instanteDoRelogio(relogio)
  return ms === null ? undefined : new Date(ms).toISOString()
}

/** "HH:MM" de um `Date` de relógio (os campos locais já são a hora de Lisboa). */
export function horaDoRelogio(relogio: Date): string {
  return `${dois(relogio.getHours())}:${dois(relogio.getMinutes())}`
}
