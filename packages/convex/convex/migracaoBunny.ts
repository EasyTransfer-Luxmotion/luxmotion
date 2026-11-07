import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { estaNoBunny } from "./lib/imagens";
import { TABELAS } from "./lib/tabelasImagens";

/*
 * Dados da migração para o Bunny. A action que move os ficheiros está em
 * `imagensBunny.ts` (precisa do runtime de Node); aqui ficam as leituras e as
 * escritas, que têm de correr no runtime normal.
 */


/**
 * Nomes dos campos que guardam imagens, a qualquer profundidade.
 *
 * Procura-se pelo nome e não pelo caminho porque os tours têm imagens três
 * níveis abaixo (`itineraryDays[].stops[].imageId`), e uma lista de caminhos
 * fixos esquecer-se-ia delas no dia em que alguém acrescentasse outro nível.
 */
const CAMPOS_DE_IMAGEM = new Set([
  "imageId",
  "logoId",
  "heroImageId",
  "editorialImageId",
  "authorAvatarId",
  "bannerImageId",
  "additionalBannerIds",
  "galleryImageIds",
  "coverImageId",
  "storageId",
]);

type Valor = unknown;

/** Percorre o documento e devolve os ids do Convex ainda por migrar. */
function referenciasAntigas(valor: Valor, chave?: string, acc = new Set<string>()): Set<string> {
  if (Array.isArray(valor)) {
    for (const item of valor) referenciasAntigas(item, chave, acc);
  } else if (valor && typeof valor === "object") {
    for (const [k, filho] of Object.entries(valor as Record<string, Valor>)) {
      if (k.startsWith("_")) continue;
      referenciasAntigas(filho, k, acc);
    }
  } else if (typeof valor === "string" && chave && CAMPOS_DE_IMAGEM.has(chave) && !estaNoBunny(valor)) {
    acc.add(valor);
  }
  return acc;
}

/** Devolve uma cópia com as referências trocadas segundo o mapa. */
function trocar(valor: Valor, mapa: Record<string, string>, chave?: string): Valor {
  if (Array.isArray(valor)) return valor.map((item) => trocar(item, mapa, chave));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, Valor>).map(([k, filho]) => [k, trocar(filho, mapa, k)]),
    );
  }
  if (typeof valor === "string" && chave && CAMPOS_DE_IMAGEM.has(chave) && mapa[valor]) {
    return mapa[valor];
  }
  return valor;
}

const vTabela = v.union(...TABELAS.map((t) => v.literal(t)));

export const listarPorMigrar = internalQuery({
  args: { tabela: vTabela, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { tabela, cursor }) => {
    const pagina = await ctx.db.query(tabela).paginate({ cursor, numItems: 100 });
    return {
      documentos: pagina.page
        .map((doc) => ({ id: doc._id as string, refs: [...referenciasAntigas(doc)] }))
        .filter((d) => d.refs.length > 0),
      isDone: pagina.isDone,
      continueCursor: pagina.continueCursor,
    };
  },
});

/**
 * Troca as referências de um documento. Relê-o aqui dentro em vez de confiar no
 * que a action leu: entre as duas coisas alguém pode ter editado o registo no
 * admin, e um patch com a cópia antiga desfazia essa edição.
 */
export const trocarReferencias = internalMutation({
  args: { tabela: vTabela, id: v.string(), mapa: v.record(v.string(), v.string()) },
  handler: async (ctx, { tabela, id, mapa }) => {
    const doc = await ctx.db.get(ctx.db.normalizeId(tabela, id)!);
    if (!doc) return 0;
    const alteracoes: Record<string, Valor> = {};
    for (const [k, valor] of Object.entries(doc)) {
      if (k.startsWith("_")) continue;
      const novo = trocar(valor, mapa, k);
      if (JSON.stringify(novo) !== JSON.stringify(valor)) alteracoes[k] = novo;
    }
    if (Object.keys(alteracoes).length === 0) return 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.db.patch(doc._id, alteracoes as any);
    return Object.keys(alteracoes).length;
  },
});

/** Quantas referências antigas restam, por tabela. Serve para medir antes e depois. */
export const contarPorMigrar = internalQuery({
  args: {},
  handler: async (ctx) => {
    const resultado: Record<string, { documentos: number; referencias: number }> = {};
    for (const tabela of TABELAS) {
      let documentos = 0;
      const refs = new Set<string>();
      for await (const doc of ctx.db.query(tabela)) {
        const r = referenciasAntigas(doc);
        if (r.size) documentos++;
        r.forEach((x) => refs.add(x));
      }
      resultado[tabela] = { documentos, referencias: refs.size };
    }
    return resultado;
  },
});
