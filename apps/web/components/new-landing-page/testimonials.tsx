"use client"

import { Component, useState, useMemo, useCallback, useEffect } from "react"
import Image from "next/image"
import { ChevronRight, BadgeCheck, Star } from "lucide-react"
import { useTranslations } from "next-intl"
import { useQuery } from "convex/react"
import { api } from "@workspace/convex/api"
import { useSwipe } from "@/hooks/use-swipe"
import {
  GOOGLE_REVIEWS_URL,
  TRUSTPILOT_REVIEWS_URL,
  REVIEW_LINK_PROPS,
} from "@/lib/review-links"
import { cdn } from "@/lib/cdn"

// Faixa de fotos de clientes/viagens reais. É uma galeria — não são avatares
// de quem escreveu as reviews, por isso não atribui autoria a ninguém.
const REVIEW_PHOTOS = [
  // Clientes VIP (mantidos à cabeça do carrossel).
  "/reviews/vip-bruno-fernandes.webp",
  "/reviews/vip-joao-cancelo.webp",
  "/reviews/vip-vitinha-futebol-player.webp",
  "/reviews/vip-maxi-araujo.webp",
  "/reviews/vip-virginia-fonseca-vip.webp",
  "/reviews/vip-famous-leo-dias.webp",
  "/reviews/vip-matuevipclient.webp",
  "/reviews/vip-famous-singer.webp",
  "/reviews/vip-singer.webp",
  "/reviews/vip-vipclient-singer.webp",
  "/reviews/vip-vipclient.webp",
  "/reviews/vip-football-player.webp",
  "/reviews/review-1.webp",
  "/reviews/review-2.webp",
  "/reviews/review-3.webp",
  "/reviews/review-4.webp",
  // Fotos de clientes e tours.
  "/reviews/gallery/aveiro-moliceiros.webp",
  "/reviews/gallery/cabo-da-roca.webp",
  "/reviews/gallery/cascais-boca-inferno.webp",
  "/reviews/gallery/castelo-obidos.webp",
  "/reviews/gallery/design-sem-nome-copy.webp",
  "/reviews/gallery/douro-socalcos.webp",
  "/reviews/gallery/drive-on-demand-chauffeur-lisbon.webp",
  "/reviews/gallery/foto-tour-easy-transfer-10.webp",
  "/reviews/gallery/foto-tour-easy-transfer-11.webp",
  "/reviews/gallery/foto-tour-easy-transfer-12.webp",
  "/reviews/gallery/foto-tour-easy-transfer-13.webp",
  "/reviews/gallery/foto-tour-easy-transfer-14.webp",
  "/reviews/gallery/foto-tour-easy-transfer-15.webp",
  "/reviews/gallery/foto-tour-easy-transfer-16.webp",
  "/reviews/gallery/foto-tour-easy-transfer-19.webp",
  "/reviews/gallery/foto-tour-easy-transfer-20.webp",
  "/reviews/gallery/foto-tour-easy-transfer-21.webp",
  "/reviews/gallery/foto-tour-easy-transfer-22.webp",
  "/reviews/gallery/foto-tour-easy-transfer-25.webp",
  "/reviews/gallery/foto-tour-easy-transfer-26.webp",
  "/reviews/gallery/foto-tour-easy-transfer-27.webp",
  "/reviews/gallery/foto-tour-easy-transfer-28.webp",
  "/reviews/gallery/foto-tour-easy-transfer-29.webp",
  "/reviews/gallery/foto-tour-easy-transfer-3.webp",
  "/reviews/gallery/foto-tour-easy-transfer-30.webp",
  "/reviews/gallery/foto-tour-easy-transfer-31.webp",
  "/reviews/gallery/foto-tour-easy-transfer-32.webp",
  "/reviews/gallery/foto-tour-easy-transfer-33.webp",
  "/reviews/gallery/foto-tour-easy-transfer-34.webp",
  "/reviews/gallery/foto-tour-easy-transfer-35.webp",
  "/reviews/gallery/foto-tour-easy-transfer-36.webp",
  "/reviews/gallery/foto-tour-easy-transfer-37.webp",
  "/reviews/gallery/foto-tour-easy-transfer-38.webp",
  "/reviews/gallery/foto-tour-easy-transfer-39.webp",
  "/reviews/gallery/foto-tour-easy-transfer-4.webp",
  "/reviews/gallery/foto-tour-easy-transfer-40.webp",
  "/reviews/gallery/foto-tour-easy-transfer-41.webp",
  "/reviews/gallery/foto-tour-easy-transfer-42.webp",
  "/reviews/gallery/foto-tour-easy-transfer-43.webp",
  "/reviews/gallery/foto-tour-easy-transfer-44.webp",
  "/reviews/gallery/foto-tour-easy-transfer-45.webp",
  "/reviews/gallery/foto-tour-easy-transfer-5.webp",
  "/reviews/gallery/foto-tour-easy-transfer-6.webp",
  "/reviews/gallery/foto-tour-easy-transfer-7.webp",
  "/reviews/gallery/foto-tour-easy-transfer-8.webp",
  "/reviews/gallery/foto-tour-easy-transfer-9.webp",
  "/reviews/gallery/foto-tour-easy-transfer.webp",
  "/reviews/gallery/foto-tour-easytransfer-17.webp",
  "/reviews/gallery/foto-tour-easytransfer-18.webp",
  "/reviews/gallery/foto-tour-easytransfer-corporate.webp",
  "/reviews/gallery/miradouro-santa-luzia-alfama.webp",
  "/reviews/gallery/mosteiro-jeronimos-lisboa.webp",
  "/reviews/gallery/porto-ribeira.webp",
  "/reviews/gallery/praca-comercio-lisboa.webp",
  "/reviews/gallery/quinta-regaleira-sintra.webp",
  "/reviews/gallery/templo-diana-evora.webp",
  "/reviews/gallery/torre-belem-lisboa.webp",
]

function CarouselArrow({
  direction,
  onClick,
  topClass,
  label,
}: {
  direction: "prev" | "next"
  onClick: () => void
  /** Posição vertical: centra-se na linha das fotos ou na das reviews. */
  topClass: string
  label: string
}) {
  const isPrev = direction === "prev"
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute ${topClass} -translate-y-1/2 z-10 grid size-11 place-items-center border border-[rgba(var(--lm-text-rgb,255,255,255),0.2)] bg-[var(--lm-bg,#0D0D0D)]/80 text-[var(--lm-text,#fff)] backdrop-blur-sm transition-colors hover:border-[var(--lm-accent,#C9A96E)] hover:text-[var(--lm-accent,#C9A96E)] ${
        isPrev ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"
      }`}
    >
      <ChevronRight className={`size-5 ${isPrev ? "rotate-180" : ""}`} />
    </button>
  )
}

/** Seta para mobile: sobreposta e centrada dentro de cada carrossel (fotos /
 *  reviews), inset das bordas para não sair da coluna (px-4). */
function MobileArrow({
  direction,
  onClick,
  label,
}: {
  direction: "prev" | "next"
  onClick: () => void
  label: string
}) {
  const isPrev = direction === "prev"
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 -translate-y-1/2 z-10 grid size-9 place-items-center border border-[rgba(var(--lm-text-rgb,255,255,255),0.2)] bg-[var(--lm-bg,#0D0D0D)]/70 text-[var(--lm-text,#fff)] backdrop-blur-sm transition-colors hover:border-[var(--lm-accent,#C9A96E)] hover:text-[var(--lm-accent,#C9A96E)] ${
        isPrev ? "left-2" : "right-2"
      }`}
    >
      <ChevronRight className={`size-5 ${isPrev ? "rotate-180" : ""}`} />
    </button>
  )
}

const AVATAR_COLORS = [
  "#5f6368", "#9c27b0", "#1976d2", "#546e7a",
  "#e91e63", "#ff5722", "#009688", "#795548",
]

const FALLBACK_REVIEWS = [
  {
    name: "Denise Bulacher",
    date: "2 years ago",
    color: "#5f6368",
    rating: 5,
    text: "Reliable, friendly, and exactly on time. The driver was waiting at arrivals with a name board. Absolutely seamless.",
  },
  {
    name: "Marco Wohlgemuth",
    date: "2 years ago",
    color: "#9c27b0",
    rating: 5,
    text: "Everything worked perfectly and we had a great conversation throughout the drive. The vehicle was immaculate. Can only recommend.",
  },
  {
    name: "Jan Z.",
    date: "2 years ago",
    color: "#1976d2",
    rating: 5,
    text: "We had a great experience — reliable, accessible, and genuinely friendly. The transfer was exactly what we needed. Thank you.",
  },
  {
    name: "Aleks Macura",
    date: "2 years ago",
    color: "#546e7a",
    rating: 5,
    text: "Right on time and easy to find. Communication before arrival was excellent. After the drop-off he even gave us a personal dinner recommendation.",
  },
]

type Review = {
  name: string
  date: string
  color: string
  rating: number
  text: string
  /** Foto real do autor (Google). Sem ela, cai na inicial sobre cor sólida. */
  photo?: string
}

function ReviewCard({ review }: { review: Review }) {
  const initial = review.name.charAt(0).toUpperCase()
  // Uma foto que falhe a carregar não deve deixar o avatar vazio.
  const [photoFailed, setPhotoFailed] = useState(false)
  const showPhoto = !!review.photo && !photoFailed

  return (
    <a
      href={GOOGLE_REVIEWS_URL}
      target="_blank"
      rel="noopener noreferrer"
      // Altura fixa: sem isto uma review muito longa esticava a linha toda.
      className="relative bg-[var(--lm-surface,#1a1a1a)] flex flex-col gap-[11px] px-5 py-6 h-[260px] group overflow-hidden cursor-pointer transition-colors hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.06)]"
    >
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[var(--lm-accent,#C9A96E)] to-[rgba(var(--lm-accent-rgb,201,169,110),0.3)] opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
      <div className="flex items-center gap-[10px]">
        <div
          className="size-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden relative"
          style={{ backgroundColor: showPhoto ? undefined : review.color }}
        >
          {showPhoto ? (
            <Image
              src={review.photo!}
              alt={review.name}
              fill
              sizes="36px"
              className="object-cover"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <span className="text-[14px] text-[var(--lm-text,#fff)]">{initial}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-[var(--lm-text,#fff)] leading-none">{review.name}</p>
          <p className="text-[12px] text-[var(--lm-muted,#8c8680)] leading-none mt-1">{review.date}</p>
        </div>
        <Image
          src="/shared/icons/google-icon.svg"
          alt="Google"
          width={16}
          height={16}
          className="size-4 shrink-0"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[12px] text-[var(--lm-accent,#C9A96E)] tracking-[1px]">{"★".repeat(Math.max(1, Math.min(5, Math.round(review.rating))))}</span>
        <div className="size-[14px] rounded-full bg-[#1a73e8] flex items-center justify-center">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {/* O resto da review lê-se no Google, para onde o cartão liga. */}
      <p className="text-[14px] text-[var(--lm-text,#fff)]/55 leading-[1.4] overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6]">
        {review.text}
      </p>
    </a>
  )
}

type GoogleReviewsData = {
  rating: number
  total: number
  fetchedAt: number
  reviews: {
    author: string
    rating: number
    text: string
    relativeTime: string
    time: number
    profilePhotoUrl?: string
    language?: string
  }[]
}

// The Google reviews come from an optional, cached Convex query. Isolate it in
// an error boundary so a backend hiccup — or the function simply not being
// deployed yet — can never crash the homepage; we fall back to the curated
// reviews instead.
function GoogleReviewsQuery({
  onData,
}: {
  onData: (data: GoogleReviewsData | null) => void
}) {
  const data = useQuery(api.googleReviews.getGoogleReviews)
  useEffect(() => {
    if (data !== undefined) onData(data ?? null)
  }, [data, onData])
  return null
}

class GoogleReviewsBoundary extends Component<
  { onData: (data: GoogleReviewsData | null) => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    // Swallowed on purpose — the curated reviews are shown instead.
  }
  render() {
    if (this.state.failed) return null
    return <GoogleReviewsQuery onData={this.props.onData} />
  }
}

/**
 * A secção de reviews de clientes. As páginas que a reutilizam podem trocar o
 * cabeçalho (ex. /tours e /about-us dizem "Clientes e Empresas") sem duplicar o
 * componente — o resto, incluindo as reviews do Google, é partilhado.
 */
export function Testimonials({
  sectionLabel,
  heading,
  /** Faixa de fotos própria da página (o /tours usa as suas). */
  photos,
}: {
  sectionLabel?: string
  heading?: string
  photos?: readonly string[]
} = {}) {
  const PHOTOS = photos && photos.length > 0 ? photos : REVIEW_PHOTOS
  const t = useTranslations("testimonials")
  const [currentPage, setCurrentPage] = useState(0)
  // Página das fotos, separada da das reviews: cada carrossel anda sozinho.
  const [photoPage, setPhotoPage] = useState(0)
  const [googleReviews, setGoogleReviews] = useState<GoogleReviewsData | null>(null)
  const featuredReviews = useQuery(api.tourReviews.listFeatured)

  const reviews: Review[] = useMemo(() => {
    // 1) Real Google reviews (cached server-side) take priority.
    const fromGoogle: Review[] = (googleReviews?.reviews ?? []).map((review, i) => ({
      name: review.author,
      date: review.relativeTime || "Recently",
      color: AVATAR_COLORS[i % AVATAR_COLORS.length] ?? "#5f6368",
      rating: review.rating,
      text: review.text,
      photo: review.profilePhotoUrl,
    }))
    if (fromGoogle.length > 0) return fromGoogle

    // 2) Otherwise fall back to the curated reviews managed in the admin.
    const dbReviews: Review[] = (featuredReviews ?? []).map((review, i) => ({
      name: review.author,
      date: new Date(review.createdAt).toLocaleDateString("en-GB"),
      color: AVATAR_COLORS[(i + 4) % AVATAR_COLORS.length] ?? "#5f6368",
      rating: 5 as const,
      text: review.text,
    }))
    return dbReviews.length > 0 ? dbReviews : FALLBACK_REVIEWS
  }, [googleReviews, featuredReviews])

  // Real aggregate from Google (falls back to the original hardcoded values).
  const ratingDisplay = googleReviews?.rating
    ? Number.isInteger(googleReviews.rating)
      ? String(googleReviews.rating)
      : googleReviews.rating.toFixed(1)
    : "5"
  const totalDisplay = googleReviews?.total ?? 322

  const desktopItemsPerPage = 4
  const desktopPages = Math.ceil(reviews.length / desktopItemsPerPage)

  const nextPage = useCallback(() => {
    setCurrentPage((prev) => (prev + 1) % reviews.length)
  }, [reviews.length])

  const prevPage = useCallback(() => {
    setCurrentPage((prev) => (prev - 1 + reviews.length) % reviews.length)
  }, [reviews.length])

  const swipeHandlers = useSwipe(nextPage, prevPage)

  const nextPhoto = useCallback(() => {
    setPhotoPage((p) => (p + 1) % PHOTOS.length)
  }, [])
  const prevPhoto = useCallback(() => {
    setPhotoPage((p) => (p - 1 + PHOTOS.length) % PHOTOS.length)
  }, [])
  // Swipe próprio das fotos em mobile (independente das reviews).
  const photoSwipeHandlers = useSwipe(nextPhoto, prevPhoto)

  // Janela deslizante: cada clique avança UMA posição, não um bloco de quatro.
  // Índices separados para que fotos e reviews andem de forma independente.
  const reviewStartIdx =
    reviews.length > 0 ? ((currentPage % reviews.length) + reviews.length) % reviews.length : 0
  const photoStartIdx =
    ((photoPage % PHOTOS.length) + PHOTOS.length) % PHOTOS.length
  // Faixa duplicada: os itens ficam montados e a faixa translada, por isso
  // desliza de verdade em vez de piscar. A cópia garante conteúdo à direita
  // enquanto se avança até ao fim da lista.
  const reviewTrack = [...reviews, ...reviews]
  const photoTrack = [...PHOTOS, ...PHOTOS]
  const mobileReview = reviews[currentPage % reviews.length]
  // Fotos no mobile seguem o seu próprio índice (photoPage), como no desktop,
  // para andarem independentes das reviews com as suas próprias setas.
  const mobilePhotoIdx = photoStartIdx

  return (
    <section id="reviews" className="bg-[var(--lm-bg,#0D0D0D)] pt-[60px] pb-6 relative">
      <GoogleReviewsBoundary onData={setGoogleReviews} />
      <div className="max-w-[1280px] mx-auto px-4 flex flex-col items-center">
        <div className="group relative overflow-hidden cursor-default backdrop-blur-sm bg-[rgba(var(--lm-accent-rgb,201,169,110),0.08)] border border-[var(--lm-accent,#C9A96E)] flex items-center gap-2 px-4 py-2">
          <div className="pointer-events-none absolute inset-0 w-0 bg-[var(--lm-accent,#C9A96E)] transition-all duration-500 ease-out group-hover:w-full" />
          <BadgeCheck className="relative size-6 text-[var(--lm-accent,#C9A96E)] transition-colors duration-300 group-hover:text-[#0D0D0D]" strokeWidth={1.5} />
          <span className="relative text-[14px] text-[var(--lm-accent,#C9A96E)] tracking-[0.28px] transition-colors duration-300 group-hover:text-[#0D0D0D]">
            {t("exclusive")}
          </span>
        </div>

        <div className="flex flex-col items-center gap-6 w-full mt-10" style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-px bg-[var(--lm-accent,#C9A96E)]" />
              <span className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent,#C9A96E)]" style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}>
                {sectionLabel ?? t("sectionLabel")}
              </span>
              <div className="w-8 h-px bg-[var(--lm-accent,#C9A96E)]" />
            </div>
            <h2 className="font-light text-[36px] md:text-[48px] text-[var(--lm-text,#f5f5f5)] text-center leading-none">
              {heading ?? t("heading")}
            </h2>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <div className="relative">
              <span className="font-semibold text-[64px] md:text-[96px] text-[var(--lm-accent,#ab9c6b)] leading-[0.95] tracking-[0.48px]">{ratingDisplay}</span>
              <Star className="size-6 md:size-[43px] text-[var(--lm-accent,#ab9c6b)] fill-[var(--lm-accent,#ab9c6b)] absolute right-[-28px] md:right-[-44px] top-[12px] md:top-[14px]" />
            </div>
            <div className="w-[2px] h-[40px] md:h-[60px] bg-[var(--lm-text,#fff)] rotate-[12deg] ml-6 md:ml-10" />
            <span className="font-semibold text-[64px] md:text-[96px] text-[var(--lm-accent,#ab9c6b)] leading-[0.95] tracking-[0.48px]">{totalDisplay}</span>
            <span className="font-medium text-[18px] md:text-[24px] text-[var(--lm-accent,#C9A96E)] tracking-[0.24px]">
              {t("reviews")}
            </span>
          </div>

          <div className="text-[28px] md:text-[32px] text-[var(--lm-accent,#C9A96E)] tracking-[2px]">★★★★★</div>

          <div className="flex items-center justify-center gap-6">
            <a href={GOOGLE_REVIEWS_URL} {...REVIEW_LINK_PROPS} aria-label="Google" className="transition-opacity hover:opacity-70">
              <Image src="/shared/logos/google-logo.png" alt="Google" width={150} height={51} className="h-[36px] md:h-[51px] w-auto" />
            </a>
            <a href={TRUSTPILOT_REVIEWS_URL} {...REVIEW_LINK_PROPS} aria-label="Trustpilot" className="transition-opacity hover:opacity-70">
              <Image src={cdn("/shared/logos/trustpilot-logo-green.svg")} alt="Trustpilot" width={188} height={51} className="h-[36px] md:h-[51px] w-auto" unoptimized />
            </a>
          </div>

          <button
            type="button"
            onClick={nextPage}
            className="group/see mt-2 inline-flex h-[52px] items-center gap-2 bg-[var(--lm-accent,#C9A96E)] px-8 text-[13px] font-semibold uppercase tracking-[1.2px] text-[#1a1510] transition-colors hover:bg-[#d4b87f]"
            style={{ fontFamily: "var(--font-sans), Inter, sans-serif" }}
          >
            {t("seeMore")}
            <ChevronRight className="size-4 transition-transform group-hover/see:translate-x-1" />
          </button>
        </div>

        <div className="relative hidden md:flex flex-col gap-6 w-full mt-10">
          <div className="relative">
            <div className="overflow-hidden">
            <div
              className="flex gap-[2px] transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${photoStartIdx * (100 / desktopItemsPerPage)}%)` }}
            >
              {photoTrack.map((photo, i) => (
                <div
                  key={i}
                  style={{ flex: `0 0 calc(${100 / desktopItemsPerPage}% - 2px)` }}
                  className="relative h-[355px]"
                >
                  <Image
                    src={cdn(photo)}
                    alt={`Client photo ${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="25vw"
                    /* Já são WebP à medida (<300KB). Servidas directamente: o
                       optimizador do Vercel devolve 402 com a quota esgotada e
                       uma faixa destas gasta uma transformação por foto. */
                    unoptimized
                  />
                </div>
              ))}
            </div>
            </div>
          </div>

          {/* Setas laterais para percorrer as restantes reviews. */}
          <div className="relative">
            <div className="overflow-hidden">
              <div
                className="flex gap-[2px] transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${reviewStartIdx * (100 / desktopItemsPerPage)}%)` }}
              >
                {reviewTrack.map((review, i) => (
                  <div
                    key={i}
                    style={{ flex: `0 0 calc(${100 / desktopItemsPerPage}% - 2px)` }}
                  >
                    <ReviewCard review={review} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Fotos e reviews têm setas próprias. A linha das fotos mede 355px
              (centro ~178) e a das reviews começa a 379px (355+24 de gap) e
              mede 260px (centro ~509). Cada par anda só o seu carrossel. */}
          <CarouselArrow direction="prev" onClick={prevPhoto} topClass="top-[178px]" label="Fotos anteriores" />
          <CarouselArrow direction="next" onClick={nextPhoto} topClass="top-[178px]" label="Fotos seguintes" />
          <CarouselArrow direction="prev" onClick={prevPage} topClass="top-[509px]" label="Reviews anteriores" />
          <CarouselArrow direction="next" onClick={nextPage} topClass="top-[509px]" label="Reviews seguintes" />
        </div>

        <div className="md:hidden flex flex-col gap-6 w-full mt-10">
          {/* Fotos — setas próprias + swipe, independentes das reviews. */}
          <div className="relative" {...photoSwipeHandlers}>
            <div className="flex gap-[2px]">
              {[mobilePhotoIdx, (mobilePhotoIdx + 1) % PHOTOS.length].map((idx) => (
                <div key={idx} className="flex-1 relative h-[220px]">
                  <Image
                    src={cdn(PHOTOS[idx]!)}
                    alt={`Client photo ${idx + 1}`}
                    fill
                    className="object-cover"
                    sizes="50vw"
                    unoptimized
                  />
                </div>
              ))}
            </div>
            <MobileArrow direction="prev" onClick={prevPhoto} label="Fotos anteriores" />
            <MobileArrow direction="next" onClick={nextPhoto} label="Fotos seguintes" />
          </div>

          {/* Reviews — setas próprias + swipe. */}
          <div className="relative" {...swipeHandlers}>
            <ReviewCard review={mobileReview!} />
            <MobileArrow direction="prev" onClick={prevPage} label="Reviews anteriores" />
            <MobileArrow direction="next" onClick={nextPage} label="Reviews seguintes" />
          </div>
        </div>
      </div>
    </section>
  )
}
