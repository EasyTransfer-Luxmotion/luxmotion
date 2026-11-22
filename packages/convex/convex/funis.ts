import { ConvexError, v } from "convex/values";
import { boardFiltersActive, lisbonToday, matchesBoardFilters, vBoardFilters } from "./lib/boardFilters";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin, lerAcesso, permite, temCapacidade, type Acesso } from "./lib/admin";
import { chega, type Capacidade, type Nivel } from "./lib/permissoes";
import { CHAVES_FUNIL, FUNIS, SEGMENTOS, eChaveFunil, moduloDoCartao, modulosDoFunil, segmentoDaOrigem, tituloDaOrigem, type ChaveFunil, type Etapa } from "./lib/funis";
import { colocarNoFunil, entrarNoFunil, entrarReservaNoFunil } from "./lib/funilEntrada";
import { aplicarEtapaNaOrigem } from "./lib/funilEstado";
import { ativarCarteira } from "./contactos";
import type { TabelaLead } from "./lib/pipedriveMapa";
import { zona } from "./candidaturas";

/*
 * O quadro (kanban) dos Serviços — Website (despacho) e Por medida (venda)
 * — e das Parcerias, cada um com o seu funil (lib/funis.ts). É a vista
 * principal desses ecrãs; a lista fica ao lado. Substituem o Pipedrive.
 *
 * Os cartões chegam sozinhos (lib/funilEntrada.ts) ou, por medida e nas
 * parcerias, criam-se à mão. Quem vê cada quadro é quem vê o ecrã: o
 * módulo de permissão é o mesmo (reservas, pedidos, leads). Sem
 * responsável.
 */

/* Ganhos e perdidos ficam no quadro um mês; depois só contam no histórico. */
const FECHADOS_VISIVEIS_MS = 30 * 86_400_000;
/* Uma coluna aberta com mais do que isto já não se trabalha a arrastar. */
const MAX_POR_COLUNA = 300;

const vChave = v.union(v.literal("reservas"), v.literal("medida"), v.literal("parcerias"));
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
  await exigirAdmin(ctx, modulosDoFunil(funil.chave), nivel, capacidade);
  return { acesso: await lerAcesso(ctx), chave: funil.chave };
}

async function exigirNegocio(ctx: Ctx, id: Id<"negocios">, nivel: Nivel, capacidade?: Capacidade) {
  const n = await ctx.db.get(id);
  if (!n) throw new ConvexError("Este cartão já não existe.");
  const funil = await ctx.db.get(n.funilId);
  const r = { n, funil: funil!, ...(await exigirFunil(ctx, funil, nivel, capacidade)) };
  // O quadro abre com um dos módulos; o cartão pede o da sua origem.
  await exigirAdmin(ctx, moduloDoCartao(r.chave, n.origem), nivel, capacidade);
  return r;
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
    /* Para abrir a ficha do registo (a reserva, o pedido, a candidatura). */
    origemId: n.origemId ?? null,
    canal: n.canal ?? null,
    criadoEm: n.criadoEm,
    movidoEm: n.movidoEm,
    fechadoEm: n.fechadoEm ?? null,
    proximaReuniao: n.proximaReuniao ?? null,
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
  const vazio = {
    viagem: null,
    metodo: null,
    anuncio: null,
    referencia: null,
    motorista: null,
    parceiro: null as string | null,
    zonas: [] as string[],
    tipoParceiro: null as string | null,
    segmento: n.segmento ?? segmentoDaOrigem(n.origem),
  };
  if (!n.origemId) return { ...base, ...vazio };
  if (n.origem === "orders") {
    const o = await ctx.db.get(n.origemId as Id<"orders">);
    return {
      ...base,
      ...vazio,
      viagem: o?.departureDate ? String(o.departureDate) : null,
      metodo: o?.paymentMethod ?? null,
      anuncio: o?.adSource?.utmSource?.trim().toLowerCase() || null,
      referencia: o?.orderNumber ?? null,
      motorista: o?.motorista ?? null,
      parceiro: o?.partnershipName ?? null,
    };
  }
  /* Pedidos e candidaturas: o parceiro por onde chegou e, nas candidaturas,
     as zonas onde trabalham. */
  const id = ctx.db.normalizeId(n.origem as "contactSubmissions", n.origemId);
  const d = (id ? await ctx.db.get(id) : null) as { partnershipName?: string; operatingZone?: string; operatingZones?: string[]; partnerType?: string } | null;
  const zonas = d?.operatingZones ?? (d?.operatingZone ? [d.operatingZone] : []);
  return {
    ...base,
    ...vazio,
    parceiro: d?.partnershipName ?? null,
    zonas: zonas.map(zona),
    tipoParceiro: d?.partnerType ?? null,
    segmento: n.segmento ?? segmentoDaOrigem(n.origem, d?.partnerType),
  };
}

async function cartoesDaEtapa(ctx: QueryCtx, funil: Doc<"funis">, etapa: Etapa, ler = MAX_POR_COLUNA * 2) {
  if (etapa.tipo === "aberta") {
    const lidos = (
      await ctx.db
        .query("negocios")
        .withIndex("by_funil_etapa", (q) => q.eq("funilId", funil._id).eq("etapaId", etapa.id))
        .take(ler)
    ).filter((n) => !n.arquivadoEm);
    return { lista: lidos.slice(0, MAX_POR_COLUNA), mais: lidos.length > MAX_POR_COLUNA };
  }
  const desde = Date.now() - FECHADOS_VISIVEIS_MS;
  const lista = await ctx.db
    .query("negocios")
    .withIndex("by_funil_etapa_fechado", (q) => q.eq("funilId", funil._id).eq("etapaId", etapa.id).gte("fechadoEm", desde))
    .order("desc")
    .take(MAX_POR_COLUNA);
  return { lista: lista.filter((n) => !n.arquivadoEm), mais: false };
}

export const quadro = query({
  /* Texto e não a lista das chaves: um dashboard mais antigo ainda pede os
     funis que já não existem («pedidos», «candidaturas»), e um erro de
     argumento deitava o ecrã abaixo («Este ecrã não abriu»). Recebe null e
     mostra a lista. */
  args: { chave: v.string(), filters: v.optional(vBoardFilters) },
  handler: async (ctx, { chave, filters }) => {
    if (!eChaveFunil(chave)) return null;
    await exigirAdmin(ctx, modulosDoFunil(chave), "ver");
    const funil = await funilPorChave(ctx, chave);
    if (!funil) return null;
    const acesso = await lerAcesso(ctx);
    const f = filters ?? {};
    const today = lisbonToday();
    // With filters on, read deeper: a match can sit past the first 300 cards of a column.
    const filtering = boardFiltersActive(f);
    const methods = new Set<string>();
    const sources = new Set<string>();
    const partners = new Set<string>();
    const colunas = [];
    for (const etapa of funil.etapas) {
      const { lista, mais } = await cartoesDaEtapa(ctx, funil, etapa, filtering ? 1000 : undefined);
      const cartoes = [];
      for (const n of lista) {
        if (!permite(acesso, moduloDoCartao(chave, n.origem))) continue;
        const card = { ...cartao(acesso, n), ...(await filtraveis(ctx, n)) };
        // The dropdown options come from every card read, not only the ones that pass.
        if (card.metodo) methods.add(card.metodo);
        if (card.anuncio) sources.add(card.anuncio);
        if (card.parceiro) partners.add(card.parceiro);
        if (matchesBoardFilters(chave, f, today, card)) cartoes.push(card);
      }
      colunas.push({ etapa, mais: mais || cartoes.length > MAX_POR_COLUNA, cartoes: cartoes.slice(0, MAX_POR_COLUNA) });
    }
    const sorted = (xs: Set<string>) => [...xs].sort((a, b) => a.localeCompare(b, "pt"));
    return {
      funilId: funil._id,
      chave,
      colunas,
      verValores: temCapacidade(acesso, "valores"),
      options: { methods: sorted(methods), sources: sorted(sources), partners: sorted(partners) },
    };
  },
});

async function lerNegocio(ctx: QueryCtx, id: Id<"negocios">) {
  const n0 = await ctx.db.get(id);
  if (!n0) return null;
  const { n, funil, acesso } = await exigirNegocio(ctx, id, "ver");
  const atividades = await ctx.db
    .query("negocioAtividades")
    .withIndex("by_negocio", (q) => q.eq("negocioId", id))
    .order("desc")
    .take(100);
  return {
    ...cartao(acesso, n),
    ...(await filtraveis(ctx, n)),
    chave: funil.chave as ChaveFunil,
    etapas: funil.etapas,
    nota: n.nota ?? null,
    origemTitulo: tituloDaOrigem(n.origem),
    motivoPerda: n.motivoPerda ?? null,
    arquivadoEm: n.arquivadoEm ?? null,
    contactoId: n.contactoId ?? null,
    organizacaoId: n.organizacaoId ?? null,
    atualizadoEm: n.atualizadoEm,
    atividades: atividades.map((a) => ({ id: a._id, tipo: a.tipo, por: a.por, texto: a.texto ?? null, em: a.em, reuniao: a.reuniao ?? null })),
  };
}

export const negocio = query({
  args: { id: v.id("negocios") },
  handler: async (ctx, { id }) => lerNegocio(ctx, id),
});

/*
 * O cartão de um registo, para a ficha desse registo (a página da reserva,
 * a folha do pedido ou da candidatura) mostrar a etapa, o motorista e as
 * notas: uma ficha só por cada coisa. Numa reserva, a volta encontra o
 * cartão da ida.
 */
export const negocioDaOrigem = query({
  args: { origem: v.string(), origemId: v.string() },
  handler: async (ctx, { origem, origemId }) => {
    let chave = origemId;
    if (origem === "orders") {
      const id = ctx.db.normalizeId("orders", origemId);
      const o = id ? await ctx.db.get(id) : null;
      if (!o) return null;
      const outra = o.relatedOrderId ? await ctx.db.get(o.relatedOrderId) : null;
      if (outra && outra._creationTime < o._creationTime) chave = outra._id;
    }
    const n = await ctx.db
      .query("negocios")
      .withIndex("by_origem", (q) => q.eq("origem", origem).eq("origemId", chave))
      .first();
    return n ? await lerNegocio(ctx, n._id) : null;
  },
});

/* As sugestões para o motorista: os das candidaturas aprovadas e os perfis
   do site. Pode escrever-se outro nome. */
export const motoristas = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "reservas", "ver");
    const nomes = new Set<string>();
    for (const c of await ctx.db.query("driverApplications").collect()) {
      if (c.status === "approved" && c.fullName?.trim()) nomes.add(c.fullName.trim());
    }
    for (const d of await ctx.db.query("drivers").collect()) if (d.name?.trim()) nomes.add(d.name.trim());
    for (const o of await ctx.db.query("orders").withIndex("by_creation_time").order("desc").take(300)) {
      if (o.motorista?.trim()) nomes.add(o.motorista.trim());
    }
    return [...nomes].sort((a, b) => a.localeCompare(b, "pt"));
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

    /* O registo acompanha (lib/funilEstado.ts): uma reserva em Cancelada
       fica cancelada. Antes de mexer no cartão, para que uma passagem
       impossível não o deixe numa etapa que o registo não acompanha. */
    if (mudaEtapa) await aplicarEtapaNaOrigem(ctx, n, funil.etapas, etapaId, quem(acesso));
    /* Onboarding concluído: a parceria ganha entra na Carteira (contactos.ts). */
    if (mudaEtapa && funil.chave === "parcerias" && destino.tipo === "ganho") await ativarCarteira(ctx, n);

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

/*
 * Quem faz o serviço. Grava-se na reserva (ida e volta) e, se o cartão
 * ainda está na 1.ª etapa (por atribuir), passa à seguinte — escolher o
 * motorista é o que essa passagem quer dizer. Vazio tira o motorista.
 */
export const atribuirMotorista = mutation({
  args: { id: v.id("negocios"), motorista: v.string() },
  handler: async (ctx, { id, motorista }) => {
    const { n, funil, acesso } = await exigirNegocio(ctx, id, "editar");
    if (n.origem !== "orders" || !n.origemId) throw new ConvexError("Só os serviços têm motorista.");
    const nome = motorista.trim().replace(/\s+/g, " ");
    if (nome.length > 80) throw new ConvexError("O nome do motorista tem de caber em 80 caracteres.");
    const ida = await ctx.db.get(n.origemId as Id<"orders">);
    if (!ida) throw new ConvexError("Esta reserva já não existe.");
    const agora = Date.now();
    const pernas = [ida];
    const volta = ida.relatedOrderId ? await ctx.db.get(ida.relatedOrderId) : null;
    if (volta) pernas.push(volta);
    for (const o of pernas) await ctx.db.patch(o._id, { motorista: nome || undefined, updatedAt: agora });

    const abertas = funil.etapas.filter((e) => e.tipo === "aberta");
    const destino = nome && abertas[0]?.id === n.etapaId ? (funil.etapas.find((e) => e.id === "atribuido") ?? abertas[1]) : undefined;
    if (destino) {
      await ctx.db.patch(id, { etapaId: destino.id, ordem: await ordemNoFim(ctx, funil._id, destino.id), movidoEm: agora, atualizadoEm: agora });
    } else {
      await ctx.db.patch(id, { atualizadoEm: agora });
    }
    await ctx.db.insert("negocioAtividades", {
      negocioId: id,
      tipo: destino ? "etapa" : "editado",
      por: quem(acesso),
      texto: nome ? `Motorista: ${nome}${destino ? ` · ${abertas[0]!.nome} → ${destino.nome}` : ""}` : "Tirou o motorista",
      em: agora,
    });
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
  args: { chave: vChave, etapaId: v.optional(v.string()), canal: v.string(), segmento: v.optional(v.string()), nota: v.optional(v.string()), ...vDados },
  handler: async (ctx, a) => {
    if (!FUNIS[a.chave].manual) throw new ConvexError(`No quadro das ${FUNIS[a.chave].titulo.toLowerCase()} os cartões só chegam sozinhos.`);
    const funil = await funilPorChave(ctx, a.chave);
    const { acesso } = await exigirFunil(ctx, funil, "editar");
    // Um cartão feito à mão é do módulo do funil (nas Parcerias, uma lead).
    await exigirAdmin(ctx, FUNIS[a.chave].modulo, "editar");
    if (a.etapaId && !funil!.etapas.some((e) => e.id === a.etapaId)) throw new ConvexError("Essa etapa já não existe.");
    const d = limparDados(a);
    const id = await colocarNoFunil(ctx, {
      origem: "manual",
      ...d,
      nota: a.nota?.trim() || undefined,
      canal: a.canal,
      segmento: a.segmento && SEGMENTOS[a.chave].includes(a.segmento) ? a.segmento : undefined,
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

/*
 * Arquivar tira o cartão do quadro sem o perder nem apagar: o registo e o
 * histórico ficam, e na ficha desarquiva-se. Para o que não avança mas
 * também não se perdeu (adiado sem data, duplicado de outro).
 */
export const arquivar = mutation({
  args: { id: v.id("negocios"), arquivar: v.boolean() },
  handler: async (ctx, { id, arquivar: sim }) => {
    const { n, acesso } = await exigirNegocio(ctx, id, "editar");
    if (Boolean(n.arquivadoEm) === sim) return null;
    const agora = Date.now();
    await ctx.db.patch(id, { arquivadoEm: sim ? agora : undefined, atualizadoEm: agora });
    await ctx.db.insert("negocioAtividades", { negocioId: id, tipo: sim ? "arquivado" : "desarquivado", por: quem(acesso), em: agora });
    return null;
  },
});

/*
 * Uma reunião no histórico: marcada (para quando), realizada, remarcada
 * (para outra data) ou falta. Fica como atividade do cartão, com a nota do
 * que se falou.
 */
export const registarReuniao = mutation({
  args: {
    id: v.id("negocios"),
    estado: v.union(v.literal("marcada"), v.literal("realizada"), v.literal("remarcada"), v.literal("falta")),
    quando: v.number(),
    nota: v.optional(v.string()),
  },
  handler: async (ctx, { id, estado, quando, nota }) => {
    const { acesso } = await exigirNegocio(ctx, id, "editar");
    if (!Number.isFinite(quando)) throw new ConvexError("Escolha a data da reunião.");
    const t = nota?.trim();
    if (t && t.length > 4000) throw new ConvexError("A nota tem de caber em 4000 caracteres.");
    const agora = Date.now();
    await ctx.db.insert("negocioAtividades", { negocioId: id, tipo: "reuniao", por: quem(acesso), texto: t || undefined, reuniao: { estado, quando }, em: agora });
    /* A última reunião registada decide: marcada ou remarcada fica como a
       próxima; realizada ou falta fecha-a. */
    await ctx.db.patch(id, { atualizadoEm: agora, proximaReuniao: estado === "marcada" || estado === "remarcada" ? quando : undefined });
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
 * mais de uma vez: o que já existe fica. Apaga os que já não existem (os
 * da primeira versão, sem chave, o dos pedidos e o das candidaturas), com
 * os seus cartões, e o
 * módulo «funis» que a primeira versão deu aos cargos.
 *   npx convex run funis:criarFunisIniciais
 */
export const criarFunisIniciais = internalMutation({
  args: {},
  handler: async (ctx) => {
    const agora = Date.now();
    let apagados = 0;
    for (const f of await ctx.db.query("funis").collect()) {
      /* Os que já não existem (os da primeira versão, sem chave, e o dos
         pedidos), com os seus cartões. */
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
 * arrancarem vazios: os pedidos, as leads de parceiros e as candidaturas por tratar ou em curso
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
    const EM_CURSO = new Set(["read", "inProgress", "contacted", "qualified", "reviewing"]);
    const FECHADO = new Set(["archived", "resolved", "approved", "rejected"]);
    const tabelas = [
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

/*
 * As reuniões marcadas, de todos os funis que o cargo pode ver: as que já
 * passaram sem se dizer como correram (por fechar) e as que vêm até «ate».
 * Para a agenda (Operação → Reuniões), o Início e os avisos.
 */
export const reunioes = query({
  args: { ate: v.number() },
  handler: async (ctx, { ate }) => {
    /* Ler, não editar: com o nível por omissão («editar») o «ver como», que é
       só consulta, recusava e o ecrã das Reuniões não abria. Cada reunião
       ainda passa pelo módulo do seu cartão, mais abaixo. */
    await exigirAdmin(ctx, undefined, "ver");
    const acesso = await lerAcesso(ctx);
    const funis = new Map((await ctx.db.query("funis").collect()).map((f) => [f._id as string, f]));
    const marcadas = await ctx.db
      .query("negocios")
      .withIndex("by_reuniao", (q) => q.gte("proximaReuniao", 0).lte("proximaReuniao", ate))
      .collect();
    const linhas = [];
    for (const n of marcadas) {
      if (n.arquivadoEm || n.proximaReuniao === undefined) continue;
      const f = funis.get(n.funilId);
      if (!f || !eChaveFunil(f.chave)) continue;
      if (!acesso.dono && !chega(acesso.permissoes[moduloDoCartao(f.chave, n.origem)], "ver")) continue;
      const etapa = f.etapas.find((e) => e.id === n.etapaId);
      const ultima = await ctx.db
        .query("negocioAtividades")
        .withIndex("by_negocio", (q) => q.eq("negocioId", n._id))
        .order("desc")
        .filter((q) => q.eq(q.field("tipo"), "reuniao"))
        .first();
      linhas.push({
        id: n._id as string,
        quando: n.proximaReuniao,
        estado: ultima?.reuniao?.estado ?? "marcada",
        nota: ultima?.texto ?? null,
        por: ultima?.por ?? null,
        titulo: n.titulo,
        pessoa: n.pessoa.nome,
        organizacao: n.organizacao ?? null,
        chave: f.chave as ChaveFunil,
        funil: FUNIS[f.chave].titulo,
        etapa: etapa?.nome ?? "",
        cor: etapa?.cor ?? "#64748b",
        origem: n.origem,
        origemId: n.origemId ?? null,
      });
    }
    return linhas.sort((a, b) => a.quando - b.quando);
  },
});

/* Preenche proximaReuniao nos cartões com reuniões registadas antes do
   campo existir. Pode correr mais de uma vez.
     npx convex run funis:preencherReunioes */
export const preencherReunioes = internalMutation({
  args: {},
  handler: async (ctx) => {
    let feitos = 0;
    const vistos = new Set<string>();
    for (const a of await ctx.db.query("negocioAtividades").collect()) {
      if (a.tipo !== "reuniao" || vistos.has(a.negocioId)) continue;
      vistos.add(a.negocioId);
      const ultima = await ctx.db
        .query("negocioAtividades")
        .withIndex("by_negocio", (q) => q.eq("negocioId", a.negocioId))
        .order("desc")
        .filter((q) => q.eq(q.field("tipo"), "reuniao"))
        .first();
      const r = ultima?.reuniao;
      const n = await ctx.db.get(a.negocioId);
      if (!n || !r) continue;
      await ctx.db.patch(n._id, { proximaReuniao: r.estado === "marcada" || r.estado === "remarcada" ? r.quando : undefined });
      feitos++;
    }
    return { feitos };
  },
});

/*
 * O calendário das reuniões (Operação → Reuniões): todas as que caem entre
 * «de» e «ate», marcadas, realizadas ou faltas, dos funis que o cargo pode
 * ver. O histórico de cada cartão é uma sequência de registos; aqui viram
 * acontecimentos: «marcada» abre uma reunião, «remarcada» muda a data da
 * que está aberta, «realizada» e «falta» fecham-na (na data indicada).
 */
export const calendario = query({
  // `funnel`: the funnel picked on the calendar (?funil=), filtered here and not in the browser.
  args: { de: v.number(), ate: v.number(), funnel: v.optional(v.string()) },
  handler: async (ctx, { de, ate, funnel }) => {
    /* Ler, não editar: com o nível por omissão («editar») o «ver como», que é
       só consulta, recusava e o ecrã das Reuniões não abria. Cada reunião
       ainda passa pelo módulo do seu cartão, mais abaixo. */
    await exigirAdmin(ctx, undefined, "ver");
    const acesso = await lerAcesso(ctx);
    const funis = new Map((await ctx.db.query("funis").collect()).map((f) => [f._id as string, f]));
    const registos = await ctx.db
      .query("negocioAtividades")
      .withIndex("by_tipo", (q) => q.eq("tipo", "reuniao"))
      .collect();
    type Ev = { id: string; negocioId: Id<"negocios">; quando: number; estado: "marcada" | "realizada" | "remarcada" | "falta"; nota: string | null; por: string };
    const porNegocio = new Map<string, Ev[]>();
    for (const a of registos) {
      if (!a.reuniao) continue;
      const lista = porNegocio.get(a.negocioId) ?? [];
      const aberta = [...lista].reverse().find((e) => e.estado === "marcada" || e.estado === "remarcada");
      const { estado, quando } = a.reuniao;
      const nota = a.texto ?? null;
      if (estado === "marcada" || !aberta) lista.push({ id: a._id, negocioId: a.negocioId, quando, estado, nota, por: a.por });
      else Object.assign(aberta, { quando, estado, nota: nota ?? aberta.nota, por: a.por });
      porNegocio.set(a.negocioId, lista);
    }
    const linhas = [];
    for (const [negocioId, eventos] of porNegocio) {
      const dentro = eventos.filter((e) => e.quando >= de && e.quando <= ate);
      if (!dentro.length) continue;
      const n = await ctx.db.get(negocioId as Id<"negocios">);
      if (!n || n.arquivadoEm) continue;
      const f = funis.get(n.funilId);
      if (!f || !eChaveFunil(f.chave)) continue;
      if (funnel && f.chave !== funnel) continue;
      if (!acesso.dono && !chega(acesso.permissoes[moduloDoCartao(f.chave, n.origem)], "ver")) continue;
      const etapa = f.etapas.find((e) => e.id === n.etapaId);
      for (const e of dentro) {
        linhas.push({
          id: e.id,
          negocioId: n._id as string,
          quando: e.quando,
          estado: e.estado,
          nota: e.nota,
          por: e.por,
          titulo: n.titulo,
          pessoa: n.pessoa.nome,
          organizacao: n.organizacao ?? null,
          chave: f.chave as ChaveFunil,
          funil: FUNIS[f.chave].titulo,
          etapa: etapa?.nome ?? "",
          cor: etapa?.cor ?? "#64748b",
          origem: n.origem,
          origemId: n.origemId ?? null,
        });
      }
    }
    return linhas.sort((a, b) => a.quando - b.quando);
  },
});
