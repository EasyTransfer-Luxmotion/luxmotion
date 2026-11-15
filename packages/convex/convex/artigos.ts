import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin } from "./lib/admin";
import { urlDaImagem } from "./lib/imagens";
import { calculateReadTime, extractTextFromTipTap, generateSlug } from "./lib/utils";

/*
 * Conteúdos → Blog no dashboard (E4). O site continua a ler pelo blogs.ts
 * (listPublished, listFeatured, getBySlug); a geração automática continua no
 * blogAutomation.ts. Isto é o lado do back-office.
 *
 * O que muda em relação às funções antigas:
 *  - Conflito pelo updatedAt, erros por campo e em português.
 *  - O endereço (slug) passa a poder corrigir-se, verificado e único. Antes,
 *    um título repetido dava "titulo-1794…" com o instante colado.
 *  - Cada tradução sabe se ficou para trás: textoActualizadoEm marca quando
 *    o original mudou de texto.
 *  - Publicar pede imagem de capa e texto, como a automação já pedia.
 *  - O "serviço" (isService) e as perguntas (faq) não se editam: o site não
 *    os usa — as perguntas que o site mostra são blocos dentro do texto.
 *    Ficam como estão.
 */

export const IDIOMAS = ["en", "pt", "es", "fr", "de", "nl"] as const;
const CATEGORIAS = ["Lisbon", "Porto", "Sintra", "Algarve", "Douro Valley", "Cascais", "Travel Tips", "Guides", "Events"] as const;
const MAX_DESTAQUES = 6;
const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const versaoDe = (b: Doc<"blogs">) => b.updatedAt;

type EstadoIdioma = "original" | "feita" | "desactualizada" | "falta";

function estadoDasTraducoes(b: Doc<"blogs">, traducoes: Doc<"blogTranslations">[]): Record<string, EstadoIdioma> {
  const por = new Map(traducoes.map((t) => [t.locale, t]));
  return Object.fromEntries(
    IDIOMAS.map((l) => {
      if (l === b.originalLanguage) return [l, "original"];
      const t = por.get(l);
      if (!t) return [l, "falta"];
      /* Sem textoActualizadoEm (artigos de antes deste campo) não se sabe:
         não se acusa de desactualizada. */
      return [l, b.textoActualizadoEm && t.updatedAt < b.textoActualizadoEm ? "desactualizada" : "feita"];
    }),
  );
}

/* ─── Lista ──────────────────────────────────────────────────────────── */

export const lista = query({
  args: {
    estado: v.union(v.literal("published"), v.literal("draft"), v.literal("archived"), v.literal("todos")),
    categoria: v.string(),
    pesquisa: v.optional(v.string()),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx);
    const [blogs, traducoes] = await Promise.all([ctx.db.query("blogs").collect(), ctx.db.query("blogTranslations").collect()]);
    const porBlog = new Map<string, Doc<"blogTranslations">[]>();
    for (const t of traducoes) porBlog.set(t.blogId, [...(porBlog.get(t.blogId) ?? []), t]);

    const daCategoria = a.categoria ? blogs.filter((b) => b.category === a.categoria) : blogs;
    const porEstado = {
      published: daCategoria.filter((b) => b.status === "published").length,
      draft: daCategoria.filter((b) => b.status === "draft").length,
      archived: daCategoria.filter((b) => b.status === "archived").length,
      todos: daCategoria.length,
    };
    const porCategoria = Object.fromEntries(CATEGORIAS.map((c) => [c, blogs.filter((b) => b.category === c).length]));

    const q = semAcentos(a.pesquisa?.trim() ?? "");
    const filtrados = daCategoria
      .filter((b) => a.estado === "todos" || b.status === a.estado)
      .filter((b) => !q || [b.title, b.slug, b.author, ...(b.tags ?? [])].some((c) => c && semAcentos(c).includes(q)))
      /* Os publicados pela data de publicação, os outros pela última mudança. */
      .sort((x, y) => (y.publishedAt ?? y.updatedAt) - (x.publishedAt ?? x.updatedAt));

    const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
    const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
    const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
    const linhas = await Promise.all(
      filtrados.slice(pagina * porPagina, (pagina + 1) * porPagina).map(async (b) => ({
        id: b._id as string,
        titulo: b.title,
        slug: b.slug,
        categoria: b.category,
        autor: b.author,
        estado: b.status,
        destaque: b.isFeatured,
        capa: await urlDaImagem(ctx, b.heroImageId),
        publicadoEm: b.publishedAt ?? null,
        actualizado: b.updatedAt,
        leitura: b.readTimeMinutes,
        idiomas: estadoDasTraducoes(b, porBlog.get(b._id) ?? []),
      })),
    );

    return {
      linhas,
      total: filtrados.length,
      pagina,
      paginas,
      porPagina,
      porEstado,
      porCategoria,
      destaques: blogs.filter((b) => b.isFeatured).length,
      maxDestaques: MAX_DESTAQUES,
    };
  },
});

/* ─── Artigo ─────────────────────────────────────────────────────────── */

export const detalhe = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
    const nid = ctx.db.normalizeId("blogs", id);
    const b = nid ? await ctx.db.get(nid) : null;
    if (!b) return null;
    const [traducoes, equipa, destaques] = await Promise.all([
      ctx.db.query("blogTranslations").withIndex("by_blog", (q) => q.eq("blogId", b._id)).collect(),
      ctx.db.query("teamMembers").collect(),
      ctx.db.query("blogs").withIndex("by_featured", (q) => q.eq("isFeatured", true)).collect(),
    ]);
    const estados = estadoDasTraducoes(b, traducoes);
    return {
      id: b._id as string,
      versao: versaoDe(b),
      titulo: b.title,
      slug: b.slug,
      resumo: b.excerpt,
      conteudo: b.content,
      categoria: b.category,
      etiquetas: b.tags ?? [],
      estado: b.status,
      destaque: b.isFeatured,
      outrosDestaques: destaques.filter((x) => x._id !== b._id).length,
      maxDestaques: MAX_DESTAQUES,
      idiomaOriginal: b.originalLanguage,
      leitura: b.readTimeMinutes,
      publicadoEm: b.publishedAt ?? null,
      criado: b.createdAt,
      autor: {
        nome: b.author,
        cargo: b.authorRole ?? "",
        bio: b.authorBio ?? "",
        avatar: b.authorAvatarId ?? null,
        avatarUrl: await urlDaImagem(ctx, b.authorAvatarId),
      },
      capa: { imagem: b.heroImageId ?? null, url: await urlDaImagem(ctx, b.heroImageId), alt: b.heroImageAlt ?? "" },
      editorial: {
        imagem: b.editorialImageId ?? null,
        url: await urlDaImagem(ctx, b.editorialImageId),
        alt: b.editorialImageAlt ?? "",
        legenda: b.editorialImageCaption ?? "",
      },
      seoTitulo: b.seoTitle ?? "",
      seoDescricao: b.seoDescription ?? "",
      traducoes: traducoes
        .map((t) => ({
          locale: t.locale,
          versao: t.updatedAt,
          titulo: t.title,
          resumo: t.excerpt,
          conteudo: t.content,
          seoTitulo: t.seoTitle ?? "",
          seoDescricao: t.seoDescription ?? "",
          estado: estados[t.locale] as EstadoIdioma,
        }))
        .sort((x, y) => IDIOMAS.indexOf(x.locale as never) - IDIOMAS.indexOf(y.locale as never)),
      idiomas: estados,
      /* Os autores possíveis: a equipa de Sobre nós, como a automação escolhe. */
      equipa: await Promise.all(
        equipa
          .filter((m) => m.status === "published")
          .sort((x, y) => x.order - y.order)
          .map(async (m) => ({ nome: m.name, cargo: m.role, bio: m.bio ?? "", avatar: m.imageId ?? null, avatarUrl: await urlDaImagem(ctx, m.imageId) })),
      ),
    };
  },
});

/* Para um artigo novo: só a equipa, para escolher o autor. */
export const autores = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const equipa = await ctx.db.query("teamMembers").collect();
    return await Promise.all(
      equipa
        .filter((m) => m.status === "published")
        .sort((x, y) => x.order - y.order)
        .map(async (m) => ({ nome: m.name, cargo: m.role, bio: m.bio ?? "", avatar: m.imageId ?? null, avatarUrl: await urlDaImagem(ctx, m.imageId) })),
    );
  },
});

/* ─── Gravar ─────────────────────────────────────────────────────────── */

const vDados = v.object({
  titulo: v.string(),
  slug: v.string(),
  resumo: v.string(),
  conteudo: v.any(),
  categoria: v.string(),
  etiquetas: v.array(v.string()),
  destaque: v.boolean(),
  autor: v.object({ nome: v.string(), cargo: v.string(), bio: v.string(), avatar: v.union(v.string(), v.null()) }),
  capa: v.object({ imagem: v.union(v.string(), v.null()), alt: v.string() }),
  editorial: v.object({ imagem: v.union(v.string(), v.null()), alt: v.string(), legenda: v.string() }),
  seoTitulo: v.string(),
  seoDescricao: v.string(),
});
type Dados = typeof vDados.type;

const palavras = (conteudo: unknown) => extractTextFromTipTap(conteudo).split(/\s+/).filter(Boolean).length;

async function validar(ctx: QueryCtx, d: Dados, id?: Id<"blogs">): Promise<Record<string, string>> {
  const erros: Record<string, string> = {};
  const titulo = d.titulo.trim();
  if (!titulo) erros.titulo = "Escreva o título.";
  else if (titulo.length > 140) erros.titulo = "No máximo 140 caracteres.";
  if (!d.resumo.trim()) erros.resumo = "Escreva o resumo: aparece nos cartões do blog.";
  else if (d.resumo.trim().length > 400) erros.resumo = "No máximo 400 caracteres.";
  if (palavras(d.conteudo) === 0) erros.conteudo = "O artigo não tem texto.";
  if (!(CATEGORIAS as readonly string[]).includes(d.categoria)) erros.categoria = "Escolha uma categoria.";
  if (d.etiquetas.length > 12) erros.etiquetas = "No máximo 12 etiquetas.";
  else if (d.etiquetas.some((e) => e.trim().length > 40)) erros.etiquetas = "Cada etiqueta com 40 caracteres no máximo.";
  if (!d.autor.nome.trim()) erros.autor = "Escolha quem assina o artigo.";
  /* Limites largos: a geração automática escreve títulos para o Google com
     até 95 caracteres (4 artigos e 30 traduções em produção), e recusá-los
     impedia gravar o artigo por causa de um campo que ninguém mexeu. O
     editor avisa a partir de onde o Google corta (60 e 160). */
  if (d.seoTitulo.trim().length > 120) erros.seoTitulo = "No máximo 120 caracteres.";
  if (d.seoDescricao.trim().length > 300) erros.seoDescricao = "No máximo 300 caracteres.";
  if (d.editorial.legenda.trim().length > 200) erros.editorialLegenda = "No máximo 200 caracteres.";

  const slug = d.slug.trim() || generateSlug(titulo);
  if (!slug) erros.slug = "Escreva o endereço.";
  else if (slug.length > 120) erros.slug = "No máximo 120 caracteres.";
  else if (!SLUG_VALIDO.test(slug)) erros.slug = "Só minúsculas sem acentos, números e hífens.";
  else {
    const outro = await ctx.db.query("blogs").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (outro && outro._id !== id) erros.slug = `Já é o endereço de "${outro.title}".`;
  }

  if (d.destaque) {
    const outros = (await ctx.db.query("blogs").withIndex("by_featured", (q) => q.eq("isFeatured", true)).collect()).filter((b) => b._id !== id);
    if (outros.length >= MAX_DESTAQUES) erros.destaque = `Já há ${MAX_DESTAQUES} artigos em destaque, o máximo que a página do blog mostra. Tire um antes.`;
  }
  return erros;
}

function registo(d: Dados) {
  const t = (s: string) => s.trim();
  return {
    title: t(d.titulo),
    slug: t(d.slug) || generateSlug(t(d.titulo)),
    excerpt: t(d.resumo),
    content: d.conteudo,
    category: d.categoria,
    tags: d.etiquetas.map((e) => e.trim()).filter(Boolean),
    isFeatured: d.destaque,
    author: t(d.autor.nome),
    authorRole: t(d.autor.cargo) || undefined,
    authorBio: t(d.autor.bio) || undefined,
    authorAvatarId: d.autor.avatar ?? undefined,
    heroImageId: d.capa.imagem ?? undefined,
    heroImageAlt: t(d.capa.alt) || undefined,
    editorialImageId: d.editorial.imagem ?? undefined,
    editorialImageAlt: t(d.editorial.alt) || undefined,
    editorialImageCaption: t(d.editorial.legenda) || undefined,
    seoTitle: t(d.seoTitulo) || undefined,
    seoDescription: t(d.seoDescricao) || undefined,
    readTimeMinutes: calculateReadTime(d.conteudo),
  };
}

const igualJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const guardar = mutation({
  args: { id: v.optional(v.id("blogs")), versao: v.optional(v.number()), dados: vDados },
  handler: async (ctx, { id, versao, dados }) => {
    await exigirAdmin(ctx);
    const erros = await validar(ctx, dados, id);
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });
    const agora = Date.now();
    const r = registo(dados);

    if (!id) {
      /* Um artigo novo nasce em rascunho e em inglês, como todos os outros:
         as traduções partem do inglês. */
      const nid = await ctx.db.insert("blogs", {
        ...r,
        originalLanguage: "en",
        status: "draft",
        isService: false,
        createdAt: agora,
        updatedAt: agora,
        textoActualizadoEm: agora,
      });
      return { id: nid as string, versao: agora };
    }

    const b = await ctx.db.get(id);
    if (!b) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este artigo já não existe." });
    if (versao !== undefined && versaoDe(b) !== versao) {
      throw new ConvexError({ tipo: "conflito", mensagem: "Alguém gravou este artigo depois de o abrir (ou a geração automática acabou de o mexer). Veja a versão actual antes de gravar por cima." });
    }
    const mudouTexto = r.title !== b.title || r.excerpt !== b.excerpt || !igualJson(r.content, b.content);
    const updatedAt = Math.max(agora, versaoDe(b) + 1);
    /* As imagens antigas não se apagam (lib/imagens.ts). */
    await ctx.db.patch(id, { ...r, updatedAt, ...(mudouTexto ? { textoActualizadoEm: updatedAt } : {}) });
    return { id: id as string, versao: updatedAt };
  },
});

export const mudarEstado = mutation({
  args: { id: v.id("blogs"), estado: v.union(v.literal("published"), v.literal("draft"), v.literal("archived")) },
  handler: async (ctx, { id, estado }) => {
    await exigirAdmin(ctx);
    const b = await ctx.db.get(id);
    if (!b) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este artigo já não existe." });
    if (estado === "published") {
      /* Os mesmos portões da automação: sem capa um artigo não vai para o ar. */
      const falta = [!b.heroImageId && "imagem de capa", !palavras(b.content) && "texto", !b.excerpt.trim() && "resumo"].filter(Boolean);
      if (falta.length) throw new ConvexError({ tipo: "invalido", mensagem: `Falta ${falta.join(" e ")} para publicar.` });
    }
    const agora = Date.now();
    await ctx.db.patch(id, {
      status: estado,
      /* A data de publicação é a primeira: voltar a publicar não a muda. */
      ...(estado === "published" ? { publishedAt: b.publishedAt ?? agora } : {}),
      /* Um artigo fora do site não fica em destaque a ocupar um dos seis. */
      ...(estado !== "published" ? { isFeatured: false } : {}),
      updatedAt: Math.max(agora, versaoDe(b) + 1),
    });
  },
});

export const remover = mutation({
  args: { id: v.id("blogs") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx);
    const b = await ctx.db.get(id);
    if (!b) return;
    const traducoes = await ctx.db.query("blogTranslations").withIndex("by_blog", (q) => q.eq("blogId", id)).collect();
    for (const t of traducoes) await ctx.db.delete(t._id);
    /* As imagens não se apagam: podem estar noutro registo (lib/imagens.ts). */
    await ctx.db.delete(id);
  },
});

/* ─── Traduções ──────────────────────────────────────────────────────── */

export const guardarTraducao = mutation({
  args: {
    blogId: v.id("blogs"),
    locale: v.string(),
    /* null: não existia quando se abriu. */
    versao: v.union(v.number(), v.null()),
    dados: v.object({ titulo: v.string(), resumo: v.string(), conteudo: v.any(), seoTitulo: v.string(), seoDescricao: v.string() }),
  },
  handler: async (ctx, { blogId, locale, versao, dados }) => {
    await exigirAdmin(ctx);
    const b = await ctx.db.get(blogId);
    if (!b) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este artigo já não existe." });
    if (!(IDIOMAS as readonly string[]).includes(locale) || locale === b.originalLanguage) {
      throw new ConvexError({ tipo: "invalido", mensagem: "Idioma que não se traduz." });
    }
    const erros: Record<string, string> = {};
    if (!dados.titulo.trim()) erros.titulo = "Escreva o título.";
    if (!dados.resumo.trim()) erros.resumo = "Escreva o resumo.";
    if (palavras(dados.conteudo) === 0) erros.conteudo = "A tradução não tem texto.";
    if (dados.seoTitulo.trim().length > 120) erros.seoTitulo = "No máximo 120 caracteres.";
    if (dados.seoDescricao.trim().length > 300) erros.seoDescricao = "No máximo 300 caracteres.";
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const existente = await ctx.db
      .query("blogTranslations")
      .withIndex("by_blog_locale", (q) => q.eq("blogId", blogId).eq("locale", locale))
      .first();
    if ((existente?.updatedAt ?? null) !== versao) {
      throw new ConvexError({ tipo: "conflito", mensagem: "Esta tradução mudou depois de a abrir. Veja a versão actual antes de gravar por cima." });
    }
    const agora = Math.max(Date.now(), (existente?.updatedAt ?? 0) + 1);
    const registo = {
      title: dados.titulo.trim(),
      excerpt: dados.resumo.trim(),
      content: dados.conteudo,
      seoTitle: dados.seoTitulo.trim() || undefined,
      seoDescription: dados.seoDescricao.trim() || undefined,
      updatedAt: agora,
    };
    if (existente) await ctx.db.patch(existente._id, registo);
    else await ctx.db.insert("blogTranslations", { blogId, locale, ...registo });
    return { versao: agora };
  },
});

export const removerTraducao = mutation({
  args: { blogId: v.id("blogs"), locale: v.string() },
  handler: async (ctx, { blogId, locale }) => {
    await exigirAdmin(ctx);
    const t = await ctx.db
      .query("blogTranslations")
      .withIndex("by_blog_locale", (q) => q.eq("blogId", blogId).eq("locale", locale))
      .first();
    if (t) await ctx.db.delete(t._id);
  },
});

/* ─── Geração automática ─────────────────────────────────────────────── */

/* O que correu mal, em português e para quem não é programador. */
function explicar(r: Doc<"blogGenerationRuns">): string | null {
  const e = r.error ?? "";
  if (/429/.test(e) && /credit|quota|billing/i.test(e)) return "A conta da OpenAI ficou sem créditos.";
  if (/429/.test(e)) return "A OpenAI recusou por excesso de pedidos.";
  const m = e.match(/artigo reprovado: (\d+) avisos/);
  if (m) return `O texto gerado não passou na verificação de formato (${m[1]} problemas). Tentou outra vez.`;
  if (/Unexpected end of JSON/i.test(e)) return "A resposta da OpenAI chegou cortada. Tentou outra vez.";
  if (/Sem imagem de capa/.test(e)) return "A imagem de capa falhou: o artigo ficou em rascunho.";
  if (/Corrida de teste/.test(e)) return "Geração de teste: o artigo ficou em rascunho de propósito.";
  if (r.status === "needsReview" && r.localesFailed?.length) return `Publicado, mas faltam traduções (${r.localesFailed.join(", ")}).`;
  return e ? e.slice(0, 200) : null;
}

export const automacao = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx);
    const corridas = await ctx.db.query("blogGenerationRuns").withIndex("by_started").order("desc").take(15);
    const agora = Date.now();
    return {
      ligada: process.env.BLOG_AUTOMATION_ENABLED === "true",
      temChave: Boolean(process.env.OPENAI_API_KEY),
      aDecorrer: corridas.some((r) => r.status === "running" && agora - r.startedAt < 30 * 60_000),
      corridas: corridas.map((r) => ({
        id: r._id as string,
        estado: r.status === "running" && agora - r.startedAt >= 30 * 60_000 ? ("parada" as const) : r.status,
        origem: r.trigger,
        tema: r.topic ?? null,
        titulo: r.title ?? null,
        blogId: (r.blogId as string | undefined) ?? null,
        explicacao: explicar(r),
        traducoesFeitas: r.localesDone ?? [],
        traducoesFalhadas: r.localesFailed ?? [],
        inicio: r.startedAt,
        fim: r.finishedAt ?? null,
      })),
    };
  },
});
