import { ConvexError, v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin, lerAcesso, temCapacidade } from "./lib/admin";
import { acertarCartaoDaOrigem } from "./lib/funilEstado";
import { urlDaImagem } from "./lib/imagens";
import { frotaVisivel, reachOf } from "./lib/frota";
import { facts, isTour } from "./lib/orderFacts";

/*
 * Parceiros no dashboard (E4): as parcerias (a página de marca branca em
 * /<idioma>/<endereço> e o que ela trouxe) e as leads de parceria que chegam
 * pela página Hotéis.
 *
 * O site continua a ler pelo partnerships.getBySlug e partnerships.list, que
 * são públicos; isto é só o lado do back-office. O que muda em relação às
 * funções antigas:
 *  - Uma parceria nova nasce em rascunho. A antiga nascia publicada, e entrava
 *    no sitemap com as cores por omissão antes de alguém a personalizar.
 *  - O endereço é único também ao editar (o update antigo só verificava ao
 *    criar) e não pode ser o de uma página do site: /pt/tours numa parceria
 *    ficava escondida atrás da página dos tours.
 *  - Conflito pelo updatedAt, erros por campo e em português.
 *  - Os números de cada parceria são reservas pagas e faturação, como no
 *    Início. O ecrã antigo contava encomendas, e um carrinho abandonado
 *    contava tanto como uma viagem paga.
 */

/* ─── Endereço ───────────────────────────────────────────────────────── */

/* O porquê da regra está em partnerships.ts (o "kiss&tell"). */
const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* As páginas do site ao mesmo nível que as parcerias (apps/web/app), mais os
   idiomas: uma parceria com um destes endereços nunca seria vista. É a mesma
   lista que o sitemap tira (reservedPartnershipSlugs). */
const RESERVADOS = new Set([
  "pt", "en", "es", "fr", "de", "nl",
  "about-us", "blogs", "corporate", "drivers", "events", "faqs", "fleet", "hotels",
  "partner-guide", "partners", "privacy-policy", "refund", "schools",
  "terms-and-conditions", "tours", "ultra-luxury-tours", "wedding", "wedding-planner",
  "wedding-whitelabel", "whitelabel", "checkout", "payment", "preview-site",
  "checkout-preview", "partnership-preview", "admin", "api",
]);

function erroDoSlug(slug: string): string | null {
  if (!slug) return "O endereço não pode ficar vazio.";
  if (slug.length > 60) return "No máximo 60 caracteres.";
  if (!SLUG_VALIDO.test(slug)) return "Só minúsculas sem acentos, números e hífens (por exemplo \"kiss-tell\").";
  if (RESERVADOS.has(slug)) return "Este endereço é de uma página do site.";
  return null;
}

async function slugOcupado(ctx: QueryCtx, slug: string, excepto?: Id<"partnerships">) {
  const outra = await ctx.db
    .query("partnerships")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();
  return outra && outra._id !== excepto ? outra : null;
}

/* ─── O que cada parceria trouxe ─────────────────────────────────────── */

/* As tabelas dos formulários com atribuição, com o tipo que a caixa de
   Pedidos usa no endereço (pedidos.ts). */
const PEDIDOS = {
  contactSubmissions: { tipo: "contactos", rotulo: "Contactos" },
  contactQuotes: { tipo: "orcamentos", rotulo: "Orçamentos" },
  tourInquiries: { tipo: "ultraluxo", rotulo: "Ultra-luxo" },
  weddingQuoteSubmissions: { tipo: "casamentos", rotulo: "Casamentos" },
  schoolQuoteSubmissions: { tipo: "escolas", rotulo: "Escolas" },
  corporateRequests: { tipo: "corporate", rotulo: "Corporate" },
} as const;
type TabelaPedido = keyof typeof PEDIDOS;

/*
 * What each partner brought, from the order facts (lib/orderFacts.ts), not
 * from the orders: a read of the whole table (1 830 orders in Nov 2026) would
 * pass the query limit within days at 10 000 a day.
 *
 * Same rules as before: paid, confirmed or done; a round trip counts once
 * and its revenue is both legs; the return is the outbound's partner's; a
 * paid tour enters by its mirror order. Leads are the form rows with the
 * partner's id.
 */
type Numeros = { reservas: number; faturacao: number; pedidos: number; ultima: number | null };

async function numerosDe(ctx: QueryCtx, ids: Id<"partnerships">[]): Promise<Map<string, Numeros>> {
  const out = new Map<string, Numeros>();
  if (!ids.length) return out;
  const ns = ids.flatMap((id) => [["partner", id, "outbound"], ["partner", id, "return"], ["partnerLead", id]].map((n) => ({ namespace: n })));
  const counts = await facts.countBatch(ctx, ns);
  const sums = await facts.sumBatch(ctx, ns);
  /* The latest booking or lead: the last item of each non-empty namespace. */
  const cheios = ns.filter((_, i) => i % 3 !== 1 && counts[i]! > 0);
  const ultimos = cheios.length ? await facts.atBatch(ctx, cheios.map((n) => ({ ...n, offset: -1 }))) : [];
  const ultimaDe = new Map<string, number>();
  cheios.forEach((n, i) => {
    const id = n.namespace[1]!;
    ultimaDe.set(id, Math.max(ultimaDe.get(id) ?? 0, Number(ultimos[i]!.key)));
  });
  const ultimas = ids.map((id) => ultimaDe.get(id) ?? null);
  ids.forEach((id, i) => {
    out.set(id, {
      reservas: counts[i * 3]!,
      faturacao: sums[i * 3]! + sums[i * 3 + 1]!,
      pedidos: counts[i * 3 + 2]!,
      ultima: ultimas[i]!,
    });
  });
  return out;
}

type Pedido = { tabela: TabelaPedido; doc: Doc<TabelaPedido> };

/* Lisbon midnight of a day (AAAA-MM-DD), in ms: the month buckets of the
   partner's page are Lisbon months, like the rest of the back-office. */
function inicioEmLisboa(dia: string): number {
  const utc = Date.parse(`${dia}T00:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hourCycle: "h23" }).format(new Date(utc)));
  return utc - h * 3_600_000;
}

const centimos = (n: number) => Math.round(n * 100) / 100;
const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const TEMPLATES = ["transfer", "whitelabel", "wedding-whitelabel"] as const;
const vTemplate = v.union(v.literal("transfer"), v.literal("whitelabel"), v.literal("wedding-whitelabel"));
const templateDe = (p: Doc<"partnerships">) => p.landingTemplate ?? "transfer";
/* Sem estado gravado está publicada: é como o site a trata (status !== "inactive"). */
const publicada = (p: Doc<"partnerships">) => p.status !== "inactive";
const versaoDe = (p: Doc<"partnerships">) => p.updatedAt ?? p._creationTime;

/* ─── Lista ──────────────────────────────────────────────────────────── */

export const lista = query({
  args: {
    template: v.union(vTemplate, v.literal("todos")),
    estado: v.union(v.literal("publicadas"), v.literal("rascunhos"), v.literal("todas")),
    pesquisa: v.optional(v.string()),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "parcerias", "ver");
    /* A faturação de cada parceiro é «Ver valores»: quem só vê as Parcerias
       (a Operação) via quanto cada um vendeu. */
    const verValores = temCapacidade(await lerAcesso(ctx), "valores");
    const [parcerias, activos] = await Promise.all([
      ctx.db.query("partnerships").collect(),
      ctx.db.query("vehicles").withIndex("by_status", (q) => q.eq("status", "active")).collect(),
    ]);
    const numeros = await numerosDe(ctx, parcerias.map((p) => p._id));

    /* Contagens dos filtros antes da pesquisa, para não mudarem a cada letra. */
    const porTemplate = Object.fromEntries(TEMPLATES.map((t) => [t, parcerias.filter((p) => templateDe(p) === t).length]));
    const doTemplate = a.template === "todos" ? parcerias : parcerias.filter((p) => templateDe(p) === a.template);
    const porEstado = {
      publicadas: doTemplate.filter(publicada).length,
      rascunhos: doTemplate.filter((p) => !publicada(p)).length,
      todas: doTemplate.length,
    };

    const q = semAcentos(a.pesquisa?.trim() ?? "");
    const filtradas = doTemplate
      .filter((p) => a.estado === "todas" || (a.estado === "publicadas") === publicada(p))
      .filter((p) => !q || [p.name, p.slug].some((c) => semAcentos(c).includes(q)))
      /* Quem mais traz primeiro; sem nada, pelo nome. */
      .sort((x, y) => {
        const nx = numeros.get(x._id), ny = numeros.get(y._id);
        return (ny?.reservas ?? 0) - (nx?.reservas ?? 0) || (ny?.pedidos ?? 0) - (nx?.pedidos ?? 0) || x.name.localeCompare(y.name, "pt");
      });

    const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
    const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
    const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
    const linhas = await Promise.all(
      filtradas.slice(pagina * porPagina, (pagina + 1) * porPagina).map(async (p) => {
        const n = numeros.get(p._id);
        return {
          id: p._id as string,
          nome: p.name,
          slug: p.slug,
          template: templateDe(p),
          publicada: publicada(p),
          logo: await urlDaImagem(ctx, p.logoId),
          reservas: n?.reservas ?? 0,
          faturacao: verValores ? centimos(n?.faturacao ?? 0) : null,
          pedidos: n?.pedidos ?? 0,
          ultima: n?.ultima ?? null,
          /* Os mesmos avisos do email diário (vigilancia.ts): em 16/11/2026
             todos os checkouts de parceiro estavam sem carros e só se via
             a tentar reservar. */
          avisos: [
            ...(frotaVisivel(activos, p).length === 0 ? ["Checkout sem carros"] : []),
            ...(SLUG_VALIDO.test(p.slug) ? [] : ["Endereço inválido"]),
          ],
        };
      }),
    );

    return { linhas, total: filtradas.length, pagina, paginas, porPagina, porTemplate, porEstado };
  },
});

/* ─── Ficha ──────────────────────────────────────────────────────────── */

const diaLisboa = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" });
const mesDe = (ms: number) => diaLisboa.format(new Date(ms)).slice(0, 7);
const somarMeses = (mes: string, n: number) => {
  const t = +mes.slice(0, 4) * 12 + (+mes.slice(5, 7) - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

const ESTADO_RESERVA: Record<string, string> = { paid: "Paga", confirmed: "Confirmada", completed: "Concluída" };
const ESTADO_PEDIDO: Record<string, string> = {
  new: "Novo",
  read: "Lido",
  archived: "Arquivado",
  inProgress: "Em curso",
  resolved: "Resolvido",
  submitted: "Recebido",
  reviewing: "Em análise",
  approved: "Aprovado",
  rejected: "Recusado",
};

function nomeDoPedido(p: Pedido): string {
  const d = p.doc as { fullName?: string; name?: string; email?: string };
  return d.fullName?.trim() || d.name?.trim() || d.email || "—";
}

export const detalhe = query({
  /* O mês de hoje vem do browser (AAAA-MM), como nos contadores: a resposta
     em cache muda ao virar o mês. */
  args: { id: v.string(), mes: v.string() },
  handler: async (ctx, { id, mes }) => {
    await exigirAdmin(ctx, "parcerias", "ver");
    const verValores = temCapacidade(await lerAcesso(ctx), "valores");
    const nid = ctx.db.normalizeId("partnerships", id);
    const p = nid ? await ctx.db.get(nid) : null;
    if (!p) return null;

    const actual = /^\d{4}-\d{2}$/.test(mes) ? mes : mesDe(Date.now());
    const meses = Array.from({ length: 12 }, (_, i) => somarMeses(actual, i - 11));
    const tabelas = Object.keys(PEDIDOS) as TabelaPedido[];
    const ida = ["partner", p._id, "outbound"];
    const volta = ["partner", p._id, "return"];
    const leads = ["partnerLead", p._id];

    /* Totals, per form, per month: a few batched calls to the facts. */
    const todos = [ida, volta, leads, ["partner", p._id, "tour"], ...tabelas.map((t) => ["partnerLead", p._id, t])].map((n) => ({ namespace: n }));
    const doMes = (n: string[]) =>
      meses.map((m) => ({
        namespace: n,
        bounds: { lower: { key: inicioEmLisboa(`${m}-01`), inclusive: true }, upper: { key: inicioEmLisboa(`${somarMeses(m, 1)}-01`), inclusive: false } },
      }));
    const cTotal = await facts.countBatch(ctx, todos);
    const sTotal = await facts.sumBatch(ctx, todos);
    const cIda = await facts.countBatch(ctx, doMes(ida));
    const sIda = await facts.sumBatch(ctx, doMes(ida));
    const sVolta = await facts.sumBatch(ctx, doMes(volta));
    const cLeads = await facts.countBatch(ctx, doMes(leads));
    const ultimasIdas = await facts.paginate(ctx, { namespace: ida, order: "desc", pageSize: 8 });
    const ultimosLeads = await facts.paginate(ctx, { namespace: leads, order: "desc", pageSize: 8 });
    const nReservas = cTotal[0]!;
    const faturacao = sTotal[0]! + sTotal[1]!;
    const nPedidos = cTotal[2]!;
    const nTours = cTotal[3]!;
    const porTabela = new Map(tabelas.map((t, i) => [t, cTotal[4 + i]!]));
    const serie = meses.map((_, i) => ({ reservas: cIda[i]!, pedidos: cLeads[i]!, faturacao: sIda[i]! + sVolta[i]! }));

    const categorias = [
      { rotulo: "Transfers", n: nReservas - nTours },
      { rotulo: "Tours e eventos", n: nTours },
      ...tabelas.map((t) => ({ rotulo: `Pedidos · ${PEDIDOS[t].rotulo}`, n: porTabela.get(t) ?? 0 })),
    ].filter((c) => c.n > 0);

    /* O que chegou por último, com o caminho para o abrir no dashboard. */
    const idas = (await Promise.all(ultimasIdas.page.map((i) => ctx.db.get(i.id as Id<"orders">)))).filter((o): o is Doc<"orders"> => o !== null);
    const meus = (
      await Promise.all(
        ultimosLeads.page.map(async (i): Promise<Pedido | null> => {
          const tabela = tabelas.find((t) => ctx.db.normalizeId(t, i.id) !== null);
          const doc = tabela ? await ctx.db.get(ctx.db.normalizeId(tabela, i.id)!) : null;
          return tabela && doc ? { tabela, doc: doc as Doc<TabelaPedido> } : null;
        }),
      )
    ).filter((x): x is Pedido => x !== null);
    const recentes = [
      ...idas.map((o) => {
        const tour = isTour(o);
        return {
          tipo: "reserva" as const,
          quando: o._creationTime,
          nome: o.customerName?.trim() || "Cliente sem nome",
          linha: [o.orderNumber, tour ? "Tour ou evento" : "Transfer"].filter(Boolean).join(" · "),
          estado: ESTADO_RESERVA[o.status] ?? o.status,
          href: o.orderNumber ? `/orders?vista=todas&quando=todas&reserva=${encodeURIComponent(o.orderNumber)}` : null,
        };
      }),
      ...meus.map((x) => {
        const tipo = PEDIDOS[x.tabela].tipo;
        const estado = (x.doc as { status?: string }).status ?? (tipo === "corporate" ? "submitted" : "new");
        return {
          tipo: "pedido" as const,
          quando: x.doc.createdAt,
          nome: nomeDoPedido(x),
          linha: `Pedido · ${PEDIDOS[x.tabela].rotulo}`,
          estado: ESTADO_PEDIDO[estado] ?? estado,
          href: `/inbox?estado=todos&pedido=${tipo}:${x.doc._id}`,
        };
      }),
    ]
      .sort((a, b) => b.quando - a.quando)
      .slice(0, 8);

    const tema = (p.theme ?? {}) as { themeMode?: string; services?: string[]; colors?: Record<string, string> };
    const conteudo = (p.content ?? {}) as { seoTitle?: string; seoDescription?: string };
    return {
      id: p._id as string,
      versao: versaoDe(p),
      nome: p.name,
      slug: p.slug,
      template: templateDe(p),
      publicada: publicada(p),
      criada: p.createdAt ?? p._creationTime,
      logo: p.logoId ?? null,
      logoUrl: await urlDaImagem(ctx, p.logoId),
      hero: p.heroImageId ?? null,
      heroUrl: await urlDaImagem(ctx, p.heroImageId),
      modoTema: (tema.themeMode as "switch" | "dark" | "light" | undefined) ?? null,
      servicos: tema.services ?? [],
      cores: tema.colors ?? {},
      seoTitulo: conteudo.seoTitle ?? "",
      seoDescricao: conteudo.seoDescription ?? "",
      veiculosEscondidos: (p.veiculosEscondidos ?? []) as string[],
      /* null = the default of Configurações → Preços. */
      markup: typeof p.priceMarkupPercent === "number" ? p.priceMarkupPercent : null,
      slugsAntigos: p.slugsAntigos ?? [],
      /* A frota que o checkout do parceiro pode mostrar: os carros de todos
         os parceiros (que se ligam e desligam aqui) e os escolhidos só para
         alguns, este incluído (lib/frota.ts). */
      frota: await frotaParaOEditor(ctx, p._id),
      numeros: {
        reservas: nReservas,
        faturacao: verValores ? centimos(faturacao) : null,
        valorMedio: verValores && nReservas ? centimos(faturacao / nReservas) : null,
        pedidos: nPedidos,
      },
      meses,
      serie: serie.map((s) => ({ ...s, faturacao: verValores ? centimos(s.faturacao) : null })),
      categorias,
      recentes,
    };
  },
});

async function frotaParaOEditor(ctx: QueryCtx, id: Id<"partnerships">) {
  const todos = await ctx.db.query("vehicles").collect();
  const linha = (v: Doc<"vehicles">) => ({
    id: v._id as string,
    nome: v.name,
    exemplos: v.examples ?? null,
    passageiros: v.passengers,
    activo: v.status === "active",
    ordem: v.order,
  });
  return {
    globais: todos.filter((v) => reachOf(v).mode === "all").sort((a, b) => a.order - b.order).map(linha),
    proprios: todos
      .filter((v) => {
        const r = reachOf(v);
        return r.mode === "some" && r.partnerIds.includes(id);
      })
      .sort((a, b) => a.order - b.order)
      .map(linha),
  };
}

/* Para o salto entre parcerias no editor: só nome e endereço. */
export const nomes = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "parcerias", "ver");
    return (await ctx.db.query("partnerships").collect())
      .map((p) => ({ id: p._id as string, nome: p.name, slug: p.slug, publicada: publicada(p) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  },
});

/* O endereço enquanto se escreve: o erro aparece antes de gravar. */
export const verificarSlug = query({
  args: { slug: v.string(), excepto: v.optional(v.string()) },
  handler: async (ctx, { slug, excepto }) => {
    await exigirAdmin(ctx, "parcerias", "ver");
    const erro = erroDoSlug(slug);
    if (erro) return { livre: false, erro };
    const outra = await slugOcupado(ctx, slug, (excepto && ctx.db.normalizeId("partnerships", excepto)) || undefined);
    return outra ? { livre: false, erro: `Já é o endereço de "${outra.name}".` } : { livre: true, erro: null };
  },
});

/* ─── Gravar ─────────────────────────────────────────────────────────── */

/* Hexadecimal, rgb(a) ou hsl(a): em produção há cores com transparência
   (rgba(0, 0, 0, 0.4) nas sombras do hero). */
const COR_VALIDA = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;

export const criar = mutation({
  args: {
    nome: v.string(),
    slug: v.string(),
    template: vTemplate,
    /* As cores por omissão vivem no dashboard (dynamic-theme-provider), como
       no ecrã antigo; o servidor só as guarda. */
    tema: v.any(),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "parcerias");
    const nome = a.nome.trim();
    const slug = a.slug.trim();
    const erros: Record<string, string> = {};
    if (!nome) erros.nome = "Dê um nome à parceria.";
    else if (nome.length > 80) erros.nome = "No máximo 80 caracteres.";
    const e = erroDoSlug(slug);
    if (e) erros.slug = e;
    else {
      const outra = await slugOcupado(ctx, slug);
      if (outra) erros.slug = `Já é o endereço de "${outra.name}".`;
    }
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const agora = Date.now();
    return await ctx.db.insert("partnerships", {
      name: nome,
      slug,
      theme: a.tema ?? {},
      content: {},
      landingTemplate: a.template,
      status: "inactive",
      createdAt: agora,
      updatedAt: agora,
    });
  },
});

export const guardar = mutation({
  args: {
    id: v.id("partnerships"),
    versao: v.number(),
    dados: v.object({
      nome: v.string(),
      slug: v.string(),
      template: vTemplate,
      modoTema: v.union(v.literal("switch"), v.literal("dark"), v.literal("light"), v.null()),
      servicos: v.array(v.string()),
      logo: v.union(v.string(), v.null()),
      hero: v.union(v.string(), v.null()),
      seoTitulo: v.string(),
      seoDescricao: v.string(),
      cores: v.record(v.string(), v.string()),
      /* Opcional: um editor aberto antes da frota existir continua a gravar. */
      veiculosEscondidos: v.optional(v.array(v.id("vehicles"))),
      /* This partner's price over the site's, in %; null = the default of
         Preços (lib/pricing.ts, partnerFactorOf). Absent = leave as is. */
      markup: v.optional(v.union(v.number(), v.null())),
    }),
  },
  handler: async (ctx, { id, versao, dados }) => {
    await exigirAdmin(ctx, "parcerias");
    const p = await ctx.db.get(id);
    if (!p) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta parceria já não existe." });

    const erros: Record<string, string> = {};
    const nome = dados.nome.trim();
    const slug = dados.slug.trim();
    if (!nome) erros.nome = "Dê um nome à parceria.";
    else if (nome.length > 80) erros.nome = "No máximo 80 caracteres.";
    const e = erroDoSlug(slug);
    if (e) erros.slug = e;
    else if (slug !== p.slug) {
      const outra = await slugOcupado(ctx, slug, id);
      if (outra) erros.slug = `Já é o endereço de "${outra.name}".`;
    }
    if (typeof dados.markup === "number" && !(Number.isFinite(dados.markup) && dados.markup >= -50 && dados.markup <= 100)) {
      erros.markup = "Entre −50% e +100%.";
    }
    if (dados.seoTitulo.trim().length > 70) erros.seoTitulo = "No máximo 70 caracteres — o Google corta o resto.";
    if (dados.seoDescricao.trim().length > 180) erros.seoDescricao = "No máximo 180 caracteres.";
    const chaves = Object.keys(dados.cores);
    if (chaves.length > 400) erros.cores = "Cores a mais.";
    for (const k of chaves) {
      if (!COR_VALIDA.test(dados.cores[k]!.trim())) erros[`cor.${k}`] = "Cor inválida: use #RRGGBB ou rgba(…).";
    }
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    if (versaoDe(p) !== versao) {
      throw new ConvexError({
        tipo: "conflito",
        mensagem: "Alguém gravou esta parceria depois de a abrir. Veja a versão actual antes de gravar por cima.",
      });
    }

    const temaAntigo = (p.theme ?? {}) as Record<string, unknown>;
    const tema: Record<string, unknown> = {
      ...temaAntigo,
      colors: Object.fromEntries(chaves.map((k) => [k, dados.cores[k]!.trim()])),
      services: dados.servicos,
    };
    if (dados.modoTema) tema.themeMode = dados.modoTema;
    else delete tema.themeMode;

    const conteudo: Record<string, unknown> = { ...((p.content ?? {}) as Record<string, unknown>) };
    const seoTitulo = dados.seoTitulo.trim();
    const seoDescricao = dados.seoDescricao.trim();
    if (seoTitulo) conteudo.seoTitle = seoTitulo;
    else delete conteudo.seoTitle;
    if (seoDescricao) conteudo.seoDescription = seoDescricao;
    else delete conteudo.seoDescription;

    /* As imagens antigas não se apagam: o logótipo pode estar noutra parceria
       (a migração para o Bunny juntou ficheiros iguais). */
    const updatedAt = Math.max(Date.now(), versaoDe(p) + 1);
    await ctx.db.patch(id, {
      name: nome,
      slug,
      landingTemplate: dados.template,
      theme: tema,
      content: conteudo,
      logoId: dados.logo ?? undefined,
      heroImageId: dados.hero ?? undefined,
      ...(dados.veiculosEscondidos && { veiculosEscondidos: dados.veiculosEscondidos }),
      ...(dados.markup !== undefined && { priceMarkupPercent: dados.markup === null ? undefined : Math.round(dados.markup * 10) / 10 }),
      /* O endereço antigo fica a reencaminhar para o novo (lib/parceriaPorSlug.ts). */
      ...(slug !== p.slug && {
        slugsAntigos: [...new Set([...(p.slugsAntigos ?? []), p.slug])].filter((s) => s !== slug),
      }),
      updatedAt,
    });
    return { versao: updatedAt };
  },
});

export const publicar = mutation({
  args: { id: v.id("partnerships"), publicada: v.boolean() },
  handler: async (ctx, { id, publicada: sim }) => {
    await exigirAdmin(ctx, "parcerias");
    const p = await ctx.db.get(id);
    if (!p) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta parceria já não existe." });
    /* Mexe na versão: quem tiver o editor aberto vê que mudou. */
    await ctx.db.patch(id, { status: sim ? "active" : "inactive", updatedAt: Math.max(Date.now(), versaoDe(p) + 1) });
  },
});

export const remover = mutation({
  args: { id: v.id("partnerships") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "parcerias", "editar", "apagar");
    if (!(await ctx.db.get(id))) return;
    /* Cars offered to some partners stop listing this one (lib/frota.ts);
       a car that was only here then shows nowhere until someone chooses. */
    for (const x of await ctx.db.query("vehicles").collect()) {
      const r = reachOf(x);
      if (r.mode !== "some" || !r.partnerIds.includes(id)) continue;
      const resto = r.partnerIds.filter((y) => y !== id);
      await ctx.db.patch(x._id, {
        showOnSite: r.site,
        partnerMode: resto.length ? "some" : "none",
        partnerIds: resto.length ? resto : undefined,
        partnershipId: undefined,
        actualizadoEm: Date.now(),
      });
    }
    /* As reservas e os pedidos ficam com o partnershipName gravado, por isso
       o Início continua a mostrá-los com o nome. O logótipo não se apaga
       (ver guardar). */
    await ctx.db.delete(id);
  },
});

/* ─── Leads ──────────────────────────────────────────────────────────── */

/*
 * Os hotéis, agências e afins que pedem para ser parceiros na página Hotéis.
 * Caem no quadro das Parcerias (funis.ts), que é a vista principal deste
 * ecrã; aqui é a lista.
 */

const ESTADOS_LEAD = ["new", "contacted", "qualified", "archived"] as const;
type GrupoLead = "porTratar" | "emCurso" | "arquivadas";
const grupoDaLead = (s: string): GrupoLead => (s === "new" ? "porTratar" : s === "archived" ? "arquivadas" : "emCurso");

export const leads = query({
  args: {
    grupo: v.union(v.literal("porTratar"), v.literal("emCurso"), v.literal("arquivadas"), v.literal("todas")),
    pesquisa: v.optional(v.string()),
    /* O tipo de parceiro (hotel, agência…), como o formulário o grava. */
    tipo: v.optional(v.string()),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "leads", "ver");
    /* 2 leads em produção a 2026-11-15: lê-se tudo. */
    const todas = await ctx.db.query("partnerLeads").withIndex("by_created").order("desc").collect();
    const porGrupo = {
      porTratar: todas.filter((l) => grupoDaLead(l.status) === "porTratar").length,
      emCurso: todas.filter((l) => grupoDaLead(l.status) === "emCurso").length,
      arquivadas: todas.filter((l) => grupoDaLead(l.status) === "arquivadas").length,
      todas: todas.length,
    };
    const q = semAcentos(a.pesquisa?.trim() ?? "");
    const tipos = [...new Set(todas.map((l) => l.partnerType).filter(Boolean))].sort();
    const filtradas = todas
      .filter((l) => a.grupo === "todas" || grupoDaLead(l.status) === a.grupo)
      .filter((l) => !a.tipo || l.partnerType === a.tipo)
      .filter((l) => !q || [l.fullName, l.companyName, l.email, l.phone, l.city, l.partnerType].some((c) => c && semAcentos(c).includes(q)));
    const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
    const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
    const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
    return {
      linhas: filtradas.slice(pagina * porPagina, (pagina + 1) * porPagina).map((l) => ({
        id: l._id as string,
        nome: l.fullName,
        empresa: l.companyName,
        tipo: l.partnerType,
        volume: l.estimatedMonthlyVolume,
        cidade: l.city,
        email: l.email,
        telefone: l.phone,
        estado: l.status,
        recebida: l.createdAt,
      })),
      total: filtradas.length,
      pagina,
      paginas,
      porPagina,
      porGrupo,
      tipos,
    };
  },
});

export const lead = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "leads", "ver");
    const nid = ctx.db.normalizeId("partnerLeads", id);
    const l = nid ? await ctx.db.get(nid) : null;
    if (!l) return null;
    /* Uma parceria que pareça ser esta empresa: quem trata a lead vê logo se
       já foi criada, em vez de criar outra igual. */
    const empresa = semAcentos(l.companyName.trim());
    const parecida =
      empresa.length >= 3
        ? (await ctx.db.query("partnerships").collect()).find((p) => {
            const n = semAcentos(p.name.trim());
            return n === empresa || (n.length >= 4 && (n.includes(empresa) || empresa.includes(n)));
          })
        : undefined;
    return {
      id: l._id as string,
      nome: l.fullName,
      empresa: l.companyName,
      tipo: l.partnerType,
      volume: l.estimatedMonthlyVolume,
      cidade: l.city,
      comoSoube: l.howDidYouHear,
      email: l.email,
      telefone: l.phone,
      estado: l.status,
      recebida: l.createdAt,
      parceria: parecida ? { id: parecida._id as string, nome: parecida.name } : null,
    };
  },
});

export const mudarEstadoLead = mutation({
  args: { id: v.id("partnerLeads"), estado: v.string() },
  handler: async (ctx, { id, estado }) => {
    const quem = await exigirAdmin(ctx, "leads");
    if (!(ESTADOS_LEAD as readonly string[]).includes(estado)) throw new ConvexError({ tipo: "invalido", mensagem: "Estado que uma lead não aceita." });
    if (!(await ctx.db.get(id))) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta lead já não existe." });
    await ctx.db.patch(id, { status: estado as (typeof ESTADOS_LEAD)[number] });
    /* O cartão no quadro das Parcerias acompanha (lib/funilEstado.ts). */
    await acertarCartaoDaOrigem(ctx, "partnerLeads", id, estado, quem.email ?? "");
  },
});

export const removerLead = mutation({
  args: { id: v.id("partnerLeads") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "leads", "editar", "apagar");
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});
