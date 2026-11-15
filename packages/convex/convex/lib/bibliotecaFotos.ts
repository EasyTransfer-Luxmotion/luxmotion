import type { MutationCtx } from "../_generated/server";

/*
 * Uma foto que sai de um extra (trocada, tirada ou com o extra apagado) fica
 * registada na biblioteca das fotos dos extras (addonImages).
 *
 * As fotos herdadas — as que vieram com os extras e nunca foram registadas —
 * só apareciam na biblioteca enquanto algum extra as usasse. Ao sair do único
 * extra, sumiam do selector e do ecrã das fotos, e o ficheiro ficava no Bunny
 * sem ninguém saber que existia.
 */
export async function guardarNaBiblioteca(ctx: MutationCtx, caminho: string | undefined, nome: string) {
  if (!caminho) return;
  const ja = await ctx.db
    .query("addonImages")
    .withIndex("by_storage", (q) => q.eq("storageId", caminho))
    .first();
  if (ja) return;
  await ctx.db.insert("addonImages", { storageId: caminho, label: nome.trim() || "Sem nome", createdAt: Date.now() });
}
