import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { internalMutation } from "./functions";
import { lerAcesso, permite, temCapacidade, type Acesso } from "./lib/admin";
import { tituloDaOrigem } from "./lib/funis";
import { deIndice, indiceDia, paraDia, somarMeses } from "./inicio";
import { facts } from "./lib/orderFacts";
import { ANTECEDENCIA, byKey, clientsIn, latestDay, partnerClients, rowsIn, topIn, total, type Seg, type StatRow } from "./lib/orderStats";

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

/* Se um dia cai num dos períodos. Um dia pode estar no anterior e no do
   ano passado ao mesmo tempo (em «12 meses» e «Este ano» sobrepõem-se):
   com uma só resposta, contava só como «anterior» e o ano passado ficava
   sem esses dias. */
type Periodo = "agora" | "antes" | "ano";
function em(j: Janela, dia: string, p: Periodo): boolean {
  if (p === "agora") return dia >= j.de && dia <= j.ate;
  if (p === "antes") return dia >= j.antesDe && dia <= j.antesAte;
  return dia >= j.anoDe && dia <= j.anoAte;
}
const algum = (j: Janela, dia: string) => em(j, dia, "agora") || em(j, dia, "antes") || em(j, dia, "ano");

/*
 * Everything below reads the day and month totals of lib/orderStats.ts, not
 * the orders: a period of 12 months at 10 000 orders a day is millions of
 * orders, and this used to read them all, three times (the period, the one
 * before and the same one a year earlier). Same rules as before: a sale is
 * paid, confirmed or done; a round trip is one service and both legs'
 * money; the day is the day it was bought, in Lisbon.
 */

const TRANSFER: Seg[] = ["transfer:site", "transfer:parceiro"];
const TOURS: Seg[] = ["tour:site", "tour:parceiro", "evento:site", "evento:parceiro"];
const DE_PARCEIRO: Seg[] = ["transfer:parceiro", "tour:parceiro", "evento:parceiro"];
const produtoDe = (seg: string) => seg.split(":")[0] as "transfer" | "tour" | "evento";

/*
 * As linhas de negócio, com os nomes do resto do back-office: Reservas (o
 * que se vende directamente no site, a particulares e a empresas),
 * Parceiros (o que vendem as páginas dos parceiros), Tours e Eventos.
 */
export const LINHAS_NEGOCIO = ["Reservas", "Parceiros", "Tours", "Eventos"] as const;
const SEGS_DA_LINHA: Record<(typeof LINHAS_NEGOCIO)[number], Seg[]> = {
  Reservas: ["transfer:site"],
  Parceiros: ["transfer:parceiro"],
  Tours: ["tour:site", "tour:parceiro"],
  Eventos: ["evento:site", "evento:parceiro"],
};

function acessoOuNull(acesso: Acesso, ...modulos: Parameters<typeof permite>[1][]) {
  return modulos.some((m) => permite(acesso, m));
}

/* Resumo de um período: as linhas "total" e os clientes únicos. */
async function resumo(ctx: QueryCtx, segs: readonly Seg[], de: string, ate: string, rows?: StatRow[]) {
  const t = total(rows ?? (await rowsIn(ctx, segs, ["total"], de, ate)));
  return {
    servicos: t.n,
    faturacao: arred(t.v),
    ticket: t.n ? arred(t.v / t.n) : null,
    clientes: await clientsIn(ctx, segs, de, ate),
    pessoas: t.p,
  };
}
const semEuros = <T extends { faturacao: number; ticket: number | null }>(r: T, valores: boolean): T => (valores ? r : { ...r, faturacao: 0, ticket: null });

/* Somas por chave, para os painéis: n e faturação, ordenados. */
function painel(rows: StatRow[], valores: boolean, porFaturacao = valores) {
  return [...byKey(rows).values()]
    .map((x) => ({ rotulo: x.key, n: x.n, faturacao: valores ? arred(x.v) : 0 }))
    .sort((a, b) => (porFaturacao ? b.faturacao - a.faturacao || b.n - a.n : b.n - a.n || b.faturacao - a.faturacao));
}

/* Em que balde de j cai uma linha (dia ou mês); `ano` desloca o ano passado
   para os baldes deste. */
function baldeDe(j: Janela, per: string, ano = false): number {
  const p = ano ? `${Number(per.slice(0, 4)) + 1}${per.slice(4) === "-02-29" ? "-02-28" : per.slice(4)}` : per;
  if (p.length === 7) return j.granularidade === "mes" ? j.baldes.indexOf(p) : -1;
  return j.balde(p);
}
/* As linhas "total" para a série: por dia quando os baldes são dias ou
   semanas, por mês (e os dias das pontas) quando são meses. */
const daSerie = (ctx: QueryCtx, j: Janela, segs: readonly Seg[], de: string, ate: string) => rowsIn(ctx, segs, ["total"], de, ate, j.granularidade !== "mes");

/* Os melhores clientes: os que mais gastaram (ou mais reservaram, sem valores). */
async function topClientes(ctx: QueryCtx, j: Janela, segs: readonly Seg[], valores: boolean, n = 10) {
  const top = await topIn(ctx, segs, "cliente", j.de, j.ate, n * 2);
  const linhas = await Promise.all(
    top.map(async (c) => {
      const [nome, email] = c.label ? (JSON.parse(c.label) as [string, string | null]) : ["Sem nome", null];
      return { chave: c.key, nome, email, n: c.n, faturacao: arred(c.v), ultima: (await latestDay(ctx, segs, "cliente", c.key, j.ate)) ?? j.ate };
    }),
  );
  return linhas
    .sort((a, b) => (valores ? b.faturacao - a.faturacao || b.n - a.n : b.n - a.n || b.faturacao - a.faturacao))
    .slice(0, n)
    .map((c) => ({ ...c, faturacao: valores ? c.faturacao : 0 }));
}

const SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/* ─── Transfers ──────────────────────────────────────────────────────── */

export const transfers = query({
  /* soSite: só o que se vende directamente no site (Finanças → Reservas);
     as dos sites dos parceiros estão em Parceiros. */
  args: { ...vPeriodo, soSite: v.optional(v.boolean()) },
  handler: async (ctx, { de, ate, soSite }) => {
    const acesso = await lerAcesso(ctx);
    if (!acessoOuNull(acesso, "financas")) return null;
    const valores = temCapacidade(acesso, "valores");
    const j = janela(de, ate);
    if (!j) return null;
    const segs: Seg[] = soSite ? ["transfer:site"] : TRANSFER;

    const indicadores = async (de: string, ate: string) => {
      const rows = await rowsIn(ctx, segs, ["total", "funil"], de, ate);
      const totais = rows.filter((r) => r.dim === "total");
      const t = total(totais);
      const funil = byKey(rows.filter((r) => r.dim === "funil"));
      const iniciados = [...funil.values()].filter((x) => x.key.startsWith("iniciados#")).reduce((s, x) => s + x.n, 0);
      const pct = (n: number) => (t.n ? Math.round((n / t.n) * 1000) / 10 : null);
      return {
        ...semEuros(await resumo(ctx, segs, de, ate, totais), valores),
        conversao: iniciados ? Math.round((t.n / iniciados) * 1000) / 10 : null,
        idaVolta: pct(t.iv),
        aeroporto: pct(t.ae),
        noturnas: pct(t.no),
        antecedencia: t.an ? Math.round((t.as / t.an) * 10) / 10 : null,
        canceladas: funil.get("canceladas")?.n ?? 0,
        extras: valores ? arred(t.x) : 0,
      };
    };

    const serieViagens = j.baldes.map(() => 0);
    const serieFaturacao = j.baldes.map(() => 0);
    for (const r of await daSerie(ctx, j, segs, j.de, j.ate)) {
      const b = baldeDe(j, r.per);
      if (b < 0) continue;
      serieFaturacao[b]! += r.v;
      serieViagens[b]! += r.n;
    }
    const anoF = j.baldes.map(() => 0);
    const anoN = j.baldes.map(() => 0);
    for (const r of await daSerie(ctx, j, segs, j.anoDe, j.anoAte)) {
      const b = baldeDe(j, r.per, true);
      if (b < 0) continue;
      anoF[b]! += r.v;
      anoN[b]! += r.n;
    }

    const grupos = await rowsIn(ctx, segs, ["total", "metodo", "origem", "viatura", "tipoCliente", "diaSemana", "hora", "antecedencia"], j.de, j.ate);
    const de_ = (dim: string) => grupos.filter((r) => r.dim === dim);
    const contagem = (dim: string) => byKey(de_(dim));

    const diaSemana = SEMANA.map((rotulo, i) => ({ rotulo, n: contagem("diaSemana").get(String(i))?.n ?? 0 }));
    const horasM = contagem("hora");
    const horas = Array.from({ length: 24 }, (_, h) => ({ rotulo: `${String(h).padStart(2, "0")}h`, n: horasM.get(String(h).padStart(2, "0"))?.n ?? 0 }));
    const antM = contagem("antecedencia");
    const antecedencia = ANTECEDENCIA.map((a, i) => ({ rotulo: a.rotulo, n: antM.get(String(i))?.n ?? 0 }));
    const tipos = contagem("tipoCliente");
    const canal = (seg: Seg, rotulo: string) => {
      const t = total(de_("total").filter((r) => r.seg === seg));
      return { rotulo, n: t.n, faturacao: valores ? arred(t.v) : 0 };
    };

    const rotas = (await topIn(ctx, segs, "rota", j.de, j.ate, 10)).map((r) => {
      const [origem, destino] = r.label ? (JSON.parse(r.label) as [string, string]) : [r.key, ""];
      return { origem, destino, n: r.n, faturacao: valores ? arred(r.v) : 0 };
    });

    return {
      valores,
      periodo: { de: j.de, ate: j.ate, antesDe: j.antesDe, antesAte: j.antesAte, dias: j.dias },
      granularidade: j.granularidade,
      baldes: j.baldes,
      agora: await indicadores(j.de, j.ate),
      antes: await indicadores(j.antesDe, j.antesAte),
      ano: await indicadores(j.anoDe, j.anoAte),
      serie: { viagens: serieViagens, faturacao: serieFaturacao.map((x) => (valores ? arred(x) : 0)) },
      serieAno: { viagens: anoN, faturacao: anoF.map((x) => (valores ? arred(x) : 0)) },
      /* Particulares ou empresas (NIF de empresa ou ligadas a uma organização). */
      particularesEmpresas: ["Particulares", "Empresas"].map((rotulo) => ({ rotulo, n: tipos.get(rotulo)?.n ?? 0, faturacao: valores ? arred(tipos.get(rotulo)?.v ?? 0) : 0 })),
      rotas,
      viaturas: painel(de_("viatura"), valores),
      metodos: painel(de_("metodo"), valores),
      origens: painel(de_("origem"), valores, false),
      canais: [canal("transfer:site", "Site"), ...(soSite ? [] : [canal("transfer:parceiro", "Parceiros")])]
        .filter((c) => c.n > 0 || c.faturacao > 0)
        .sort((a, b) => (valores ? b.faturacao - a.faturacao || b.n - a.n : b.n - a.n)),
      diaSemana,
      horas: horas.filter((h, i) => h.n > 0 || (i >= 6 && i <= 23)),
      antecedencia,
      topClientes: await topClientes(ctx, j, segs, valores),
    };
  },
});

/* ─── Tours e eventos ────────────────────────────────────────────────── */

export const tours = query({
  /* tipo: só tours ou só eventos (Finanças → Tours, Finanças → Eventos). */
  args: { ...vPeriodo, tipo: v.optional(v.union(v.literal("tour"), v.literal("evento"))) },
  handler: async (ctx, { de, ate, tipo }) => {
    const acesso = await lerAcesso(ctx);
    if (!acessoOuNull(acesso, "financas")) return null;
    const valores = temCapacidade(acesso, "valores");
    const j = janela(de, ate);
    if (!j) return null;
    const segs = tipo ? TOURS.filter((s) => produtoDe(s) === tipo) : TOURS;
    const agora = await rowsIn(ctx, segs, ["total"], j.de, j.ate);
    const ponto = (r: StatRow) => (valores ? r.v : r.n);

    const serie = { tour: j.baldes.map(() => 0), evento: j.baldes.map(() => 0) };
    const serieTotal = j.baldes.map(() => 0);
    for (const r of await daSerie(ctx, j, segs, j.de, j.ate)) {
      const b = baldeDe(j, r.per);
      if (b < 0) continue;
      const p = produtoDe(r.seg);
      if (p !== "transfer") serie[p][b]! += ponto(r);
      serieTotal[b]! += ponto(r);
    }
    const serieAno = j.baldes.map(() => 0);
    for (const r of await daSerie(ctx, j, segs, j.anoDe, j.anoAte)) {
      const b = baldeDe(j, r.per, true);
      if (b >= 0) serieAno[b]! += ponto(r);
    }

    const produtos = new Map<string, { rotulo: string; tipo: "tour" | "evento"; n: number; pessoas: number; faturacao: number }>();
    for (const r of await rowsIn(ctx, segs, ["produto"], j.de, j.ate)) {
      const t = produtoDe(r.seg) as "tour" | "evento";
      const k = `${t}|${r.key}`;
      const x = produtos.get(k) ?? { rotulo: r.key, tipo: t, n: 0, pessoas: 0, faturacao: 0 };
      x.n += r.n;
      x.pessoas += r.p;
      x.faturacao += r.v;
      produtos.set(k, x);
    }
    const porTipo = async (t: "tour" | "evento") => {
      const ss = segs.filter((x) => produtoDe(x) === t);
      return semEuros(await resumo(ctx, ss, j.de, j.ate, agora.filter((r) => ss.includes(r.seg as Seg))), valores);
    };
    return {
      valores,
      periodo: { de: j.de, ate: j.ate, antesDe: j.antesDe, antesAte: j.antesAte, dias: j.dias },
      granularidade: j.granularidade,
      baldes: j.baldes,
      agora: semEuros(await resumo(ctx, segs, j.de, j.ate, agora), valores),
      antes: semEuros(await resumo(ctx, segs, j.antesDe, j.antesAte), valores),
      ano: semEuros(await resumo(ctx, segs, j.anoDe, j.anoAte), valores),
      serieAno: serieAno.map(arred),
      serieTotal: serieTotal.map(arred),
      tours: await porTipo("tour"),
      eventos: await porTipo("evento"),
      serie: [
        { nome: "Tours", pontos: serie.tour.map(arred) },
        { nome: "Eventos", pontos: serie.evento.map(arred) },
      ],
      produtos: [...produtos.values()]
        .map((p) => ({ ...p, faturacao: valores ? arred(p.faturacao) : 0 }))
        .sort((a, b) => (valores ? b.faturacao - a.faturacao || b.n - a.n : b.n - a.n || b.faturacao - a.faturacao)),
      topClientes: await topClientes(ctx, j, segs, valores),
    };
  },
});

/* ─── Parceiros ──────────────────────────────────────────────────────── */

export const parceiros = query({
  args: vPeriodo,
  handler: async (ctx, { de, ate }) => {
    const acesso = await lerAcesso(ctx);
    if (!acessoOuNull(acesso, "financas")) return null;
    const valores = temCapacidade(acesso, "valores");
    const j = janela(de, ate);
    if (!j) return null;

    const doParceiro = (de: string, ate: string) => rowsIn(ctx, DE_PARCEIRO, ["parceiro"], de, ate);
    const agoraP = await doParceiro(j.de, j.ate);
    const antesP = byKey(await doParceiro(j.antesDe, j.antesAte));
    const clientesP = await partnerClients(ctx, DE_PARCEIRO, j.de, j.ate);
    const chaves = new Set([...agoraP.map((r) => r.key), ...antesP.keys()]);
    const ranking = (
      await Promise.all(
        [...chaves].map(async (k) => {
          const meus = agoraP.filter((r) => r.key === k);
          const t = total(meus);
          const a = antesP.get(k);
          return {
            rotulo: k,
            n: t.n,
            faturacao: valores ? arred(t.v) : 0,
            ticket: valores && t.n ? arred(t.v / t.n) : null,
            antesN: a?.n ?? 0,
            antesF: valores ? arred(a?.v ?? 0) : 0,
            ultima: t.n > 0 || t.v > 0 ? await latestDay(ctx, DE_PARCEIRO, "parceiro", k, j.ate) : null,
            clientes: clientesP.get(k) ?? 0,
          };
        }),
      )
    ).sort((a, b) => (valores ? b.faturacao - a.faturacao : 0) || b.n - a.n || b.antesN - a.antesN);

    /* Parceiros com página publicada e sem reservas no período. */
    const paginas = await ctx.db.query("partnerships").collect();
    const comReservas = new Set(ranking.filter((r) => r.n > 0).map((r) => r.rotulo.toLowerCase()));
    const inactivos = (
      await Promise.all(
        paginas
          /* Publicada é tudo o que não está «inactive» (parceiros.ts → publicada). */
          .filter((p) => p.status !== "inactive" && !comReservas.has(p.name.trim().toLowerCase()))
          .map(async (p) => ({ rotulo: p.name, ultima: await latestDay(ctx, DE_PARCEIRO, "parceiro", p.name.trim(), "9999-12-31"), desde: paraDia(p.createdAt ?? p._creationTime) })),
      )
    ).sort((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? "") || a.rotulo.localeCompare(b.rotulo, "pt"));
    const novos = paginas.filter((p) => em(j, paraDia(p.createdAt ?? p._creationTime), "agora")).length;

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
        if (em(j, paraDia(n.criadoEm), "agora")) {
          recebidas++;
          const r = tituloDaOrigem(n.origem);
          const x = porOrigem.get(r) ?? { rotulo: r, n: 0, faturacao: 0, ganhas: 0 };
          x.n++;
          porOrigem.set(r, x);
        }
        if (n.fechadoEm && em(j, paraDia(n.fechadoEm), "agora")) {
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

    const todasAgora = total(await rowsIn(ctx, SEGS_TODOS, ["total"], j.de, j.ate));
    const rP = await resumo(ctx, DE_PARCEIRO, j.de, j.ate);
    const rPB = await resumo(ctx, DE_PARCEIRO, j.antesDe, j.antesAte);
    const serie = j.baldes.map(() => 0);
    for (const r of await daSerie(ctx, j, DE_PARCEIRO, j.de, j.ate)) {
      const b = baldeDe(j, r.per);
      if (b >= 0) serie[b]! += valores ? r.v : r.n;
    }
    return {
      valores,
      periodo: { de: j.de, ate: j.ate, antesDe: j.antesDe, antesAte: j.antesAte, dias: j.dias },
      granularidade: j.granularidade,
      baldes: j.baldes,
      agora: {
        ...semEuros(rP, valores),
        activos: ranking.filter((r) => r.n > 0).length,
        peso: todasAgora.v ? Math.round((rP.faturacao / todasAgora.v) * 1000) / 10 : null,
        novos,
      },
      antes: { ...semEuros(rPB, valores), activos: ranking.filter((r) => r.antesN > 0).length },
      ano: semEuros(await resumo(ctx, DE_PARCEIRO, j.anoDe, j.anoAte), valores),
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

/* ─── Finanças → Resumo ──────────────────────────────────────────────── */

const SEGS_TODOS: Seg[] = [...TRANSFER, ...TOURS];

/*
 * O que um CFO pergunta primeiro: quanto ganhámos de verdade (líquido de
 * IVA e da taxa do cartão), se estamos a crescer face ao mesmo período do
 * ano passado, de onde vem o dinheiro, quanto já está garantido para os
 * próximos meses e onde está o risco (concentração, cancelamentos pagos).
 * IVA e taxa do cartão são estimativas (lib/orderStats.ts).
 */
export const resumoFinancas = query({
  args: { ...vPeriodo, hoje: v.string() },
  handler: async (ctx, { de, ate, hoje }) => {
    const acesso = await lerAcesso(ctx);
    if (!acessoOuNull(acesso, "financas")) return null;
    const valores = temCapacidade(acesso, "valores");
    const j = janela(de, ate);
    if (!j || !DIA.test(hoje)) return null;

    const contas = (rows: StatRow[]) => {
      const t = total(rows);
      return {
        bruto: arred(t.v),
        liquido: arred(t.liq),
        iva: arred(t.v - t.liq - t.tx),
        taxas: arred(t.tx),
        servicos: t.n,
        ticket: t.n ? arred(t.v / t.n) : null,
      };
    };
    const zero = <T extends Record<string, number | null>>(x: T): T =>
      valores ? x : (Object.fromEntries(Object.entries(x).map(([k, val]) => [k, k === "servicos" ? val : k === "ticket" ? null : 0])) as T);

    const totais = (de: string, ate: string) => rowsIn(ctx, SEGS_TODOS, ["total"], de, ate);
    const agora = await totais(j.de, j.ate);
    const antes = await totais(j.antesDe, j.antesAte);
    const ano = await totais(j.anoDe, j.anoAte);

    /* De onde vem o dinheiro: as quatro linhas, agora e há um ano. */
    const porLinha = LINHAS_NEGOCIO.map((linha) => {
      const segs = SEGS_DA_LINHA[linha];
      const a = total(agora.filter((r) => segs.includes(r.seg as Seg)));
      const y = total(ano.filter((r) => segs.includes(r.seg as Seg)));
      return { linha, servicos: a.n, liquido: valores ? arred(a.liq) : 0, liquidoAno: valores ? arred(y.liq) : 0 };
    });

    /* A evolução: receita líquida por balde, este período e o mesmo do ano passado. */
    const serie = j.baldes.map(() => 0);
    const serieAno = j.baldes.map(() => 0);
    for (const r of await daSerie(ctx, j, SEGS_TODOS, j.de, j.ate)) {
      const b = baldeDe(j, r.per);
      if (b >= 0) serie[b]! += r.liq;
    }
    for (const r of await daSerie(ctx, j, SEGS_TODOS, j.anoDe, j.anoAte)) {
      const b = baldeDe(j, r.per, true);
      if (b >= 0) serieAno[b]! += r.liq;
    }

    /* Garantido: viagens já pagas que ainda vão acontecer, pela data da
       viagem, dos agregados das encomendas (soma de todas as pernas, uma
       viagem por ida). */
    const garantido = [];
    for (const dias of [30, 60, 90]) {
      const limite = deIndice(indiceDia(hoje) + dias);
      const bounds = { lower: { key: hoje, inclusive: true }, upper: { key: limite + "￿", inclusive: false } };
      garantido.push({
        dias,
        valor: valores ? arred(await facts.sum(ctx, { namespace: ["trip", "reservas"], bounds })) : 0,
        servicos: await facts.count(ctx, { namespace: ["svc", "reservas"], bounds }),
      });
    }

    /* Concentração: quanto vale o top 5 de clientes e de parceiros. */
    const totalAgora = total(agora).v;
    const topClientes5 = (await topIn(ctx, SEGS_TODOS, "cliente", j.de, j.ate, 5)).reduce((s, x) => s + x.v, 0);
    const topParceiros5 = [...byKey(await rowsIn(ctx, DE_PARCEIRO, ["parceiro"], j.de, j.ate)).values()]
      .map((x) => x.v)
      .sort((a, b) => b - a)
      .slice(0, 5)
      .reduce((s, x) => s + x, 0);
    const parte = (x: number) => (totalAgora ? Math.round((x / totalAgora) * 1000) / 10 : null);

    /* Perdas: canceladas depois de pagas (o dinheiro entrou e saiu). */
    const perdas = byKey(await rowsIn(ctx, SEGS_TODOS, ["funil"], j.de, j.ate)).get("perdas");

    return {
      valores,
      periodo: { de: j.de, ate: j.ate, antesDe: j.antesDe, antesAte: j.antesAte, anoDe: j.anoDe, anoAte: j.anoAte, dias: j.dias },
      granularidade: j.granularidade,
      baldes: j.baldes,
      agora: zero(contas(agora)),
      antes: zero(contas(antes)),
      ano: zero(contas(ano)),
      porLinha,
      serie: { agora: serie.map((x) => (valores ? arred(x) : 0)), ano: serieAno.map((x) => (valores ? arred(x) : 0)) },
      garantido,
      concentracao: { clientes: parte(topClientes5), parceiros: parte(topParceiros5) },
      perdas: { canceladas: perdas?.n ?? 0, valor: valores ? arred(perdas?.v ?? 0) : 0 },
    };
  },
});

/* O módulo «financas» aos cargos que já viam os euros («Ver valores e
   faturação»), só para ver. Pode correr mais de uma vez.
     npx convex run estatistica:darAcessoFinancas */
export const darAcessoFinancas = internalMutation({
  args: {},
  handler: async (ctx) => {
    const feitos: string[] = [];
    for (const c of await ctx.db.query("cargos").collect()) {
      if (c.permissoes.some((p) => p.modulo === "financas")) continue;
      if (!(c.capacidades ?? []).includes("valores")) continue;
      await ctx.db.patch(c._id, { permissoes: [...c.permissoes, { modulo: "financas", nivel: "ver" }], actualizadoEm: Date.now() });
      feitos.push(c.nome);
    }
    return feitos;
  },
});
