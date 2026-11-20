/*
 * A etapa do quadro e o estado do registo (a reserva, o pedido, a
 * candidatura) dizem sempre o mesmo. Antes eram dois estados soltos: dava
 * para pôr um serviço em «Cancelada» no quadro e ele continuar «Paga» na
 * lista.
 *
 * Os dois sentidos:
 *   - mover o cartão (funis.mover) muda o estado do registo
 *     (aplicarEtapaNaOrigem);
 *   - mudar o estado na lista ou na ficha (reservas/pedidos/candidaturas
 *     .mudarEstado) move o cartão (acertarCartaoDaOrigem).
 *
 * As etapas configuram-se, por isso a correspondência é pelo tipo e pela
 * posição: a 1.ª etapa aberta é «por tratar», as outras abertas são «em
 * curso», as de ganho e de perdido fecham.
 */

import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { Etapa } from "./funis";
import { ordemNoTopo } from "./funilEntrada";

type Grupo = "primeira" | "curso" | "ganho" | "perdido";

/* O estado que cada tabela usa para cada grupo. Contactos, ultra-luxo,
   casamentos e escolas só têm novo/lido/arquivado: ganho e perdido são
   ambos «arquivado». */
const ESTADO: Record<string, Record<Grupo, string>> = {
  contactSubmissions: { primeira: "new", curso: "read", ganho: "archived", perdido: "archived" },
  tourInquiries: { primeira: "new", curso: "read", ganho: "archived", perdido: "archived" },
  weddingQuoteSubmissions: { primeira: "new", curso: "read", ganho: "archived", perdido: "archived" },
  schoolQuoteSubmissions: { primeira: "new", curso: "read", ganho: "archived", perdido: "archived" },
  contactQuotes: { primeira: "new", curso: "inProgress", ganho: "resolved", perdido: "archived" },
  corporateRequests: { primeira: "submitted", curso: "reviewing", ganho: "approved", perdido: "rejected" },
  partnerLeads: { primeira: "new", curso: "contacted", ganho: "qualified", perdido: "archived" },
  driverApplications: { primeira: "submitted", curso: "reviewing", ganho: "approved", perdido: "rejected" },
  partnerApplications: { primeira: "submitted", curso: "reviewing", ganho: "approved", perdido: "rejected" },
};

function grupoDaEtapa(etapas: Etapa[], etapaId: string): Grupo | null {
  const e = etapas.find((x) => x.id === etapaId);
  if (!e) return null;
  if (e.tipo !== "aberta") return e.tipo;
  return etapas.filter((x) => x.tipo === "aberta")[0]?.id === etapaId ? "primeira" : "curso";
}

/* Que estados de reserva cabem em cada grupo. */
function grupoDaReserva(status: Doc<"orders">["status"]): Grupo | null {
  if (status === "completed") return "ganho";
  if (status === "cancelled") return "perdido";
  if (status === "paid" || status === "confirmed") return "curso"; // qualquer etapa aberta serve
  return null;
}

const ROTULO_RESERVA: Record<string, string> = {
  draft: "rascunho",
  pending: "por pagar",
  confirmed: "confirmada",
  paid: "paga",
  completed: "concluída",
  cancelled: "cancelada",
};

/* As passagens que a lista também deixa fazer (reservas.ts → destinos). */
function podePassar(o: Doc<"orders">, para: Doc<"orders">["status"]): boolean {
  const paga = o.paymentStatus === "completed";
  switch (o.status) {
    case "paid":
      return ["confirmed", "completed", "cancelled"].includes(para);
    case "confirmed":
      return ["completed", "cancelled", paga ? "paid" : "pending"].includes(para);
    case "completed":
      return para === "confirmed";
    case "cancelled":
      return para === (paga ? "paid" : "pending");
    default:
      return para === "cancelled" && o.status === "pending";
  }
}

async function mudarReserva(ctx: MutationCtx, o: Doc<"orders">, para: Doc<"orders">["status"], ator: string, nota: string) {
  const agora = Date.now();
  await ctx.db.patch(o._id, { status: para, updatedAt: agora });
  if (para === "cancelled" && o.pernas?.length && o.tourBookingId) {
    await ctx.db.patch(o.tourBookingId, { status: "cancelled", updatedAt: agora });
  }
  await ctx.db.insert("registoReservas", {
    reservaId: o._id,
    numero: o.orderNumber ?? "",
    accao: "estado",
    de: o.status,
    para,
    ator,
    operacao: `quadro-${o._id}-${agora}`,
    resultado: "feito",
    nota,
    em: agora,
  });
}

/*
 * O cartão vai para a etapa `destino`: o registo acompanha. Lança se a
 * passagem não for possível (uma reserva por pagar não se conclui), e então
 * o cartão não se move.
 */
export async function aplicarEtapaNaOrigem(ctx: MutationCtx, n: Doc<"negocios">, etapas: Etapa[], destinoId: string, ator: string) {
  if (!n.origemId) return;
  const grupo = grupoDaEtapa(etapas, destinoId);
  if (!grupo) return;
  const nomeEtapa = etapas.find((e) => e.id === destinoId)?.nome ?? destinoId;

  if (n.origem === "orders") {
    const ida = await ctx.db.get(n.origemId as Id<"orders">);
    if (!ida) return;
    const pernas = [ida];
    const volta = ida.relatedOrderId ? await ctx.db.get(ida.relatedOrderId) : null;
    if (volta) pernas.push(volta);
    for (const o of pernas) {
      let para: Doc<"orders">["status"] | null = null;
      if (grupo === "ganho") para = "completed";
      else if (grupo === "perdido") para = "cancelled";
      else if (o.status === "completed") para = "confirmed";
      else if (o.status === "cancelled") para = o.paymentStatus === "completed" ? "paid" : "pending";
      if (!para || para === o.status) continue;
      if (!podePassar(o, para)) {
        /* A outra perna noutro estado não trava a viagem: fica como está. */
        if (o !== ida) continue;
        throw new ConvexError(
          `A reserva ${o.orderNumber ?? ""} está ${ROTULO_RESERVA[o.status] ?? o.status} e não pode passar a ${ROTULO_RESERVA[para]}: por isso não vai para «${nomeEtapa}».`,
        );
      }
      await mudarReserva(ctx, o, para, ator, `Pelo quadro: «${nomeEtapa}».`);
    }
    return;
  }

  const estados = ESTADO[n.origem];
  if (!estados) return;
  const id = ctx.db.normalizeId(n.origem as "contactSubmissions", n.origemId);
  const doc = id ? await ctx.db.get(id) : null;
  if (!id || !doc) return;
  const status = estados[grupo];
  if ((doc as { status?: string }).status === status) return;
  const revisto = ["corporateRequests", "driverApplications", "partnerApplications"].includes(n.origem) ? { reviewedAt: Date.now() } : {};
  await ctx.db.patch(id, { status, ...revisto } as never);
}

/*
 * O registo mudou de estado por fora do quadro (a lista, a ficha): o cartão
 * vai para a etapa que lhe corresponde. Se já está numa etapa do mesmo
 * grupo, fica onde está (uma reserva confirmada pode estar em qualquer etapa
 * aberta).
 */
export async function acertarCartaoDaOrigem(ctx: MutationCtx, origem: string, origemId: string, status: string, ator: string) {
  let chaveOrigem = origemId;
  let grupo: Grupo | null;
  if (origem === "orders") {
    const o = await ctx.db.get(origemId as Id<"orders">);
    if (!o) return;
    /* O cartão é da ida: a volta (mais recente) aponta para ela. */
    const outra = o.relatedOrderId ? await ctx.db.get(o.relatedOrderId) : null;
    if (outra && outra._creationTime < o._creationTime) chaveOrigem = outra._id;
    grupo = grupoDaReserva(status as Doc<"orders">["status"]);
  } else {
    const estados = ESTADO[origem];
    if (!estados) return;
    grupo =
      status === estados.primeira
        ? "primeira"
        : status === estados.curso
          ? "curso"
          : status === estados.ganho && status !== estados.perdido
            ? "ganho"
            : status === estados.perdido
              ? "perdido"
              : null;
  }
  if (!grupo) return;

  const n = await ctx.db
    .query("negocios")
    .withIndex("by_origem", (q) => q.eq("origem", origem).eq("origemId", chaveOrigem))
    .first();
  if (!n) return;
  const funil = await ctx.db.get(n.funilId);
  if (!funil) return;
  const actual = grupoDaEtapa(funil.etapas, n.etapaId);
  const abertas = funil.etapas.filter((e) => e.tipo === "aberta");

  let destino: Etapa | undefined;
  if (grupo === "ganho" || grupo === "perdido") {
    /* «Arquivado» num contacto fecha sem dizer se se ganhou: se já está
       fechado, fica. */
    if (actual === "ganho" || actual === "perdido") {
      if (origem !== "orders" && ESTADO[origem]?.ganho === ESTADO[origem]?.perdido) return;
      if (actual === grupo) return;
    }
    destino = funil.etapas.find((e) => e.tipo === grupo);
  } else if (grupo === "primeira") {
    if (actual === "primeira") return;
    destino = abertas[0];
  } else {
    /* Em curso (ou reserva paga/confirmada): qualquer etapa aberta serve. */
    if (actual === "curso" || (origem === "orders" && actual === "primeira")) return;
    destino = origem === "orders" ? abertas[0] : (abertas[1] ?? abertas[0]);
  }
  if (!destino || destino.id === n.etapaId) return;

  const agora = Date.now();
  await ctx.db.patch(n._id, {
    etapaId: destino.id,
    ordem: await ordemNoTopo(ctx, funil._id, destino.id),
    movidoEm: agora,
    atualizadoEm: agora,
    fechadoEm: destino.tipo === "aberta" ? undefined : agora,
    motivoPerda: destino.tipo === "perdido" ? n.motivoPerda ?? "Fechado na lista" : undefined,
  });
  const de = funil.etapas.find((e) => e.id === n.etapaId)?.nome ?? "?";
  await ctx.db.insert("negocioAtividades", {
    negocioId: n._id,
    tipo: destino.tipo === "aberta" ? "etapa" : destino.tipo,
    por: ator,
    texto: `${de} → ${destino.nome} (o estado mudou na lista)`,
    em: agora,
  });
}
