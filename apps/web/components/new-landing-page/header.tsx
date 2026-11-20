"use client"

import { Link } from "@/i18n/navigation"
import Image from "next/image"
import { useState, useEffect, useRef, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import {
  usePathname as useIntlPathname,
  useRouter as useIntlRouter,
} from "@/i18n/navigation"
import { ChevronDown, Menu, X, Check } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { useLocale } from "next-intl"
import { locales, localeNames, localeCountryIso, type Locale } from "@/i18n/config"
import { FlagImage } from "react-international-phone"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { LogoPlaceholder } from "@/components/whitelabel/logo-placeholder"
import { getHeaderLinks } from "./header-links"

const HERO_SCROLL_THRESHOLD = 320
const MOBILE_MAX_WIDTH = 767

export type HeaderVariant = "dark" | "light"

export interface HeaderProps {
  transparentOverHero?: boolean
  transparentOverHeroMobileOnly?: boolean
  heroScrollThreshold?: number
  variant?: HeaderVariant
  whitelabel?: boolean
  logoUrl?: string | null
  themeToggle?: ReactNode
  /** Destination for the "Reserve" CTA. Defaults to the main-site checkout.
   *  On a partner page pass `/${slug}/checkout` so the reservation attributes. */
  reserveHref?: string
}

function LuxMotionLogo({ className, variant = "dark" }: { className?: string; variant?: HeaderVariant }) {
  const isLight = variant === "light"
  return (
    <Link href="/" className={cn("flex items-center gap-[10px] shrink-0", className)}>
      <div className="relative w-[45px] h-[45px] md:w-[46px] md:h-[46px] border-[1.9px] border-[#C9A96E] flex items-center justify-center shrink-0">
        <div className="relative w-[23px] h-[13px]">
          <Image
            src="/shared/icons/lm-monogram.svg"
            alt=""
            fill
            className="object-contain"
            priority
          />
        </div>
      </div>
      <div className="flex flex-col justify-center">
        <div className="relative w-[120px] h-[13px]">
          <Image
            src="/shared/icons/luxmotion-text.svg"
            alt="LuxMotion"
            fill
            className="object-contain object-left"
            style={isLight ? { filter: "brightness(0)" } : undefined}
            priority
          />
        </div>
        <span className={cn("text-[10px] tracking-[1.4px] mt-[4px] whitespace-nowrap", isLight ? "text-[#6e6862]" : "text-[#999]")}>
          BY EASYTRANSFER
        </span>
      </div>
    </Link>
  )
}

function LangSwitcher({ variant = "dark" }: { variant?: HeaderVariant }) {
  const locale = useLocale() as Locale
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isLight = variant === "light"
  const router = useIntlRouter()
  const localePathname = useIntlPathname()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleChange = (newLocale: Locale) => {
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`
    setIsOpen(false)
    // O mesmo caminho, no prefixo do novo idioma.
    router.replace(localePathname, { locale: newLocale })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-[4px] h-[40px] px-[9px] border border-[rgba(201,169,110,0.22)] transition-colors hover:border-[rgba(201,169,110,0.4)] cursor-pointer"
      >
        <FlagImage iso2={localeCountryIso[locale]} size={20} className="rounded-[2px]" />
        <span className={cn(
          "text-[14px] font-medium tracking-[0.15px]",
          isLight ? "text-[#7a6230]" : "text-[#C9A96E]"
        )}>
          {locale.toUpperCase()}
        </span>
        <ChevronDown className={cn(
          "w-[13px] h-[13px] transition-transform",
          isLight ? "text-[#7a6230]" : "text-[#C9A96E]",
          isOpen && "rotate-180"
        )} />
      </button>
      {isOpen && (
        <div className={cn(
          "absolute top-full mt-1 right-0 shadow-xl py-1 min-w-[180px] z-50 animate-in fade-in slide-in-from-top-2 duration-200",
          isLight
            ? "bg-white border border-[rgba(28,27,24,0.08)]"
            : "bg-[#1A1A1A] border border-[#2A2A2A]"
        )}>
          {locales.map((loc) => (
            <button
              key={loc}
              onClick={() => handleChange(loc)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 transition-colors",
                isLight
                  ? "text-[#68625c] hover:text-[#7a6230] hover:bg-black/[0.03]"
                  : "text-[#8C8680] hover:text-[#C9A96E] hover:bg-white/5",
                loc === locale && (isLight ? "text-[#A08248] bg-black/[0.03]" : "text-[#C9A96E] bg-white/5")
              )}
            >
              <FlagImage iso2={localeCountryIso[loc]} size={20} />
              <span className="flex-1 text-left text-sm font-medium">{localeNames[loc]}</span>
              {loc === locale && <Check className={cn("w-4 h-4", isLight ? "text-[#7a6230]" : "text-[#C9A96E]")} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Header({
  transparentOverHero = false,
  transparentOverHeroMobileOnly = false,
  heroScrollThreshold = HERO_SCROLL_THRESHOLD,
  variant = "dark",
  whitelabel = false,
  logoUrl,
  themeToggle,
  // O checkout precisa de uma viagem já escolhida — mandar para lá a partir de
  // outra página abre um checkout vazio. O destino certo é o widget de reserva
  // na home, onde a viagem é definida.
  reserveHref = "/#booking",
}: HeaderProps = {}) {
  const isLight = variant === "light"
  const t = useTranslations("header")
  const pathname = usePathname()
  // O "Reserve" por defeito aponta para o widget de reserva na home (#booking).
  // Vindo de OUTRA página, queremos aterrar no topo da home (não com scroll até
  // ao #booking), por isso largamos o hash fora da home. Overrides de parceiro
  // (ex.: /slug/checkout) ficam intactos.
  const effectiveReserveHref =
    reserveHref === "/#booking" && pathname !== "/" ? "/" : reserveHref
  const [isScrolled, setIsScrolled] = useState(false)
  const [overHero, setOverHero] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileExpandedDropdown, setMobileExpandedDropdown] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const isTransparent =
    transparentOverHero &&
    overHero &&
    (!transparentOverHeroMobileOnly || isMobile)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`)
    const setMobileState = () => setIsMobile(mq.matches)
    setMobileState()
    mq.addEventListener("change", setMobileState)
    return () => mq.removeEventListener("change", setMobileState)
  }, [])

  useEffect(() => {
    setMounted(true)

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
      if (transparentOverHero) {
        setOverHero(window.scrollY < heroScrollThreshold)
      }
    }

    const sectionIds = ["about", "booking"]
    const observers: IntersectionObserver[] = []

    sectionIds.forEach((id) => {
      const element = document.getElementById(id)
      if (element) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) setActiveSection(id)
            })
          },
          { threshold: 0.3, rootMargin: "-80px 0px -50% 0px" }
        )
        observer.observe(element)
        observers.push(observer)
      }
    })

    const handleScrollTop = () => {
      if (window.scrollY < 100) setActiveSection(null)
    }

    if (transparentOverHero) {
      setOverHero(window.scrollY < heroScrollThreshold)
    }
    window.addEventListener("scroll", handleScroll)
    window.addEventListener("scroll", handleScrollTop)

    return () => {
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("scroll", handleScrollTop)
      observers.forEach((o) => o.disconnect())
    }
  }, [transparentOverHero, heroScrollThreshold])

  const isActive = (href: string, hasDropdown?: boolean, items?: { href: string }[]) => {
    if (hasDropdown && items) return items.some(item => pathname === item.href || pathname.startsWith(item.href + "/"))
    if (href === "/") return pathname === "/" && !activeSection
    if (href.startsWith("/#")) return pathname === "/" && activeSection === href.slice(2)
    return pathname === href || pathname.startsWith(href + "/")
  }

  const navLinks = getHeaderLinks(t)

  const linkClasses = (href: string, hasDropdown?: boolean, items?: { href: string }[]) =>
    cn(
      "text-[12px] font-medium uppercase tracking-[1.28px] transition-colors whitespace-nowrap",
      isActive(href || "", hasDropdown, items)
        ? isLight ? "text-[#7a6230]" : "text-[#C9A96E]"
        : isLight ? "text-[#68625c] hover:text-[#7a6230]" : "text-[#8C8680] hover:text-[#C9A96E]"
    )

  return (
    <>
      <header
        className={cn(
          "fixed top-[calc(var(--promo-h,0px)_+_var(--tours-bar-h,0px))] left-0 right-0 z-50 transition-all duration-300",
          isTransparent
            ? "bg-transparent"
            : isLight
              ? "bg-[rgba(240,237,232,0.96)] backdrop-blur-[10px] border-b border-[rgba(201,169,110,0.1)]"
              : "bg-[rgba(13,13,13,0.96)] backdrop-blur-[10px] border-b border-[rgba(201,169,110,0.1)]",
          !isTransparent && isScrolled && (isLight ? "shadow-[0_1px_20px_rgba(0,0,0,0.06)]" : "shadow-[0_1px_20px_rgba(0,0,0,0.3)]")
        )}
      >
        <div className="max-w-[1440px] mx-auto px-4 md:px-[48px] flex items-center justify-between h-[60px] md:h-[72px]">
          {whitelabel ? <LogoPlaceholder logoUrl={logoUrl} /> : <LuxMotionLogo variant={variant} />}

          <nav className="hidden xl:flex items-center gap-[18px]">
            {navLinks.map((link) =>
              link.hasDropdown && mounted ? (
                <DropdownMenu key={link.label} modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button className={cn(linkClasses(link.href || "", link.hasDropdown, link.items), "flex items-center gap-[8px] outline-none cursor-pointer")}>
                      {link.label}
                      <ChevronDown className="w-[13px] h-[13px]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className={cn(
                      "shadow-xl rounded-none p-1.5 min-w-[200px]",
                      isLight ? "bg-white border-[rgba(28,27,24,0.08)]" : "bg-[#1A1A1A] border-[#2A2A2A]"
                    )}
                  >
                    {link.items?.map((item) => (
                      <DropdownMenuItem
                        key={item.label}
                        asChild
                        className={cn(
                          "rounded-none text-[12px] uppercase tracking-[1px]",
                          isLight
                            ? "text-[#68625c] focus:text-[#7a6230] focus:bg-black/[0.03]"
                            : "text-[#8C8680] focus:text-[#C9A96E] focus:bg-white/5"
                        )}
                      >
                        {item.href.startsWith("http") ? (
                          <a href={item.href} target="_blank" rel="noopener noreferrer" className="w-full block">
                            {item.label}
                          </a>
                        ) : (
                          <Link href={item.href} className="w-full">
                            {item.label}
                          </Link>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : link.hasDropdown ? (
                <button
                  key={link.label}
                  className={cn(linkClasses(link.href || "", link.hasDropdown, link.items), "flex items-center gap-[8px] outline-none cursor-pointer")}
                >
                  {link.label}
                  <ChevronDown className="w-[13px] h-[13px]" />
                </button>
              ) : (
                <Link
                  key={link.label}
                  href={link.href || "/"}
                  className={linkClasses(link.href || "")}
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>

          <div className="hidden xl:flex items-center gap-[8px]">
            {themeToggle}
            <LangSwitcher variant={variant} />
            <Link
              href={effectiveReserveHref}
              className={cn(
                "h-[40px] px-[22px] flex items-center justify-center text-[14px] font-medium uppercase tracking-[1.1px] transition-all cursor-pointer",
                isLight
                  ? "bg-[#A08248] text-white hover:bg-[#8a6f3c]"
                  : "border border-[#C9A96E] text-[#C9A96E] hover:bg-[#C9A96E] hover:text-[#0D0D0D]"
              )}
            >
              {t("reserve")}
            </Link>
          </div>

          <div className="xl:hidden flex items-center gap-[8px]">
            {themeToggle}
            <LangSwitcher variant={variant} />
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex items-center justify-center size-[40px] border border-[rgba(201,169,110,0.22)] text-[#8C8680] hover:text-[#C9A96E] transition-colors cursor-pointer"
            >
              <Menu className="w-[16px] h-[16px]" />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "fixed inset-0 z-[100] xl:hidden transition-all duration-300",
            mobileMenuOpen ? "visible" : "invisible"
          )}
        >
          <div
            className={cn(
              "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
              mobileMenuOpen ? "opacity-100" : "opacity-0"
            )}
            onClick={() => { setMobileMenuOpen(false); setMobileExpandedDropdown(null) }}
          />

          <div
            className={cn(
              "absolute left-0 right-0 top-0 shadow-2xl transition-transform duration-300 flex flex-col max-h-[90vh] overflow-y-auto border-b border-[rgba(201,169,110,0.1)]",
              isLight ? "bg-[#F0EDE8]" : "bg-[#0D0D0D]",
              mobileMenuOpen ? "translate-y-0" : "-translate-y-full"
            )}
          >
            <div className={cn(
              "px-4 h-[60px] flex items-center justify-between border-b sticky top-0 z-10 shrink-0",
              isLight ? "bg-[#F0EDE8] border-[rgba(28,27,24,0.08)]" : "bg-[#0D0D0D] border-[#2A2A2A]"
            )}>
              {whitelabel ? <LogoPlaceholder logoUrl={logoUrl} /> : <LuxMotionLogo variant={variant} />}
              <button
                onClick={() => { setMobileMenuOpen(false); setMobileExpandedDropdown(null) }}
                className={cn(
                  "p-2 -m-2 transition-colors cursor-pointer",
                  isLight ? "text-[#68625c] hover:text-[#7a6230]" : "text-[#8C8680] hover:text-[#C9A96E]"
                )}
                aria-label="Close menu"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="flex-1 p-4 pb-2 overflow-y-auto min-h-0">
              <ul className="space-y-0">
                {navLinks.map((link) => (
                  <li key={link.label}>
                    {link.hasDropdown ? (
                      <div className={cn(
                        "border-b last:border-b-0",
                        isLight ? "border-[rgba(28,27,24,0.08)]" : "border-[#2A2A2A]"
                      )}>
                        <button
                          type="button"
                          onClick={() => setMobileExpandedDropdown((prev) => (prev === link.label ? null : link.label))}
                          className={cn(
                            "flex items-center justify-between w-full py-3 text-[13px] font-medium uppercase tracking-[1.28px] transition-colors text-left cursor-pointer",
                            mobileExpandedDropdown === link.label
                              ? (isLight ? "text-[#7a6230]" : "text-[#C9A96E]")
                              : "text-[#8C8680]"
                          )}
                          aria-expanded={mobileExpandedDropdown === link.label}
                        >
                          <span>{link.label}</span>
                          <ChevronDown
                            className={cn(
                              "w-5 h-5 shrink-0 transition-transform duration-200",
                              mobileExpandedDropdown === link.label && "rotate-180"
                            )}
                          />
                        </button>
                        <div
                          className={cn(
                            "overflow-hidden transition-all duration-200 ease-out",
                            mobileExpandedDropdown === link.label ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                          )}
                        >
                          <ul className={cn(
                            "pl-3 pb-3 space-y-0 border-l-2 ml-2",
                            isLight ? "border-[#A08248]/30" : "border-[#C9A96E]/20"
                          )}>
                            {link.items?.map((item) => (
                              <li key={item.label}>
                                {item.href.startsWith("http") ? (
                                  <a
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      "block py-2 text-[12px] uppercase tracking-[1px]",
                                      isLight
                                        ? "text-[#68625c] hover:text-[#7a6230] active:text-[#A08248]"
                                        : "text-[#666] hover:text-[#C9A96E] active:text-[#C9A96E]"
                                    )}
                                    onClick={() => setMobileMenuOpen(false)}
                                  >
                                    {item.label}
                                  </a>
                                ) : (
                                  <Link
                                    href={item.href}
                                    className={cn(
                                      "block py-2 text-[12px] uppercase tracking-[1px] transition-colors",
                                      isActive(item.href)
                                        ? (isLight ? "text-[#A08248] font-medium" : "text-[#C9A96E] font-medium")
                                        : (isLight ? "text-[#68625c] hover:text-[#7a6230]" : "text-[#666] hover:text-[#C9A96E]")
                                    )}
                                    onClick={() => setMobileMenuOpen(false)}
                                  >
                                    {item.label}
                                  </Link>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <Link
                        href={link.href || "/"}
                        className={cn(
                          "block py-3 text-[13px] font-medium uppercase tracking-[1.28px] border-b transition-colors last:border-b-0",
                          isLight ? "border-[rgba(28,27,24,0.08)]" : "border-[#2A2A2A]",
                          isActive(link.href || "")
                            ? (isLight ? "text-[#7a6230]" : "text-[#C9A96E]")
                            : (isLight ? "text-[#68625c] active:text-[#7a6230]" : "text-[#8C8680] active:text-[#C9A96E]")
                        )}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>

            <div className={cn(
              "p-4 border-t sticky bottom-0 shrink-0",
              isLight ? "bg-[#F0EDE8] border-[rgba(28,27,24,0.08)]" : "bg-[#0D0D0D] border-[#2A2A2A]"
            )}>
              <Link
                href={effectiveReserveHref}
                className={cn(
                  "w-full h-12 flex items-center justify-center font-medium text-[14px] uppercase tracking-[1.1px] active:scale-[0.98] transition-all",
                  isLight
                    ? "bg-[#A08248] text-white hover:bg-[#8a6f3c]"
                    : "border border-[#C9A96E] text-[#C9A96E] hover:bg-[#C9A96E] hover:text-[#0D0D0D]"
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                {t("reserve")}
              </Link>
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
