"use client"

import * as React from "react"
import { usePublicarImagem } from "@/hooks/use-publicar-imagem"
import { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@workspace/convex/api"
import { CORPORATE_LANGUAGES } from "@workspace/convex/convex/lib/corporateExperienceTranslations"
import {
  Info,
  FileText,
  Image as ImageIcon,
  Settings,
  Loader2,
  Upload,
  X,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Tabs, TabsContent } from "@workspace/ui/components/tabs"
import { toast } from "sonner"

const STEP_ORDER = ["basics", "details", "media", "settings"]

type Pillar = "standard" | "experiences" | "logistics"
type Duration = "halfDay" | "fullDay" | "multiDay"

const SUBCATEGORIES: Record<Pillar, { value: string; label: string }[]> = {
  standard: [
    { value: "incentive", label: "Incentive Travel" },
    { value: "gala", label: "Corporate & Gala Dinners" },
    { value: "conventions", label: "Conventions" },
    { value: "congresses", label: "Congresses" },
    { value: "meetings", label: "Meetings & Seminars" },
    { value: "cultural", label: "Cultural Events" },
  ],
  experiences: [
    { value: "teambuilding", label: "Teambuilding Games" },
    { value: "activities", label: "Activities & Tours" },
    { value: "sightseeing", label: "Sightseeing Excursions" },
    { value: "foodwine", label: "Food & Wine" },
    { value: "sport", label: "Sport & Nature" },
    { value: "entertainment", label: "Entertainment" },
  ],
  logistics: [
    { value: "premium", label: "Transfers" },
    { value: "airport", label: "Airport Meet & Greet" },
    { value: "hotels", label: "Hotels & Accommodation" },
    { value: "guides", label: "Guides & Local Assistance" },
  ],
}

function parseExperienceItems(text: string): { strong: string; body: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("|")
      if (idx === -1) return { strong: "", body: line }
      return {
        strong: line.slice(0, idx).trim(),
        body: line.slice(idx + 1).trim(),
      }
    })
}

function serializeExperienceItems(items: { strong: string; body: string }[]): string {
  return items.map((i) => `${i.strong} | ${i.body}`).join("\n")
}

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
}

export function CorporateExperienceForm({
  onClose,
  initialData,
}: {
  onClose: () => void
  initialData?: any
}) {
  const create = useMutation(api.corporateExperiences.create)
  const update = useMutation(api.corporateExperiences.update)
  const publicarImagem = usePublicarImagem()

  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeTab, setActiveTab] = useState("basics")

  const [titlePrefix, setTitlePrefix] = useState("")
  const [originalLanguage, setOriginalLanguage] = useState("pt")
  const [titleAccent, setTitleAccent] = useState("")
  const [shortDescription, setShortDescription] = useState("")
  const [duration, setDuration] = useState<Duration>("halfDay")
  const [pillar, setPillar] = useState<Pillar>("experiences")
  const [subcategory, setSubcategory] = useState<string>("teambuilding")
  const [groupSize, setGroupSize] = useState("")
  const [durationLabel, setDurationLabel] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [experienceBody, setExperienceBody] = useState("")
  const [experienceItemsText, setExperienceItemsText] = useState("")
  const [routeHighlightsText, setRouteHighlightsText] = useState("")
  const [whatsIncludedText, setWhatsIncludedText] = useState("")
  const [coverImageId, setCoverImageId] = useState<string | undefined>()
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [galleryImageIds, setGalleryImageIds] = useState<string[]>([])
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([])
  const [status, setStatus] = useState<"draft" | "published">("draft")
  const [sortOrder, setSortOrder] = useState(0)

  useEffect(() => {
    setActiveTab("basics")
    setOriginalLanguage(initialData?.originalLanguage ?? "pt")
    if (initialData) {
      setTitlePrefix(initialData.titlePrefix || "")
      setTitleAccent(initialData.titleAccent || "")
      setShortDescription(initialData.shortDescription || "")
      setDuration(initialData.duration || "halfDay")
      setPillar(initialData.pillar || "experiences")
      setSubcategory(initialData.subcategory || "teambuilding")
      setGroupSize(initialData.groupSize || "")
      setDurationLabel(initialData.durationLabel || "")
      setLocation(initialData.location || "")
      setDescription(initialData.description || "")
      setExperienceBody(initialData.experienceBody || "")
      setExperienceItemsText(serializeExperienceItems(initialData.experienceItems ?? []))
      setRouteHighlightsText((initialData.routeHighlights ?? []).join("\n"))
      setWhatsIncludedText((initialData.whatsIncluded ?? []).join("\n"))
      setCoverImageId(initialData.coverImageId)
      setCoverPreview(initialData.coverImageUrl ?? null)
      setGalleryImageIds(initialData.galleryImageIds ?? [])
      setGalleryPreviews(
        (initialData.galleryImageUrls ?? []).filter((u: any): u is string => Boolean(u)),
      )
      setStatus(initialData.status || "draft")
      setSortOrder(initialData.sortOrder ?? 0)
    } else {
      setTitlePrefix("")
      setTitleAccent("")
      setShortDescription("")
      setDuration("halfDay")
      setPillar("experiences")
      setSubcategory("teambuilding")
      setGroupSize("")
      setDurationLabel("")
      setLocation("")
      setDescription("")
      setExperienceBody("")
      setExperienceItemsText("")
      setRouteHighlightsText("")
      setWhatsIncludedText("")
      setCoverImageId(undefined)
      setCoverPreview(null)
      setGalleryImageIds([])
      setGalleryPreviews([])
      setStatus("draft")
      setSortOrder(0)
    }
  }, [initialData])

  const uploadFile = async (file: File): Promise<string> => {
    const { caminho } = await publicarImagem(file)
    return caminho
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const id = await uploadFile(file)
      setCoverImageId(id)
      setCoverPreview(URL.createObjectURL(file))
    } catch (err) {
      toast.error("Cover upload failed")
    } finally {
      setUploading(false)
    }
  }

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      const ids = await Promise.all(files.map(uploadFile))
      setGalleryImageIds((prev) => [...prev, ...ids].slice(0, 8))
      setGalleryPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))].slice(0, 8))
    } catch (err) {
      toast.error("Gallery upload failed")
    } finally {
      setUploading(false)
    }
  }

  const removeGalleryItem = (i: number) => {
    setGalleryImageIds((prev) => prev.filter((_, idx) => idx !== i))
    setGalleryPreviews((prev) => prev.filter((_, idx) => idx !== i))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    // Wizard: pressing Enter / submitting before the last step just advances.
    if (activeTab !== "settings") {
      const idx = STEP_ORDER.indexOf(activeTab)
      setActiveTab(STEP_ORDER[Math.min(STEP_ORDER.length - 1, idx + 1)]!)
      return
    }

    if (!titlePrefix.trim() || !titleAccent.trim() || !shortDescription.trim()) {
      toast.error("Title and short description are required")
      setActiveTab("basics")
      return
    }

    setSubmitting(true)
    const payload = {
      originalLanguage,
      titlePrefix: titlePrefix.trim(),
      titleAccent: titleAccent.trim(),
      shortDescription: shortDescription.trim(),
      duration,
      pillar,
      subcategory,
      groupSize: groupSize.trim(),
      durationLabel: durationLabel.trim(),
      location: location.trim(),
      description: description.trim(),
      experienceBody: experienceBody.trim(),
      experienceItems: parseExperienceItems(experienceItemsText),
      routeHighlights: parseLines(routeHighlightsText),
      whatsIncluded: parseLines(whatsIncludedText),
      coverImageId,
      galleryImageIds,
      status,
      sortOrder,
    }

    try {
      if (initialData) {
        await update({ id: initialData._id, ...payload })
        toast.success("Experience updated")
      } else {
        await create(payload)
        toast.success("Experience created")
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast.error("Save failed")
    } finally {
      setSubmitting(false)
    }
  }

  const subOptions = SUBCATEGORIES[pillar]

  const headerTitle = initialData ? "Edit experience" : "New experience"
  const headerDescription = initialData
    ? "Update this corporate experience."
    : "Create a new corporate experience."

  const STEPS = [
    { value: "basics", label: "Basics", icon: Info },
    { value: "details", label: "Details", icon: FileText },
    { value: "media", label: "Media", icon: ImageIcon },
    { value: "settings", label: "Settings", icon: Settings },
  ]
  const currentStepIndex = Math.max(0, STEP_ORDER.indexOf(activeTab))

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-foreground">{headerTitle}</h2>
          <p className="text-sm text-muted-foreground">{headerDescription}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="shrink-0 rounded-full h-9 w-9 flex items-center justify-center bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="sticky -top-5 z-10 -mx-4 -mt-5 border-b border-border bg-background px-4 pb-3 pt-8 lg:-top-6 lg:-mx-8 lg:-mt-6 lg:px-8 lg:pt-9">
        <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-[1px] text-muted-foreground">
          <span className="truncate">{STEPS[currentStepIndex]?.label}</span>
          <span className="shrink-0 pl-3 tabular-nums">
            {currentStepIndex + 1} / {STEPS.length}
          </span>
        </div>
        <div className="relative h-1 w-full overflow-hidden rounded bg-muted">
          <div
            className="absolute left-0 top-0 h-1 rounded bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STEPS.map((step, i) => {
            const isActive = step.value === activeTab
            const isDone = i < currentStepIndex
            return (
              <button
                key={step.value}
                type="button"
                onClick={() => setActiveTab(step.value)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : isDone
                      ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15"
                      : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                    isActive
                      ? "bg-primary-foreground/20"
                      : isDone
                        ? "bg-primary/20"
                        : "bg-muted",
                  )}
                >
                  {isDone ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="whitespace-nowrap">{step.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="rounded-lg border border-border bg-card">
          <TabsContent value="basics" className="p-6 mt-0 space-y-4 data-[state=inactive]:hidden">
            <div className="flex max-w-xs flex-col gap-1.5">
              <Label>Original language *</Label>
              <Select value={originalLanguage} onValueChange={setOriginalLanguage} disabled={submitting}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CORPORATE_LANGUAGES.map((language) => (
                    <SelectItem key={language.value} value={language.value}>{language.flag} {language.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Title prefix *</Label>
                <Input
                  value={titlePrefix}
                  onChange={(e) => setTitlePrefix(e.target.value)}
                  placeholder="Lisbon Vintage:"
                  className="h-9"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Title accent (italic gold) *</Label>
                <Input
                  value={titleAccent}
                  onChange={(e) => setTitleAccent(e.target.value)}
                  placeholder="Polaroid Challenge"
                  className="h-9"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Short description (card preview) *</Label>
              <Textarea
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                rows={2}
                placeholder="Explore Lisbon through a vintage Polaroid lens..."
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Pillar</Label>
                <Select
                  value={pillar}
                  onValueChange={(v) => {
                    setPillar(v as Pillar)
                    setSubcategory(SUBCATEGORIES[v as Pillar][0]!.value)
                  }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Events & MICE</SelectItem>
                    <SelectItem value="experiences">Experiences & Teambuilding</SelectItem>
                    <SelectItem value="logistics">Logistics & Concierge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Subcategory</Label>
                <Select value={subcategory} onValueChange={setSubcategory}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Duration</Label>
                <Select value={duration} onValueChange={(v) => setDuration(v as Duration)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="halfDay">Half day</SelectItem>
                    <SelectItem value="fullDay">Full day</SelectItem>
                    <SelectItem value="multiDay">Multi-day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Group size</Label>
                <Input value={groupSize} onChange={(e) => setGroupSize(e.target.value)} placeholder="10–80 people" className="h-9" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Duration label</Label>
                <Input value={durationLabel} onChange={(e) => setDurationLabel(e.target.value)} placeholder="3-4 hours" className="h-9" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lisbon · Chiado & Baixa" className="h-9" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="details" className="p-6 mt-0 space-y-4 data-[state=inactive]:hidden">
            <div className="flex flex-col gap-1.5">
              <Label>Description (drawer overview)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Step back in time and capture the soul of Lisbon..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Experience body (long text)</Label>
              <Textarea
                value={experienceBody}
                onChange={(e) => setExperienceBody(e.target.value)}
                rows={6}
                placeholder="Operating in the historic heart of the city..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Experience items (one per line, format: <code>Strong | body</code>)</Label>
              <Textarea
                value={experienceItemsText}
                onChange={(e) => setExperienceItemsText(e.target.value)}
                rows={4}
                placeholder={'The "One-Shot" Quest: | Identify specific architectural details...\nLocal Portraits: | Interact with the "Lisboetas"...'}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Route highlights (one per line)</Label>
                <Textarea
                  value={routeHighlightsText}
                  onChange={(e) => setRouteHighlightsText(e.target.value)}
                  rows={5}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>What&apos;s included (one per line)</Label>
                <Textarea
                  value={whatsIncludedText}
                  onChange={(e) => setWhatsIncludedText(e.target.value)}
                  rows={5}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="media" className="p-6 mt-0 space-y-4 data-[state=inactive]:hidden">
            <div className="flex flex-col gap-2">
              <Label>Cover image (card thumbnail)</Label>
              <div className="flex items-start gap-3">
                {coverPreview ? (
                  <div className="relative h-24 w-32 border border-border rounded overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={coverPreview} alt="" className="size-full object-cover" />
                  </div>
                ) : (
                  <div className="h-24 w-32 border border-dashed border-border rounded bg-muted" />
                )}
                <label className="inline-flex items-center gap-2 h-9 px-3 text-sm border border-border rounded-md cursor-pointer hover:bg-accent">
                  <Upload className="size-4" />
                  Choose file
                  <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Gallery images (drawer thumbnails, max 8)</Label>
              <div className="flex flex-wrap gap-2">
                {galleryPreviews.map((src, i) => (
                  <div key={i} className="relative h-20 w-20 border border-border rounded overflow-hidden group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeGalleryItem(i)}
                      className="absolute top-1 right-1 size-5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {galleryImageIds.length < 8 && (
                  <label className="h-20 w-20 border border-dashed border-border rounded bg-muted cursor-pointer flex items-center justify-center hover:bg-accent">
                    <Upload className="size-4 text-muted-foreground" />
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} />
                  </label>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="p-6 mt-0 space-y-4 data-[state=inactive]:hidden">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as "draft" | "published")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Sort order (lower = first)</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <div className="-mx-4 flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-4 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="h-11 px-5"
          >
            Cancel
          </Button>
          {currentStepIndex > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab(STEP_ORDER[currentStepIndex - 1]!)}
              disabled={submitting}
              className="h-11 px-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Anterior
            </Button>
          )}
        </div>
        {currentStepIndex < STEP_ORDER.length - 1 ? (
          <Button
            type="button"
            onClick={() => setActiveTab(STEP_ORDER[currentStepIndex + 1]!)}
            className="h-11 px-8 font-bold"
          >
            Seguinte
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={submitting || uploading} className="h-11 px-8 font-bold">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? "Save changes" : "Create"}
          </Button>
        )}
      </div>
    </form>
  )
}
