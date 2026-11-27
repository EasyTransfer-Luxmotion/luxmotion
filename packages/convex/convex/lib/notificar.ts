import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { TabelaLead } from "./pipedriveMapa";

/*
 * O sininho do back-office (notificacoes.ts): cada coisa nova que entra
 * deixa aqui uma linha, no momento em que acontece.
 *
 * Grava-se o acontecimento em vez de o deduzir das tabelas porque a hora que
 * conta é a de entrada: uma reserva nasce como carrinho e só é notícia quando
 * é paga, às vezes horas depois. Deduzida pela criação, entrava "no passado"
 * e quem já tivesse aberto o sininho nunca a via como nova.
 *
 * A chave é única: os pontos que chamam isto repetem-se (o Stripe re-entrega,
 * o "reenviar aviso" do dashboard volta a correr o sendOrderPayload).
 */

export type TipoNotificacao = "reserva" | "pedido" | "candidatura" | "lead" | "avaliacao" | "aviso" | "equipa";

export type NovaNotificacao = {
  chave: string;
  tipo: TipoNotificacao;
  titulo: string;
  detalhe?: string;
  href: string;
  valor?: number;
  tom?: "normal" | "aviso";
  em?: number;
};

export async function notificar(ctx: MutationCtx, n: NovaNotificacao): Promise<Id<"notificacoes"> | null> {
  /* Nunca deita abaixo quem chama: um pedido de orçamento ou um pagamento
     não pode falhar por causa do sininho. */
  try {
    const existe = await ctx.db
      .query("notificacoes")
      .withIndex("by_chave", (q) => q.eq("chave", n.chave))
      .first();
    if (existe) return existe._id;
    return await ctx.db.insert("notificacoes", {
      ...n,
      titulo: n.titulo.slice(0, 120),
      detalhe: n.detalhe?.slice(0, 200),
      em: n.em ?? Date.now(),
    });
  } catch (e) {
    console.error("[Notificações] não gravada:", n.chave, e);
    return null;
  }
}

/* Os separadores da caixa de entrada (?pedido=<tipo>:<id>), os mesmos de parceiros.ts. */
const PEDIDOS: Partial<Record<TabelaLead, { tipo: string; rotulo: string }>> = {
  contactSubmissions: { tipo: "contactos", rotulo: "Contacto" },
  contactQuotes: { tipo: "orcamentos", rotulo: "Orçamento" },
  tourInquiries: { tipo: "ultraluxo", rotulo: "Ultra-luxo" },
  weddingQuoteSubmissions: { tipo: "casamentos", rotulo: "Casamento" },
  schoolQuoteSubmissions: { tipo: "escolas", rotulo: "Escola" },
  corporateRequests: { tipo: "corporate", rotulo: "Corporate" },
};

export function nomeDe(d: Record<string, unknown>): string {
  for (const k of ["fullName", "name", "representativeFullName", "companyName", "customerName", "author", "email"]) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "Sem nome";
}

export function construirPedido(
  tabela: Exclude<TabelaLead, "newsletterSubscriptions">,
  doc: Record<string, unknown> & { _id: string; _creationTime: number },
): NovaNotificacao {
  const nome = nomeDe(doc);
  const id = doc._id;
  const base = { chave: `${tabela}:${id}`, em: doc._creationTime };
  const p = PEDIDOS[tabela];
  if (p) {
    return { ...base, tipo: "pedido", titulo: `Novo pedido · ${p.rotulo}`, detalhe: nome, href: `/inbox?estado=todos&pedido=${p.tipo}:${id}` };
  }
  if (tabela === "driverApplications") {
    return { ...base, tipo: "candidatura", titulo: "Nova candidatura · Motorista", detalhe: nome, href: `/applications?estado=todos&candidatura=motoristas:${id}` };
  }
  if (tabela === "partnerApplications") {
    const empresa = typeof doc.companyName === "string" ? doc.companyName : nome;
    return { ...base, tipo: "candidatura", titulo: "Nova candidatura · Empresa parceira", detalhe: empresa, href: `/applications?estado=todos&candidatura=parceiros:${id}` };
  }
  /* partnerLeads */
  const empresa = typeof doc.companyName === "string" && doc.companyName.trim() ? ` · ${doc.companyName.trim()}` : "";
  return { ...base, tipo: "lead", titulo: "Nova lead de parceria", detalhe: `${nome}${empresa}`, href: `/partner-leads?estado=todas&lead=${id}` };
}

export async function notificarPedido(ctx: MutationCtx, tabela: Exclude<TabelaLead, "newsletterSubscriptions">, id: string) {
  try {
    const doc = (await ctx.db.get(id as Id<"contactSubmissions">)) as (Record<string, unknown> & { _id: string; _creationTime: number }) | null;
    if (!doc) return;
    await notificar(ctx, construirPedido(tabela, doc));
  } catch (e) {
    console.error("[Notificações] pedido não gravado:", tabela, id, e);
  }
}

/* "Avenida da Liberdade 1, 1250-096 Lisboa, Portugal" → "Avenida da Liberdade 1". */
const curto = (s?: string) => (s ?? "").split(",")[0]!.trim().slice(0, 40);

export const AVISO_VOLTA_SEM_PRECO = "Volta ligada sem preço (0 €): confirmar com o cliente se a volta existe antes de agendar.";

/* Uma volta que segue a ida para a operação mas não foi paga. Não se olha
   ao flightType: a volta nasce sem ele (orders.createReturnOrder) e só o
   ganha no passo da viagem. */
export function voltaSemPreco(volta: Doc<"orders"> | null): boolean {
  return Boolean(volta && !((volta.totalAmount ?? 0) > 0));
}

export function construirReserva(
  ida: Doc<"orders">,
  volta: Doc<"orders"> | null,
  extra: { dinheiro?: boolean; produto?: string },
): NovaNotificacao {
  const nome = ida.customerName?.trim() || ida.passengerName?.trim() || ida.customerEmail || "Sem nome";
  const tour = Boolean(ida.tourBookingId) || (ida.orderNumber ?? "").startsWith("TB");
  const rota = tour ? extra.produto ?? "" : `${curto(ida.departure?.location)} → ${curto(ida.arrival?.location)}${volta ? " (ida e volta)" : ""}`;
  const valor = (ida.totalAmount ?? 0) + (volta?.totalAmount ?? 0);
  return {
    chave: `reserva:${ida._id}`,
    tipo: "reserva",
    titulo: voltaSemPreco(volta)
      ? "Nova reserva · volta sem preço, confirmar"
      : extra.dinheiro
        ? "Nova reserva · paga em dinheiro"
        : tour
          ? "Nova reserva · tour ou evento"
          : /* A won quote turned into bookings (funis.converterEmReservas):
               it said «Nova reserva paga» even when left to pay. */
            ida.origemOrcamento
            ? ida.paymentStatus === "completed"
              ? "Nova reserva de orçamento · paga"
              : "Nova reserva de orçamento · por pagar"
            : "Nova reserva paga",
    detalhe: [ida.orderNumber, nome, rota].filter(Boolean).join(" · "),
    href: `/orders/${encodeURIComponent(ida.orderNumber ?? ida._id)}`,
    valor: valor || undefined,
    /* O servidor aceitou um total abaixo do esperado (orders.startPaymentAction). */
    tom: ida.pricingWarning || voltaSemPreco(volta) ? "aviso" : "normal",
  };
}
