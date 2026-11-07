"use client"

import { useCallback } from "react"
import { useAction, useMutation } from "convex/react"
import { api } from "@workspace/convex/api"

/**
 * Carrega um ficheiro e publica-o no Bunny. Devolve o caminho a guardar no
 * registo e o URL da CDN.
 *
 * O ficheiro entra primeiro no storage do Convex (sem limite de tamanho, ao
 * contrário de um endpoint HTTP) e a action `publicar` passa-o para o Bunny e
 * apaga a cópia temporária. O browser nunca vê a password da storage zone.
 *
 * Todas as imagens de conteúdo do admin passam por aqui. As candidaturas de
 * motoristas e parceiros não: são documentos pessoais e ficam no Convex.
 */
export function usePublicarImagem() {
  const gerarUrlDeUpload = useMutation(api.blogs.generateUploadUrl)
  const publicar = useAction(api.imagensBunny.publicar)

  return useCallback(
    async (ficheiro: Blob): Promise<{ caminho: string; url: string | null }> => {
      const destino = await gerarUrlDeUpload()
      const resposta = await fetch(destino, {
        method: "POST",
        headers: { "Content-Type": ficheiro.type },
        body: ficheiro,
      })
      if (!resposta.ok) throw new Error(`O upload falhou (${resposta.status}).`)
      const { storageId } = await resposta.json()
      return await publicar({ storageId })
    },
    [gerarUrlDeUpload, publicar],
  )
}
