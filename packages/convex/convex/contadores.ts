import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { avaliarAcesso } from "./lib/admin";

/*
 * Os números ao lado dos módulos na sidebar do dashboard: Pedidos e
 * Candidaturas que ainda ninguém abriu, Avaliações por aprovar, Leads novos e
 * os serviços de hoje nas Reservas. São as mesmas tabelas e o mesmo critério de "novo" que
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

/* Serviços do dia: reservas pagas, confirmadas ou feitas cuja partida é
   nesse dia. Rascunhos, pendentes (carrinhos por pagar) e canceladas não são
   trabalho para hoje. */
async function servicosDoDia(ctx: QueryCtx, dia: string): Promise<number> {
  const docs = await ctx.db
    .query("orders")
    .withIndex("by_departure_date", (q) => q.gte("departureDate", dia).lt("departureDate", dia + "\uffff"))
    .take(500);
  return Math.min(
    docs.filter((o) => o.status === "paid" || o.status === "confirmed" || o.status === "completed").length,
    LIMITE,
  );
}

export const porTratar = query({
  /* O dia vem do browser (AAAA-MM-DD, hora de Lisboa) e não de Date.now():
     com o dia nos argumentos, a resposta guardada em cache muda à
     meia-noite em vez de ficar com o número de ontem. Opcional para os
     dashboards publicados antes deste campo continuarem a funcionar. */
  args: { dia: v.optional(v.string()) },
  handler: async (ctx, { dia }) => {
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

    const [avaliacoes, leads, reservasHoje] = await Promise.all([
      ctx.db
        .query("tourReviews")
        .withIndex("by_approved", (q) => q.eq("isApproved", false))
        .take(LIMITE)
        .then((d) => d.length),
      ctx.db
        .query("partnerLeads")
        .withIndex("by_status", (q) => q.eq("status", "new"))
        .take(LIMITE)
        .then((d) => d.length),
      dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? servicosDoDia(ctx, dia) : Promise.resolve(0),
    ]);

    return { pedidos, candidaturas, avaliacoes, leads, reservasHoje, limite: LIMITE };
  },
});
