"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const

export type SelectOption = { value: string; label: string }

export function PartnerSelect({
  value,
  onChange,
  options,
  placeholder,
  icon,
  triggerClassName = "",
  ariaLabel,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  icon?: React.ReactNode
  triggerClassName?: string
  ariaLabel?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[rgba(var(--lm-accent-rgb,201,169,110),0.7)]">
          {icon}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 text-left outline-none transition-colors ${
          open ? "border-[var(--lm-accent,#C9A96E)]" : ""
        } ${triggerClassName}`}
        style={sans}
      >
        <span className={`truncate ${selected ? "text-[var(--lm-text,#fff)]" : "text-[rgba(var(--lm-text-rgb,255,255,255),0.3)]"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[rgba(var(--lm-text-rgb,255,255,255),0.4)] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[260px] overflow-y-auto border border-[rgba(var(--lm-accent-rgb,201,169,110),0.25)] bg-[var(--lm-surface,#1a1611)] p-1.5 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.85)]"
          style={sans}
        >
          {options.map((o) => {
            const active = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[14px] transition-colors ${
                  active
                    ? "bg-[rgba(var(--lm-accent-rgb,201,169,110),0.14)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
                    : "text-[var(--lm-muted,#d8d3c8)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] hover:text-[var(--lm-text,#fff)]"
                }`}
              >
                <Check
                  className={`h-4 w-4 shrink-0 text-[var(--lm-accent,#C9A96E)] ${active ? "opacity-100" : "opacity-0"}`}
                  strokeWidth={2.2}
                />
                <span className="truncate">{o.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
