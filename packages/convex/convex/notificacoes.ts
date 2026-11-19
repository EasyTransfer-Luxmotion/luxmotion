import { v } from "convex/values";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { exigirAdmin, lerAcesso, permite, type Acesso } from "./lib/admin";
import type { ModuloPermissao } from "./lib/permissoes";
import { construirPedido, construirReserva, notificar, nomeDe } from "./lib/notificar";

/*
 * O sininho do back-office: o que entrou de novo — reservas pagas, pedidos,
 * candidaturas, leads, avaliações e os avisos da verificação diária — com o
 * número do que cada pessoa ainda não leu. As linhas nascem em
 * lib/notificar.ts, no momento em que cada coisa acontece.
 */

const LIMITE = 100;

const vTipo = v.union(
  v.literal("reserva"),
  v.literal("pedido"),
  v.literal("candidatura"),
  v.literal("lead"),
  v.literal("avaliacao"),
  v.literal("equipa"),
  v.literal("aviso"),
);

async function lidasDe(ctx: QueryCtx, conta: string) {
  return ctx.db
    .query("notificacoesLidas")
    .withIndex("by_conta", (q) => q.eq("conta", conta))
    .first();
}

/* Cada pessoa só vê no sino o que o cargo lhe deixa abrir: uma reserva
   no sino de quem não tem Reservas abria um ecrã que lhe dizia "sem acesso",
   e o título já mostrava o nome e o valor. */
const MODULO_DO_TIPO: Record<Doc<"notificacoes">["tipo"], ModuloPermissao> = {
  reserva: "reservas",
  pedido: "pedidos",
  candidatura: "candidaturas",
  lead: "leads",
  avaliacao: "avaliacoes",
  aviso: "parcerias",
  /* Convites aceites e recusados: para quem gere a equipa. */
  equipa: "equipa",
};

function tiposVisiveis(acesso: Acesso): Set<string> {
  return new Set(
    (Object.keys(MODULO_DO_TIPO) as Doc<"notificacoes">["tipo"][]).filter((t) => permite(acesso, MODULO_DO_TIPO[t])),
  );
}

function contaDe(identidade: { email?: string; tokenIdentifier: string }): string {
  return identidade.email?.trim().toLowerCase() || identidade.tokenIdentifier;
}

function linha(n: Doc<"notificacoes">, lida: boolean) {
  return {
    id: n._id as string,
    tipo: n.tipo,
    titulo: n.titulo,
    detalhe: n.detalhe ?? null,
    href: n.href,
    valor: n.valor ?? null,
    aviso: n.tom === "aviso",
    em: n.em,
    lida,
  };
}

/* O sininho: as mais recentes e quantas estão por ler. */
export const recentes = query({
  args: { limite: v.optional(v.number()) },
  handler: async (ctx, a) => {
    /* null em vez de erro, como o contadores.porTratar: o sininho está na
       moldura do dashboard e um erro aqui deitava abaixo o back-office. */
    const identidade = await ctx.auth.getUserIdentity();
    const acesso = await lerAcesso(ctx);
    if (acesso.estado !== "admin" || !identidade) return null;
    const visiveis = tiposVisiveis(acesso);
    const todos = visiveis.size === Object.keys(MODULO_DO_TIPO).length;
    const estado = await lidasDe(ctx, contaDe(identidade));
    const desde = estado?.lidasAte ?? 0;
    const abertas = new Set<string>(estado?.lidas ?? []);

    const limite = Math.max(1, Math.min(30, Math.floor(a.limite ?? 8)));
    const [ultimas, novas] = await Promise.all([
      /* Com o sino filtrado lê-se mais para sobrar o suficiente depois do
         filtro; quem vê tudo (o caso de hoje) lê o mesmo que antes. */
      ctx.db.query("notificacoes").withIndex("by_em").order("desc").take(todos ? limite : limite * 10),
      ctx.db
        .query("notificacoes")
        .withIndex("by_em", (q) => q.gt("em", desde))
        .order("desc")
        .take((LIMITE + abertas.size) * (todos ? 1 : 3)),
    ]);
    const ultimasVisiveis = ultimas.filter((n) => visiveis.has(n.tipo)).slice(0, limite);
    const porLerLista = novas.filter((n) => visiveis.has(n.tipo) && !abertas.has(n._id));
    return {
      linhas: ultimasVisiveis.map((n) => linha(n, n.em <= desde || abertas.has(n._id))),
      porLer: Math.min(porLerLista.length, LIMITE),
      /* A mais recente por ler: o browser abana o sino quando muda. */
      ultimaPorLer: porLerLista[0]?.em ?? null,
      limite: LIMITE,
    };
  },
});

/* A página Notificações: todas, por páginas, com filtro. */
export const lista = query({
  args: {
    tipo: v.optional(vTipo),
    soPorLer: v.optional(v.boolean()),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    const identidade = await exigirAdmin(ctx, undefined, "ver");
    const visiveis = tiposVisiveis(await lerAcesso(ctx));
    const estado = await lidasDe(ctx, contaDe(identidade));
    const desde = estado?.lidasAte ?? 0;
    const abertas = new Set<string>(estado?.lidas ?? []);
    const lida = (n: Doc<"notificacoes">) => n.em <= desde || abertas.has(n._id);

    /* Os últimos 90 dias chegam para um aviso: o que é mais antigo está
       tratado nas listas de cada módulo. */
    const corte = Date.now() - 90 * 86_400_000;
    const todas = a.tipo
      ? await ctx.db.query("notificacoes").withIndex("by_tipo_em", (q) => q.eq("tipo", a.tipo!).gt("em", corte)).order("desc").take(1000)
      : await ctx.db.query("notificacoes").withIndex("by_em", (q) => q.gt("em", corte)).order("desc").take(1000);
    const filtradas = todas.filter((n) => visiveis.has(n.tipo) && (!a.soPorLer || !lida(n)));

    const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
    const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
    const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
    return {
      linhas: filtradas.slice(pagina * porPagina, (pagina + 1) * porPagina).map((n) => linha(n, lida(n))),
      total: filtradas.length,
      pagina,
      paginas,
      porPagina,
    };
  },
});

export const marcarLida = mutation({
  args: { id: v.id("notificacoes"), lida: v.optional(v.boolean()) },
  handler: async (ctx, { id, lida = true }) => {
    /* "ver": marcar como lida é da própria pessoa, não altera nada de
       ninguém — e tem de funcionar também no «ver como». */
    const identidade = await exigirAdmin(ctx, undefined, "ver");
    const conta = contaDe(identidade);
    const n = await ctx.db.get(id);
    if (!n) return;
    const estado = await lidasDe(ctx, conta);
    const desde = estado?.lidasAte ?? 0;
    if (n.em <= desde && lida) return;
    let lidas = (estado?.lidas ?? []).filter((x) => x !== id);
    if (lida) lidas.push(id);
    /* Voltar a pôr por ler uma das que já estavam antes de lidasAte: o
       lidasAte recua para logo antes dela e as do meio entram na lista. */
    let lidasAte = desde;
    if (!lida && n.em <= desde) {
      const entre = await ctx.db
        .query("notificacoes")
        .withIndex("by_em", (q) => q.gte("em", n.em).lte("em", desde))
        .take(500);
      lidasAte = n.em - 1;
      lidas = [...new Set([...lidas, ...entre.filter((x) => x._id !== id).map((x) => x._id)])];
    }
    lidas = lidas.slice(-500);
    if (estado) await ctx.db.patch(estado._id, { lidas, lidasAte });
    else await ctx.db.insert("notificacoesLidas", { conta, lidasAte, lidas });
  },
});

export const marcarTodasLidas = mutation({
  args: {},
  handler: async (ctx) => {
    const identidade = await exigirAdmin(ctx, undefined, "ver");
    const conta = contaDe(identidade);
    const estado = await lidasDe(ctx, conta);
    const agora = Date.now();
    if (estado) await ctx.db.patch(estado._id, { lidasAte: agora, lidas: [] });
    else await ctx.db.insert("notificacoesLidas", { conta, lidasAte: agora, lidas: [] });
  },
});

/* ─── Quem cria ──────────────────────────────────────────────────────── */

/* Do sendOrderPayload (pagamento confirmado) e do pagamento em dinheiro. */
export const registarReserva = internalMutation({
  args: { orderId: v.id("orders"), dinheiro: v.optional(v.boolean()) },
  handler: async (ctx, { orderId, dinheiro }) => {
    const o = await ctx.db.get(orderId);
    if (!o) return;
    /* A volta aponta para a ida e nasce depois dela: a notícia é a viagem. */
    const outra = o.relatedOrderId ? await ctx.db.get(o.relatedOrderId) : null;
    const eVolta = Boolean(outra && outra._creationTime < o._creationTime);
    const ida = eVolta ? outra! : o;
    const volta = eVolta ? o : outra;
    let produto: string | undefined;
    if (ida.tourBookingId) {
      const b = await ctx.db.get(ida.tourBookingId);
      const p = b?.tourId ? await ctx.db.get(b.tourId) : b?.eventId ? await ctx.db.get(b.eventId) : null;
      produto = p?.title;
    }
    await notificar(ctx, construirReserva(ida, volta, { dinheiro, produto }));
  },
});

/* Da verificação diária (vigilancia.ts): um aviso por parceria e por dia. */
export const registarAvisosParcerias = internalMutation({
  args: { lista: v.array(v.object({ id: v.string(), nome: v.string(), problemas: v.array(v.string()) })) },
  handler: async (ctx, { lista }) => {
    const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
    for (const p of lista) {
      await notificar(ctx, {
        chave: `parceria:${p.id}:${dia}`,
        tipo: "aviso",
        titulo: `Parceria com problemas · ${p.nome}`,
        detalhe: p.problemas.join("; "),
        href: `/partnerships?parceria=${p.id}`,
        tom: "aviso",
      });
    }
  },
});

/*
 * Para um ambiente que acaba de receber o sininho: cria as notificações dos
 * últimos dias a partir do que já existe, com a hora de cada coisa. Pode
 * correr-se outra vez (as chaves não se repetem).
 *   npx convex run notificacoes:preencher '{"dias":7}'
 */
export const preencher = internalMutation({
  args: { dias: v.optional(v.number()) },
  handler: async (ctx, { dias = 7 }) => {
    const desde = Date.now() - dias * 86_400_000;
    let n = 0;
    const tabelas = [
      "contactSubmissions",
      "contactQuotes",
      "tourInquiries",
      "weddingQuoteSubmissions",
      "schoolQuoteSubmissions",
      "corporateRequests",
      "driverApplications",
      "partnerApplications",
      "partnerLeads",
    ] as const;
    for (const t of tabelas) {
      const docs = await ctx.db.query(t).withIndex("by_creation_time", (q) => q.gt("_creationTime", desde)).collect();
      for (const d of docs) if (await notificar(ctx, construirPedido(t, d as never))) n++;
    }
    const ordens = await ctx.db.query("orders").withIndex("by_creation_time", (q) => q.gt("_creationTime", desde)).collect();
    for (const o of ordens) {
      if (o.status !== "paid" && o.status !== "confirmed" && o.status !== "completed") continue;
      const outra = o.relatedOrderId ? await ctx.db.get(o.relatedOrderId) : null;
      if (outra && outra._creationTime < o._creationTime) continue;
      const r = construirReserva(o, outra, { dinheiro: o.paymentMethod === "cash" });
      /* Sem hora de pagamento gravada: a última mudança é a melhor aproximação. */
      if (await notificar(ctx, { ...r, em: o.updatedAt ?? o._creationTime })) n++;
    }
    const avaliacoes = await ctx.db.query("tourReviews").withIndex("by_creation_time", (q) => q.gt("_creationTime", desde)).collect();
    for (const r of avaliacoes) {
      const estrelas = Math.round(r.rating);
      if (
        await notificar(ctx, {
          chave: `avaliacao:${r._id}`,
          tipo: "avaliacao",
          titulo: `Nova avaliação ${"★".repeat(estrelas)}${"☆".repeat(5 - estrelas)}`,
          detalhe: nomeDe(r as never),
          href: `/reviews?estado=todas&avaliacao=${r._id}`,
          tom: r.rating <= 3 ? "aviso" : "normal",
          em: r._creationTime,
        })
      )
        n++;
    }
    return { criadas: n };
  },
});


/*
 * Apaga uma notificação, para limpar as de testes (no development, um
 * convite de teste recusado ficou no sino). Interna: só pela CLI.
 *   npx convex run notificacoes:apagar '{"id":"…"}'
 * Tira-a também das lidas de cada pessoa, para não ficarem ids soltos.
 */
export const apagar = internalMutation({
  args: { id: v.id("notificacoes") },
  handler: async (ctx, { id }) => {
    const n = await ctx.db.get(id);
    if (!n) return "já não existe";
    for (const l of await ctx.db.query("notificacoesLidas").collect()) {
      if (l.lidas.includes(id)) await ctx.db.patch(l._id, { lidas: l.lidas.filter((x) => x !== id) });
    }
    await ctx.db.delete(id);
    return `apagada: ${n.titulo}`;
  },
});
