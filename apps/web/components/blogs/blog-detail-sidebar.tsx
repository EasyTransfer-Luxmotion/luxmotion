"use client"

import { Link } from "@/i18n/navigation"
import Image from "next/image"
import { Calendar } from "lucide-react"
import { useTranslations } from "next-intl"

const SERIF_FONT = {
  fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
}

const CTA_BG_STYLE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(ellipse at 50% -40%, rgba(201,169,110,0.18), rgba(201,169,110,0) 60%), linear-gradient(154deg, #0A0F14 0%, #0D1810 100%)",
}

export interface SidebarRelatedItem {
  id: string
  slug: string
  image: string
  category: string
  title: string
  date: string
  readTimeMinutes?: number
}

export interface SidebarAuthor {
  name: string
  role?: string
  bio?: string
  avatarUrl?: string | null
}

interface BlogDetailSidebarProps {
  author: SidebarAuthor
  related: SidebarRelatedItem[]
  bookHref?: string
  className?: string
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

function AuthorCard({ author }: { author: SidebarAuthor }) {
  const t = useTranslations("blogArticle")
  const role = author.role ?? t("authorRoleFallback")
  const bio = author.bio ?? t("authorBioFallback")

  return (
    <div className="bg-[var(--lm-surface,#141414)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex flex-col items-center px-[20.8px] py-[24.8px] w-full">
      <div className="bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] relative rounded-full size-16 overflow-hidden mb-3">
        {author.avatarUrl ? (
          <Image
            src={author.avatarUrl}
            alt={author.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] text-[18px] font-semibold leading-none">
              {getInitials(author.name) || "•"}
            </span>
          </div>
        )}
      </div>
      <p
        className="text-[var(--lm-text,#fff)] text-[18px] leading-none mb-[3px] text-center"
        style={SERIF_FONT}
      >
        {author.name}
      </p>
      <p className="text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] text-[12px] font-semibold tracking-[0.8px] text-center mb-[10px]">
        {role}
      </p>
      <p className="text-[var(--lm-muted,#999)] text-[12px] leading-[1.2] text-center px-1">
        {bio}
      </p>
    </div>
  )
}

// Mesmo motivo do RESERVE no header: o checkout sem viagem escolhida fica vazio.
// Painel deliberadamente escuro nos dois temas (CTA_BG_STYLE), por isso as cores
// aqui dentro ficam fixas — não seguem os tokens --lm-*.
function BookCtaCard({ bookHref = "/#booking" }: { bookHref?: string }) {
  const t = useTranslations("blogArticle.bookCta")

  return (
    <div
      className="border border-[rgba(201,169,110,0.2)] flex flex-col gap-[7.4px] items-stretch overflow-hidden p-[22.8px] w-full"
      style={CTA_BG_STYLE}
    >
      <h3
        className="text-[24px] text-white font-light leading-none"
        style={SERIF_FONT}
      >
        {t("title")}{" "}
        <span className="italic text-[#C9A96E]" style={SERIF_FONT}>
          {t("accent")}
        </span>
      </h3>
      <p className="text-[12px] text-[rgba(255,255,255,0.5)] leading-[18.15px] pb-[8.6px]">
        {t("subtitle")}
      </p>
      <Link
        href={bookHref}
        className="bg-[#C9A96E] hover:bg-[#b89558] border border-[#C9A96E] hover:border-[#b89558] h-12 flex items-center justify-center gap-2 px-[22px] transition-colors"
      >
        <span className="text-[#0D0D0D] text-[14px] font-medium tracking-[1.1px] uppercase">
          {t("button")}
        </span>
        <Calendar className="size-[18px] text-[#0D0D0D]" strokeWidth={1.5} />
      </Link>
    </div>
  )
}

function RelatedCard({ items }: { items: SidebarRelatedItem[] }) {
  const t = useTranslations("blogArticle")
  const tShort = useTranslations("blogArticle")

  if (items.length === 0) return null

  return (
    <div className="bg-[var(--lm-surface,#141414)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex flex-col gap-[14px] items-stretch p-[20.8px] w-full">
      <div className="border-b-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] pb-[10.8px]">
        <span className="text-[12px] font-semibold uppercase tracking-[1.62px] text-[var(--lm-muted,#999)]">
          {t("relatedArticles")}
        </span>
      </div>
      <ul className="flex flex-col gap-4 m-0 p-0 list-none">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={item.id} className="w-full">
              <Link
                href={`/blogs/${item.slug}`}
                className={`group flex gap-[10px] items-start w-full ${
                  last ? "" : "border-b-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] pb-[12.8px]"
                }`}
              >
                <div className="relative shrink-0 size-[62px] bg-[var(--lm-surface,#1c1c1c)] overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    sizes="62px"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-1 min-w-0 flex-col gap-[2.2px]">
                  <span className="text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] text-[10px] font-bold uppercase tracking-[0.96px] leading-none">
                    {item.category}
                  </span>
                  <p className="text-[var(--lm-text,#fff)] text-[14px] font-medium leading-[1.2] m-0 group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors">
                    {item.title}
                  </p>
                  <span className="text-[var(--lm-muted,#696969)] text-[12px] leading-none pt-[0.8px]">
                    {item.date}
                    {item.readTimeMinutes ? ` · ${item.readTimeMinutes} ${tShort("minShort")}` : ""}
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function BlogDetailSidebar({
  author,
  related,
  bookHref,
  className,
}: BlogDetailSidebarProps) {
  return (
    <aside
      className={`flex flex-col gap-[2px] items-stretch w-full ${className ?? ""}`}
    >
      <AuthorCard author={author} />
      <BookCtaCard bookHref={bookHref} />
      <RelatedCard items={related} />
    </aside>
  )
}
