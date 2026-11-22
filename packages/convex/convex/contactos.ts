import { ConvexError, v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { exigirAdmin, lerAcesso, temCapacidade } from "./lib/admin";
import { RELACOES, ligarContacto, ligarOrganizacao, normalizarEmail, normalizarNome, normalizarTelefone, relacaoDaOrigem, type Relacao } from "./lib/contactos";
import { FUNIS, segmentoDaOrigem, tituloDaOrigem, type ChaveFunil } from "./lib/funis";
import { local } from "./inicio";
import { facts } from "./lib/orderFacts";
import { mergedPage } from "./lib/orderList";
import { contactSortKey, rotuloDaOrigem, type ContactSort } from "./lib/contactFacts";

/*
 * Contactos (organizações e pessoas, em Clientes · Parceiros · Motoristas) e Parceiros → Carteira (as
 * organizações com uma parceria ganha). A base do CRM: cada cartão do
 * quadro e cada reserva ligam-se a um contacto e, havendo, a uma
 * organização (lib/contactos.ts).
 *
 * «Responsável» é um campo (quem trata); quem vê é decidido pelas
 * permissões do cargo: «contactos» para organizações e pessoas, «parcerias»
 * para a Carteira.
 */

const vTipo = v.union(v.literal("organizacoes"), v.literal("contactos"));
const vRelacao = v.union(...RELACOES.map((r) => v.literal(r)));
const vEstadoCarteira = v.union(v.literal("ativacao"), v.literal("ativa"), v.literal("semAtividade"), v.literal("suspensa"), v.literal("terminada"));

function semAcentos(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* O que se diz de cada cartão ligado: o funil, a etapa, se está fechado. */
async function cartoesDe(ctx: QueryCtx, filtro: { contactoId?: Id<"contactos">; organizacaoId?: Id<"organizacoes"> }) {
  const negs = filtro.contactoId
    ? await ctx.db.query("negocios").withIndex("by_contacto", (q) => q.eq("contactoId", filtro.contactoId)).collect()
    : await ctx.db.query("negocios").withIndex("by_organizacao", (q) => q.eq("organizacaoId", filtro.organizacaoId)).collect();
  const funis = new Map<string, Doc<"funis">>();
  const linhas = [];
  for (const n of negs) {
    let f = funis.get(n.funilId);
    if (!f) {
      f = (await ctx.db.get(n.funilId)) ?? undefined;
      if (f) funis.set(n.funilId, f);
    }
    const etapa = f?.etapas.find((e) => e.id === n.etapaId);
    linhas.push({
      id: n._id,
      titulo: n.titulo,
      funil: f ? FUNIS[f.chave as ChaveFunil]?.titulo ?? f.chave : "",
      chave: (f?.chave ?? null) as ChaveFunil | null,
      etapa: etapa?.nome ?? "",
      cor: etapa?.cor ?? "#64748b",
      tipo: etapa?.tipo ?? "aberta",
      origem: n.origem,
      origemId: n.origemId ?? null,
      criadoEm: n.criadoEm,
    });
  }
  return linhas.sort((a, b) => b.criadoEm - a.criadoEm);
}

/* As reservas de um contacto, para a ficha. O total só com «Ver valores»:
   ia sempre, e a ficha é aberta por quem só tem Contactos. */
async function reservasDe(ctx: QueryCtx, filtro: { contactoId?: Id<"contactos">; organizacaoId?: Id<"organizacoes"> }) {
  const verValores = temCapacidade(await lerAcesso(ctx), "valores");
  const os = filtro.contactoId
    ? await ctx.db.query("orders").withIndex("by_contacto", (q) => q.eq("contactoId", filtro.contactoId)).collect()
    : await ctx.db.query("orders").withIndex("by_organizacao", (q) => q.eq("organizacaoId", filtro.organizacaoId)).collect();
  return os
    .map((o) => ({
      id: o._id,
      numero: o.orderNumber ?? null,
      estado: o.status,
      viagem: o.departureDate ? String(o.departureDate) : null,
      rota: `${local(o.departure)} → ${local(o.arrival)}`,
      total: verValores ? (o.totalAmount ?? null) : null,
    }))
    .sort((a, b) => (b.viagem ?? "").localeCompare(a.viagem ?? ""));
}

/* ─── Listas ──────────────────────────────────────────────────────────── */

/*
 * Each contact and organisation carries its numbers and relations, kept by
 * triggers (lib/contactFacts.ts), and is filed in the facts by type,
 * relation and sort. The list counts in one call and reads only its page;
 * with filters it reads in order and filters, up to SCAN_LIMIT; a search
 * goes through the text index. It used to read every contact, organisation,
 * order and card on each opening: at a new contact per paid booking, that
 * stops fitting in a query within weeks.
 */
const SCAN_LIMIT = 1000;
const SCAN_PAGE = 200;
const SEARCH_LIMIT = 200;
type Kind = "organizacoes" | "contactos";
type Registo = Doc<"contactos"> | Doc<"organizacoes">;

async function linhaDe(ctx: QueryCtx, tipo: Kind, d: Registo, verValores: boolean) {
  const euros = (x: number | undefined) => (verValores ? Math.round((x ?? 0) * 100) / 100 : null);
  const comuns = {
    id: d._id as string,
    nome: d.nome,
    email: d.email ?? null,
    telefone: d.telefone ?? null,
    etiquetas: d.etiquetas,
    responsavel: d.responsavel ?? null,
    idioma: d.idioma ?? null,
    relacoes: (d.relacoes ?? ["clientes"]) as Relacao[],
    atualizadoEm: d.atualizadoEm,
    desde: d.criadoEm,
    reservas: d.nReservas ?? 0,
    gasto: euros(d.gasto),
    ultimaReserva: d.ultimaReserva ?? null,
    pedidos: d.nPedidos ?? 0,
  };
  if (tipo === "organizacoes") {
    const o = d as Doc<"organizacoes">;
    const grupo = o.grupoId ? await ctx.db.get(o.grupoId) : null;
    /* O que se vendeu pela página da parceria: os números da página do
       parceiro (parceiros.lista). */
    const pid = o.carteira?.partnershipId;
    let vendas = 0;
    let faturado = 0;
    if (pid) {
      const ns = [["partner", pid, "outbound"], ["partner", pid, "return"]].map((namespace) => ({ namespace }));
      const [c, s] = [await facts.countBatch(ctx, ns), await facts.sumBatch(ctx, ns)];
      vendas = c[0]!;
      faturado = s[0]! + s[1]!;
    }
    return {
      ...comuns,
      subtitulo: o.grupoId ? `Estabelecimento de ${grupo?.nome ?? "?"}` : (o.localidade ?? null),
      segmento: o.segmento ?? null,
      localidade: o.localidade ?? null,
      pessoas: o.nPessoas ?? 0,
      estabelecimentos: o.nEstabelecimentos ?? 0,
      carteira: o.carteira?.estado ?? null,
      origem: null as string | null,
      vendasPagina: vendas,
      faturadoPagina: euros(faturado),
    };
  }
  const c = d as Doc<"contactos">;
  const o = c.organizacaoId ? await ctx.db.get(c.organizacaoId) : null;
  return {
    ...comuns,
    subtitulo: [c.funcao, o?.nome].filter(Boolean).join(" · ") || "Particular",
    segmento: o?.segmento ?? null,
    localidade: o?.localidade ?? null,
    pessoas: 0,
    estabelecimentos: 0,
    carteira: o?.carteira?.estado ?? null,
    origem: rotuloDaOrigem(c.primeiraOrigem),
    vendasPagina: 0,
    faturadoPagina: euros(0),
  };
}

const vOrdemContactos = v.union(v.literal("recentes"), v.literal("reservas"), v.literal("gasto"), v.literal("nome"));
type LinhaContacto = Awaited<ReturnType<typeof linhaDe>>;

/* As colunas que a lista pode mostrar; vão só as que têm dados em alguma
   linha (Segmento, Responsável e Carteira estavam a «—» em tudo). */
const COLUNAS_CONTACTOS = ["contacto", "pessoas", "vendas", "reservas", "gasto", "ultima", "pedidos", "origem", "localidade", "segmento", "responsavel", "carteira", "desde"];

/*
 * A lista dos Contactos: filtros, pesquisa, ordem e página vêm do endereço e
 * resolvem-se aqui. O dashboard só mostra a página que recebe.
 */
export const lista = query({
  args: {
    tipo: vTipo,
    relacao: v.optional(vRelacao),
    pesquisa: v.optional(v.string()),
    segmento: v.optional(v.string()),
    responsavel: v.optional(v.string()),
    idioma: v.optional(v.string()),
    localidade: v.optional(v.string()),
    etiqueta: v.optional(v.string()),
    origem: v.optional(v.string()),
    carteira: v.optional(v.string()),
    reservas: v.optional(v.union(v.literal("com"), v.literal("recorrentes"), v.literal("sem"))),
    ultima: v.optional(v.union(v.literal("30"), v.literal("90"), v.literal("365"), v.literal("inactivos"))),
    pedidos: v.optional(v.union(v.literal("com"), v.literal("sem"))),
    ordem: v.optional(vOrdemContactos),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "contactos", "ver");
    const verValores = temCapacidade(await lerAcesso(ctx), "valores");
    const tipo = a.tipo;
    const rel = a.relacao ?? "all";
    /* Ordenar pelo gasto diria a ordem dos valores a quem não os vê. */
    const ordem: ContactSort = a.ordem === "gasto" && !verValores ? "recentes" : (a.ordem ?? "recentes");
    const sentido = ordem === "nome" ? "asc" : "desc";
    const ns = ["ct", tipo, rel, ordem];

    /* As opções e as colunas: os valores que já apareceram neste tipo. */
    const facetas = await ctx.db.query("orderFacetValues").withIndex("by_view_dim", (q) => q.eq("view", tipo)).take(2000);
    const de = (dim: string) => facetas.filter((f) => f.dim === dim).map((f) => f.value).sort((x, y) => x.localeCompare(y, "pt"));
    const opcoes = {
      segmentos: de("segmento"),
      responsaveis: de("responsavel"),
      idiomas: de("idioma"),
      localidades: de("localidade"),
      etiquetas: de("etiqueta"),
      origens: de("origem"),
      carteiras: de("carteira"),
    };
    const comDados = new Set(de("col"));
    const colunas = COLUNAS_CONTACTOS.filter((c) => comDados.has(c));
    const totalSemFiltros = await facts.count(ctx, { namespace: ["ct", tipo, rel, "recentes"] });

    const termos = semAcentos(a.pesquisa ?? "").split(/\s+/).filter(Boolean);
    const agora = Date.now();
    const filtra = (l: LinhaContacto) => {
      if (a.segmento && l.segmento !== a.segmento) return false;
      if (a.responsavel && l.responsavel !== a.responsavel) return false;
      if (a.idioma && l.idioma !== a.idioma) return false;
      if (a.localidade && l.localidade !== a.localidade) return false;
      if (a.etiqueta && !l.etiquetas.includes(a.etiqueta)) return false;
      if (a.origem && l.origem !== a.origem) return false;
      if (a.carteira && l.carteira !== a.carteira) return false;
      if (a.reservas === "com" && !l.reservas) return false;
      if (a.reservas === "recorrentes" && l.reservas < 2) return false;
      if (a.reservas === "sem" && l.reservas) return false;
      if (a.pedidos === "com" && !l.pedidos) return false;
      if (a.pedidos === "sem" && l.pedidos) return false;
      if (a.ultima) {
        if (!l.ultimaReserva) return false;
        const dias = (agora - l.ultimaReserva) / 86_400_000;
        if (a.ultima === "inactivos" ? dias <= 365 : dias > Number(a.ultima)) return false;
      }
      return true;
    };
    const comFiltros = Boolean(a.segmento || a.responsavel || a.idioma || a.localidade || a.etiqueta || a.origem || a.carteira || a.reservas || a.pedidos || a.ultima);
    const porPagina = Math.min(Math.max(1, Math.floor(a.porPagina)), 100);
    const naRelacao = (d: Registo) =>
      rel === "all" || ((d.relacoes ?? ["clientes"]).includes(rel) && !(tipo === "contactos" && rel === "motoristas" && (d as Doc<"contactos">).organizacaoId));
    const comparar = (x: Registo, y: Registo) => {
      const vx = contactSortKey(x, ordem);
      const vy = contactSortKey(y, ordem);
      const c = Array.isArray(vx) && Array.isArray(vy) ? vx[0]! - vy[0]! || vx[1]! - vy[1]! : vx < vy ? -1 : vx > vy ? 1 : 0;
      const t = c || (x._id < y._id ? -1 : x._id > y._id ? 1 : 0);
      return sentido === "asc" ? t : -t;
    };
    let docs: Registo[];
    let total: number;
    let aproximado = false;
    let pagina = Math.max(0, Math.floor(a.pagina));
    if (termos.length) {
      const selectiva = termos.find((x) => /\d/.test(x)) ?? termos.reduce((x, y) => (y.length > x.length ? y : x));
      const encontrados = new Map<string, Registo>();
      for (const texto of [...new Set([termos.join(" "), selectiva])]) {
        const r = (await ctx.db
          .query(tipo)
          .withSearchIndex("search_procura", (q) => q.search("procura", texto))
          .take(SEARCH_LIMIT)) as Registo[];
        if (texto === selectiva && r.length === SEARCH_LIMIT) aproximado = true;
        for (const d of r) if (naRelacao(d) && termos.every((x) => (d.procura ?? "").includes(x))) encontrados.set(d._id, d);
      }
      docs = [...encontrados.values()].sort(comparar);
      const linhas = [];
      for (const d of docs) {
        const l = await linhaDe(ctx, tipo, d, verValores);
        if (filtra(l)) linhas.push(l);
      }
      total = linhas.length;
      const paginas = Math.max(1, Math.ceil(total / porPagina));
      pagina = Math.min(pagina, paginas - 1);
      return { tipo, linhas: linhas.slice(pagina * porPagina, (pagina + 1) * porPagina), total, aproximado, totalSemFiltros, pagina, paginas, porPagina, opcoes, colunas, verValores };
    }
    if (!comFiltros) {
      /* Every sort of a relation holds the same rows. */
      total = totalSemFiltros;
      const paginas = Math.max(1, Math.ceil(total / porPagina));
      pagina = Math.min(pagina, paginas - 1);
      const ids = total ? await mergedPage(ctx, [ns], [total], {}, sentido, pagina * porPagina, porPagina) : [];
      docs = (await Promise.all(ids.map((id) => ctx.db.get(id as Id<"contactos">)))).filter((d): d is Doc<"contactos"> => d !== null) as Registo[];
      const linhas = [];
      for (const d of docs) linhas.push(await linhaDe(ctx, tipo, d, verValores));
      return { tipo, linhas, total, aproximado, totalSemFiltros, pagina, paginas, porPagina, opcoes, colunas, verValores };
    }
    /* Com filtros: pela ordem pedida, a filtrar, até SCAN_LIMIT. */
    const linhas: LinhaContacto[] = [];
    let cursor: string | undefined;
    let lidos = 0;
    let fim = false;
    while (lidos < SCAN_LIMIT) {
      const r = await facts.paginate(ctx, { namespace: ns, cursor, order: sentido, pageSize: SCAN_PAGE });
      lidos += r.page.length;
      for (const i of r.page) {
        const d = (await ctx.db.get(i.id as Id<"contactos">)) as Registo | null;
        if (!d) continue;
        const l = await linhaDe(ctx, tipo, d, verValores);
        if (filtra(l)) linhas.push(l);
      }
      cursor = r.cursor;
      if (r.isDone) {
        fim = true;
        break;
      }
    }
    total = linhas.length;
    aproximado = !fim;
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    pagina = Math.min(pagina, paginas - 1);
    return { tipo, linhas: linhas.slice(pagina * porPagina, (pagina + 1) * porPagina), total, aproximado, totalSemFiltros, pagina, paginas, porPagina, opcoes, colunas, verValores };
  },
});

/* Para escolher um contacto ou organização (passar as ligações ao apagar,
   a organização de uma pessoa): a pesquisa faz-se aqui e vêm só os
   primeiros, pelo índice de texto e pelos índices de email e telefone. */
export const escolher = query({
  args: {
    tipo: vTipo,
    pesquisa: v.optional(v.string()),
    excluir: v.optional(v.string()),
    /* O que já está escolhido entra sempre, mesmo fora dos primeiros. */
    incluir: v.optional(v.string()),
    /* Ao apagar: os parecidos com o que se apaga primeiro (mesmo email ou
       telefone, depois o mesmo primeiro nome). */
    semelhante: v.optional(v.object({ nome: v.optional(v.string()), email: v.optional(v.string()), telefone: v.optional(v.string()) })),
    limite: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "contactos", "ver");
    const termos = semAcentos(a.pesquisa ?? "").split(/\s+/).filter(Boolean);
    const limite = Math.min(Math.max(1, a.limite ?? 20), 50);
    const primeiro = semAcentos(a.semelhante?.nome ?? "").split(/\s+/)[0] ?? "";
    const parecido = (x: Registo) =>
      (a.semelhante?.email && x.email === a.semelhante.email ? 4 : 0) +
      (a.semelhante?.telefone && x.telefone === a.semelhante.telefone ? 4 : 0) +
      (primeiro && semAcentos(x.nome).split(/\s+/)[0] === primeiro ? 1 : 0);
    const cand = new Map<string, Registo>();
    const juntar = (ds: (Registo | null)[]) => {
      for (const d of ds) if (d) cand.set(d._id, d);
    };
    const procurar = async (texto: string, n: number) =>
      (await ctx.db
        .query(a.tipo)
        .withSearchIndex("search_procura", (q) => q.search("procura", texto))
        .take(n)) as Registo[];
    if (termos.length) {
      const selectiva = termos.find((x) => /\d/.test(x)) ?? termos.reduce((x, y) => (y.length > x.length ? y : x));
      for (const texto of [...new Set([termos.join(" "), selectiva])]) juntar((await procurar(texto, 100)).filter((d) => termos.every((t) => (d.procura ?? "").includes(t))));
    } else {
      const ordem = a.tipo === "organizacoes" ? "nome" : "recentes";
      const { page } = await facts.paginate(ctx, { namespace: ["ct", a.tipo, "all", ordem], order: ordem === "nome" ? "asc" : "desc", pageSize: 200 });
      juntar((await Promise.all(page.map((i) => ctx.db.get(i.id as Id<"contactos">)))) as (Registo | null)[]);
      /* Os parecidos entram sempre, estejam onde estiverem. */
      const s = a.semelhante;
      if (s?.email) {
        juntar((await ctx.db.query(a.tipo).withIndex("by_email", (q) => q.eq("email", s.email)).take(20)) as Registo[]);
      }
      if (s?.telefone && a.tipo === "contactos") juntar(await ctx.db.query("contactos").withIndex("by_telefone", (q) => q.eq("telefone", s.telefone)).take(20));
      if (primeiro) juntar((await procurar(primeiro, 50)).filter((d) => semAcentos(d.nome).split(/\s+/)[0] === primeiro));
    }
    const encontrados = [...cand.values()]
      .filter((x) => x._id !== a.excluir)
      .sort((x, y) => parecido(y) - parecido(x) || (a.tipo === "organizacoes" ? x.nome.localeCompare(y.nome, "pt") : y.atualizadoEm - x.atualizadoEm))
      .slice(0, limite);
    const extra: Registo[] = [];
    if (a.incluir && !encontrados.some((x) => x._id === a.incluir)) {
      const nid = ctx.db.normalizeId(a.tipo, a.incluir);
      const d = nid ? ((await ctx.db.get(nid)) as Registo | null) : null;
      if (d) extra.push(d);
    }
    return [...extra, ...encontrados].map((d) => ({
      id: d._id as string,
      nome: d.nome,
      subtitulo: a.tipo === "organizacoes" ? ((d as Doc<"organizacoes">).localidade ?? null) : ((d as Doc<"contactos">).funcao ?? null),
      email: d.email ?? null,
      telefone: d.telefone ?? null,
    }));
  },
});

export const ficha = query({
  args: { tipo: vTipo, id: v.string() },
  handler: async (ctx, { tipo, id }) => {
    await exigirAdmin(ctx, "contactos", "ver");
    if (tipo === "organizacoes") {
      const oid = ctx.db.normalizeId("organizacoes", id);
      const o = oid ? await ctx.db.get(oid) : null;
      if (!o) return null;
      const grupo = o.grupoId ? await ctx.db.get(o.grupoId) : null;
      const estabelecimentos = await ctx.db.query("organizacoes").withIndex("by_grupo", (q) => q.eq("grupoId", o._id)).collect();
      const pessoas = await ctx.db.query("contactos").withIndex("by_organizacao", (q) => q.eq("organizacaoId", o._id)).collect();
      const pagina = o.carteira?.partnershipId ? await ctx.db.get(o.carteira.partnershipId) : null;
      return {
        tipo,
        organizacao: { ...o, id: o._id as string },
        grupo: grupo ? { id: grupo._id as string, nome: grupo.nome } : null,
        estabelecimentos: estabelecimentos.map((e) => ({ id: e._id as string, nome: e.nome, localidade: e.localidade ?? null })),
        pessoas: pessoas.map((p) => ({ id: p._id as string, nome: p.nome, funcao: p.funcao ?? null, email: p.email ?? null, telefone: p.telefone ?? null })),
        cartoes: await cartoesDe(ctx, { organizacaoId: o._id }),
        reservas: await reservasDe(ctx, { organizacaoId: o._id }),
        pagina: pagina ? { id: pagina._id as string, nome: pagina.name, slug: pagina.slug } : null,
        primeiraReserva: await primeiraReserva(ctx, o),
      };
    }
    const cid = ctx.db.normalizeId("contactos", id);
    const c = cid ? await ctx.db.get(cid) : null;
    if (!c) return null;
    const o = c.organizacaoId ? await ctx.db.get(c.organizacaoId) : null;
    return {
      tipo,
      contacto: { ...c, id: c._id as string },
      organizacao: o ? { id: o._id as string, nome: o.nome } : null,
      cartoes: await cartoesDe(ctx, { contactoId: c._id }),
      reservas: await reservasDe(ctx, { contactoId: c._id }),
    };
  },
});

/* A primeira reserva de uma parceria: a mais antiga paga com a sua página. */
async function primeiraReserva(ctx: QueryCtx, o: Doc<"organizacoes">): Promise<{ numero: string | null; em: number } | null> {
  const pid = o.carteira?.partnershipId;
  if (!pid) return null;
  /* A mais antiga paga com a sua página: o primeiro dos agregados do
     parceiro, não as encomendas pagas todas. */
  const first = await facts.min(ctx, { namespace: ["partner", pid, "outbound"] });
  const p = first ? await ctx.db.get(first.id as Id<"orders">) : null;
  return p ? { numero: p.orderNumber ?? null, em: p._creationTime } : null;
}

/* Quem pode ser responsável: a equipa ativa e os donos. Com a permissão de
   ver contactos (não a da Equipa), para o seletor funcionar a todos. */
export const responsaveis = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "contactos", "ver");
    const pessoas = (await ctx.db.query("colaboradores").collect())
      .filter((c) => c.estado === "activo")
      .map((c) => ({ email: c.email, nome: c.nome }));
    const donos = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && !pessoas.some((p) => p.email === e))
      .map((e) => ({ email: e, nome: e.split("@")[0]! }));
    return [...pessoas, ...donos].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  },
});

/* ─── Guardar ─────────────────────────────────────────────────────────── */

const vOrg = {
  nome: v.string(),
  nif: v.optional(v.string()),
  segmento: v.optional(v.string()),
  etiquetas: v.array(v.string()),
  email: v.optional(v.string()),
  telefone: v.optional(v.string()),
  site: v.optional(v.string()),
  idioma: v.optional(v.string()),
  localidade: v.optional(v.string()),
  pais: v.optional(v.string()),
  morada: v.optional(v.string()),
  grupoId: v.optional(v.string()),
  responsavel: v.optional(v.string()),
  notas: v.optional(v.string()),
};

function limpo(s: string | undefined) {
  return s?.trim() || undefined;
}

export const guardarOrganizacao = mutation({
  args: { id: v.optional(v.id("organizacoes")), ...vOrg, relacao: v.optional(vRelacao) },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "contactos", "editar");
    const nome = a.nome.trim().replace(/\s+/g, " ");
    const erros: Record<string, string> = {};
    if (!nome) erros.nome = "Falta o nome.";
    const email = a.email?.trim() ? normalizarEmail(a.email) : undefined;
    if (a.email?.trim() && !email) erros.email = "O email não parece válido.";
    const grupoId = a.grupoId ? ctx.db.normalizeId("organizacoes", a.grupoId) : null;
    if (a.grupoId && !grupoId) erros.grupoId = "Esse grupo já não existe.";
    if (grupoId && a.id && grupoId === a.id) erros.grupoId = "Uma organização não pode ser grupo de si própria.";
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "validacao", erros });
    const dados = {
      nome,
      nomeNormalizado: normalizarNome(nome),
      nif: limpo(a.nif),
      segmento: limpo(a.segmento),
      etiquetas: [...new Set(a.etiquetas.map((e) => e.trim()).filter(Boolean))],
      email,
      telefone: normalizarTelefone(a.telefone),
      site: limpo(a.site),
      idioma: limpo(a.idioma),
      localidade: limpo(a.localidade),
      pais: limpo(a.pais),
      morada: limpo(a.morada),
      grupoId: grupoId ?? undefined,
      responsavel: limpo(a.responsavel)?.toLowerCase(),
      notas: limpo(a.notas),
      atualizadoEm: Date.now(),
    };
    if (a.id) {
      if (!(await ctx.db.get(a.id))) throw new ConvexError("Esta organização já não existe.");
      await ctx.db.patch(a.id, dados);
      return a.id;
    }
    /* Criada numa sub-aba (Clientes, Parceiros, Motoristas): fica lá. */
    return await ctx.db.insert("organizacoes", { ...dados, primeiraOrigem: a.relacao ? `manual:${a.relacao}` : "manual", criadoEm: Date.now() });
  },
});

export const guardarContacto = mutation({
  args: {
    id: v.optional(v.id("contactos")),
    nome: v.string(),
    email: v.optional(v.string()),
    telefone: v.optional(v.string()),
    idioma: v.optional(v.string()),
    funcao: v.optional(v.string()),
    etiquetas: v.array(v.string()),
    responsavel: v.optional(v.string()),
    organizacaoId: v.optional(v.string()),
    notas: v.optional(v.string()),
    relacao: v.optional(vRelacao),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "contactos", "editar");
    const nome = a.nome.trim().replace(/\s+/g, " ");
    const erros: Record<string, string> = {};
    if (!nome) erros.nome = "Falta o nome.";
    const email = a.email?.trim() ? normalizarEmail(a.email) : undefined;
    if (a.email?.trim() && !email) erros.email = "O email não parece válido.";
    const telefone = normalizarTelefone(a.telefone);
    if (email) {
      const outro = await ctx.db.query("contactos").withIndex("by_email", (q) => q.eq("email", email)).first();
      if (outro && outro._id !== a.id) erros.email = `Já existe um contacto com este email: ${outro.nome}.`;
    }
    const organizacaoId = a.organizacaoId ? ctx.db.normalizeId("organizacoes", a.organizacaoId) : null;
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "validacao", erros });
    const dados = {
      nome,
      email,
      telefone,
      idioma: limpo(a.idioma),
      funcao: limpo(a.funcao),
      etiquetas: [...new Set(a.etiquetas.map((e) => e.trim()).filter(Boolean))],
      responsavel: limpo(a.responsavel)?.toLowerCase(),
      organizacaoId: organizacaoId ?? undefined,
      notas: limpo(a.notas),
      atualizadoEm: Date.now(),
    };
    if (a.id) {
      if (!(await ctx.db.get(a.id))) throw new ConvexError("Este contacto já não existe.");
      await ctx.db.patch(a.id, dados);
      return a.id;
    }
    return await ctx.db.insert("contactos", { ...dados, primeiraOrigem: a.relacao ? `manual:${a.relacao}` : "manual", criadoEm: Date.now() });
  },
});

/* ─── Apagar ───────────────────────────────────────────────────────────── */

/*
 * Apagar um contacto ou uma organização. Sem nada ligado, apaga. Com
 * reservas, cartões, pessoas ou estabelecimentos, essas ligações passam
 * primeiro para outro registo (passarPara) — o que antes era «juntar
 * duplicados» num ecrã à parte: a mesma pessoa com dois emails ficava com
 * meia história em cada um, e apagar um deixava reservas a apontar para
 * ninguém. Os dados que faltam no que fica (email, telefone, NIF…) vêm do
 * que se apaga.
 */
async function passarEApagar(ctx: MutationCtx, tipo: "organizacoes" | "contactos", manter: string, apagar: string) {
    if (manter === apagar) throw new ConvexError("Escolha outro registo para ficar com as ligações.");
    if (tipo === "contactos") {
      const m = ctx.db.normalizeId("contactos", manter), x = ctx.db.normalizeId("contactos", apagar);
      const cm = m && (await ctx.db.get(m)), cx = x && (await ctx.db.get(x));
      if (!cm || !cx) throw new ConvexError("Um dos contactos já não existe.");
      await ctx.db.patch(cm._id, {
        email: cm.email ?? cx.email,
        telefone: cm.telefone ?? cx.telefone,
        idioma: cm.idioma ?? cx.idioma,
        funcao: cm.funcao ?? cx.funcao,
        organizacaoId: cm.organizacaoId ?? cx.organizacaoId,
        responsavel: cm.responsavel ?? cx.responsavel,
        etiquetas: [...new Set([...cm.etiquetas, ...cx.etiquetas])],
        notas: [cm.notas, cx.notas].filter(Boolean).join("\n\n") || undefined,
        atualizadoEm: Date.now(),
      });
      for (const n of await ctx.db.query("negocios").withIndex("by_contacto", (q) => q.eq("contactoId", cx._id)).collect()) await ctx.db.patch(n._id, { contactoId: cm._id });
      for (const o of await ctx.db.query("orders").withIndex("by_contacto", (q) => q.eq("contactoId", cx._id)).collect()) await ctx.db.patch(o._id, { contactoId: cm._id });
      await ctx.db.delete(cx._id);
      return null;
    }
    const m = ctx.db.normalizeId("organizacoes", manter), x = ctx.db.normalizeId("organizacoes", apagar);
    const om = m && (await ctx.db.get(m)), ox = x && (await ctx.db.get(x));
    if (!om || !ox) throw new ConvexError("Uma das organizações já não existe.");
    await ctx.db.patch(om._id, {
      nif: om.nif ?? ox.nif,
      segmento: om.segmento ?? ox.segmento,
      email: om.email ?? ox.email,
      telefone: om.telefone ?? ox.telefone,
      site: om.site ?? ox.site,
      idioma: om.idioma ?? ox.idioma,
      localidade: om.localidade ?? ox.localidade,
      pais: om.pais ?? ox.pais,
      morada: om.morada ?? ox.morada,
      responsavel: om.responsavel ?? ox.responsavel,
      carteira: om.carteira ?? ox.carteira,
      estadoCarteira: om.estadoCarteira ?? ox.estadoCarteira,
      etiquetas: [...new Set([...om.etiquetas, ...ox.etiquetas])],
      notas: [om.notas, ox.notas].filter(Boolean).join("\n\n") || undefined,
      atualizadoEm: Date.now(),
    });
    for (const c of await ctx.db.query("contactos").withIndex("by_organizacao", (q) => q.eq("organizacaoId", ox._id)).collect()) await ctx.db.patch(c._id, { organizacaoId: om._id });
    for (const e of await ctx.db.query("organizacoes").withIndex("by_grupo", (q) => q.eq("grupoId", ox._id)).collect()) await ctx.db.patch(e._id, { grupoId: om._id });
    for (const n of await ctx.db.query("negocios").withIndex("by_organizacao", (q) => q.eq("organizacaoId", ox._id)).collect()) await ctx.db.patch(n._id, { organizacaoId: om._id });
    for (const o of await ctx.db.query("orders").withIndex("by_organizacao", (q) => q.eq("organizacaoId", ox._id)).collect()) await ctx.db.patch(o._id, { organizacaoId: om._id });
    await ctx.db.delete(ox._id);
    return null;
}

async function ligacoes(ctx: MutationCtx, tipo: "organizacoes" | "contactos", id: string): Promise<number> {
  if (tipo === "contactos") {
    const c = ctx.db.normalizeId("contactos", id);
    if (!c) return 0;
    const n = await ctx.db.query("negocios").withIndex("by_contacto", (q) => q.eq("contactoId", c)).take(1);
    const o = await ctx.db.query("orders").withIndex("by_contacto", (q) => q.eq("contactoId", c)).take(1);
    return n.length + o.length;
  }
  const o = ctx.db.normalizeId("organizacoes", id);
  if (!o) return 0;
  const contas = await Promise.all([
    ctx.db.query("contactos").withIndex("by_organizacao", (q) => q.eq("organizacaoId", o)).take(1),
    ctx.db.query("organizacoes").withIndex("by_grupo", (q) => q.eq("grupoId", o)).take(1),
    ctx.db.query("negocios").withIndex("by_organizacao", (q) => q.eq("organizacaoId", o)).take(1),
    ctx.db.query("orders").withIndex("by_organizacao", (q) => q.eq("organizacaoId", o)).take(1),
  ]);
  return contas.reduce((t, x) => t + x.length, 0);
}

export const apagar = mutation({
  args: { tipo: vTipo, id: v.string(), passarPara: v.optional(v.string()) },
  handler: async (ctx, { tipo, id, passarPara }) => {
    await exigirAdmin(ctx, "contactos", "editar", "apagar");
    if (passarPara) {
      await passarEApagar(ctx, tipo, passarPara, id);
      return null;
    }
    if ((await ligacoes(ctx, tipo, id)) > 0) {
      throw new ConvexError("Tem reservas, pedidos ou pessoas ligadas: escolha para quem passam antes de apagar.");
    }
    const nid = tipo === "contactos" ? ctx.db.normalizeId("contactos", id) : ctx.db.normalizeId("organizacoes", id);
    if (!nid || !(await ctx.db.get(nid))) throw new ConvexError("Este registo já não existe.");
    await ctx.db.delete(nid);
    return null;
  },
});

/* ─── Carteira ────────────────────────────────────────────────────────── */

const ESTADOS_CARTEIRA = ["ativacao", "ativa", "semAtividade", "suspensa", "terminada"] as const;

export const carteira = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "parcerias", "ver");
    const linhas = [];
    for (const estado of ESTADOS_CARTEIRA) {
      for (const o of await ctx.db.query("organizacoes").withIndex("by_estado_carteira", (q) => q.eq("estadoCarteira", estado)).collect()) {
        linhas.push({
          id: o._id as string,
          nome: o.nome,
          segmento: o.segmento ?? null,
          localidade: o.localidade ?? null,
          responsavel: o.responsavel ?? null,
          estado,
          aceiteEm: o.carteira?.aceiteEm ?? null,
          ativadaEm: o.carteira?.ativadaEm ?? null,
          proximoAcompanhamento: o.carteira?.proximoAcompanhamento ?? null,
          temPagina: Boolean(o.carteira?.partnershipId),
          atualizadoEm: o.atualizadoEm,
        });
      }
    }
    return linhas;
  },
});

export const guardarCarteira = mutation({
  args: {
    id: v.id("organizacoes"),
    estado: vEstadoCarteira,
    aceiteEm: v.optional(v.number()),
    ativadaEm: v.optional(v.number()),
    formacaoEm: v.optional(v.number()),
    proximoAcompanhamento: v.optional(v.number()),
    partnershipId: v.optional(v.string()),
    acesso: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "parcerias", "editar");
    const o = await ctx.db.get(a.id);
    if (!o) throw new ConvexError("Esta organização já não existe.");
    const partnershipId = a.partnershipId ? ctx.db.normalizeId("partnerships", a.partnershipId) : null;
    if (a.partnershipId && !partnershipId) throw new ConvexError("Essa página de parceiro já não existe.");
    /* Passar a Ativa sem data de ativação grava agora. */
    const ativadaEm = a.ativadaEm ?? (a.estado === "ativa" ? (o.carteira?.ativadaEm ?? Date.now()) : o.carteira?.ativadaEm);
    await ctx.db.patch(a.id, {
      carteira: {
        estado: a.estado,
        aceiteEm: a.aceiteEm ?? o.carteira?.aceiteEm,
        ativadaEm,
        formacaoEm: a.formacaoEm,
        proximoAcompanhamento: a.proximoAcompanhamento,
        partnershipId: partnershipId ?? undefined,
        acesso: limpo(a.acesso),
      },
      estadoCarteira: a.estado,
      atualizadoEm: Date.now(),
    });
    return null;
  },
});

/*
 * Uma parceria ganha (o cartão das Parcerias passou a Onboarding): a
 * organização entra na Carteira em «Em ativação». Sem organização no
 * cartão, cria-se com o nome da empresa (ou da pessoa).
 */
export async function ativarCarteira(ctx: MutationCtx, n: Doc<"negocios">) {
  let organizacaoId = n.organizacaoId ?? null;
  if (!organizacaoId) {
    organizacaoId = await ligarOrganizacao(ctx, n.organizacao || n.pessoa.nome, n.origem);
    if (!organizacaoId) return;
    await ctx.db.patch(n._id, { organizacaoId });
    if (n.contactoId) {
      const c = await ctx.db.get(n.contactoId);
      if (c && !c.organizacaoId) await ctx.db.patch(c._id, { organizacaoId });
    }
  }
  const o = await ctx.db.get(organizacaoId);
  if (!o || o.carteira) return;
  /* O segmento do cartão: escolhido à mão, ou o da origem (o tipo de
     parceiro da lead, a candidatura). */
  let tipoParceiro: string | undefined;
  if (n.origem === "partnerLeads" && n.origemId) {
    const lid = ctx.db.normalizeId("partnerLeads", n.origemId);
    tipoParceiro = lid ? (await ctx.db.get(lid))?.partnerType : undefined;
  }
  const segmento = o.segmento ?? n.segmento ?? segmentoDaOrigem(n.origem, tipoParceiro) ?? undefined;
  const agora = Date.now();
  await ctx.db.patch(o._id, { carteira: { estado: "ativacao", aceiteEm: agora }, estadoCarteira: "ativacao", segmento, atualizadoEm: agora });
}

/* ─── Migração ────────────────────────────────────────────────────────── */

const TABELAS = [
  "orders",
  "contactSubmissions",
  "contactQuotes",
  "tourInquiries",
  "weddingQuoteSubmissions",
  "schoolQuoteSubmissions",
  "corporateRequests",
  "partnerLeads",
  "driverApplications",
  "partnerApplications",
] as const;
type Tabela = (typeof TABELAS)[number];

/* O que cada registo antigo diz de quem é. */
function quemE(t: Tabela, d: Record<string, unknown>) {
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : undefined);
  if (t === "orders") return { nome: s("customerName") ?? s("passengerName"), email: s("customerEmail") ?? s("passengerEmail"), telefone: s("customerPhone") ?? s("passengerWhatsapp") };
  if (t === "partnerApplications") {
    return { nome: s("representativeFullName"), email: s("representativeEmail"), telefone: s("representativePhone") ?? s("representativeWhatsapp"), empresa: s("companyName") };
  }
  return { nome: s("fullName") ?? s("name"), email: s("email"), telefone: s("phone"), empresa: s("companyName") ?? s("company") };
}

/*
 * Cria os contactos e as organizações dos registos que já existiam e liga
 * os cartões e as reservas. Corre por partes (200 de cada vez) e agenda-se
 * a si própria até ao fim; pode correr outra vez sem repetir nada.
 *   npx convex run contactos:preencher
 */
export const preencher = internalMutation({
  args: { tabela: v.optional(v.string()), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { tabela, cursor }) => {
    const t = (tabela ?? TABELAS[0]) as Tabela;
    const pagina = await ctx.db.query(t).paginate({ cursor: cursor ?? null, numItems: 200 });
    let ligados = 0;
    for (const d of pagina.page) {
      if (t === "orders") {
        const o = d as Doc<"orders">;
        if (o.status === "draft" || o.contactoId) continue;
      }
      const q = quemE(t, d as unknown as Record<string, unknown>);
      const { contactoId, organizacaoId } = await ligarContacto(ctx, { ...q, origem: t });
      if (!contactoId && !organizacaoId) continue;
      ligados++;
      if (t === "orders") {
        await ctx.db.patch(d._id as Id<"orders">, { contactoId: contactoId ?? undefined, organizacaoId: organizacaoId ?? undefined });
      }
      const n = await ctx.db
        .query("negocios")
        .withIndex("by_origem", (x) => x.eq("origem", t).eq("origemId", d._id))
        .first();
      if (n && !n.contactoId) await ctx.db.patch(n._id, { contactoId: contactoId ?? undefined, organizacaoId: organizacaoId ?? undefined });
    }
    const i = TABELAS.indexOf(t);
    if (!pagina.isDone) await ctx.scheduler.runAfter(0, internal.contactos.preencher, { tabela: t, cursor: pagina.continueCursor });
    else if (i + 1 < TABELAS.length) await ctx.scheduler.runAfter(0, internal.contactos.preencher, { tabela: TABELAS[i + 1], cursor: null });
    else console.log("[Contactos] preencher: acabou.");
    console.log(`[Contactos] ${t}: ${ligados} ligados nesta parte.`);
    return { tabela: t, ligados, fim: pagina.isDone };
  },
});

/* O módulo «contactos» aos cargos que tratam de pedidos ou de leads, ao
   nível mais alto que lá têm.
     npx convex run contactos:darAcesso */
export const darAcesso = internalMutation({
  args: {},
  handler: async (ctx) => {
    const feitos: string[] = [];
    for (const c of await ctx.db.query("cargos").collect()) {
      if (c.permissoes.some((p) => p.modulo === "contactos")) continue;
      const base = c.permissoes.filter((p) => p.modulo === "pedidos" || p.modulo === "leads");
      if (!base.length) continue;
      const nivel = base.some((p) => p.nivel === "editar") ? "editar" : "ver";
      await ctx.db.patch(c._id, { permissoes: [...c.permissoes, { modulo: "contactos", nivel }], actualizadoEm: Date.now() });
      feitos.push(`${c.nome} (${nivel})`);
    }
    return feitos;
  },
});
