/*
 * Como uma lead cai no funil: na mesma transação em que o formulário a grava,
 * na 1.ª etapa aberta do funil que tem a sua origem, no topo da coluna.
 *
 * É o que antes fazia a fila do Pipedrive (lib/pipedriveFila.ts), e pela mesma
 * razão vive na transação: escrita depois, numa action, duas submissões
 * simultâneas criavam dois cartões. O `by_origem` trava as repetições — uma
 * reserva re-entregue pelo Stripe não abre um segundo negócio.
 *
 * O título, a pessoa, o valor e o detalhe vêm dos `mapear*` de
 * lib/pipedriveMapa.ts, que já escolhem à mão o que sai de cada formulário (as
 * candidaturas trazem IBAN e documentos; não entram nos funis).
 */

import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { eOrigem, type OrigemFunil } from "./funis";
import {
  mapearContactQuote,
  mapearContactSubmission,
  mapearCorporateRequest,
  mapearPartnerLead,
  mapearReservaPaga,
  mapearSchoolQuote,
  mapearTourInquiry,
  mapearWeddingQuote,
  type LeadPipedrive,
  type TabelaLead,
} from "./pipedriveMapa";

/* As notas dos mapear* são HTML (eram para o Pipedrive). O texto foi escapado
   à entrada, por isso desfazer os escapes devolve o que o cliente escreveu. */
export function htmlParaTexto(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const texto = html
    .replace(/<li>/g, "• ")
    .replace(/<\/(li|p)>|<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return texto || undefined;
}

type Novo = {
  origem: OrigemFunil;
  origemId?: string;
  titulo: string;
  pessoa: { nome: string; email?: string; telefone?: string };
  organizacao?: string;
  valor?: number;
  nota?: string;
  canal?: string;
  /* Quem criou: um email, ou "sistema" quando chegou do site. */
  por: string;
  /* Na migração (funis.preencher), quando a lead foi gravada e em que etapa
     aberta já estava: 0 = a primeira. */
  criadoEm?: number;
  etapaAberta?: number;
  /* Para o negócio criado à mão: o funil e a etapa escolhidos. */
  funilId?: Id<"funis">;
  etapaId?: string;
};

export async function funilDaOrigem(ctx: MutationCtx, origem: OrigemFunil): Promise<Doc<"funis"> | null> {
  const funis = await ctx.db.query("funis").withIndex("by_ordem").collect();
  return funis.find((f) => f.origens.includes(origem)) ?? null;
}

/* O número que põe um cartão no topo da coluna. */
export async function ordemNoTopo(ctx: MutationCtx, funilId: Id<"funis">, etapaId: string): Promise<number> {
  const primeiro = await ctx.db
    .query("negocios")
    .withIndex("by_funil_etapa", (q) => q.eq("funilId", funilId).eq("etapaId", etapaId))
    .first();
  return primeiro ? primeiro.ordem - 1024 : 0;
}

/* Cria o cartão. Devolve o id, ou null se já existia ou não há funil. */
export async function colocarNoFunil(ctx: MutationCtx, n: Novo): Promise<Id<"negocios"> | null> {
  if (n.origemId) {
    const ja = await ctx.db
      .query("negocios")
      .withIndex("by_origem", (q) => q.eq("origem", n.origem).eq("origemId", n.origemId))
      .first();
    if (ja) return null;
  }
  const funil = n.funilId ? await ctx.db.get(n.funilId) : await funilDaOrigem(ctx, n.origem);
  if (!funil) {
    /* A lead está gravada e tem a sua caixa (Pedidos, Leads); só não há quadro
       onde a pôr. Nunca faz falhar o formulário. */
    console.warn(`[Funis] Sem funil para a origem "${n.origem}" — o cartão não foi criado (${n.origemId ?? "manual"}).`);
    return null;
  }
  const abertas = funil.etapas.filter((e) => e.tipo === "aberta");
  const etapa =
    (n.etapaId && funil.etapas.find((e) => e.id === n.etapaId)) ||
    abertas[Math.min(n.etapaAberta ?? 0, abertas.length - 1)] ||
    funil.etapas[0];
  if (!etapa) {
    console.warn(`[Funis] O funil "${funil.nome}" não tem etapas — o cartão não foi criado.`);
    return null;
  }
  const agora = Date.now();
  const criadoEm = n.criadoEm ?? agora;
  const id = await ctx.db.insert("negocios", {
    funilId: funil._id,
    etapaId: etapa.id,
    ordem: await ordemNoTopo(ctx, funil._id, etapa.id),
    titulo: n.titulo,
    pessoa: n.pessoa,
    organizacao: n.organizacao,
    valor: n.valor,
    nota: n.nota,
    origem: n.origem,
    origemId: n.origemId,
    canal: n.canal,
    criadoEm,
    atualizadoEm: agora,
    movidoEm: criadoEm,
    ...(etapa.tipo !== "aberta" ? { fechadoEm: agora } : {}),
  });
  await ctx.db.insert("negocioAtividades", {
    negocioId: id,
    tipo: "criado",
    por: n.por,
    texto: `Em ${funil.nome} → ${etapa.nome}`,
    em: criadoEm,
  });
  return id;
}

/* Um formulário de pedido ou de parceiro, já mapeado. As outras tabelas da
   fila antiga (newsletter, candidaturas) não são negócios: devolve null. */
export async function lerLead(ctx: MutationCtx, tabela: TabelaLead, id: string): Promise<LeadPipedrive | null> {
  switch (tabela) {
    case "contactSubmissions": {
      const d = await ctx.db.get(id as Id<typeof tabela>);
      return d ? mapearContactSubmission(d) : null;
    }
    case "contactQuotes": {
      const d = await ctx.db.get(id as Id<typeof tabela>);
      return d ? mapearContactQuote(d) : null;
    }
    case "tourInquiries": {
      const d = await ctx.db.get(id as Id<typeof tabela>);
      return d ? mapearTourInquiry(d) : null;
    }
    case "weddingQuoteSubmissions": {
      const d = await ctx.db.get(id as Id<typeof tabela>);
      return d ? mapearWeddingQuote(d) : null;
    }
    case "schoolQuoteSubmissions": {
      const d = await ctx.db.get(id as Id<typeof tabela>);
      return d ? mapearSchoolQuote(d) : null;
    }
    case "corporateRequests": {
      const d = await ctx.db.get(id as Id<typeof tabela>);
      return d ? mapearCorporateRequest(d) : null;
    }
    case "partnerLeads": {
      const d = await ctx.db.get(id as Id<typeof tabela>);
      return d ? mapearPartnerLead(d) : null;
    }
    default:
      return null;
  }
}

/* O que cada formulário chama logo a seguir a gravar (via enfileirarLead). */
export async function entrarNoFunil(
  ctx: MutationCtx,
  tabela: TabelaLead,
  id: string,
  extra: { criadoEm?: number; etapaAberta?: number } = {},
): Promise<Id<"negocios"> | null> {
  if (!eOrigem(tabela)) return null;
  const lead = await lerLead(ctx, tabela, id);
  if (!lead || lead.semNegocio) return null;
  return await colocarNoFunil(ctx, {
    origem: tabela,
    origemId: id,
    titulo: lead.titulo,
    pessoa: lead.pessoa,
    organizacao: lead.organizacao,
    valor: lead.valor,
    nota: htmlParaTexto(lead.nota),
    por: "sistema",
    ...extra,
  });
}

/* Uma reserva paga: um cartão por pagamento, com a ida, a volta e os tours
   vendidos em upsell juntos (como o webhook da operação os junta). */
export async function entrarReservaNoFunil(
  ctx: MutationCtx,
  ida: Doc<"orders">,
  extra: { criadoEm?: number; etapaAberta?: number } = {},
): Promise<Id<"negocios"> | null> {
  const encomendas: Doc<"orders">[] = [ida];
  const volta = ida.relatedOrderId ? await ctx.db.get(ida.relatedOrderId) : null;
  if (volta) encomendas.push(volta);
  const tours = await ctx.db
    .query("orders")
    .withIndex("by_transfer_order", (q) => q.eq("transferOrderId", ida._id))
    .collect();
  encomendas.push(...tours);
  const negocio = mapearReservaPaga(encomendas);
  if (!negocio) return null;
  return await colocarNoFunil(ctx, {
    origem: "orders",
    origemId: ida._id,
    titulo: negocio.titulo,
    pessoa: negocio.pessoa,
    valor: negocio.valor || undefined,
    nota: htmlParaTexto(negocio.nota),
    por: "sistema",
    ...extra,
  });
}
