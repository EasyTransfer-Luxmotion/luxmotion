"use client"

import { useTranslations } from "next-intl"
import Image from "next/image"
import { cdn } from "@/lib/cdn"

function PhotoComposition({ t }: { t: (key: string) => string }) {
  return (
    <div className="w-[493px] h-[457px] relative origin-top-left scale-[0.676] md:scale-100">
      <img
        src={cdn("/tours/ellipse-blur.svg")}
        alt=""
        className="absolute left-[-61px] top-[271px] w-[577px] h-[110px] pointer-events-none"
      />

      <div className="absolute left-[185px] top-[147px] w-[297px] h-[249px]">
        <Image
          src="/tours/van-premium.webp"
          alt=""
          width={297}
          height={249}
          className="object-contain"
        />
      </div>

      <div className="absolute left-[65px] top-[-16px] flex items-center justify-center w-[184px] h-[440px]">
        <div className="-rotate-[3.05deg]">
          <div
            className="w-[161px] flex flex-col gap-[10px] items-center px-[7px] py-[10px] border border-[rgba(var(--lm-accent-rgb,154,117,53),0.22)]"
            style={{
              background:
                "linear-gradient(90deg, rgba(var(--lm-text-rgb,255,255,255),0.04) 0%, rgba(var(--lm-text-rgb,255,255,255),0.04) 100%), var(--lm-surface,#0D0D0D)",
              boxShadow: "6px 12px 30px rgba(0,0,0,0.1), 27px 47px 55px rgba(0,0,0,0.09), 62px 106px 74px rgba(0,0,0,0.05)",
            }}
          >
            {["/tours/lisbon-streets-1.png", "/tours/lisbon-streets-2.png", "/tours/lisbon-streets-3.png"].map(
              (src, i) => (
                <div key={i} className="w-[136px] h-[107px] relative overflow-hidden shrink-0 shadow-[0px_2px_8px_-2px_rgba(19,35,57,0.1)]">
                  <Image src={src} alt="" fill className="object-cover" />
                </div>
              )
            )}
            <p
              className="italic font-semibold text-[22px] text-[var(--lm-accent,#C9A96E)] tracking-[-0.35px] -rotate-[0.58deg] leading-[1.2]"
              style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
            >
              {t("redesign.photoCardText")}
            </p>
          </div>
        </div>
      </div>

      <div
        className="absolute left-[-50px] top-[30px] flex items-center gap-2 border border-[rgba(var(--lm-accent-rgb,154,117,53),0.22)] px-[14px] py-[12px] overflow-hidden shadow-[0px_9px_30px_-6px_rgba(19,35,57,0.15)]"
        style={{
          background:
            "linear-gradient(90deg, rgba(var(--lm-accent-rgb,154,117,53),0.22) 0%, rgba(var(--lm-accent-rgb,154,117,53),0.22) 100%), var(--lm-surface,#0D0D0D)",
        }}
      >
        <img src={cdn("/tours/stars-rating.svg")} alt="5 stars" className="w-[102px] h-[16px]" />
        <div className="flex flex-col gap-2">
          <span
            className="text-[14px] font-semibold text-[var(--lm-text,#fff)] leading-none whitespace-nowrap"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("redesign.reviewStars")}
          </span>
          <span
            className="text-[12px] text-[var(--lm-muted,#999)] leading-none whitespace-nowrap"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            {t("redesign.reviewCount")}
          </span>
        </div>
      </div>
    </div>
  )
}

export function TourStory() {
  const t = useTranslations("tourStory")

  return (
    <section className="bg-[var(--lm-bg,#0D0D0D)] pt-12 pb-16 px-4 md:px-[82px]">
      <div className="max-w-[1280px] mx-auto relative">
        <div className="flex flex-col gap-[29px] md:max-w-[640px] md:min-h-[457px] md:justify-center">
          <div className="flex items-center gap-2">
            <div className="w-[82px] h-px bg-[var(--lm-accent,#C9A96E)]" />
            <span
              className="text-[12px] font-semibold uppercase tracking-[2px] text-[var(--lm-accent,#C9A96E)] whitespace-nowrap"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              {t("redesign.label")}
            </span>
          </div>

          <h2
            className="text-[32px] md:text-[48px] leading-[1.2] text-[var(--lm-text,#F5F5F5)]"
            style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}
          >
            {t("redesign.headingPart1")}{" "}
            <span className="italic text-[var(--lm-accent,#C9A96E)]">{t("redesign.headingPart2")}</span>.
          </h2>

          <div
            className="flex flex-col gap-4 text-[14px] text-[var(--lm-muted,#999)] leading-[1.3]"
            style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            <p>{t("redesign.paragraph1")}</p>
            <p>{t("redesign.paragraph2")}</p>
          </div>
        </div>

        <div className="hidden md:block absolute right-0 top-[10px] w-[493px] h-[457px]">
          <PhotoComposition t={t} />
        </div>

        <div className="md:hidden relative mt-10 flex justify-center">
          <div className="w-[333px] h-[305px] relative ml-8">
            <PhotoComposition t={t} />
          </div>
        </div>
      </div>
    </section>
  )
}
