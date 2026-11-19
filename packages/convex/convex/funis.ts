import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin, lerAcesso, temCapacidade, type Acesso } from "./lib/admin";
import { FUNIS_INICIAIS, eOrigem, tituloDaOrigem, type Etapa } from "./lib/funis";
import { colocarNoFunil, entrarNoFunil, entrarReservaNoFunil } from "./lib/funilEntrada";
import type { TabelaLead } from "./lib/pipedriveMapa";

/*
 * Operação → Funis no dashboard: os negócios em kanban, que substituem o
 * Pipedrive. Os cartões chegam sozinhos (lib/funilEntrada.ts: os formulários
 * do site, as leads de parceiros e as reservas pagas) ou criam-se à mão.
 * Sem responsável: quem tem o módulo vê o quadro inteiro.
 */

/* Ganhos e perdidos ficam no quadro um mês; depois só contam no histórico. */
const FECHADOS_VISIVEIS_MS = 30 * 86_400_000;
/* Uma coluna aberta com mais do que isto já não se trabalha a arrastar. */
const MAX_POR_COLUNA = 300;

const vEtapa = v.object({
  id: v.string(),
  nome: v.string(),
  cor: v.string(),
  tipo: v.union(v.literal("aberta"), v.literal("ganho"), v.literal("perdido")),
});

function quem(acesso: Acesso): string {
  return acesso.email ?? "desconhecido";
}

/* O valor dos negócios é faturação: sem "Ver valores", não sai do servidor. */
function valorVisivel(acesso: Acesso, n: Doc<"negocios">): number | null {
  return temCapacidade(acesso, "valores") ? (n.valor ?? null) : null;
}

function cartao(acesso: Acesso, n: Doc<"negocios">) {
  return {
    id: n._id,
    etapaId: n.etapaId,
    ordem: n.ordem,
    titulo: n.titulo,
    pessoa: n.pessoa.nome,
    organizacao: n.organizacao ?? null,
    valor: valorVisivel(acesso, n),
    origem: n.origem,
    canal: n.canal ?? null,
    criadoEm: n.criadoEm,
    movidoEm: n.movidoEm,
    fechadoEm: n.fechadoEm ?? null,
  };
}

async function cartoesDaEtapa(ctx: QueryCtx, funil: Doc<"funis">, etapa: Etapa) {
  if (etapa.tipo === "aberta") {
    const lidos = await ctx.db
      .query("negocios")
      .withIndex("by_funil_etapa", (q) => q.eq("funilId", funil._id).eq("etapaId", etapa.id))
      .take(MAX_POR_COLUNA + 1);
    return { lista: lidos.slice(0, MAX_POR_COLUNA), mais: lidos.length > MAX_POR_COLUNA };
  }
  const desde = Date.now() - FECHADOS_VISIVEIS_MS;
  const lista = await ctx.db
    .query("negocios")
    .withIndex("by_funil_etapa_fechado", (q) => q.eq("funilId", funil._id).eq("etapaId", etapa.id).gte("fechadoEm", desde))
    .order("desc")
    .take(MAX_POR_COLUNA);
  return { lista, mais: false };
}

/* Os funis, pela ordem, para os separadores do quadro e o editor. */
export const lista = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "funis", "ver");
    const funis = await ctx.db.query("funis").withIndex("by_ordem").collect();
    return funis.map((f) => ({ id: f._id, nome: f.nome, etapas: f.etapas, origens: f.origens }));
  },
});

export const quadro = query({
  args: { funilId: v.id("funis") },
  handler: async (ctx, { funilId }) => {
    await exigirAdmin(ctx, "funis", "ver");
    const acesso = await lerAcesso(ctx);
    const funil = await ctx.db.get(funilId);
    if (!funil) return null;
    const colunas = [];
    for (const etapa of funil.etapas) {
      const { lista, mais } = await cartoesDaEtapa(ctx, funil, etapa);
      colunas.push({ etapa, mais, cartoes: lista.map((n) => cartao(acesso, n)) });
    }
    return {
      funil: { id: funil._id, nome: funil.nome, origens: funil.origens },
      colunas,
      verValores: temCapacidade(acesso, "valores"),
    };
  },
});

export const negocio = query({
  args: { id: v.id("negocios") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "funis", "ver");
    const acesso = await lerAcesso(ctx);
    const n = await ctx.db.get(id);
    if (!n) return null;
    const funil = await ctx.db.get(n.funilId);
    const atividades = await ctx.db
      .query("negocioAtividades")
      .withIndex("by_negocio", (q) => q.eq("negocioId", id))
      .order("desc")
      .take(100);
    /* Para o link "Abrir a reserva": as reservas abrem pelo número. */
    let referencia: string | null = null;
    if (n.origem === "orders" && n.origemId) {
      const o = await ctx.db.get(n.origemId as Id<"orders">);
      referencia = o?.orderNumber ?? null;
    }
    return {
      ...cartao(acesso, n),
      funilId: n.funilId,
      etapas: funil?.etapas ?? [],
      email: n.pessoa.email ?? null,
      telefone: n.pessoa.telefone ?? null,
      nota: n.nota ?? null,
      origemId: n.origemId ?? null,
      origemTitulo: tituloDaOrigem(n.origem),
      referencia,
      motivoPerda: n.motivoPerda ?? null,
      atualizadoEm: n.atualizadoEm,
      atividades: atividades.map((a) => ({ id: a._id, tipo: a.tipo, por: a.por, texto: a.texto ?? null, em: a.em })),
    };
  },
});

/* ─── Cartões ─────────────────────────────────────────────────────────── */

async function ordemAntesDe(ctx: MutationCtx, alvo: Doc<"negocios">): Promise<number> {
  const anterior = await ctx.db
    .query("negocios")
    .withIndex("by_funil_etapa", (q) => q.eq("funilId", alvo.funilId).eq("etapaId", alvo.etapaId).lt("ordem", alvo.ordem))
    .order("desc")
    .first();
  return anterior ? (anterior.ordem + alvo.ordem) / 2 : alvo.ordem - 1024;
}

async function ordemNoFim(ctx: MutationCtx, funilId: Id<"funis">, etapaId: string): Promise<number> {
  const ultimo = await ctx.db
    .query("negocios")
    .withIndex("by_funil_etapa", (q) => q.eq("funilId", funilId).eq("etapaId", etapaId))
    .order("desc")
    .first();
  return ultimo ? ultimo.ordem + 1024 : 0;
}

/*
 * Para uma etapa (e uma posição: antes do cartão `antesDe`, ou no fim).
 * Entrar numa etapa de ganho ou perdido fecha o negócio; perdido pede o motivo.
 * Sair dela reabre-o.
 */
export const mover = mutation({
  args: {
    id: v.id("negocios"),
    etapaId: v.string(),
    antesDe: v.optional(v.id("negocios")),
    motivo: v.optional(v.string()),
  },
  handler: async (ctx, { id, etapaId, antesDe, motivo }) => {
    await exigirAdmin(ctx, "funis", "editar");
    const acesso = await lerAcesso(ctx);
    const n = await ctx.db.get(id);
    if (!n) throw new ConvexError("Este negócio já não existe.");
    const funil = await ctx.db.get(n.funilId);
    const destino = funil?.etapas.find((e) => e.id === etapaId);
    if (!funil || !destino) throw new ConvexError("Essa etapa já não existe neste funil. Recarregue o quadro.");
    const origem = funil.etapas.find((e) => e.id === n.etapaId);
    const mudaEtapa = n.etapaId !== etapaId;
    const motivoLimpo = motivo?.trim();
    if (mudaEtapa && destino.tipo === "perdido" && !motivoLimpo) {
      throw new ConvexError("Diga porque se perdeu o negócio.");
    }

    let ordem: number;
    const vizinho = antesDe && antesDe !== id ? await ctx.db.get(antesDe) : null;
    if (vizinho && vizinho.funilId === n.funilId && vizinho.etapaId === etapaId) ordem = await ordemAntesDe(ctx, vizinho);
    else ordem = await ordemNoFim(ctx, n.funilId, etapaId);

    const agora = Date.now();
    await ctx.db.patch(id, {
      etapaId,
      ordem,
      atualizadoEm: agora,
      ...(mudaEtapa
        ? {
            movidoEm: agora,
            fechadoEm: destino.tipo === "aberta" ? undefined : agora,
            motivoPerda: destino.tipo === "perdido" ? motivoLimpo : undefined,
          }
        : {}),
    });
    if (mudaEtapa) {
      await ctx.db.insert("negocioAtividades", {
        negocioId: id,
        tipo: destino.tipo === "aberta" ? "etapa" : destino.tipo,
        por: quem(acesso),
        texto: `${origem?.nome ?? "?"} → ${destino.nome}${destino.tipo === "perdido" ? ` · ${motivoLimpo}` : ""}`,
        em: agora,
      });
    }
    return null;
  },
});

const vDados = {
  titulo: v.string(),
  nome: v.string(),
  email: v.optional(v.string()),
  telefone: v.optional(v.string()),
  organizacao: v.optional(v.string()),
  valor: v.optional(v.number()),
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function limparDados(a: { titulo: string; nome: string; email?: string; telefone?: string; organizacao?: string; valor?: number }) {
  const nome = a.nome.trim().replace(/\s+/g, " ");
  const email = a.email?.trim().toLowerCase() || undefined;
  const telefone = a.telefone?.trim().replace(/\s+/g, " ") || undefined;
  const organizacao = a.organizacao?.trim() || undefined;
  const titulo = a.titulo.trim().replace(/\s+/g, " ") || [nome, organizacao].filter(Boolean).join(" · ");
  const erros: Record<string, string> = {};
  if (!nome) erros.nome = "Falta o nome da pessoa.";
  if (email && !EMAIL.test(email)) erros.email = "O email não parece válido.";
  if (telefone && !/^\+?[\d ()-]{6,20}$/.test(telefone)) erros.telefone = "O telemóvel só leva algarismos, espaços e o + do indicativo.";
  if (a.valor !== undefined && (!Number.isFinite(a.valor) || a.valor < 0)) erros.valor = "O valor tem de ser um número positivo.";
  if (titulo.length > 160) erros.titulo = "O título tem de caber em 160 caracteres.";
  if (Object.keys(erros).length) throw new ConvexError({ tipo: "validacao", erros });
  return { titulo, pessoa: { nome, email, telefone }, organizacao, valor: a.valor };
}

/* Um negócio que não veio do site: um telefonema, uma conversa num evento. */
export const criarManual = mutation({
  args: {
    funilId: v.id("funis"),
    etapaId: v.optional(v.string()),
    canal: v.string(),
    nota: v.optional(v.string()),
    ...vDados,
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "funis", "editar");
    const acesso = await lerAcesso(ctx);
    const funil = await ctx.db.get(a.funilId);
    if (!funil) throw new ConvexError("Esse funil já não existe.");
    if (a.etapaId && !funil.etapas.some((e) => e.id === a.etapaId)) throw new ConvexError("Essa etapa já não existe neste funil.");
    const d = limparDados(a);
    const id = await colocarNoFunil(ctx, {
      origem: "manual",
      ...d,
      nota: a.nota?.trim() || undefined,
      canal: a.canal,
      por: quem(acesso),
      funilId: funil._id,
      etapaId: a.etapaId,
    });
    if (!id) throw new ConvexError("Não foi possível criar o negócio: o funil não tem etapas.");
    return id;
  },
});

export const editar = mutation({
  args: { id: v.id("negocios"), nota: v.optional(v.string()), ...vDados },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "funis", "editar");
    const acesso = await lerAcesso(ctx);
    const n = await ctx.db.get(a.id);
    if (!n) throw new ConvexError("Este negócio já não existe.");
    const d = limparDados(a);
    /* Sem "Ver valores", o valor nem chegou ao ecrã: não se apaga por isso. */
    const valor = temCapacidade(acesso, "valores") ? d.valor : n.valor;
    await ctx.db.patch(a.id, {
      ...d,
      valor,
      ...(a.nota !== undefined ? { nota: a.nota.trim() || undefined } : {}),
      atualizadoEm: Date.now(),
    });
    await ctx.db.insert("negocioAtividades", { negocioId: a.id, tipo: "editado", por: quem(acesso), em: Date.now() });
    return null;
  },
});

export const notar = mutation({
  args: { id: v.id("negocios"), texto: v.string() },
  handler: async (ctx, { id, texto }) => {
    await exigirAdmin(ctx, "funis", "editar");
    const acesso = await lerAcesso(ctx);
    const t = texto.trim();
    if (!t) throw new ConvexError("A nota está vazia.");
    if (t.length > 4000) throw new ConvexError("A nota tem de caber em 4000 caracteres.");
    if (!(await ctx.db.get(id))) throw new ConvexError("Este negócio já não existe.");
    await ctx.db.insert("negocioAtividades", { negocioId: id, tipo: "nota", por: quem(acesso), texto: t, em: Date.now() });
    await ctx.db.patch(id, { atualizadoEm: Date.now() });
    return null;
  },
});

/* Tira o cartão do quadro. O pedido, a lead ou a reserva de onde veio ficam. */
export const apagar = mutation({
  args: { id: v.id("negocios") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "funis", "editar", "apagar");
    const n = await ctx.db.get(id);
    if (!n) return null;
    for (const a of await ctx.db.query("negocioAtividades").withIndex("by_negocio", (q) => q.eq("negocioId", id)).collect()) {
      await ctx.db.delete(a._id);
    }
    await ctx.db.delete(id);
    return null;
  },
});

/* ─── Funis ───────────────────────────────────────────────────────────── */

/*
 * Cria ou altera um funil. As etapas que saem têm de estar vazias (o quadro
 * perdia os cartões); as origens que este funil passa a ter saem do funil
 * onde estavam — cada lead cai num sítio só.
 */
export const guardarFunil = mutation({
  args: {
    id: v.optional(v.id("funis")),
    nome: v.string(),
    etapas: v.array(vEtapa),
    origens: v.array(v.string()),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "funis", "editar");
    const nome = a.nome.trim().replace(/\s+/g, " ");
    const erros: Record<string, string> = {};
    if (!nome) erros.nome = "Falta o nome do funil.";
    const etapas = a.etapas.map((e) => ({ ...e, nome: e.nome.trim().replace(/\s+/g, " ") }));
    if (!etapas.some((e) => e.tipo === "aberta")) erros.etapas = "O funil precisa de pelo menos uma etapa aberta, onde caem as leads.";
    if (etapas.some((e) => !e.nome)) erros.etapas = "Todas as etapas precisam de nome.";
    if (new Set(etapas.map((e) => e.id)).size !== etapas.length) erros.etapas = "Há etapas repetidas.";
    if (etapas.length > 12) erros.etapas = "Até 12 etapas: mais do que isso já não cabe no quadro.";
    const origens = [...new Set(a.origens)];
    if (origens.some((o) => !eOrigem(o))) erros.origens = "Há uma origem que não existe.";

    const atual = a.id ? await ctx.db.get(a.id) : null;
    if (a.id && !atual) throw new ConvexError("Este funil já não existe.");
    if (atual) {
      for (const velha of atual.etapas) {
        if (etapas.some((e) => e.id === velha.id)) continue;
        const um = await ctx.db
          .query("negocios")
          .withIndex("by_funil_etapa", (q) => q.eq("funilId", atual._id).eq("etapaId", velha.id))
          .first();
        if (um) {
          erros.etapas = `A etapa «${velha.nome}» ainda tem negócios. Mova-os para outra antes de a tirar.`;
          break;
        }
      }
    }
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "validacao", erros });

    const agora = Date.now();
    let id: Id<"funis">;
    if (atual) {
      await ctx.db.patch(atual._id, { nome, etapas, origens, atualizadoEm: agora });
      id = atual._id;
    } else {
      const ultimo = await ctx.db.query("funis").withIndex("by_ordem").order("desc").first();
      id = await ctx.db.insert("funis", { nome, etapas, origens, ordem: (ultimo?.ordem ?? 0) + 1, criadoEm: agora, atualizadoEm: agora });
    }
    for (const outro of await ctx.db.query("funis").collect()) {
      if (outro._id === id) continue;
      const ficam = outro.origens.filter((o) => !origens.includes(o));
      if (ficam.length !== outro.origens.length) await ctx.db.patch(outro._id, { origens: ficam, atualizadoEm: agora });
    }
    return id;
  },
});

export const removerFunil = mutation({
  args: { id: v.id("funis") },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "funis", "editar", "apagar");
    const um = await ctx.db.query("negocios").withIndex("by_funil_criado", (q) => q.eq("funilId", id)).first();
    if (um) throw new ConvexError("Este funil ainda tem negócios. Apague-os ou mude-os de funil antes.");
    await ctx.db.delete(id);
    return null;
  },
});

/* ─── Entrada e migração ──────────────────────────────────────────────── */

/* Uma reserva paga (webhooks.sendOrderPayload). Recebe a ida ou a volta:
   a volta nasce depois da ida, e o cartão é da viagem. */
export const entrarReserva = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const o = await ctx.db.get(orderId);
    if (!o) return false;
    const outra = o.relatedOrderId ? await ctx.db.get(o.relatedOrderId) : null;
    const ida = outra && outra._creationTime < o._creationTime ? outra : o;
    return (await entrarReservaNoFunil(ctx, ida)) !== null;
  },
});

/*
 * Os três funis com que se começa (lib/funis.ts), e o módulo aos cargos que
 * já tratam dos pedidos, ao mesmo nível. Pode correr mais de uma vez: o que
 * já existe fica.
 *   npx convex run funis:criarFunisIniciais
 */
export const criarFunisIniciais = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existentes = await ctx.db.query("funis").collect();
    const feitos: string[] = [];
    let ordem = existentes.reduce((m, f) => Math.max(m, f.ordem), 0);
    const ocupadas = new Set(existentes.flatMap((f) => f.origens));
    const agora = Date.now();
    for (const f of FUNIS_INICIAIS) {
      if (existentes.some((x) => x.nome === f.nome)) continue;
      await ctx.db.insert("funis", {
        nome: f.nome,
        etapas: f.etapas,
        origens: f.origens.filter((o) => !ocupadas.has(o)),
        ordem: ++ordem,
        criadoEm: agora,
        atualizadoEm: agora,
      });
      feitos.push(f.nome);
    }
    const cargos: string[] = [];
    for (const c of await ctx.db.query("cargos").collect()) {
      const pedidos = c.permissoes.find((p) => p.modulo === "pedidos");
      if (!pedidos || c.permissoes.some((p) => p.modulo === "funis")) continue;
      await ctx.db.patch(c._id, { permissoes: [...c.permissoes, { modulo: "funis", nivel: pedidos.nivel }], actualizadoEm: agora });
      cargos.push(`${c.nome} (${pedidos.nivel})`);
    }
    return { funis: feitos, cargos };
  },
});

/*
 * O que já estava em aberto quando os funis chegaram, para o quadro não
 * arrancar vazio: os pedidos e as leads de parceiros por tratar ou em curso
 * dos últimos `dias`, e as reservas pagas com viagem daqui para a frente.
 * Os por tratar ficam na 1.ª etapa, os em curso na 2.ª. Não repete.
 *   npx convex run funis:preencher '{"dias":30}'
 */
export const preencher = internalMutation({
  args: { dias: v.optional(v.number()) },
  handler: async (ctx, { dias = 30 }) => {
    const desde = Date.now() - dias * 86_400_000;
    const contagem: Record<string, number> = {};
    const conta = (k: string, id: unknown) => {
      if (id) contagem[k] = (contagem[k] ?? 0) + 1;
    };
    /* Os estados de cada tabela (pedidos.ts → ESTADOS). */
    const EM_CURSO = new Set(["read", "inProgress", "reviewing", "contacted", "qualified"]);
    const FECHADO = new Set(["archived", "resolved", "approved", "rejected"]);
    const tabelas = [
      "contactSubmissions",
      "contactQuotes",
      "tourInquiries",
      "weddingQuoteSubmissions",
      "schoolQuoteSubmissions",
      "corporateRequests",
      "partnerLeads",
    ] as const;
    for (const t of tabelas) {
      const docs = await ctx.db.query(t).withIndex("by_creation_time", (q) => q.gt("_creationTime", desde)).collect();
      for (const d of docs) {
        const estado = (d as { status?: string }).status;
        if (estado && FECHADO.has(estado)) continue;
        conta(t, await entrarNoFunil(ctx, t as TabelaLead, d._id, { criadoEm: d._creationTime, etapaAberta: estado && EM_CURSO.has(estado) ? 1 : 0 }));
      }
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const pagas = await ctx.db.query("orders").withIndex("by_creation_time", (q) => q.gt("_creationTime", desde)).collect();
    for (const o of pagas) {
      if (o.status !== "paid" && o.status !== "confirmed") continue;
      if (o.transferOrderId) continue; // tour vendido em upsell: vai no cartão do transfer
      const outra = o.relatedOrderId ? await ctx.db.get(o.relatedOrderId) : null;
      if (outra && outra._creationTime < o._creationTime) continue; // é a volta
      if (String(o.departureDate ?? "").slice(0, 10) < hoje) continue;
      conta("orders", await entrarReservaNoFunil(ctx, o, { criadoEm: o.updatedAt ?? o._creationTime }));
    }
    return contagem;
  },
});
