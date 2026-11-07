"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { useQuery } from "convex/react"
import { api } from "@workspace/convex/api"
import { cdn } from "@/lib/cdn"

const instagramGradient =
  "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)"

const fallbackPosts = [
  { id: "1", media_url: "/home/socials-1.webp", permalink: "https://www.instagram.com/luxmotion.tours/", timestamp: "2026-01-01T00:00:00.000Z" },
  { id: "2", media_url: "/home/socials-2.webp", permalink: "https://www.instagram.com/luxmotion.tours/", timestamp: "2026-01-01T00:00:00.000Z" },
  { id: "3", media_url: "/home/socials-3.webp", permalink: "https://www.instagram.com/luxmotion.tours/", timestamp: "2026-01-01T00:00:00.000Z" },
]

export function SocialSection() {
  const t = useTranslations("social")
  const [currentIndex, setCurrentIndex] = useState(0)
  /* Lê a cache que o cron enche, em vez de chamar a API a cada carregamento. */
  const feed = useQuery(api.instagram.getInstagramFeed, {})

  const posts = feed?.posts?.length
    ? feed.posts.map((p) => ({
        id: p.id,
        media_url: p.thumbnailUrl || p.mediaUrl,
        permalink: p.permalink,
        timestamp: p.timestamp,
      }))
    : fallbackPosts

  const profile = feed?.profile
    ? {
        username: feed.profile.username,
        media_count: feed.profile.mediaCount ?? 626,
        followers_count: feed.profile.followersCount ?? 2000,
        follows_count: feed.profile.followsCount ?? 883,
        profile_picture_url: feed.profile.profilePictureUrl,
      }
    : {
        username: "luxmotion.tours",
        media_count: 626,
        followers_count: 2000,
        follows_count: 883,
        profile_picture_url: undefined as string | undefined,
      }

  const handlePrev = () => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : posts.length - 1))
  const handleNext = () => setCurrentIndex((prev) => (prev < posts.length - 1 ? prev + 1 : 0))

  const formatCount = (count: number): string => (count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString())

  return (
    <section
      data-theme-color="socialBg"
      className="py-[40px] md:py-[64px] px-4 md:px-8 lg:px-[60px] xl:px-[100px]"
      style={{ backgroundColor: "var(--theme-social-bg, #ffffff)" }}
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-6 md:gap-8">
        <h2 className="text-[28px] md:text-[36px] font-bold leading-[1.3]">
          <span data-theme-color="socialTitle" className="font-extrabold italic" style={{ color: "var(--theme-social-title, #222222)" }}>{t("followUs")}</span>
          <span data-theme-color="socialTitle" className="font-bold" style={{ color: "var(--theme-social-title, #222222)" }}>{" "}{t("on")}{" "}</span>
          <span data-theme-color="socialTitleAccent" style={{ color: "var(--theme-social-title-accent, #27c7ff)" }}>{t("socialMedia")}</span>
        </h2>

        <div className="flex flex-col items-center gap-5 h-auto lg:h-[75px]">
          <div className="flex flex-col lg:flex-row items-center gap-5">
            <div className="flex items-center gap-5">
              <div className="flex items-center justify-center p-[2px] rounded-full w-[55px] h-[55px] shrink-0" style={{ background: instagramGradient }}>
                <div className="relative w-[51px] h-[51px] rounded-full border-2 border-white overflow-hidden">
                  {profile?.profile_picture_url ? (
                    <Image src={cdn(profile.profile_picture_url)} alt="Profile" fill className="object-cover" unoptimized />
                  ) : (
                    <Image src="/shared/logos/socials-logo.png" alt="Profile" fill className="object-cover" />
                  )}
                </div>
              </div>

              <span data-theme-color="socialProfileText" className="font-bold text-[15px] whitespace-nowrap" style={{ color: "var(--theme-social-profile-text, #000000)" }}>
                {profile?.username || "LuxMotion.Tours"}
              </span>
            </div>

            <div className="flex items-center gap-5">
              <div className="flex items-center gap-[3px]">
                <span data-theme-color="socialProfileText" className="font-bold text-[15px]" style={{ color: "var(--theme-social-profile-text, #000000)" }}>
                  {profile ? formatCount(profile.media_count) : "626"}
                </span>
                <span data-theme-color="socialMetaText" className="text-[14px]" style={{ color: "var(--theme-social-meta-text, #65758b)" }}>{t("posts")}</span>
              </div>
              <div className="flex items-center gap-[3px]">
                <span data-theme-color="socialProfileText" className="font-bold text-[15px]" style={{ color: "var(--theme-social-profile-text, #000000)" }}>
                  {profile ? formatCount(profile.followers_count) : "2.0K"}
                </span>
                <span data-theme-color="socialMetaText" className="text-[14px]" style={{ color: "var(--theme-social-meta-text, #65758b)" }}>{t("followers")}</span>
              </div>
              <div className="flex items-center gap-[3px]">
                <span data-theme-color="socialProfileText" className="font-bold text-[15px]" style={{ color: "var(--theme-social-profile-text, #000000)" }}>
                  {profile ? formatCount(profile.follows_count) : "883"}
                </span>
                <span data-theme-color="socialMetaText" className="text-[14px]" style={{ color: "var(--theme-social-meta-text, #65758b)" }}>{t("following")}</span>
              </div>
            </div>

            <a
              href="https://www.instagram.com/luxmotion.tours/"
              target="_blank"
              rel="noopener noreferrer"
              data-theme-color="socialFollowButtonBg"
              className="flex items-center justify-center gap-2 h-12 px-6 rounded-lg transition-all w-fit"
              style={{ backgroundColor: "var(--theme-social-follow-button-bg, #27c7ff)" }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
                  data-theme-color="socialFollowButtonIcon"
                  style={{ fill: "var(--theme-social-follow-button-icon, #161616)" }}
                />
              </svg>
              <span data-theme-color="socialFollowButtonText" className="font-bold text-[16px] uppercase tracking-[0.16px]" style={{ color: "var(--theme-social-follow-button-text, #161616)" }}>
                {t("follow")}
              </span>
            </a>
          </div>
        </div>

        <div className="relative h-[380px] lg:h-[580px] w-full overflow-visible">
          <div className="hidden lg:flex gap-5 justify-center w-full">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>

          <div className="lg:hidden flex justify-center">
            {posts.length > 0 && posts[currentIndex] && <PostCard post={posts[currentIndex]} isMobile />}
          </div>

          <button
            onClick={handlePrev}
            data-theme-color="socialNavButtonBg"
            className="lg:hidden absolute left-2 top-1/2 -translate-y-1/2 z-10 w-[42px] h-[42px] rounded-full shadow-[0px_0px_12px_0px_rgba(0,0,0,0.15)] flex items-center justify-center transition-colors"
            style={{ backgroundColor: "var(--theme-social-nav-button-bg, #ffffff)" }}
            aria-label="Previous"
          >
            <ChevronLeft data-theme-color="socialNavButtonIcon" className="w-5 h-5" style={{ color: "var(--theme-social-nav-button-icon, #000000)" }} />
          </button>
          <button
            onClick={handleNext}
            data-theme-color="socialNavButtonBg"
            className="lg:hidden absolute right-2 top-1/2 -translate-y-1/2 z-10 w-[42px] h-[42px] rounded-full shadow-[0px_0px_12px_0px_rgba(0,0,0,0.15)] flex items-center justify-center transition-colors"
            style={{ backgroundColor: "var(--theme-social-nav-button-bg, #ffffff)" }}
            aria-label="Next"
          >
            <ChevronRight data-theme-color="socialNavButtonIcon" className="w-5 h-5" style={{ color: "var(--theme-social-nav-button-icon, #000000)" }} />
          </button>
        </div>
      </div>
    </section>
  )
}

function PostCard({
  post,
  isMobile,
}: {
  post: { id: string; media_url: string; permalink: string; thumbnail_url?: string }
  isMobile?: boolean
}) {
  const imageUrl = post.thumbnail_url || post.media_url

  return (
    <a
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className={`relative rounded-lg overflow-hidden block ${isMobile ? "w-[340px] h-[380px] flex-shrink-0" : "flex-1 h-[560px] max-w-[460px]"} hover:opacity-90 transition-opacity`}
    >
      <Image src={cdn(imageUrl)} alt="Instagram post" fill className="object-cover" unoptimized />
    </a>
  )
}
