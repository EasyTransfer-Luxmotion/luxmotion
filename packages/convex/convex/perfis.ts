import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin } from "./lib/admin";
import { urlDaImagem } from "./lib/imagens";

/*
 * Conteúdos → Equipa e Motoristas no dashboard (E4): os perfis públicos que o
 * site mostra (a equipa em Sobre nós, os motoristas na homepage e em Sobre
 * nós). Não é gestão de motoristas nem despacho.
 *
 * O site continua a ler pelo teamMembers.listPublished e
 * drivers.listPublished. O que muda em relação às funções antigas:
 *  - A ordem muda-se arrastando, e grava-se a lista inteira de uma vez. Antes
 *    era um número à mão em cada perfil, e dois perfis com o mesmo número
 *    (a equipa de produção tem dois "1") ficavam por uma ordem ao acaso.
 *  - Num motorista, o que o site mostra fica obrigatório. Com um campo vazio
 *    o site punha o texto de um motorista de exemplo (use-published-drivers):
 *    o Tiago Mendes, sem línguas gravadas, aparece com as do "João".
 *  - Conflito pelo updatedAt e erros por campo, em português.
 */

const vTipo = v.union(v.literal("equipa"), v.literal("motoristas"));
type Tipo = typeof vTipo.type;
const TABELA = { equipa: "teamMembers", motoristas: "drivers" } as const;
type Perfil = Doc<"teamMembers"> | Doc<"drivers">;

async function lerTodos(ctx: QueryCtx, tipo: Tipo): Promise<Perfil[]> {
  const docs = (await ctx.db.query(TABELA[tipo]).collect()) as Perfil[];
  /* A ordem gravada e, a empatar, a mais antiga primeiro: o mesmo que o site
     vê com sort((a, b) => a.order - b.order) sobre a tabela pela ordem de
     criação. */
  return docs.sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);
}

function idDe(ctx: QueryCtx, tipo: Tipo, id: string) {
  return tipo === "equipa" ? ctx.db.normalizeId("teamMembers", id) : ctx.db.normalizeId("drivers", id);
}

export const lista = query({
  args: { tipo: vTipo },
  handler: async (ctx, { tipo }) => {
    await exigirAdmin(ctx);
    const docs = await lerTodos(ctx, tipo);
    const linhas = await Promise.all(
      docs.map(async (d) => {
        const base = {
          id: d._id as string,
          versao: d.updatedAt,
          nome: d.name,
          publicado: d.status === "published",
          imagem: d.imageId ?? null,
          imagemUrl: await urlDaImagem(ctx, d.imageId),
        };
        if (tipo === "equipa") {
          const x = d as Doc<"teamMembers">;
          return { ...base, cargo: x.role, bio: x.bio ?? "" };
        }
        const x = d as Doc<"drivers">;
        return {
          ...base,
          zona: x.location,
          frase: x.quote,
          descricao: x.description ?? "",
          linguas: x.languages ?? "",
          viatura: x.vehicle ?? "",
          avaliacao: x.rating ?? "",
          viagens: x.rides ?? null,
        };
      }),
    );
    return {
      linhas,
      publicados: docs.filter((d) => d.status === "published").length,
      rascunhos: docs.filter((d) => d.status !== "published").length,
    };
  },
});

/* ─── Gravar ─────────────────────────────────────────────────────────── */

const vDados = v.object({
  nome: v.string(),
  publicado: v.boolean(),
  imagem: v.union(v.string(), v.null()),
  /* Equipa */
  cargo: v.optional(v.string()),
  bio: v.optional(v.string()),
  /* Motoristas */
  zona: v.optional(v.string()),
  frase: v.optional(v.string()),
  descricao: v.optional(v.string()),
  linguas: v.optional(v.string()),
  viatura: v.optional(v.string()),
  avaliacao: v.optional(v.string()),
  viagens: v.optional(v.union(v.number(), v.null())),
});
type Dados = typeof vDados.type;

function validar(tipo: Tipo, d: Dados): Record<string, string> {
  const erros: Record<string, string> = {};
  const t = (s: string | undefined) => (s ?? "").trim();
  const max = (campo: keyof Dados, n: number) => {
    if (t(d[campo] as string | undefined).length > n) erros[campo] = `No máximo ${n} caracteres.`;
  };
  if (!t(d.nome)) erros.nome = "Escreva o nome.";
  max("nome", 80);
  if (tipo === "equipa") {
    if (!t(d.cargo)) erros.cargo = "Escreva o cargo: aparece por cima do nome.";
    max("cargo", 80);
    max("bio", 1200);
    return erros;
  }
  /* Tudo o que o cartão do site mostra: vazio, o site punha o texto de um
     motorista de exemplo. */
  const obrigatorios: [keyof Dados, string][] = [
    ["zona", "Escreva a zona onde trabalha."],
    ["frase", "Escreva a frase em destaque."],
    ["descricao", "Escreva a apresentação."],
    ["linguas", "Escreva as línguas que fala."],
    ["viatura", "Escreva a viatura."],
  ];
  for (const [k, m] of obrigatorios) if (!t(d[k] as string | undefined)) erros[k] = m;
  max("zona", 60);
  max("frase", 200);
  max("descricao", 600);
  max("linguas", 120);
  max("viatura", 80);
  const a = t(d.avaliacao).replace(",", ".");
  if (!a) erros.avaliacao = "Escreva a avaliação (de 1 a 5).";
  else if (!/^\d(\.\d{1,2})?$/.test(a) || Number(a) < 1 || Number(a) > 5) erros.avaliacao = "Um número de 1 a 5, com até duas casas (ex.: 4,97).";
  if (d.viagens === null || d.viagens === undefined) erros.viagens = "Escreva quantas viagens fez.";
  else if (!Number.isInteger(d.viagens) || d.viagens < 0 || d.viagens > 1_000_000) erros.viagens = "Um número inteiro, 0 ou mais.";
  return erros;
}

function registo(tipo: Tipo, d: Dados) {
  const t = (s: string | undefined) => (s ?? "").trim();
  const comum = { name: t(d.nome), status: d.publicado ? ("published" as const) : ("draft" as const), imageId: d.imagem ?? undefined };
  if (tipo === "equipa") return { ...comum, role: t(d.cargo), bio: t(d.bio) || undefined };
  return {
    ...comum,
    location: t(d.zona),
    quote: t(d.frase),
    description: t(d.descricao),
    languages: t(d.linguas),
    vehicle: t(d.viatura),
    /* Grava-se com ponto, como estava: o site mostra-o tal e qual. */
    rating: t(d.avaliacao).replace(",", "."),
    rides: d.viagens ?? undefined,
  };
}

export const guardar = mutation({
  args: {
    tipo: vTipo,
    /* Sem id: um perfil novo, que entra no fim da lista. */
    id: v.optional(v.string()),
    versao: v.optional(v.number()),
    dados: vDados,
  },
  handler: async (ctx, { tipo, id, versao, dados }) => {
    await exigirAdmin(ctx);
    const erros = validar(tipo, dados);
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const agora = Date.now();
    if (!id) {
      const todos = await lerTodos(ctx, tipo);
      const order = (todos[todos.length - 1]?.order ?? 0) + 1;
      const novo = { ...registo(tipo, dados), order, createdAt: agora, updatedAt: agora };
      const nid = await ctx.db.insert(TABELA[tipo], novo as never);
      return { id: nid as string, versao: agora };
    }

    const nid = idDe(ctx, tipo, id);
    const doc = nid ? ((await ctx.db.get(nid)) as Perfil | null) : null;
    if (!nid || !doc) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este perfil já não existe." });
    if (versao !== undefined && doc.updatedAt !== versao) {
      throw new ConvexError({ tipo: "conflito", mensagem: "Alguém gravou este perfil depois de o abrir. Veja a versão actual antes de gravar por cima." });
    }
    const updatedAt = Math.max(agora, doc.updatedAt + 1);
    /* As imagens antigas não se apagam (lib/imagens.ts). */
    await ctx.db.patch(nid, { ...registo(tipo, dados), updatedAt } as never);
    return { id, versao: updatedAt };
  },
});

/* A ordem do site: a lista inteira, pela ordem nova. Um id que falte (alguém
   criou um perfil entretanto) fica no fim, pela ordem que tinha. */
export const ordenar = mutation({
  args: { tipo: vTipo, ids: v.array(v.string()) },
  handler: async (ctx, { tipo, ids }) => {
    await exigirAdmin(ctx);
    const todos = await lerTodos(ctx, tipo);
    const pos = new Map(ids.map((id, i) => [id, i]));
    const nova = [...todos].sort((a, b) => (pos.get(a._id) ?? 1e9) - (pos.get(b._id) ?? 1e9));
    await Promise.all(
      nova.map((d, i) => (d.order === i + 1 ? null : ctx.db.patch(d._id as Id<"teamMembers"> & Id<"drivers">, { order: i + 1 }))),
    );
  },
});

export const publicar = mutation({
  args: { tipo: vTipo, id: v.string(), publicado: v.boolean() },
  handler: async (ctx, { tipo, id, publicado }) => {
    await exigirAdmin(ctx);
    const nid = idDe(ctx, tipo, id);
    const doc = nid ? ((await ctx.db.get(nid)) as Perfil | null) : null;
    if (!nid || !doc) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este perfil já não existe." });
    /* Publicar um motorista incompleto punha os textos de exemplo no site. */
    if (publicado && tipo === "motoristas") {
      const x = doc as Doc<"drivers">;
      const erros = validar(tipo, {
        nome: x.name,
        publicado: true,
        imagem: x.imageId ?? null,
        zona: x.location,
        frase: x.quote,
        descricao: x.description,
        linguas: x.languages,
        viatura: x.vehicle,
        avaliacao: x.rating,
        viagens: x.rides ?? null,
      });
      if (Object.keys(erros).length) {
        throw new ConvexError({ tipo: "invalido", mensagem: "Falta preencher o perfil antes de o publicar.", erros });
      }
    }
    await ctx.db.patch(nid, { status: publicado ? "published" : "draft", updatedAt: Math.max(Date.now(), doc.updatedAt + 1) } as never);
  },
});

export const remover = mutation({
  args: { tipo: vTipo, id: v.string() },
  handler: async (ctx: MutationCtx, { tipo, id }) => {
    await exigirAdmin(ctx);
    const nid = idDe(ctx, tipo, id);
    /* A fotografia não se apaga: pode estar noutro registo (lib/imagens.ts). */
    if (nid && (await ctx.db.get(nid))) await ctx.db.delete(nid);
  },
});
