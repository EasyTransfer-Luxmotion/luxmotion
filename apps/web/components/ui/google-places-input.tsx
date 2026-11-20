"use client"

import { useRef, useState, useEffect, type RefObject } from "react"
import { MapPin, Search } from "lucide-react"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"
import { useGoogleMaps } from "@/components/providers/google-maps-provider"
import { useGoogleAutocomplete } from "@/hooks/use-google-autocomplete"
import { LocationDropdown } from "@/components/landing/booking/location-dropdown"
import type { LocationSuggestion } from "@/components/landing/booking/types"
import { Popover, PopoverContent, PopoverAnchor } from "@workspace/ui/components/popover"

export interface GooglePlaceValue {
  location: string
  placeId: string | null
  lat: number | null
  lng: number | null
}

interface GooglePlacesInputProps {
  value: GooglePlaceValue
  onChange: (next: GooglePlaceValue) => void
  placeholder?: string
  /** Shown in the iOS keyboard bar above the input; use e.g. "De onde?" so it doesn't show "home". */
  ariaLabel?: string
  className?: string
  variant?: "default" | "widget" | "new-widget" | "hero-inline" | "tours-hero" | "tours-hero-dark" | "tours-results" | "quote"
  /** When true, render suggestions inline below the input (e.g. inside a bottom drawer). Drawer closes only on selection. */
  inlineDropdown?: boolean
  hideLeftIcon?: boolean
  /** When true, applies LuxMotion dark theme (only meaningful for new-widget variant). */
  dark?: boolean
  /** When false, skip the curated airport/station default suggestions; the dropdown opens only once the user types (Google's default order). */
  showDefaultSuggestions?: boolean
  /** Force the suggestions dropdown light (false) or dark (true), overriding the per-variant default. */
  dropdownDark?: boolean
  dropdownLuxmotion?: boolean
}

/**
 * O texto que fica guardado como morada de recolha ou de destino.
 *
 * Guardava-se só o `formatted_address`, que é a morada postal e mais nada: o
 * aeroporto de Lisboa ficava "Alameda das Comunidades Portuguesas, 1700-111
 * Lisboa, Portugal". O nome do sítio — que é o que a pessoa escolheu na lista e
 * o que o motorista precisa de ler — desaparecia, e com ele a única pista de
 * que a recolha era num aeroporto.
 *
 * Numa morada de rua o `name` do Google é o princípio da própria morada ("Rua
 * das Flores 12"), por isso só se junta quando acrescenta alguma coisa.
 */
function rotularSitio(nome: string | undefined, morada: string): string {
  const n = nome?.trim()
  if (!n) return morada
  if (!morada) return n
  if (morada.toLowerCase().startsWith(n.toLowerCase())) return morada
  return `${n}, ${morada}`
}

export function GooglePlacesInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  variant = "default",
  inlineDropdown = false,
  hideLeftIcon = false,
  dark = false,
  showDefaultSuggestions = true,
  dropdownDark,
  dropdownLuxmotion,
}: GooglePlacesInputProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [defaultSuggestions, setDefaultSuggestions] = useState<LocationSuggestion[]>([])
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { isLoaded, hasKey } = useGoogleMaps()
  const { predictions, isLoading, fetchPredictions, getPlaceDetails, getDefaultSuggestions } = useGoogleAutocomplete()

  // In the booking bar, anchor the dropdown to the whole field cell (.booking-section)
  // instead of the small input, so it opens cleanly above/below the bar and never
  // overlaps the field — exactly like the passengers popover. Falls back to the input
  // anchor anywhere there's no .booking-section (checkout, tours, quote, …).
  const cellAnchorRef = useRef<HTMLElement | null>(null)
  const [hasCellAnchor, setHasCellAnchor] = useState(false)
  useEffect(() => {
    const cell = containerRef.current?.closest<HTMLElement>(".booking-section") ?? null
    cellAnchorRef.current = cell
    setHasCellAnchor(!!cell)
  }, [])

  // In drawer (inlineDropdown): show suggestions as soon as the drawer opens, without needing to focus the input
  useEffect(() => {
    if (inlineDropdown) setShowDropdown(true)
  }, [inlineDropdown])

  // Load default suggestions when Google Maps is loaded (skipped when showDefaultSuggestions is false)
  useEffect(() => {
    if (isLoaded && hasKey && showDefaultSuggestions && defaultSuggestions.length === 0 && !isLoadingDefaults) {
      setIsLoadingDefaults(true)
      getDefaultSuggestions().then((suggestions) => {
        setDefaultSuggestions(suggestions)
        setIsLoadingDefaults(false)
      })
    }
  }, [isLoaded, hasKey, showDefaultSuggestions, getDefaultSuggestions, defaultSuggestions.length, isLoadingDefaults])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    onChange({ location: val, placeId: null, lat: null, lng: null })

    if (val.trim()) {
      fetchPredictions(val)
      setShowDropdown(true)
    } else {
      setShowDropdown(inlineDropdown)
    }
  }

  const handleSelectSuggestion = async (suggestion: LocationSuggestion) => {
    setShowDropdown(false)
    if (suggestion.placeId) {
      const details = await getPlaceDetails(suggestion.placeId)
      if (details) {
        onChange({
          location: rotularSitio(details.name, details.address) || suggestion.name,
          placeId: suggestion.placeId,
          lat: details.lat,
          lng: details.lng,
        })
      } else {
        onChange({
          location: suggestion.name,
          placeId: suggestion.placeId,
          lat: null,
          lng: null,
        })
      }
    } else {
      onChange({
        location: suggestion.name,
        placeId: null,
        lat: null,
        lng: null,
      })
    }
  }

  const isWidget = variant === "widget"
  const isNewWidget = variant === "new-widget"
  const isHeroInline = variant === "hero-inline"
  const isToursHero = variant === "tours-hero"
  const isToursHeroDark = variant === "tours-hero-dark"
  const isToursResults = variant === "tours-results"
  const isQuote = variant === "quote"

  const hasInput = value.location.trim().length > 0
  // When defaults are disabled (e.g. tours search), only open the dropdown once the user types —
  // avoids an empty "No locations found" box appearing on focus.
  const dropdownOpen = showDropdown && (showDefaultSuggestions || hasInput)

  const triggerInput = (
    <div className="relative w-full h-full flex items-center">
      {isHeroInline ? (
        <input
          suppressHydrationWarning
          value={value.location}
          onChange={handleInputChange}
          onFocus={() => {
            if (value.location.trim()) {
              fetchPredictions(value.location)
            }
            setShowDropdown(true)
          }}
          placeholder={placeholder}
          className={cn(
            "w-full h-full pl-8 pr-4 bg-transparent border-0 focus:outline-none focus:ring-0 text-[14px] font-normal placeholder:text-[var(--lm-muted,#696969)]",
            !inlineDropdown && "truncate"
          )}
          style={{
            color: "var(--lm-text,#fff)",
            caretColor: "var(--lm-accent,#C9A96E)"
          }}
        />
      ) : isToursResults ? (
        <div className="w-full h-full relative flex items-center gap-[12px]">
          <Search className="w-[24px] h-[24px] text-[#a2a2a2] shrink-0" />
          <input
            suppressHydrationWarning
            value={value.location}
            onChange={handleInputChange}
            onFocus={() => {
              if (value.location.trim()) {
                fetchPredictions(value.location)
              }
              setShowDropdown(true)
            }}
            placeholder={placeholder}
            className="flex-1 text-[16px] text-[#222] placeholder:text-[#a2a2a2] font-normal outline-none bg-transparent"
          />
        </div>
      ) : isQuote ? (
        <div className="w-full h-[44px] relative flex items-center bg-[#faf7f2] border border-[rgba(154,117,53,0.22)] focus-within:border-[#a08248] transition-colors">
          {!hideLeftIcon && (
            <MapPin className="w-4 h-4 text-[#a08248] shrink-0 ml-3" strokeWidth={2} />
          )}
          <input
            suppressHydrationWarning
            value={value.location}
            onChange={handleInputChange}
            onFocus={() => {
              if (value.location.trim()) {
                fetchPredictions(value.location)
              }
              setShowDropdown(true)
            }}
            placeholder={placeholder}
            className={cn(
              "flex-1 min-w-0 h-full bg-transparent border-0 focus:outline-none focus:ring-0 text-[14px] text-[#0d0d0d] placeholder:text-[var(--lm-muted,#999)] leading-none",
              hideLeftIcon ? "px-3" : "pl-2 pr-3",
            )}
          />
        </div>
      ) : isToursHeroDark ? (
        <div className={cn(
          "w-full h-full relative flex items-center gap-2 pr-[12px]",
          // Sem ícone (checkout), o pl-[13px] era só o espaço da lupa e deixava
          // o texto ~25px indentado face ao label. Encosta à esquerda (o box já
          // dá o padding). Com ícone (tours hero) mantém-se o espaço da lupa.
          hideLeftIcon ? "pl-0" : "pl-[13px]",
        )}>
          {!hideLeftIcon && <Search className="w-[24px] h-[24px] text-[var(--lm-accent,#C9A96E)] shrink-0" />}
          <input
            suppressHydrationWarning
            value={value.location}
            onChange={handleInputChange}
            onFocus={() => {
              if (value.location.trim()) {
                fetchPredictions(value.location)
              }
              setShowDropdown(true)
            }}
            placeholder={placeholder}
            /* Tokens do checkout: em light mode o texto e o placeholder passam
               a escuro em vez de branco. No tours-hero (sem .checkout-theme) os
               fallbacks mantêm o aspeto claro sobre fundo escuro. */
            className="flex-1 min-w-0 w-full text-[13px] text-[var(--ck-text,#f7f4ef)] placeholder:text-[var(--ck-text-subtle,#696969)] font-normal outline-none bg-transparent"
            style={{ caretColor: "var(--ck-accent,#c9a96e)" }}
          />
        </div>
      ) : isToursHero ? (
        <div className="w-full h-full relative flex items-center">
          <MapPin className="w-[24px] h-[24px] text-[#a2a2a2] shrink-0" />
          <input
            suppressHydrationWarning
            value={value.location}
            onChange={handleInputChange}
            onFocus={() => {
              if (value.location.trim()) {
                fetchPredictions(value.location)
              }
              setShowDropdown(true)
            }}
            placeholder={placeholder}
            className="flex-1 ml-[9px] text-[14px] text-[#222] placeholder:text-[#a2a2a2] font-normal outline-none bg-transparent"
          />
        </div>
      ) : isNewWidget ? (
        <div
          className={cn(
            "w-full min-h-[52px] rounded-xl flex items-center gap-3 pl-4 pr-4 py-2 border transition-colors",
            dark
              ? "bg-[var(--lm-bg,#0D0D0D)] border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] focus-within:border-[var(--lm-accent,#C9A96E)] focus-within:ring-2 focus-within:ring-[var(--lm-accent,#C9A96E)]/20"
              : "bg-white border-[#e0e0e0] focus-within:border-[#a08248] focus-within:ring-2 focus-within:ring-[#a08248]/20"
          )}
        >
          <Search className={cn("w-5 h-5 shrink-0", dark ? "text-[var(--lm-accent,#C9A96E)]" : "text-[#a2a2a2]")} aria-hidden />
          <input
            suppressHydrationWarning
            value={value.location}
            onChange={handleInputChange}
            onFocus={() => {
              if (value.location.trim()) {
                fetchPredictions(value.location)
                setShowDropdown(true)
              } else {
                setShowDropdown(true)
              }
            }}
            placeholder={placeholder}
            autoFocus={inlineDropdown}
            aria-label={ariaLabel}
            className={cn(
              "flex-1 min-w-0 bg-transparent border-0 focus:outline-none focus:ring-0 font-medium leading-[1.4]",
              dark ? "placeholder:text-[var(--lm-muted,#696969)]" : "placeholder:text-[#808080]",
              inlineDropdown ? "text-[16px]" : "text-[14px] md:text-[15px]",
              !inlineDropdown && "truncate"
            )}
            style={{
              color: dark ? "white" : "#222",
              caretColor: dark ? "var(--lm-accent,#C9A96E)" : "#a08248"
            }}
          />
        </div>
      ) : isWidget ? (
        <input
          suppressHydrationWarning
          value={value.location}
          onChange={handleInputChange}
          onFocus={() => {
            if (value.location.trim()) {
              fetchPredictions(value.location)
              setShowDropdown(true)
            }
          }}
          placeholder={placeholder}
          className="w-full h-full pl-12 pr-4 py-4 md:py-3 bg-transparent border-0 focus:outline-none focus:ring-0 text-sm font-medium"
          style={{
            color: "var(--theme-hero-booking-input-text, var(--lm-surface,#1A1A1A))",
            caretColor: "var(--theme-hero-booking-accent, #27C7FF)"
          }}
        />
      ) : (
        <div className="relative w-full">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bfbfbf] z-10">
            <MapPin className="w-5 h-5" />
          </div>
          <Input
            suppressHydrationWarning
            value={value.location}
            onChange={handleInputChange}
            onFocus={() => {
              if (value.location.trim()) {
                fetchPredictions(value.location)
                setShowDropdown(true)
              } else {
                // Show default suggestions when field is empty and focused
                setShowDropdown(true)
              }
            }}
            placeholder={placeholder}
            className="pl-10 h-12 border-[#e0e0e0] text-[#222222] placeholder:text-[#a2a2a2] focus-visible:ring-[#27c7ff] w-full"
          />
        </div>
      )}
    </div>
  )

  if (!hasKey || !isLoaded) {
    return <div className={cn("relative w-full", className)}>{triggerInput}</div>
  }

  if (inlineDropdown) {
    return (
      <div
        className={cn("relative flex flex-col min-h-0 flex-1", className)}
        ref={containerRef}
      >
        <div className="relative w-full shrink-0">{triggerInput}</div>
        {dropdownOpen && (
          <div className="relative w-full mt-2 flex-1 min-h-[200px] overflow-hidden flex flex-col">
            <LocationDropdown
              inline
              dark={dropdownDark ?? dark}
              luxmotion={dropdownLuxmotion}
              suggestions={value.location.trim() ? predictions : defaultSuggestions}
              isLoading={value.location.trim() ? isLoading : isLoadingDefaults}
              onSelect={handleSelectSuggestion}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div 
      className={cn(
        "relative h-full w-full",
        showDropdown && "z-[100]",
        className
      )} 
      ref={containerRef}
    >
      <Popover open={dropdownOpen} onOpenChange={setShowDropdown}>
        {hasCellAnchor ? (
          <>
            <PopoverAnchor virtualRef={cellAnchorRef as unknown as RefObject<Element>} />
            {triggerInput}
          </>
        ) : (
          <PopoverAnchor asChild>{triggerInput}</PopoverAnchor>
        )}
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={isToursHeroDark ? 0 : 8}
          collisionPadding={{ top: 88, bottom: 16, left: 16, right: 16 }}
          className="p-0 border-none bg-transparent shadow-none w-[var(--radix-popover-trigger-width)] min-w-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <LocationDropdown
            suggestions={value.location.trim() ? predictions : defaultSuggestions}
            isLoading={value.location.trim() ? isLoading : isLoadingDefaults}
            onSelect={handleSelectSuggestion}
            dark={dropdownDark ?? (isHeroInline || isToursHeroDark)}
            luxmotion={isQuote || dropdownLuxmotion}
            popover
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

