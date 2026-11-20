"use client"

import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { Share2, ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

export interface BlogResult {
  id: string
  slug: string
  image: string
  location: string
  title: string
  date: string
  description: string
}

interface BlogResultCardProps {
  blog: BlogResult
}

export function BlogResultCard({ blog }: BlogResultCardProps) {
  const t = useTranslations("blogResults")

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: blog.title,
          text: blog.description,
          url: `/blogs/${blog.slug}`,
        })
      } catch {
      }
    } else {
      navigator.clipboard.writeText(`${window.location.origin}/blogs/${blog.slug}`)
    }
  }

  return (
    <div className="group relative bg-[var(--lm-bg,#0D0D0D)] hover:bg-[var(--lm-surface,#161412)] transition-colors duration-500 ease-out border border-[rgba(var(--lm-accent-rgb,154,117,53),0.22)] overflow-hidden w-full">
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 h-px origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-700 ease-out"
        style={{
          background:
            "linear-gradient(to right, var(--lm-accent,#C9A96E) 0%, rgba(var(--lm-accent-rgb,201,169,110),0.4) 50%, transparent 85%)",
        }}
      />
      <div className="flex flex-col md:flex-row">
        <Link href={`/blogs/${blog.slug}`} className="relative w-full md:w-[44%] h-[220px] md:h-[260px] shrink-0 overflow-hidden">
          <Image
            src={blog.image}
            alt={blog.title}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            sizes="(max-width: 768px) 100vw, 44vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(13,13,13,0.5)] to-transparent" />
          <div className="absolute top-4 left-4">
            {/* Chip assente na fotografia, com fundo escuro fixo nos dois temas:
                o contraste vem da imagem, por isso o dourado fica fixo também. */}
            <span
              className="inline-flex items-center h-[28px] px-[14px] bg-[rgba(13,13,13,0.7)] border border-[rgba(201,169,110,0.4)] text-[11px] font-medium uppercase tracking-[1.5px] text-[#C9A96E] backdrop-blur-sm"
              style={sans}
            >
              {blog.location}
            </span>
          </div>
        </Link>

        <div className="flex flex-col flex-1 px-6 py-6 md:px-8 md:py-7">
          <div className="flex items-start justify-between gap-3">
            <Link href={`/blogs/${blog.slug}`} className="flex-1">
              <h3
                className="text-[var(--lm-text,#fff)] text-[22px] md:text-[26px] font-normal leading-[1.15] group-hover:text-[var(--lm-text,#f5f5f5)]"
                style={serif}
              >
                {blog.title}
              </h3>
            </Link>
            <button
              onClick={handleShare}
              className="shrink-0 text-[var(--lm-muted,#666)] hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors mt-1"
              aria-label={t("share")}
            >
              <Share2 className="size-[18px]" strokeWidth={1.5} />
            </button>
          </div>

          {blog.date && (
            <p className="text-[11px] font-medium uppercase tracking-[1.5px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] mt-3" style={sans}>
              {blog.date}
            </p>
          )}

          <p className="text-[13px] text-[var(--lm-muted,#999)] leading-[1.5] mt-3 line-clamp-3" style={sans}>
            {blog.description}
          </p>

          <Link
            href={`/blogs/${blog.slug}`}
            className="group/link inline-flex items-center gap-2 mt-auto pt-5 text-[12px] font-medium uppercase tracking-[1.1px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:text-[var(--lm-text,#fff)] transition-colors w-fit"
            style={sans}
          >
            {t("readMore")}
            <ArrowRight className="size-4 transition-transform group-hover/link:translate-x-1" strokeWidth={1.75} />
          </Link>
        </div>
      </div>
    </div>
  )
}
