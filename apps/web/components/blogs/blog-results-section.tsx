"use client"

import { useState, useMemo, useEffect } from "react"
import { MapPin, ArrowDownUp, ChevronDown, Plus, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"
import { BlogResultCard, BlogResult } from "./blog-result-card"
import { usePublishedBlogs } from "@/hooks/use-blog-data"

const sans = { fontFamily: "var(--font-sans), system-ui, sans-serif" } as const
const serif = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" } as const

interface FilterDropdownProps {
  icon: React.ReactNode
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  onClear?: () => void
}

function FilterDropdown({ icon, label, value, options, onChange, onClear }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 h-[44px] px-4 border transition-colors duration-200",
          value
            ? "border-[var(--lm-accent,#C9A96E)] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)]"
            : "border-[rgba(var(--lm-accent-rgb,154,117,53),0.3)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.6)]"
        )}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span
            className={cn("text-[13px] tracking-[0.3px] transition-colors", value ? "text-[var(--lm-text,#fff)]" : "text-[var(--lm-muted,#999)]")}
            style={sans}
          >
            {value || label}
          </span>
        </div>
        {value && onClear ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            className="size-[18px] rounded-full bg-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.35)] flex items-center justify-center transition-colors duration-200"
          >
            <X className="size-[11px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" />
          </button>
        ) : (
          <ChevronDown
            className={cn("size-[18px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-transform duration-200", isOpen && "rotate-180")}
          />
        )}
      </button>

      <div
        className={cn(
          "absolute top-full left-0 mt-2 bg-[var(--lm-surface,#161412)] border border-[rgba(var(--lm-accent-rgb,154,117,53),0.3)] z-20 min-w-[200px] overflow-hidden",
          "transition-all duration-200 origin-top",
          isOpen ? "opacity-100 scale-y-100" : "opacity-0 scale-y-0 pointer-events-none"
        )}
      >
        <button
          onClick={() => {
            onChange("")
            setIsOpen(false)
          }}
          className="w-full text-left px-4 py-3 text-[13px] text-[var(--lm-muted,#999)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] hover:text-[var(--lm-text,#fff)] transition-colors duration-150"
          style={sans}
        >
          {label}
        </button>
        {options.map((option) => (
          <button
            key={option}
            onClick={() => {
              onChange(option)
              setIsOpen(false)
            }}
            className={cn(
              "w-full text-left px-4 py-3 text-[13px] transition-colors duration-150",
              value === option
                ? "bg-[rgba(var(--lm-accent-rgb,201,169,110),0.1)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]"
                : "text-[var(--lm-text,#ccc)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)] hover:text-[var(--lm-text,#fff)]"
            )}
            style={sans}
          >
            {option}
          </button>
        ))}
      </div>

      {isOpen && <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />}
    </div>
  )
}

interface BlogResultsSectionProps {
  searchQuery?: string
}

export function BlogResultsSection({ searchQuery: initialQuery }: BlogResultsSectionProps) {
  const t = useTranslations("blogResults")
  const router = useRouter()
  const searchParams = useSearchParams()
  const { blogs: rawBlogs, isLoading: blogsLoading } = usePublishedBlogs()
  const [locationFilter, setLocationFilter] = useState("")
  const [sortBy, setSortBy] = useState("")
  const [visibleCount, setVisibleCount] = useState(6)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [animateCards, setAnimateCards] = useState(false)

  const searchQuery = searchParams.get("q") || initialQuery || ""

  const blogs: BlogResult[] = useMemo(() => {
    return rawBlogs.map((blog) => ({
      id: blog._id,
      slug: blog.slug,
      image: blog.heroImageUrl || "/mockups/blogs/lisbon-city-center.jpg",
      location: blog.category || "Portugal",
      title: blog.title,
      date: blog.publishedAt
        ? new Date(blog.publishedAt).toLocaleDateString("pt-PT", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "",
      description: blog.excerpt || "",
    }))
  }, [rawBlogs])

  useEffect(() => {
    setAnimateCards(false)
    const timer = setTimeout(() => setAnimateCards(true), 50)
    return () => clearTimeout(timer)
  }, [searchQuery, locationFilter, sortBy])

  const locations = useMemo(() => {
    const uniqueLocations = [...new Set(blogs.map((blog) => blog.location))]
    return uniqueLocations.sort()
  }, [blogs])

  const filteredBlogs = useMemo(() => {
    let results = [...blogs]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()

      results = results.filter(
        (blog) =>
          blog.title.toLowerCase().includes(query) ||
          blog.description.toLowerCase().includes(query) ||
          blog.location.toLowerCase().includes(query)
      )

      results.sort((a, b) => {
        const aLocationMatch = a.location.toLowerCase().includes(query)
        const bLocationMatch = b.location.toLowerCase().includes(query)

        if (aLocationMatch && !bLocationMatch) return -1
        if (!aLocationMatch && bLocationMatch) return 1

        const aExactLocationMatch = a.location.toLowerCase() === query
        const bExactLocationMatch = b.location.toLowerCase() === query

        if (aExactLocationMatch && !bExactLocationMatch) return -1
        if (!aExactLocationMatch && bExactLocationMatch) return 1

        return 0
      })
    }

    if (locationFilter) {
      results = results.filter((blog) => blog.location === locationFilter)
    }

    if (sortBy === "newest") {
      results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    } else if (sortBy === "oldest") {
      results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }

    return results
  }, [blogs, searchQuery, locationFilter, sortBy])

  const visibleBlogs = filteredBlogs.slice(0, visibleCount)
  const hasMore = visibleCount < filteredBlogs.length

  const handleLoadMore = () => {
    setIsLoadingMore(true)
    setTimeout(() => {
      setVisibleCount((prev) => prev + 6)
      setIsLoadingMore(false)
    }, 300)
  }

  const handleClearSearch = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("q")
    router.push(`/blogs/results${params.toString() ? `?${params.toString()}` : ""}`)
  }

  const handleClearLocation = () => {
    setLocationFilter("")
  }

  const handleClearSort = () => {
    setSortBy("")
  }

  if (blogsLoading) {
    return (
      <section className="bg-[var(--lm-bg,#0D0D0D)] px-4 md:px-[48px] pt-10 pb-20">
        <div className="max-w-[1280px] mx-auto flex flex-col gap-6">
          <div className="animate-pulse flex flex-col gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[260px] bg-[var(--lm-surface,#161412)] border border-[rgba(var(--lm-accent-rgb,154,117,53),0.15)]" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] px-4 md:px-[48px] pt-10 pb-20">
      <div className="max-w-[1280px] mx-auto flex flex-col gap-8">
        <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[rgba(var(--lm-accent-rgb,154,117,53),0.18)]">
          <div className="flex items-baseline gap-3 shrink-0">
            <h2 className="text-[28px] md:text-[34px] font-normal text-[var(--lm-text,#fff)]" style={serif}>
              {t("title")}
            </h2>
            <p
              className={cn(
                "text-[13px] text-[var(--lm-muted,#999)] transition-all duration-300",
                animateCards ? "opacity-100" : "opacity-0"
              )}
              style={sans}
            >
              {t("itemsFound", { count: filteredBlogs.length })}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {searchQuery && (
              <div
                className={cn(
                  "flex items-center gap-2 h-[44px] px-4 border border-[var(--lm-accent,#C9A96E)] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] transition-all duration-200",
                  animateCards ? "opacity-100 scale-100" : "opacity-0 scale-95"
                )}
              >
                <span className="text-[13px] text-[var(--lm-text,#fff)]" style={sans}>
                  &ldquo;{searchQuery}&rdquo;
                </span>
                <button
                  onClick={handleClearSearch}
                  className="size-[18px] rounded-full bg-[rgba(var(--lm-accent-rgb,201,169,110),0.2)] hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.35)] flex items-center justify-center transition-colors duration-200"
                >
                  <X className="size-[11px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" />
                </button>
              </div>
            )}
            <FilterDropdown
              icon={<MapPin className="size-[18px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" strokeWidth={1.5} />}
              label={t("searchByLocation")}
              value={locationFilter}
              options={locations}
              onChange={setLocationFilter}
              onClear={locationFilter ? handleClearLocation : undefined}
            />
            <FilterDropdown
              icon={<ArrowDownUp className="size-[18px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))]" strokeWidth={1.5} />}
              label={t("sortByDate")}
              value={sortBy === "newest" ? t("newest") : sortBy === "oldest" ? t("oldest") : ""}
              options={[t("newest"), t("oldest")]}
              onChange={(val) => {
                if (val === t("newest")) setSortBy("newest")
                else if (val === t("oldest")) setSortBy("oldest")
                else setSortBy("")
              }}
              onClear={sortBy ? handleClearSort : undefined}
            />
          </div>
        </div>

        <div className="flex flex-col gap-5 md:gap-6">
          {visibleBlogs.length === 0 ? (
            <div
              className={cn(
                "flex flex-col items-center justify-center py-20 text-center transition-all duration-300",
                animateCards ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              )}
            >
              <p className="text-[20px] text-[var(--lm-text,#f5f5f5)]" style={serif}>
                {t("noResults") || "No results found"}
              </p>
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="mt-4 text-[12px] font-medium uppercase tracking-[1.1px] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] hover:text-[var(--lm-text,#fff)] transition-colors"
                  style={sans}
                >
                  {t("clearSearch") || "Clear search"}
                </button>
              )}
            </div>
          ) : (
            visibleBlogs.map((blog, index) => (
              <div
                key={blog.id}
                className={cn(
                  "transition-all duration-300 ease-out",
                  animateCards ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                )}
                style={{ transitionDelay: animateCards ? `${index * 50}ms` : "0ms" }}
              >
                <BlogResultCard blog={blog} />
              </div>
            ))
          )}
        </div>

        {hasMore && (
          <div
            className={cn(
              "flex justify-center transition-all duration-300",
              animateCards ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
            style={{ transitionDelay: animateCards ? `${visibleBlogs.length * 50}ms` : "0ms" }}
          >
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className={cn(
                "h-[52px] px-8 flex items-center gap-3 border border-[var(--lm-accent,#C9A96E)] text-[var(--lm-accent-text,var(--lm-accent,#C9A96E))] transition-colors duration-500 ease-out",
                isLoadingMore ? "opacity-60 cursor-wait" : "hover:bg-[var(--lm-accent,#C9A96E)] hover:text-[#0D0D0D]"
              )}
            >
              <span className="text-[13px] font-medium uppercase tracking-[1.1px]" style={sans}>
                {t("loadMore")}
              </span>
              <Plus className={cn("size-[18px] transition-transform duration-300", isLoadingMore && "animate-spin")} />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
