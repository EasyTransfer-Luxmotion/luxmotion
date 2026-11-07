"use client"

import * as React from "react"
import { CatalogTranslationsEditor } from "./catalog-translations-editor"
import type { CatalogTranslation } from "@/lib/catalog-translations"
import { useMutation } from "convex/react"
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
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { AddonImagePicker } from "./addon-image-picker"

export type AmbitoExtra = "tours" | "events" | "ultraLuxury"

const AMBITOS: { valor: AmbitoExtra; rotulo: string; nota: string }[] = [
  { valor: "tours", rotulo: "Tours", nota: "Todos os tours, menos os ultra-luxo" },
  { valor: "events", rotulo: "Eventos", nota: "Todos os eventos" },
  { valor: "ultraLuxury", rotulo: "Ultra-luxo", nota: "Só os tours ultra-luxo" },
]

export type UniversalAddonInicial = {
  _id: Id<"universalAddons">
  title: string
  translations?: CatalogTranslation[]
  description?: string
  imageUrl?: string | null
  price: number
  pricingType: "per_person" | "flat"
  currency: string
  scopes: AmbitoExtra[]
  status: "draft" | "published"
}

export function UniversalAddonForm({
  initialData,
  onClose,
}: {
  initialData?: UniversalAddonInicial
  onClose: () => void
}) {
  const criar = useMutation(api.universalAddons.create)
  const actualizar = useMutation(api.universalAddons.update)

  const [translations, setTranslations] = React.useState<CatalogTranslation[]>(initialData?.translations ?? [])
  const [title, setTitle] = React.useState(initialData?.title ?? "")
  const [description, setDescription] = React.useState(initialData?.description ?? "")
  const [price, setPrice] = React.useState(String(initialData?.price ?? ""))
  const [pricingType, setPricingType] = React.useState<"per_person" | "flat">(
    initialData?.pricingType ?? "per_person",
  )
  const [scopes, setScopes] = React.useState<AmbitoExtra[]>(initialData?.scopes ?? ["tours"])
  const [status, setStatus] = React.useState<"draft" | "published">(
    initialData?.status ?? "published",
  )
  const [imagem, setImagem] = React.useState<{
    storageId: string | null
    url: string | null
  }>({ storageId: null, url: initialData?.imageUrl ?? null })
  const [aGuardar, setAGuardar] = React.useState(false)

  const alternarAmbito = (valor: AmbitoExtra) =>
    setScopes((actuais) =>
      actuais.includes(valor) ? actuais.filter((s) => s !== valor) : [...actuais, valor],
    )

  const guardar = async () => {
    if (!title.trim()) return toast.error("O extra precisa de um título.")
    if (scopes.length === 0)
      return toast.error("Escolhe pelo menos um âmbito, senão não aparece em lado nenhum.")

    const valor = parseFloat(price)
    if (!Number.isFinite(valor) || valor < 0) return toast.error("Preço inválido.")

    setAGuardar(true)
    try {
      if (initialData) {
        await actualizar({
          id: initialData._id,
          title: title.trim(),
          translations,
          description: description.trim() || undefined,
          price: valor,
          pricingType,
          scopes,
          status,
          /* `null` limpa, ausente deixa como está: só se envia quando a imagem
             foi mexida neste formulário. */
          ...(imagem.storageId !== null || imagem.url === null
            ? { imageId: (imagem.storageId as string | null) ?? null }
            : {}),
        })
        toast.success("Extra universal actualizado.")
      } else {
        await criar({
          title: title.trim(),
          translations,
          description: description.trim() || undefined,
          price: valor,
          pricingType,
          currency: "EUR",
          originalLanguage: "pt",
          scopes,
          status,
          imageId: (imagem.storageId) ?? undefined,
        })
        toast.success("Extra universal criado.")
      }
      onClose()
    } catch (erro) {
      console.error(erro)
      toast.error("Não foi possível guardar.")
    } finally {
      setAGuardar(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {initialData ? "Editar extra universal" : "Novo extra universal"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Definido uma vez, aparece em tudo o que o âmbito disser. Cada tour pode
            desligá-lo no seu próprio formulário.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex gap-6">
        <div className="w-40 shrink-0 space-y-1.5">
          <Label className="text-xs">Imagem</Label>
          <AddonImagePicker
            value={imagem.url}
            addonTitle={title}
            onChange={(storageId, previewUrl) =>
              setImagem({ storageId, url: previewUrl ?? null })
            }
            labels={{
              choose: "Escolher imagem",
              library: "Biblioteca de imagens dos extras",
              libraryHint:
                "A mesma biblioteca dos extras dos tours. Clica numa imagem para a associar.",
              upload: "Carregar imagem nova",
              uploading: "A carregar…",
              empty: "Ainda não há imagens. Carrega a primeira aqui em baixo.",
              remove: "Retirar a imagem",
              rename: "Mudar o nome",
            }}
          />
        </div>

        <div className="flex-1 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input
              id="titulo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bagagem Extra"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="preco">Preço *</Label>
              <Input
                id="preco"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de preço</Label>
              <Select
                value={pricingType}
                onValueChange={(v) => setPricingType(v as "per_person" | "flat")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_person">Por pessoa</SelectItem>
                  <SelectItem value="flat">Taxa fixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as "draft" | "published")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="published">Publicado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Onde aparece *</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {AMBITOS.map((a) => (
                <label
                  key={a.valor}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3"
                >
                  <Checkbox
                    checked={scopes.includes(a.valor)}
                    onCheckedChange={() => alternarAmbito(a.valor)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{a.rotulo}</span>
                    <span className="block text-xs text-muted-foreground">{a.nota}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <CatalogTranslationsEditor
        value={translations}
        onChange={setTranslations}
        fields={[{ key: "title", label: "Nome" }, { key: "description", label: "Descrição", multiline: true }]}
      />

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={aGuardar}>
          Cancelar
        </Button>
        <Button type="button" onClick={guardar} disabled={aGuardar}>
          {aGuardar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar
        </Button>
      </div>
    </div>
  )
}
