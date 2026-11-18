import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { exigirAdmin } from "./lib/admin";

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

const vTipo = v.union(
  v.literal("contactos"),
  v.literal("orcamentos"),
  v.literal("ultraluxo"),
  v.literal("casamentos"),
  v.literal("escolas"),
  v.literal("corporate"),
);
type Tipo = typeof vTipo.type;
type Grupo = "porTratar" | "emCurso" | "fechados";

const TABELA = {
  contactos: "contactSubmissions",
  orcamentos: "contactQuotes",
  ultraluxo: "tourInquiries",
  casamentos: "weddingQuoteSubmissions",
  escolas: "schoolQuoteSubmissions",
  corporate: "corporateRequests",
} as const;

/* Os estados que cada tabela aceita, pela ordem em que se mostram. */
const ESTADOS: Record<Tipo, readonly string[]> = {
  contactos: ["new", "read", "archived"],
  orcamentos: ["new", "inProgress", "resolved", "archived"],
  ultraluxo: ["new", "read", "archived"],
  casamentos: ["new", "read", "archived"],
  escolas: ["new", "read", "archived"],
  corporate: ["submitted", "reviewing", "approved", "rejected"],
};

/* Sem estado gravado é "novo": o campo é opcional em quatro tabelas, e os
   pedidos antigos não o têm (é a mesma regra do contador). */
function estadoDe(tipo: Tipo, status: string | undefined): string {
  return status ?? (tipo === "corporate" ? "submitted" : "new");
}
function grupoDe(estado: string): Grupo {
  if (estado === "new" || estado === "submitted") return "porTratar";
  if (estado === "read" || estado === "inProgress" || estado === "reviewing") return "emCurso";
  return "fechados";
}

type Qualquer =
  | Doc<"contactSubmissions">
  | Doc<"contactQuotes">
  | Doc<"tourInquiries">
  | Doc<"weddingQuoteSubmissions">
  | Doc<"schoolQuoteSubmissions">
  | Doc<"corporateRequests">;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function dataCurta(s: string | number | undefined): string | null {
  if (s === undefined || s === "") return null;
  const d = typeof s === "number" ? new Date(s) : new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (!Number.isFinite(d.getTime())) return String(s);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/* Milhares sempre separados: em pt-PT o Intl deixa "2500 €" sem espaço e
   "12 000 €" com ele, e lado a lado parecia um erro. À mão porque o
   useGrouping: "always" não existe na versão de TypeScript do Convex. */
const euros = (n: number | undefined) =>
  typeof n === "number" ? `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}\u00a0€` : null;

/* O nome e uma linha que diga do que se trata, para a lista. */
function resumo(tipo: Tipo, d: Qualquer): { nome: string; empresa: string | null; linha: string } {
  const partes = (xs: (string | number | null | undefined | false)[]) => xs.filter(Boolean).join(" · ");
  switch (tipo) {
    case "contactos": {
      const x = d as Doc<"contactSubmissions">;
      return { nome: x.name, empresa: null, linha: x.message.replace(/\s+/g, " ").trim() };
    }
    case "orcamentos": {
      const x = d as Doc<"contactQuotes">;
      return { nome: x.fullName, empresa: x.company || null, linha: partes([x.subject, x.message.replace(/\s+/g, " ").trim()]) };
    }
    case "ultraluxo": {
      const x = d as Doc<"tourInquiries">;
      return {
        nome: x.name,
        empresa: null,
        linha: partes([x.tourTitle || "Itinerário à medida", x.people && `${x.people} pessoas`, x.date ? dataCurta(x.date) : x.datesFlexible && "datas flexíveis"]),
      };
    }
    case "casamentos": {
      const x = d as Doc<"weddingQuoteSubmissions">;
      return { nome: x.fullName, empresa: null, linha: partes([dataCurta(x.weddingDate), x.guests && `${x.guests} convidados`, x.venue, euros(x.budget)]) };
    }
    case "escolas": {
      const x = d as Doc<"schoolQuoteSubmissions">;
      return { nome: x.name, empresa: null, linha: partes([x.route, x.children && `${x.children} crianças`, euros(x.budget)]) };
    }
    case "corporate": {
      const x = d as Doc<"corporateRequests">;
      return { nome: x.fullName, empresa: x.companyName || null, linha: partes([dataCurta(x.eventDate), x.guests && `${x.guests} convidados`, x.vehicleType, euros(x.budget)]) };
    }
  }
}

async function lerTodos(ctx: QueryCtx) {
  /* Volumes pequenos (37 pedidos em produção a 2026-11-15): lê-se tudo e
     filtra-se aqui. Com milhares, isto passa a ler pelo índice de estado. */
  const [contactos, orcamentos, ultraluxo, casamentos, escolas, corporate] = await Promise.all([
    ctx.db.query("contactSubmissions").collect(),
    ctx.db.query("contactQuotes").collect(),
    ctx.db.query("tourInquiries").collect(),
    ctx.db.query("weddingQuoteSubmissions").collect(),
    ctx.db.query("schoolQuoteSubmissions").collect(),
    ctx.db.query("corporateRequests").collect(),
  ]);
  const por: Record<Tipo, Qualquer[]> = { contactos, orcamentos, ultraluxo, casamentos, escolas, corporate };
  return (Object.keys(por) as Tipo[]).flatMap((tipo) =>
    por[tipo].map((d) => {
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
    }),
  );
}

const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const lista = query({
  args: {
    tipo: v.union(vTipo, v.literal("todos")),
    grupo: v.union(v.literal("porTratar"), v.literal("emCurso"), v.literal("fechados"), v.literal("todos")),
    pesquisa: v.optional(v.string()),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "pedidos", "ver");
    const todos = await lerTodos(ctx);

    /* Contagens para os separadores: por tratar de cada tipo, e os grupos do
       tipo aberto (antes da pesquisa, para não mudarem a cada letra). */
    const porTipo = Object.fromEntries(
      (Object.keys(TABELA) as Tipo[]).map((t) => [t, todos.filter((x) => x.tipo === t && x.grupo === "porTratar").length]),
    ) as Record<Tipo, number>;
    const doTipo = a.tipo === "todos" ? todos : todos.filter((x) => x.tipo === a.tipo);
    const porGrupo = {
      porTratar: doTipo.filter((x) => x.grupo === "porTratar").length,
      emCurso: doTipo.filter((x) => x.grupo === "emCurso").length,
      fechados: doTipo.filter((x) => x.grupo === "fechados").length,
      todos: doTipo.length,
    };

    const q = semAcentos(a.pesquisa?.trim() ?? "");
    const filtrados = doTipo
      .filter((x) => a.grupo === "todos" || x.grupo === a.grupo)
      .filter((x) => !q || [x.nome, x.empresa, x.email, x.telefone, x.linha, x.parceiro].some((c) => c && semAcentos(c).includes(q)))
      .sort((x, y) => y.recebido - x.recebido);

    const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
    const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
    const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
    return {
      linhas: filtrados.slice(pagina * porPagina, (pagina + 1) * porPagina),
      total: filtrados.length,
      pagina,
      paginas,
      porPagina,
      porTipo,
      porGrupo,
      newsletter: (await ctx.db.query("newsletterSubscriptions").collect()).length,
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
    await exigirAdmin(ctx, "pedidos");
    if (!ESTADOS[tipo].includes(estado)) throw new ConvexError({ tipo: "invalido", mensagem: "Estado que este pedido não aceita." });
    const nid = ctx.db.normalizeId(TABELA[tipo], id);
    const d = nid ? await ctx.db.get(nid) : null;
    if (!nid || !d) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este pedido já não existe." });
    /* O corporate guarda quando foi revisto, como o setStatus antigo. */
    const extra = tipo === "corporate" ? { reviewedAt: Date.now() } : {};
    await ctx.db.patch(nid, { status: estado, ...extra } as never);
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
    await exigirAdmin(ctx, "pedidos");
    const nid = ctx.db.normalizeId(TABELA[tipo], id);
    if (!nid) return;
    if (await ctx.db.get(nid)) await ctx.db.delete(nid);
  },
});

/* A newsletter: só consulta. Não há contrato de envio nem de consentimento
   editável, e o plano não quer que se invente (PED-07). */
export const newsletter = query({
  args: { pesquisa: v.optional(v.string()), pagina: v.number(), porPagina: v.number() },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "pedidos", "ver");
    const q = semAcentos(a.pesquisa?.trim() ?? "");
    const todos = (await ctx.db.query("newsletterSubscriptions").collect())
      .filter((x) => !q || [x.email, x.name, x.source].some((c) => c && semAcentos(c).includes(q)))
      .sort((x, y) => y.createdAt - x.createdAt)
      .map((x) => ({ id: x._id as string, email: x.email, nome: x.name ?? null, origem: x.source ?? null, recebido: x.createdAt }));
    const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
    const paginas = Math.max(1, Math.ceil(todos.length / porPagina));
    const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
    return { linhas: todos.slice(pagina * porPagina, (pagina + 1) * porPagina), total: todos.length, pagina, paginas, porPagina };
  },
});
