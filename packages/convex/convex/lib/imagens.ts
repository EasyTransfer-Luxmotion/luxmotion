import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { urlCdn } from "./bunny";

/**
 * Uma imagem de conteúdo (frota, tours, blog, parcerias…) pode estar em dois
 * sítios, e o mesmo campo aceita os dois:
 *
 *  - no Bunny, guardada como caminho: `uploads/2026/11/<uuid>.webp`
 *  - no storage do Convex, guardada como `_storage` id — o que existia antes
 *
 * Os dois convivem enquanto a migração corre: um registo ainda por migrar
 * continua a ter imagem, e um novo já nasce no Bunny. Distinguem-se pela barra,
 * que um id do Convex nunca tem.
 *
 * As candidaturas de motoristas e parceiros ficam de fora e continuam só com
 * `_storage`: são cartas de condução, seguros e comprovativos bancários, e a
 * CDN do Bunny é pública e não tem como revogar um link.
 */
export const vImagem = v.string();

export function estaNoBunny(ref: string): boolean {
  return ref.includes("/");
}

type ComStorage = {
  storage: { getUrl(id: Id<"_storage">): Promise<string | null> };
};

/** URL pronto a mostrar, venha a imagem de onde vier. */
export async function urlDaImagem(
  ctx: ComStorage,
  ref: string | null | undefined,
): Promise<string | null> {
  if (!ref) return null;
  if (estaNoBunny(ref)) return urlCdn(ref);
  return await ctx.storage.getUrl(ref as Id<"_storage">);
}

/*
 * Não há função para apagar uma imagem, e é de propósito: os editores (frota,
 * tours, eventos, corporate, blog, equipa…) trocam ou removem a referência e
 * deixam o ficheiro onde está.
 *
 * A migração para o Bunny (`imagensBunny.migrar`) juntou ficheiros iguais num
 * só caminho, `uploads/migrados/<id>.<ext>`, e a biblioteca dos extras reutiliza
 * fotos — o mesmo ficheiro pode estar em registos de tabelas diferentes. Em
 * 2026-11-14, apagar uma experiência corporate de teste levou duas fotografias
 * de veículos. Confirmar que nenhum registo de nenhuma tabela usa o caminho
 * seria frágil (cada tabela nova com imagens teria de entrar na verificação);
 * um ficheiro a mais no Bunny custa quase nada, uma foto em falta no site não.
 *
 * As candidaturas de motoristas e parceiros não passam por aqui: os documentos
 * pessoais estão no storage do Convex e esses podem e devem ser apagados.
 */
