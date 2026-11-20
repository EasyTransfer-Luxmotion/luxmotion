"use client"

import { useState, useMemo } from "react"
import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Calendar, Clock, User, ArrowRight, ChevronDown, Loader2 } from "lucide-react"
import { useFeaturedBlogs, useFilteredBlogs, type BlogData } from "@/hooks/use-blog-data"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

const CATEGORIES = ["all", "transfers", "tours", "lisbon", "porto", "algarve", "travel tips"] as const

const FALLBACK_BLOGS: BlogData[] = [
  {
    _id: "fb-1",
    slug: "lisbon-airport-transfer-guide",
    title: "Airport to Lisbon City Centre: The Complete Transfer Guide 2026",
    excerpt: "Everything you need to know about getting from Lisbon Airport to your hotel, with options for every budget — and why private transfer wins every time.",
    content: null,
    heroImageUrl: "/mockups/blogs/lisbon-city-center.jpg",
    category: "transfer guide",
    author: "Carolina Pinheiro",
    originalLanguage: "en",
    status: "published",
    isFeatured: true,
    readTimeMinutes: 8,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    availableLanguages: ["en", "pt"],
  },
  {
    _id: "fb-2",
    slug: "porto-wine-tour-guide",
    title: "Airport to Lisbon City Centre: The Complete Transfer Guide 2026",
    excerpt: "Everything you need to know about getting from Lisbon Airport to your hotel, with options for every budget.",
    content: null,
    heroImageUrl: "/mockups/blogs/lisbon-city-center.jpg",
    category: "day tours",
    author: "Carolina Pinheiro",
    originalLanguage: "en",
    status: "published",
    isFeatured: true,
    readTimeMinutes: 8,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    availableLanguages: ["en", "pt"],
  },
  {
    _id: "fb-3",
    slug: "sintra-day-trip-guide",
    title: "Airport to Lisbon City Centre: The Complete Transfer Guide 2026",
    excerpt: "Everything you need to know about getting from Lisbon Airport to your hotel, with options for every budget.",
    content: null,
    heroImageUrl: "/mockups/blogs/lisbon-city-center.jpg",
    category: "wine & food",
    author: "Carolina Pinheiro",
    originalLanguage: "en",
    status: "published",
    isFeatured: true,
    readTimeMinutes: 8,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    availableLanguages: ["en", "pt"],
  },
]

function formatMonth(timestamp?: number): string {
  if (!timestamp) return ""
  const d = new Date(timestamp)
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

/** `onImage` = a linha assenta sobre a fotografia do cartão, onde o contraste
 *  vem da imagem e não do tema: aí as cores ficam fixas em ambos os modos. */
function MetaRow({
  date,
  readTime,
  author,
  onImage = false,
}: {
  date?: number
  readTime: number
  author: string
  onImage?: boolean
}) {
  const muted = onImage ? "text-[#999]" : "text-[var(--lm-muted,#999)]"
  const dot = onImage
    ? "text-[rgba(255,255,255,0.18)]"
    : "text-[rgba(var(--lm-text-rgb,255,255,255),0.18)]"

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Calendar className={`size-4 ${muted} shrink-0`} strokeWidth={1.5} />
      <span className={`text-[12px] ${muted}`} style={sans}>{formatMonth(date)}</span>
      <span className={`text-[8px] ${dot}`}>·</span>
      <Clock className={`size-4 ${muted} shrink-0`} strokeWidth={1.5} />
      <span className={`text-[12px] ${muted}`} style={sans}>{readTime} min read</span>
      <span className={`text-[8px] ${dot}`}>·</span>
      <User className={`size-4 ${muted} shrink-0`} strokeWidth={1.5} />
      <span className={`text-[12px] ${muted}`} style={sans}>{author}</span>
    </div>
  )
}

function AuthorBadge({ author }: { author: string }) {
  const initial = author.charAt(0).toUpperCase()
  return (
    <div className="flex items-center gap-2">
      <div className="size-6 rounded-full bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border-[0.92px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] flex items-center justify-center">
        <span className="text-[9px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={sans}>{initial}</span>
      </div>
      <span className="text-[12px] text-[var(--lm-muted,#999)]" style={sans}>
        {author.split(" ")[0]} {author.split(" ")[1]?.[0]}.
      </span>
    </div>
  )
}

function HeroBlogCard({ blog, readArticleLabel }: { blog: BlogData; readArticleLabel: string }) {
  const imageUrl = blog.heroImageUrl || "/mockups/blogs/lisbon-city-center.jpg"

  return (
    <Link href={`/blogs/${blog.slug}`} className="flex-1 relative flex flex-col justify-end overflow-clip group min-h-[300px] md:min-h-0">
      <Image
        src={imageUrl}
        alt={blog.title}
        fill
        className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
        sizes="(max-width: 768px) 100vw, 60vw"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[63%] to-[rgba(0,0,0,0.8)] to-[76%]" />
      {/* Todo o conteúdo deste cartão assenta sobre a fotografia + gradiente preto:
          o contraste vem da imagem, por isso as cores ficam fixas nos dois temas. */}
      <div className="relative flex flex-col gap-2 px-5 md:px-6 py-4 md:py-[18px]">
        <div className="bg-[#C9A96E] self-start px-[8.8px] py-[2.8px]">
          <span className="text-[12px] font-semibold text-[#0D0D0D] uppercase tracking-[1px]" style={sans}>
            {blog.category}
          </span>
        </div>
        <h3 className="text-[24px] md:text-[32px] font-bold text-white leading-[1.2] pb-[6px]" style={serif}>
          {blog.title}
        </h3>
        <MetaRow
          date={blog.publishedAt || blog.createdAt}
          readTime={blog.readTimeMinutes}
          author={blog.author}
          onImage
        />
        <p className="text-[14px] text-[#999] leading-[17.6px] py-2 hidden md:block" style={sans}>
          {blog.excerpt}
        </p>
        <div className="border-t-[0.8px] border-[rgba(255,255,255,0.12)] flex items-center justify-between pt-3">
          <span className="text-[12px] font-medium text-[#C9A96E] uppercase tracking-[1px]" style={sans}>
            {readArticleLabel}
          </span>
          <div className="size-8 border-[1.143px] border-[rgba(154,117,53,0.22)] flex items-center justify-center transition-colors duration-200 group-hover:bg-[#C9A96E] group-hover:border-[#C9A96E]">
            <ArrowRight className="size-[18px] text-[#C9A96E] group-hover:text-[#0D0D0D] transition-colors duration-200" strokeWidth={1.5} />
          </div>
        </div>
      </div>
    </Link>
  )
}

function SideBlogCard({ blog }: { blog: BlogData }) {
  const imageUrl = blog.heroImageUrl || "/mockups/blogs/lisbon-city-center.jpg"

  return (
    <Link href={`/blogs/${blog.slug}`} className="bg-[var(--lm-surface,#1e1e1e)] flex-1 flex flex-col overflow-clip group border-[0.5px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.55)] transition-colors duration-200">
      <div className="relative flex-1 min-h-[120px] overflow-clip">
        <Image
          src={imageUrl}
          alt={blog.title}
          fill
          className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
          sizes="(max-width: 768px) 100vw, 35vw"
        />
      </div>
      <div className="flex flex-col gap-2 px-5 md:px-6 py-3 md:py-4">
        <div className="backdrop-blur-[3px] bg-[rgba(var(--lm-accent-rgb,154,117,53),0.22)] border border-[rgba(var(--lm-accent-rgb,154,117,53),0.22)] self-start px-[9.8px] py-[3.8px]">
          <span className="text-[12px] font-semibold text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] uppercase tracking-[1px]" style={sans}>
            {blog.category}
          </span>
        </div>
        <h3 className="text-[20px] md:text-[24px] font-bold text-[var(--lm-text,#fff)] leading-[1.2] pb-[6px]" style={serif}>
          {blog.title}
        </h3>
        <MetaRow date={blog.publishedAt || blog.createdAt} readTime={blog.readTimeMinutes} author={blog.author} />
      </div>
    </Link>
  )
}

function GridBlogCard({ blog, readArticleLabel }: { blog: BlogData; readArticleLabel: string }) {
  const imageUrl = blog.heroImageUrl || "/mockups/blogs/lisbon-city-center.jpg"

  return (
    <Link href={`/blogs/${blog.slug}`} className="bg-[var(--lm-surface,#1e1e1e)] flex flex-col md:h-[420px] overflow-clip group border-[0.5px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.55)] transition-colors duration-200">
      <div className="relative flex-1 min-h-[160px] overflow-clip">
        <Image
          src={imageUrl}
          alt={blog.title}
          fill
          className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
        {/* Etiqueta sobre a fotografia: fica dourada fixa nos dois temas. */}
        <div className="absolute bottom-3 left-4 bg-[#C9A96E] border border-[rgba(154,117,53,0.22)] px-[9.8px] py-[3.8px]">
          <span className="text-[12px] font-semibold text-[#0D0D0D] uppercase tracking-[1px]" style={sans}>
            {blog.category}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-5 md:px-6 py-3 md:py-4">
        <h3 className="text-[20px] md:text-[24px] font-semibold text-[var(--lm-text,#fff)] group-hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors duration-200 leading-[1.2] pb-[6px]" style={serif}>
          {blog.title}
        </h3>
        <p className="text-[14px] text-[var(--lm-muted,#999)] leading-[17.6px] line-clamp-2" style={sans}>
          {blog.excerpt}
        </p>
        <div className="border-t-[0.8px] border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex items-center justify-between pt-3 mt-auto">
          <AuthorBadge author={blog.author} />
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-[var(--lm-muted,#999)]" strokeWidth={1.5} />
            <span className="text-[12px] text-[var(--lm-muted,#999)]" style={sans}>
              {formatMonth(blog.publishedAt || blog.createdAt)}
            </span>
            <span className="text-[8px] text-[rgba(var(--lm-text-rgb,255,255,255),0.18)]">·</span>
            <Clock className="size-4 text-[var(--lm-muted,#999)]" strokeWidth={1.5} />
            <span className="text-[12px] text-[var(--lm-muted,#999)]" style={sans}>{blog.readTimeMinutes} min read</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export function FeaturedBlogsSection({
  initialFeatured,
  initialPublished,
}: {
  /** Resolvidos no servidor: é o que põe os artigos no HTML do índice. */
  initialFeatured?: BlogData[] | null
  initialPublished?: BlogData[] | null
} = {}) {
  const t = useTranslations("featuredBlogs")
  const [activeCategory, setActiveCategory] = useState<string>("all")
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest")

  const { blogs: featuredBlogs, isLoading: featuredLoading } = useFeaturedBlogs(initialFeatured)
  const { blogs: allBlogs, isLoading: allLoading } = useFilteredBlogs(
    {
      category: activeCategory === "all" ? undefined : activeCategory,
      status: "published",
      sortBy,
    },
    initialPublished,
  )

  const featured = featuredBlogs.length >= 3 ? featuredBlogs : FALLBACK_BLOGS
  const heroCard = featured[0]!
  const sideCards = featured.slice(1, 3)

  const gridBlogs = useMemo(() => {
    const featuredIds = new Set(featured.map(b => b._id))
    return allBlogs.filter(b => !featuredIds.has(b._id))
  }, [allBlogs, featured])

  const isLoading = featuredLoading || allLoading

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] pt-10 md:pt-[56px] pb-10 md:pb-[64px] px-4 md:px-[56px]">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-6 items-center">
        <div className="flex flex-col gap-2 items-start w-full">
          <div className="flex items-center gap-2">
            <div className="w-8 md:w-[82px] h-px bg-[var(--lm-accent,#C9A96E)]" />
            <span className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" style={sans}>
              {t("eyebrow")}
            </span>
          </div>
          <h2 className="text-[32px] md:text-[48px] font-light text-[var(--lm-text,#fff)] leading-none" style={serif}>
            {t("heading")}{" "}
            <span className="italic text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]">{t("headingAccent")}</span>
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 w-full">
            <Loader2 className="size-8 animate-spin text-[var(--lm-muted,#999)]" />
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row gap-[2px] w-full md:h-[650px]">
              <HeroBlogCard blog={heroCard} readArticleLabel={t("readArticle")} />
              <div className="flex flex-col gap-[2px] md:w-[532px] shrink-0">
                {sideCards.map((blog) => (
                  <SideBlogCard key={blog._id} blog={blog} />
                ))}
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 w-full pt-10 md:pt-[66px] pb-4 md:pb-6">
              <div className="flex gap-2 items-center overflow-x-auto no-scrollbar">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`h-8 px-[14.8px] text-[12px] uppercase tracking-[0.7px] whitespace-nowrap transition-colors duration-200 shrink-0 ${
                      activeCategory === cat
                        ? "bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.18)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
                        : "border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] text-[var(--lm-muted,#999)] hover:text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.55)]"
                    }`}
                    style={sans}
                  >
                    {t(`cat${cat.charAt(0).toUpperCase() + cat.slice(1).replace(/\s+/g, "")}`)}
                  </button>
                ))}
              </div>
              <div className="hidden md:flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--lm-muted,#696969)]" style={sans}>{t("sortByLabel")}</span>
                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as "newest" | "oldest")}
                      className="h-[44px] bg-[var(--lm-surface,#1e1d1b)] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] pl-4 pr-8 text-[14px] text-[var(--lm-text,#f7f4ef)] outline-none appearance-none cursor-pointer"
                      style={sans}
                    >
                      <option value="newest">{t("sortLatest")}</option>
                      <option value="oldest">{t("sortOldest")}</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-5 text-[var(--lm-muted,#999)] pointer-events-none" strokeWidth={1.5} />
                  </div>
                </div>
              </div>
            </div>

            {gridBlogs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-[10px] w-full">
                {gridBlogs.slice(0, 6).map((blog) => (
                  <GridBlogCard key={blog._id} blog={blog} readArticleLabel={t("readArticle")} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 w-full border border-dashed border-[rgba(var(--lm-text-rgb,255,255,255),0.12)]">
                <p className="text-[14px] text-[var(--lm-muted,#999)]" style={sans}>{t("noArticles")}</p>
              </div>
            )}

            {gridBlogs.length > 6 && (
              <Link
                href="/blogs/results"
                className="mt-4 h-[48px] px-8 border border-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] flex items-center gap-2 hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] transition-colors"
              >
                <span className="text-[12px] font-medium text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] uppercase tracking-[1.1px]" style={sans}>
                  {t("seeMore")}
                </span>
                <ArrowRight className="size-4 text-[var(--lm-accent,#C9A96E)]" strokeWidth={1.5} />
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  )
}
