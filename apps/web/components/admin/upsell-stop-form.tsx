"use client"

import * as React from "react"
import { CatalogTranslationsEditor } from "./catalog-translations-editor"
import type { CatalogTranslation } from "@/lib/catalog-translations"
import { useMutation } from "convex/react"
import { api } from "@workspace/convex/api"
import type { Id } from "@workspace/convex/dataModel"
import { Loader2, MapPin, Globe2 } from "lucide-react"
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
import { TAG_LABELS, type UpsellTag } from "@/components/admin/upsell-shared"

export interface UpsellStopInitialData {
  _id: Id<"upsellStops">
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
  price15?: number
  price30: number
  tag: UpsellTag
  universal: boolean
  status: "draft" | "published"
  order: number
}

export function UpsellStopForm({
  initialData,
  onClose,
}: {
  initialData?: UpsellStopInitialData
  onClose: () => void
}) {
  const create = useMutation(api.upsells.createStop)
  const update = useMutation(api.upsells.updateStop)

  const [translations, setTranslations] = React.useState<CatalogTranslation[]>(initialData?.translations ?? [])
  const [title, setTitle] = React.useState(initialData?.title ?? "")
  const [description, setDescription] = React.useState(initialData?.description ?? "")
  const [imageId, setImageId] = React.useState<string | undefined>(initialData?.imageId)
  const [imageUrl, setImageUrl] = React.useState<string | null>(initialData?.imageUrl ?? null)
  const [location, setLocation] = React.useState(initialData?.location ?? null)
  const [price15, setPrice15] = React.useState(
    initialData?.price15 != null ? String(initialData.price15) : "",
  )
  const [price30, setPrice30] = React.useState(String(initialData?.price30 ?? ""))
  const [tag, setTag] = React.useState<UpsellTag>(initialData?.tag ?? "none")
  const [universal, setUniversal] = React.useState(initialData?.universal ?? false)
  const [status, setStatus] = React.useState<"draft" | "published">(
    initialData?.status ?? "draft",
  )
  const [submitting, setSubmitting] = React.useState(false)

  const parsedPrice30 = Number.parseFloat(price30)
  const parsedPrice15 = price15.trim() === "" ? undefined : Number.parseFloat(price15)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      toast.error("Dá um nome à paragem")
      return
    }
    if (!Number.isFinite(parsedPrice30) || parsedPrice30 < 0) {
      toast.error("Preenche o preço de 30 minutos")
      return
    }
    if (price15.trim() !== "" && (!Number.isFinite(parsedPrice15!) || parsedPrice15! < 0)) {
      toast.error("O preço de 15 minutos não é um número válido")
      return
    }
    // Uma paragem geográfica sem coordenadas nunca chega a aparecer a ninguém:
    // o cross-match não tem por onde a comparar com o destino do transfer.
    if (!universal && (location?.lat == null || location?.lng == null)) {
      toast.error(
        "Escolhe um local no mapa, ou marca a paragem como universal — sem coordenadas nunca aparece no checkout",
      )
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
      price15: parsedPrice15,
      price30: parsedPrice30,
      tag,
      universal,
      status,
    }

    try {
      setSubmitting(true)
      if (initialData) {
        await update({ id: initialData._id, ...payload })
        toast.success("Paragem actualizada")
      } else {
        await create(payload)
        toast.success("Paragem criada")
      }
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      toast.error(
        /upsellStops|ArgumentValidation/i.test(message)
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
          <h2 className="text-lg font-semibold text-foreground">Paragem extra</h2>

          <div className="space-y-2">
            <Label htmlFor="upsell-stop-title">Nome</Label>
            <Input
              id="upsell-stop-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Miradouro da Boca do Inferno"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="upsell-stop-description">Descrição</Label>
            <Textarea
              id="upsell-stop-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Uma frase — é tudo o que cabe no card do checkout."
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
          <p className="text-sm text-muted-foreground">
            Preço fixo pela paragem, não por passageiro: quatro pessoas numa paragem
            de €15 pagam €15.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="upsell-stop-price15">15 minutos (€)</Label>
              <Input
                id="upsell-stop-price15"
                type="number"
                min={0}
                step="0.01"
                value={price15}
                onChange={(e) => setPrice15(e.target.value)}
                placeholder="opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upsell-stop-price30">30 minutos (€)</Label>
              <Input
                id="upsell-stop-price30"
                type="number"
                min={0}
                step="0.01"
                value={price30}
                onChange={(e) => setPrice30(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Onde aparece</h2>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-1">
              <Label htmlFor="upsell-stop-universal" className="flex items-center gap-2">
                <Globe2 className="size-4 text-muted-foreground" />
                Universal
              </Label>
              <p className="text-sm text-muted-foreground">
                Aparece em qualquer checkout, independentemente do destino. Desligado,
                só aparece a quem vai para perto daqui.
              </p>
            </div>
            <Switch
              id="upsell-stop-universal"
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
          fields={[{ key: "title", label: "Nome" }, { key: "description", label: "Descrição", multiline: true }]}
        />

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {initialData ? "Guardar" : "Criar paragem"}
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:h-fit">
        <UpsellCheckoutPreview
          title={title}
          price={Number.isFinite(parsedPrice30) ? parsedPrice30 : 0}
          duration="30 min"
          image={imageUrl}
          tag={tag}
          tagLabel={tag === "none" ? undefined : TAG_LABELS[tag]}
          priceNote={
            parsedPrice15 != null && Number.isFinite(parsedPrice15)
              ? `· €${parsedPrice15.toFixed(0)} / 15 min`
              : undefined
          }
        />
      </aside>
    </form>
  )
}
