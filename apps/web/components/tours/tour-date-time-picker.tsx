"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, CalendarClock, Clock, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { MobileDrawer } from "../ui/mobile-drawer"
import { cn } from "@workspace/ui/lib/utils"
import { useTranslations } from "next-intl"
import { deLisboa, diaDoRelogio, relogioDeLisboa } from "@/lib/hora-lisboa"

interface TimeSlot {
  startTime: string
  endTime?: string
}

interface DayAvailability {
  date: number
  timeSlots: TimeSlot[]
  isCancelled: boolean
  isRescheduled: boolean
  isSpecial: boolean
  reason?: string
}

interface TourDateTimePickerProps {
  value?: { date: Date | null; time: string | null }
  onChange?: (value: { date: Date | null; time: string | null }) => void
  availability: DayAvailability[]
  bookingDeadlineHours?: number
  isLoading?: boolean
  onMonthChange?: (startDate: number, endDate: number) => void
  light?: boolean
  /** Date-only mode: hides the time panel, allows any future date, closes on date pick. */
  hideTime?: boolean
  /** Placeholder shown in the trigger when nothing selected. */
  placeholder?: string
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

const DARK = {
  surface: "bg-[#1e1d1b] border border-[rgba(255,255,255,0.12)]",
  triggerBorder: "border-[rgba(255,255,255,0.12)]",
  triggerBg: "bg-[#1E1D1B]",
  triggerHover: "hover:border-[rgba(201,169,110,0.4)] focus:border-[rgba(201,169,110,0.6)]",
  valueText: "text-white",
  placeholder: "text-[#999]",
  iconMuted: "text-[#999]",
  accent: "#C9A96E",
  navBorder: "border-[rgba(247,244,239,0.08)]",
  navText: "text-[rgba(247,244,239,0.62)]",
  navTextDim: "text-[rgba(247,244,239,0.2)]",
  monthText: "text-white",
  dayHeader: "text-[rgba(247,244,239,0.38)]",
  dayDisabled: "text-[rgba(247,244,239,0.25)]",
  dayAvailable: "text-[rgba(247,244,239,0.62)] font-medium hover:text-[#C9A96E] hover:bg-[rgba(201,169,110,0.06)]",
  daySelected: "text-[#9a7535] font-bold bg-[rgba(201,169,110,0.08)]",
  dayToday: "text-[#C9A96E] font-bold border border-[rgba(201,169,110,0.4)]",
  divider: "border-[rgba(255,255,255,0.08)]",
  timeLabel: "text-[#f7f4ef]",
  emptyBox: "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.02)] text-[rgba(247,244,239,0.5)]",
  slot: "bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-[rgba(247,244,239,0.75)] hover:border-[rgba(201,169,110,0.4)] hover:text-[#C9A96E]",
  slotSelected: "bg-[rgba(201,169,110,0.12)] border-[#C9A96E] text-[#C9A96E]",
}

const LIGHT: typeof DARK = {
  surface: "bg-[#f7f4ef] border border-[rgba(28,27,24,0.12)]",
  triggerBorder: "border-[rgba(28,27,24,0.12)]",
  triggerBg: "bg-white",
  triggerHover: "hover:border-[#a08248] focus:border-[#a08248]",
  valueText: "text-[#1c1b18]",
  placeholder: "text-[#8c8680]",
  iconMuted: "text-[#8c8680]",
  accent: "#a08248",
  navBorder: "border-[rgba(28,27,24,0.12)]",
  navText: "text-[#696969]",
  navTextDim: "text-[rgba(28,27,24,0.25)]",
  monthText: "text-[#1c1b18]",
  dayHeader: "text-[rgba(28,27,24,0.4)]",
  dayDisabled: "text-[rgba(28,27,24,0.25)]",
  dayAvailable: "text-[#4a4a4a] font-medium hover:text-[#a08248] hover:bg-[rgba(160,130,72,0.08)]",
  daySelected: "text-[#8a6f3c] font-bold bg-[rgba(160,130,72,0.12)]",
  dayToday: "text-[#a08248] font-bold border border-[rgba(160,130,72,0.5)]",
  divider: "border-[rgba(28,27,24,0.08)]",
  timeLabel: "text-[#1c1b18]",
  emptyBox: "border-[rgba(28,27,24,0.16)] bg-transparent text-[#696969]",
  slot: "bg-[#fbfaf7] border-[rgba(28,27,24,0.08)] text-[#4a4a4a] hover:border-[#a08248] hover:text-[#a08248]",
  slotSelected: "bg-[rgba(160,130,72,0.12)] border-[#a08248] text-[#a08248]",
}

export function TourDateTimePicker({
  value,
  onChange,
  availability,
  bookingDeadlineHours,
  isLoading,
  onMonthChange,
  light = false,
  hideTime = false,
  placeholder,
}: TourDateTimePickerProps) {
  const t = useTranslations("tourDetails")
  const c = light ? LIGHT : DARK
  const [open, setOpen] = React.useState(false)
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(value?.date || null)
  const [selectedTime, setSelectedTime] = React.useState<string | null>(value?.time || null)
  const [viewMonth, setViewMonth] = React.useState(value?.date ? value.date.getMonth() : relogioDeLisboa().getMonth())
  const [viewYear, setViewYear] = React.useState(value?.date ? value.date.getFullYear() : relogioDeLisboa().getFullYear())

  const isMobile = useIsMobile()
  // O calendário é o de Lisboa (lib/hora-lisboa.ts): os dias e os horários dos
  // tours são de lá, e "hoje" no browser de Nova Iorque ainda é ontem em Lisboa.
  const now = relogioDeLisboa()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  React.useEffect(() => {
    if (value?.date) {
      setSelectedDate(value.date)
      setViewMonth(value.date.getMonth())
      setViewYear(value.date.getFullYear())
    }
    // Symmetric sync: adopt a cleared time too (the old `if (value?.time)` could set a time
    // but never clear it, so state went stale-truthy and the time appeared "stuck").
    setSelectedTime(value?.time ?? null)
  }, [value])

  React.useEffect(() => {
    if (onMonthChange) {
      const startDate = Date.UTC(viewYear, viewMonth, 1)
      const endDate = Date.UTC(viewYear, viewMonth + 1, 0, 23, 59, 59, 999)
      onMonthChange(startDate, endDate)
    }
  }, [viewMonth, viewYear, onMonthChange])

  const availabilityMap = React.useMemo(() => {
    const map = new Map<string, DayAvailability>()
    availability.forEach(day => {
      const d = new Date(day.date)
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
      map.set(key, day)
    })
    return map
  }, [availability])

  const getAvailabilityForDate = (date: Date): DayAvailability | undefined => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    return availabilityMap.get(key)
  }

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (month: number, year: number) => {
    return (new Date(year, month, 1).getDay() + 6) % 7
  }

  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(viewMonth, viewYear)
    const firstDay = getFirstDayOfMonth(viewMonth, viewYear)
    const days: { day: number; isCurrentMonth: boolean; date: Date }[] = []

    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear
    const daysInPrevMonth = getDaysInMonth(prevMonth, prevYear)

    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i
      days.push({
        day,
        isCurrentMonth: false,
        date: new Date(prevYear, prevMonth, day)
      })
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(viewYear, viewMonth, i)
      })
    }

    const remainingDays = 42 - days.length
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear

    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(nextYear, nextMonth, i)
      })
    }

    return days
  }

  const canNavigateToPrevMonth = () => {
    if (viewYear > now.getFullYear()) return true
    if (viewYear === now.getFullYear() && viewMonth > now.getMonth()) return true
    return false
  }

  const canNavigateToPrevYear = () => {
    return viewYear > now.getFullYear()
  }

  const handlePrevMonth = () => {
    if (!canNavigateToPrevMonth()) return
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const handlePrevYear = () => {
    if (!canNavigateToPrevYear()) return
    setViewYear(viewYear - 1)
  }

  const handleNextYear = () => {
    setViewYear(viewYear + 1)
  }

  const handleDateSelect = (date: Date) => {
    // Only drop the chosen time when the DAY actually changes (slots are per-day). Re-tapping
    // the already-selected day must not wipe a previously-picked time.
    const sameDay =
      selectedDate != null &&
      date.getFullYear() === selectedDate.getFullYear() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getDate() === selectedDate.getDate()
    setSelectedDate(date)
    if (sameDay) {
      onChange?.({ date, time: selectedTime })
    } else {
      setSelectedTime(null)
      onChange?.({ date, time: null })
    }
    if (hideTime) setOpen(false)
  }

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time)
    onChange?.({ date: selectedDate, time })
    if (!isMobile) {
      setOpen(false)
    }
  }

  const isDateInPast = (d: Date) => {
    const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    return dateOnly < today
  }

  const isDateToday = (d: Date) => {
    return d.getFullYear() === today.getFullYear() &&
           d.getMonth() === today.getMonth() &&
           d.getDate() === today.getDate()
  }

  const isDateSelected = (d: Date) => {
    if (!selectedDate) return false
    return d.getFullYear() === selectedDate.getFullYear() &&
           d.getMonth() === selectedDate.getMonth() &&
           d.getDate() === selectedDate.getDate()
  }

  const isSlotPastDeadline = (d: Date, startTime: string) => {
    if (!bookingDeadlineHours) return false
    // O horário "10:00" é das 10h00 em Lisboa; contado no fuso do browser, o
    // prazo fechava horas antes (ou depois) do que devia.
    const slotMs = deLisboa(diaDoRelogio(d), startTime)
    if (slotMs === null) return false
    const deadlineMs = bookingDeadlineHours * 60 * 60 * 1000
    return slotMs - Date.now() < deadlineMs
  }

  const getBookableSlots = (d: Date, slots: TimeSlot[]) => {
    if (!bookingDeadlineHours) return slots
    return slots.filter(slot => !isSlotPastDeadline(d, slot.startTime))
  }

  const isDateAvailable = (d: Date) => {
    if (isDateInPast(d)) return false
    if (hideTime) return true
    const availability = getAvailabilityForDate(d)
    if (!availability) return false
    if (availability.isCancelled) return false
    return getBookableSlots(d, availability.timeSlots).length > 0
  }

  const selectedDateAvailability = selectedDate ? getAvailabilityForDate(selectedDate) : null
  const selectedDateSlots =
    selectedDate && selectedDateAvailability
      ? getBookableSlots(selectedDate, selectedDateAvailability.timeSlots)
      : []

  const formatDisplayDate = () => {
    if (!selectedDate) return null
    const day = String(selectedDate.getDate()).padStart(2, "0")
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0")
    const year = selectedDate.getFullYear()
    return `${day}/${month}/${year}`
  }

  const calendarDays = generateCalendarDays()

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  const timePanel = (
    <div
      className={cn(
        "pt-4 border-t",
        c.divider,
        !isMobile && "pt-0 border-t-0 border-l pl-5 min-h-[332px] flex flex-col"
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4" style={{ color: c.accent }} />
        <span className={cn("text-[12px] font-semibold tracking-[1.35px] uppercase", c.timeLabel)}>
          {t("selectTime")}
        </span>
      </div>

      {!selectedDate && (
        <div className={cn("flex-1 min-h-[140px] border border-dashed px-4 py-6 text-[13px]", c.emptyBox)}>
          {t("selectDateAndTime")}
        </div>
      )}

      {selectedDate && selectedDateAvailability && selectedDateSlots.length > 0 && (
        <div className={cn("space-y-3", !isMobile && "flex-1 min-h-0")}>
          <div
            className={cn(
              "grid gap-2",
              isMobile ? "grid-cols-1" : "grid-cols-2 max-h-[320px] overflow-y-auto pr-1 content-start"
            )}
          >
            {selectedDateSlots.map((slot, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleTimeSelect(slot.startTime)}
                className={cn(
                  "w-full px-3 py-2.5 text-[13px] font-medium text-center whitespace-nowrap transition-colors border",
                  selectedTime === slot.startTime ? c.slotSelected : c.slot
                )}
              >
                {slot.startTime}
                {slot.endTime && ` - ${slot.endTime}`}
              </button>
            ))}
          </div>

          {selectedDateAvailability.isSpecial && selectedDateAvailability.reason && (
            <p
              className="text-[12px] px-3 py-1.5 border"
              style={{ color: c.accent, backgroundColor: "rgba(160,130,72,0.08)", borderColor: "rgba(160,130,72,0.2)" }}
            >
              {selectedDateAvailability.reason}
            </p>
          )}
        </div>
      )}

      {selectedDate && (!selectedDateAvailability || selectedDateSlots.length === 0) && !isLoading && (
        <div className={cn("flex-1 min-h-[140px] border border-dashed px-4 py-6 text-[13px]", c.emptyBox)}>
          {t("noTimesAvailable")}
        </div>
      )}
    </div>
  )

  const pickerContent = (
    <div className={cn("p-4 overflow-y-auto", isMobile ? "px-2" : "max-h-[80vh]")}>
      <div className={cn(!isMobile && !hideTime && "grid grid-cols-[320px_minmax(240px,1fr)] gap-5 items-start")}>
        <div>
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={!canNavigateToPrevMonth()}
              className={cn(
                "size-[32px] border flex items-center justify-center transition-colors",
                c.navBorder,
                canNavigateToPrevMonth() ? cn(c.navText, "hover:border-[rgba(160,130,72,0.4)]") : cn(c.navTextDim, "cursor-not-allowed")
              )}
            >
              <ChevronLeft className="size-[14px]" />
            </button>

            <div className="flex items-center gap-2">
              <span
                className={cn("text-[18px] font-semibold", c.monthText)}
                style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
              >
                {months[viewMonth]} {viewYear}
              </span>
              <div className={cn("flex flex-col border", c.navBorder)}>
                <button
                  type="button"
                  onClick={handleNextYear}
                  className={cn("px-1 transition-colors", c.navText)}
                >
                  <ChevronUp className="size-[10px]" />
                </button>
                <button
                  type="button"
                  onClick={handlePrevYear}
                  disabled={!canNavigateToPrevYear()}
                  className={cn("px-1 transition-colors", canNavigateToPrevYear() ? c.navText : cn(c.navTextDim, "cursor-not-allowed"))}
                >
                  <ChevronDown className="size-[10px]" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className={cn("size-[32px] border flex items-center justify-center transition-colors hover:border-[rgba(160,130,72,0.4)]", c.navBorder, c.navText)}
            >
              <ChevronRight className="size-[14px]" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((day) => (
              <div
                key={day}
                className={cn("h-8 flex items-center justify-center text-[10px] font-bold tracking-[0.79px] uppercase", c.dayHeader)}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((item, index) => {
              const isPast = isDateInPast(item.date)
              const isAvailable = isDateAvailable(item.date)
              const isSelected = isDateSelected(item.date)
              const isToday = isDateToday(item.date)

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => isAvailable && handleDateSelect(item.date)}
                  disabled={!isAvailable}
                  className={cn(
                    "h-10 w-full flex items-center justify-center text-[14px] transition-colors",
                    !item.isCurrentMonth && "opacity-40",
                    isPast || !isAvailable
                      ? cn(c.dayDisabled, "cursor-not-allowed")
                      : isSelected
                      ? c.daySelected
                      : isToday
                      ? c.dayToday
                      : isAvailable
                      ? c.dayAvailable
                      : c.dayDisabled
                  )}
                >
                  {item.day}
                </button>
              )
            })}
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: c.accent, borderTopColor: "transparent" }} />
            </div>
          )}
        </div>

        {!hideTime && timePanel}
      </div>

      {isMobile && selectedDate && (hideTime || selectedTime) && (
        <button
          onClick={() => setOpen(false)}
          className={cn("w-full mt-6 py-3.5 font-bold tracking-[1.1px] uppercase text-[13px] transition-colors", light ? "text-[#f7f4ef]" : "text-[#0D0D0D]")}
          style={{ backgroundColor: c.accent }}
        >
          {t("confirm")}
        </button>
      )}
    </div>
  )

  const displayValue = selectedDate && selectedTime
    ? `${formatDisplayDate()} ${t("at")} ${selectedTime}`
    : selectedDate
    ? formatDisplayDate()
    : null

  const trigger = (
    <button
      type="button"
      className={cn(
        "w-full h-[44px] px-[13px] py-[14px] border flex items-center gap-2 transition-colors focus:outline-none",
        c.triggerBorder,
        c.triggerBg,
        c.triggerHover
      )}
    >
      <span
        className={cn(
          "flex-1 text-left text-[14px] leading-none truncate",
          displayValue ? c.valueText : c.placeholder
        )}
      >
        {displayValue || placeholder || (hideTime ? "00/00/00" : "00/00/00, 00:00")}
      </span>
      {displayValue ? (
        <X
          className={cn("size-[18px] shrink-0", c.iconMuted)}
          onClick={(e) => {
            e.stopPropagation()
            setSelectedDate(null)
            setSelectedTime(null)
            onChange?.({ date: null, time: null })
          }}
        />
      ) : (
        <CalendarClock className={cn("size-6 shrink-0", c.iconMuted)} />
      )}
    </button>
  )

  if (isMobile) {
    return (
      <MobileDrawer
        dark={!light}
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        title={t("selectDateAndTime")}
      >
        {pickerContent}
      </MobileDrawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className={cn("max-h-[80vh] overflow-hidden p-0 rounded-none shadow-[0_20px_40px_-10px_rgba(0,0,0,0.6)]", c.surface)}
        align="start"
        sideOffset={8}
        style={{
          width: "auto",
          minWidth: "var(--radix-popover-trigger-width)",
          maxWidth: "calc(100vw - 2rem)",
        }}
      >
        {pickerContent}
      </PopoverContent>
    </Popover>
  )
}
