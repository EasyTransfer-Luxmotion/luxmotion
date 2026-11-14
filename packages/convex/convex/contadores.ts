import { query, type QueryCtx } from "./_generated/server";
import { avaliarAcesso } from "./lib/admin";

/*
 * Os números ao lado de Pedidos e Candidaturas na sidebar do dashboard: o que
 * ainda ninguém abriu. São as mesmas tabelas e o mesmo critério de "novo" que
 * a caixa de entrada usa (components/admin/submissions-table.tsx no
 * dashboard): nos formulários de pedido o status é opcional e ausente conta
 * como "new".
 *
 * Cada contagem pára em LIMITE e a sidebar mostra "99+". A query é reactiva e
 * corre de novo a cada pedido que entra; ler uma tabela inteira de cada vez
 * para um número que acima de cem já só diz "muitos" seria desperdício.
 */
const LIMITE = 100;

type Tabela =
  | "contactSubmissions"
  | "tourInquiries"
  | "weddingQuoteSubmissions"
  | "schoolQuoteSubmissions"
  | "contactQuotes"
  | "corporateRequests"
  | "driverApplications"
  | "partnerApplications";

async function contar(ctx: QueryCtx, tabela: Tabela, estado: string | undefined): Promise<number> {
  const docs = await ctx.db
    .query(tabela)
    .withIndex("by_status" as never, (q: any) => q.eq("status", estado))
    .take(LIMITE);
  return docs.length;
}

async function somar(ctx: QueryCtx, pares: [Tabela, string | undefined][]): Promise<number> {
  const partes = await Promise.all(pares.map(([t, e]) => contar(ctx, t, e)));
  return Math.min(
    partes.reduce((a, b) => a + b, 0),
    LIMITE,
  );
}

export const porTratar = query({
  args: {},
  handler: async (ctx) => {
    /* null em vez de erro: a sidebar está na moldura do dashboard, acima do
       error.tsx, e um erro aqui (sessão ainda a chegar, email tirado do
       ADMIN_EMAILS com a página aberta) deitava abaixo o back-office inteiro.
       Sem acesso não se devolve número nenhum. */
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;

    const pedidos = await somar(ctx, [
      ["contactSubmissions", "new"],
      ["contactSubmissions", undefined],
      ["tourInquiries", "new"],
      ["tourInquiries", undefined],
      ["weddingQuoteSubmissions", "new"],
      ["weddingQuoteSubmissions", undefined],
      ["schoolQuoteSubmissions", "new"],
      ["schoolQuoteSubmissions", undefined],
      ["contactQuotes", "new"],
      ["corporateRequests", "submitted"],
    ]);

    const candidaturas = await somar(ctx, [
      ["driverApplications", "submitted"],
      ["partnerApplications", "submitted"],
    ]);

    return { pedidos, candidaturas, limite: LIMITE };
  },
});
