import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { lerAcesso, permite, temCapacidade, type Acesso } from "./lib/admin";
import { FUNIS, tituloDaOrigem } from "./lib/funis";
import {
  ESTADOS_DE_SERVICO,
  METODOS,
  SEM_METODO,
  SEM_PARCEIRO,
  deIndice,
  indiceDia,
  local,
  origemNoEndereco,
  paraDia,
  parceiroDe,
  somarMeses,
} from "./inicio";

/*
 * Estatística: a central de informação do negócio (o dashboard em
 * /estatistica). Uma consulta por linha de negócio — Geral, Transfers, Tours
 * e eventos, Parceiros e B2B — todas sobre o mesmo período [de, ate] (dias de
 * Lisboa, inclusive) e comparadas com o período anterior do mesmo tamanho.
 *
 * As datas são as da compra (a reserva criada), como no Início: é quando o
 * dinheiro entra. Nos B2B, quando o pedido chegou e quando fechou.
 *
 * Sem «ver valores» no cargo, os euros saem a zero e o dashboard esconde-os:
 * ficam as contagens. null sem acesso ao módulo.
 */

const vPeriodo = { de: v.string(), ate: v.string() };
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const arred = (n: number) => Math.round(n * 100) / 100;

type Granularidade = "dia" | "semana" | "mes";

/* O período, o anterior do mesmo tamanho, a granularidade e os baldes. */
function janela(de: string, ate: string) {
  if (!DIA.test(de) || !DIA.test(ate) || de > ate) return null;
  const i0 = indiceDia(de);
  const i1 = indiceDia(ate);
  const dias = i1 - i0 + 1;
  const antesDe = deIndice(i0 - dias);
  const antesAte = deIndice(i0 - 1);
  const granularidade: Granularidade = dias <= 35 ? "dia" : dias <= 140 ? "semana" : "mes";
  let baldes: string[];
  if (granularidade === "dia") baldes = Array.from({ length: dias }, (_, k) => deIndice(i0 + k));
  else if (granularidade === "semana") baldes = Array.from({ length: Math.ceil(dias / 7) }, (_, k) => deIndice(i0 + k * 7));
  else {
    baldes = [];
    for (let m = de.slice(0, 7); m <= ate.slice(0, 7); m = somarMeses(m, 1)) baldes.push(m);
  }
  const balde = (dia: string): number => {
    if (granularidade === "mes") return baldes.indexOf(dia.slice(0, 7));
    const k = Math.floor((indiceDia(dia) - i0) / (granularidade === "dia" ? 1 : 7));
    return k >= 0 && k < baldes.length ? k : -1;
  };
  /* O mesmo período do ano passado: é a comparação que conta num negócio
     sazonal (agosto contra julho engana). */
  const menosUmAno = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4) === "-02-29" ? "-02-28" : d.slice(4)}`;
  const anoDe = menosUmAno(de);
  const anoAte = menosUmAno(ate);
  /* O dia equivalente deste ano, para pôr o ano passado nos mesmos baldes. */
  const maisUmAno = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
  /* Em ms, com folga de um dia de cada lado (fusos): o filtro fino é pelo dia de Lisboa. */
  const desdeMs = (indiceDia(antesDe) - 1) * 86_400_000;
  const ateMs = (i1 + 2) * 86_400_000;
  const anoDesdeMs = (indiceDia(anoDe) - 1) * 86_400_000;
  const anoAteMs = (indiceDia(anoAte) + 2) * 86_400_000;
  return { de, ate, dias, antesDe, antesAte, anoDe, anoAte, maisUmAno, granularidade, baldes, balde, desdeMs, ateMs, anoDesdeMs, anoAteMs };
}
type Janela = NonNullable<ReturnType<typeof janela>>;

/* Em que período cai um dia: o actual, o anterior, o do ano passado, ou nenhum. */
function qual(j: Janela, dia: string): "agora" | "antes" | "ano" | null {
  if (dia >= j.de && dia <= j.ate) return "agora";
  if (dia >= j.antesDe && dia <= j.antesAte) return "antes";
  if (dia >= j.anoDe && dia <= j.anoAte) return "ano";
  return null;
}

type Produto = "transfer" | "tour" | "evento";
type Linha = {
  o: Doc<"orders">;
  dia: string;
  volta: boolean;
  ida: Doc<"orders">;
  produto: Produto;
  valor: number;
  paga: boolean;
  cliente: string;
  nome: string;
  titulo: string | null;
};

/* As reservas do período e do anterior, com o que todas as secções precisam. */
async function lerReservas(ctx: QueryCtx, j: Janela): Promise<Linha[]> {
  const [recentes, doAno] = await Promise.all([
    ctx.db
      .query("orders")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", j.desdeMs).lte("_creationTime", j.ateMs))
      .collect(),
    j.anoAteMs < j.desdeMs
      ? ctx.db
          .query("orders")
          .withIndex("by_creation_time", (q) => q.gte("_creationTime", j.anoDesdeMs).lte("_creationTime", j.anoAteMs))
          .collect()
      : Promise.resolve([] as Doc<"orders">[]),
  ]);
  const docs = [...doAno, ...recentes];
  const porId = new Map(docs.map((o) => [o._id as string, o]));
  const outras = new Map<string, Doc<"orders"> | null>();
  await Promise.all(
    docs
      .filter((o) => o.relatedOrderId && !porId.has(o.relatedOrderId))
      .map(async (o) => outras.set(o.relatedOrderId!, await ctx.db.get(o.relatedOrderId!))),
  );
  const tours = new Map<string, Doc<"tourBookings"> | null>();
  await Promise.all(docs.filter((o) => o.tourBookingId).map(async (o) => tours.set(o._id, await ctx.db.get(o.tourBookingId!))));
  const linhas: Linha[] = [];
  for (const o of docs) {
    const dia = paraDia(o._creationTime);
    if (!qual(j, dia)) continue;
    const outra = o.relatedOrderId ? (porId.get(o.relatedOrderId) ?? outras.get(o.relatedOrderId) ?? null) : null;
    /* A volta é a perna mais recente das duas: conta na faturação, não nas viagens. */
    const volta = Boolean(outra && outra._creationTime < o._creationTime);
    const ida = volta && outra ? outra : o;
    const tb = tours.get(o._id);
    const produto: Produto = tb ? (tb.productType === "event" ? "evento" : "tour") : (o.orderNumber ?? "").startsWith("TB") ? "tour" : "transfer";
    const email = (ida.customerEmail ?? "").trim().toLowerCase();
    linhas.push({
      o,
      dia,
      volta,
      ida,
      produto,
      valor: o.totalAmount ?? 0,
      paga: ESTADOS_DE_SERVICO.has(o.status),
      cliente: email || (ida.customerPhone ?? "").replace(/\D/g, "") || (ida.customerName ?? "").trim().toLowerCase() || o._id,
      nome: ida.customerName?.trim() || ida.customerEmail || "Sem nome",
      titulo: tb?.tourTitle ?? null,
    });
  }
  return linhas;
}

/*
 * As linhas de negócio, com os nomes do resto do back-office: Reservas (o
 * que se vende directamente no site, a particulares e a empresas),
 * Parceiros (o que vendem as páginas dos parceiros), Tours e Eventos.
 */
export const LINHAS_NEGOCIO = ["Reservas", "Parceiros", "Tours", "Eventos"] as const;
type LinhaNegocio = (typeof LINHAS_NEGOCIO)[number];
function linhaDe(l: Linha): LinhaNegocio {
  if (l.produto === "tour") return "Tours";
  if (l.produto === "evento") return "Eventos";
  return parceiroDe(l.ida) === SEM_PARCEIRO ? "Reservas" : "Parceiros";
}

/* IVA estimado (o preço mostrado já o inclui): 6% no transporte, 23% nos
   tours e eventos. A confirmar com a contabilidade; o dashboard marca-o
   como estimativa. */
const IVA: Record<Produto, number> = { transfer: 0.06, tour: 0.23, evento: 0.23 };
const liquido = (l: Linha) => l.valor / (1 + IVA[l.produto]);
/* Taxa do cartão: os ~2% que se absorvem (não se passam ao cliente) em
   todos os pagamentos pelo Stripe — cartão, Link, MB WAY e Multibanco. */
const TAXA_STRIPE = 0.02;
const PELO_STRIPE = new Set(["ccard", "card", "link", "mbway", "mb", "multibanco"]);
const taxaDe = (l: Linha) => (PELO_STRIPE.has((l.ida.paymentMethod ?? "").trim().toLowerCase()) ? l.valor * TAXA_STRIPE : 0);

function acessoOuNull(acesso: Acesso, ...modulos: Parameters<typeof permite>[1][]) {
  return modulos.some((m) => permite(acesso, m));
}

/* Soma por chave: n (contagem), faturação e o que vier a mais. */
function agrupar<T extends { n: number; faturacao: number }>(m: Map<string, T>, chave: string, novo: () => T, valor: number, conta = true) {
  const x = m.get(chave) ?? novo();
  x.faturacao += valor;
  if (conta) x.n++;
  m.set(chave, x);
  return x;
}
const lista = <T extends { n: number; faturacao: number }>(m: Map<string, T>, porFaturacao = true) =>
  [...m.values()].map((x) => ({ ...x, faturacao: arred(x.faturacao) })).sort((a, b) => (porFaturacao ? b.faturacao - a.faturacao || b.n - a.n : b.n - a.n || b.faturacao - a.faturacao));

/* Os melhores clientes: os que mais gastaram (ou mais reservaram, sem valores). */
function topClientes(linhas: Linha[], valores: boolean, n = 10) {
  const m = new Map<string, { chave: string; nome: string; email: string | null; n: number; faturacao: number; ultima: string }>();
  for (const l of linhas) {
    const x = agrupar(m, l.cliente, () => ({ chave: l.cliente, nome: l.nome, email: l.ida.customerEmail ?? null, n: 0, faturacao: 0, ultima: l.dia }), l.valor, !l.volta);
    if (l.dia > x.ultima) x.ultima = l.dia;
  }
  return lista(m, valores)
    .slice(0, n)
    .map((c) => ({ ...c, faturacao: valores ? c.faturacao : 0 }));
}

/* Resumo de um conjunto de linhas pagas. */
function resumo(linhas: Linha[]) {
  const servicos = linhas.filter((l) => !l.volta);
  const faturacao = linhas.reduce((t, l) => t + l.valor, 0);
  const clientes = new Set(servicos.map((l) => l.cliente)).size;
  return {
    servicos: servicos.length,
    faturacao: arred(faturacao),
    ticket: servicos.length ? arred(faturacao / servicos.length) : null,
    clientes,
    pessoas: servicos.reduce((t, l) => t + (l.o.passengers ?? 0), 0),
  };
}
const semEuros = <T extends { faturacao: number; ticket: number | null }>(r: T, valores: boolean): T => (valores ? r : { ...r, faturacao: 0, ticket: null });

const SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const diaDaSemana = (dia: string) => (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;

/* ─── Geral ──────────────────────────────────────────────────────────── */

export const geral = query({
  args: vPeriodo,
  handler: async (ctx, { de, ate }) => {
    const acesso = await lerAcesso(ctx);
    if (!acessoOuNull(acesso, "reservas")) return null;
    const valores = temCapacidade(acesso, "valores");
    const j = janela(de, ate);
    if (!j) return null;
    const todas = await lerReservas(ctx, j);
    const pagas = todas.filter((l) => l.paga);
    const agora = pagas.filter((l) => qual(j, l.dia) === "agora");
    const antes = pagas.filter((l) => qual(j, l.dia) === "antes");

    /* Linhas de negócio: transfers do site, transfers de parceiros, tours,
       eventos e B2B (orçamentos ganhos, pelo valor do cartão). */
    const LINHAS = ["Transfers (site)", "Transfers (parceiros)", "Tours", "Eventos", "B2B"] as const;
    const linhaDe = (l: Linha) =>
      l.produto === "tour" ? "Tours" : l.produto === "evento" ? "Eventos" : parceiroDe(l.ida) === SEM_PARCEIRO ? "Transfers (site)" : "Transfers (parceiros)";
    const serie = Object.fromEntries(LINHAS.map((n) => [n, j.baldes.map(() => 0)])) as Record<(typeof LINHAS)[number], number[]>;
    const porLinha = new Map(LINHAS.map((n) => [n, { linha: n, n: 0, faturacao: 0, antes: 0 }]));
    for (const l of agora) {
      const k = linhaDe(l);
      const b = j.balde(l.dia);
      if (b >= 0) serie[k][b]! += l.valor;
      const x = porLinha.get(k)!;
      x.faturacao += l.valor;
      if (!l.volta) x.n++;
    }
    for (const l of antes) porLinha.get(linhaDe(l))!.antes += l.valor;

    /* B2B ganho: cartões do funil «medida» que fecharam ganhos no período. */
    const funilMedida = await ctx.db
      .query("funis")
      .filter((q) => q.eq(q.field("chave"), "medida"))
      .first();
    let b2bAgora = 0;
    let b2bAntes = 0;
    if (funilMedida) {
      const ganho = new Set(funilMedida.etapas.filter((e) => e.tipo === "ganho").map((e) => e.id));
      for (const n of await ctx.db.query("negocios").withIndex("by_funil_criado", (q) => q.eq("funilId", funilMedida._id)).collect()) {
        if (!n.fechadoEm || !ganho.has(n.etapaId)) continue;
        const p = qual(j, paraDia(n.fechadoEm));
        if (!p) continue;
        if (p === "agora") {
          b2bAgora += n.valor ?? 0;
          const x = porLinha.get("B2B")!;
          x.n++;
          x.faturacao += n.valor ?? 0;
          const b = j.balde(paraDia(n.fechadoEm));
          if (b >= 0) serie.B2B[b]! += n.valor ?? 0;
        } else b2bAntes += n.valor ?? 0;
      }
    }

    /* Clientes que voltam: no período e com uma compra paga antes dele. */
    const clientesAgora = new Set(agora.filter((l) => !l.volta).map((l) => l.cliente));
    const antesDoPeriodo = await ctx.db
      .query("orders")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", (indiceDia(j.de) - 1) * 86_400_000))
      .collect();
    const jaCompraram = new Set(
      antesDoPeriodo
        .filter((o) => ESTADOS_DE_SERVICO.has(o.status) && paraDia(o._creationTime) < j.de)
        .map((o) => (o.customerEmail ?? "").trim().toLowerCase() || (o.customerPhone ?? "").replace(/\D/g, ""))
        .filter(Boolean),
    );
    const recorrentes = [...clientesAgora].filter((c) => jaCompraram.has(c)).length;

    const porDiaSemana = SEMANA.map((rotulo) => ({ rotulo, n: 0, faturacao: 0 }));
    for (const l of agora) {
      const d = porDiaSemana[diaDaSemana(l.dia)]!;
      d.faturacao += l.valor;
      if (!l.volta) d.n++;
    }

    const rA = resumo(agora);
    const rB = resumo(antes);
    return {
      valores,
      periodo: { de: j.de, ate: j.ate, antesDe: j.antesDe, antesAte: j.antesAte, dias: j.dias },
      granularidade: j.granularidade,
      baldes: j.baldes,
      agora: { ...semEuros(rA, valores), faturacaoTotal: valores ? arred(rA.faturacao + b2bAgora) : 0, recorrentes, novos: clientesAgora.size - recorrentes },
      antes: { ...semEuros(rB, valores), faturacaoTotal: valores ? arred(rB.faturacao + b2bAntes) : 0 },
      linhas: [...porLinha.values()].map((x) => ({ ...x, faturacao: valores ? arred(x.faturacao) : 0, antes: valores ? arred(x.antes) : 0 })),
      serie: LINHAS.map((nome) => ({ nome, pontos: serie[nome].map((x) => (valores ? arred(x) : 0)) })),
      topClientes: topClientes(agora, valores),
      porDiaSemana: porDiaSemana.map((d) => ({ ...d, faturacao: valores ? arred(d.faturacao) : 0 })),
    };
  },
});

/* ─── Transfers ──────────────────────────────────────────────────────── */

const ANTECEDENCIA = [
  { rotulo: "Menos de 24 h", ate: 0 },
  { rotulo: "1 a 3 dias", ate: 3 },
  { rotulo: "4 a 7 dias", ate: 7 },
  { rotulo: "8 a 30 dias", ate: 30 },
  { rotulo: "Mais de 30 dias", ate: Infinity },
];

export const transfers = query({
  /* soSite: só o que se vende directamente no site (Finanças → Reservas);
     as dos sites dos parceiros estão em Parceiros. */
  args: { ...vPeriodo, soSite: v.optional(v.boolean()) },
  handler: async (ctx, { de, ate, soSite }) => {
    const acesso = await lerAcesso(ctx);
    if (!acessoOuNull(acesso, "reservas")) return null;
    const valores = temCapacidade(acesso, "valores");
    const j = janela(de, ate);
    if (!j) return null;
    const todas = (await lerReservas(ctx, j)).filter((l) => l.produto === "transfer" && (!soSite || parceiroDe(l.ida) === SEM_PARCEIRO));
    const doPeriodo = (p: "agora" | "antes" | "ano") => todas.filter((l) => qual(j, l.dia) === p);

    const indicadores = (ls: Linha[]) => {
      const pagas = ls.filter((l) => l.paga);
      const viagens = pagas.filter((l) => !l.volta);
      const r = resumo(pagas);
      const iniciados = ls.filter((l) => !l.volta).length;
      const antecedencias = viagens
        .map((l) => indiceDia(String(l.o.departureDate).slice(0, 10)) - indiceDia(l.dia))
        .filter((x) => Number.isFinite(x) && x >= 0);
      const pct = (n: number) => (viagens.length ? Math.round((n / viagens.length) * 1000) / 10 : null);
      return {
        ...semEuros(r, valores),
        conversao: iniciados ? Math.round((viagens.length / iniciados) * 1000) / 10 : null,
        idaVolta: pct(viagens.filter((l) => l.o.relatedOrderId || l.o.isRoundTrip).length),
        aeroporto: pct(viagens.filter((l) => (l.o.airportServiceFee ?? 0) > 0 || /aeroporto/i.test(local(l.o.departure) + local(l.o.arrival))).length),
        noturnas: pct(viagens.filter((l) => (l.o.nightTax ?? 0) > 0).length),
        antecedencia: antecedencias.length ? Math.round((antecedencias.reduce((t, x) => t + x, 0) / antecedencias.length) * 10) / 10 : null,
        canceladas: ls.filter((l) => !l.volta && l.o.status === "cancelled").length,
        extras: valores ? arred(pagas.reduce((t, l) => t + (l.o.addonsTotal ?? 0), 0)) : 0,
      };
    };

    const agora = doPeriodo("agora").filter((l) => l.paga);
    const viagens = agora.filter((l) => !l.volta);
    const serieViagens = j.baldes.map(() => 0);
    const serieFaturacao = j.baldes.map(() => 0);
    for (const l of agora) {
      const b = j.balde(l.dia);
      if (b < 0) continue;
      serieFaturacao[b]! += l.valor;
      if (!l.volta) serieViagens[b]!++;
    }

    const rotas = new Map<string, { origem: string; destino: string; n: number; faturacao: number }>();
    const viaturas = new Map<string, { rotulo: string; n: number; faturacao: number }>();
    const metodos = new Map<string, { rotulo: string; n: number; faturacao: number }>();
    const origens = new Map<string, { rotulo: string; n: number; faturacao: number }>();
    const canais = new Map<string, { rotulo: string; n: number; faturacao: number }>();
    for (const l of agora) {
      const ida = l.ida;
      const origem = local(ida.departure);
      const destino = local(ida.arrival);
      agrupar(rotas, `${origem}→${destino}`.toLowerCase(), () => ({ origem, destino, n: 0, faturacao: 0 }), l.valor, !l.volta);
      const vi = ida.vehicleName?.trim() || "Sem viatura indicada";
      agrupar(viaturas, vi, () => ({ rotulo: vi, n: 0, faturacao: 0 }), l.valor, !l.volta);
      const m = ida.paymentMethod?.trim().toLowerCase();
      const mr = m ? (METODOS[m] ?? m) : SEM_METODO;
      agrupar(metodos, mr, () => ({ rotulo: mr, n: 0, faturacao: 0 }), l.valor, !l.volta);
      const or = origemNoEndereco(ida);
      agrupar(origens, or, () => ({ rotulo: or, n: 0, faturacao: 0 }), l.valor, !l.volta);
      const canal = parceiroDe(ida) === SEM_PARCEIRO ? "Site" : "Parceiros";
      agrupar(canais, canal, () => ({ rotulo: canal, n: 0, faturacao: 0 }), l.valor, !l.volta);
    }

    const diaSemana = SEMANA.map((rotulo) => ({ rotulo, n: 0 }));
    const horas = Array.from({ length: 24 }, (_, h) => ({ rotulo: `${String(h).padStart(2, "0")}h`, n: 0 }));
    const antecedencia = ANTECEDENCIA.map((a) => ({ rotulo: a.rotulo, n: 0 }));
    for (const l of viagens) {
      const dv = String(l.o.departureDate);
      if (DIA.test(dv.slice(0, 10))) {
        diaSemana[diaDaSemana(dv.slice(0, 10))]!.n++;
        const dias = indiceDia(dv.slice(0, 10)) - indiceDia(l.dia);
        const k = ANTECEDENCIA.findIndex((a) => dias <= a.ate);
        if (dias >= 0 && k >= 0) antecedencia[k]!.n++;
      }
      const h = /T(\d{2}):/.exec(dv)?.[1] ?? / (\d{2}):/.exec(dv)?.[1];
      if (h) horas[Number(h)]!.n++;
    }

    const zeroF = <T extends { faturacao: number }>(x: T) => (valores ? x : { ...x, faturacao: 0 });
    return {
      valores,
      periodo: { de: j.de, ate: j.ate, antesDe: j.antesDe, antesAte: j.antesAte, dias: j.dias },
      granularidade: j.granularidade,
      baldes: j.baldes,
      agora: indicadores(doPeriodo("agora")),
      antes: indicadores(doPeriodo("antes")),
      ano: indicadores(doPeriodo("ano")),
      serie: { viagens: serieViagens, faturacao: serieFaturacao.map((x) => (valores ? arred(x) : 0)) },
      serieAno: (() => {
        const f = j.baldes.map(() => 0);
        const n = j.baldes.map(() => 0);
        for (const l of doPeriodo("ano").filter((x) => x.paga)) {
          const b = j.balde(j.maisUmAno(l.dia));
          if (b < 0) continue;
          f[b]! += l.valor;
          if (!l.volta) n[b]!++;
        }
        return { viagens: n, faturacao: f.map((x) => (valores ? arred(x) : 0)) };
      })(),
      /* Particulares ou empresas (NIF de empresa ou ligadas a uma organização). */
      particularesEmpresas: await (async () => {
        const orgs = new Map((await ctx.db.query("organizacoes").collect()).map((o) => [o._id as string, o.nome]));
        let pf = 0, pn = 0, ef = 0, en = 0;
        for (const l of agora) {
          const emp = empresaDe(l.ida, orgs) !== null;
          if (emp) { ef += l.valor; if (!l.volta) en++; } else { pf += l.valor; if (!l.volta) pn++; }
        }
        return [
          { rotulo: "Particulares", n: pn, faturacao: valores ? arred(pf) : 0 },
          { rotulo: "Empresas", n: en, faturacao: valores ? arred(ef) : 0 },
        ];
      })(),
      rotas: lista(rotas, valores).slice(0, 10).map(zeroF),
      viaturas: lista(viaturas, valores).map(zeroF),
      metodos: lista(metodos, valores).map(zeroF),
      origens: lista(origens, false).map(zeroF),
      canais: lista(canais, valores).map(zeroF),
      diaSemana,
      horas: horas.filter((h, i) => h.n > 0 || (i >= 6 && i <= 23)),
      antecedencia,
      topClientes: topClientes(agora, valores),
    };
  },
});

/* ─── Tours e eventos ────────────────────────────────────────────────── */

export const tours = query({
  /* tipo: só tours ou só eventos (Finanças → Tours, Finanças → Eventos). */
  args: { ...vPeriodo, tipo: v.optional(v.union(v.literal("tour"), v.literal("evento"))) },
  handler: async (ctx, { de, ate, tipo }) => {
    const acesso = await lerAcesso(ctx);
    if (!acessoOuNull(acesso, "reservas")) return null;
    const valores = temCapacidade(acesso, "valores");
    const j = janela(de, ate);
    if (!j) return null;
    const todas = (await lerReservas(ctx, j)).filter((l) => l.produto !== "transfer" && l.paga && (!tipo || l.produto === tipo));
    const agora = todas.filter((l) => qual(j, l.dia) === "agora");
    const antes = todas.filter((l) => qual(j, l.dia) === "antes");
    const ano = todas.filter((l) => qual(j, l.dia) === "ano");
    const serie = { tour: j.baldes.map(() => 0), evento: j.baldes.map(() => 0) };
    const produtos = new Map<string, { rotulo: string; tipo: Produto; n: number; pessoas: number; faturacao: number }>();
    for (const l of agora) {
      const b = j.balde(l.dia);
      if (b >= 0 && l.produto !== "transfer") serie[l.produto][b]! += valores ? l.valor : l.volta ? 0 : 1;
      const t = l.titulo ?? (l.produto === "evento" ? "Evento sem título" : "Tour sem título");
      const x = agrupar(produtos, t, () => ({ rotulo: t, tipo: l.produto, n: 0, pessoas: 0, faturacao: 0 }), l.valor, !l.volta);
      if (!l.volta) x.pessoas += l.o.passengers ?? 0;
    }
    const porTipo = (ls: Linha[], tipo: Produto) => semEuros(resumo(ls.filter((l) => l.produto === tipo)), valores);
    return {
      valores,
      periodo: { de: j.de, ate: j.ate, antesDe: j.antesDe, antesAte: j.antesAte, dias: j.dias },
      granularidade: j.granularidade,
      baldes: j.baldes,
      agora: semEuros(resumo(agora), valores),
      antes: semEuros(resumo(antes), valores),
      ano: semEuros(resumo(ano), valores),
      serieAno: (() => {
        const f = j.baldes.map(() => 0);
        for (const l of ano) {
          const b = j.balde(j.maisUmAno(l.dia));
          if (b >= 0) f[b]! += valores ? l.valor : l.volta ? 0 : 1;
        }
        return f.map(arred);
      })(),
      serieTotal: (() => {
        const f = j.baldes.map(() => 0);
        for (const l of agora) {
          const b = j.balde(l.dia);
          if (b >= 0) f[b]! += valores ? l.valor : l.volta ? 0 : 1;
        }
        return f.map(arred);
      })(),
      tours: porTipo(agora, "tour"),
      eventos: porTipo(agora, "evento"),
      serie: [
        { nome: "Tours", pontos: serie.tour.map(arred) },
        { nome: "Eventos", pontos: serie.evento.map(arred) },
      ],
      produtos: lista(produtos, valores).map((p) => ({ ...p, faturacao: valores ? p.faturacao : 0 })),
      topClientes: topClientes(agora, valores),
    };
  },
});

/* ─── Parceiros ──────────────────────────────────────────────────────── */

export const parceiros = query({
  args: vPeriodo,
  handler: async (ctx, { de, ate }) => {
    const acesso = await lerAcesso(ctx);
    if (!acessoOuNull(acesso, "parcerias", "leads")) return null;
    const valores = temCapacidade(acesso, "valores");
    const j = janela(de, ate);
    if (!j) return null;
    const pagas = (await lerReservas(ctx, j)).filter((l) => l.paga);
    const agora = pagas.filter((l) => qual(j, l.dia) === "agora");
    const antes = pagas.filter((l) => qual(j, l.dia) === "antes");
    const dePar = (ls: Linha[]) => ls.filter((l) => parceiroDe(l.ida) !== SEM_PARCEIRO);

    type P = { rotulo: string; n: number; faturacao: number; antesN: number; antesF: number; ultima: string; clientes: Set<string> };
    const m = new Map<string, P>();
    const novo = (rotulo: string) => (): P => ({ rotulo, n: 0, faturacao: 0, antesN: 0, antesF: 0, ultima: "", clientes: new Set() });
    for (const l of dePar(agora)) {
      const k = parceiroDe(l.ida);
      const x = agrupar(m, k, novo(k), l.valor, !l.volta);
      if (l.dia > x.ultima) x.ultima = l.dia;
      x.clientes.add(l.cliente);
    }
    for (const l of dePar(antes)) {
      const k = parceiroDe(l.ida);
      const x = m.get(k) ?? novo(k)();
      x.antesF += l.valor;
      if (!l.volta) x.antesN++;
      m.set(k, x);
    }
    const ranking = [...m.values()]
      .map((x) => ({
        rotulo: x.rotulo,
        n: x.n,
        faturacao: valores ? arred(x.faturacao) : 0,
        ticket: valores && x.n ? arred(x.faturacao / x.n) : null,
        antesN: x.antesN,
        antesF: valores ? arred(x.antesF) : 0,
        ultima: x.ultima || null,
        clientes: x.clientes.size,
      }))
      .sort((a, b) => (valores ? b.faturacao - a.faturacao : 0) || b.n - a.n || b.antesN - a.antesN);

    /* Parceiros com página publicada e sem reservas no período. */
    const paginas = await ctx.db.query("partnerships").collect();
    const comReservas = new Set(ranking.filter((r) => r.n > 0).map((r) => r.rotulo.toLowerCase()));
    const ultimaDe = new Map<string, string>();
    const historico = await ctx.db.query("orders").withIndex("by_creation_time").order("desc").take(3000);
    for (const o of historico) {
      if (!ESTADOS_DE_SERVICO.has(o.status)) continue;
      const k = parceiroDe(o).toLowerCase();
      if (!ultimaDe.has(k)) ultimaDe.set(k, paraDia(o._creationTime));
    }
    const inactivos = paginas
      /* Publicada é tudo o que não está «inactive» (parceiros.ts → publicada). */
      .filter((p) => p.status !== "inactive" && !comReservas.has(p.name.trim().toLowerCase()))
      .map((p) => ({ rotulo: p.name, ultima: ultimaDe.get(p.name.trim().toLowerCase()) ?? null, desde: paraDia(p.createdAt ?? p._creationTime) }))
      .sort((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? "") || a.rotulo.localeCompare(b.rotulo, "pt"));
    const novos = paginas.filter((p) => qual(j, paraDia(p.createdAt ?? p._creationTime)) === "agora").length;

    /* A angariação: o funil das Parcerias no período. */
    const funil = await ctx.db
      .query("funis")
      .filter((q) => q.eq(q.field("chave"), "parcerias"))
      .first();
    let recebidas = 0;
    let ganhas = 0;
    let perdidas = 0;
    const porOrigem = new Map<string, { rotulo: string; n: number; faturacao: number; ganhas: number }>();
    if (funil) {
      const tipo = new Map(funil.etapas.map((e) => [e.id, e.tipo]));
      for (const n of await ctx.db.query("negocios").withIndex("by_funil_criado", (q) => q.eq("funilId", funil._id)).collect()) {
        if (qual(j, paraDia(n.criadoEm)) === "agora") {
          recebidas++;
          const r = tituloDaOrigem(n.origem);
          agrupar(porOrigem, r, () => ({ rotulo: r, n: 0, faturacao: 0, ganhas: 0 }), 0);
        }
        if (n.fechadoEm && qual(j, paraDia(n.fechadoEm)) === "agora") {
          if (tipo.get(n.etapaId) === "ganho") {
            ganhas++;
            const r = tituloDaOrigem(n.origem);
            const x = porOrigem.get(r) ?? { rotulo: r, n: 0, faturacao: 0, ganhas: 0 };
            x.ganhas++;
            porOrigem.set(r, x);
          } else if (tipo.get(n.etapaId) === "perdido") perdidas++;
        }
      }
    }

    const totalAgora = agora.reduce((t, l) => t + l.valor, 0);
    const rP = resumo(dePar(agora));
    const rPB = resumo(dePar(antes));
    const serie = j.baldes.map(() => 0);
    for (const l of dePar(agora)) {
      const b = j.balde(l.dia);
      if (b >= 0) serie[b]! += valores ? l.valor : l.volta ? 0 : 1;
    }
    return {
      valores,
      periodo: { de: j.de, ate: j.ate, antesDe: j.antesDe, antesAte: j.antesAte, dias: j.dias },
      granularidade: j.granularidade,
      baldes: j.baldes,
      agora: {
        ...semEuros(rP, valores),
        activos: ranking.filter((r) => r.n > 0).length,
        peso: totalAgora ? Math.round((rP.faturacao / totalAgora) * 1000) / 10 : null,
        novos,
      },
      antes: { ...semEuros(rPB, valores), activos: ranking.filter((r) => r.antesN > 0).length },
      ano: semEuros(resumo(dePar(pagas.filter((l) => qual(j, l.dia) === "ano"))), valores),
      serie: serie.map(arred),
      ranking,
      inactivos,
      angariacao: {
        recebidas,
        ganhas,
        perdidas,
        conversao: ganhas + perdidas ? Math.round((ganhas / (ganhas + perdidas)) * 1000) / 10 : null,
        porOrigem: [...porOrigem.values()].sort((a, b) => b.n - a.n),
      },
    };
  },
});

/* ─── B2B: vendas a empresas ────────────────────────────────────────── */

/*
 * Uma reserva é de uma empresa quando está ligada a uma organização
 * (contactos.ts) ou quando o NIF é de pessoa colectiva (os NIF portugueses
 * de empresas começam por 5, 6, 8 ou 9; os de particulares por 1, 2 ou 3).
 * As reservas que chegam pelos sites dos parceiros ficam na secção
 * Parceiros: são clientes do parceiro.
 */
const NIF_EMPRESA = /^[5689]\d{8}$/;
function empresaDe(o: Doc<"orders">, orgs: Map<string, string>): string | null {
  if (o.organizacaoId) return orgs.get(o.organizacaoId) ?? "Empresa";
  const nif = (o.customerNif ?? "").replace(/\D/g, "").replace(/^351/, "");
  if (NIF_EMPRESA.test(nif)) return o.customerName?.trim() ? `${o.customerName.trim()} (NIF ${nif})` : `NIF ${nif}`;
  return null;
}

/* ─── B2B (empresas e pedidos por medida) ───────────────────────────────────────── */

export const b2b = query({
  args: vPeriodo,
  handler: async (ctx, { de, ate }) => {
    const acesso = await lerAcesso(ctx);
    if (!acessoOuNull(acesso, "pedidos", "reservas")) return null;
    const valores = temCapacidade(acesso, "valores");
    const j = janela(de, ate);
    if (!j) return null;
    const funil = await ctx.db
      .query("funis")
      .filter((q) => q.eq(q.field("chave"), "medida"))
      .first();
    if (!funil) return null;
    const etapa = new Map(funil.etapas.map((e) => [e.id, e]));

    /* As reservas pagas de empresas (fora dos sites dos parceiros). */
    const orgs = new Map((await ctx.db.query("organizacoes").collect()).map((o) => [o._id as string, o.nome]));
    const pagas = (await lerReservas(ctx, j)).filter((l) => l.paga && parceiroDe(l.ida) === SEM_PARCEIRO);
    const deEmpresa = (ls: Linha[]) => ls.map((l) => ({ l, empresa: empresaDe(l.ida, orgs) })).filter((x) => x.empresa !== null) as { l: Linha; empresa: string }[];
    const empAgora = deEmpresa(pagas.filter((l) => qual(j, l.dia) === "agora"));
    const empAntes = deEmpresa(pagas.filter((l) => qual(j, l.dia) === "antes"));
    const totalAgora = pagas.filter((l) => qual(j, l.dia) === "agora").reduce((t, l) => t + l.valor, 0);
    const resEmp = (xs: { l: Linha; empresa: string }[]) => {
      const r = resumo(xs.map((x) => x.l));
      return { ...semEuros(r, valores), empresas: new Set(xs.map((x) => x.empresa)).size };
    };
    const empresas = new Map<string, { rotulo: string; n: number; faturacao: number; ultima: string; produtos: Set<string> }>();
    const serieEmpresas = j.baldes.map(() => 0);
    for (const { l, empresa } of empAgora) {
      const x = agrupar(empresas, empresa.toLowerCase(), () => ({ rotulo: empresa, n: 0, faturacao: 0, ultima: l.dia, produtos: new Set<string>() }), l.valor, !l.volta);
      if (l.dia > x.ultima) x.ultima = l.dia;
      x.produtos.add(l.produto === "transfer" ? "Transfers" : l.produto === "tour" ? "Tours" : "Eventos");
      const b = j.balde(l.dia);
      if (b >= 0) serieEmpresas[b]! += valores ? l.valor : l.volta ? 0 : 1;
    }
    const negocios = await ctx.db.query("negocios").withIndex("by_funil_criado", (q) => q.eq("funilId", funil._id)).collect();

    const contas = (p: "agora" | "antes" | "ano") => {
      let recebidos = 0;
      let ganhos = 0;
      let perdidos = 0;
      let valorGanho = 0;
      const tempos: number[] = [];
      for (const n of negocios) {
        if (qual(j, paraDia(n.criadoEm)) === p) recebidos++;
        if (!n.fechadoEm || qual(j, paraDia(n.fechadoEm)) !== p) continue;
        const t = etapa.get(n.etapaId)?.tipo;
        if (t === "ganho") {
          ganhos++;
          valorGanho += n.valor ?? 0;
          tempos.push((n.fechadoEm - n.criadoEm) / 86_400_000);
        } else if (t === "perdido") perdidos++;
      }
      return {
        recebidos,
        ganhos,
        perdidos,
        conversao: ganhos + perdidos ? Math.round((ganhos / (ganhos + perdidos)) * 1000) / 10 : null,
        valorGanho: valores ? arred(valorGanho) : 0,
        ticket: valores && ganhos ? arred(valorGanho / ganhos) : null,
        diasAteFechar: tempos.length ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10 : null,
      };
    };

    /* O que está em aberto agora (não depende do período). */
    const abertos = negocios.filter((n) => !n.arquivadoEm && etapa.get(n.etapaId)?.tipo === "aberta");
    const pipeline = funil.etapas
      .filter((e) => e.tipo === "aberta")
      .map((e) => {
        const ns = abertos.filter((n) => n.etapaId === e.id);
        return { rotulo: e.nome, cor: e.cor, n: ns.length, faturacao: valores ? arred(ns.reduce((t, n) => t + (n.valor ?? 0), 0)) : 0 };
      });

    const porTipo = new Map<string, { rotulo: string; n: number; faturacao: number; ganhos: number; perdidos: number }>();
    const motivos = new Map<string, number>();
    const clientes = new Map<string, { rotulo: string; n: number; faturacao: number }>();
    const serieRecebidos = j.baldes.map(() => 0);
    const serieGanhos = j.baldes.map(() => 0);
    for (const n of negocios) {
      const tipo = tituloDaOrigem(n.origem);
      if (qual(j, paraDia(n.criadoEm)) === "agora") {
        agrupar(porTipo, tipo, () => ({ rotulo: tipo, n: 0, faturacao: 0, ganhos: 0, perdidos: 0 }), 0);
        const b = j.balde(paraDia(n.criadoEm));
        if (b >= 0) serieRecebidos[b]!++;
      }
      if (!n.fechadoEm || qual(j, paraDia(n.fechadoEm)) !== "agora") continue;
      const t = etapa.get(n.etapaId)?.tipo;
      const x = porTipo.get(tipo) ?? { rotulo: tipo, n: 0, faturacao: 0, ganhos: 0, perdidos: 0 };
      if (t === "ganho") {
        x.ganhos++;
        x.faturacao += n.valor ?? 0;
        const b = j.balde(paraDia(n.fechadoEm));
        if (b >= 0) serieGanhos[b]!++;
        const quem = n.organizacao?.trim() || n.pessoa.nome;
        agrupar(clientes, quem.toLowerCase(), () => ({ rotulo: quem, n: 0, faturacao: 0 }), n.valor ?? 0);
      } else if (t === "perdido") {
        x.perdidos++;
        const mtv = n.motivoPerda?.trim() || "Sem motivo";
        motivos.set(mtv, (motivos.get(mtv) ?? 0) + 1);
      }
      porTipo.set(tipo, x);
    }

    return {
      valores,
      periodo: { de: j.de, ate: j.ate, antesDe: j.antesDe, antesAte: j.antesAte, dias: j.dias },
      granularidade: j.granularidade,
      baldes: j.baldes,
      agora: contas("agora"),
      antes: contas("antes"),
      ano: contas("ano"),
      emAberto: { n: abertos.length, valor: valores ? arred(abertos.reduce((t, n) => t + (n.valor ?? 0), 0)) : 0 },
      pipeline,
      serie: [
        { nome: "Recebidos", pontos: serieRecebidos },
        { nome: "Ganhos", pontos: serieGanhos },
      ],
      porTipo: [...porTipo.values()]
        .map((x) => ({
          ...x,
          faturacao: valores ? arred(x.faturacao) : 0,
          conversao: x.ganhos + x.perdidos ? Math.round((x.ganhos / (x.ganhos + x.perdidos)) * 1000) / 10 : null,
        }))
        .sort((a, b) => b.n - a.n || b.ganhos - a.ganhos),
      motivos: [...motivos.entries()].map(([rotulo, n]) => ({ rotulo, n })).sort((a, b) => b.n - a.n),
      topClientes: lista(clientes, valores)
        .slice(0, 10)
        .map((c) => ({ ...c, faturacao: valores ? c.faturacao : 0 })),
      funil: FUNIS.medida.titulo,
      empresas: {
        agora: { ...resEmp(empAgora), peso: totalAgora && valores ? Math.round((empAgora.reduce((t, x) => t + x.l.valor, 0) / totalAgora) * 1000) / 10 : null },
        antes: resEmp(empAntes),
        serie: serieEmpresas.map(arred),
        ranking: [...empresas.values()]
          .map((x) => ({ rotulo: x.rotulo, n: x.n, faturacao: valores ? arred(x.faturacao) : 0, ultima: x.ultima, produtos: [...x.produtos].join(", ") }))
          .sort((a, b) => (valores ? b.faturacao - a.faturacao : 0) || b.n - a.n),
      },
    };
  },
});

/* ─── Finanças → Resumo ──────────────────────────────────────────────── */

/*
 * O que um CFO pergunta primeiro: quanto ganhámos de verdade (líquido de
 * IVA e da taxa do cartão), se estamos a crescer face ao mesmo período do
 * ano passado, de onde vem o dinheiro, quanto já está garantido para os
 * próximos meses e onde está o risco (concentração, cancelamentos pagos).
 * IVA e taxa do cartão são estimativas (ver IVA e TAXA_STRIPE).
 */
export const resumoFinancas = query({
  args: { ...vPeriodo, hoje: v.string() },
  handler: async (ctx, { de, ate, hoje }) => {
    const acesso = await lerAcesso(ctx);
    if (!acessoOuNull(acesso, "reservas")) return null;
    const valores = temCapacidade(acesso, "valores");
    const j = janela(de, ate);
    if (!j || !DIA.test(hoje)) return null;
    const todas = await lerReservas(ctx, j);
    const pagas = todas.filter((l) => l.paga);
    const de_ = (p: "agora" | "antes" | "ano") => pagas.filter((l) => qual(j, l.dia) === p);

    const contas = (ls: Linha[]) => {
      const bruto = ls.reduce((t, l) => t + l.valor, 0);
      const semIva = ls.reduce((t, l) => t + liquido(l), 0);
      const taxas = ls.reduce((t, l) => t + taxaDe(l), 0);
      const servicos = ls.filter((l) => !l.volta).length;
      return {
        bruto: arred(bruto),
        liquido: arred(semIva - taxas),
        iva: arred(bruto - semIva),
        taxas: arred(taxas),
        servicos,
        ticket: servicos ? arred(bruto / servicos) : null,
      };
    };
    const zero = <T extends Record<string, number | null>>(x: T): T =>
      valores ? x : (Object.fromEntries(Object.entries(x).map(([k, val]) => [k, k === "servicos" ? val : k === "ticket" ? null : 0])) as T);

    /* De onde vem o dinheiro: as quatro linhas, agora e há um ano. */
    const porLinha = LINHAS_NEGOCIO.map((linha) => {
      const a = de_("agora").filter((l) => linhaDe(l) === linha);
      const y = de_("ano").filter((l) => linhaDe(l) === linha);
      return { linha, servicos: a.filter((l) => !l.volta).length, liquido: valores ? arred(a.reduce((t, l) => t + liquido(l) - taxaDe(l), 0)) : 0, liquidoAno: valores ? arred(y.reduce((t, l) => t + liquido(l) - taxaDe(l), 0)) : 0 };
    });

    /* A evolução: receita líquida por balde, este período e o mesmo do ano passado. */
    const serie = j.baldes.map(() => 0);
    const serieAno = j.baldes.map(() => 0);
    for (const l of de_("agora")) {
      const b = j.balde(l.dia);
      if (b >= 0) serie[b]! += liquido(l) - taxaDe(l);
    }
    for (const l of de_("ano")) {
      const b = j.balde(j.maisUmAno(l.dia));
      if (b >= 0) serieAno[b]! += liquido(l) - taxaDe(l);
    }

    /* Garantido: viagens já pagas que ainda vão acontecer (por data da viagem). */
    const fim = deIndice(indiceDia(hoje) + 90);
    const futuras = (await ctx.db
      .query("orders")
      .withIndex("by_departure_date", (q) => q.gte("departureDate", hoje).lte("departureDate", fim + "￿"))
      .collect()).filter((o) => ESTADOS_DE_SERVICO.has(o.status));
    const garantido = [30, 60, 90].map((dias) => {
      const limite = deIndice(indiceDia(hoje) + dias);
      const os = futuras.filter((o) => o.departureDate.slice(0, 10) <= limite);
      return { dias, valor: valores ? arred(os.reduce((t, o) => t + (o.totalAmount ?? 0), 0)) : 0, servicos: os.filter((o) => !o.relatedOrderId || o.isRoundTrip !== false).length };
    });

    /* Concentração: quanto vale o top 5 de clientes e de parceiros. */
    const agora = de_("agora");
    const total = agora.reduce((t, l) => t + l.valor, 0);
    const topN = (chave: (l: Linha) => string | null) => {
      const m = new Map<string, number>();
      for (const l of agora) {
        const k = chave(l);
        if (k) m.set(k, (m.get(k) ?? 0) + l.valor);
      }
      const top = [...m.values()].sort((a, b) => b - a).slice(0, 5).reduce((t, x) => t + x, 0);
      return total ? Math.round((top / total) * 1000) / 10 : null;
    };

    /* Perdas: canceladas depois de pagas (o dinheiro entrou e saiu). */
    const canceladasPagas = todas.filter((l) => qual(j, l.dia) === "agora" && l.o.status === "cancelled" && l.o.paymentStatus === "completed");

    const cA = contas(agora);
    return {
      valores,
      periodo: { de: j.de, ate: j.ate, antesDe: j.antesDe, antesAte: j.antesAte, anoDe: j.anoDe, anoAte: j.anoAte, dias: j.dias },
      granularidade: j.granularidade,
      baldes: j.baldes,
      agora: zero(cA),
      antes: zero(contas(de_("antes"))),
      ano: zero(contas(de_("ano"))),
      porLinha,
      serie: { agora: serie.map((x) => (valores ? arred(x) : 0)), ano: serieAno.map((x) => (valores ? arred(x) : 0)) },
      garantido,
      concentracao: { clientes: topN((l) => l.cliente), parceiros: topN((l) => (parceiroDe(l.ida) === SEM_PARCEIRO ? null : parceiroDe(l.ida))) },
      perdas: { canceladas: canceladasPagas.filter((l) => !l.volta).length, valor: valores ? arred(canceladasPagas.reduce((t, l) => t + l.valor, 0)) : 0 },
    };
  },
});
