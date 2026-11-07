"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import {
  EXTENSAO_POR_TIPO,
  apagarDoBunny,
  enviarParaBunny,
  publicarNoBunny,
  urlCdn,
} from "./lib/bunny";
import { TABELAS } from "./lib/tabelasImagens";

/*
 * Runtime de Node por causa da memória: o admin aceita vídeos, e o ficheiro
 * inteiro passa por aqui. No runtime normal o limite são 64 MB; aqui são 512.
 */

/**
 * Passa para o Bunny um ficheiro que o browser acabou de carregar no Convex.
 *
 * O browser não pode enviar directamente para o Bunny — isso exigia pôr a
 * password da storage zone no cliente. E um endpoint HTTP próprio tem um tecto
 * de 20 MB por pedido, que um vídeo de evento passa facilmente. Por isso o
 * upload continua a entrar pelo `generateUploadUrl` de sempre, e esta action
 * faz a passagem e apaga a cópia temporária.
 *
 * Exige sessão: sem isto, qualquer pessoa com o URL do Convex podia alojar
 * ficheiros na nossa CDN.
 */
export const publicar = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }): Promise<{ caminho: string; url: string | null }> => {
    const identidade = await ctx.auth.getUserIdentity();
    if (!identidade) {
      throw new ConvexError("É preciso ter sessão iniciada para publicar imagens.");
    }

    const ficheiro = await ctx.storage.get(storageId);
    if (!ficheiro) throw new ConvexError("O ficheiro carregado já não existe.");

    const tipo = ((ficheiro.type || "").split(";")[0] ?? "").trim().toLowerCase();
    if (!EXTENSAO_POR_TIPO[tipo]) {
      await ctx.storage.delete(storageId);
      throw new ConvexError(`Tipo de ficheiro não aceite: ${tipo || "desconhecido"}.`);
    }

    const caminho = await publicarNoBunny(ficheiro);
    // Só depois de o Bunny confirmar: se o envio falhar, o ficheiro fica no
    // Convex e o admin pode tentar outra vez.
    await ctx.storage.delete(storageId);

    return { caminho, url: urlCdn(caminho) };
  },
});

/**
 * Tipo pelos primeiros bytes, para ficheiros antigos gravados sem content-type.
 * Sem isto, um upload antigo sem tipo ficava por migrar sem razão aparente.
 */
async function tipoReal(ficheiro: Blob): Promise<string> {
  const declarado = ((ficheiro.type || "").split(";")[0] ?? "").trim().toLowerCase();
  if (EXTENSAO_POR_TIPO[declarado]) return declarado;
  const b = new Uint8Array(await ficheiro.slice(0, 16).arrayBuffer());
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(0, 3) === "GIF") return "image/gif";
  if (ascii(4, 4) === "ftyp") return ascii(8, 4).startsWith("avi") ? "image/avif" : "video/mp4";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return declarado;
}

/**
 * Copia para o Bunny as imagens que ainda estão no storage do Convex e troca as
 * referências nos registos.
 *
 * - Idempotente: o caminho no Bunny deriva do id antigo, por isso correr duas
 *   vezes sobrescreve o mesmo ficheiro em vez de duplicar.
 * - Retomável: pára antes dos 10 minutos de limite das actions e diz
 *   `terminado: false`; a corrida seguinte só vê o que falta.
 * - Reversível: os originais ficam no Convex. Apagá-los é outro passo, depois
 *   de verificado que o site mostra tudo a partir do Bunny.
 *
 * Um ficheiro partilhado (a biblioteca de imagens dos extras) é enviado uma vez
 * e todas as referências passam a apontar para a mesma cópia.
 */
export const migrar = internalAction({
  args: {},
  handler: async (ctx) => {
    const inicio = Date.now();
    const ORCAMENTO_MS = 8 * 60 * 1000;
    const copiados = new Map<string, string>();
    const relatorio: Record<string, { documentos: number; trocados: number }> = {};
    const emFalta: string[] = [];
    const recusados: { id: string; tipo: string }[] = [];
    let terminado = true;

    tabelas: for (const tabela of TABELAS) {
      relatorio[tabela] = { documentos: 0, trocados: 0 };
      let cursor: string | null = null;
      for (;;) {
        const pagina: {
          documentos: { id: string; refs: string[] }[];
          isDone: boolean;
          continueCursor: string;
        } = await ctx.runQuery(internal.migracaoBunny.listarPorMigrar, { tabela, cursor });

        for (const doc of pagina.documentos) {
          if (Date.now() - inicio > ORCAMENTO_MS) {
            terminado = false;
            break tabelas;
          }
          const mapa: Record<string, string> = {};
          for (const ref of doc.refs) {
            if (!copiados.has(ref)) {
              const id = ref as Id<"_storage">;
              const ficheiro = await ctx.storage.get(id).catch(() => null);
              if (!ficheiro) {
                emFalta.push(ref);
                continue;
              }
              const tipo = await tipoReal(ficheiro);
              const extensao = EXTENSAO_POR_TIPO[tipo];
              if (!extensao) {
                recusados.push({ id: ref, tipo: tipo || "desconhecido" });
                continue;
              }
              const caminho = `uploads/migrados/${ref}.${extensao}`;
              await enviarParaBunny(caminho, new Blob([await ficheiro.arrayBuffer()], { type: tipo }));
              copiados.set(ref, caminho);
            }
            mapa[ref] = copiados.get(ref)!;
          }
          if (Object.keys(mapa).length > 0) {
            await ctx.runMutation(internal.migracaoBunny.trocarReferencias, {
              tabela,
              id: doc.id,
              mapa,
            });
            relatorio[tabela].documentos++;
            relatorio[tabela].trocados += Object.keys(mapa).length;
          }
        }
        if (pagina.isDone) break;
        cursor = pagina.continueCursor;
      }
    }

    return {
      terminado,
      ficheirosCopiados: copiados.size,
      porTabela: Object.fromEntries(Object.entries(relatorio).filter(([, r]) => r.documentos > 0)),
      emFalta,
      recusados,
      segundos: Math.round((Date.now() - inicio) / 1000),
    };
  },
});

/** Agendada por `apagarImagem` quando um registo perde ou troca de imagem. */
export const apagar = internalAction({
  args: { caminho: v.string() },
  handler: async (_ctx, { caminho }) => {
    await apagarDoBunny(caminho);
  },
});
