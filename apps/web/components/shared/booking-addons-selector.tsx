"use client"

import { Check } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { useMoney } from "@/components/currency-provider"

const SERIF_FONT = "var(--font-title), 'Cormorant Garamond', serif"
const SANS_FONT = "var(--font-sans), system-ui, sans-serif"

export interface BookingAddon {
  _id: string
  /** Extra universal: vive noutra tabela e a reserva guarda-o noutro campo. */
  isUniversal?: boolean
  title: string
  description?: string
  imageUrl?: string | null
  price: number
  pricingType: "per_person" | "flat"
  currency: string
}

interface BookingAddonsSelectorProps {
  addons: BookingAddon[]
  selectedAddonIds: string[]
  onToggleAddon: (addonId: string) => void
  totalGuests: number
  currency: string
}

export function BookingAddonsSelector({
  addons,
  selectedAddonIds,
  onToggleAddon,
}: BookingAddonsSelectorProps) {
  const { format } = useMoney()

  if (addons.length === 0) return null

  return (
    <div className="flex flex-col gap-[6px]" style={{ fontFamily: SANS_FONT }}>
      {addons.map((addon) => {
        const isSelected = selectedAddonIds.includes(addon._id)
        const isFree = addon.price === 0

        return (
          <button
            key={addon._id}
            type="button"
            onClick={() => onToggleAddon(addon._id)}
            className={cn(
              "w-full border flex items-center gap-3 px-[15px] py-[13px] text-left transition-colors",
              isSelected
                ? "border-[rgba(201,169,110,0.5)] bg-[rgba(201,169,110,0.08)]"
                : "border-[rgba(var(--lm-accent-rgb,201,169,110),0.14)] bg-[rgba(var(--lm-text-rgb,255,255,255),0.025)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.34)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.05)]"
            )}
          >
            <div
              className={cn(
                "size-[18px] border flex items-center justify-center shrink-0 transition-colors",
                isSelected
                  ? "bg-[var(--lm-accent,#C9A96E)] border-[var(--lm-accent,#C9A96E)]"
                  : "border-[rgba(201,169,110,0.28)] bg-transparent"
              )}
            >
              {isSelected && <Check className="size-[10px] text-[#0D0D0D]" strokeWidth={2.8} />}
            </div>

            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-medium leading-normal text-[var(--lm-text,#fff)]">{addon.title}</p>
              {addon.description && (
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-[14px] text-[var(--lm-muted,#999)]">{addon.description}</p>
              )}
            </div>

            <span
              className={cn(
                "text-[17px] font-semibold shrink-0 leading-none",
                isFree ? "text-[#81c784]" : "text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
              )}
              style={{ fontFamily: SERIF_FONT }}
            >
              {isFree ? "Livre" : `+${format(addon.price)}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
