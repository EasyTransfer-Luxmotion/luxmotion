import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import schema from "./schema";

/*
 * Troca de caminhos no Bunny por versões mais leves, em todas as tabelas.
 *
 * As fotos dos motoristas tinham entre 5 e 7 MB (PNG da câmara) e o site
 * mostra-as a 220 px: com o optimizador do Next desligado (quota do Vercel) e o
 * do Bunny também, o browser descarregava o original inteiro. Em 2026-11-09
 * havia 288 imagens acima de 1 MB.
 *
 * Os ficheiros novos são feitos fora do Convex (sharp, numa máquina) e enviados
 * com nome novo — a CDN guarda cada ficheiro 30 dias, e substituir com o mesmo
 * nome deixava o antigo à vista. Aqui só se trocam as referências. Os originais
 * ficam no Bunny, para se poder voltar atrás.
 *
 * `aplicar` com `{ mapa: { "<caminho antigo>": "<caminho novo>" }, executar }`.
 * A troca é por texto dentro de qualquer string, por isso apanha tanto o campo
 * com o caminho (`uploads/migrados/x.png`) como o URL completo dentro do texto
 * de um artigo. Percorre todas as tabelas do schema, não uma lista: uma
 * referência esquecida numa tabela nova ficava a apontar para o ficheiro pesado.
 */

const TABELAS = Object.keys(schema.tables);

function trocarTexto(valor: unknown, pares: [string, string][]): unknown {
  if (typeof valor === "string") {
    let s = valor;
    for (const [antigo, novo] of pares) if (s.includes(antigo)) s = s.split(antigo).join(novo);
    return s;
  }
  if (Array.isArray(valor)) return valor.map((item) => trocarTexto(item, pares));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor).map(([k, filho]) => [k, k.startsWith("_") ? filho : trocarTexto(filho, pares)]),
    );
  }
  return valor;
}

/** Uma página de documentos de uma tabela que referem algum dos caminhos. */
export const procurar = internalQuery({
  args: { tabela: v.string(), cursor: v.union(v.string(), v.null()), caminhos: v.array(v.string()) },
  handler: async (ctx, { tabela, cursor, caminhos }) => {
    const pagina = await ctx.db
      .query(tabela as never)
      .paginate({ cursor, numItems: 50 });
    const docs: { id: string; caminhos: string[] }[] = [];
    for (const doc of pagina.page as Record<string, unknown>[]) {
      const corpo = JSON.stringify(
        Object.fromEntries(Object.entries(doc).filter(([k]) => !k.startsWith("_"))),
      );
      const encontrados = caminhos.filter((c) => corpo.includes(c));
      if (encontrados.length) docs.push({ id: String(doc._id), caminhos: encontrados });
    }
    return { docs, continuar: pagina.isDone ? null : pagina.continueCursor };
  },
});

/* Relê o documento: se foi editado entretanto, troca-se só o que lá estiver. */
export const trocar = internalMutation({
  args: { tabela: v.string(), id: v.string(), mapa: v.record(v.string(), v.string()) },
  handler: async (ctx, { tabela, id, mapa }) => {
    const idNormal = ctx.db.normalizeId(tabela as never, id);
    const doc = idNormal ? ((await ctx.db.get(idNormal)) as Record<string, unknown> | null) : null;
    if (!doc) return false;
    const pares = Object.entries(mapa);
    const alteracoes: Record<string, unknown> = {};
    for (const [campo, valor] of Object.entries(doc)) {
      if (campo.startsWith("_")) continue;
      const novo = trocarTexto(valor, pares);
      if (JSON.stringify(novo) !== JSON.stringify(valor)) alteracoes[campo] = novo;
    }
    if (Object.keys(alteracoes).length === 0) return false;
    await ctx.db.patch(idNormal!, alteracoes as never);
    return true;
  },
});

export const aplicar = internalAction({
  args: { mapa: v.record(v.string(), v.string()), executar: v.boolean() },
  /* Tipo escrito à mão: a action chama funções do mesmo ficheiro, e sem ele o
     TypeScript entra em ciclo a inferir o `internal`. */
  handler: async (ctx, { mapa, executar }): Promise<unknown> => {
    const caminhos = Object.keys(mapa);
    const usados = new Set<string>();
    const porTabela: Record<string, number> = {};
    let alterados = 0;
    for (const tabela of TABELAS) {
      let cursor: string | null = null;
      do {
        const r: { docs: { id: string; caminhos: string[] }[]; continuar: string | null } =
          await ctx.runQuery(internal.recompressao.procurar, { tabela, cursor, caminhos });
        for (const d of r.docs) {
          d.caminhos.forEach((c) => usados.add(c));
          porTabela[tabela] = (porTabela[tabela] ?? 0) + 1;
          if (!executar) continue;
          const parte = Object.fromEntries(d.caminhos.map((c) => [c, mapa[c]!]));
          if (await ctx.runMutation(internal.recompressao.trocar, { tabela, id: d.id, mapa: parte })) alterados++;
        }
        cursor = r.continuar;
      } while (cursor);
    }
    return {
      documentosPorTabela: porTabela,
      alterados,
      caminhosReferidos: usados.size,
      caminhosSemReferencia: caminhos.filter((c) => !usados.has(c)),
    };
  },
});
