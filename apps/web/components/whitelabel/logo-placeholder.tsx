import Image from "next/image"
import Link from "next/link"
import { cdn } from "@/lib/cdn"

const SANS_FONT = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
} as const

export function LogoPlaceholder({
  href = "/whitelabel",
  className,
  logoUrl,
}: {
  href?: string
  className?: string
  logoUrl?: string | null
}) {
  if (logoUrl) {
    return (
      <Link
        href={href}
        className={`inline-flex items-center justify-center h-[46px] min-w-[140px] max-w-[200px] shrink-0 ${className ?? ""}`}
      >
        <Image
          src={cdn(logoUrl)}
          alt=""
          width={200}
          height={46}
          className="h-[46px] w-auto max-w-[200px] object-contain object-left"
          unoptimized
        />
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center border border-dashed border-[#C9A96E]/70 px-4 h-[46px] min-w-[140px] shrink-0 ${className ?? ""}`}
    >
      <span
        className="text-[11px] font-medium tracking-[2.5px] uppercase text-[#C9A96E]"
        style={SANS_FONT}
      >
        LOCOMARCA
      </span>
    </Link>
  )
}
