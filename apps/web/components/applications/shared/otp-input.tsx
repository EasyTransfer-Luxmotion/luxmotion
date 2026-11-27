"use client"

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react"
import { cn } from "@workspace/ui/lib/utils"

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  length?: number
  groupSize?: number
  cellClassName?: string
  ariaLabel?: string
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  groupSize = 3,
  cellClassName,
  ariaLabel,
}: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  const digits = Array.from({ length }, (_, i) => value[i] ?? "")

  function setDigit(index: number, digit: string) {
    const next = digits.slice()
    next[index] = digit
    onChange(next.join(""))
  }

  function focusCell(index: number) {
    const target = inputsRef.current[index]
    if (target) target.focus()
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "")
    if (!cleaned) {
      setDigit(index, "")
      return
    }
    if (cleaned.length === 1) {
      setDigit(index, cleaned)
      if (index < length - 1) focusCell(index + 1)
      return
    }
    distribute(cleaned, index)
  }

  function distribute(text: string, startIndex: number) {
    const next = digits.slice()
    let cursor = startIndex
    for (const char of text) {
      if (cursor >= length) break
      next[cursor] = char
      cursor++
    }
    onChange(next.join(""))
    const nextFocus = Math.min(cursor, length - 1)
    setTimeout(() => focusCell(nextFocus), 0)
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        setDigit(index, "")
        return
      }
      if (index > 0) {
        e.preventDefault()
        setDigit(index - 1, "")
        focusCell(index - 1)
      }
      return
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault()
      focusCell(index - 1)
    }
    if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault()
      focusCell(index + 1)
    }
  }

  function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "")
    if (!text) return
    e.preventDefault()
    distribute(text, index)
  }

  const groups: number[][] = []
  for (let i = 0; i < length; i += groupSize) {
    groups.push(Array.from({ length: Math.min(groupSize, length - i) }, (_, k) => i + k))
  }

  return (
    <div
      className="flex items-center justify-center gap-2 h-[44px] w-full"
      role="group"
      aria-label={ariaLabel}
    >
      {groups.map((group, gIdx) => (
        <div key={gIdx} className="flex items-center gap-1">
          {gIdx > 0 ? (
            <span className="w-6 h-px bg-[rgba(28,27,24,0.18)]" aria-hidden />
          ) : null}
          {group.map((idx) => (
            <input
              key={idx}
              ref={(el) => {
                inputsRef.current[idx] = el
              }}
              value={digits[idx]}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={(e) => handlePaste(idx, e)}
              onFocus={(e) => e.target.select()}
              type="text"
              inputMode="numeric"
              autoComplete={idx === 0 ? "one-time-code" : "off"}
              /* The first cell takes the whole code: an SMS/email autofill
                 writes it all into the cell with one-time-code, and a
                 maxLength of 1 cut it to the first digit before distribute()
                 could spread it. The others take one digit. */
              maxLength={idx === 0 ? length : 1}
              aria-label={`Digit ${idx + 1}`}
              className={cn(
                "w-[40px] h-[44px] bg-white border border-[rgba(28,27,24,0.08)] text-center text-[16px] font-medium text-[#1c1b18] focus:outline-none focus:border-[#a08248] transition-colors",
                cellClassName,
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
