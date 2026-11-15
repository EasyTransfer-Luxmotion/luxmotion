import { deLisboa, diaDoRelogio, emLisboa, fimDoDiaEmLisboa } from "@/lib/hora-lisboa"

/*
 * Os eventos acontecem em Portugal: o dia e a hora contam-se em Lisboa. Estas
 * funções usavam getHours/setHours do browser, e quem visitava de Nova Iorque
 * via o evento das 10h00 às 05h00 e podia escolher horas fora dele.
 */

/** Dia e hora de Lisboa de um instante. */
export function localDateTimeFields(timestamp: number) {
  const { dia, hora } = emLisboa(timestamp)
  return { date: dia, time: hora }
}

export function combineLocalDateTime(date: string, time: string): number | undefined {
  if (!date) return undefined
  return deLisboa(date, time || "00:00") ?? undefined
}

/** An event without an end date is bookable until the end of its start day (in Lisbon). */
export function eventBookingEnd(start: number, end?: number): number {
  if (end !== undefined) return end
  return fimDoDiaEmLisboa(start)
}

/** `date` é um `Date` de relógio de Lisboa (o que os selectores devolvem); `time` "HH:MM" em Lisboa. */
export function eventSelectionTimestamp(selection: { date: Date | null; time: string | null }): number | null {
  if (!selection.date || !selection.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(selection.time)) return null
  if (!Number.isFinite(selection.date.getTime())) return null
  return deLisboa(diaDoRelogio(selection.date), selection.time)
}

export function validEventSelection(selection: { date: Date | null; time: string | null }, start: number, end?: number) {
  const timestamp = eventSelectionTimestamp(selection)
  return timestamp !== null && timestamp >= start && timestamp <= eventBookingEnd(start, end)
}

export function clampDateTime(date: Date, min: Date, max?: Date): Date {
  return new Date(Math.min(max?.getTime() ?? Infinity, Math.max(min.getTime(), date.getTime())))
}
