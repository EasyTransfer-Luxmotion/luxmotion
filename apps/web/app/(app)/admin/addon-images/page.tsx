"use client"

import * as React from "react"
import { usePublicarImagem } from "@/hooks/use-publicar-imagem"
import { useMemo } from "react"
import { useMutation, useQueries } from "convex/react"
import type { RequestForQueries } from "convex/react"
import { api } from "@workspace/convex/api"
import type { Id } from "@workspace/convex/dataModel"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { AlertTriangle, ImageIcon, Loader2, Trash2, Upload } from "lucide-react"
import {
  DataTable,
  type DataTableColumn,
} from "@/components/admin/data-table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { toast } from "sonner"
import { encolherImagem } from "@/lib/encolher-imagem"
import { MiniaturaImagem } from "@/components/admin/miniatura-imagem"

type ItemDaBiblioteca = {
  libraryId?: Id<"addonImages">
  storageId: string
  label: string
  url: string
  createdAt: number
  usageCount: number
}

/* A DataTable pede `_id` em cada linha, e a biblioteca é identificada pelo
   ficheiro; um é cópia do outro. */
type LinhaDaTabela = ItemDaBiblioteca & { _id: string }

type GrupoSemImagem = {
  titulo: string
  quantidade: number
  addonIds: Id<"tourAddons">[]
}

/**
 * `useQueries` e não `useQuery`, como em `hooks/use-site-settings.ts`: enquanto
 * as funções não estiverem deployadas no Convex o resultado chega como um Error
 * em vez de ser lançado durante o render, e a página abre vazia em vez de deitar
 * abaixo o admin inteiro.
 */
function useBiblioteca(): {
  itens: ItemDaBiblioteca[]
  semImagem: GrupoSemImagem[]
  aCarregar: boolean
  indisponivel: boolean
} {
  const queries = useMemo(
    () => ({
      biblioteca: { query: api.addonImages.list, args: {} },
      semImagem: { query: api.addonImages.listMissing, args: {} },
    }),
    [],
  )
  const r = useQueries(queries)

  return useMemo(() => {
    const lista = r.biblioteca
    const faltam = r.semImagem
    return {
      itens: Array.isArray(lista) ? (lista as ItemDaBiblioteca[]) : [],
      semImagem: Array.isArray(faltam) ? (faltam as GrupoSemImagem[]) : [],
      aCarregar: lista === undefined,
      indisponivel: lista instanceof Error,
    }
  }, [r.biblioteca, r.semImagem])
}

/**
 * Extras que aparecem no site sem fotografia nenhuma. Resolvem-se por título e
 * não um a um: "Bagagem Extra" é o mesmo extra repetido em dezenas de tours, e
 * escolher a imagem uma vez arruma-os todos.
 */
function BlocoSemImagem({
  grupos,
  biblioteca,
  onEscolher,
  onCarregar,
}: {
  grupos: GrupoSemImagem[]
  biblioteca: ItemDaBiblioteca[]
  onEscolher: (grupo: GrupoSemImagem, storageId: string) => Promise<void>
  onCarregar: (ficheiro: File, nome?: string) => Promise<string>
}) {
  const [lista, setLista] = React.useState(false)
  const [aberto, setAberto] = React.useState<GrupoSemImagem | null>(null)
  const [aEnviar, setAEnviar] = React.useState(false)

  const total = grupos.reduce((n, g) => n + g.quantidade, 0)

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">
          {grupos.length} {grupos.length === 1 ? "extra" : "extras"} sem imagem
        </span>
        <span className="text-muted-foreground">
          {" "}
          · em {total} {total === 1 ? "tour ou evento" : "tours e eventos"}
        </span>
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 shrink-0 text-xs"
        onClick={() => setLista(true)}
      >
        Resolver
      </Button>

      {/* A lista vive num diálogo: em cima da página, oito linhas de avisos
          empurravam a tabela para fora do ecrã. */}
      <Dialog open={lista} onOpenChange={setLista}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Extras sem imagem</DialogTitle>
            <DialogDescription>
              Escolhe uma imagem para cada um: fica logo em todos os tours e
              eventos onde esse extra aparece.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 divide-y divide-border overflow-y-auto">
            {grupos.map((g) => (
              <div key={g.titulo} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    Em {g.quantidade} {g.quantidade === 1 ? "extra" : "extras"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  onClick={() => {
                    setLista(false)
                    setAberto(g)
                  }}
                >
                  Escolher
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={aberto !== null} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Imagem para &quot;{aberto?.titulo}&quot;</DialogTitle>
            <DialogDescription>
              Fica em {aberto?.quantidade}{" "}
              {aberto?.quantidade === 1 ? "extra" : "extras"} de uma só vez.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {biblioteca.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                A biblioteca está vazia. Carrega uma imagem aqui em baixo.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {biblioteca.map((item) => (
                  <button
                    key={item.storageId}
                    type="button"
                    title={item.label}
                    onClick={async () => {
                      const g = aberto
                      setAberto(null)
                      if (g) await onEscolher(g, item.storageId)
                    }}
                    className="overflow-hidden rounded-md border-2 border-transparent transition-colors hover:border-primary"
                  >
                    <MiniaturaImagem url={item.url} alt={item.label} />
                    <span className="block truncate px-1 py-1 text-[11px] text-muted-foreground">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm text-muted-foreground transition-colors hover:bg-accent ${
              aEnviar ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {aEnviar ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />A carregar…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Carregar uma imagem nova
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={aEnviar}
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ""
                const g = aberto
                if (!f || !g) return
                try {
                  setAEnviar(true)
                  const storageId = await onCarregar(f, g.titulo)
                  setAberto(null)
                  await onEscolher(g, storageId)
                } catch (erro) {
                  console.error(erro)
                  toast.error("Não foi possível carregar a imagem.")
                } finally {
                  setAEnviar(false)
                }
              }}
            />
          </label>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Detalhe de uma imagem, em painel lateral: a imagem em grande, o nome
 * editável e a lista de extras que a usam — que é o que interessa saber antes
 * de lhe mexer.
 */
function PainelDeDetalhe({
  item,
  onFechar,
  onRenomear,
  onApagar,
}: {
  item: ItemDaBiblioteca | null
  onFechar: () => void
  onRenomear: (item: ItemDaBiblioteca, valor: string) => void
  onApagar: (item: ItemDaBiblioteca) => void
}) {
  /* A query só corre com o painel aberto: percorre os extras todos, e não vale
     fazê-lo enquanto ninguém está a olhar. */
  const queries = useMemo(
    () =>
      (item
        ? {
            usos: {
              query: api.addonImages.usedBy,
              args: { storageId: item.storageId },
            },
          }
        : {}) as RequestForQueries,
    [item],
  )
  const bruto = (useQueries(queries) as Record<string, unknown>).usos
  const usos = Array.isArray(bruto)
    ? (bruto as {
        addonId: string
        addonTitle: string
        tipo: "tour" | "event"
        donoTitulo: string
      }[])
    : []

  return (
    <Sheet open={item !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        {item && (
          <>
            <SheetHeader className="border-b border-border p-6">
              <SheetTitle className="truncate">{item.label}</SheetTitle>
              <SheetDescription>
                {item.usageCount === 0
                  ? "Não está a ser usada em nenhum extra"
                  : `Usada em ${item.usageCount} ${item.usageCount === 1 ? "extra" : "extras"}`}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto p-6">
              <MiniaturaImagem
                url={item.url}
                alt={item.label}
                className="overflow-hidden rounded-lg border border-border"
              />

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Nome
                </label>
                <Input
                  key={item.storageId}
                  defaultValue={item.label}
                  onBlur={(e) => onRenomear(item, e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Onde aparece
                </p>
                {bruto === undefined ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : bruto instanceof Error ? (
                  /* Não é o mesmo que "ninguém a usa": dizer isso quando a
                     query falhou seria mentir sobre 23 extras. */
                  <p className="text-sm text-muted-foreground">
                    Não foi possível ler onde esta imagem aparece.
                  </p>
                ) : usos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum extra a usa de momento.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {usos.map((u) => (
                      <li key={u.addonId} className="px-3 py-2">
                        <p className="text-sm font-medium">{u.addonTitle}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.tipo === "event" ? "Evento" : "Tour"} · {u.donoTitulo}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="border-t border-border p-6">
              <Button
                type="button"
                variant="outline"
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onApagar(item)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Apagar imagem
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default function AdminAddonImagesPage() {
  const { itens, semImagem, aCarregar, indisponivel } = useBiblioteca()

  const publicarImagem = usePublicarImagem()
  const registar = useMutation(api.addonImages.add)
  const renomear = useMutation(api.addonImages.rename)
  const remover = useMutation(api.addonImages.remove)
  const atribuir = useMutation(api.addonImages.assign)

  const [aEnviar, setAEnviar] = React.useState(0)
  const [aApagar, setAApagar] = React.useState<ItemDaBiblioteca | null>(null)
  const [detalhe, setDetalhe] = React.useState<ItemDaBiblioteca | null>(null)

  /** Sobe um ficheiro para o Bunny e devolve o caminho, já registado na biblioteca. */
  const subirUm = async (ficheiro: File, nome?: string) => {
    // Encolhida antes de subir: ver `lib/encolher-imagem.ts` para o porquê.
    const leve = await encolherImagem(ficheiro)
    const { caminho } = await publicarImagem(leve)
    await registar({
      storageId: caminho,
      // Nome do ficheiro sem extensão: é o melhor palpite, e edita-se depois.
      label: nome?.trim() || ficheiro.name.replace(/\.[^.]+$/, ""),
    })
    return caminho
  }

  const carregar = async (ficheiros: FileList) => {
    const lista = [...ficheiros]
    setAEnviar(lista.length)
    let falhas = 0

    for (const ficheiro of lista) {
      try {
        await subirUm(ficheiro)
      } catch (erro) {
        console.error("Upload da imagem falhou:", erro)
        falhas++
      } finally {
        setAEnviar((n) => n - 1)
      }
    }

    if (falhas === 0) {
      toast.success(
        lista.length === 1
          ? "Imagem carregada."
          : `${lista.length} imagens carregadas.`,
      )
    } else {
      toast.error(`${falhas} de ${lista.length} imagens não foram carregadas.`)
    }
  }

  const confirmarApagar = async () => {
    const alvo = aApagar
    if (!alvo) return
    setAApagar(null)
    try {
      const r = await remover({ storageId: alvo.storageId })
      const n = r?.extrasAfectados ?? 0
      toast.success(
        n > 0
          ? `Imagem apagada. ${n} ${n === 1 ? "extra ficou" : "extras ficaram"} sem imagem.`
          : "Imagem apagada.",
      )
    } catch (erro) {
      console.error(erro)
      toast.error("Não foi possível apagar a imagem.")
    }
  }

  const darImagemAoGrupo = async (
    grupo: GrupoSemImagem,
    storageId: string,
  ) => {
    try {
      const r = await atribuir({
        storageId,
        addonIds: grupo.addonIds,
        label: grupo.titulo,
      })
      const n = r?.atribuidos ?? grupo.addonIds.length
      toast.success(
        `"${grupo.titulo}" ficou com imagem em ${n} ${n === 1 ? "extra" : "extras"}.`,
      )
    } catch (erro) {
      console.error(erro)
      toast.error("Não foi possível atribuir a imagem.")
    }
  }

  const linhas: LinhaDaTabela[] = useMemo(
    () => itens.map((i) => ({ ...i, _id: i.storageId })),
    [itens],
  )

  const colunas: DataTableColumn<LinhaDaTabela>[] = useMemo(
    () => [
      {
        id: "imagem",
        header: "Imagem",
        headerClassName: "w-[92px]",
        cell: (item) => (
          <MiniaturaImagem
            url={item.url}
            alt={item.label}
            className="h-12 w-[68px] overflow-hidden rounded"
          />
        ),
      },
      {
        id: "nome",
        header: "Nome",
        cell: (item) => <span className="font-medium">{item.label}</span>,
        sortAccessor: (item) => item.label.toLowerCase(),
      },
      {
        id: "uso",
        header: "Uso",
        headerClassName: "w-[140px]",
        cell: (item) => (
          <span className="text-muted-foreground">
            {item.usageCount === 0
              ? "Sem uso"
              : item.usageCount === 1
                ? "Em 1 extra"
                : `Em ${item.usageCount} extras`}
          </span>
        ),
        sortAccessor: (item) => item.usageCount,
      },
    ],
    [],
  )

  const guardarNome = (item: ItemDaBiblioteca, valor: string) => {
    const novo = valor.trim()
    if (!novo || novo === item.label) return
    /* As imagens herdadas dos extras ainda não têm linha na biblioteca: escrever
       o nome é o que as regista. Sem isto o nome não ficava guardado. */
    if (item.libraryId) {
      void renomear({ id: item.libraryId, label: novo })
    } else {
      void registar({ storageId: item.storageId, label: novo })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Carrega aqui as imagens dos extras uma vez. Depois, no separador dos
          extras de um tour ou de um evento, é só escolhê-las da biblioteca — sem
          voltar a carregar o ficheiro.
        </p>

        <label className="shrink-0">
          <Button asChild disabled={aEnviar > 0 || indisponivel}>
            <span className="cursor-pointer">
              {aEnviar > 0 ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />A carregar…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Carregar imagens
                </>
              )}
            </span>
          </Button>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={aEnviar > 0 || indisponivel}
            onChange={(e) => {
              const f = e.target.files
              if (f && f.length > 0) void carregar(f)
              e.target.value = ""
            }}
          />
        </label>
      </div>

      {semImagem.length > 0 && (
        <BlocoSemImagem
          grupos={semImagem}
          biblioteca={itens}
          onEscolher={darImagemAoGrupo}
          onCarregar={subirUm}
        />
      )}

      {indisponivel ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          A biblioteca ainda não está disponível no servidor. Faz o deploy do
          Convex e volta aqui.
        </div>
      ) : (
        /* A mesma tabela dos tours e da equipa: pesquisa, ordenação e
           paginação vêm de lá. Modo cliente porque a listagem é a união de
           duas fontes e não se pagina no servidor. */
        <DataTable<LinhaDaTabela>
          data={aCarregar ? undefined : linhas}
          columns={colunas}
          searchKeys={["label"]}
          searchPlaceholder="Procurar por nome"
          pageSize={12}
          getRowId={(i) => i.storageId}
          onRowClick={setDetalhe}
          rowActions={(item) => (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setAApagar(item)}
              title="Apagar"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          initialSort={{ columnId: "uso", dir: "desc" }}
          emptyTitle="Ainda não há imagens"
          emptyDescription="Carrega as primeiras aqui em cima."
          emptyIcon={ImageIcon}
        />
      )}

      <PainelDeDetalhe
        item={detalhe}
        onFechar={() => setDetalhe(null)}
        onRenomear={guardarNome}
        onApagar={(item) => {
          setDetalhe(null)
          setAApagar(item)
        }}
      />

      <AlertDialog
        open={aApagar !== null}
        onOpenChange={(aberto) => !aberto && setAApagar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar &quot;{aApagar?.label}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              {aApagar && aApagar.usageCount > 0
                ? `Está a ser usada em ${aApagar.usageCount} ${
                    aApagar.usageCount === 1 ? "extra, que fica" : "extras, que ficam"
                  } sem imagem. O ficheiro é apagado e não há como voltar atrás.`
                : "Ninguém está a usar esta imagem. O ficheiro é apagado e não há como voltar atrás."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarApagar}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
