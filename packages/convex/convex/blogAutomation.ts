import { v, type ObjectType } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { publicarNoBunny } from "./lib/bunny";
import {
  ARTICLE_SYSTEM_PROMPT,
  BANNED_PHRASES,
  BLOG_CATEGORIES,
  IMAGE_SYSTEM_PROMPT,
  articleUserPrompt,
  imageUserPrompt,
  parseFaq,
  parseLuxBlocks,
  topicUserPrompt,
  translationSystemPrompt,
  translationUserPrompt,
} from "./lib/blogPrompts";
import {
  fetchLogoReference,
  generateImage,
  generateText,
  textModel,
} from "./lib/openai";
import {
  findUnrenderableNodes,
  markdownToTiptap,
  structuralSignature,
} from "./lib/markdownToTiptap";
import { exigirAdmin } from "./lib/admin";

/**
 * Automação de artigos de blog.
 *
 * O artigo é criado sempre como RASCUNHO e só é publicado no fim, depois de a
 * imagem e as traduções estarem resolvidas. Assim nada meio-construído chega ao
 * público, e cumpre-se na mesma o requisito de publicar sozinho.
 *
 * Uma chamada à OpenAI por action, encadeadas com o scheduler: sete chamadas em
 * série no mesmo handler não caberiam no limite de execução de uma action.
 */

const LOG = "[BlogGen]";

/** Traduções a produzir. O original é `en`, que o upsertTranslation recusa. */
const TARGET_LOCALES = ["pt", "de", "nl", "fr", "es"] as const;

/** Portões de qualidade antes de publicar. */
const MIN_WORDS = 1200;
const MIN_BLOCKS = 5;
const MAX_WARNINGS = 5;
const MAX_BANNED = 2;
const MAX_ATTEMPTS = 3;

function enabled(): boolean {
  return process.env.BLOG_AUTOMATION_ENABLED === "true";
}

function hostUrl(): string {
  return process.env.HOST_URL ?? "https://www.easytransferportugal.com";
}

/* ------------------------------------------------------------- mutations */

export const _startRun = internalMutation({
  args: {
    trigger: v.union(v.literal("cron"), v.literal("manual")),
    topic: v.optional(v.string()),
    icp: v.optional(v.string()),
    keepDraft: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("blogGenerationRuns", {
      trigger: args.trigger,
      status: "running",
      topic: args.topic,
      icp: args.icp,
      keepDraft: args.keepDraft,
      imageDone: false,
      localesDone: [],
      localesFailed: [],
      warnings: [],
      model: textModel(),
      startedAt: Date.now(),
    });
  },
});

export const _patchRun = internalMutation({
  args: {
    runId: v.id("blogGenerationRuns"),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, args.patch);
  },
});

export const _failRun = internalMutation({
  args: { runId: v.id("blogGenerationRuns"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error.slice(0, 2000),
      finishedAt: Date.now(),
    });
  },
});

/**
 * Marca um passo concluído e, quando a imagem e os 5 locales estiverem
 * resolvidos, publica o artigo. É aqui que a publicação acontece, e em mais
 * lado nenhum.
 */
export const _markStep = internalMutation({
  args: {
    runId: v.id("blogGenerationRuns"),
    image: v.optional(v.boolean()),
    localeDone: v.optional(v.string()),
    localeFailed: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;

    const done = new Set(run.localesDone ?? []);
    const failed = new Set(run.localesFailed ?? []);
    if (args.localeDone) done.add(args.localeDone);
    if (args.localeFailed) failed.add(args.localeFailed);
    const imageDone = args.image ?? run.imageDone ?? false;

    await ctx.db.patch(args.runId, {
      imageDone,
      localesDone: [...done],
      localesFailed: [...failed],
    });

    const localesResolved = TARGET_LOCALES.every(
      (l) => done.has(l) || failed.has(l),
    );
    if (!imageDone || !localesResolved || !run.blogId) return;

    // Sem hero acima da dobra, um artigo de viagens de luxo não deve ir para o
    // ar. Fica em rascunho à espera de alguém.
    const hasHero = Boolean((await ctx.db.get(run.blogId))?.heroImageId);
    const partial = failed.size > 0 || !hasHero || Boolean(run.keepDraft);

    if (hasHero && !run.keepDraft) {
      await ctx.db.patch(run.blogId, {
        status: "published",
        publishedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await ctx.db.patch(args.runId, {
      status: partial ? "needsReview" : "completed",
      finishedAt: Date.now(),
      error: run.keepDraft
        ? "Corrida de teste: artigo deixado em rascunho de propósito."
        : hasHero
          ? undefined
          : "Sem imagem de capa: artigo deixado em rascunho.",
    });
  },
});

/* ---------------------------------------------------------------- queries */

/** Últimos títulos publicados, para o modelo não repetir ângulo. */
export const _recentTitles = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("blogs")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    return rows
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .slice(0, 20)
      .map((b) => b.title);
  },
});

/** Autor do próximo artigo: equipa real, com os fundadores à cabeça. */
export const _pickAuthor = internalQuery({
  args: {},
  handler: async (ctx) => {
    const team = await ctx.db
      .query("teamMembers")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
    if (team.length === 0) return null;

    const PRIORITY = ["david", "afonso"];
    const priority = team.filter((m) =>
      PRIORITY.some((p) => m.name.toLowerCase().includes(p)),
    );
    const pool = priority.length > 0 ? priority : team;

    // Entre os candidatos, quem tem menos artigos escritos.
    const blogs = await ctx.db.query("blogs").collect();
    const counts = new Map<string, number>();
    for (const b of blogs) counts.set(b.author, (counts.get(b.author) ?? 0) + 1);

    const chosen = pool.reduce((best, m) =>
      (counts.get(m.name) ?? 0) < (counts.get(best.name) ?? 0) ? m : best,
    );
    return {
      name: chosen.name,
      role: chosen.role,
      bio: chosen.bio,
      avatarId: chosen.imageId,
    };
  },
});

/** Histórico para o painel do admin. */
const argslistarCorridas = { limit: v.optional(v.number()) };

async function listarCorridas(ctx: QueryCtx, args: ObjectType<typeof argslistarCorridas>) {
    const rows = await ctx.db
      .query("blogGenerationRuns")
      .withIndex("by_started")
      .order("desc")
      .take(args.limit ?? 20);
    return rows.map((r) => ({
      _id: r._id,
      status: r.status,
      trigger: r.trigger,
      topic: r.topic,
      title: r.title,
      blogId: r.blogId,
      localesDone: r.localesDone ?? [],
      localesFailed: r.localesFailed ?? [],
      warnings: r.warnings ?? [],
      error: r.error,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    }));
  }

export const listRuns = query({
  args: argslistarCorridas,
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    return await listarCorridas(ctx, args);
  },
});

/** A mesma coisa, para a automação do blog — corre agendada, sem sessão. */
export const listRunsInterno = internalQuery({
  args: argslistarCorridas,
  handler: (ctx, args) => listarCorridas(ctx, args),
});

/** Markdown de origem, para as traduções partirem do texto e não do JSON. */
export const _runSource = internalQuery({
  args: { runId: v.id("blogGenerationRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    return {
      markdown: run.sourceMarkdown ?? "",
      title: run.title ?? "",
      description: run.description ?? "",
      blogId: run.blogId,
    };
  },
});

/* ---------------------------------------------------------------- actions */

export const generateArticle = internalAction({
  args: {
    topic: v.optional(v.string()),
    icp: v.optional(v.string()),
    trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))),
    keepDraft: v.optional(v.boolean()),
    runId: v.optional(v.id("blogGenerationRuns")),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    const trigger = args.trigger ?? "cron";
    if (trigger === "cron" && !enabled()) {
      console.log(`${LOG} desligado (BLOG_AUTOMATION_ENABLED != "true")`);
      return { ok: false, error: "disabled" };
    }

    const attempt = args.attempt ?? 1;
    const runId =
      args.runId ??
      (await ctx.runMutation(internal.blogAutomation._startRun, {
        trigger,
        topic: args.topic,
        icp: args.icp,
        keepDraft: args.keepDraft,
      }));

    try {
      const recent: string[] = await ctx.runQuery(
        internal.blogAutomation._recentTitles,
        {},
      );
      const recentTitles = recent.map((t) => `- ${t}`).join("\n");

      // 1. Tópico
      let topic = args.topic ?? "";
      let icp = args.icp ?? "";
      if (!topic) {
        const pick = await generateText({
          system:
            "You plan the editorial calendar for a Portuguese luxury chauffeur company. You answer with JSON only.",
          user: topicUserPrompt(recentTitles),
          maxOutputTokens: 4000,
        });
        const parsed = JSON.parse(
          pick.text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim(),
        );
        topic = String(parsed.topic ?? "").trim();
        icp = String(parsed.icp ?? "").trim();
        if (!topic) throw new Error("o modelo não devolveu tópico");
      }
      await ctx.runMutation(internal.blogAutomation._patchRun, {
        runId,
        patch: { topic, icp },
      });

      // 2. Artigo
      const article = await generateText({
        system: ARTICLE_SYSTEM_PROMPT,
        user: articleUserPrompt({
          topic,
          icp: icp as never,
          realMaterial: "",
          recentTitles,
          hostUrl: hostUrl(),
        }),
      });
      if (article.finishReason === "length") {
        throw new Error("resposta truncada pelo limite de tokens");
      }

      const blocks = parseLuxBlocks(article.text);
      const required = ["TITLE", "DESCRIPTION", "CONTENT"];
      const missing = required.filter((k) => !blocks[k]);
      if (missing.length > 0) {
        throw new Error(`blocos em falta na resposta: ${missing.join(", ")}`);
      }

      const title = blocks.TITLE!.replace(/^["']|["']$/g, "").trim();
      const description = blocks.DESCRIPTION!.trim();
      const markdown = blocks.CONTENT!;

      // 3. Markdown → TipTap
      const converted = markdownToTiptap(markdown, { title });
      const unrenderable = findUnrenderableNodes(converted.doc);

      // 4. Portões de qualidade
      const lowered = markdown.toLowerCase();
      const banned = BANNED_PHRASES.filter((p) => lowered.includes(p));
      const problems: string[] = [];
      if (unrenderable.length > 0)
        problems.push(`nós não renderizáveis: ${unrenderable.join(", ")}`);
      if (converted.wordCount < MIN_WORDS)
        problems.push(`só ${converted.wordCount} palavras`);
      if (converted.blockCount < MIN_BLOCKS)
        problems.push(`só ${converted.blockCount} blocos`);
      if (converted.warnings.length > MAX_WARNINGS)
        problems.push(`${converted.warnings.length} avisos do conversor`);
      if (banned.length > MAX_BANNED)
        problems.push(`expressões proibidas: ${banned.join(", ")}`);
      // Todos os títulos do blog seguem "Assunto: ângulo". Sem os dois pontos
      // o artigo destoa da lista inteira.
      if (!title.includes(":"))
        problems.push(`título sem dois pontos: "${title}"`);
      if (problems.length > 0) {
        throw new Error(`artigo reprovado: ${problems.join("; ")}`);
      }

      // Slug duplicado é um quase-duplicado a competir consigo próprio no
      // Google. O create resolveria com um sufixo, mas não é o que queremos.
      const existing = await ctx.runQuery(api.blogs.getBySlug, {
        slug: slugify(title),
      });
      if (existing) throw new Error(`já existe um artigo com este slug: ${title}`);

      // 5. Autor
      const author = await ctx.runQuery(internal.blogAutomation._pickAuthor, {});

      const category = BLOG_CATEGORIES.includes(blocks.CATEGORY as never)
        ? blocks.CATEGORY!
        : "Guides";
      const tags = (blocks.TAGS ?? "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 5);
      const faq = blocks.FAQ ? parseFaq(blocks.FAQ) : [];

      // 6. Rascunho. A publicação é feita pelo _markStep no fim.
      const blogId: Id<"blogs"> = await ctx.runMutation(internal.blogs.createInterno, {
        title,
        excerpt: description.slice(0, 200),
        content: converted.doc,
        category,
        author: author?.name ?? "EasyTransfer Team",
        authorRole: author?.role,
        authorBio: author?.bio,
        authorAvatarId: author?.avatarId,
        originalLanguage: "en",
        status: "draft",
        isFeatured: false,
        seoTitle: title,
        seoDescription: description,
        tags,
        faq: faq.length > 0 ? faq : undefined,
      });

      await ctx.runMutation(internal.blogAutomation._patchRun, {
        runId,
        patch: {
          blogId,
          title,
          description,
          sourceMarkdown: markdown,
          rawResponse: article.text.slice(0, 100_000),
          warnings: converted.warnings,
        },
      });

      // 7. Imagem e traduções, cada uma na sua action.
      await ctx.scheduler.runAfter(0, internal.blogAutomation.generateHeroImage, {
        runId,
        blogId,
        title,
        topic,
        icp,
        keyPoints: firstBullets(markdown),
        keyword: blocks.KEYWORD ?? tags[0] ?? "luxury transfers portugal",
      });
      for (const locale of TARGET_LOCALES) {
        await ctx.scheduler.runAfter(0, internal.blogAutomation.translateBlog, {
          runId,
          blogId,
          locale,
        });
      }

      console.log(`${LOG} artigo criado em rascunho: ${title}`);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${LOG} falhou (tentativa ${attempt}): ${message}`);

      if (attempt < MAX_ATTEMPTS) {
        await ctx.runMutation(internal.blogAutomation._failRun, {
          runId,
          error: `${message} (nova tentativa agendada)`,
        });
        await ctx.scheduler.runAfter(
          Math.min(10 * 60_000, 30_000 * 2 ** (attempt - 1)),
          internal.blogAutomation.generateArticle,
          {
            topic: args.topic,
            icp: args.icp,
            trigger,
            keepDraft: args.keepDraft,
            attempt: attempt + 1,
          },
        );
      } else {
        await ctx.runMutation(internal.blogAutomation._failRun, { runId, error: message });
      }
      return { ok: false, error: message };
    }
  },
});

/**
 * As duas imagens do artigo: a capa e a editorial que vai no corpo do texto.
 *
 * Uma chamada ao modelo de texto escreve os dois prompts e a metadata, e cada
 * imagem é uma chamada ao GPT Image com o logo oficial em anexo. A capa é
 * obrigatória — sem ela o artigo não publica e a action volta a tentar. A
 * editorial é o melhor esforço: falhar a segunda imagem não justifica pagar a
 * primeira outra vez.
 */
export const generateHeroImage = internalAction({
  args: {
    runId: v.id("blogGenerationRuns"),
    blogId: v.id("blogs"),
    title: v.string(),
    topic: v.string(),
    icp: v.string(),
    keyPoints: v.string(),
    keyword: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const attempt = args.attempt ?? 1;
    try {
      const brief = await generateText({
        system: IMAGE_SYSTEM_PROMPT,
        user: imageUserPrompt({
          title: args.title,
          icp: args.icp as never,
          topic: args.topic,
          primaryKeyword: args.keyword,
          keyPoints: args.keyPoints,
        }),
        maxOutputTokens: 8000,
      });
      if (brief.finishReason === "length") {
        throw new Error(
          "briefing de imagem truncado pelo limite de tokens (aumentar maxOutputTokens)",
        );
      }
      const blocks = parseLuxBlocks(brief.text);
      // Se as tags não vierem mas houver texto, o próprio texto costuma ser um
      // prompt utilizável. Falhar por causa do formato seria deitar fora uma
      // resposta boa.
      const heroPrompt = blocks.HERO_PROMPT ?? brief.text.trim();
      if (!heroPrompt) {
        throw new Error(
          `briefing de imagem vazio (finishReason=${brief.finishReason})`,
        );
      }
      if (!blocks.HERO_PROMPT) {
        console.warn(
          `${LOG} briefing sem ::LUX_HERO_PROMPT::, a usar a resposta inteira: ${brief.text.slice(0, 200)}`,
        );
      }

      // O logo é a referência de identidade. Sem ele o modelo inventa um
      // monograma parecido, portanto mais vale pedir os carros sem marca
      // nenhuma do que uma marca errada.
      let logo: Blob | undefined;
      try {
        logo = await fetchLogoReference(hostUrl());
      } catch (error) {
        console.warn(
          `${LOG} sem logo de referência (${error instanceof Error ? error.message : error}): imagens sem branding`,
        );
      }
      // O `/images/edits` tende a tratar o anexo como tela de partida, por isso
      // a primeira frase diz explicitamente que o logo é só referência de marca.
      const withBranding = (prompt: string) =>
        logo
          ? `The attached image is the official LuxMotion logo, supplied only as a brand identity reference. It is not the scene, the background, the composition or the subject. Produce a completely new photograph as described below, and reproduce the logo exactly as supplied wherever the description places it. ${prompt}`
          : `${prompt} Leave every vehicle surface unbranded: no LuxMotion logo, monogram, badge, lettering or emblem anywhere in the frame.`;

      const heroBlob = await generateImage({
        prompt: withBranding(heroPrompt),
        reference: logo,
      });
      // Directo para o Bunny, como qualquer imagem nova do site.
      const heroId = await publicarNoBunny(heroBlob);

      // A editorial não pode derrubar a capa que já está paga e guardada.
      let editorialId: string | undefined;
      const editorialPrompt = blocks.EDITORIAL_PROMPT?.trim();
      if (editorialPrompt) {
        try {
          const editorialBlob = await generateImage({
            prompt: withBranding(editorialPrompt),
            reference: logo,
          });
          editorialId = await publicarNoBunny(editorialBlob);
        } catch (error) {
          console.warn(
            `${LOG} imagem editorial falhou: ${error instanceof Error ? error.message : error}`,
          );
        }
      } else {
        console.warn(`${LOG} briefing sem ::LUX_EDITORIAL_PROMPT::`);
      }

      const blog = await ctx.runQuery(api.blogs.getById, { id: args.blogId });
      const tags = mergeTags(blog?.tags, blocks.IMAGE_TAGS);

      await ctx.runMutation(internal.blogs.updateInterno, {
        id: args.blogId,
        heroImageId: heroId,
        heroImageAlt: clean(blocks.HERO_ALT),
        heroImageFilename: filename(blocks.HERO_FILENAME),
        editorialImageId: editorialId,
        editorialImageAlt: editorialId ? clean(blocks.EDITORIAL_ALT) : undefined,
        editorialImageCaption: editorialId
          ? clean(blocks.EDITORIAL_CAPTION)
          : undefined,
        editorialImageFilename: editorialId
          ? filename(blocks.EDITORIAL_FILENAME)
          : undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      await ctx.runMutation(internal.blogAutomation._markStep, {
        runId: args.runId,
        image: true,
      });
      console.log(
        `${LOG} imagens guardadas para ${args.title} (editorial: ${editorialId ? "sim" : "não"})`,
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${LOG} imagem falhou (tentativa ${attempt}): ${message}`);
      if (attempt < 3) {
        await ctx.scheduler.runAfter(
          30_000 * attempt,
          internal.blogAutomation.generateHeroImage,
          { ...args, attempt: attempt + 1 },
        );
      } else {
        // Sem imagem o artigo não publica: marca o passo para o run fechar.
        await ctx.runMutation(internal.blogAutomation._markStep, {
          runId: args.runId,
          image: true,
        });
      }
      return { ok: false };
    }
  },
});

export const translateBlog = internalAction({
  args: {
    runId: v.id("blogGenerationRuns"),
    blogId: v.id("blogs"),
    locale: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const attempt = args.attempt ?? 1;
    try {
      const source = await ctx.runQuery(internal.blogAutomation._runSource, {
        runId: args.runId,
      });
      if (!source?.markdown) throw new Error("sem Markdown de origem");

      const out = await generateText({
        system: translationSystemPrompt(args.locale),
        user: translationUserPrompt({
          markdown: source.markdown,
          title: source.title,
          description: source.description,
        }),
      });
      if (out.finishReason === "length") throw new Error("tradução truncada");

      const blocks = parseLuxBlocks(out.text);
      if (!blocks.TITLE || !blocks.CONTENT) {
        throw new Error("tradução sem os blocos obrigatórios");
      }

      const original = markdownToTiptap(source.markdown, { title: source.title });
      const translated = markdownToTiptap(blocks.CONTENT, { title: blocks.TITLE });

      // Uma tradução com a estrutura destruída é pior do que nenhuma: o site
      // cai graciosamente para o inglês quando a tradução não existe.
      if (structuralSignature(original.doc) !== structuralSignature(translated.doc)) {
        throw new Error("estrutura da tradução diverge do original");
      }

      await ctx.runMutation(internal.blogs.upsertTranslationInterno, {
        blogId: args.blogId,
        locale: args.locale,
        title: blocks.TITLE.trim(),
        excerpt: (blocks.EXCERPT ?? blocks.DESCRIPTION ?? "").slice(0, 200),
        content: translated.doc,
        seoTitle: blocks.TITLE.trim(),
        seoDescription: blocks.DESCRIPTION,
      });
      await ctx.runMutation(internal.blogAutomation._markStep, {
        runId: args.runId,
        localeDone: args.locale,
      });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${LOG} tradução ${args.locale} falhou: ${message}`);
      if (attempt < 2) {
        await ctx.scheduler.runAfter(
          20_000,
          internal.blogAutomation.translateBlog,
          { ...args, attempt: attempt + 1 },
        );
      } else {
        await ctx.runMutation(internal.blogAutomation._markStep, {
          runId: args.runId,
          localeFailed: args.locale,
        });
      }
      return { ok: false };
    }
  },
});

/** Botão do admin. Aceita um tópico, ou deixa o modelo escolher. */
export const generateNow = action({
  args: {
    topic: v.optional(v.string()),
    icp: v.optional(v.string()),
    keepDraft: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    await exigirAdmin(ctx);
    // Esta action gasta dinheiro e o Convex não tem autenticação: recusa se já
    // houver uma geração a decorrer.
    const runs = await ctx.runQuery(internal.blogAutomation.listRunsInterno, { limit: 5 });
    const running = runs.find(
      (r) => r.status === "running" && Date.now() - r.startedAt < 30 * 60_000,
    );
    if (running) {
      return { ok: false, error: "Já há uma geração a decorrer." };
    }
    const runId = await ctx.runMutation(internal.blogAutomation._startRun, {
      trigger: "manual",
      topic: args.topic,
      icp: args.icp,
      keepDraft: args.keepDraft,
    });
    await ctx.scheduler.runAfter(0, internal.blogAutomation.generateArticle, {
      topic: args.topic,
      icp: args.icp,
      keepDraft: args.keepDraft,
      trigger: "manual",
      runId,
    });
    return { ok: true };
  },
});

/**
 * Repete só a imagem de um artigo. Serve para os que ficaram em rascunho por a
 * geração da capa ter falhado: reescrever o artigo inteiro seria pagar as sete
 * chamadas outra vez por causa de uma.
 */
export const retryHeroImage = action({
  args: { blogId: v.id("blogs") },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    await exigirAdmin(ctx);
    const blog = await ctx.runQuery(api.blogs.getById, { id: args.blogId });
    if (!blog) return { ok: false, error: "Artigo não encontrado." };

    const runId = await ctx.runMutation(internal.blogAutomation._startRun, {
      trigger: "manual",
      topic: blog.title,
      keepDraft: blog.status !== "published",
    });
    await ctx.runMutation(internal.blogAutomation._patchRun, {
      runId,
      patch: {
        blogId: args.blogId,
        title: blog.title,
        // Os locales já existem: não voltar a traduzir.
        localesDone: (blog.translations ?? []).map((t: { locale: string }) => t.locale),
      },
    });
    await ctx.scheduler.runAfter(0, internal.blogAutomation.generateHeroImage, {
      runId,
      blogId: args.blogId,
      title: blog.title,
      topic: blog.title,
      icp: "",
      keyPoints: blog.excerpt ?? "",
      keyword: (blog.tags ?? [])[0] ?? "luxury transfers portugal",
    });
    return { ok: true };
  },
});

/* ---------------------------------------------------------------- helpers */

/** Um bloco do briefing que veio vazio não deve gravar uma string vazia. */
function clean(value: string | undefined): string | undefined {
  const t = value?.trim().replace(/^["']|["']$/g, "");
  return t ? t : undefined;
}

/**
 * O nome de ficheiro proposto pelo modelo, normalizado.
 *
 * O storage do Convex serve por id, portanto isto é registo: fica guardado para
 * o dia em que as imagens saírem para um CDN com nomes reais. A extensão é
 * forçada a .jpg porque é o formato que a API devolve.
 */
function filename(value: string | undefined): string | undefined {
  const raw = clean(value);
  if (!raw) return undefined;
  const slug = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.jpe?g$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug ? `${slug}.jpg` : undefined;
}

/** As tags do briefing juntam-se às do artigo, sem repetir e sem passar de 5. */
function mergeTags(
  existing: string[] | undefined,
  fromImages: string | undefined,
): string[] {
  const extra = (fromImages ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const out: string[] = [];
  for (const tag of [...(existing ?? []), ...extra]) {
    if (!out.includes(tag)) out.push(tag);
    if (out.length === 5) break;
  }
  return out;
}

/** Espelha o generateSlug de lib/utils.ts, para pré-verificar colisões. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/** Os bullets do TL;DR: é o melhor sinal para a imagem casar com o conteúdo. */
function firstBullets(markdown: string): string {
  const lines = markdown.split("\n");
  const bullets = lines
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .slice(0, 6)
    .map((l) => l.trim());
  return bullets.join("\n");
}
