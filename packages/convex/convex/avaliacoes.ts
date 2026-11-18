import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin } from "./lib/admin";
import { updateEventRating, updateTourRating } from "./tourReviews";

/*
 * Conteúdos → Avaliações no dashboard (E4): as avaliações dos tours e
 * eventos (tourReviews). Entram pelo formulário do site por aprovar; só as
 * aprovadas aparecem na página do tour ou evento e contam para a nota dele.
 * As que estão em destaque vão para os testemunhos (homepage, Hotéis, marca
 * branca) quando as do Google não chegam.
 *
 * O site continua a ler pelas funções de tourReviews.ts. Aprovar, recusar,
 * editar e apagar recalculam a nota do tour ou evento, como as antigas
 * (updateTourRating / updateEventRating).
 *
 * Em produção, a 2026-11-15: 666, todas aprovadas, nenhuma em destaque; 615
 * entraram no mesmo dia (2026-09-08), de uma vez.
 */

type Grupo = "porAprovar" | "aprovadas" | "destaque" | "todas";

const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const grupoDe = (r: Doc<"tourReviews">): Exclude<Grupo, "todas" | "destaque"> => (r.isApproved ? "aprovadas" : "porAprovar");

export const lista = query({
  args: {
    grupo: v.union(v.literal("porAprovar"), v.literal("aprovadas"), v.literal("destaque"), v.literal("todas")),
    produto: v.union(v.literal("todos"), v.literal("tours"), v.literal("eventos")),
    nota: v.number(),
    pesquisa: v.optional(v.string()),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "avaliacoes", "ver");
    /* As avaliações lêem-se todas (666 em produção, 300 KB): são precisas
       para as contagens. Os tours e eventos não: eram mais 680 KB a cada
       abertura, só pelos títulos. Agora só os desta página — ou todos quando
       se pesquisa, porque a pesquisa também procura no título do produto. */
    const q = semAcentos(a.pesquisa?.trim() ?? "");
    const todas = await ctx.db.query("tourReviews").collect();
    const tourPor = new Map<string, Doc<"tours"> | null>();
    const eventoPor = new Map<string, Doc<"events"> | null>();
    if (q) {
      const [tours, eventos] = await Promise.all([ctx.db.query("tours").collect(), ctx.db.query("events").collect()]);
      for (const t of tours) tourPor.set(t._id, t);
      for (const e of eventos) eventoPor.set(e._id, e);
    }
    const lerProdutos = async (rs: Doc<"tourReviews">[]) => {
      const tours = [...new Set(rs.flatMap((r) => (r.tourId && !tourPor.has(r.tourId) ? [r.tourId] : [])))];
      const eventos = [...new Set(rs.flatMap((r) => (!r.tourId && r.eventId && !eventoPor.has(r.eventId) ? [r.eventId] : [])))];
      await Promise.all([
        ...tours.map(async (id) => tourPor.set(id, await ctx.db.get(id))),
        ...eventos.map(async (id) => eventoPor.set(id, await ctx.db.get(id))),
      ]);
    };
    const produtoDe = (r: Doc<"tourReviews">) => {
      if (r.tourId) {
        const t = tourPor.get(r.tourId);
        return { tipo: "tour" as const, titulo: t?.title ?? "Tour apagado", publicado: t?.status === "published" };
      }
      const e = r.eventId ? eventoPor.get(r.eventId) : undefined;
      return { tipo: "evento" as const, titulo: e?.title ?? "Evento apagado", publicado: e?.status === "published" };
    };

    const doProduto = todas.filter((r) => a.produto === "todos" || (a.produto === "tours" ? Boolean(r.tourId) : Boolean(r.eventId)));
    const daNota = doProduto.filter((r) => !a.nota || r.rating === a.nota);
    const porGrupo = {
      porAprovar: daNota.filter((r) => !r.isApproved).length,
      aprovadas: daNota.filter((r) => r.isApproved).length,
      destaque: daNota.filter((r) => r.isApproved && r.isFeatured).length,
      todas: daNota.length,
    };
    const porNota = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, doProduto.filter((r) => r.rating === n).length]));

    /* Com pesquisa os produtos já estão todos lidos; sem ela, o título não
       entra no filtro e só se lê o da página. */
    const filtradas = daNota
      .filter((r) => a.grupo === "todas" || (a.grupo === "destaque" ? r.isApproved && r.isFeatured : grupoDe(r) === a.grupo))
      .filter((r) => !q || [r.author, r.text, r.nationality, produtoDe(r).titulo].some((c) => c && semAcentos(c).includes(q)))
      .sort((x, y) => y.createdAt - x.createdAt);

    const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
    const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
    const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
    const daPagina = filtradas.slice(pagina * porPagina, (pagina + 1) * porPagina);
    await lerProdutos(daPagina);
    return {
      linhas: daPagina.map((r) => ({ r, p: produtoDe(r) })).map(({ r, p }) => ({
        id: r._id as string,
        autor: r.author,
        nacionalidade: r.nationality ?? "",
        nota: r.rating,
        texto: r.text,
        aprovada: r.isApproved,
        destaque: Boolean(r.isFeatured),
        data: r.createdAt,
        produto: p,
      })),
      total: filtradas.length,
      pagina,
      paginas,
      porPagina,
      porGrupo,
      porNota,
    };
  },
});

async function recalcular(ctx: MutationCtx, r: Doc<"tourReviews">) {
  if (r.tourId) await updateTourRating(ctx, r.tourId);
  if (r.eventId) await updateEventRating(ctx, r.eventId);
}

async function ler(ctx: MutationCtx, id: Id<"tourReviews">) {
  const r = await ctx.db.get(id);
  if (!r) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta avaliação já não existe." });
  return r;
}

export const aprovar = mutation({
  args: { id: v.id("tourReviews"), aprovada: v.boolean() },
  handler: async (ctx, { id, aprovada }) => {
    await exigirAdmin(ctx, "avaliacoes");
    const r = await ler(ctx, id);
    /* Deixar de estar aprovada tira-a também do destaque: os testemunhos só
       mostram aprovadas, e ficava um destaque escondido. */
    await ctx.db.patch(id, aprovada ? { isApproved: true } : { isApproved: false, isFeatured: false });
    await recalcular(ctx, r);
  },
});

export const destacar = mutation({
  args: { id: v.id("tourReviews"), destaque: v.boolean() },
  handler: async (ctx, { id, destaque }) => {
    await exigirAdmin(ctx, "avaliacoes");
    const r = await ler(ctx, id);
    if (destaque && !r.isApproved) throw new ConvexError({ tipo: "invalido", mensagem: "Aprove a avaliação antes de a pôr em destaque." });
    await ctx.db.patch(id, { isFeatured: destaque });
  },
});

export const guardar = mutation({
  args: {
    id: v.id("tourReviews"),
    dados: v.object({ autor: v.string(), nacionalidade: v.string(), nota: v.number(), texto: v.string(), data: v.number() }),
  },
  handler: async (ctx, { id, dados }) => {
    await exigirAdmin(ctx, "avaliacoes");
    const r = await ler(ctx, id);
    const erros: Record<string, string> = {};
    if (!dados.autor.trim()) erros.autor = "Escreva o nome de quem avaliou.";
    else if (dados.autor.trim().length > 80) erros.autor = "No máximo 80 caracteres.";
    if (dados.nacionalidade.trim().length > 60) erros.nacionalidade = "No máximo 60 caracteres.";
    if (!Number.isInteger(dados.nota) || dados.nota < 1 || dados.nota > 5) erros.nota = "De 1 a 5 estrelas.";
    if (!dados.texto.trim()) erros.texto = "A avaliação não pode ficar sem texto.";
    else if (dados.texto.length > 4000) erros.texto = "No máximo 4000 caracteres.";
    /* Uma data no futuro ordena-se à frente de tudo e lê-se mal no site. */
    if (!Number.isFinite(dados.data) || dados.data <= 0) erros.data = "Data inválida.";
    else if (dados.data > Date.now() + 86_400_000) erros.data = "A data não pode ser no futuro.";
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    await ctx.db.patch(id, {
      author: dados.autor.trim(),
      nationality: dados.nacionalidade.trim() || undefined,
      rating: dados.nota,
      text: dados.texto.trim(),
      createdAt: dados.data,
    });
    if (r.isApproved && r.rating !== dados.nota) await recalcular(ctx, r);
  },
});

export const remover = mutation({
  args: { id: v.id("tourReviews") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "avaliacoes");
    const r = await ctx.db.get(id);
    if (!r) return;
    await ctx.db.delete(id);
    if (r.isApproved) await recalcular(ctx, r);
  },
});

/* Uma avaliação para a folha lateral: continua actual depois de sair da
   página da lista (aprovada a partir de "por aprovar", por exemplo). */
export const uma = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "avaliacoes", "ver");
    const nid = ctx.db.normalizeId("tourReviews", id);
    const r = nid ? await ctx.db.get(nid) : null;
    if (!r) return null;
    const t = r.tourId ? await ctx.db.get(r.tourId) : null;
    const e = !r.tourId && r.eventId ? await ctx.db.get(r.eventId) : null;
    return {
      id: r._id as string,
      autor: r.author,
      nacionalidade: r.nationality ?? "",
      nota: r.rating,
      texto: r.text,
      aprovada: r.isApproved,
      destaque: Boolean(r.isFeatured),
      data: r.createdAt,
      produto: r.tourId
        ? { tipo: "tour" as const, titulo: t?.title ?? "Tour apagado", publicado: t?.status === "published" }
        : { tipo: "evento" as const, titulo: e?.title ?? "Evento apagado", publicado: e?.status === "published" },
    };
  },
});
