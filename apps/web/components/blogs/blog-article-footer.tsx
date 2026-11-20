"use client"

import { useCallback, useState } from "react"
import { Link as LinkIcon, MessageCircle, Share2, Check } from "lucide-react"
import { useTranslations } from "next-intl"

interface BlogArticleFooterProps {
  tags?: string[]
  shareTitle: string
}

const ICON_BTN =
  "size-10 flex items-center justify-center bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.22)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.16)] hover:border-[var(--lm-accent,#C9A96E)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors"

export function BlogArticleFooter({ tags, shareTitle }: BlogArticleFooterProps) {
  const t = useTranslations("blogArticle")
  const [copied, setCopied] = useState(false)

  const getUrl = () => (typeof window !== "undefined" ? window.location.href : "")

  const onCopy = useCallback(async () => {
    const url = getUrl()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }, [])

  const onWhatsApp = useCallback(() => {
    const url = getUrl()
    if (!url) return
    const text = encodeURIComponent(`${shareTitle} — ${url}`)
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer")
  }, [shareTitle])

  const onNativeShare = useCallback(async () => {
    const url = getUrl()
    if (!url) return
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url })
        return
      } catch {
        /* user cancel or unsupported, fall back */
      }
    }
    onCopy()
  }, [shareTitle, onCopy])

  if ((!tags || tags.length === 0)) {
    return (
      <div className="border-t-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] pt-[28.8px] flex items-center gap-2">
        <ShareRow
          label={t("shareLabel")}
          copied={copied}
          onCopy={onCopy}
          onWhatsApp={onWhatsApp}
          onNativeShare={onNativeShare}
        />
      </div>
    )
  }

  return (
    <div className="border-t-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.07)] pt-[28.8px] flex flex-col gap-5 w-full">
      <ul className="flex flex-wrap gap-2 md:gap-x-[6px] md:gap-y-2 list-none m-0 p-0">
        {tags.map((tag) => (
          <li key={tag}>
            <span className="group/tag inline-flex items-center bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] hover:bg-[var(--lm-accent,#C9A96E)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.18)] hover:border-[var(--lm-accent,#C9A96E)] px-[13.8px] py-[5.8px] text-[10px] font-semibold uppercase tracking-[0.8px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:!text-[#0D0D0D] transition-colors duration-200 cursor-pointer">
              {tag}
            </span>
          </li>
        ))}
      </ul>
      <ShareRow
        label={t("shareLabel")}
        copied={copied}
        onCopy={onCopy}
        onWhatsApp={onWhatsApp}
        onNativeShare={onNativeShare}
      />
    </div>
  )
}

function ShareRow({
  label,
  copied,
  onCopy,
  onWhatsApp,
  onNativeShare,
}: {
  label: string
  copied: boolean
  onCopy: () => void
  onWhatsApp: () => void
  onNativeShare: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-semibold uppercase tracking-[1px] text-[var(--lm-muted,#999)]">
        {label}
      </span>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copy link"
        className={ICON_BTN}
      >
        {copied ? (
          <Check className="size-[18px]" strokeWidth={1.75} />
        ) : (
          <LinkIcon className="size-[18px]" strokeWidth={1.5} />
        )}
      </button>
      <button
        type="button"
        onClick={onWhatsApp}
        aria-label="Share on WhatsApp"
        className={ICON_BTN}
      >
        <MessageCircle className="size-[20px]" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={onNativeShare}
        aria-label="Share"
        className={ICON_BTN}
      >
        <Share2 className="size-[18px]" strokeWidth={1.5} />
      </button>
    </div>
  )
}
