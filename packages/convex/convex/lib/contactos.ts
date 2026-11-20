/*
 * Encontrar ou criar o contacto (e a organização) de quem chega: um
 * formulário do site, uma reserva paga, uma candidatura. Chama-se na mesma
 * transação em que o cartão entra no funil (lib/funilEntrada.ts).
 *
 * O mesmo contacto encontra-se pelo email e, sem ele, pelo telefone
 * normalizado. A organização encontra-se pelo nome normalizado e só se cria
 * quando o formulário traz o nome da empresa. Nunca se juntam duas
 * organizações sozinhas: um nome parecido vai para os possíveis duplicados
 * (contactos.duplicados), e quem decide é a equipa.
 */

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export function normalizarEmail(email: string | undefined | null): string | undefined {
  const e = email?.trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
}

/* +351912345678. Sem indicativo e com 9 algarismos a começar por 2 ou 9,
   é português (como no dashboard: components/layout/telefone.tsx). */
export function normalizarTelefone(telefone: string | undefined | null): string | undefined {
  const t = telefone?.trim();
  if (!t) return undefined;
  let d = t.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (!d.startsWith("+")) d = /^[29]\d{8}$/.test(d) ? `+351${d}` : `+${d}`;
  d = `+${d.slice(1).replace(/\D/g, "")}`;
  return d.length >= 8 ? d : undefined;
}

/* «Hotel Avenida Palace, Lda.» e «hotel avenida palace» são a mesma. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:'"()&/-]/g, " ")
    .replace(/\b(lda|limitada|sa|unipessoal|s a|sociedade|ltd|llc|inc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Novo = {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  idioma?: string | null;
  empresa?: string | null;
  /* De onde veio (a tabela de origem), para «primeiraOrigem». */
  origem: string;
};

export async function ligarOrganizacao(ctx: MutationCtx, empresa: string, origem: string): Promise<Id<"organizacoes"> | null> {
  const nome = empresa.trim().replace(/\s+/g, " ");
  const chave = normalizarNome(nome);
  if (chave.length < 2) return null;
  const ja = await ctx.db
    .query("organizacoes")
    .withIndex("by_nome_normalizado", (q) => q.eq("nomeNormalizado", chave))
    .first();
  if (ja) return ja._id;
  const agora = Date.now();
  return await ctx.db.insert("organizacoes", {
    nome,
    nomeNormalizado: chave,
    etiquetas: [],
    primeiraOrigem: origem,
    criadoEm: agora,
    atualizadoEm: agora,
  });
}

export async function ligarContacto(ctx: MutationCtx, n: Novo): Promise<{ contactoId: Id<"contactos"> | null; organizacaoId: Id<"organizacoes"> | null }> {
  const email = normalizarEmail(n.email);
  const telefone = normalizarTelefone(n.telefone);
  const nome = n.nome?.trim().replace(/\s+/g, " ") || email?.split("@")[0] || "";
  const organizacaoId = n.empresa?.trim() ? await ligarOrganizacao(ctx, n.empresa, n.origem) : null;
  if (!email && !telefone) return { contactoId: null, organizacaoId };

  let contacto = email ? await ctx.db.query("contactos").withIndex("by_email", (q) => q.eq("email", email)).first() : null;
  if (!contacto && telefone) contacto = await ctx.db.query("contactos").withIndex("by_telefone", (q) => q.eq("telefone", telefone)).first();

  const agora = Date.now();
  if (contacto) {
    /* Completa o que faltava; nunca troca o que já lá está (pode ter sido
       corrigido à mão). */
    const falta: Record<string, unknown> = {};
    if (!contacto.email && email) falta.email = email;
    if (!contacto.telefone && telefone) falta.telefone = telefone;
    if (!contacto.idioma && n.idioma) falta.idioma = n.idioma;
    if (!contacto.organizacaoId && organizacaoId) falta.organizacaoId = organizacaoId;
    if (!contacto.nome && nome) falta.nome = nome;
    if (Object.keys(falta).length) await ctx.db.patch(contacto._id, { ...falta, atualizadoEm: agora });
    return { contactoId: contacto._id, organizacaoId: organizacaoId ?? contacto.organizacaoId ?? null };
  }
  const contactoId = await ctx.db.insert("contactos", {
    nome: nome || "Sem nome",
    email,
    telefone,
    idioma: n.idioma ?? undefined,
    etiquetas: [],
    organizacaoId: organizacaoId ?? undefined,
    primeiraOrigem: n.origem,
    criadoEm: agora,
    atualizadoEm: agora,
  });
  return { contactoId, organizacaoId };
}

/*
 * Os segmentos dos Contactos (as sub-abas Clientes · Parceiros ·
 * Motoristas). Não se guardam: saem do que está ligado a cada um — a
 * origem do primeiro registo, os cartões dos funis e a Carteira — para
 * nunca ficarem desencontrados do que aconteceu. Quem é criado à mão numa
 * sub-aba fica com primeiraOrigem «manual:<segmento>».
 */
export const RELACOES = ["clientes", "parceiros", "motoristas"] as const;
export type Relacao = (typeof RELACOES)[number];

export function eRelacao(x: string): x is Relacao {
  return (RELACOES as readonly string[]).includes(x);
}

export function relacaoDaOrigem(origem: string | undefined): Relacao | null {
  if (!origem || origem === "manual") return null;
  if (origem.startsWith("manual:")) {
    const r = origem.slice("manual:".length);
    return eRelacao(r) ? r : null;
  }
  if (origem === "driverApplications") return "motoristas";
  if (origem === "partnerLeads" || origem === "partnerApplications") return "parceiros";
  /* As reservas e os seis formulários de pedido. */
  return "clientes";
}
