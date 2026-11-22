import { ConvexError, v } from "convex/values";
import { lisbonToday, periodStart } from "./lib/boardFilters";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin } from "./lib/admin";
import { acertarCartaoDaOrigem } from "./lib/funilEstado";
import { ESTADOS, GRUPOS, TABELA, TIPOS, estadoDe, grupoDe, resumo, vTipo, type Grupo, type Qualquer, type Tipo } from "./lib/requests";
import { facts } from "./lib/orderFacts";
import { mergedPage } from "./lib/orderList";

/*
 * Operação → Pedidos no dashboard (E4). Os seis formulários de pedido do site
 * numa caixa só, mais a lista da newsletter.
 *
 * Cada tabela mantém os seus estados e transições (o plano pede para não os
 * mudar): contactos, ultra-luxo, casamentos e escolas têm novo/lido/arquivado;
 * os pedidos de orçamento têm novo/em curso/resolvido/arquivado; o corporate
 * tem recebido/em análise/aprovado/recusado. Para a lista juntam-se em três
 * grupos que valem para todos — por tratar, em curso, fechados — e o "por
 * tratar" é exactamente o do contador da sidebar (contadores.porTratar).
 *
 * Abrir um pedido não o marca como lido: o ecrã antigo também não o fazia, e
 * mudar o contador só por espreitar escondia pedidos a quem viesse a seguir.
 */

/* A request as the list shows it. */
function linhaDe(tipo: Tipo, d: Qualquer) {
  const estado = estadoDe(tipo, d.status);
  const r = resumo(tipo, d);
  return {
    tipo,
    id: d._id as string,
    estado,
    grupo: grupoDe(estado),
    recebido: d.createdAt,
    nome: r.nome,
    empresa: r.empresa,
    linha: r.linha,
    email: d.email,
    telefone: d.phone || null,
    parceiro: d.partnershipName ?? null,
  };
}

/* Which form a request id belongs to (the ids carry their table). */
function tipoDoId(ctx: QueryCtx, id: string): Tipo | null {
  return TIPOS.find((t) => ctx.db.normalizeId(TABELA[t], id) !== null) ?? null;
}

const SEARCH_LIMIT = 200;

const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const lista = query({
  args: {
    tipo: v.union(vTipo, v.literal("todos")),
    grupo: v.union(v.literal("porTratar"), v.literal("emCurso"), v.literal("fechados"), v.literal("todos")),
    pesquisa: v.optional(v.string()),
    /* O nome do parceiro, ou "direto" para os que chegaram sem parceiro. */
    parceiro: v.optional(v.string()),
    /* Só os recebidos desde este instante (o filtro Período: hoje, 7 dias,
       30 dias, este mês, este ano). O browser manda o início do dia, para
       a subscrição não mudar a cada segundo. */
    desde: v.optional(v.number()),
    // The same period, worked out here in Lisbon time; replaces `desde` (kept for older dashboards).
    period: v.optional(v.union(v.literal("today"), v.literal("7d"), v.literal("30d"), v.literal("month"), v.literal("year"))),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    const since = a.period ? periodStart(a.period, lisbonToday()) : a.desde;
    await exigirAdmin(ctx, "pedidos", "ver");
    /*
     * From the request facts (lib/orderFacts.ts): a tree per form and group,
     * and per partner, by date received. Counts are calls and only the page
     * is read. This read all six tables every time a request came in; 37
     * requests in Nov 2026, but at thousands a day it stops fitting.
     */
    const tipos = a.tipo === "todos" ? TIPOS : [a.tipo];
    const grupos = a.grupo === "todos" ? GRUPOS : [a.grupo];
    const parceiro = a.parceiro === undefined || a.parceiro === "" ? undefined : a.parceiro === "direto" ? "" : a.parceiro;
    const bounds = since !== undefined ? { lower: { key: since, inclusive: true } } : undefined;

    const porTipoN = await facts.countBatch(ctx, TIPOS.map((t) => ({ namespace: ["req", t, "porTratar"] })));
    const porTipo = Object.fromEntries(TIPOS.map((t, i) => [t, porTipoN[i]!])) as Record<Tipo, number>;
    const porGrupoN = await facts.countBatch(ctx, GRUPOS.flatMap((g) => tipos.map((t) => ({ namespace: ["req", t, g] }))));
    const somaGrupo = (k: number) => porGrupoN.slice(k * tipos.length, (k + 1) * tipos.length).reduce((x, y) => x + y, 0);
    const porGrupo = { porTratar: somaGrupo(0), emCurso: somaGrupo(1), fechados: somaGrupo(2), todos: somaGrupo(0) + somaGrupo(1) + somaGrupo(2) };

    const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
    const q = semAcentos(a.pesquisa?.trim() ?? "");
    let linhas: ReturnType<typeof linhaDe>[];
    let total: number;
    let pagina: number;
    let paginas: number;
    if (q) {
      /* The search index of each form, then the same filters. */
      const termos = q.split(/\s+/).filter(Boolean);
      const selectiva = termos.find((x) => /\d/.test(x)) ?? termos.reduce((x, y) => (y.length > x.length ? y : x));
      const encontrados: ReturnType<typeof linhaDe>[] = [];
      for (const t of tipos) {
        for (const texto of [...new Set([termos.join(" "), selectiva])]) {
          const docs = (await ctx.db
            .query(TABELA[t])
            .withSearchIndex("search_text", (s) => s.search("searchText", texto))
            .take(SEARCH_LIMIT)) as Qualquer[];
          for (const d of docs) if (!encontrados.some((x) => x.id === d._id) && termos.every((x) => (d.searchText ?? "").includes(x))) encontrados.push(linhaDe(t, d));
        }
      }
      const filtrados = encontrados
        .filter((x) => grupos.includes(x.grupo))
        .filter((x) => parceiro === undefined || (x.parceiro?.trim() ?? "") === parceiro)
        .filter((x) => since === undefined || x.recebido >= since)
        /* Ties by id, as the list without search (the facts) orders them. */
        .sort((x, y) => y.recebido - x.recebido || (x.id < y.id ? 1 : x.id > y.id ? -1 : 0));
      total = filtrados.length;
      paginas = Math.max(1, Math.ceil(total / porPagina));
      pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
      linhas = filtrados.slice(pagina * porPagina, (pagina + 1) * porPagina);
    } else {
      const lists = tipos.flatMap((t) => grupos.map((g) => (parceiro === undefined ? ["req", t, g] : ["req", t, g, "p", parceiro])));
      const counts = await facts.countBatch(ctx, lists.map((namespace) => ({ namespace, bounds })));
      total = counts.reduce((x, y) => x + y, 0);
      paginas = Math.max(1, Math.ceil(total / porPagina));
      pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
      const ids = total ? await mergedPage(ctx, lists, counts, bounds ?? {}, "desc", pagina * porPagina, porPagina) : [];
      linhas = [];
      for (const id of ids) {
        const t = tipoDoId(ctx, id);
        const d = t ? ((await ctx.db.get(ctx.db.normalizeId(TABELA[t], id)!)) as Qualquer | null) : null;
        if (t && d) linhas.push(linhaDe(t, d));
      }
    }

    const parceiros = (await ctx.db.query("orderFacetValues").withIndex("by_view_dim", (x) => x.eq("view", "pedidos").eq("dim", "partner")).take(500))
      .map((r) => r.value)
      .sort((x, y) => x.localeCompare(y, "pt"));
    return {
      linhas,
      total,
      pagina,
      paginas,
      porPagina,
      porTipo,
      porGrupo,
      parceiros,
      newsletter: await facts.count(ctx, { namespace: ["newsletter"] }),
    };
  },
});

export const detalhe = query({
  args: { tipo: vTipo, id: v.string() },
  handler: async (ctx, { tipo, id }) => {
    await exigirAdmin(ctx, "pedidos", "ver");
    const nid = ctx.db.normalizeId(TABELA[tipo], id);
    const d = nid ? ((await ctx.db.get(nid)) as Qualquer | null) : null;
    if (!d) return null;
    const estado = estadoDe(tipo, d.status);
    /* O tour do ultra-luxo, para o link: o título gravado pode já não ser o
       actual, e o tour pode ter sido apagado. */
    let tour: { id: string; titulo: string; slug: string; ultra: boolean } | null = null;
    if (tipo === "ultraluxo") {
      const tid = (d as Doc<"tourInquiries">).tourId;
      const t = tid ? await ctx.db.get(tid) : null;
      if (t) tour = { id: t._id, titulo: t.title, slug: t.slug, ultra: Boolean(t.isUltraLuxury) };
    }
    return {
      tipo,
      id: d._id as string,
      estado,
      grupo: grupoDe(estado),
      estados: ESTADOS[tipo],
      doc: d,
      tour,
    };
  },
});

export const mudarEstado = mutation({
  args: { tipo: vTipo, id: v.string(), estado: v.string() },
  handler: async (ctx, { tipo, id, estado }) => {
    const quem = await exigirAdmin(ctx, "pedidos");
    if (!ESTADOS[tipo].includes(estado)) throw new ConvexError({ tipo: "invalido", mensagem: "Estado que este pedido não aceita." });
    const nid = ctx.db.normalizeId(TABELA[tipo], id);
    const d = nid ? await ctx.db.get(nid) : null;
    if (!nid || !d) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este pedido já não existe." });
    /* O corporate guarda quando foi revisto, como o setStatus antigo. */
    const extra = tipo === "corporate" ? { reviewedAt: Date.now() } : {};
    await ctx.db.patch(nid, { status: estado, ...extra } as never);
    /* O cartão no quadro dos Pedidos acompanha (lib/funilEstado.ts). */
    await acertarCartaoDaOrigem(ctx, TABELA[tipo], id, estado, quem.email ?? "");
    return { estado, grupo: grupoDe(estado) };
  },
});

/* Notas internas: só o corporate as tem na base de dados. */
export const notas = mutation({
  args: { id: v.id("corporateRequests"), notas: v.string() },
  handler: async (ctx, { id, notas }) => {
    await exigirAdmin(ctx, "pedidos");
    if (!(await ctx.db.get(id))) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este pedido já não existe." });
    if (notas.length > 5000) throw new ConvexError({ tipo: "invalido", mensagem: "Notas compridas de mais (máximo 5000 caracteres)." });
    await ctx.db.patch(id, { internalNotes: notas.trim() || undefined });
  },
});

export const remover = mutation({
  args: { tipo: vTipo, id: v.string() },
  handler: async (ctx, { tipo, id }) => {
    await exigirAdmin(ctx, "pedidos", "editar", "apagar");
    const nid = ctx.db.normalizeId(TABELA[tipo], id);
    if (!nid) return;
    if (await ctx.db.get(nid)) await ctx.db.delete(nid);
  },
});

const NEWSLETTER_SCAN = 5000;

/* A newsletter: só consulta. Não há contrato de envio nem de consentimento
   editável, e o plano não quer que se invente (PED-07). */
export const newsletter = query({
  args: { pesquisa: v.optional(v.string()), pagina: v.number(), porPagina: v.number() },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "pedidos", "ver");
    const q = semAcentos(a.pesquisa?.trim() ?? "");
    const linha = (x: Doc<"newsletterSubscriptions">) => ({ id: x._id as string, email: x.email, nome: x.name ?? null, origem: x.source ?? null, recebido: x.createdAt });
    if (!q) {
      /* Without search, from the facts: the count is a call, the page a read. */
      const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
      const total = await facts.count(ctx, { namespace: ["newsletter"] });
      const paginas = Math.max(1, Math.ceil(total / porPagina));
      const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
      const ids = total ? await mergedPage(ctx, [["newsletter"]], [total], {}, "desc", pagina * porPagina, porPagina) : [];
      const docs = (await Promise.all(ids.map((id) => ctx.db.get(id as Id<"newsletterSubscriptions">)))).filter((x): x is Doc<"newsletterSubscriptions"> => x !== null);
      return { linhas: docs.map(linha), total, pagina, paginas, porPagina };
    }
    /* A search looks through the most recent NEWSLETTER_SCAN. */
    const todos = (await ctx.db.query("newsletterSubscriptions").withIndex("by_created").order("desc").take(NEWSLETTER_SCAN))
      .filter((x) => [x.email, x.name, x.source].some((c) => c && semAcentos(c).includes(q)))
      .map(linha);
    const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
    const paginas = Math.max(1, Math.ceil(todos.length / porPagina));
    const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
    return { linhas: todos.slice(pagina * porPagina, (pagina + 1) * porPagina), total: todos.length, pagina, paginas, porPagina };
  },
});
