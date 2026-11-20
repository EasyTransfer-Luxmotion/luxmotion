"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { extractTocItems } from "@/lib/blog-toc"
import type { ContentBlock } from "@/components/blogs/blog-article-content"

interface BlogTocProps {
  blocks: ContentBlock[]
}

const SCROLL_OFFSET = 96

function scrollToHeading(id: string) {
  if (typeof window === "undefined") return
  const attempt = () => {
    const el = document.getElementById(id)
    if (!el) return false
    const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
    window.scrollTo({ top, behavior: "smooth" })
    if (window.history?.replaceState) {
      window.history.replaceState(null, "", `#${id}`)
    }
    return true
  }
  if (attempt()) return
  requestAnimationFrame(() => {
    if (attempt()) return
    setTimeout(attempt, 80)
  })
}

export function BlogToc({ blocks }: BlogTocProps) {
  const t = useTranslations("blogArticle")
  const items = useMemo(() => extractTocItems(blocks), [blocks])

  if (items.length === 0) return null

  return (
    <nav
      aria-label={t("inThisArticle")}
      className="bg-[var(--lm-surface,#141414)] border border-[rgba(var(--lm-text-rgb,247,244,239),0.1)] flex flex-col gap-3 items-stretch px-[25px] py-[17px] w-full"
    >
      <div className="h-[2px] w-full bg-gradient-to-r from-[var(--lm-accent,#c9a96e)] to-[rgba(var(--lm-accent-rgb,201,169,110),0.2)]" />
      <div className="pt-1">
        <span className="text-[12px] font-semibold uppercase tracking-[1.8px] text-[var(--lm-muted,#999)]">
          {t("inThisArticle")}
        </span>
      </div>
      <ol className="flex flex-col gap-[6px] items-stretch w-full m-0 p-0 list-none">
        {items.map((item) => (
          <li key={item.id} className="w-full">
            <button
              type="button"
              onClick={() => scrollToHeading(item.id)}
              className="group flex items-center gap-2 w-full text-left transition-colors"
            >
              <span className="h-px shrink-0 transition-all bg-[rgba(var(--lm-text-rgb,255,255,255),0.07)] w-[14px] group-hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.6)] group-hover:w-[20px]" />
              <span className="text-[12px] md:text-[14px] leading-[1.45] transition-colors text-[var(--lm-muted,#999)] group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">
                {item.title}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
