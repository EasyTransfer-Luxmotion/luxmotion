import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { enviarParaBunny, EXTENSAO_POR_TIPO, urlCdn } from "./lib/bunny";

/*
 * As imagens que vivem DENTRO do texto: as que se inserem no editor de um
 * artigo ficam no HTML/JSON do `content` como URL absoluto do storage do Convex
 * (`https://clean-starling-300.convex.cloud/api/storage/<uuid>`). A migração por
 * campos (`migracaoBunny.ts`) procura ids em campos com nome de imagem e não as
 * vê — em 2026-11-09 ainda havia 12 nos artigos publicados, servidas pelo Convex.
 *
 * Enquanto lá estiverem, os originais não se podem apagar do storage do Convex.
 *
 * Para correr: `migracaoTextoBunny:migrar` com `{ executar: false }` lista o que
 * mudaria; com `{ executar: true }` copia e troca. É idempotente: o caminho no
 * Bunny é derivado do uuid, e uma segunda corrida já não encontra URLs do Convex.
 */

const TABELAS = ["blogs", "blogTranslations", "partnerships"] as const;
type Tabela = (typeof TABELAS)[number];
type Encontrado = { tabela: Tabela; id: string; titulo: string; urls: string[] };

/* Qualquer anfitrião: além do `*.convex.cloud`, o site esteve servido por
   `convex.easytransferportugal.com`, e o editor gravou o que o browser via. */
const URL_DO_STORAGE = /https:\/\/[A-Za-z0-9.-]+\/api\/storage\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

function urlsNoTexto(valor: unknown, acc = new Set<string>()): Set<string> {
  if (typeof valor === "string") {
    for (const m of valor.match(URL_DO_STORAGE) ?? []) acc.add(m);
  } else if (Array.isArray(valor)) {
    for (const item of valor) urlsNoTexto(item, acc);
  } else if (valor && typeof valor === "object") {
    for (const [k, filho] of Object.entries(valor)) {
      if (!k.startsWith("_")) urlsNoTexto(filho, acc);
    }
  }
  return acc;
}

function trocarNoTexto(valor: unknown, mapa: Record<string, string>): unknown {
  if (typeof valor === "string") {
    return valor.replace(URL_DO_STORAGE, (url) => mapa[url] ?? url);
  }
  if (Array.isArray(valor)) return valor.map((item) => trocarNoTexto(item, mapa));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor).map(([k, filho]) => [k, k.startsWith("_") ? filho : trocarNoTexto(filho, mapa)]),
    );
  }
  return valor;
}

/** Documentos com URLs do storage do Convex em qualquer campo de texto. */
export const listar = internalQuery({
  args: {},
  handler: async (ctx): Promise<Encontrado[]> => {
    const encontrados: Encontrado[] = [];
    for (const tabela of TABELAS) {
      for await (const doc of ctx.db.query(tabela)) {
        const urls = [...urlsNoTexto(doc)];
        if (urls.length === 0) continue;
        const titulo = String((doc as Record<string, unknown>).title ?? (doc as Record<string, unknown>).name ?? "");
        encontrados.push({ tabela, id: doc._id, titulo, urls });
      }
    }
    return encontrados;
  },
});

/* Relê o documento na própria mutation: se alguém o editou entre a leitura e a
   escrita, troca-se só o que ainda lá estiver, sem repor o texto antigo. */
export const trocar = internalMutation({
  args: {
    tabela: v.union(...TABELAS.map((t) => v.literal(t))),
    id: v.string(),
    mapa: v.record(v.string(), v.string()),
  },
  handler: async (ctx, { tabela, id, mapa }) => {
    const idNormal = ctx.db.normalizeId(tabela, id);
    const doc = idNormal ? await ctx.db.get(idNormal) : null;
    if (!doc) return false;
    const alteracoes: Record<string, unknown> = {};
    for (const [campo, valor] of Object.entries(doc)) {
      if (campo.startsWith("_")) continue;
      const novo = trocarNoTexto(valor, mapa);
      if (JSON.stringify(novo) !== JSON.stringify(valor)) alteracoes[campo] = novo;
    }
    if (Object.keys(alteracoes).length === 0) return false;
    await ctx.db.patch(idNormal!, alteracoes as never);
    return true;
  },
});

export const migrar = internalAction({
  args: { executar: v.boolean() },
  /* Tipos escritos à mão: a action chama uma query do mesmo ficheiro, e sem
     eles o TypeScript entra em ciclo a inferir o `internal`. */
  handler: async (ctx, { executar }): Promise<unknown> => {
    const docs: Encontrado[] = await ctx.runQuery(internal.migracaoTextoBunny.listar, {});
    const unicos = [...new Set(docs.flatMap((d) => d.urls))];
    if (!executar) return { documentos: docs, urls: unicos.length };

    const mapa: Record<string, string> = {};
    const falhas: { url: string; motivo: string }[] = [];
    for (const url of unicos) {
      const r = await fetch(url);
      if (!r.ok) {
        // Já estava partida antes: fica como está, para se ver e decidir à mão.
        falhas.push({ url, motivo: `HTTP ${r.status}` });
        continue;
      }
      const blob = await r.blob();
      const tipo = (blob.type.split(";")[0] ?? "").trim().toLowerCase();
      const extensao = EXTENSAO_POR_TIPO[tipo];
      if (!extensao) {
        falhas.push({ url, motivo: `tipo ${tipo || "desconhecido"}` });
        continue;
      }
      const uuid = url.slice(url.lastIndexOf("/") + 1);
      const caminho = `uploads/migrados/texto/${uuid}.${extensao}`;
      await enviarParaBunny(caminho, blob);
      const publico = urlCdn(caminho);
      if (!publico) throw new Error("BUNNY_CDN_URL por definir neste deployment.");
      mapa[url] = publico;
    }

    let alterados = 0;
    for (const d of docs) {
      const parte = Object.fromEntries(d.urls.filter((u) => mapa[u]).map((u) => [u, mapa[u]!]));
      if (Object.keys(parte).length === 0) continue;
      if (await ctx.runMutation(internal.migracaoTextoBunny.trocar, { tabela: d.tabela, id: d.id, mapa: parte })) {
        alterados++;
      }
    }
    return { urls: unicos.length, copiadas: Object.keys(mapa).length, documentosAlterados: alterados, falhas };
  },
});
