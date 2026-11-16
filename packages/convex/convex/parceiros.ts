import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin } from "./lib/admin";
import { urlDaImagem } from "./lib/imagens";
import { frotaVisivel } from "./lib/frota";

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

const ESTADOS_DE_SERVICO = new Set(["paid", "confirmed", "completed"]);

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

type Reserva = { parceria: string; ida: Doc<"orders">; valor: number; volta: boolean; tour: boolean };

/*
 * As reservas pagas de cada parceria. Ida e volta contam uma vez, mas a
 * faturação soma as duas pernas; a volta nasce sem parceria (o pagamento fica
 * na ida), por isso vai buscar a da ida. Os tours pagos entram pela encomenda
 * espelho (tourBookingId), que leva a parceria do tourBooking — contar também
 * os tourBookings era contar duas vezes.
 *
 * Lê a tabela inteira: 1 830 encomendas em produção a 2026-11-15, as mesmas
 * que o Início lê no período "tudo".
 */
async function lerReservas(ctx: QueryCtx): Promise<Reserva[]> {
  const docs = await ctx.db.query("orders").collect();
  const porId = new Map(docs.map((o) => [o._id as string, o]));
  const fora: Reserva[] = [];
  for (const o of docs) {
    if (!ESTADOS_DE_SERVICO.has(o.status)) continue;
    const outra = o.relatedOrderId ? porId.get(o.relatedOrderId) : undefined;
    const volta = Boolean(outra && outra._creationTime < o._creationTime);
    const ida = volta ? outra! : o;
    if (!ida.partnershipId) continue;
    fora.push({
      parceria: ida.partnershipId,
      ida,
      valor: o.totalAmount ?? 0,
      volta,
      tour: Boolean(o.tourBookingId) || (o.orderNumber ?? "").startsWith("TB"),
    });
  }
  return fora;
}

type Pedido = { parceria: string; tabela: TabelaPedido; doc: Doc<TabelaPedido> };

async function lerPedidos(ctx: QueryCtx): Promise<Pedido[]> {
  const tabelas = Object.keys(PEDIDOS) as TabelaPedido[];
  const listas = await Promise.all(tabelas.map((t) => ctx.db.query(t).collect()));
  return tabelas.flatMap((tabela, i) =>
    (listas[i] as Doc<TabelaPedido>[])
      .filter((d) => d.partnershipId)
      .map((doc) => ({ parceria: doc.partnershipId as string, tabela, doc })),
  );
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
    await exigirAdmin(ctx);
    const [parcerias, reservas, pedidos, activos] = await Promise.all([
      ctx.db.query("partnerships").collect(),
      lerReservas(ctx),
      lerPedidos(ctx),
      ctx.db.query("vehicles").withIndex("by_status", (q) => q.eq("status", "active")).collect(),
    ]);

    const numeros = new Map<string, { reservas: number; faturacao: number; pedidos: number; ultima: number | null }>();
    const de = (id: string) => {
      let n = numeros.get(id);
      if (!n) numeros.set(id, (n = { reservas: 0, faturacao: 0, pedidos: 0, ultima: null }));
      return n;
    };
    for (const r of reservas) {
      const n = de(r.parceria);
      n.faturacao += r.valor;
      if (!r.volta) {
        n.reservas++;
        n.ultima = Math.max(n.ultima ?? 0, r.ida._creationTime);
      }
    }
    for (const p of pedidos) {
      const n = de(p.parceria);
      n.pedidos++;
      n.ultima = Math.max(n.ultima ?? 0, p.doc.createdAt);
    }

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
          faturacao: centimos(n?.faturacao ?? 0),
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
    await exigirAdmin(ctx);
    const nid = ctx.db.normalizeId("partnerships", id);
    const p = nid ? await ctx.db.get(nid) : null;
    if (!p) return null;

    const [reservas, pedidos] = await Promise.all([lerReservas(ctx), lerPedidos(ctx)]);
    const minhas = reservas.filter((r) => r.parceria === p._id);
    const meus = pedidos.filter((x) => x.parceria === p._id);

    const actual = /^\d{4}-\d{2}$/.test(mes) ? mes : mesDe(Date.now());
    const meses = Array.from({ length: 12 }, (_, i) => somarMeses(actual, i - 11));
    const serie = meses.map(() => ({ reservas: 0, pedidos: 0, faturacao: 0 }));

    let faturacao = 0;
    let nReservas = 0;
    let nTours = 0;
    for (const r of minhas) {
      faturacao += r.valor;
      const b = meses.indexOf(mesDe(r.ida._creationTime));
      if (b >= 0) serie[b]!.faturacao += r.valor;
      if (r.volta) continue;
      nReservas++;
      if (r.tour) nTours++;
      if (b >= 0) serie[b]!.reservas++;
    }
    const porTabela = new Map<TabelaPedido, number>();
    for (const x of meus) {
      porTabela.set(x.tabela, (porTabela.get(x.tabela) ?? 0) + 1);
      const b = meses.indexOf(mesDe(x.doc.createdAt));
      if (b >= 0) serie[b]!.pedidos++;
    }

    const categorias = [
      { rotulo: "Transfers", n: nReservas - nTours },
      { rotulo: "Tours e eventos", n: nTours },
      ...(Object.keys(PEDIDOS) as TabelaPedido[]).map((t) => ({ rotulo: `Pedidos · ${PEDIDOS[t].rotulo}`, n: porTabela.get(t) ?? 0 })),
    ].filter((c) => c.n > 0);

    /* O que chegou por último, com o caminho para o abrir no dashboard. */
    const recentes = [
      ...minhas
        .filter((r) => !r.volta)
        .map((r) => ({
          tipo: "reserva" as const,
          quando: r.ida._creationTime,
          nome: r.ida.customerName?.trim() || "Cliente sem nome",
          linha: [r.ida.orderNumber, r.tour ? "Tour ou evento" : "Transfer"].filter(Boolean).join(" · "),
          estado: ESTADO_RESERVA[r.ida.status] ?? r.ida.status,
          href: r.ida.orderNumber ? `/orders?vista=todas&quando=todas&reserva=${encodeURIComponent(r.ida.orderNumber)}` : null,
        })),
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
      ajustePreco: p.ajustePreco ?? 0,
      slugsAntigos: p.slugsAntigos ?? [],
      /* A frota que o checkout do parceiro pode mostrar: a global (que se
         liga e desliga aqui) e os carros só deste parceiro (lib/frota.ts). */
      frota: await frotaParaOEditor(ctx, p._id),
      numeros: {
        reservas: nReservas,
        faturacao: centimos(faturacao),
        valorMedio: nReservas ? centimos(faturacao / nReservas) : null,
        pedidos: meus.length,
      },
      meses,
      serie: serie.map((s) => ({ ...s, faturacao: centimos(s.faturacao) })),
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
    globais: todos.filter((v) => !v.partnershipId).sort((a, b) => a.order - b.order).map(linha),
    proprios: todos.filter((v) => v.partnershipId === id).sort((a, b) => a.order - b.order).map(linha),
  };
}

/* Para o salto entre parcerias no editor: só nome e endereço. */
export const nomes = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    return (await ctx.db.query("partnerships").collect())
      .map((p) => ({ id: p._id as string, nome: p.name, slug: p.slug, publicada: publicada(p) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  },
});

/* O endereço enquanto se escreve: o erro aparece antes de gravar. */
export const verificarSlug = query({
  args: { slug: v.string(), excepto: v.optional(v.string()) },
  handler: async (ctx, { slug, excepto }) => {
    await exigirAdmin(ctx);
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
    await exigirAdmin(ctx);
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
      /* Em %, sobre o preço por km e o mínimo de cada carro (lib/precoTransfer.ts). */
      ajustePreco: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { id, versao, dados }) => {
    await exigirAdmin(ctx);
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
    if (dados.ajustePreco !== undefined && !(Number.isFinite(dados.ajustePreco) && dados.ajustePreco >= -50 && dados.ajustePreco <= 100)) {
      erros.ajustePreco = "Entre −50% e +100%.";
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
      ...(dados.ajustePreco !== undefined && { ajustePreco: Math.round(dados.ajustePreco * 10) / 10 }),
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
    await exigirAdmin(ctx);
    const p = await ctx.db.get(id);
    if (!p) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta parceria já não existe." });
    /* Mexe na versão: quem tiver o editor aberto vê que mudou. */
    await ctx.db.patch(id, { status: sim ? "active" : "inactive", updatedAt: Math.max(Date.now(), versaoDe(p) + 1) });
  },
});

export const remover = mutation({
  args: { id: v.id("partnerships") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
    if (!(await ctx.db.get(id))) return;
    /* Um veículo de um parceiro só aparece no checkout dele (veiculos.ts):
       apagar o parceiro deixava-o preso a um dono que não existe. Nenhum em
       produção a 2026-11-15, mas o editor de veículos deixa criá-los. */
    const veiculos = (await ctx.db.query("vehicles").collect()).filter((x) => x.partnershipId === id);
    if (veiculos.length) {
      throw new ConvexError({
        tipo: "emUso",
        mensagem: `Tem ${veiculos.length === 1 ? "um veículo próprio" : `${veiculos.length} veículos próprios`} (${veiculos.map((x) => x.name).join(", ")}). Mude o dono em Catálogo → Veículos antes de a apagar.`,
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
 * Também vão para o Pipedrive (enfileirarLead), onde se trabalha o negócio;
 * aqui é para as ver e marcar o ponto em que estão.
 */

const ESTADOS_LEAD = ["new", "contacted", "qualified", "archived"] as const;
type GrupoLead = "porTratar" | "emCurso" | "arquivadas";
const grupoDaLead = (s: string): GrupoLead => (s === "new" ? "porTratar" : s === "archived" ? "arquivadas" : "emCurso");

export const leads = query({
  args: {
    grupo: v.union(v.literal("porTratar"), v.literal("emCurso"), v.literal("arquivadas"), v.literal("todas")),
    pesquisa: v.optional(v.string()),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx);
    /* 2 leads em produção a 2026-11-15: lê-se tudo. */
    const todas = await ctx.db.query("partnerLeads").withIndex("by_created").order("desc").collect();
    const porGrupo = {
      porTratar: todas.filter((l) => grupoDaLead(l.status) === "porTratar").length,
      emCurso: todas.filter((l) => grupoDaLead(l.status) === "emCurso").length,
      arquivadas: todas.filter((l) => grupoDaLead(l.status) === "arquivadas").length,
      todas: todas.length,
    };
    const q = semAcentos(a.pesquisa?.trim() ?? "");
    const filtradas = todas
      .filter((l) => a.grupo === "todas" || grupoDaLead(l.status) === a.grupo)
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
    };
  },
});

export const lead = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
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
    await exigirAdmin(ctx);
    if (!(ESTADOS_LEAD as readonly string[]).includes(estado)) throw new ConvexError({ tipo: "invalido", mensagem: "Estado que uma lead não aceita." });
    if (!(await ctx.db.get(id))) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta lead já não existe." });
    await ctx.db.patch(id, { status: estado as (typeof ESTADOS_LEAD)[number] });
  },
});

export const removerLead = mutation({
  args: { id: v.id("partnerLeads") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
    if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});
