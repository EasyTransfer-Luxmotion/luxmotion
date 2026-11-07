"use client"

import * as React from "react"
import { CatalogTranslationsEditor } from "./catalog-translations-editor"
import type { CatalogTranslation } from "@/lib/catalog-translations"
import { useMutation } from "convex/react"
import { api } from "@workspace/convex/api"
import type { Id } from "@workspace/convex/dataModel"
import { Loader2, MapPin, Globe2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Switch } from "@workspace/ui/components/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { GoogleMapsInput } from "@/components/admin/google-maps-input"
import { ImageUpload } from "@/components/admin/image-upload"
import { UpsellCheckoutPreview } from "@/components/admin/upsell-checkout-preview"
import {
  PRICING_LABELS,
  TAG_LABELS,
  type UpsellPricingModel,
  type UpsellTag,
} from "@/components/admin/upsell-shared"

type AddonDraft = {
  translations?: CatalogTranslation[]
  name: string
  price: string
  pricingType: "per_person" | "flat"
}

export interface UpsellExperienceInitialData {
  _id: Id<"upsellExperiences">
  title: string
  translations?: CatalogTranslation[]
  description?: string
  imageId?: string
  imageUrl?: string | null
  location?: {
    title: string
    address: string
    lat?: number
    lng?: number
    placeId?: string
  }
  basePrice: number
  pricingModel: UpsellPricingModel
  duration?: string
  addons?: { translations?: CatalogTranslation[]; name: string; price: number; pricingType?: "per_person" | "flat" }[]
  hasDateField: boolean
  hasSpecialRequest: boolean
  tag: UpsellTag
  universal: boolean
  status: "draft" | "published"
  order: number
}

export function UpsellExperienceForm({
  initialData,
  onClose,
}: {
  initialData?: UpsellExperienceInitialData
  onClose: () => void
}) {
  const create = useMutation(api.upsells.createExperience)
  const update = useMutation(api.upsells.updateExperience)

  const [translations, setTranslations] = React.useState<CatalogTranslation[]>(initialData?.translations ?? [])
  const [title, setTitle] = React.useState(initialData?.title ?? "")
  const [description, setDescription] = React.useState(initialData?.description ?? "")
  const [imageId, setImageId] = React.useState<string | undefined>(initialData?.imageId)
  const [imageUrl, setImageUrl] = React.useState<string | null>(initialData?.imageUrl ?? null)
  const [location, setLocation] = React.useState(initialData?.location ?? null)
  const [basePrice, setBasePrice] = React.useState(String(initialData?.basePrice ?? ""))
  const [pricingModel, setPricingModel] = React.useState<UpsellPricingModel>(
    initialData?.pricingModel ?? "perPerson",
  )
  const [duration, setDuration] = React.useState(initialData?.duration ?? "")
  const [addons, setAddons] = React.useState<AddonDraft[]>(
    (initialData?.addons ?? []).map((a) => ({
      name: a.name,
      translations: a.translations,
      price: String(a.price),
      pricingType: a.pricingType ?? "flat",
    })),
  )
  const [hasDateField, setHasDateField] = React.useState(initialData?.hasDateField ?? true)
  const [hasSpecialRequest, setHasSpecialRequest] = React.useState(
    initialData?.hasSpecialRequest ?? false,
  )
  const [tag, setTag] = React.useState<UpsellTag>(initialData?.tag ?? "none")
  const [universal, setUniversal] = React.useState(initialData?.universal ?? false)
  const [status, setStatus] = React.useState<"draft" | "published">(
    initialData?.status ?? "draft",
  )
  const [submitting, setSubmitting] = React.useState(false)

  const parsedBasePrice = Number.parseFloat(basePrice)

  const updateAddon = (index: number, patch: Partial<AddonDraft>) => {
    setAddons((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      toast.error("Dá um nome à experiência")
      return
    }
    if (!Number.isFinite(parsedBasePrice) || parsedBasePrice < 0) {
      toast.error("Preenche o preço base")
      return
    }
    if (!universal && (location?.lat == null || location?.lng == null)) {
      toast.error(
        "Escolhe um local no mapa, ou marca a experiência como universal — sem coordenadas nunca aparece no checkout",
      )
      return
    }
    const cleanedAddons = addons
      .map((a) => ({
        name: a.name.trim(),
        translations: a.translations,
        price: Number.parseFloat(a.price),
        pricingType: a.pricingType,
      }))
      .filter((a) => a.name !== "")
    if (cleanedAddons.some((a) => !Number.isFinite(a.price) || a.price < 0)) {
      toast.error("Há um extra com preço inválido")
      return
    }

    const payload = {
      title: title.trim(),
      translations,
      description: description.trim() || undefined,
      imageId,
      location: location
        ? {
            title: location.title,
            address: location.address,
            lat: location.lat,
            lng: location.lng,
            placeId: location.placeId,
          }
        : undefined,
      basePrice: parsedBasePrice,
      pricingModel,
      duration: duration.trim() || undefined,
      addons: cleanedAddons,
      hasDateField,
      hasSpecialRequest,
      tag,
      universal,
      status,
    }

    try {
      setSubmitting(true)
      if (initialData) {
        await update({ id: initialData._id, ...payload })
        toast.success("Experiência actualizada")
      } else {
        await create(payload)
        toast.success("Experiência criada")
      }
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      toast.error(
        /upsellExperiences|ArgumentValidation/i.test(message)
          ? "Backend desactualizado — corre `npx convex deploy`."
          : "Não foi possível guardar",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Experiência</h2>

          <div className="space-y-2">
            <Label htmlFor="upsell-exp-title">Nome</Label>
            <Input
              id="upsell-exp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Prova de vinhos em Colares"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="upsell-exp-description">Descrição</Label>
            <Textarea
              id="upsell-exp-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="upsell-exp-duration">Duração</Label>
            <Input
              id="upsell-exp-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="2h"
            />
          </div>

          <div className="space-y-2">
            <Label>Imagem</Label>
            <ImageUpload
              value={imageUrl}
              onChange={(storageId, previewUrl) => {
                setImageId(storageId as string | undefined)
                setImageUrl(previewUrl ?? null)
              }}
            />
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Preço</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="upsell-exp-price">Preço base (€)</Label>
              <Input
                id="upsell-exp-price"
                type="number"
                min={0}
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Modelo</Label>
              <Select
                value={pricingModel}
                onValueChange={(value) => setPricingModel(value as UpsellPricingModel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRICING_LABELS) as UpsellPricingModel[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {PRICING_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Extras</h2>
              <p className="text-sm text-muted-foreground">
                Opções somadas ao preço dentro do modal, quando o cliente adiciona
                esta experiência.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setAddons((prev) => [...prev, { name: "", price: "", pricingType: "flat" }])
              }
            >
              <Plus className="mr-2 size-4" />
              Extra
            </Button>
          </div>

          {addons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem extras.</p>
          ) : (
            <div className="space-y-3">
              {addons.map((addon, index) => (
                <div key={index} className="space-y-3">
                <div
                  className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_120px_150px_auto]"
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome</Label>
                    <Input
                      value={addon.name}
                      onChange={(e) => updateAddon(index, { name: e.target.value })}
                      placeholder="Prova alargada"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Preço (€)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={addon.price}
                      onChange={(e) => updateAddon(index, { price: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cobrança</Label>
                    <Select
                      value={addon.pricingType}
                      onValueChange={(value) =>
                        updateAddon(index, {
                          pricingType: value as "per_person" | "flat",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">Preço fixo</SelectItem>
                        <SelectItem value="per_person">Por pessoa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setAddons((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <CatalogTranslationsEditor
                  value={addon.translations ?? []}
                  onChange={(next) => updateAddon(index, { translations: next })}
                  fields={[{ key: "name", label: "Nome do extra" }]}
                />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Modal</h2>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-1">
              <Label htmlFor="upsell-exp-date">Pedir data</Label>
              <p className="text-sm text-muted-foreground">
                Mostra o calendário. Desliga-o em experiências sem marcação.
              </p>
            </div>
            <Switch
              id="upsell-exp-date"
              checked={hasDateField}
              onCheckedChange={setHasDateField}
            />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-1">
              <Label htmlFor="upsell-exp-request">Pedido especial</Label>
              <p className="text-sm text-muted-foreground">
                Caixa de texto livre para restrições alimentares, ocasiões, etc.
              </p>
            </div>
            <Switch
              id="upsell-exp-request"
              checked={hasSpecialRequest}
              onCheckedChange={setHasSpecialRequest}
            />
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Onde aparece</h2>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-1">
              <Label htmlFor="upsell-exp-universal" className="flex items-center gap-2">
                <Globe2 className="size-4 text-muted-foreground" />
                Universal
              </Label>
              <p className="text-sm text-muted-foreground">
                Aparece em qualquer checkout. Desligado, só a quem vai para perto daqui.
              </p>
            </div>
            <Switch
              id="upsell-exp-universal"
              checked={universal}
              onCheckedChange={setUniversal}
            />
          </div>

          {!universal && (
            <div className="space-y-2">
              <GoogleMapsInput
                label="Local"
                value={location}
                onChange={(next) => setLocation(next)}
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3" />
                {location?.lat != null && location?.lng != null
                  ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
                  : "Escolhe uma sugestão do Google para fixar as coordenadas."}
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Apresentação</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Selo</Label>
              <Select value={tag} onValueChange={(value) => setTag(value as UpsellTag)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TAG_LABELS) as UpsellTag[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {TAG_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as "draft" | "published")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="published">Publicado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <CatalogTranslationsEditor
          value={translations}
          onChange={setTranslations}
          fields={[{ key: "title", label: "Nome" }, { key: "description", label: "Descrição", multiline: true }, { key: "duration", label: "Duração" }]}
        />

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {initialData ? "Guardar" : "Criar experiência"}
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:h-fit">
        <UpsellCheckoutPreview
          title={title}
          price={Number.isFinite(parsedBasePrice) ? parsedBasePrice : 0}
          duration={duration || "—"}
          image={imageUrl}
          tag={tag}
          tagLabel={tag === "none" ? undefined : TAG_LABELS[tag]}
          priceNote={pricingModel === "perPerson" ? "/ pessoa" : undefined}
        />
      </aside>
    </form>
  )
}
