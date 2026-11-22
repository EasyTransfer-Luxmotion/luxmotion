import { ConvexError, v } from "convex/values";
import { matchesSearch, pageArgs, pageOf } from "./lib/list";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin } from "./lib/admin";
import { urlDaImagem, vImagem } from "./lib/imagens";
import { guardarNaBiblioteca } from "./lib/bibliotecaFotos";

/*
 * Conteúdos → Fotos dos extras no dashboard (E3).
 *
 * As fotos dos extras vivem em quatro sítios: as paragens e as experiências do
 * checkout, os extras de todos os tours e eventos (universais) e os extras
 * próprios de um tour ou evento (tourAddons). A biblioteca antiga
 * (addonImages.*) só olhava para o último — em produção restam lá 4 extras —
 * e por isso dizia "sem uso" de quase todas as 79 fotos que o site mostra, e
 * apagar uma levava o ficheiro de paragens e experiências que a usavam.
 *
 * Regras:
 *  - Nunca se apaga o ficheiro. Tirar da biblioteca só tira a linha, e só de
 *    uma foto que nenhum extra usa. Os ficheiros são partilhados (a migração
 *    para o Bunny juntou cópias iguais) e um ficheiro a mais no Bunny custa
 *    nada; um a menos deixa um cartão sem imagem no site. Foi assim que se
 *    perderam duas fotos de veículos ao apagar uma experiência corporate.
 *  - Mudar a foto de um extra actualiza o updatedAt dele: quem o tiver aberto
 *    no editor recebe o aviso de conflito em vez de gravar por cima.
 */

type Tipo = "paragens" | "experiencias" | "universais" | "tours";
const vTipo = v.union(v.literal("paragens"), v.literal("experiencias"), v.literal("universais"), v.literal("tours"));
const TABELA = {
  paragens: "upsellStops",
  experiencias: "upsellExperiences",
  universais: "universalAddons",
  tours: "tourAddons",
} as const;

type Uso = {
  tipo: Tipo;
  id: string;
  titulo: string;
  /* Onde o cliente o vê: "Checkout", "Tours e eventos", ou o tour/evento. */
  onde: string;
  /* Para o link: o tour ou evento dono de um extra próprio. */
  dono: { tipo: "tour" | "evento"; id: string } | null;
  publicado: boolean;
};

async function lerExtras(ctx: QueryCtx) {
  const [paragens, experiencias, universais, tours] = await Promise.all([
    ctx.db.query("upsellStops").collect(),
    ctx.db.query("upsellExperiences").collect(),
    ctx.db.query("universalAddons").collect(),
    ctx.db.query("tourAddons").collect(),
  ]);

  /* O título do tour ou evento de cada extra próprio, lido uma vez por dono. */
  const donos = new Map<string, Doc<"tours"> | Doc<"events"> | null>();
  await Promise.all(
    tours.map(async (a) => {
      const id = (a.tourId ?? a.eventId) as Id<"tours"> | Id<"events"> | undefined;
      if (id && !donos.has(id)) donos.set(id, await ctx.db.get(id));
    }),
  );

  const usos: (Uso & { imageId: string | undefined })[] = [
    ...paragens.map((x) => ({
      tipo: "paragens" as const,
      id: x._id as string,
      titulo: x.title,
      onde: "Checkout dos transfers",
      dono: null,
      publicado: x.status === "published",
      imageId: x.imageId,
    })),
    ...experiencias.map((x) => ({
      tipo: "experiencias" as const,
      id: x._id as string,
      titulo: x.title,
      onde: "Checkout dos transfers",
      dono: null,
      publicado: x.status === "published",
      imageId: x.imageId,
    })),
    ...universais.map((x) => ({
      tipo: "universais" as const,
      id: x._id as string,
      titulo: x.title,
      onde: "Todos os tours e eventos do âmbito",
      dono: null,
      publicado: x.status === "published",
      imageId: x.imageId,
    })),
    ...tours.map((x) => {
      const donoId = (x.tourId ?? x.eventId) as string | undefined;
      const d = donoId ? donos.get(donoId) : null;
      return {
        tipo: "tours" as const,
        id: x._id as string,
        titulo: x.title,
        onde: d ? `${x.eventId ? "Evento" : "Tour"} · ${d.title}` : "Tour apagado",
        dono: donoId ? { tipo: x.eventId ? ("evento" as const) : ("tour" as const), id: donoId } : null,
        /* Um extra próprio vê-se se o dono estiver publicado. */
        publicado: Boolean(d && "status" in d && d.status === "published"),
        imageId: x.imageId,
      };
    }),
  ];
  return usos;
}

/* Every photo with the extras that use it, and the extras with no photo.
   `lista`, `page`, `photo` and `pick` share it. */
async function loadPhotos(ctx: QueryCtx) {
  const [biblioteca, extras] = await Promise.all([ctx.db.query("addonImages").collect(), lerExtras(ctx)]);

  type Foto = {
    caminho: string;
    url: string | null;
    nome: string;
    naBiblioteca: boolean;
    criadaEm: number;
    usos: Uso[];
  };
  const fotos = new Map<string, Foto>();
  for (const b of biblioteca) {
    fotos.set(b.storageId, { caminho: b.storageId, url: null, nome: b.label, naBiblioteca: true, criadaEm: b.createdAt, usos: [] });
  }
  const semFoto: Uso[] = [];
  for (const { imageId, ...u } of extras) {
    if (!imageId) {
      if (u.titulo.trim()) semFoto.push(u);
      continue;
    }
    const f = fotos.get(imageId) ?? { caminho: imageId, url: null, nome: u.titulo, naBiblioteca: false, criadaEm: 0, usos: [] };
    f.usos.push(u);
    fotos.set(imageId, f);
  }
  /* Uma foto herdada (sem linha na biblioteca) toma o nome do primeiro extra
     que a usa — é o melhor palpite, e muda-se ao renomear. */
  const lidas = await Promise.all(
    [...fotos.values()].map(async (f) => ({
      ...f,
      url: await urlDaImagem(ctx, f.caminho),
      usos: f.usos.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt")),
    })),
  );
  return {
    fotos: lidas.sort((a, b) => b.usos.length - a.usos.length || b.criadaEm - a.criadaEm || a.nome.localeCompare(b.nome, "pt")),
    semFoto: semFoto.sort((a, b) => Number(b.publicado) - Number(a.publicado) || a.titulo.localeCompare(b.titulo, "pt")),
  };
}

export const lista = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, ["fotosExtras", "extras", "tours", "eventos"], "ver");
    return loadPhotos(ctx);
  },
});

/* The photo library grid: filter, search and page come from the URL and are
   resolved here. "missing" is the tab of extras without a photo, which is a
   short list and comes whole. */
export const page = query({
  args: {
    filter: v.optional(v.union(v.literal("all"), v.literal("inUse"), v.literal("unused"), v.literal("missing"))),
    search: v.optional(v.string()),
    ...pageArgs,
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, ["fotosExtras", "extras", "tours", "eventos"], "ver");
    const { fotos, semFoto } = await loadPhotos(ctx);
    const filter = a.filter ?? "all";
    const matching = fotos
      .filter((f) => filter === "all" || filter === "missing" || (filter === "inUse" ? f.usos.length > 0 : f.usos.length === 0))
      .filter((f) => matchesSearch(a.search, [f.nome, ...f.usos.flatMap((u) => [u.titulo, u.onde])]));
    const pg = pageOf(filter === "missing" ? [] : matching, a);
    return {
      ...pg,
      counts: {
        all: fotos.length,
        inUse: fotos.filter((f) => f.usos.length > 0).length,
        unused: fotos.filter((f) => f.usos.length === 0).length,
        missing: semFoto.length,
      },
      missing: filter === "missing" ? semFoto : [],
    };
  },
});

/* One photo for the detail sheet, found by its storage path. */
export const photo = query({
  args: { path: v.string() },
  handler: async (ctx, { path }) => {
    await exigirAdmin(ctx, ["fotosExtras", "extras", "tours", "eventos"], "ver");
    const { fotos } = await loadPhotos(ctx);
    return fotos.find((f) => f.caminho === path) ?? null;
  },
});

/* The photo pickers: the search runs here and only the first `limit` matches
   come back, so a picker never downloads the whole library. */
export const pick = query({
  args: { search: v.optional(v.string()), exclude: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, ["fotosExtras", "extras", "tours", "eventos"], "ver");
    const { fotos } = await loadPhotos(ctx);
    const matching = fotos.filter((f) => f.url && f.caminho !== a.exclude && matchesSearch(a.search, [f.nome]));
    const limit = Math.min(Math.max(1, Math.floor(a.limit ?? 120)), 300);
    return {
      total: matching.length,
      rows: matching.slice(0, limit).map((f) => ({ caminho: f.caminho, nome: f.nome, url: f.url!, criadaEm: f.criadaEm })),
    };
  },
});

function limparNome(nome: string): string {
  const n = nome.trim().replace(/\s+/g, " ");
  if (!n) throw new ConvexError({ tipo: "invalido", mensagem: "O nome não pode ficar vazio.", erros: { nome: "Escreva um nome." } });
  if (n.length > 120) throw new ConvexError({ tipo: "invalido", mensagem: "Nome comprido de mais.", erros: { nome: "No máximo 120 caracteres." } });
  return n;
}

async function linhaDe(ctx: QueryCtx, caminho: string) {
  return await ctx.db
    .query("addonImages")
    .withIndex("by_storage", (q) => q.eq("storageId", caminho))
    .first();
}

async function garantirNaBiblioteca(ctx: MutationCtx, caminho: string, nome: string) {
  const linha = await linhaDe(ctx, caminho);
  if (linha) return linha._id;
  return await ctx.db.insert("addonImages", { storageId: caminho, label: nome, createdAt: Date.now() });
}

/* Depois de um upload: a foto entra na biblioteca com o nome do ficheiro. */
export const registar = mutation({
  args: { caminho: vImagem, nome: v.string() },
  handler: async (ctx, { caminho, nome }) => {
    await exigirAdmin(ctx, ["fotosExtras", "extras", "tours", "eventos"]);
    /* Só caminhos do Bunny: um upload novo chega sempre como uploads/… */
    if (!caminho.startsWith("uploads/")) throw new ConvexError({ tipo: "invalido", mensagem: "Caminho de imagem inválido." });
    return await garantirNaBiblioteca(ctx, caminho, limparNome(nome));
  },
});

/* Renomear também regista uma foto herdada, que ainda não tem linha. */
export const renomear = mutation({
  args: { caminho: vImagem, nome: v.string() },
  handler: async (ctx, { caminho, nome }) => {
    await exigirAdmin(ctx, ["fotosExtras", "extras", "tours", "eventos"]);
    const n = limparNome(nome);
    const linha = await linhaDe(ctx, caminho);
    if (linha) await ctx.db.patch(linha._id, { label: n });
    else await ctx.db.insert("addonImages", { storageId: caminho, label: n, createdAt: Date.now() });
    return { nome: n };
  },
});

const vRef = v.object({ tipo: vTipo, id: v.string() });

async function mudarFoto(ctx: MutationCtx, ref: { tipo: Tipo; id: string }, caminho: string | undefined) {
  const id = ctx.db.normalizeId(TABELA[ref.tipo], ref.id);
  if (!id) throw new ConvexError({ tipo: "naoExiste", mensagem: "Um dos extras já não existe. Recarregue a página." });
  const doc = await ctx.db.get(id);
  if (!doc) throw new ConvexError({ tipo: "naoExiste", mensagem: "Um dos extras já não existe. Recarregue a página." });
  if (doc.imageId === caminho) return;
  await guardarNaBiblioteca(ctx, doc.imageId, doc.title);
  const updatedAt = Math.max(Date.now(), (doc.updatedAt ?? 0) + 1);
  await ctx.db.patch(id, { imageId: caminho, updatedAt });
}

/* Dá a mesma foto a vários extras de uma vez (os extras sem foto). */
export const atribuir = mutation({
  args: { caminho: vImagem, extras: v.array(vRef), nome: v.optional(v.string()) },
  handler: async (ctx, { caminho, extras, nome }) => {
    await exigirAdmin(ctx, ["fotosExtras", "extras", "tours", "eventos"]);
    if (extras.length === 0) return { atribuidos: 0 };
    for (const ref of extras) await mudarFoto(ctx, ref, caminho);
    await garantirNaBiblioteca(ctx, caminho, nome?.trim() || "Sem nome");
    return { atribuidos: extras.length };
  },
});

/*
 * Troca uma foto por outra em todos os extras que a usam — para substituir
 * uma fotografia má sem abrir os extras um a um. A antiga fica na biblioteca
 * (e o ficheiro no Bunny); tira-se depois, se se quiser.
 */
export const trocar = mutation({
  args: { de: vImagem, para: vImagem },
  handler: async (ctx, { de, para }) => {
    await exigirAdmin(ctx, ["fotosExtras", "extras", "tours", "eventos"]);
    if (de === para) return { trocados: 0 };
    const todos = await lerExtras(ctx);
    const extras = todos.filter((x) => x.imageId === de);
    /* A foto nova fica com o nome que já tinha: o da biblioteca, ou o do
       extra que já a usa. Dar-lhe o nome da antiga trocava os nomes às duas
       (apanhado no teste: a foto do Cabo da Roca ficou "Aveiro"). */
    const jaUsaPara = todos.find((x) => x.imageId === para);
    await garantirNaBiblioteca(ctx, para, jaUsaPara?.titulo ?? "Sem nome");
    for (const x of extras) await mudarFoto(ctx, x, para);
    return { trocados: extras.length };
  },
});

/* Tira um extra da foto (fica sem foto). */
export const tirarDoExtra = mutation({
  args: { extra: vRef },
  handler: async (ctx, { extra }) => {
    await exigirAdmin(ctx, ["fotosExtras", "extras", "tours", "eventos"]);
    await mudarFoto(ctx, extra, undefined);
  },
});

/*
 * Tira a foto da biblioteca. Só se nenhum extra a usar — senão o selector
 * deixava de a oferecer mas o site continuava a mostrá-la, e ninguém
 * percebia de onde vinha. O ficheiro fica no Bunny (ver em cima).
 */
export const tirarDaBiblioteca = mutation({
  args: { caminho: vImagem },
  handler: async (ctx, { caminho }) => {
    await exigirAdmin(ctx, ["fotosExtras", "extras", "tours", "eventos"], "editar", "apagar");
    const usos = (await lerExtras(ctx)).filter((x) => x.imageId === caminho).length;
    if (usos > 0) {
      throw new ConvexError({
        tipo: "impedido",
        mensagem: `Ainda está em ${usos === 1 ? "1 extra" : `${usos} extras`}. Troque-a ou tire-a desses extras primeiro.`,
      });
    }
    const linha = await linhaDe(ctx, caminho);
    if (linha) await ctx.db.delete(linha._id);
    return { tirada: Boolean(linha) };
  },
});
