"use client"

import * as React from "react"
import { usePublicarImagem } from "@/hooks/use-publicar-imagem"
import { useMemo } from "react"
import { useMutation, useQueries } from "convex/react"
import { api } from "@workspace/convex/api"
import type { Id } from "@workspace/convex/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"
import { Check, ImageIcon, Loader2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { encolherImagem } from "@/lib/encolher-imagem"
import { MiniaturaImagem } from "./miniatura-imagem"

type ItemDaBiblioteca = {
  libraryId?: Id<"addonImages">
  storageId: string
  label: string
  url: string
  createdAt: number
}

interface AddonImagePickerProps {
  /** URL da imagem actual, para a miniatura. */
  value?: string | null
  /** `null` limpa a imagem. O segundo argumento é uma pré-visualização local. */
  onChange: (storageId: string | null, previewUrl?: string | null) => void
  disabled?: boolean
  /** Serve de rótulo da imagem quando se carrega uma nova. */
  addonTitle?: string
  labels: {
    choose: string
    library: string
    libraryHint: string
    upload: string
    uploading: string
    empty: string
    remove: string
    rename: string
  }
}

/**
 * Lê a biblioteca com `useQueries` e não `useQuery`: enquanto
 * `addonImages.list` não estiver deployado no Convex, o resultado chega como um
 * Error em vez de ser lançado durante o render — e o formulário do tour, que é
 * onde isto vive, continua a abrir. Sem isto uma janela de deploy deixava o
 * admin inteiro em ecrã de erro.
 */
function useBiblioteca(): { itens: ItemDaBiblioteca[]; indisponivel: boolean } {
  const queries = useMemo(
    () => ({ biblioteca: { query: api.addonImages.list, args: {} } }),
    [],
  )
  const resultados = useQueries(queries)
  const bruto = resultados.biblioteca

  return useMemo(() => {
    if (bruto instanceof Error) return { itens: [], indisponivel: true }
    if (bruto === undefined) return { itens: [], indisponivel: false }
    return { itens: bruto as ItemDaBiblioteca[], indisponivel: false }
  }, [bruto])
}

export function AddonImagePicker({
  value,
  onChange,
  disabled,
  addonTitle,
  labels,
}: AddonImagePickerProps) {
  const [aberto, setAberto] = React.useState(false)
  const [aCarregar, setACarregar] = React.useState(false)
  const [previewLocal, setPreviewLocal] = React.useState<string | null>(null)

  const { itens, indisponivel } = useBiblioteca()
  const publicarImagem = usePublicarImagem()
  const registar = useMutation(api.addonImages.add)
  const renomear = useMutation(api.addonImages.rename)

  React.useEffect(() => {
    if (!value) setPreviewLocal(null)
  }, [value])

  const mostrada = previewLocal || value

  const carregar = async (ficheiro: File) => {
    try {
      setACarregar(true)
      const local = URL.createObjectURL(ficheiro)
      setPreviewLocal(local)

      // Encolhida antes de subir: ver `lib/encolher-imagem.ts` para o porquê.
      const leve = await encolherImagem(ficheiro)
      const { caminho } = await publicarImagem(leve)

      // Entra na biblioteca no mesmo passo: é isso que evita o próximo upload.
      await registar({
        storageId: caminho,
        label: addonTitle?.trim() || ficheiro.name.replace(/\.[^.]+$/, ""),
      })

      onChange(caminho, local)
      setAberto(false)
    } catch (erro) {
      console.error("Upload da imagem do extra falhou:", erro)
      setPreviewLocal(null)
      toast.error(labels.upload)
    } finally {
      setACarregar(false)
    }
  }

  return (
    <div className="w-full space-y-2">
      <div
        className={cn(
          "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {mostrada ? (
          <>
            <MiniaturaImagem url={mostrada} alt="" className="h-full w-full" />
            <button
              type="button"
              onClick={() => {
                setPreviewLocal(null)
                onChange(null, null)
              }}
              disabled={disabled}
              title={labels.remove}
              className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1 text-destructive shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-full text-xs"
        disabled={disabled}
        onClick={() => setAberto(true)}
      >
        {labels.choose}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{labels.library}</DialogTitle>
            <DialogDescription>{labels.libraryHint}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {itens.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {labels.empty}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {itens.map((item) => {
                  const escolhida = value === item.url
                  return (
                    <div key={item.storageId} className="group space-y-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewLocal(null)
                          onChange(item.storageId, item.url)
                          setAberto(false)
                        }}
                        className={cn(
                          "relative block aspect-video w-full overflow-hidden rounded-md border-2 transition-colors",
                          escolhida
                            ? "border-primary"
                            : "border-transparent hover:border-muted-foreground/40",
                        )}
                      >
                        <MiniaturaImagem url={item.url} alt={item.label} />
                        {escolhida && (
                          <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>

                      <div className="flex items-center gap-1">
                        <Input
                          defaultValue={item.label}
                          title={labels.rename}
                          className="h-7 flex-1 text-xs"
                          onBlur={(e) => {
                            const novo = e.target.value.trim()
                            if (!novo || novo === item.label) return
                            /* Nome só para a biblioteca: as imagens herdadas dos
                               extras ainda não têm linha, e é o registo que a
                               cria — sem isto renomear não guardava nada. */
                            if (item.libraryId) {
                              void renomear({ id: item.libraryId, label: novo })
                            } else {
                              void registar({
                                storageId: item.storageId,
                                label: novo,
                              })
                            }
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <label
            className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm text-muted-foreground transition-colors hover:bg-accent",
              (aCarregar || indisponivel) && "pointer-events-none opacity-50",
            )}
          >
            {aCarregar ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {labels.uploading}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                {labels.upload}
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={aCarregar || indisponivel}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void carregar(f)
                e.target.value = ""
              }}
            />
          </label>
        </DialogContent>
      </Dialog>
    </div>
  )
}
