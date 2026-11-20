"use client"

import { Link } from "@/i18n/navigation"
import { cn } from "@workspace/ui/lib/utils"

interface DestinationNavProps {
  currentSlug: string
}

const DESTINATIONS: { slug: string; label: string }[] = [
  { slug: "lisboa", label: "Lisboa" },
  { slug: "porto", label: "Porto" },
  { slug: "ericeira", label: "Ericeira" },
  { slug: "algarve", label: "Algarve" },
  { slug: "alentejo", label: "Alentejo" },
  { slug: "acores", label: "Açores" },
  { slug: "madeira", label: "Madeira" },
  { slug: "cruzeiros", label: "Cruzeiros" },
]

export function DestinationNav({ currentSlug }: DestinationNavProps) {
  return (
    <nav className="sticky top-[46px] z-30 w-full bg-[rgba(var(--lm-bg-rgb,13,13,13),0.95)] backdrop-blur-md border-b-[0.8px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.1)]">
      <div
        className="max-w-[1440px] mx-auto px-4 md:px-[60px] overflow-x-auto scrollbar-none no-scrollbar"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <ul className="flex items-start justify-start md:justify-center min-w-max">
          {DESTINATIONS.map((d) => {
            const isActive = d.slug === currentSlug
            return (
              <li key={d.slug} className="shrink-0">
                <Link
                  href={`/tours/${d.slug}`}
                  className={cn(
                    "group relative block px-[20px] md:px-[28px] pt-[16px] pb-[17.6px] text-[12px] font-semibold uppercase tracking-[1.2px] whitespace-nowrap transition-colors duration-300 ease-out",
                    isActive ? "text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]" : "text-[var(--lm-muted,#8c8680)] hover:text-[var(--lm-accent-text,var(--lm-accent,#c9a96e))]"
                  )}
                  style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                >
                  {d.label}
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute left-[20px] right-[20px] md:left-[28px] md:right-[28px] bottom-0 h-[1.6px] bg-[var(--lm-accent,#c9a96e)] origin-center transition-transform duration-300 ease-out",
                      isActive
                        ? "scale-x-100"
                        : "scale-x-0 group-hover:scale-x-100 bg-[rgba(var(--lm-accent-rgb,201,169,110),0.6)]"
                    )}
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
