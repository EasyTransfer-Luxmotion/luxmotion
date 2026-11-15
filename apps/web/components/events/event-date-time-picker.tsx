"use client"

import { useTranslations } from "next-intl"
import { DateTimePicker } from "@/components/checkout/date-time-picker"
import { eventBookingEnd } from "@/lib/event-date-time"
import { horaDoRelogio } from "@/lib/hora-lisboa"

interface EventDateTimePickerProps {
  start: number
  end?: number
  value: { date: Date | null; time: string | null }
  onChange: (value: { date: Date | null; time: string | null }) => void
  dark?: boolean
}

export function EventDateTimePicker({ start, end, value, onChange, dark = true }: EventDateTimePickerProps) {
  const t = useTranslations("tourDetails")
  return (
    <DateTimePicker
      key={`${start}-${end}`}
      value={value.date}
      minDateTime={start}
      maxDateTime={eventBookingEnd(start, end)}
      dark={dark}
      variant={dark ? "default" : "quote"}
      placeholder={t("dateAndTime")}
      label={t("dateAndTime")}
      // O selector devolve relógio de Lisboa: a hora lê-se dos campos, sem converter.
      onChange={(date) => onChange({ date: date ?? null, time: date ? horaDoRelogio(date) : null })}
    />
  )
}
