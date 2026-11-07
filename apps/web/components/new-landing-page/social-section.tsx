"use client"

import { useRef } from "react"
import Image from "next/image"
import { Instagram } from "lucide-react"
import { useTranslations } from "next-intl"
import { useQuery } from "convex/react"
import { api } from "@workspace/convex/api"
import { useAutoScrollMarquee } from "@/hooks/use-auto-scroll-marquee"
import { cdn } from "@/lib/cdn"

const fallbackPosts = [
  { id: "1", media_url: "/instagram/post-1.webp", permalink: "https://www.instagram.com/luxmotion.tours/" },
  { id: "2", media_url: "/instagram/post-2.webp", permalink: "https://www.instagram.com/luxmotion.tours/" },
  { id: "3", media_url: "/instagram/post-3.webp", permalink: "https://www.instagram.com/luxmotion.tours/" },
  { id: "4", media_url: "/instagram/post-2.webp", permalink: "https://www.instagram.com/luxmotion.tours/" },
  { id: "5", media_url: "/instagram/post-3.webp", permalink: "https://www.instagram.com/luxmotion.tours/" },
  { id: "6", media_url: "/instagram/post-1.webp", permalink: "https://www.instagram.com/luxmotion.tours/" },
]

const FALLBACK_PROFILE = {
  username: "luxmotion.tours",
  media_count: 626,
  followers_count: 2000,
}

export function SocialSection() {
  const t = useTranslations("social")
  /* Lê a cache que o cron enche uma vez por dia, em vez de chamar a API do
     Instagram a cada carregamento da homepage. */
  const feed = useQuery(api.instagram.getInstagramFeed, {})

  const scrollerRef = useRef<HTMLDivElement>(null)
  useAutoScrollMarquee(scrollerRef)

  const posts = feed?.posts?.length
    ? feed.posts.map((p) => ({
        id: p.id,
        media_url: p.thumbnailUrl || p.mediaUrl,
        permalink: p.permalink,
      }))
    : fallbackPosts

  const profile = feed?.profile
    ? {
        username: feed.profile.username,
        media_count: feed.profile.mediaCount ?? FALLBACK_PROFILE.media_count,
        followers_count:
          feed.profile.followersCount ?? FALLBACK_PROFILE.followers_count,
      }
    : FALLBACK_PROFILE

  const formatCount = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)

  const marqueePosts = [...posts.slice(0, 6), ...posts.slice(0, 6)]

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] py-6 px-4 md:px-[82px]">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 border border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)] flex items-center justify-center shrink-0">
              <Instagram className="w-4 h-4 text-[var(--lm-accent,#C9A96E)]" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span
                className="text-[16px] text-[var(--lm-text,#fff)] tracking-[0.65px]"
                style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              >
                @{profile.username}
              </span>
              <span
                className="text-[8px] text-[#8C8680] tracking-[0.8px]"
                style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
              >
                {profile.media_count} {t("posts")} · {formatCount(profile.followers_count)} {t("followers")}
              </span>
            </div>
          </div>

          <a
            href="https://www.instagram.com/luxmotion.tours/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] tracking-[1.1px] uppercase text-[var(--lm-accent,#C9A96E)] font-semibold hover:text-[var(--lm-text,#fff)] transition-colors hidden md:block"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("followJourney")} →
          </a>
        </div>

        <div className="hidden md:flex gap-[2px]">
          {posts.slice(0, 6).map((post) => (
            <a
              key={post.id}
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-square min-h-[300px] flex-1 bg-[var(--lm-surface,#1A1A1A)] overflow-hidden"
            >
              <Image
                src={cdn(post.media_url)}
                alt="Instagram post"
                fill
                className="object-cover transition-opacity duration-300 group-hover:opacity-70"
                sizes="16vw"
                unoptimized={post.media_url.startsWith("http")}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="size-[44px] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.6)] flex items-center justify-center opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 ease-out">
                  <Instagram className="size-[20px] text-[var(--lm-accent,#C9A96E)]" strokeWidth={1.6} />
                </div>
              </div>
            </a>
          ))}
        </div>

        <div
          ref={scrollerRef}
          className="md:hidden flex gap-[2px] overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden -mx-4"
        >
          {marqueePosts.map((post, i) => (
            <a
              key={`${post.id}-${i}`}
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-[1/1.1] w-[60vw] max-w-[280px] shrink-0 bg-[var(--lm-surface,#1A1A1A)] overflow-hidden first:ml-4 last:mr-4"
            >
              <Image
                src={cdn(post.media_url)}
                alt="Instagram post"
                fill
                className="object-cover"
                sizes="60vw"
                unoptimized={post.media_url.startsWith("http")}
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
