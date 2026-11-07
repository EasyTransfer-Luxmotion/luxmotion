import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { urlCdn } from "./bunny";
import { safeStorageDelete } from "./storage";

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

/**
 * Apaga a imagem onde quer que esteja.
 *
 * O Bunny só se alcança por HTTP, e uma mutation não pode fazer pedidos — por
 * isso agenda-se uma action. Corre só se a mutation fizer commit: se a remoção
 * do registo falhar e voltar atrás, o ficheiro também fica.
 */
export async function apagarImagem(
  ctx: MutationCtx,
  ref: string | null | undefined,
): Promise<void> {
  if (!ref) return;
  if (estaNoBunny(ref)) {
    await ctx.scheduler.runAfter(0, internal.imagensBunny.apagar, { caminho: ref });
    return;
  }
  await safeStorageDelete(ctx, ref as Id<"_storage">);
}
