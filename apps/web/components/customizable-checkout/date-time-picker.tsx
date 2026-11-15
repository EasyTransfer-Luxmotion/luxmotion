"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Clock, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { CalendarIcon } from "lucide-react"
import Image from "next/image"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { MobileDrawer } from "../ui/mobile-drawer"
import { cn } from "@workspace/ui/lib/utils"
import { ClockTimePicker } from "../ui/clock-time-picker"
import { useMinAdvanceBookingHours } from "@/hooks/use-min-advance-hours"
import { relogioDeLisboa } from "@/lib/hora-lisboa"

interface DateTimePickerProps {
  value?: Date | string | number | null
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  label?: string
  variant?: "default" | "widget" | "new-widget"
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

export function DateTimePicker({ value, onChange, placeholder = "Partida", label = "Partida", variant = "default" }: DateTimePickerProps) {
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
  const [viewMonth, setViewMonth] = React.useState(normalizedValue ? normalizedValue.getMonth() : relogioDeLisboa().getMonth())
  const [viewYear, setViewYear] = React.useState(normalizedValue ? normalizedValue.getFullYear() : relogioDeLisboa().getFullYear())

  const [hoursInput, setHoursInput] = React.useState("")
  const [minutesInput, setMinutesInput] = React.useState("")
  const [isHoursFocused, setIsHoursFocused] = React.useState(false)
  const [isMinutesFocused, setIsMinutesFocused] = React.useState(false)
  const [showClockPicker, setShowClockPicker] = React.useState(false)
  const minutesInputRef = React.useRef<HTMLInputElement>(null)

  const isMobile = useIsMobile()

  // Minimum booking lead time (admin-configurable); default 2h until it loads / deploys.
  const minAdvanceHours = useMinAdvanceBookingHours()

  // Relógio de Lisboa (lib/hora-lisboa.ts): a recolha é em Portugal, e com a
  // hora do browser quem estava noutro fuso via o mínimo de antecedência errado.
  const now = relogioDeLisboa()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Earliest bookable moment = now + lead time. Days before its calendar day are
  // disabled; on that day the time is clamped up to it.
  const minLeadMs = minAdvanceHours * 60 * 60 * 1000
  const minDateTime = relogioDeLisboa(Date.now() + minLeadMs)
  const minDate = new Date(minDateTime.getFullYear(), minDateTime.getMonth(), minDateTime.getDate())

  React.useEffect(() => {
    if (normalizedValue) {
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

    // Stamp the date with the time held in the shared value (source of truth), not this
    // instance's local hours/minutes — which can be 0 on a fresh / off-screen twin and emit midnight.
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
    
    newDate.setHours(validHours, validMinutes)
    onChange?.(newDate)
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
      newDate.setHours(validHours, validMinutes)
      onChange?.(newDate)
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
    return `${day}/${month}/${year} às ${h}:${m}`
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
    return dateOnly < minDate
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

  const pickerContent = (
    <div className={cn("p-4 overflow-y-auto", isMobile && "px-0")}>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={handlePrevMonth}
          disabled={!canNavigateToPrevMonth()}
          className={`w-8 h-8 flex items-center justify-center transition-colors ${
            canNavigateToPrevMonth() 
              ? "text-[#9ca3af] hover:text-[#6b7280]" 
              : "text-[#e5e7eb] cursor-not-allowed"
          }`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-1">
          <span className="text-[15px] font-medium text-[#222222]">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <div className="flex flex-col -space-y-1 ml-1">
            <button
              type="button"
              onClick={handleNextYear}
              className="text-[#9ca3af] hover:text-[#6b7280] transition-colors p-0.5"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handlePrevYear}
              disabled={!canNavigateToPrevYear()}
              className={`transition-colors p-0.5 ${
                canNavigateToPrevYear()
                  ? "text-[#9ca3af] hover:text-[#6b7280]"
                  : "text-[#e5e7eb] cursor-not-allowed"
              }`}
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        </div>
        
        <button
          type="button"
          onClick={handleNextMonth}
          className="w-8 h-8 flex items-center justify-center text-[#9ca3af] hover:text-[#6b7280] transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {DAYS.map((day) => (
          <div
            key={day}
            className="h-8 flex items-center justify-center text-[13px] font-medium text-[#9ca3af]"
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
              className={`h-9 flex items-center justify-center text-[14px] transition-colors rounded-lg ${
                isPast
                  ? "text-[#d1d5db] cursor-not-allowed"
                  : isDateSelected(item.date)
                  ? "bg-[#27c7ff] text-white font-semibold"
                  : isDateToday(item.date)
                  ? "text-[#27c7ff] font-semibold hover:bg-[#f3f4f6]"
                  : item.isCurrentMonth
                  ? "text-[#222222] hover:bg-[#f3f4f6]"
                  : "text-[#d1d5db] hover:bg-[#f3f4f6]"
              }`}
            >
              {item.day}
            </button>
          )
        })}
      </div>

      <div className="border-t border-[#e5e7eb] my-4" />

      <div>
        <label className="block text-[15px] font-semibold text-[#222222] mb-2">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setShowClockPicker(true)}
          className="flex items-center w-full h-12 px-3 border border-[#e0e0e0] rounded-lg bg-white hover:border-[#bfbfbf] transition-colors"
        >
          <Clock className="w-5 h-5 text-[#27c7ff] flex-shrink-0" />
          <div className="flex items-center flex-1 ml-2">
            <span className="text-[15px] text-[#222222]">
              {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}
            </span>
          </div>
          <div
            onClick={handleClear}
            className="text-[#9ca3af] hover:text-[#6b7280] transition-colors ml-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </div>
        </button>
      </div>

      {isMobile && (
        <button
          onClick={() => setOpen(false)}
          className="w-full mt-6 bg-[#29C5F6] text-white py-3.5 rounded-xl font-bold active:bg-[#20aadd] transition-colors shadow-lg shadow-[#29C5F6]/20"
        >
          Confirm
        </button>
      )}
    </div>
  )

  const clockPickerContent = (
    <ClockTimePicker
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
        isNewWidget
          ? `w-full h-full px-6 py-3 bg-transparent border-0 flex items-center gap-3 focus:outline-none focus:ring-0 hover:bg-zinc-50/50 transition-colors`
          : isWidget
          ? `w-full h-full px-6 py-4 md:py-3 bg-transparent border-0 flex items-center gap-3 focus:outline-none focus:ring-0 hover:bg-zinc-50/50 transition-colors`
          : `w-full h-12 px-4 border border-[#e0e0e0] bg-white flex items-center gap-3 transition-all hover:border-[#bfbfbf] focus:outline-none focus:ring-2 focus:ring-[#27c7ff] focus:border-[#27c7ff] ${
              date ? "text-[#222222]" : "text-[#a2a2a2]"
            }`
      }
      style={isNewWidget ? { 
        color: date ? "#222" : "#808080"
      } : isWidget ? { 
        color: date ? "#222" : "#808080"
      } : undefined}
    >
      {isNewWidget ? (
        <CalendarIcon className="w-5 h-5 flex-shrink-0 text-[#27C7FF]" strokeWidth={2.5} />
      ) : (
        <div
          className="w-5 h-5 flex-shrink-0 calendar-arrow-icon"
          role="img"
          aria-label="Calendar arrow right"
          style={isWidget ? { color: "#27C7FF" } : undefined}
        />
      )}
      <span className={`flex-1 text-left ${isNewWidget ? "text-[15px] font-medium leading-tight" : isWidget ? "text-[15px] font-medium leading-tight" : "text-[15px]"}`}>
        {date ? formatDisplay() : placeholder}
      </span>
      {date && !isWidget && !isNewWidget && (
        <X
          className="w-5 h-5 text-[#bfbfbf] hover:text-[#808080] flex-shrink-0"
          onClick={handleClear}
        />
      )}
    </button>
  )

  if (isMobile) {
    return (
      <MobileDrawer
        open={open}
        onOpenChange={(newOpen) => {
          setOpen(newOpen)
          if (!newOpen) setShowClockPicker(false)
        }}
        trigger={trigger}
        title={showClockPicker ? "Select time" : placeholder}
      >
        <div className="relative overflow-hidden">
          <div
            className={cn(
              "transition-all duration-300 ease-out",
              showClockPicker
                ? "opacity-0 -translate-x-full absolute inset-0 pointer-events-none"
                : "opacity-100 translate-x-0"
            )}
          >
            {pickerContent}
          </div>
          <div
            className={cn(
              "transition-all duration-300 ease-out",
              showClockPicker
                ? "opacity-100 translate-x-0"
                : "opacity-0 translate-x-full absolute inset-0 pointer-events-none"
            )}
          >
            {clockPickerContent}
          </div>
        </div>
      </MobileDrawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen)
      if (!newOpen) setShowClockPicker(false)
    }}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "p-0 shadow-lg overflow-hidden transition-all duration-300 ease-out",
          showClockPicker
            ? "w-[328px] bg-[#e9f9ff] border-0 rounded-[28px]"
            : "w-[280px] bg-white border-[#e0e0e0] rounded-xl"
        )}
        align="start"
        sideOffset={8}
      >
        <div className="relative">
          <div
            className={cn(
              "transition-all duration-300 ease-out",
              showClockPicker
                ? "opacity-0 scale-95 absolute inset-0 pointer-events-none"
                : "opacity-100 scale-100"
            )}
          >
            {pickerContent}
          </div>
          <div
            className={cn(
              "transition-all duration-300 ease-out",
              showClockPicker
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 absolute inset-0 pointer-events-none"
            )}
          >
            {clockPickerContent}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

