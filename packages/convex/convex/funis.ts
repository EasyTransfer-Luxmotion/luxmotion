import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin, lerAcesso, temCapacidade, type Acesso } from "./lib/admin";
import type { Capacidade, Nivel } from "./lib/permissoes";
import { CHAVES_FUNIL, FUNIS, eChaveFunil, tituloDaOrigem, type ChaveFunil, type Etapa } from "./lib/funis";
import { colocarNoFunil, entrarNoFunil, entrarReservaNoFunil } from "./lib/funilEntrada";
import type { TabelaLead } from "./lib/pipedriveMapa";

/*
 * O quadro (kanban) de cada ecrã da Operação: Reservas, Pedidos e
 * Candidaturas, cada um com o seu funil (lib/funis.ts). É a vista principal
 * desses ecrãs; a lista fica ao lado. Substituem o Pipedrive.
 *
 * Os cartões chegam sozinhos (lib/funilEntrada.ts) ou, nos pedidos, criam-se
 * à mão. Quem vê cada quadro é quem vê o ecrã: o módulo de permissão é o
 * mesmo (reservas, pedidos, candidaturas). Sem responsável: vê-se tudo.
 */

/* Ganhos e perdidos ficam no quadro um mês; depois só contam no histórico. */
const FECHADOS_VISIVEIS_MS = 30 * 86_400_000;
/* Uma coluna aberta com mais do que isto já não se trabalha a arrastar. */
const MAX_POR_COLUNA = 300;

const vChave = v.union(v.literal("reservas"), v.literal("pedidos"), v.literal("candidaturas"));
const vEtapa = v.object({
  id: v.string(),
  nome: v.string(),
  cor: v.string(),
  tipo: v.union(v.literal("aberta"), v.literal("ganho"), v.literal("perdido")),
});

type Ctx = QueryCtx | MutationCtx;

async function funilPorChave(ctx: Ctx, chave: ChaveFunil): Promise<Doc<"funis"> | null> {
  return await ctx.db.query("funis").withIndex("by_chave", (q) => q.eq("chave", chave)).first();
}

/* Abrir um funil pede o módulo do ecrã onde ele vive. */
async function exigirFunil(ctx: Ctx, funil: Doc<"funis"> | null, nivel: Nivel, capacidade?: Capacidade) {
  if (!funil || !eChaveFunil(funil.chave)) throw new ConvexError("Este funil já não existe. Recarregue a página.");
  await exigirAdmin(ctx, FUNIS[funil.chave].modulo, nivel, capacidade);
  return { acesso: await lerAcesso(ctx), chave: funil.chave };
}

async function exigirNegocio(ctx: Ctx, id: Id<"negocios">, nivel: Nivel, capacidade?: Capacidade) {
  const n = await ctx.db.get(id);
  if (!n) throw new ConvexError("Este cartão já não existe.");
  const funil = await ctx.db.get(n.funilId);
  return { n, funil: funil!, ...(await exigirFunil(ctx, funil, nivel, capacidade)) };
}

function quem(acesso: Acesso): string {
  return acesso.email ?? "desconhecido";
}

/* O valor é faturação: sem "Ver valores", não sai do servidor. */
function valorVisivel(acesso: Acesso, n: Doc<"negocios">): number | null {
  return temCapacidade(acesso, "valores") ? (n.valor ?? null) : null;
}

function cartao(acesso: Acesso, n: Doc<"negocios">) {
  return {
    id: n._id,
    etapaId: n.etapaId,
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

/*
 * O que os filtros do quadro precisam e o cartão não guarda: os mesmos da
 * lista do ecrã, para os dois dizerem o mesmo. Nas reservas, a data da
 * viagem (Próximas/Passadas, o dia), o método de pagamento e a origem da
 * visita (utm_source, como em reservas.ts); em todos, o email e o telefone,
 * que a pesquisa da lista também procura.
 */
async function filtraveis(ctx: QueryCtx, n: Doc<"negocios">) {
  const base = { email: n.pessoa.email ?? null, telefone: n.pessoa.telefone ?? null };
  if (n.origem !== "orders" || !n.origemId) return { ...base, viagem: null, metodo: null, anuncio: null, referencia: null };
  const o = await ctx.db.get(n.origemId as Id<"orders">);
  return {
    ...base,
    viagem: o?.departureDate ? String(o.departureDate) : null,
    metodo: o?.paymentMethod ?? null,
    anuncio: o?.adSource?.utmSource?.trim().toLowerCase() || null,
    referencia: o?.orderNumber ?? null,
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

export const quadro = query({
  args: { chave: vChave },
  handler: async (ctx, { chave }) => {
    await exigirAdmin(ctx, FUNIS[chave].modulo, "ver");
    const funil = await funilPorChave(ctx, chave);
    if (!funil) return null;
    const acesso = await lerAcesso(ctx);
    const colunas = [];
    for (const etapa of funil.etapas) {
      const { lista, mais } = await cartoesDaEtapa(ctx, funil, etapa);
      const cartoes = [];
      for (const n of lista) cartoes.push({ ...cartao(acesso, n), ...(await filtraveis(ctx, n)) });
      colunas.push({ etapa, mais, cartoes });
    }
    return { funilId: funil._id, chave, colunas, verValores: temCapacidade(acesso, "valores") };
  },
});

export const negocio = query({
  args: { id: v.id("negocios") },
  handler: async (ctx, { id }) => {
    const n0 = await ctx.db.get(id);
    if (!n0) return null;
    const { n, funil, acesso } = await exigirNegocio(ctx, id, "ver");
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
      chave: funil.chave as ChaveFunil,
      etapas: funil.etapas,
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
 * Entrar numa etapa de ganho ou perdido fecha o cartão; perdido pede o
 * motivo. Sair dela reabre-o.
 */
export const mover = mutation({
  args: {
    id: v.id("negocios"),
    etapaId: v.string(),
    antesDe: v.optional(v.id("negocios")),
    motivo: v.optional(v.string()),
  },
  handler: async (ctx, { id, etapaId, antesDe, motivo }) => {
    const { n, funil, acesso } = await exigirNegocio(ctx, id, "editar");
    const destino = funil.etapas.find((e) => e.id === etapaId);
    if (!destino) throw new ConvexError("Essa etapa já não existe. Recarregue o quadro.");
    const origem = funil.etapas.find((e) => e.id === n.etapaId);
    const mudaEtapa = n.etapaId !== etapaId;
    const motivoLimpo = motivo?.trim();
    if (mudaEtapa && destino.tipo === "perdido" && !motivoLimpo) {
      throw new ConvexError(`Diga o motivo para passar a «${destino.nome}».`);
    }

    const vizinho = antesDe && antesDe !== id ? await ctx.db.get(antesDe) : null;
    const ordem =
      vizinho && vizinho.funilId === n.funilId && vizinho.etapaId === etapaId
        ? await ordemAntesDe(ctx, vizinho)
        : await ordemNoFim(ctx, n.funilId, etapaId);

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

/* Um pedido que não veio do site: um telefonema, uma conversa num evento. */
export const criarManual = mutation({
  args: { chave: vChave, etapaId: v.optional(v.string()), canal: v.string(), nota: v.optional(v.string()), ...vDados },
  handler: async (ctx, a) => {
    if (!FUNIS[a.chave].manual) throw new ConvexError(`No quadro das ${FUNIS[a.chave].titulo.toLowerCase()} os cartões só chegam sozinhos.`);
    const funil = await funilPorChave(ctx, a.chave);
    const { acesso } = await exigirFunil(ctx, funil, "editar");
    if (a.etapaId && !funil!.etapas.some((e) => e.id === a.etapaId)) throw new ConvexError("Essa etapa já não existe.");
    const d = limparDados(a);
    const id = await colocarNoFunil(ctx, {
      origem: "manual",
      ...d,
      nota: a.nota?.trim() || undefined,
      canal: a.canal,
      por: quem(acesso),
      funilId: funil!._id,
      etapaId: a.etapaId,
    });
    if (!id) throw new ConvexError("Não foi possível criar o cartão: o funil não tem etapas.");
    return id;
  },
});

export const editar = mutation({
  args: { id: v.id("negocios"), nota: v.optional(v.string()), ...vDados },
  handler: async (ctx, a) => {
    const { n, acesso } = await exigirNegocio(ctx, a.id, "editar");
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
    const { acesso } = await exigirNegocio(ctx, id, "editar");
    const t = texto.trim();
    if (!t) throw new ConvexError("A nota está vazia.");
    if (t.length > 4000) throw new ConvexError("A nota tem de caber em 4000 caracteres.");
    await ctx.db.insert("negocioAtividades", { negocioId: id, tipo: "nota", por: quem(acesso), texto: t, em: Date.now() });
    await ctx.db.patch(id, { atualizadoEm: Date.now() });
    return null;
  },
});

/* Tira o cartão do quadro. A reserva, o pedido ou a candidatura ficam. */
export const apagar = mutation({
  args: { id: v.id("negocios") },
  handler: async (ctx, { id }) => {
    await exigirNegocio(ctx, id, "editar", "apagar");
    for (const a of await ctx.db.query("negocioAtividades").withIndex("by_negocio", (q) => q.eq("negocioId", id)).collect()) {
      await ctx.db.delete(a._id);
    }
    await ctx.db.delete(id);
    return null;
  },
});

/* ─── Etapas ──────────────────────────────────────────────────────────── */

/*
 * As etapas de um funil, pela ordem do quadro. As que saem têm de estar
 * vazias (o quadro perdia os cartões); tem de ficar pelo menos uma aberta,
 * onde caem os que chegam.
 */
export const guardarEtapas = mutation({
  args: { chave: vChave, etapas: v.array(vEtapa) },
  handler: async (ctx, a) => {
    const funil = await funilPorChave(ctx, a.chave);
    await exigirFunil(ctx, funil, "editar");
    const etapas = a.etapas.map((e) => ({ ...e, nome: e.nome.trim().replace(/\s+/g, " ") }));
    const erro = (m: string) => {
      throw new ConvexError({ tipo: "validacao", mensagem: m, erros: { etapas: m } });
    };
    if (!etapas.some((e) => e.tipo === "aberta")) erro("Tem de haver pelo menos uma etapa aberta: é onde caem os que chegam.");
    if (etapas.some((e) => !e.nome)) erro("Todas as etapas precisam de nome.");
    if (etapas.some((e) => e.nome.length > 40)) erro("O nome de uma etapa tem de caber em 40 caracteres.");
    if (new Set(etapas.map((e) => e.id)).size !== etapas.length) erro("Há etapas repetidas.");
    if (etapas.length > 10) erro("Até 10 etapas: mais do que isso já não cabe no quadro.");
    for (const velha of funil!.etapas) {
      if (etapas.some((e) => e.id === velha.id)) continue;
      const um = await ctx.db
        .query("negocios")
        .withIndex("by_funil_etapa", (q) => q.eq("funilId", funil!._id).eq("etapaId", velha.id))
        .first();
      if (um) erro(`A etapa «${velha.nome}» ainda tem cartões. Mova-os para outra antes de a tirar.`);
    }
    await ctx.db.patch(funil!._id, { etapas, atualizadoEm: Date.now() });
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
 * Os três funis, com as etapas com que começam (lib/funis.ts). Pode correr
 * mais de uma vez: o que já existe fica. Apaga os da primeira versão (sem
 * chave: Pedidos, Parceiros, Reservas à escolha), com os seus cartões, e o
 * módulo «funis» que essa versão deu aos cargos.
 *   npx convex run funis:criarFunisIniciais
 */
export const criarFunisIniciais = internalMutation({
  args: {},
  handler: async (ctx) => {
    const agora = Date.now();
    let apagados = 0;
    for (const f of await ctx.db.query("funis").collect()) {
      if (eChaveFunil(f.chave)) continue;
      for (const n of await ctx.db.query("negocios").withIndex("by_funil_criado", (q) => q.eq("funilId", f._id)).collect()) {
        for (const a of await ctx.db.query("negocioAtividades").withIndex("by_negocio", (q) => q.eq("negocioId", n._id)).collect()) {
          await ctx.db.delete(a._id);
        }
        await ctx.db.delete(n._id);
        apagados++;
      }
      await ctx.db.delete(f._id);
    }
    const criados: string[] = [];
    for (const chave of CHAVES_FUNIL) {
      if (await funilPorChave(ctx, chave)) continue;
      await ctx.db.insert("funis", { chave, etapas: FUNIS[chave].etapas, criadoEm: agora, atualizadoEm: agora });
      criados.push(chave);
    }
    for (const c of await ctx.db.query("cargos").collect()) {
      if (c.permissoes.some((p) => p.modulo === "funis")) {
        await ctx.db.patch(c._id, { permissoes: c.permissoes.filter((p) => p.modulo !== "funis"), actualizadoEm: agora });
      }
    }
    return { criados, cartoesAntigosApagados: apagados };
  },
});

/*
 * O que já estava em aberto quando os funis chegaram, para os quadros não
 * arrancarem vazios: os pedidos e as candidaturas por tratar ou em análise
 * dos últimos `dias`, e as reservas pagas com viagem daqui para a frente. Os
 * por tratar ficam na 1.ª etapa, os em curso na 2.ª. Não repete.
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
    /* Os estados de cada tabela (pedidos.ts e candidaturas.ts). */
    const EM_CURSO = new Set(["read", "inProgress", "reviewing"]);
    const FECHADO = new Set(["archived", "resolved", "approved", "rejected"]);
    const tabelas = [
      "contactSubmissions",
      "contactQuotes",
      "tourInquiries",
      "weddingQuoteSubmissions",
      "schoolQuoteSubmissions",
      "corporateRequests",
      "driverApplications",
      "partnerApplications",
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
