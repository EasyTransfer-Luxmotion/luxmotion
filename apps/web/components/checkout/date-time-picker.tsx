"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Clock, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from "@workspace/ui/components/popover"
import { CalendarIcon } from "lucide-react"
import Image from "next/image"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { MobileDrawer } from "../ui/mobile-drawer"
import { cn } from "@workspace/ui/lib/utils"
import { ClockTimePicker } from "@/components/new-landing-page/booking/clock-time-picker"
import { useMinAdvanceBookingHours } from "@/hooks/use-min-advance-hours"
import { clampDateTime } from "@/lib/event-date-time"

interface DateTimePickerProps {
  value?: Date | string | number | null
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  label?: string
  variant?: "default" | "widget" | "new-widget" | "quote"
  hideLeftIcon?: boolean
  /** Force light/dark. Overrides the variant default (new-widget = dark). */
  dark?: boolean
  /** Optional product bounds, combined with the site's booking lead time. */
  minDateTime?: number
  maxDateTime?: number
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

export function DateTimePicker({ value, onChange, placeholder = "Partida", label = "Partida", variant = "default", hideLeftIcon = false, dark: darkProp, minDateTime: earliest, maxDateTime: latest }: DateTimePickerProps) {
  const normalizedValue = React.useMemo(() => {
    if (!value) return undefined
    if (value instanceof Date) return value
    const d = new Date(value)
    return Number.isFinite(d.getTime()) ? d : undefined
  }, [value])

  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState<Date | undefined>(normalizedValue)
  const [hours, setHours] = React.useState(() => normalizedValue?.getHours() ?? 0)
  const [minutes, setMinutes] = React.useState(() => normalizedValue?.getMinutes() ?? 0)
  const initialView = normalizedValue ?? (earliest === undefined ? new Date() : new Date(Math.max(Date.now(), earliest)))
  const [viewMonth, setViewMonth] = React.useState(initialView.getMonth())
  const [viewYear, setViewYear] = React.useState(initialView.getFullYear())

  const [hoursInput, setHoursInput] = React.useState("")
  const [minutesInput, setMinutesInput] = React.useState("")
  const [isHoursFocused, setIsHoursFocused] = React.useState(false)

  // In the booking bar, anchor the calendar to the whole field cell (.booking-section)
  // instead of the inline date field, so it opens cleanly above/below the bar and never
  // overlaps the field — like the passengers popover. Falls back to the trigger elsewhere.
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const cellAnchorRef = React.useRef<HTMLElement | null>(null)
  const [hasCellAnchor, setHasCellAnchor] = React.useState(false)
  React.useEffect(() => {
    const cell = triggerRef.current?.closest<HTMLElement>(".booking-section") ?? null
    cellAnchorRef.current = cell
    setHasCellAnchor(!!cell)
  }, [])
  const [isMinutesFocused, setIsMinutesFocused] = React.useState(false)
  const [showClockPicker, setShowClockPicker] = React.useState(false)
  const minutesInputRef = React.useRef<HTMLInputElement>(null)

  const isMobile = useIsMobile()

  // Minimum booking lead time (admin-configurable); default 2h until it loads / deploys.
  const minAdvanceHours = useMinAdvanceBookingHours()

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Earliest bookable moment = now + lead time. Days before its calendar day are
  // disabled; on that day the time is clamped up to it.
  const minLeadMs = minAdvanceHours * 60 * 60 * 1000
  const minDateTime = new Date(Math.max(now.getTime() + minLeadMs, earliest ?? -Infinity))
  const maxDateTime = latest === undefined ? undefined : new Date(latest)
  const maxDate = maxDateTime && new Date(maxDateTime.getFullYear(), maxDateTime.getMonth(), maxDateTime.getDate())
  const minDate = new Date(minDateTime.getFullYear(), minDateTime.getMonth(), minDateTime.getDate())

  React.useEffect(() => {
    if (!normalizedValue) {
      setDate(undefined)
      setHours(0)
      setMinutes(0)
    } else {
      setDate(normalizedValue)
      setHours(normalizedValue.getHours())
      setMinutes(normalizedValue.getMinutes())
      setViewMonth(normalizedValue.getMonth())
      setViewYear(normalizedValue.getFullYear())
    }
  }, [normalizedValue])

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

  const handleDateSelect = (selectedDate: Date) => {
    setDate(selectedDate)
    const newDate = new Date(selectedDate)
    
    const isMinDay = selectedDate.getFullYear() === minDate.getFullYear() &&
                    selectedDate.getMonth() === minDate.getMonth() &&
                    selectedDate.getDate() === minDate.getDate()

    // Stamp the date with the time already held in the shared value (the source of truth),
    // not this instance's local hours/minutes — which can still be 0 on a freshly mounted /
    // off-screen twin picker and would otherwise emit midnight and wipe a chosen time.
    let validHours = normalizedValue?.getHours() ?? hours
    let validMinutes = normalizedValue?.getMinutes() ?? minutes

    if (isMinDay) {
      const minHour = minDateTime.getHours()
      const minMinute = minDateTime.getMinutes()
      
      if (validHours < minHour) {
        validHours = minHour
        validMinutes = minMinute
      } else if (validHours === minHour && validMinutes < minMinute) {
        validMinutes = minMinute
      }
      
      setHours(validHours)
      setMinutes(validMinutes)
    }
    
    newDate.setHours(validHours, validMinutes, 0, 0)
    const boundedDate = clampDateTime(newDate, minDateTime, maxDateTime)
    setHours(boundedDate.getHours())
    setMinutes(boundedDate.getMinutes())
    onChange?.(boundedDate)
  }

  const handleTimeChange = (newHours: number, newMinutes: number) => {
    let validHours = newHours
    let validMinutes = newMinutes
    
    if (isSelectedDateMinDay()) {
      const minHour = minDateTime.getHours()
      const minMinute = minDateTime.getMinutes()
      
      if (validHours < minHour) {
        validHours = minHour
        validMinutes = minMinute
      } else if (validHours === minHour && validMinutes < minMinute) {
        validMinutes = minMinute
      }
    }
    
    setHours(validHours)
    setMinutes(validMinutes)
    const baseDate = normalizedValue ?? date
    if (baseDate) {
      const newDate = new Date(baseDate)
      newDate.setHours(validHours, validMinutes, 0, 0)
      const boundedDate = clampDateTime(newDate, minDateTime, maxDateTime)
      setHours(boundedDate.getHours())
      setMinutes(boundedDate.getMinutes())
      onChange?.(boundedDate)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setDate(undefined)
    setHours(0)
    setMinutes(0)
    onChange?.(undefined)
  }

  const formatDisplay = () => {
    if (!date) return ""
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const year = String(date.getFullYear())
    const h = String(hours).padStart(2, "0")
    const m = String(minutes).padStart(2, "0")
    return `${day}/${month}/${year} - ${h}:${m}`
  }

  const isDateSelected = (d: Date) => {
    if (!date) return false
    return d.getFullYear() === date.getFullYear() &&
           d.getMonth() === date.getMonth() &&
           d.getDate() === date.getDate()
  }

  const isDateToday = (d: Date) => {
    return d.getFullYear() === today.getFullYear() &&
           d.getMonth() === today.getMonth() &&
           d.getDate() === today.getDate()
  }

  const isDateInPast = (d: Date) => {
    const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    return dateOnly < minDate || (maxDate !== undefined && dateOnly > maxDate) || (maxDateTime !== undefined && minDateTime > maxDateTime)
  }

  const isSelectedDateMinDay = () => {
    if (!date) return false
    return date.getFullYear() === minDate.getFullYear() &&
           date.getMonth() === minDate.getMonth() &&
           date.getDate() === minDate.getDate()
  }

  const calendarDays = generateCalendarDays()

  const isWidget = variant === "widget"
  const isNewWidget = variant === "new-widget"
  const isQuote = variant === "quote"

  const dark = darkProp ?? isNewWidget

  const pickerContent = (
    <div className={cn("p-4 overflow-y-auto", isMobile && "px-0")}>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={handlePrevMonth}
          disabled={!canNavigateToPrevMonth()}
          className={`w-8 h-8 flex items-center justify-center transition-colors ${
            canNavigateToPrevMonth()
              ? dark ? "text-[rgba(255,255,255,0.5)] hover:text-white" : "text-[#9ca3af] hover:text-[#6b7280]"
              : dark ? "text-[rgba(255,255,255,0.15)] cursor-not-allowed" : "text-[#e5e7eb] cursor-not-allowed"
          }`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1">
          <span className={cn("text-[15px] font-medium", dark ? "text-white" : "text-[#222222]")}>
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <div className="flex flex-col -space-y-1 ml-1">
            <button
              type="button"
              onClick={handleNextYear}
              className={cn("transition-colors p-0.5", dark ? "text-[rgba(255,255,255,0.5)] hover:text-white" : "text-[#9ca3af] hover:text-[#6b7280]")}
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handlePrevYear}
              disabled={!canNavigateToPrevYear()}
              className={`transition-colors p-0.5 ${
                canNavigateToPrevYear()
                  ? dark ? "text-[rgba(255,255,255,0.5)] hover:text-white" : "text-[#9ca3af] hover:text-[#6b7280]"
                  : dark ? "text-[rgba(255,255,255,0.15)] cursor-not-allowed" : "text-[#e5e7eb] cursor-not-allowed"
              }`}
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleNextMonth}
          className={cn("w-8 h-8 flex items-center justify-center transition-colors", dark ? "text-[rgba(255,255,255,0.5)] hover:text-white" : "text-[#9ca3af] hover:text-[#6b7280]")}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {DAYS.map((day) => (
          <div
            key={day}
            className={cn("h-8 flex items-center justify-center text-[13px] font-medium", dark ? "text-[rgba(255,255,255,0.4)]" : "text-[#9ca3af]")}
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {calendarDays.map((item, index) => {
          const isPast = isDateInPast(item.date)
          return (
            <button
              key={index}
              type="button"
              onClick={() => !isPast && handleDateSelect(item.date)}
              disabled={isPast}
              className={`h-9 flex items-center justify-center text-[14px] transition-colors ${isQuote ? "rounded-none" : "rounded-lg"} ${
                isPast
                  ? dark ? "text-[rgba(255,255,255,0.15)] cursor-not-allowed" : "text-[#d1d5db] cursor-not-allowed"
                  : isDateSelected(item.date)
                  ? dark ? "bg-[#C9A96E] text-[#0D0D0D] font-semibold" : "bg-[#a08248] text-white font-semibold"
                  : isDateToday(item.date)
                  ? dark ? "text-[#C9A96E] font-semibold hover:bg-[rgba(255,255,255,0.08)]" : "text-[#a08248] font-semibold hover:bg-[rgba(168,131,58,0.08)]"
                  : item.isCurrentMonth
                  ? dark ? "text-white hover:bg-[rgba(255,255,255,0.08)]" : "text-[#1a1612] hover:bg-[rgba(168,131,58,0.06)]"
                  : dark ? "text-[rgba(255,255,255,0.25)] hover:bg-[rgba(255,255,255,0.05)]" : "text-[#d1d5db] hover:bg-[#f3f4f6]"
              }`}
            >
              {item.day}
            </button>
          )
        })}
      </div>

      <div className={cn("border-t my-4", dark ? "border-[rgba(255,255,255,0.08)]" : "border-[#e5e7eb]")} />

      <div>
        <label className={cn("block text-[15px] font-semibold mb-2", dark ? "text-white" : "text-[#222222]")}>
          {label}
        </label>
        <button
          type="button"
          onClick={() => setShowClockPicker(true)}
          className={cn(
            "flex items-center w-full h-12 px-3 border transition-colors",
            isQuote ? "rounded-none" : "rounded-lg",
            dark
              ? "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.25)]"
              : "border-[rgba(154,117,53,0.22)] bg-[#faf7f2] hover:border-[#a08248]"
          )}
        >
          <Clock className={cn("w-5 h-5 flex-shrink-0", dark ? "text-[#C9A96E]" : "text-[#a08248]")} />
          <div className="flex items-center flex-1 ml-2">
            <span className={cn("text-[15px]", dark ? "text-white" : "text-[#222222]")}>
              {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}
            </span>
          </div>
          <div
            onClick={handleClear}
            className={cn("transition-colors ml-2 cursor-pointer", dark ? "text-[rgba(255,255,255,0.4)] hover:text-white" : "text-[#9ca3af] hover:text-[#6b7280]")}
          >
            <X className="w-4 h-4" />
          </div>
        </button>
      </div>

      {isMobile && (
        <button
          onClick={() => setOpen(false)}
          className={cn(
            "w-full mt-6 py-3.5 font-bold transition-colors",
            isQuote ? "rounded-none uppercase tracking-[1.1px] text-[14px]" : "rounded-xl",
            dark
              ? "bg-[#C9A96E] text-[#0D0D0D] active:brightness-90"
              : "bg-[#a08248] text-white active:bg-[#8a6f3c]"
          )}
        >
          Confirm
        </button>
      )}
    </div>
  )

  const clockPickerContent = (
    <ClockTimePicker
      dark={dark}
      value={{ hours, minutes }}
      onChange={(time) => handleTimeChange(time.hours, time.minutes)}
      onCancel={() => setShowClockPicker(false)}
      onConfirm={() => setShowClockPicker(false)}
      minTime={isSelectedDateMinDay() ? { hours: minDateTime.getHours(), minutes: minDateTime.getMinutes() } : undefined}
      headline="Select time"
    />
  )

  const trigger = (
    <button
      type="button"
      className={
        isQuote
          ? `w-full h-[44px] px-3 bg-[#faf7f2] border border-[rgba(154,117,53,0.22)] flex items-center gap-2 transition-colors hover:border-[#a08248] focus:outline-none focus:border-[#a08248] ${
              date ? "text-[#0d0d0d]" : "text-[#999]"
            }`
          : isNewWidget
          ? `w-full h-full px-0 py-0 bg-transparent border-0 flex items-center gap-2 focus:outline-none focus:ring-0 cursor-pointer`
          : isWidget
          ? `w-full h-full px-6 py-4 md:py-3 bg-transparent border-0 flex items-center gap-3 focus:outline-none focus:ring-0 hover:bg-zinc-50/50 transition-colors`
          : /* O `dark` só governava o painel do calendário; o campo em si tinha
               `bg-white` escrito à mão e ficava um rectângulo branco dentro do
               modal escuro. */
            `w-full h-12 px-4 border flex items-center gap-3 transition-all focus:outline-none focus:ring-2 ${
              dark
                ? "border-[rgba(255,255,255,0.12)] bg-[#1e1d1b] hover:border-[rgba(255,255,255,0.3)] focus:ring-[#C9A96E] focus:border-[#C9A96E]"
                : "border-[rgba(154,117,53,0.22)] bg-white hover:border-[#a08248] focus:ring-[#a08248] focus:border-[#a08248]"
            } ${
              date
                ? dark ? "text-white" : "text-[#222222]"
                : dark ? "text-[rgba(255,255,255,0.45)]" : "text-[#a2a2a2]"
            }`
      }
      style={isNewWidget ? {
        color: date ? (dark ? "white" : "#1a1612") : (dark ? "#696969" : "#8c8680")
      } : isWidget ? {
        color: date ? "#222" : "#808080"
      } : undefined}
    >
      {isQuote ? (
        !hideLeftIcon && <CalendarIcon className="w-4 h-4 flex-shrink-0 text-[#a08248]" strokeWidth={2} />
      ) : isNewWidget ? (
        !hideLeftIcon && <CalendarIcon className="w-6 h-6 flex-shrink-0" strokeWidth={2} style={{ color: dark ? "#C9A96E" : "#a08248" }} />
      ) : isWidget ? (
        <div
          data-theme-color="heroBookingIcon"
          className="w-5 h-5 flex-shrink-0 calendar-arrow-icon"
          role="img"
          aria-label="Calendar arrow right"
          style={{ color: "var(--ck-accent, #a08248)" }}
        />
      ) : (
        <CalendarIcon className="w-5 h-5 flex-shrink-0 text-[#bfbfbf]" strokeWidth={2.5} />
      )}
      <span className={`flex-1 text-left ${isQuote ? "text-[14px] leading-none" : isNewWidget ? "text-[14px] font-normal leading-tight" : isWidget ? "text-[15px] font-medium leading-tight" : "text-[15px]"}`}>
        {date ? formatDisplay() : placeholder}
      </span>
      {date && !isWidget && !isNewWidget && !isQuote && (
        <X
          className="w-5 h-5 text-[#bfbfbf] hover:text-[#808080] flex-shrink-0"
          onClick={handleClear}
        />
      )}
      {date && isQuote && (
        <X
          className="w-4 h-4 text-[#999] hover:text-[#0d0d0d] flex-shrink-0"
          onClick={handleClear}
        />
      )}
    </button>
  )

  if (isMobile) {
    // Keep focus from scrolling the drawer chrome; its inner content still scrolls.
    return (
      <MobileDrawer
        className="overflow-clip"
        dark={dark}
        open={open}
        onOpenChange={(newOpen) => {
          setOpen(newOpen)
          if (!newOpen) setShowClockPicker(false)
        }}
        trigger={trigger}
        title={showClockPicker ? "Select time" : placeholder}
      >
        <div className="relative">
          {showClockPicker ? clockPickerContent : pickerContent}
        </div>
      </MobileDrawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen)
      if (!newOpen) setShowClockPicker(false)
    }}>
      <PopoverTrigger asChild ref={triggerRef}>
        {trigger}
      </PopoverTrigger>
      {hasCellAnchor && <PopoverAnchor virtualRef={cellAnchorRef as unknown as React.RefObject<Element>} />}
      <PopoverContent
        className={cn(
          "p-0 shadow-lg max-h-[var(--radix-popover-content-available-height)] overflow-y-auto transition-all duration-300 ease-out",
          showClockPicker
            ? cn("w-[328px] border-0", dark ? "bg-transparent rounded-none" : "bg-[#faf7f2] rounded-none")
            : cn(
                "w-[280px]",
                dark
                  ? "bg-[#1e1d1b] border-[rgba(255,255,255,0.12)] rounded-none"
                  : "bg-white border-[rgba(154,117,53,0.22)] rounded-none"
              )
        )}
        align="start"
        sideOffset={8}
        collisionPadding={{ top: 88, bottom: 16, left: 16, right: 16 }}
      >
        <div className="relative">
          {showClockPicker ? clockPickerContent : pickerContent}
        </div>
      </PopoverContent>
    </Popover>
  )
}

