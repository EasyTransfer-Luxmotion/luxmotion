import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { exigirAdmin, lerAcesso } from "./lib/admin";
import { RELACOES, ligarContacto, ligarOrganizacao, normalizarEmail, normalizarNome, normalizarTelefone, relacaoDaOrigem, type Relacao } from "./lib/contactos";
import { FUNIS, segmentoDaOrigem, type ChaveFunil } from "./lib/funis";

/*
 * Contactos (organizações e pessoas, em Clientes · Parceiros · Motoristas) e Parceiros → Carteira (as
 * organizações com uma parceria ganha). A base do CRM: cada cartão do
 * quadro e cada reserva ligam-se a um contacto e, havendo, a uma
 * organização (lib/contactos.ts).
 *
 * «Responsável» é um campo (quem trata); quem vê é decidido pelas
 * permissões do cargo: «contactos» para organizações e pessoas, «parcerias»
 * para a Carteira.
 */

const vTipo = v.union(v.literal("organizacoes"), v.literal("contactos"));
const vRelacao = v.union(...RELACOES.map((r) => v.literal(r)));
const vEstadoCarteira = v.union(v.literal("ativacao"), v.literal("ativa"), v.literal("semAtividade"), v.literal("suspensa"), v.literal("terminada"));

function semAcentos(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* O que se diz de cada cartão ligado: o funil, a etapa, se está fechado. */
async function cartoesDe(ctx: QueryCtx, filtro: { contactoId?: Id<"contactos">; organizacaoId?: Id<"organizacoes"> }) {
  const negs = filtro.contactoId
    ? await ctx.db.query("negocios").withIndex("by_contacto", (q) => q.eq("contactoId", filtro.contactoId)).collect()
    : await ctx.db.query("negocios").withIndex("by_organizacao", (q) => q.eq("organizacaoId", filtro.organizacaoId)).collect();
  const funis = new Map<string, Doc<"funis">>();
  const linhas = [];
  for (const n of negs) {
    let f = funis.get(n.funilId);
    if (!f) {
      f = (await ctx.db.get(n.funilId)) ?? undefined;
      if (f) funis.set(n.funilId, f);
    }
    const etapa = f?.etapas.find((e) => e.id === n.etapaId);
    linhas.push({
      id: n._id,
      titulo: n.titulo,
      funil: f ? FUNIS[f.chave as ChaveFunil]?.titulo ?? f.chave : "",
      chave: (f?.chave ?? null) as ChaveFunil | null,
      etapa: etapa?.nome ?? "",
      cor: etapa?.cor ?? "#64748b",
      tipo: etapa?.tipo ?? "aberta",
      origem: n.origem,
      origemId: n.origemId ?? null,
      criadoEm: n.criadoEm,
    });
  }
  return linhas.sort((a, b) => b.criadoEm - a.criadoEm);
}

async function reservasDe(ctx: QueryCtx, filtro: { contactoId?: Id<"contactos">; organizacaoId?: Id<"organizacoes"> }) {
  const os = filtro.contactoId
    ? await ctx.db.query("orders").withIndex("by_contacto", (q) => q.eq("contactoId", filtro.contactoId)).collect()
    : await ctx.db.query("orders").withIndex("by_organizacao", (q) => q.eq("organizacaoId", filtro.organizacaoId)).collect();
  return os
    .map((o) => ({ id: o._id, numero: o.orderNumber ?? null, estado: o.status, viagem: o.departureDate ? String(o.departureDate) : null, total: o.totalAmount ?? null }))
    .sort((a, b) => (b.viagem ?? "").localeCompare(a.viagem ?? ""));
}

/* ─── Listas ──────────────────────────────────────────────────────────── */

/*
 * Os segmentos de cada contacto e de cada organização (lib/contactos.ts,
 * RELACOES): a origem do primeiro registo, os cartões dos funis
 * (Transfers e Pedidos Parceiros fazem cliente; Parcerias faz parceiro ou,
 * vindo de uma candidatura de motorista, motorista) e a Carteira. Uma
 * pessoa de uma organização parceira é parceira; uma organização é tudo o
 * que as suas pessoas são. Sem nada ligado, é cliente.
 */
async function segmentos(ctx: QueryCtx, contactos: Doc<"contactos">[], orgs: Doc<"organizacoes">[]) {
  const proprios = new Map<string, Set<Relacao>>();
  const juntar = (id: string | undefined, r: Relacao | null) => {
    if (!id || !r) return;
    const s = proprios.get(id) ?? new Set<Relacao>();
    s.add(r);
    proprios.set(id, s);
  };
  const chaves = new Map((await ctx.db.query("funis").collect()).map((f) => [f._id as string, f.chave]));
  for (const n of await ctx.db.query("negocios").collect()) {
    const chave = chaves.get(n.funilId);
    const r: Relacao | null = chave === "parcerias" ? (relacaoDaOrigem(n.origem) === "motoristas" ? "motoristas" : "parceiros") : chave ? "clientes" : null;
    juntar(n.contactoId, r);
    juntar(n.organizacaoId, r);
  }
  for (const c of contactos) juntar(c._id, relacaoDaOrigem(c.primeiraOrigem));
  for (const o of orgs) {
    juntar(o._id, relacaoDaOrigem(o.primeiraOrigem));
    if (o.carteira) juntar(o._id, "parceiros");
  }
  const deOrg = new Map<string, Set<Relacao>>();
  for (const o of orgs) deOrg.set(o._id, new Set(proprios.get(o._id) ?? []));
  for (const c of contactos) {
    if (c.organizacaoId) for (const r of proprios.get(c._id) ?? []) deOrg.get(c.organizacaoId)?.add(r);
  }
  const final = new Map<string, Relacao[]>();
  for (const c of contactos) {
    const s = new Set(proprios.get(c._id) ?? []);
    if (c.organizacaoId && deOrg.get(c.organizacaoId)?.has("parceiros")) s.add("parceiros");
    final.set(c._id, s.size ? [...s] : ["clientes"]);
  }
  for (const o of orgs) {
    const s = deOrg.get(o._id)!;
    final.set(o._id, s.size ? [...s] : ["clientes"]);
  }
  return final;
}

export const lista = query({
  args: { tipo: vTipo, pesquisa: v.optional(v.string()), relacao: v.optional(vRelacao) },
  handler: async (ctx, { tipo, pesquisa, relacao }) => {
    await exigirAdmin(ctx, "contactos", "ver");
    const q = semAcentos(pesquisa?.trim() ?? "");
    const todosOrgs = await ctx.db.query("organizacoes").collect();
    const todosContactos = await ctx.db.query("contactos").collect();
    const rel = await segmentos(ctx, todosContactos, todosOrgs);
    const doSegmento = (id: string) => !relacao || (rel.get(id) ?? ["clientes"]).includes(relacao);
    if (tipo === "organizacoes") {
      const orgs = todosOrgs;
      const nomes = new Map(orgs.map((o) => [o._id as string, o.nome]));
      const pessoas = new Map<string, number>();
      for (const c of todosContactos) {
        if (c.organizacaoId) pessoas.set(c.organizacaoId, (pessoas.get(c.organizacaoId) ?? 0) + 1);
      }
      const estabelecimentos = new Map<string, number>();
      for (const o of orgs) if (o.grupoId) estabelecimentos.set(o.grupoId, (estabelecimentos.get(o.grupoId) ?? 0) + 1);
      return {
        tipo,
        linhas: orgs
          .filter((o) => doSegmento(o._id))
          .filter((o) => !q || semAcentos([o.nome, o.email, o.telefone, o.localidade, o.nif, ...o.etiquetas].filter(Boolean).join(" ")).includes(q))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
          .map((o) => ({
            id: o._id as string,
            nome: o.nome,
            subtitulo: o.grupoId ? `Estabelecimento de ${nomes.get(o.grupoId) ?? "?"}` : (o.localidade ?? null),
            email: o.email ?? null,
            telefone: o.telefone ?? null,
            segmento: o.segmento ?? null,
            etiquetas: o.etiquetas,
            responsavel: o.responsavel ?? null,
            idioma: o.idioma ?? null,
            localidade: o.localidade ?? null,
            pessoas: pessoas.get(o._id) ?? 0,
            estabelecimentos: estabelecimentos.get(o._id) ?? 0,
            carteira: o.carteira?.estado ?? null,
            relacoes: rel.get(o._id) ?? ["clientes"],
            atualizadoEm: o.atualizadoEm,
          })),
      };
    }
    const contactos = todosContactos;
    const orgs = new Map(todosOrgs.map((o) => [o._id as string, o]));
    return {
      tipo,
      linhas: contactos
        .filter((c) => doSegmento(c._id))
        .filter((c) => !q || semAcentos([c.nome, c.email, c.telefone, c.funcao, orgs.get(c.organizacaoId ?? "")?.nome, ...c.etiquetas].filter(Boolean).join(" ")).includes(q))
        .sort((a, b) => b.atualizadoEm - a.atualizadoEm)
        .map((c) => {
          const o = c.organizacaoId ? orgs.get(c.organizacaoId) : undefined;
          return {
            id: c._id as string,
            nome: c.nome,
            subtitulo: [c.funcao, o?.nome].filter(Boolean).join(" · ") || "Particular",
            email: c.email ?? null,
            telefone: c.telefone ?? null,
            segmento: o?.segmento ?? null,
            etiquetas: c.etiquetas,
            responsavel: c.responsavel ?? null,
            idioma: c.idioma ?? null,
            localidade: o?.localidade ?? null,
            pessoas: 0,
            estabelecimentos: 0,
            carteira: o?.carteira?.estado ?? null,
            relacoes: rel.get(c._id) ?? ["clientes"],
            atualizadoEm: c.atualizadoEm,
          };
        }),
    };
  },
});

export const ficha = query({
  args: { tipo: vTipo, id: v.string() },
  handler: async (ctx, { tipo, id }) => {
    await exigirAdmin(ctx, "contactos", "ver");
    if (tipo === "organizacoes") {
      const oid = ctx.db.normalizeId("organizacoes", id);
      const o = oid ? await ctx.db.get(oid) : null;
      if (!o) return null;
      const grupo = o.grupoId ? await ctx.db.get(o.grupoId) : null;
      const estabelecimentos = await ctx.db.query("organizacoes").withIndex("by_grupo", (q) => q.eq("grupoId", o._id)).collect();
      const pessoas = await ctx.db.query("contactos").withIndex("by_organizacao", (q) => q.eq("organizacaoId", o._id)).collect();
      const pagina = o.carteira?.partnershipId ? await ctx.db.get(o.carteira.partnershipId) : null;
      return {
        tipo,
        organizacao: { ...o, id: o._id as string },
        grupo: grupo ? { id: grupo._id as string, nome: grupo.nome } : null,
        estabelecimentos: estabelecimentos.map((e) => ({ id: e._id as string, nome: e.nome, localidade: e.localidade ?? null })),
        pessoas: pessoas.map((p) => ({ id: p._id as string, nome: p.nome, funcao: p.funcao ?? null, email: p.email ?? null, telefone: p.telefone ?? null })),
        cartoes: await cartoesDe(ctx, { organizacaoId: o._id }),
        reservas: await reservasDe(ctx, { organizacaoId: o._id }),
        pagina: pagina ? { id: pagina._id as string, nome: pagina.name, slug: pagina.slug } : null,
        primeiraReserva: await primeiraReserva(ctx, o),
      };
    }
    const cid = ctx.db.normalizeId("contactos", id);
    const c = cid ? await ctx.db.get(cid) : null;
    if (!c) return null;
    const o = c.organizacaoId ? await ctx.db.get(c.organizacaoId) : null;
    return {
      tipo,
      contacto: { ...c, id: c._id as string },
      organizacao: o ? { id: o._id as string, nome: o.nome } : null,
      cartoes: await cartoesDe(ctx, { contactoId: c._id }),
      reservas: await reservasDe(ctx, { contactoId: c._id }),
    };
  },
});

/* A primeira reserva de uma parceria: a mais antiga paga com a sua página. */
async function primeiraReserva(ctx: QueryCtx, o: Doc<"organizacoes">): Promise<{ numero: string | null; em: number } | null> {
  const pid = o.carteira?.partnershipId;
  if (!pid) return null;
  const pagas = (await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "paid")).collect())
    .concat(await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "completed")).collect())
    .filter((x) => x.partnershipId === pid);
  const p = pagas.sort((a, b) => a._creationTime - b._creationTime)[0];
  return p ? { numero: p.orderNumber ?? null, em: p._creationTime } : null;
}

/* Quem pode ser responsável: a equipa ativa e os donos. Com a permissão de
   ver contactos (não a da Equipa), para o seletor funcionar a todos. */
export const responsaveis = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "contactos", "ver");
    const pessoas = (await ctx.db.query("colaboradores").collect())
      .filter((c) => c.estado === "activo")
      .map((c) => ({ email: c.email, nome: c.nome }));
    const donos = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && !pessoas.some((p) => p.email === e))
      .map((e) => ({ email: e, nome: e.split("@")[0]! }));
    return [...pessoas, ...donos].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  },
});

/* ─── Guardar ─────────────────────────────────────────────────────────── */

const vOrg = {
  nome: v.string(),
  nif: v.optional(v.string()),
  segmento: v.optional(v.string()),
  etiquetas: v.array(v.string()),
  email: v.optional(v.string()),
  telefone: v.optional(v.string()),
  site: v.optional(v.string()),
  idioma: v.optional(v.string()),
  localidade: v.optional(v.string()),
  pais: v.optional(v.string()),
  morada: v.optional(v.string()),
  grupoId: v.optional(v.string()),
  responsavel: v.optional(v.string()),
  notas: v.optional(v.string()),
};

function limpo(s: string | undefined) {
  return s?.trim() || undefined;
}

export const guardarOrganizacao = mutation({
  args: { id: v.optional(v.id("organizacoes")), ...vOrg, relacao: v.optional(vRelacao) },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "contactos", "editar");
    const nome = a.nome.trim().replace(/\s+/g, " ");
    const erros: Record<string, string> = {};
    if (!nome) erros.nome = "Falta o nome.";
    const email = a.email?.trim() ? normalizarEmail(a.email) : undefined;
    if (a.email?.trim() && !email) erros.email = "O email não parece válido.";
    const grupoId = a.grupoId ? ctx.db.normalizeId("organizacoes", a.grupoId) : null;
    if (a.grupoId && !grupoId) erros.grupoId = "Esse grupo já não existe.";
    if (grupoId && a.id && grupoId === a.id) erros.grupoId = "Uma organização não pode ser grupo de si própria.";
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "validacao", erros });
    const dados = {
      nome,
      nomeNormalizado: normalizarNome(nome),
      nif: limpo(a.nif),
      segmento: limpo(a.segmento),
      etiquetas: [...new Set(a.etiquetas.map((e) => e.trim()).filter(Boolean))],
      email,
      telefone: normalizarTelefone(a.telefone),
      site: limpo(a.site),
      idioma: limpo(a.idioma),
      localidade: limpo(a.localidade),
      pais: limpo(a.pais),
      morada: limpo(a.morada),
      grupoId: grupoId ?? undefined,
      responsavel: limpo(a.responsavel)?.toLowerCase(),
      notas: limpo(a.notas),
      atualizadoEm: Date.now(),
    };
    if (a.id) {
      if (!(await ctx.db.get(a.id))) throw new ConvexError("Esta organização já não existe.");
      await ctx.db.patch(a.id, dados);
      return a.id;
    }
    /* Criada numa sub-aba (Clientes, Parceiros, Motoristas): fica lá. */
    return await ctx.db.insert("organizacoes", { ...dados, primeiraOrigem: a.relacao ? `manual:${a.relacao}` : "manual", criadoEm: Date.now() });
  },
});

export const guardarContacto = mutation({
  args: {
    id: v.optional(v.id("contactos")),
    nome: v.string(),
    email: v.optional(v.string()),
    telefone: v.optional(v.string()),
    idioma: v.optional(v.string()),
    funcao: v.optional(v.string()),
    etiquetas: v.array(v.string()),
    responsavel: v.optional(v.string()),
    organizacaoId: v.optional(v.string()),
    notas: v.optional(v.string()),
    relacao: v.optional(vRelacao),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "contactos", "editar");
    const nome = a.nome.trim().replace(/\s+/g, " ");
    const erros: Record<string, string> = {};
    if (!nome) erros.nome = "Falta o nome.";
    const email = a.email?.trim() ? normalizarEmail(a.email) : undefined;
    if (a.email?.trim() && !email) erros.email = "O email não parece válido.";
    const telefone = normalizarTelefone(a.telefone);
    if (email) {
      const outro = await ctx.db.query("contactos").withIndex("by_email", (q) => q.eq("email", email)).first();
      if (outro && outro._id !== a.id) erros.email = `Já existe um contacto com este email: ${outro.nome}.`;
    }
    const organizacaoId = a.organizacaoId ? ctx.db.normalizeId("organizacoes", a.organizacaoId) : null;
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "validacao", erros });
    const dados = {
      nome,
      email,
      telefone,
      idioma: limpo(a.idioma),
      funcao: limpo(a.funcao),
      etiquetas: [...new Set(a.etiquetas.map((e) => e.trim()).filter(Boolean))],
      responsavel: limpo(a.responsavel)?.toLowerCase(),
      organizacaoId: organizacaoId ?? undefined,
      notas: limpo(a.notas),
      atualizadoEm: Date.now(),
    };
    if (a.id) {
      if (!(await ctx.db.get(a.id))) throw new ConvexError("Este contacto já não existe.");
      await ctx.db.patch(a.id, dados);
      return a.id;
    }
    return await ctx.db.insert("contactos", { ...dados, primeiraOrigem: a.relacao ? `manual:${a.relacao}` : "manual", criadoEm: Date.now() });
  },
});

/* ─── Duplicados ──────────────────────────────────────────────────────── */

/*
 * Os possíveis duplicados: contactos com o mesmo telefone e emails
 * diferentes (ou o mesmo nome e a mesma organização), e organizações com
 * nomes que se contêm um ao outro («Avenida Palace» e «Hotel Avenida
 * Palace»). Os pares marcados como «não são o mesmo» não voltam.
 */
export const duplicados = query({
  args: { tipo: vTipo },
  handler: async (ctx, { tipo }) => {
    await exigirAdmin(ctx, "contactos", "ver");
    const ignorados = new Set(
      (await ctx.db.query("duplicadosIgnorados").collect()).filter((x) => x.tipo === tipo).map((x) => `${x.a}|${x.b}`),
    );
    const par = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const pares: { a: { id: string; nome: string; detalhe: string }; b: { id: string; nome: string; detalhe: string }; porque: string }[] = [];
    if (tipo === "contactos") {
      const cs = await ctx.db.query("contactos").collect();
      const porTel = new Map<string, Doc<"contactos">[]>();
      for (const c of cs) if (c.telefone) porTel.set(c.telefone, [...(porTel.get(c.telefone) ?? []), c]);
      for (const [tel, lista] of porTel) {
        for (let i = 1; i < lista.length; i++) {
          const a = lista[0]!, b = lista[i]!;
          if (ignorados.has(par(a._id, b._id))) continue;
          pares.push({ a: { id: a._id, nome: a.nome, detalhe: a.email ?? tel }, b: { id: b._id, nome: b.nome, detalhe: b.email ?? tel }, porque: `Mesmo telefone (${tel})` });
        }
      }
    } else {
      const os = (await ctx.db.query("organizacoes").collect()).filter((o) => o.nomeNormalizado.length >= 4);
      for (let i = 0; i < os.length; i++) {
        for (let j = i + 1; j < os.length; j++) {
          const a = os[i]!, b = os[j]!;
          if (a.grupoId === b._id || b.grupoId === a._id) continue;
          const na = a.nomeNormalizado, nb = b.nomeNormalizado;
          if (!(na.includes(nb) || nb.includes(na))) continue;
          if (ignorados.has(par(a._id, b._id))) continue;
          pares.push({ a: { id: a._id, nome: a.nome, detalhe: a.localidade ?? "" }, b: { id: b._id, nome: b.nome, detalhe: b.localidade ?? "" }, porque: "Nomes parecidos" });
        }
      }
    }
    return pares.slice(0, 200);
  },
});

export const ignorarDuplicado = mutation({
  args: { tipo: vTipo, a: v.string(), b: v.string() },
  handler: async (ctx, { tipo, a, b }) => {
    await exigirAdmin(ctx, "contactos", "editar");
    const acesso = await lerAcesso(ctx);
    const [x, y] = a < b ? [a, b] : [b, a];
    await ctx.db.insert("duplicadosIgnorados", { tipo, a: x, b: y, por: acesso.email ?? "", em: Date.now() });
    return null;
  },
});

/*
 * Juntar dois registos: o que fica recebe os campos que lhe faltavam e todas
 * as ligações do outro (cartões, reservas, pessoas, estabelecimentos), e o
 * outro apaga-se.
 */
export const juntar = mutation({
  args: { tipo: vTipo, manter: v.string(), apagar: v.string() },
  handler: async (ctx, { tipo, manter, apagar }) => {
    await exigirAdmin(ctx, "contactos", "editar");
    if (manter === apagar) throw new ConvexError("Escolha dois registos diferentes.");
    if (tipo === "contactos") {
      const m = ctx.db.normalizeId("contactos", manter), x = ctx.db.normalizeId("contactos", apagar);
      const cm = m && (await ctx.db.get(m)), cx = x && (await ctx.db.get(x));
      if (!cm || !cx) throw new ConvexError("Um dos contactos já não existe.");
      await ctx.db.patch(cm._id, {
        email: cm.email ?? cx.email,
        telefone: cm.telefone ?? cx.telefone,
        idioma: cm.idioma ?? cx.idioma,
        funcao: cm.funcao ?? cx.funcao,
        organizacaoId: cm.organizacaoId ?? cx.organizacaoId,
        responsavel: cm.responsavel ?? cx.responsavel,
        etiquetas: [...new Set([...cm.etiquetas, ...cx.etiquetas])],
        notas: [cm.notas, cx.notas].filter(Boolean).join("\n\n") || undefined,
        atualizadoEm: Date.now(),
      });
      for (const n of await ctx.db.query("negocios").withIndex("by_contacto", (q) => q.eq("contactoId", cx._id)).collect()) await ctx.db.patch(n._id, { contactoId: cm._id });
      for (const o of await ctx.db.query("orders").withIndex("by_contacto", (q) => q.eq("contactoId", cx._id)).collect()) await ctx.db.patch(o._id, { contactoId: cm._id });
      await ctx.db.delete(cx._id);
      return null;
    }
    const m = ctx.db.normalizeId("organizacoes", manter), x = ctx.db.normalizeId("organizacoes", apagar);
    const om = m && (await ctx.db.get(m)), ox = x && (await ctx.db.get(x));
    if (!om || !ox) throw new ConvexError("Uma das organizações já não existe.");
    await ctx.db.patch(om._id, {
      nif: om.nif ?? ox.nif,
      segmento: om.segmento ?? ox.segmento,
      email: om.email ?? ox.email,
      telefone: om.telefone ?? ox.telefone,
      site: om.site ?? ox.site,
      idioma: om.idioma ?? ox.idioma,
      localidade: om.localidade ?? ox.localidade,
      pais: om.pais ?? ox.pais,
      morada: om.morada ?? ox.morada,
      responsavel: om.responsavel ?? ox.responsavel,
      carteira: om.carteira ?? ox.carteira,
      estadoCarteira: om.estadoCarteira ?? ox.estadoCarteira,
      etiquetas: [...new Set([...om.etiquetas, ...ox.etiquetas])],
      notas: [om.notas, ox.notas].filter(Boolean).join("\n\n") || undefined,
      atualizadoEm: Date.now(),
    });
    for (const c of await ctx.db.query("contactos").withIndex("by_organizacao", (q) => q.eq("organizacaoId", ox._id)).collect()) await ctx.db.patch(c._id, { organizacaoId: om._id });
    for (const e of await ctx.db.query("organizacoes").withIndex("by_grupo", (q) => q.eq("grupoId", ox._id)).collect()) await ctx.db.patch(e._id, { grupoId: om._id });
    for (const n of await ctx.db.query("negocios").withIndex("by_organizacao", (q) => q.eq("organizacaoId", ox._id)).collect()) await ctx.db.patch(n._id, { organizacaoId: om._id });
    for (const o of await ctx.db.query("orders").withIndex("by_organizacao", (q) => q.eq("organizacaoId", ox._id)).collect()) await ctx.db.patch(o._id, { organizacaoId: om._id });
    await ctx.db.delete(ox._id);
    return null;
  },
});

/* ─── Carteira ────────────────────────────────────────────────────────── */

const ESTADOS_CARTEIRA = ["ativacao", "ativa", "semAtividade", "suspensa", "terminada"] as const;

export const carteira = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "parcerias", "ver");
    const linhas = [];
    for (const estado of ESTADOS_CARTEIRA) {
      for (const o of await ctx.db.query("organizacoes").withIndex("by_estado_carteira", (q) => q.eq("estadoCarteira", estado)).collect()) {
        linhas.push({
          id: o._id as string,
          nome: o.nome,
          segmento: o.segmento ?? null,
          localidade: o.localidade ?? null,
          responsavel: o.responsavel ?? null,
          estado,
          aceiteEm: o.carteira?.aceiteEm ?? null,
          ativadaEm: o.carteira?.ativadaEm ?? null,
          proximoAcompanhamento: o.carteira?.proximoAcompanhamento ?? null,
          temPagina: Boolean(o.carteira?.partnershipId),
          atualizadoEm: o.atualizadoEm,
        });
      }
    }
    return linhas;
  },
});

export const guardarCarteira = mutation({
  args: {
    id: v.id("organizacoes"),
    estado: vEstadoCarteira,
    aceiteEm: v.optional(v.number()),
    ativadaEm: v.optional(v.number()),
    formacaoEm: v.optional(v.number()),
    proximoAcompanhamento: v.optional(v.number()),
    partnershipId: v.optional(v.string()),
    acesso: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "parcerias", "editar");
    const o = await ctx.db.get(a.id);
    if (!o) throw new ConvexError("Esta organização já não existe.");
    const partnershipId = a.partnershipId ? ctx.db.normalizeId("partnerships", a.partnershipId) : null;
    if (a.partnershipId && !partnershipId) throw new ConvexError("Essa página de parceiro já não existe.");
    /* Passar a Ativa sem data de ativação grava agora. */
    const ativadaEm = a.ativadaEm ?? (a.estado === "ativa" ? (o.carteira?.ativadaEm ?? Date.now()) : o.carteira?.ativadaEm);
    await ctx.db.patch(a.id, {
      carteira: {
        estado: a.estado,
        aceiteEm: a.aceiteEm ?? o.carteira?.aceiteEm,
        ativadaEm,
        formacaoEm: a.formacaoEm,
        proximoAcompanhamento: a.proximoAcompanhamento,
        partnershipId: partnershipId ?? undefined,
        acesso: limpo(a.acesso),
      },
      estadoCarteira: a.estado,
      atualizadoEm: Date.now(),
    });
    return null;
  },
});

/*
 * Uma parceria ganha (o cartão das Parcerias passou a Onboarding): a
 * organização entra na Carteira em «Em ativação». Sem organização no
 * cartão, cria-se com o nome da empresa (ou da pessoa).
 */
export async function ativarCarteira(ctx: MutationCtx, n: Doc<"negocios">) {
  let organizacaoId = n.organizacaoId ?? null;
  if (!organizacaoId) {
    organizacaoId = await ligarOrganizacao(ctx, n.organizacao || n.pessoa.nome, n.origem);
    if (!organizacaoId) return;
    await ctx.db.patch(n._id, { organizacaoId });
    if (n.contactoId) {
      const c = await ctx.db.get(n.contactoId);
      if (c && !c.organizacaoId) await ctx.db.patch(c._id, { organizacaoId });
    }
  }
  const o = await ctx.db.get(organizacaoId);
  if (!o || o.carteira) return;
  /* O segmento do cartão: escolhido à mão, ou o da origem (o tipo de
     parceiro da lead, a candidatura). */
  let tipoParceiro: string | undefined;
  if (n.origem === "partnerLeads" && n.origemId) {
    const lid = ctx.db.normalizeId("partnerLeads", n.origemId);
    tipoParceiro = lid ? (await ctx.db.get(lid))?.partnerType : undefined;
  }
  const segmento = o.segmento ?? n.segmento ?? segmentoDaOrigem(n.origem, tipoParceiro) ?? undefined;
  const agora = Date.now();
  await ctx.db.patch(o._id, { carteira: { estado: "ativacao", aceiteEm: agora }, estadoCarteira: "ativacao", segmento, atualizadoEm: agora });
}

/* ─── Migração ────────────────────────────────────────────────────────── */

const TABELAS = [
  "orders",
  "contactSubmissions",
  "contactQuotes",
  "tourInquiries",
  "weddingQuoteSubmissions",
  "schoolQuoteSubmissions",
  "corporateRequests",
  "partnerLeads",
  "driverApplications",
  "partnerApplications",
] as const;
type Tabela = (typeof TABELAS)[number];

/* O que cada registo antigo diz de quem é. */
function quemE(t: Tabela, d: Record<string, unknown>) {
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : undefined);
  if (t === "orders") return { nome: s("customerName") ?? s("passengerName"), email: s("customerEmail") ?? s("passengerEmail"), telefone: s("customerPhone") ?? s("passengerWhatsapp") };
  if (t === "partnerApplications") {
    return { nome: s("representativeFullName"), email: s("representativeEmail"), telefone: s("representativePhone") ?? s("representativeWhatsapp"), empresa: s("companyName") };
  }
  return { nome: s("fullName") ?? s("name"), email: s("email"), telefone: s("phone"), empresa: s("companyName") ?? s("company") };
}

/*
 * Cria os contactos e as organizações dos registos que já existiam e liga
 * os cartões e as reservas. Corre por partes (200 de cada vez) e agenda-se
 * a si própria até ao fim; pode correr outra vez sem repetir nada.
 *   npx convex run contactos:preencher
 */
export const preencher = internalMutation({
  args: { tabela: v.optional(v.string()), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { tabela, cursor }) => {
    const t = (tabela ?? TABELAS[0]) as Tabela;
    const pagina = await ctx.db.query(t).paginate({ cursor: cursor ?? null, numItems: 200 });
    let ligados = 0;
    for (const d of pagina.page) {
      if (t === "orders") {
        const o = d as Doc<"orders">;
        if (o.status === "draft" || o.contactoId) continue;
      }
      const q = quemE(t, d as unknown as Record<string, unknown>);
      const { contactoId, organizacaoId } = await ligarContacto(ctx, { ...q, origem: t });
      if (!contactoId && !organizacaoId) continue;
      ligados++;
      if (t === "orders") {
        await ctx.db.patch(d._id as Id<"orders">, { contactoId: contactoId ?? undefined, organizacaoId: organizacaoId ?? undefined });
      }
      const n = await ctx.db
        .query("negocios")
        .withIndex("by_origem", (x) => x.eq("origem", t).eq("origemId", d._id))
        .first();
      if (n && !n.contactoId) await ctx.db.patch(n._id, { contactoId: contactoId ?? undefined, organizacaoId: organizacaoId ?? undefined });
    }
    const i = TABELAS.indexOf(t);
    if (!pagina.isDone) await ctx.scheduler.runAfter(0, internal.contactos.preencher, { tabela: t, cursor: pagina.continueCursor });
    else if (i + 1 < TABELAS.length) await ctx.scheduler.runAfter(0, internal.contactos.preencher, { tabela: TABELAS[i + 1], cursor: null });
    else console.log("[Contactos] preencher: acabou.");
    console.log(`[Contactos] ${t}: ${ligados} ligados nesta parte.`);
    return { tabela: t, ligados, fim: pagina.isDone };
  },
});

/* O módulo «contactos» aos cargos que tratam de pedidos ou de leads, ao
   nível mais alto que lá têm.
     npx convex run contactos:darAcesso */
export const darAcesso = internalMutation({
  args: {},
  handler: async (ctx) => {
    const feitos: string[] = [];
    for (const c of await ctx.db.query("cargos").collect()) {
      if (c.permissoes.some((p) => p.modulo === "contactos")) continue;
      const base = c.permissoes.filter((p) => p.modulo === "pedidos" || p.modulo === "leads");
      if (!base.length) continue;
      const nivel = base.some((p) => p.nivel === "editar") ? "editar" : "ver";
      await ctx.db.patch(c._id, { permissoes: [...c.permissoes, { modulo: "contactos", nivel }], actualizadoEm: Date.now() });
      feitos.push(`${c.nome} (${nivel})`);
    }
    return feitos;
  },
});
