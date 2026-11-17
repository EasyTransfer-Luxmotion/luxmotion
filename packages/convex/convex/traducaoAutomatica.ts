import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { exigirAdmin } from "./lib/admin";
import { generateText } from "./lib/openai";

/*
 * Tradução automática para o back-office: recebe o texto original de um
 * tour ou evento (o que está no editor, mesmo por gravar) e devolve-o
 * traduzido. Não grava nada: o editor preenche o formulário do idioma e
 * quem traduz revê e carrega em "Gravar".
 *
 * A descrição é texto rico (um documento do editor). Só se traduzem os
 * pedaços de texto, pela ordem, e voltam a entrar nos mesmos sítios: os
 * títulos, listas, negritos, ligações e imagens ficam exactamente como no
 * original. Uma tradução com a estrutura desfeita seria pior do que nenhuma.
 */

const IDIOMAS: Record<string, string> = {
  pt: "European Portuguese (pt-PT, never Brazilian)",
  en: "English",
  es: "Spanish (Spain)",
  fr: "French (France)",
  de: "German",
  nl: "Dutch",
};

type No = { type?: string; text?: string; content?: No[]; [k: string]: unknown };

function recolher(no: No | null | undefined, saida: string[]) {
  if (!no || typeof no !== "object") return;
  if (no.type === "text" && typeof no.text === "string") saida.push(no.text);
  for (const filho of no.content ?? []) recolher(filho, saida);
}

function repor(no: No, novos: string[], i: { n: number }): No {
  const copia: No = { ...no };
  if (no.type === "text" && typeof no.text === "string") copia.text = novos[i.n++] ?? no.text;
  if (Array.isArray(no.content)) copia.content = no.content.map((f) => repor(f, novos, i));
  return copia;
}

const sistema = (de: string, para: string) => `You are the in-house translator of EasyTransfer Portugal, a premium private transfer, tour and event company in Portugal.
Translate the content of a tour or event page from ${IDIOMAS[de]} to ${IDIOMAS[para]}.

Rules:
- Natural, warm and polished tone for travellers; not literal, not marketing fluff added.
- Keep brand names (EasyTransfer, LuxMotion), numbers, prices, times, dates, URLs, emails and emojis exactly as they are.
- Place names: use the name travellers know in the target language when there is a common one (e.g. Lisboa → Lisbon in English), otherwise keep the original.
- "seoTitle" must stay under 60 characters and "seoDescription" under 160 characters.
- "segments" are consecutive pieces of one rich text document, split where the formatting changes. Translate each piece on its own so it still reads correctly when joined with its neighbours; keep leading and trailing spaces; never merge, split, drop or reorder pieces.
- Every array in the answer must have exactly the same number of items, in the same order, as in the input. Empty strings stay empty.

Answer with JSON only, with exactly the same keys and structure as the input JSON.`;

export const traduzir = action({
  args: {
    de: v.string(),
    para: v.string(),
    textos: v.record(v.string(), v.string()),
    listas: v.record(v.string(), v.array(v.string())),
    documento: v.optional(v.any()),
  },
  handler: async (ctx, a): Promise<{ textos: Record<string, string>; listas: Record<string, string[]>; documento: unknown | null }> => {
    await exigirAdmin(ctx);
    if (!IDIOMAS[a.de] || !IDIOMAS[a.para] || a.de === a.para) {
      throw new ConvexError({ tipo: "invalido", mensagem: "Idioma que não se traduz." });
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new ConvexError({ tipo: "invalido", mensagem: "A tradução automática não está ligada neste ambiente: falta a chave da OpenAI." });
    }

    const textos = Object.fromEntries(Object.entries(a.textos).filter(([, x]) => x.trim()));
    const listas: Record<string, string[]> = {};
    for (const [k, xs] of Object.entries(a.listas)) {
      const cheias = xs.filter((x) => x.trim());
      if (cheias.length) listas[k] = cheias;
    }
    const segments: string[] = [];
    recolher(a.documento as No, segments);
    if (!Object.keys(textos).length && !Object.keys(listas).length && !segments.some((x) => x.trim())) {
      throw new ConvexError({ tipo: "invalido", mensagem: "O original ainda não tem texto para traduzir." });
    }

    let resposta: { textos?: Record<string, unknown>; listas?: Record<string, unknown>; segments?: unknown };
    try {
      const out = await generateText({
        system: sistema(a.de, a.para),
        user: JSON.stringify({ textos, listas, segments }),
        json: true,
      });
      if (out.finishReason === "length") throw new Error("resposta truncada");
      resposta = JSON.parse(out.text);
    } catch (e) {
      console.error(`[traducaoAutomatica] ${a.de}→${a.para}: ${e instanceof Error ? e.message : String(e)}`);
      throw new ConvexError({ tipo: "rede", mensagem: "A OpenAI não respondeu como devia. Tente outra vez daqui a pouco." });
    }

    /* Só se aceita o que tem a forma pedida: uma lista com outro número de
       linhas ou um documento com outro número de pedaços não entra. */
    const t: Record<string, string> = {};
    for (const k of Object.keys(textos)) {
      const x = resposta.textos?.[k];
      if (typeof x === "string") t[k] = x.trim();
    }
    const l: Record<string, string[]> = {};
    for (const [k, xs] of Object.entries(listas)) {
      const ys = resposta.listas?.[k];
      if (Array.isArray(ys) && ys.length === xs.length && ys.every((y) => typeof y === "string")) l[k] = ys.map((y) => (y as string).trim());
    }
    let documento: unknown | null = null;
    const novos = resposta.segments;
    if (segments.length && Array.isArray(novos) && novos.length === segments.length && novos.every((y) => typeof y === "string")) {
      documento = repor(a.documento as No, novos as string[], { n: 0 });
    }
    const pedidos = Object.keys(textos).length + Object.keys(listas).length + (segments.length ? 1 : 0);
    const vieram = Object.keys(t).length + Object.keys(l).length + (documento ? 1 : 0);
    if (vieram === 0) {
      throw new ConvexError({ tipo: "rede", mensagem: "A tradução veio incompleta. Tente outra vez." });
    }
    if (vieram < pedidos) console.warn(`[traducaoAutomatica] ${a.de}→${a.para}: ${pedidos - vieram} campo(s) sem tradução válida`);
    return { textos: t, listas: l, documento };
  },
});
