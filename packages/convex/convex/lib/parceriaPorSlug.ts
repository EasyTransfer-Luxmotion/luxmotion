import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/*
 * A parceria de um endereço, também pelos endereços que já teve.
 *
 * O "kiss&tell" tinha um "&" no endereço, que parte o sitemap. Mudar-lhe o
 * endereço deixava sem saída os links já impressos e os cookies de
 * atribuição gravados nos browsers com o antigo. Ao mudar, o back-office
 * guarda o antigo em slugsAntigos (parceiros.guardar); o site reencaminha
 * para o actual e a atribuição continua a cair na mesma parceria.
 *
 * O actual ganha sempre: se outra parceria ficou com um endereço antigo,
 * é dela.
 */
export async function parceriaPorSlug(ctx: QueryCtx, slug: string): Promise<Doc<"partnerships"> | null> {
  const actual = await ctx.db
    .query("partnerships")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  if (actual) return actual;
  /* Sem índice: um array não se indexa e as parcerias são dezenas. */
  const todas = await ctx.db.query("partnerships").collect();
  return todas.find((p) => p.slugsAntigos?.includes(slug)) ?? null;
}
