"use client"

import { type Dispatch, type SetStateAction, useState } from "react"
import { MapPin, ChevronDown, Briefcase, Luggage, Users, CircleCheckBig, CalendarArrowDown } from "lucide-react"
import { DateTimePicker } from "@/components/checkout/date-time-picker"
import { PassengersDropdownContent } from "./passengers-dropdown"
import { GooglePlacesInput } from "@/components/ui/google-places-input"
import type { PassengerState, LuggageState } from "./types"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { motion, AnimatePresence } from "framer-motion"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { MobileDrawer } from "@/components/ui/mobile-drawer"
import { MobileLocationPanel } from "@/components/ui/mobile-location-panel"
import { useHomeTheme } from "@/components/new-landing-page/home-theme"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

interface LocationState {
  text: string
  placeId: string | null
  lat: number | null
  lng: number | null
}

interface TransferFormProps {
  fromLocation: LocationState
  setFromLocation: (value: string, details?: { placeId: string; lat: number; lng: number }) => void
  destinations: LocationState[]
  setDestination: (index: number, value: string, details?: { placeId: string; lat: number; lng: number }) => void
  passengers: PassengerState
  luggage: LuggageState
  showPassengersDropdown: boolean
  setShowPassengersDropdown: (show: boolean) => void
  setPassengers: Dispatch<SetStateAction<PassengerState>>
  setLuggage: Dispatch<SetStateAction<LuggageState>>
  departureDate: Date | undefined
  setDepartureDate: (date: Date | undefined) => void
  onContinue: () => void
  translations: {
    labelFrom: string
    labelTo: string
    labelDeparture: string
    whereFrom: string
    whereTo: string
    placeholderFrom: string
    placeholderTo: string
    placeholderDeparture: string
    continue: string
    passengers: string
    adults: string
    children: string
    childrenAge: string
    backpack: string
    handLuggage: string
    checkedBaggage: string
    done: string
    fillLocations: string
    selectDateFirst: string
  }
}

export function TransferForm({
  fromLocation,
  setFromLocation,
  destinations,
  setDestination,
  passengers: passengerState,
  luggage: luggageState,
  showPassengersDropdown,
  setShowPassengersDropdown,
  setPassengers,
  setLuggage,
  departureDate,
  setDepartureDate,
  onContinue,
  translations: t,
}: TransferFormProps) {
  const isMobile = useIsMobile()
  const { theme, isHome } = useHomeTheme()
  const dark = isHome ? theme === "dark" : true
  const [fromDrawerOpen, setFromDrawerOpen] = useState(false)
  const [toDrawerOpen, setToDrawerOpen] = useState(false)
  const [toDrawerIndex, setToDrawerIndex] = useState(0)

  const totalPassengers = (passengerState?.adults || 0) + (passengerState?.children || 0)
  const totalLuggage = (luggageState?.backpack || 0) + (luggageState?.handLuggage || 0) + (luggageState?.checkedBaggage || 0)
  const handleContinue = () => {
    if (!fromLocation.placeId || !destinations.every((dest) => Boolean(dest.placeId))) {
      toast.error(t.fillLocations || "Please fill in origin and destination.", {
        position: "top-center",
      })
      return
    }
    if (!departureDate) {
      toast.error(t.selectDateFirst || "Please select a date first", {
        position: "top-center",
      })
      return
    }
    onContinue()
  }

  const handleFromSelect = (v: { location: string; placeId: string | null; lat: number | null; lng: number | null }) => {
    setFromLocation(v.location, v.placeId ? { placeId: v.placeId, lat: v.lat!, lng: v.lng! } : undefined)
    if (v.placeId != null) setFromDrawerOpen(false)
  }

  const handleToSelect = (index: number) => (v: { location: string; placeId: string | null; lat: number | null; lng: number | null }) => {
    setDestination(index, v.location, v.placeId ? { placeId: v.placeId, lat: v.lat!, lng: v.lng! } : undefined)
    if (v.placeId != null) setToDrawerOpen(false)
  }

  return (
    <div className="flex flex-col lg:flex-row items-stretch min-h-[64px]">
      {/* Mobile only: a Continue at the top too, so the CTA is reachable without
          scrolling past all the stacked fields. Desktop keeps just the end one. */}
      <button
        type="button"
        onClick={handleContinue}
        className="lg:hidden flex items-center justify-center gap-3 px-6 py-4 w-full bg-[var(--lm-accent,#C9A96E)] transition-all hover:brightness-95 active:scale-95 cursor-pointer border-b border-[rgba(var(--lm-bg-rgb,13,13,13),0.12)]"
      >
        <span className="text-[14px] font-semibold uppercase tracking-[1.1px] text-[rgba(var(--lm-bg-rgb,13,13,13),0.96)]">
          {t.continue}
        </span>
        <CircleCheckBig className="w-5 h-5 stroke-[1.2] text-[rgba(var(--lm-bg-rgb,13,13,13),0.96)]" />
      </button>
      {/* From / Partida */}
      <motion.div
        layout
        className="relative flex-1 border-b lg:border-b-0 lg:border-r border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] flex items-center booking-section focus-within:z-30"
        style={{ backgroundColor: "transparent", borderColor: "rgba(var(--lm-text-rgb,255,255,255),0.08)" }}
      >
        {isMobile ? (
          <MobileLocationPanel
            dark={dark}
            open={fromDrawerOpen}
            onOpenChange={(open) => {
              if (open && fromLocation.text) setFromLocation("", undefined)
              setFromDrawerOpen(open)
            }}
            title={t.whereFrom}
            trigger={
              <button
                type="button"
                className="w-full flex flex-col gap-3 pl-2 pr-4 py-[10px] text-left cursor-pointer"
              >
                <span className="text-[12px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] tracking-[1.08px] uppercase leading-none" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
                  {t.labelFrom}
                </span>
                <div className="flex items-center gap-2 min-w-0 w-full">
                  <MapPin className="w-6 h-6 shrink-0 text-[var(--lm-accent,#C9A96E)]" strokeWidth={1.2} />
                  <span className={fromLocation.text ? "text-[14px] font-medium text-[var(--lm-text,#fff)] truncate" : "text-[14px] text-[var(--lm-muted,#696969)] truncate"}>
                    {fromLocation.text || t.placeholderFrom}
                  </span>
                </div>
              </button>
            }
          >
            <div className="flex flex-col flex-1 min-h-0 gap-2">
              <GooglePlacesInput
                value={{
                  location: fromLocation.text,
                  placeId: fromLocation.placeId,
                  lat: fromLocation.lat,
                  lng: fromLocation.lng,
                }}
                onChange={handleFromSelect}
                placeholder={t.placeholderFrom}
                ariaLabel={t.whereFrom}
                className="w-full"
                variant="new-widget"
                dropdownDark={dark}
                dropdownLuxmotion={!dark}
                inlineDropdown
                dark={dark}
              />
            </div>
          </MobileLocationPanel>
        ) : (
          <div className="flex flex-col justify-center w-full pl-2 py-[10px]">
            <span className="text-[12px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] tracking-[1.08px] uppercase leading-none" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>{t.labelFrom}</span>
            <div className="relative flex items-center mt-3 h-[24px]">
              <div className="absolute left-0 z-10 pointer-events-none text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
                <MapPin className="w-6 h-6" strokeWidth={1.2} />
              </div>
              <GooglePlacesInput
                value={{
                  location: fromLocation.text,
                  placeId: fromLocation.placeId,
                  lat: fromLocation.lat,
                  lng: fromLocation.lng,
                }}
                onChange={(v) =>
                  setFromLocation(
                    v.location,
                    v.placeId ? { placeId: v.placeId, lat: v.lat!, lng: v.lng! } : undefined
                  )
                }
                placeholder={t.placeholderFrom}
                className="w-full"
                variant="hero-inline"
                dropdownDark={dark}
                dropdownLuxmotion={!dark}
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* To / Destino(s) */}
      <AnimatePresence mode="popLayout" initial={false}>
        {destinations.map((dest, index) => (
          <motion.div
            key={index}
            layout
            initial={{ opacity: 0, x: -20, flex: 0 }}
            animate={{ opacity: 1, x: 0, flex: 1 }}
            exit={{ opacity: 0, x: -20, flex: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative border-b lg:border-b-0 lg:border-r border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] flex items-center booking-section focus-within:z-30 overflow-hidden"
            style={{ backgroundColor: "transparent", borderColor: "rgba(var(--lm-text-rgb,255,255,255),0.08)" }}
          >
            {isMobile ? (
              <MobileLocationPanel
                dark={dark}
                open={toDrawerOpen && toDrawerIndex === index}
                onOpenChange={(open) => {
                  if (open && destinations[index]?.text) setDestination(index, "", undefined)
                  setToDrawerOpen(open)
                  if (!open) setToDrawerIndex(0)
                }}
                title={t.whereTo}
                trigger={
                  <button
                    type="button"
                    onClick={() => {
                      setToDrawerIndex(index)
                      setToDrawerOpen(true)
                    }}
                    className="w-full flex flex-col gap-3 pl-2 pr-4 py-[10px] text-left cursor-pointer"
                  >
                    <span className="text-[12px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] tracking-[1.08px] uppercase leading-none" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
                      {t.labelTo}
                    </span>
                    <div className="flex items-center gap-2 min-w-0 w-full">
                      <MapPin className="w-6 h-6 shrink-0 text-[var(--lm-accent,#C9A96E)]" strokeWidth={1.2} />
                      <span className={dest.text ? "text-[14px] font-medium text-[var(--lm-text,#fff)] truncate" : "text-[14px] text-[var(--lm-muted,#696969)] truncate"}>
                        {dest.text || t.placeholderTo}
                      </span>
                    </div>
                  </button>
                }
              >
                <div className="flex flex-col flex-1 min-h-0 gap-2">
                  <GooglePlacesInput
                    value={{
                      location: dest.text,
                      placeId: dest.placeId,
                      lat: dest.lat,
                      lng: dest.lng,
                    }}
                    onChange={handleToSelect(index)}
                    placeholder={t.placeholderTo}
                    ariaLabel={t.whereTo}
                    className="w-full"
                    variant="new-widget"
                    dropdownDark={dark}
                    dropdownLuxmotion={!dark}
                    inlineDropdown
                    dark={dark}
                  />
                </div>
              </MobileLocationPanel>
            ) : (
              <div className="flex flex-col justify-center w-full pl-2 py-[10px]">
                <span className="text-[12px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] tracking-[1.08px] uppercase leading-none" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>{t.labelTo}</span>
                <div className="relative flex items-center mt-3 h-[24px]">
                  <div className="absolute left-0 z-10 pointer-events-none text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
                    <MapPin className="w-6 h-6" strokeWidth={1.2} />
                  </div>
                  <GooglePlacesInput
                    value={{
                      location: dest.text,
                      placeId: dest.placeId,
                      lat: dest.lat,
                      lng: dest.lng,
                    }}
                    onChange={(v) =>
                      setDestination(
                        index,
                        v.location,
                        v.placeId ? { placeId: v.placeId, lat: v.lat!, lng: v.lng! } : undefined
                      )
                    }
                    placeholder={t.placeholderTo}
                    className="w-full"
                    variant="hero-inline"
                    dropdownDark={dark}
                    dropdownLuxmotion={!dark}
                  />
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      <motion.div layout className="lg:w-[199px] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] booking-section hidden lg:flex flex-col justify-center pl-2 py-[10px]" style={{ backgroundColor: "transparent", borderColor: "rgba(var(--lm-text-rgb,255,255,255),0.08)" }}>
        <span className="text-[12px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] tracking-[1.08px] uppercase leading-none" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>{t.labelDeparture}</span>
        <div className="mt-3">
          <DateTimePicker
            value={departureDate}
            onChange={setDepartureDate}
            placeholder="dd/mm/aaaa"
            label={t.labelDeparture}
            variant="new-widget"
            dark={dark}
          />
        </div>
      </motion.div>
      <motion.div layout className="lg:hidden border-b border-[rgba(var(--lm-text-rgb,255,255,255),0.08)] flex flex-col gap-3 pl-2 pr-4 py-[10px] booking-section" style={{ backgroundColor: "transparent", borderColor: "rgba(var(--lm-text-rgb,255,255,255),0.08)" }}>
        <span className="text-[12px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] tracking-[1.08px] uppercase leading-none" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
          {t.labelDeparture}
        </span>
        <DateTimePicker
          value={departureDate}
          onChange={setDepartureDate}
          placeholder={t.placeholderDeparture}
          label={t.labelDeparture}
          variant="new-widget"
          dark={dark}
        />
      </motion.div>

      <motion.div layout className="relative shrink-0 flex items-center border-b lg:border-b-0 lg:border-r border-[rgba(var(--lm-text-rgb,255,255,255),0.08)]" style={{ borderColor: "rgba(var(--lm-text-rgb,255,255,255),0.08)" }}>
        {isMobile ? (
          <MobileDrawer
            dark={dark}
            open={showPassengersDropdown}
            onOpenChange={setShowPassengersDropdown}
            trigger={
              <button
                type="button"
                className="relative flex items-center justify-start gap-[15px] pl-2 pr-4 py-[17px] w-full h-full cursor-pointer transition-colors hover:bg-white/5 booking-section outline-none"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--lm-accent,#C9A96E)",
                  borderColor: "rgba(var(--lm-text-rgb,255,255,255),0.08)"
                }}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-6 h-6" style={{ color: "var(--lm-accent,#C9A96E)" }} strokeWidth={1.2} />
                  <span className="text-[14px] font-medium leading-[21px] text-[var(--lm-text,#fff)]">
                    {totalPassengers}
                  </span>
                </div>
                <div className="h-6 w-px bg-[rgba(var(--lm-text-rgb,255,255,255),0.1)]" />
                <div className="flex items-center gap-2">
                  <Briefcase className="w-6 h-6" style={{ color: "var(--lm-accent,#C9A96E)" }} strokeWidth={1.2} />
                  <Luggage className="w-6 h-6" style={{ color: "var(--lm-accent,#C9A96E)" }} strokeWidth={1.2} />
                  <span className="text-[14px] font-medium leading-[21px] text-[var(--lm-text,#fff)]">
                    {totalLuggage}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4" style={{ color: "var(--lm-accent,#C9A96E)" }} strokeWidth={1.2} />
              </button>
            }
          >
            <PassengersDropdownContent
              passengers={passengerState}
              luggage={luggageState}
              setPassengers={setPassengers}
              setLuggage={setLuggage}
              onClose={() => setShowPassengersDropdown(false)}
              dark={dark}
              translations={t}
            />
          </MobileDrawer>
        ) : (
          <Popover open={showPassengersDropdown} onOpenChange={setShowPassengersDropdown}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative flex items-center justify-start lg:justify-center gap-4 md:gap-5 px-6 py-3 w-full h-full cursor-pointer transition-colors hover:bg-white/5 booking-section outline-none"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--lm-accent,#C9A96E)",
                  borderColor: "rgba(var(--lm-text-rgb,255,255,255),0.08)"
                }}
              >
                <div className="flex items-center gap-5 text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
                  <div className="flex items-center gap-2">
                    <Users className="w-[22px] h-[22px]" style={{ color: "var(--lm-accent,#C9A96E)" }} strokeWidth={1.2} />
                    <span className="text-[14px] font-medium leading-[21px] text-[var(--lm-text,#fff)]">
                      {totalPassengers}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-[22px] h-[22px]" style={{ color: "var(--lm-accent,#C9A96E)" }} strokeWidth={1.2} />
                    <Luggage className="w-[22px] h-[22px]" style={{ color: "var(--lm-accent,#C9A96E)" }} strokeWidth={1.2} />
                    <span className="text-[14px] font-medium leading-[21px] text-[var(--lm-text,#fff)]">
                      {totalLuggage}
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4" style={{ color: "var(--lm-accent,#C9A96E)" }} strokeWidth={1.2} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              sideOffset={8}
              collisionPadding={{ top: 88, bottom: 16, left: 16, right: 16 }}
              className={cn(
                "w-80 p-0 border shadow-xl rounded-none z-50",
                dark ? "bg-[#1e1d1b] border-[rgba(255,255,255,0.12)]" : "bg-white border-[rgba(28,27,24,0.08)]"
              )}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <PassengersDropdownContent
                passengers={passengerState}
                luggage={luggageState}
                setPassengers={setPassengers}
                setLuggage={setLuggage}
                onClose={() => setShowPassengersDropdown(false)}
                dark={dark}
                translations={t}
              />
            </PopoverContent>
          </Popover>
        )}
      </motion.div>

      <motion.div layout className="flex items-center self-stretch shrink-0 w-full lg:w-auto">
        <button
          type="button"
          onClick={handleContinue}
          className="bg-[var(--lm-accent,#C9A96E)] flex items-center justify-center gap-3 px-6 py-[22px] h-full w-full lg:w-[283px] transition-all hover:brightness-95 active:scale-95 cursor-pointer"
        >
          <span className="text-[14px] font-semibold uppercase tracking-[1.1px] text-[rgba(var(--lm-bg-rgb,13,13,13),0.96)]">
            {t.continue}
          </span>
          <CircleCheckBig className="w-5 h-5 stroke-[1.2] text-[rgba(var(--lm-bg-rgb,13,13,13),0.96)]" />
        </button>
      </motion.div>
    </div>
  )
}

