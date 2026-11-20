"use client"

import { Link } from "@/i18n/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

const SERIF_FONT = {
  fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
}

export interface PrevNextItem {
  slug: string
  title: string
}

interface BlogPrevNextProps {
  previous?: PrevNextItem | null
  next?: PrevNextItem | null
}

export function BlogPrevNext({ previous, next }: BlogPrevNextProps) {
  const t = useTranslations("blogArticle")

  if (!previous && !next) return null

  return (
    <section className="bg-[var(--lm-surface,#141414)] border-t-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] pt-[40.8px] pb-[40px] px-4 lg:px-[80px]">
      <div className="max-w-[1280px] mx-auto flex gap-[2px] items-stretch">
        {previous ? (
          <Link
            href={`/blogs/${previous.slug}`}
            className="group flex flex-1 min-w-px flex-col gap-2 border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] p-[24.8px] transition-colors"
          >
            <div className="flex items-center gap-[7px]">
              <ArrowLeft className="size-3 text-[var(--lm-muted,#999)] group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors" strokeWidth={2} />
              <span className="text-[12px] font-semibold uppercase tracking-[1.26px] text-[var(--lm-muted,#999)] group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors">
                {t("previousArticle")}
              </span>
            </div>
            <p
              className="text-[18px] lg:text-[24px] font-medium text-[var(--lm-text,#fff)] group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors duration-200 leading-[1.2] lg:leading-[21.6px] m-0"
              style={SERIF_FONT}
            >
              {previous.title}
            </p>
          </Link>
        ) : (
          <div className="flex-1 min-w-px" />
        )}

        {next ? (
          <Link
            href={`/blogs/${next.slug}`}
            className="group flex flex-1 min-w-px flex-col gap-2 border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] p-[24.8px] transition-colors"
          >
            <div className="flex items-center justify-end gap-[7px]">
              <span className="text-[12px] font-semibold uppercase tracking-[1.26px] text-[var(--lm-muted,#999)] group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] text-right transition-colors">
                {t("nextArticle")}
              </span>
              <ArrowRight className="size-3 text-[var(--lm-muted,#999)] group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors" strokeWidth={2} />
            </div>
            <p
              className="text-[18px] lg:text-[24px] font-medium text-[var(--lm-text,#fff)] group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors duration-200 leading-[1.2] lg:leading-[21.6px] text-right m-0"
              style={SERIF_FONT}
            >
              {next.title}
            </p>
          </Link>
        ) : (
          <div className="flex-1 min-w-px" />
        )}
      </div>
    </section>
  )
}
