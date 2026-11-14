import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { avaliarAcesso, exigirAdmin } from "./lib/admin";

/*
 * Reservas no dashboard (E2 do plano de reconstrução do back-office).
 *
 * Substitui, para o ecrã novo, o orders.listPaged e o
 * orders.adminUpdateOrderStatus — que continuam a existir para o ecrã antigo
 * até este o substituir em todos os ambientes.
 *
 * O que muda:
 *  - A lista lê só a vista pedida, pelo índice de estado. Em produção 81% das
 *    linhas são rascunhos (carrinhos abandonados) e o listPaged lia-os todos,
 *    a cada mudança, para mostrar dez reservas.
 *  - As mudanças de estado seguem uma matriz escrita aqui, e não "qualquer
 *    estado para qualquer estado".
 *  - Confirmar um pagamento é uma só transacção: o estado, as transacções, o
 *    regresso e o registo mudam juntos, e o webhook é agendado na mesma. O
 *    adminUpdateOrderStatus verificava "já está paga?" e só depois pagava, em
 *    passos separados: dois cliques ao mesmo tempo passavam os dois.
 *  - Fica registado quem fez o quê (registoReservas).
 *
 * As queries devolvem null sem acesso (o detalhe vive em painéis da moldura,
 * como o ⌘K). As mutations recusam com erro — essas o browser só chama depois
 * de um clique.
 */

type Estado = Doc<"orders">["status"];

/* As vistas da lista. "Reservas" são as que vão acontecer ou aconteceram de
   facto; os carrinhos só se lêem quando alguém os pede. */
const VISTAS = {
  reservas: ["paid", "confirmed", "completed"],
  porPagar: ["pending"],
  canceladas: ["cancelled"],
  carrinhos: ["draft"],
} as const satisfies Record<string, readonly Estado[]>;
type Vista = keyof typeof VISTAS;

/*
 * As mudanças de estado permitidas, a partir de cada estado. "paid" não está
 * em nenhuma: chega-se lá por confirmarPagamento, que tem efeitos (transacção,
 * regresso, extras, webhook à operação) e não pode ser uma mudança de estado
 * como as outras.
 *
 * Em produção, a 2026-11-14, só existiam draft, pending e paid: confirmed,
 * completed e cancelled nunca tinham sido usados. A matriz parte daí:
 * Paga → Confirmada → Concluída, cancelar enquanto não está feita, e desfazer
 * o último passo quando foi engano.
 */
function destinos(o: Pick<Doc<"orders">, "status" | "paymentStatus">): Estado[] {
  const paga = o.paymentStatus === "completed";
  switch (o.status) {
    case "draft":
      return [];
    case "pending":
      return ["cancelled"];
    case "paid":
      return ["confirmed", "completed", "cancelled"];
    case "confirmed":
      /* Tirar a confirmação volta a "paga" ou a "pendente", conforme o
         pagamento — não se inventa um pagamento ao recuar. */
      return ["completed", "cancelled", paga ? "paid" : "pending"];
    case "completed":
      return ["confirmed"];
    case "cancelled":
      /* Reabrir volta ao que o pagamento diz. */
      return [paga ? "paid" : "pending"];
  }
}

function podeConfirmarPagamento(o: Pick<Doc<"orders">, "status" | "paymentStatus">): boolean {
  /* Os rascunhos ficam de fora: são carrinhos, muitas vezes sem cliente. */
  return o.paymentStatus !== "completed" && (o.status === "pending" || o.status === "confirmed");
}

function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function local(p: { location?: string; name?: string } | undefined): string {
  return p?.name?.trim() || p?.location?.trim() || "—";
}

function origemAnuncio(o: Doc<"orders">): string {
  return o.adSource?.utmSource?.trim().toLowerCase() || "";
}

/* Ida ou regresso: as duas pernas apontam uma para a outra e a ida é a mais
   antiga (orders.create insere-a primeiro). */
function pernaDe(o: Doc<"orders">, outra: Doc<"orders"> | null): "ida" | "regresso" | null {
  if (!outra) return null;
  return o._creationTime > outra._creationTime ? "regresso" : "ida";
}

async function lerVista(ctx: QueryCtx, vista: Vista | "todas"): Promise<Doc<"orders">[]> {
  if (vista === "todas") return ctx.db.query("orders").collect();
  const partes = await Promise.all(
    VISTAS[vista].map((estado) =>
      ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", estado))
        .collect(),
    ),
  );
  return partes.flat();
}

/* AAAA-MM-DD de hoje em Lisboa, para "próximas" e "passadas". */
function hojeEmLisboa(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
}

export const lista = query({
  args: {
    vista: v.union(
      v.literal("reservas"),
      v.literal("porPagar"),
      v.literal("canceladas"),
      v.literal("carrinhos"),
      v.literal("todas"),
    ),
    /* Só para as viagens: as que ainda vão acontecer (a partir de hoje) ou
       as que já passaram. */
    quando: v.optional(v.union(v.literal("proximas"), v.literal("passadas"))),
    pesquisa: v.optional(v.string()),
    metodo: v.optional(v.string()),
    /* "source:<utm_source>" ou "desconhecida". */
    origem: v.optional(v.string()),
    ordenar: v.optional(v.union(v.literal("viagem"), v.literal("criada"), v.literal("total"))),
    sentido: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;

    let docs = await lerVista(ctx, a.vista);

    /* As opções de origem vêm da vista inteira, antes dos filtros: escolher
       uma não pode fazer desaparecer as outras do menu. */
    const origens = [...new Set(docs.map(origemAnuncio))].filter(Boolean).sort();
    const metodos = [...new Set(docs.map((o) => o.paymentMethod).filter((m): m is string => Boolean(m)))].sort();

    if (a.quando) {
      const hoje = hojeEmLisboa();
      docs = docs.filter((o) => (a.quando === "proximas" ? o.departureDate >= hoje : o.departureDate < hoje));
    }
    if (a.metodo) docs = docs.filter((o) => o.paymentMethod === a.metodo);
    if (a.origem) {
      docs = docs.filter((o) =>
        a.origem === "desconhecida" ? !origemAnuncio(o) : `source:${origemAnuncio(o)}` === a.origem,
      );
    }
    const termos = semAcentos(a.pesquisa ?? "").split(/\s+/).filter(Boolean);
    if (termos.length) {
      docs = docs.filter((o) => {
        const onde = semAcentos(
          [
            o.orderNumber,
            o.customerName,
            o.customerEmail,
            o.customerPhone,
            o.passengerName,
            o.partnershipName,
            o.departure?.location,
            o.arrival?.location,
          ]
            .filter(Boolean)
            .join(" "),
        );
        return termos.every((t) => onde.includes(t));
      });
    }

    const ordenar = a.ordenar ?? "criada";
    const sentido = a.sentido ?? (ordenar === "viagem" && a.quando === "proximas" ? "asc" : "desc");
    const chave = (o: Doc<"orders">): string | number =>
      ordenar === "viagem" ? o.departureDate : ordenar === "total" ? (o.totalAmount ?? 0) : o._creationTime;
    docs.sort((x, y) => {
      const a1 = chave(x);
      const b1 = chave(y);
      const c = a1 < b1 ? -1 : a1 > b1 ? 1 : 0;
      return sentido === "asc" ? c : -c;
    });

    const porPagina = Math.min(Math.max(1, Math.floor(a.porPagina)), 100);
    const total = docs.length;
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
    const fatia = docs.slice(pagina * porPagina, (pagina + 1) * porPagina);

    /* A outra perna só para as linhas da página: é o que diz "ida" ou
       "regresso" e de quem é um regresso sem dados de cliente. */
    const outras = new Map<Id<"orders">, Doc<"orders"> | null>();
    await Promise.all(
      fatia.filter((o) => o.relatedOrderId).map(async (o) => outras.set(o._id, await ctx.db.get(o.relatedOrderId!))),
    );

    const linhas = fatia.map((o) => {
      const outra = outras.get(o._id) ?? null;
      return {
        _id: o._id,
        numero: o.orderNumber ?? "",
        estado: o.status,
        pagamento: o.paymentStatus ?? null,
        metodo: o.paymentMethod ?? null,
        viagem: o.departureDate,
        criada: o._creationTime,
        cliente: o.customerName?.trim() || outra?.customerName?.trim() || null,
        email: o.customerEmail ?? outra?.customerEmail ?? null,
        origem: local(o.departure),
        destino: local(o.arrival),
        passageiros: o.passengers,
        total: o.totalAmount ?? null,
        parceiro: o.partnershipName ?? null,
        anuncio: origemAnuncio(o) || null,
        perna: pernaDe(o, outra),
        tour: Boolean(o.tourBookingId) || (o.orderNumber ?? "").startsWith("TB"),
        aviso: Boolean(o.pricingWarning),
      };
    });

    return { linhas, total, pagina, paginas, porPagina, origens, metodos };
  },
});

/* Quantas há em cada vista, para os separadores. Os carrinhos não se contam:
   são a maior parte da tabela e contar é ler. */
export const contagens = query({
  args: {},
  handler: async (ctx) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const [reservas, porPagar, canceladas] = await Promise.all(
      (["reservas", "porPagar", "canceladas"] as const).map((vista) => lerVista(ctx, vista).then((d) => d.length)),
    );
    return { reservas, porPagar, canceladas };
  },
});

const ROTULO: Record<Estado, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  confirmed: "Confirmada",
  paid: "Paga",
  completed: "Concluída",
  cancelled: "Cancelada",
};

function resumo(o: Doc<"orders">) {
  return {
    _id: o._id,
    numero: o.orderNumber ?? "",
    estado: o.status,
    pagamento: o.paymentStatus ?? null,
    viagem: o.departureDate,
    origem: local(o.departure),
    destino: local(o.arrival),
  };
}

export const detalhe = query({
  args: { numero: v.string() },
  handler: async (ctx, { numero }) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const o = await ctx.db
      .query("orders")
      .withIndex("by_order_number", (q) => q.eq("orderNumber", numero.trim().toUpperCase()))
      .first();
    if (!o) return { encontrada: false as const };

    const outra = o.relatedOrderId ? await ctx.db.get(o.relatedOrderId) : null;
    const [pagamentos, registo, extras] = await Promise.all([
      ctx.db
        .query("transactions")
        .withIndex("by_booking", (q) => q.eq("bookingId", o._id))
        .collect(),
      ctx.db
        .query("registoReservas")
        .withIndex("by_reserva", (q) => q.eq("reservaId", o._id))
        .order("desc")
        .take(50),
      /* Tours e experiências pagos no checkout do transfer viram reservas
         próprias (payments.updatePaymentStatus). */
      ctx.db
        .query("orders")
        .withIndex("by_transfer_order", (q) => q.eq("transferOrderId", o._id))
        .collect(),
    ]);

    return {
      encontrada: true as const,
      reserva: {
        ...o,
        cliente: o.customerName?.trim() || outra?.customerName?.trim() || null,
        anuncio: origemAnuncio(o) || null,
        perna: pernaDe(o, outra),
      },
      outra: outra ? resumo(outra) : null,
      extras: extras.map(resumo),
      pagamentos: pagamentos
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((t) => ({ _id: t._id, valor: t.amount, metodo: t.paymentMethod, estado: t.status, em: t.timestamp })),
      registo: registo.map((r) => ({
        _id: r._id,
        accao: r.accao,
        de: r.de,
        para: r.para,
        ator: r.ator,
        resultado: r.resultado,
        nota: r.nota ?? null,
        aviso: r.aviso ?? null,
        em: r.em,
      })),
      accoes: {
        estados: destinos(o).map((para) => ({ para, rotulo: ROTULO[para] })),
        confirmarPagamento: podeConfirmarPagamento(o),
        /* Só depois de um aviso falhar de vez: reenviar um que chegou podia
           duplicar o serviço do lado da operação. */
        reenviarAviso: o.paymentStatus === "completed" && registo.find((r) => r.aviso)?.aviso?.estado === "falhou",
      },
    };
  },
});

/* Uma operação já feita devolve o que ficou gravado: repetir depois de um
   erro de rede não repete o efeito. */
async function jaFeita(ctx: QueryCtx, operacao: string) {
  return ctx.db
    .query("registoReservas")
    .withIndex("by_operacao", (q) => q.eq("operacao", operacao))
    .first();
}

function validarOperacao(operacao: string) {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(operacao)) throw new ConvexError("Operação inválida.");
}

export const mudarEstado = mutation({
  args: {
    reservaId: v.id("orders"),
    para: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("paid"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    /* Aplicar também à outra perna (ida/regresso), quando está no mesmo estado. */
    ambasAsPernas: v.boolean(),
    operacao: v.string(),
  },
  handler: async (ctx, a) => {
    const quem = await exigirAdmin(ctx);
    validarOperacao(a.operacao);

    const antes = await jaFeita(ctx, a.operacao);
    if (antes) return { resultado: antes.resultado, para: antes.para as Estado };

    const o = await ctx.db.get(a.reservaId);
    if (!o) throw new ConvexError("Esta reserva já não existe.");
    if (o.status === a.para) return { resultado: "jaEstava" as const, para: a.para };
    if (!destinos(o).includes(a.para)) {
      throw new ConvexError(`Uma reserva ${ROTULO[o.status].toLowerCase()} não pode passar a ${ROTULO[a.para].toLowerCase()}.`);
    }

    const agora = Date.now();
    await ctx.db.patch(o._id, { status: a.para, updatedAt: agora });

    /* A outra perna só muda se estava igual: uma ida já concluída não se
       cancela por arrasto de um regresso. */
    let nota: string | undefined;
    if (a.ambasAsPernas && o.relatedOrderId) {
      const outra = await ctx.db.get(o.relatedOrderId);
      if (outra && outra.status === o.status && destinos(outra).includes(a.para)) {
        await ctx.db.patch(outra._id, { status: a.para, updatedAt: agora });
        await ctx.db.insert("registoReservas", {
          reservaId: outra._id,
          numero: outra.orderNumber ?? "",
          accao: "estado",
          de: outra.status,
          para: a.para,
          ator: quem.email ?? "",
          operacao: `${a.operacao}-outra`,
          resultado: "feito",
          nota: `Junto com ${o.orderNumber ?? "a outra perna"}.`,
          em: agora,
        });
        nota = `Também ${outra.orderNumber ?? "a outra perna"}.`;
      }
    }

    await ctx.db.insert("registoReservas", {
      reservaId: o._id,
      numero: o.orderNumber ?? "",
      accao: "estado",
      de: o.status,
      para: a.para,
      ator: quem.email ?? "",
      operacao: a.operacao,
      resultado: "feito",
      nota,
      em: agora,
    });
    return { resultado: "feito" as const, para: a.para };
  },
});

/*
 * Pagamento recebido por fora do checkout (dinheiro, transferência, um link
 * pago à parte). Corre a mesma cadeia de um pagamento a sério
 * (payments.updatePaymentStatus: estado, transacções, regresso, extras do
 * checkout) e agenda o webhook à operação — tudo na mesma transacção que o
 * registo. Se a reserva já estava paga, não faz nada e diz isso.
 */
export const confirmarPagamento = mutation({
  args: {
    reservaId: v.id("orders"),
    /* Como foi pago de facto. Sem isto ficava o método da tentativa no
       checkout — um pagamento em dinheiro aparecia como "Cartão". */
    metodo: v.union(v.literal("cash"), v.literal("transferencia"), v.literal("link"), v.literal("tpa")),
    operacao: v.string(),
  },
  handler: async (ctx, a) => {
    const quem = await exigirAdmin(ctx);
    validarOperacao(a.operacao);

    const antes = await jaFeita(ctx, a.operacao);
    if (antes) return { resultado: antes.resultado };

    const o = await ctx.db.get(a.reservaId);
    if (!o) throw new ConvexError("Esta reserva já não existe.");
    const agora = Date.now();

    if (o.paymentStatus === "completed") {
      await ctx.db.insert("registoReservas", {
        reservaId: o._id,
        numero: o.orderNumber ?? "",
        accao: "pagamento",
        de: o.paymentStatus,
        para: "completed",
        ator: quem.email ?? "",
        operacao: a.operacao,
        resultado: "jaEstava",
        em: agora,
      });
      return { resultado: "jaEstava" as const };
    }
    if (!podeConfirmarPagamento(o)) {
      throw new ConvexError(`Uma reserva ${ROTULO[o.status].toLowerCase()} não pode ser dada como paga.`);
    }

    /* A outra perna lida antes da cadeia de pagamento, que também a paga:
       depois já dizia "paga" e o registo dela ficava "de pago para pago". */
    const outra = o.relatedOrderId ? await ctx.db.get(o.relatedOrderId) : null;

    await ctx.runMutation(internal.payments.updatePaymentStatus, {
      orderId: o._id,
      orderNumber: o.orderNumber ?? undefined,
      paymentStatus: "completed",
      paymentMethod: a.metodo,
    });

    if (outra) {
      await ctx.db.insert("registoReservas", {
        reservaId: outra._id,
        numero: outra.orderNumber ?? "",
        accao: "pagamento",
        de: outra.paymentStatus ?? "pending",
        para: "completed",
        ator: quem.email ?? "",
        operacao: `${a.operacao}-outra`,
        resultado: "feito",
        nota: `Junto com ${o.orderNumber ?? "a outra perna"}.`,
        em: agora,
      });
    }

    const registoId = await ctx.db.insert("registoReservas", {
      reservaId: o._id,
      numero: o.orderNumber ?? "",
      accao: "pagamento",
      de: o.paymentStatus ?? "pending",
      para: "completed",
      ator: quem.email ?? "",
      operacao: a.operacao,
      resultado: "feito",
      nota: outra ? `${outra.orderNumber ?? "A outra perna"} também ficou paga.` : undefined,
      aviso: { estado: "agendado", tentativas: 0, em: agora },
      em: agora,
    });
    /* Agendado na mesma transacção: se algo acima falhar, não sai aviso
       nenhum; se sair, o pagamento ficou gravado. O sendOrderPayload tem as
       suas próprias tentativas e vai anotando o resultado neste registo. */
    await ctx.scheduler.runAfter(0, internal.webhooks.sendOrderPayload, { orderId: o._id, aviso: registoId });
    return { resultado: "feito" as const };
  },
});

/* O sendOrderPayload vai dizendo como correu o aviso. */
export const anotarAviso = internalMutation({
  args: {
    registoId: v.id("registoReservas"),
    estado: v.union(v.literal("aTentar"), v.literal("enviado"), v.literal("falhou"), v.literal("semDestino")),
    tentativas: v.number(),
  },
  handler: async (ctx, a) => {
    const r = await ctx.db.get(a.registoId);
    if (!r) return;
    await ctx.db.patch(a.registoId, { aviso: { estado: a.estado, tentativas: a.tentativas, em: Date.now() } });
  },
});

/*
 * Voltar a avisar a operação de uma reserva paga cujo aviso falhou as cinco
 * tentativas. Antes ficava um "RESERVA PODE TER-SE PERDIDO" nos logs do Convex
 * e mais nada: ninguém na equipa o lia.
 */
export const reenviarAviso = mutation({
  args: { reservaId: v.id("orders"), operacao: v.string() },
  handler: async (ctx, a) => {
    const quem = await exigirAdmin(ctx);
    validarOperacao(a.operacao);
    const antes = await jaFeita(ctx, a.operacao);
    if (antes) return { resultado: antes.resultado };

    const o = await ctx.db.get(a.reservaId);
    if (!o) throw new ConvexError("Esta reserva já não existe.");
    if (o.paymentStatus !== "completed") throw new ConvexError("Só se avisa a operação de reservas pagas.");
    const ultimo = await ctx.db
      .query("registoReservas")
      .withIndex("by_reserva", (q) => q.eq("reservaId", o._id))
      .order("desc")
      .filter((q) => q.neq(q.field("aviso"), undefined))
      .first();
    if (ultimo?.aviso?.estado !== "falhou") {
      throw new ConvexError("O último aviso não falhou: reenviar podia duplicar o serviço na operação.");
    }

    const agora = Date.now();
    const registoId = await ctx.db.insert("registoReservas", {
      reservaId: o._id,
      numero: o.orderNumber ?? "",
      accao: "aviso",
      de: "falhou",
      para: "reenviado",
      ator: quem.email ?? "",
      operacao: a.operacao,
      resultado: "feito",
      aviso: { estado: "agendado", tentativas: 0, em: agora },
      em: agora,
    });
    await ctx.scheduler.runAfter(0, internal.webhooks.sendOrderPayload, { orderId: o._id, aviso: registoId });
    return { resultado: "feito" as const };
  },
});
