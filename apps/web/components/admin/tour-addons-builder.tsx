"use client"

import * as React from "react"
import { useMutation, useQueries, useQuery } from "convex/react"
import type { RequestForQueries } from "convex/react"
import { api } from "@workspace/convex/api"
import type { Id } from "@workspace/convex/dataModel"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { AddonImagePicker } from "./addon-image-picker"
import { MiniaturaImagem } from "./miniatura-imagem"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"
import { Plus, Trash2, Languages, Loader2, Gem } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { LANGUAGES } from "./constants"

interface TourAddonsBuilderProps {
  entityId?: string
  entityType: "tour" | "event"
  originalLanguage: string
}

function AddonCard({
  addon,
  onUpdate,
  onRemove,
  onOpenTranslations,
  isSaving,
  t,
}: {
  addon: any
  onUpdate: (id: string, field: string, value: any) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onOpenTranslations: (id: string) => void
  isSaving: boolean
  t: (key: string) => string
}) {
  const [title, setTitle] = React.useState(addon.title)
  const [description, setDescription] = React.useState(addon.description ?? "")
  const [price, setPrice] = React.useState(String(addon.price))

  const titleRef = React.useRef(addon.title)
  const descRef = React.useRef(addon.description ?? "")
  const priceRef = React.useRef(String(addon.price))

  React.useEffect(() => {
    if (addon.title !== titleRef.current) {
      titleRef.current = addon.title
      setTitle(addon.title)
    }
  }, [addon.title])

  React.useEffect(() => {
    const val = addon.description ?? ""
    if (val !== descRef.current) {
      descRef.current = val
      setDescription(val)
    }
  }, [addon.description])

  React.useEffect(() => {
    const val = String(addon.price)
    if (val !== priceRef.current) {
      priceRef.current = val
      setPrice(val)
    }
  }, [addon.price])

  const handleBlur = (field: string, value: string) => {
    if (field === "title" && value !== addon.title) {
      titleRef.current = value
      onUpdate(addon._id, "title", value)
    } else if (field === "description" && value !== (addon.description ?? "")) {
      descRef.current = value
      onUpdate(addon._id, "description", value)
    } else if (field === "price") {
      const numVal = parseFloat(value) || 0
      if (numVal !== addon.price) {
        priceRef.current = String(numVal)
        onUpdate(addon._id, "price", numVal)
      }
    }
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-4 bg-card">
      <div className="flex items-start gap-4">
        <div className="w-32 shrink-0">
          <Label className="text-xs mb-1 block">{t("form.addonImageLabel")}</Label>
          {/* Biblioteca em vez de upload directo: as imagens dos extras são
              sempre as mesmas e carregá-las de novo em cada tour e cada evento
              era trabalho repetido. `null` limpa, e a mutation já o distingue de
              "não mexas". */}
          <AddonImagePicker
            value={addon.imageUrl}
            addonTitle={addon.title}
            onChange={(storageId) =>
              onUpdate(
                addon._id,
                "imageId",
                storageId as string | null,
              )
            }
            disabled={isSaving}
            labels={{
              choose: t("form.addonImageChoose"),
              library: t("form.addonImageLibrary"),
              libraryHint: t("form.addonImageLibraryHint"),
              upload: t("form.addonImageUpload"),
              uploading: t("form.addonImageUploading"),
              empty: t("form.addonImageEmpty"),
              remove: t("form.addonImageRemove"),
              rename: t("form.addonImageRename"),
            }}
          />
        </div>

        <div className="flex-1 space-y-3">
          <div>
            <Label className="text-xs">{t("form.addonTitleLabel")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => handleBlur("title", title)}
              placeholder={t("form.addonTitlePlaceholder")}
              className="h-9 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs">{t("form.addonDescriptionLabel")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => handleBlur("description", description)}
              placeholder={t("form.addonDescriptionPlaceholder")}
              className="text-sm min-h-[60px]"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("form.addonPriceLabel")}</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={() => handleBlur("price", price)}
                className="h-9 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">{t("form.addonPricingTypeLabel")}</Label>
              <Select
                value={addon.pricingType}
                onValueChange={(v) => onUpdate(addon._id, "pricingType", v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_person">{t("form.addonPricingPerPerson")}</SelectItem>
                  <SelectItem value="flat">{t("form.addonPricingFlat")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <Select
            value={addon.status}
            onValueChange={(v) => onUpdate(addon._id, "status", v)}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("draft")}</SelectItem>
              <SelectItem value="published">{t("published")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenTranslations(addon._id)}
              title={t("form.addonTranslations")}
            >
              <Languages className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onRemove(addon._id)}
              disabled={isSaving}
              title={t("form.removeAddon")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Os extras universais que se aplicam a este tour ou evento.
 *
 * Não se editam aqui — vivem em /admin/universal-addons e o preço está num sítio
 * só. O que se pode é desligar os que não servem a este: um tour a pé não vende
 * "Bagagem Extra".
 */
function UniversaisAplicaveis({
  entityId,
  entityType,
}: {
  entityId: string
  entityType: "tour" | "event"
}) {
  const args = React.useMemo(
    () =>
      entityType === "tour"
        ? { tourId: entityId as Id<"tours"> }
        : { eventId: entityId as Id<"events"> },
    [entityId, entityType],
  )

  /* `useQueries` e não `useQuery`: enquanto `universalAddons.listForOwner` não
     estiver deployada, o formulário do tour continua a abrir em vez de dar ecrã
     de erro. */
  const queries: RequestForQueries = React.useMemo(
    () => ({
      lista: {
        query: api.universalAddons.listForOwner,
        // Os ids do Convex são strings com marca; a assinatura do `useQueries`
        // só aceita valores simples.
        args: args as unknown as Record<string, string>,
      },
    }),
    [args],
  )
  const bruto = useQueries(queries).lista
  const universais = Array.isArray(bruto)
    ? (bruto as Array<{
        _id: Id<"universalAddons">
        title: string
        description?: string
        price: number
        pricingType: "per_person" | "flat"
        imageUrl: string | null
        status: "draft" | "published"
        disabled: boolean
      }>)
    : []

  const alternar = useMutation(api.universalAddons.setDisabled)
  const [aGuardar, setAGuardar] = React.useState<string | null>(null)

  if (universais.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <h4 className="text-sm font-semibold text-foreground">
        Extras universais que se aplicam aqui
      </h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Definidos uma vez em Extras universais. Desliga os que não servem a este{" "}
        {entityType === "tour" ? "tour" : "evento"}.
      </p>

      <div className="mt-3 space-y-2">
        {universais.map((u) => (
          <div
            key={u._id}
            className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
          >
            {u.imageUrl ? (
              <MiniaturaImagem
                url={u.imageUrl}
                alt={u.title}
                className="h-9 w-[52px] shrink-0 overflow-hidden rounded"
              />
            ) : (
              <div className="h-9 w-[52px] shrink-0 rounded bg-muted" />
            )}

            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm font-medium", u.disabled && "text-muted-foreground line-through")}>
                {u.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {u.price.toFixed(2)} € {u.pricingType === "per_person" ? "/ pessoa" : "fixo"}
                {u.status === "draft" && " · rascunho"}
              </p>
            </div>

            <Switch
              checked={!u.disabled}
              disabled={aGuardar === u._id}
              onCheckedChange={async (ligado) => {
                setAGuardar(u._id)
                try {
                  await alternar({ addonId: u._id, ...args, disabled: !ligado })
                } catch (erro) {
                  console.error(erro)
                  toast.error("Não foi possível guardar.")
                } finally {
                  setAGuardar(null)
                }
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TourAddonsBuilder({ entityId, entityType, originalLanguage }: TourAddonsBuilderProps) {
  const tKey = entityType === "tour" ? "adminTours" : "adminEvents"
  const t = useTranslations(tKey)

  const addons = useQuery(
    entityType === "tour" ? api.tourAddons.listByTour : api.tourAddons.listByEvent,
    entityId
      ? entityType === "tour"
        ? { tourId: entityId as Id<"tours"> }
        : { eventId: entityId as Id<"events"> }
      : "skip"
  )

  const createAddon = useMutation(api.tourAddons.create)
  const updateAddon = useMutation(api.tourAddons.update)
  const removeAddon = useMutation(api.tourAddons.remove)
  const upsertTranslation = useMutation(api.tourAddons.upsertTranslation)

  const [savingId, setSavingId] = React.useState<string | null>(null)
  const [translationAddonId, setTranslationAddonId] = React.useState<string | null>(null)

  if (!entityId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Gem className="h-10 w-10 mb-3" />
        <p className="text-sm">{t("form.saveFirst")}</p>
      </div>
    )
  }

  const handleAdd = async () => {
    setSavingId("new")
    try {
      await createAddon({
        tourId: entityType === "tour" ? (entityId as Id<"tours">) : undefined,
        eventId: entityType === "event" ? (entityId as Id<"events">) : undefined,
        title: "",
        price: 0,
        pricingType: "per_person",
        currency: "EUR",
        originalLanguage,
        order: addons?.length ?? 0,
        status: "draft" as const,
      })
    } finally {
      setSavingId(null)
    }
  }

  const handleUpdate = async (id: string, field: string, value: any) => {
    setSavingId(id)
    try {
      await updateAddon({ id: id as Id<"tourAddons">, [field]: value })
    } finally {
      setSavingId(null)
    }
  }

  const handleRemove = async (id: string) => {
    setSavingId(id)
    try {
      await removeAddon({ id: id as Id<"tourAddons"> })
      toast.success(t("form.addonRemoved"))
    } finally {
      setSavingId(null)
    }
  }

  const translationAddon = addons?.find((a) => a._id === translationAddonId)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t("form.addonsTitle")}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{t("form.addonsDescription")}</p>
      </div>

      <UniversaisAplicaveis entityId={entityId} entityType={entityType} />

      {addons === undefined ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : addons.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {t("form.addonsDescription")}
        </div>
      ) : (
        <div className="space-y-4">
          {addons.map((addon) => (
            <AddonCard
              key={addon._id}
              addon={addon}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
              onOpenTranslations={setTranslationAddonId}
              isSaving={savingId === addon._id}
              t={t}
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={handleAdd}
        disabled={savingId === "new"}
        className="w-full"
      >
        {savingId === "new" ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        {t("form.addAddon")}
      </Button>

      {translationAddon && (
        <AddonTranslationDialog
          addon={translationAddon}
          originalLanguage={originalLanguage}
          onClose={() => setTranslationAddonId(null)}
          upsertTranslation={upsertTranslation}
          t={t}
        />
      )}
    </div>
  )
}

function AddonTranslationDialog({
  addon,
  originalLanguage,
  onClose,
  upsertTranslation,
  t,
}: {
  addon: any
  originalLanguage: string
  onClose: () => void
  upsertTranslation: any
  t: (key: string) => string
}) {
  const locales = LANGUAGES.filter((l) => l.value !== originalLanguage)
  const [selectedLocale, setSelectedLocale] = React.useState(locales[0]?.value ?? "en")
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [isSaving, setIsSaving] = React.useState(false)

  React.useEffect(() => {
    const existing = addon.translations?.find((t: any) => t.locale === selectedLocale)
    setTitle(existing?.title ?? "")
    setDescription(existing?.description ?? "")
  }, [selectedLocale, addon.translations])

  const handleSave = async () => {
    if (!title.trim()) return
    setIsSaving(true)
    try {
      await upsertTranslation({
        addonId: addon._id,
        locale: selectedLocale,
        title: title.trim(),
        description: description.trim() || undefined,
      })
      toast.success(t("form.addonTranslationSaved"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("form.addonTranslations")} — {addon.title || "Untitled"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Language</Label>
            <Select
              value={selectedLocale}
              onValueChange={(value) => setSelectedLocale(value as typeof selectedLocale)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                    {addon.translations?.some((t: any) => t.locale === l.value) && " ✓"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{t("form.addonTitleLabel")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={addon.title}
              className="h-9 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs">{t("form.addonDescriptionLabel")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={addon.description ?? ""}
              className="text-sm min-h-[60px]"
              rows={2}
            />
          </div>

          <Button onClick={handleSave} disabled={isSaving || !title.trim()} className="w-full">
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("form.saveChanges") ?? "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
