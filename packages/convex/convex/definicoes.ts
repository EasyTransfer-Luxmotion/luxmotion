import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { exigirAdmin } from "./lib/admin";
import { siteSettingsDefaults } from "./siteSettings";
import { pricingConfigOf, tariffOf } from "./lib/pricing";
import { configAvaliacao } from "./lib/avaliacao";
import { marketingStatsDefaults } from "./marketingStats";
import { deIndice, indiceDia } from "./lib/orderLabels";
import { SEGS, rowsIn, total } from "./lib/orderStats";

/*
 * Configurações → Definições do site no dashboard (E4). Junta os dois
 * documentos únicos que o site lê: siteSettings (antecedência, sobretaxa de
 * aeroporto, câmbios, barra de anúncios, distâncias) e marketingStats (os
 * números de prova social).
 *
 * O site continua a ler pelo siteSettings.get e marketingStats.get. O que
 * muda em relação às funções antigas:
 *  - Uma gravação só, com conflito pelo updatedAt de cada documento; o ecrã
 *    antigo tinha seis botões de gravar e qualquer um gravava por cima.
 *  - Erros por campo e em português ("must be between 0 and 720").
 *  - Diz se cada documento existe: sem ele o site usa os valores do código, e
 *    no ecrã antigo não se distinguia uma coisa da outra.
 *  - Mostra as reservas reais de hoje ao lado dos números inventados: os
 *    "viajantes hoje" e "reservados hoje" do site são um número ao acaso
 *    entre o mínimo e o máximo daqui, não uma medida.
 */

const CHAVE = "global";
const diaLisboa = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" });

export const detalhe = query({
  /* O dia de hoje vem do browser (AAAA-MM-DD, Lisboa), como no Início. */
  args: { hoje: v.string() },
  handler: async (ctx, { hoje }) => {
    await exigirAdmin(ctx, "definicoes", "ver");
    const [site, mkt] = await Promise.all([
      ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", CHAVE)).first(),
      ctx.db.query("marketingStats").withIndex("by_key", (q) => q.eq("key", CHAVE)).first(),
    ]);
    const d = siteSettingsDefaults;
    const m = marketingStatsDefaults;

    /* As reservas de verdade dos últimos 30 dias, para comparar com os
       números que o site mostra: dos totais por dia (lib/orderStats.ts), não
       das encomendas, que a 10 000 por dia já não cabiam numa leitura. Ida e
       volta contam uma vez. */
    const hojeValido = /^\d{4}-\d{2}-\d{2}$/.test(hoje) ? hoje : diaLisboa.format(new Date());
    const linhas = await rowsIn(ctx, SEGS, ["total"], deIndice(indiceDia(hojeValido) - 29), hojeValido, true);
    const deHoje = total(linhas.filter((r) => r.per === hojeValido));
    const trinta = total(linhas);

    return {
      gravado: { site: Boolean(site), marketing: Boolean(mkt) },
      versao: { site: site?.updatedAt ?? null, marketing: mkt?.updatedAt ?? null },
      valores: {
        antecedenciaHoras: site?.minAdvanceBookingHours ?? d.minAdvanceBookingHours,
        cambios: site?.exchangeRates ?? { ...d.exchangeRates },
        anunciosLigados: site?.announcementsEnabled ?? d.announcementsEnabled,
        anuncios: site?.announcements ?? [],
        raioPesquisaTours: site?.toursSearchRadiusKm ?? d.toursSearchRadiusKm,
        raioCheckoutTours: site?.checkoutToursRadiusKm ?? d.checkoutToursRadiusKm,
        raioCheckoutExtras: site?.checkoutUpsellRadiusKm ?? d.checkoutUpsellRadiusKm,
        trustpilot: mkt?.trustpilotReviewCount ?? m.trustpilotReviewCount,
        viajantesHomeMin: mkt?.heroDailyTravelersMin ?? m.heroDailyTravelersMin,
        viajantesHomeMax: mkt?.heroDailyTravelersMax ?? m.heroDailyTravelersMax,
        viajantesTourMin: mkt?.detailDailyTravelersMin ?? m.detailDailyTravelersMin,
        viajantesTourMax: mkt?.detailDailyTravelersMax ?? m.detailDailyTravelersMax,
        reservadosCheckoutMin: mkt?.checkoutBookedTodayMin ?? m.checkoutBookedTodayMin,
        reservadosCheckoutMax: mkt?.checkoutBookedTodayMax ?? m.checkoutBookedTodayMax,
      },
      reais: {
        reservasHoje: deHoje.n,
        mediaDiaria30: Math.round((trinta.n / 30) * 10) / 10,
        passageirosHoje: deHoje.p,
      },
    };
  },
});

export const guardar = mutation({
  args: {
    versao: v.object({ site: v.union(v.number(), v.null()), marketing: v.union(v.number(), v.null()) }),
    dados: v.object({
      antecedenciaHoras: v.number(),
      cambios: v.object({ BRL: v.number(), USD: v.number(), GBP: v.number() }),
      anunciosLigados: v.boolean(),
      anuncios: v.array(v.string()),
      raioPesquisaTours: v.number(),
      raioCheckoutTours: v.number(),
      raioCheckoutExtras: v.number(),
      trustpilot: v.number(),
      viajantesHomeMin: v.number(),
      viajantesHomeMax: v.number(),
      viajantesTourMin: v.number(),
      viajantesTourMax: v.number(),
      reservadosCheckoutMin: v.number(),
      reservadosCheckoutMax: v.number(),
    }),
  },
  handler: async (ctx, { versao, dados: d }) => {
    await exigirAdmin(ctx, "definicoes");
    const erros: Record<string, string> = {};
    const entre = (campo: string, n: number, min: number, max: number, inteiro = true, msg?: string) => {
      if (!Number.isFinite(n) || (inteiro && !Number.isInteger(n)) || n < min || n > max) erros[campo] = msg ?? `${inteiro ? "Um número inteiro" : "Um número"} de ${min} a ${max}.`;
    };
    /* 0 é sem restrição; 720 horas são 30 dias. */
    entre("antecedenciaHoras", d.antecedenciaHoras, 0, 720);
    for (const k of ["BRL", "USD", "GBP"] as const) entre(`cambio.${k}`, d.cambios[k], 0.01, 1000, false, "Quantas unidades valem 1 €: maior que 0.");
    entre("raioPesquisaTours", d.raioPesquisaTours, 1, 500);
    entre("raioCheckoutTours", d.raioCheckoutTours, 1, 500);
    entre("raioCheckoutExtras", d.raioCheckoutExtras, 1, 500);
    const anuncios = d.anuncios.map((a) => a.trim()).filter(Boolean);
    if (anuncios.length > 10) erros.anuncios = "No máximo 10 mensagens.";
    anuncios.forEach((a, i) => {
      if (a.length > 160) erros[`anuncio.${i}`] = "No máximo 160 caracteres.";
    });
    if (d.anunciosLigados && anuncios.length === 0) erros.anuncios = "Ligada sem mensagens, a barra não aparece. Escreva uma ou desligue-a.";
    entre("trustpilot", d.trustpilot, 0, 1_000_000);
    for (const [min, max] of [
      ["viajantesHomeMin", "viajantesHomeMax"],
      ["viajantesTourMin", "viajantesTourMax"],
      ["reservadosCheckoutMin", "reservadosCheckoutMax"],
    ] as const) {
      entre(min, d[min], 0, 100_000);
      entre(max, d[max], 0, 100_000);
      if (!erros[min] && !erros[max] && d[min] > d[max]) erros[max] = "Não pode ser menor que o mínimo.";
    }
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const [site, mkt] = await Promise.all([
      ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", CHAVE)).first(),
      ctx.db.query("marketingStats").withIndex("by_key", (q) => q.eq("key", CHAVE)).first(),
    ]);
    if ((site?.updatedAt ?? null) !== versao.site || (mkt?.updatedAt ?? null) !== versao.marketing) {
      throw new ConvexError({ tipo: "conflito", mensagem: "Alguém gravou estas definições depois de abrir o ecrã. Veja a versão actual antes de gravar por cima." });
    }

    const agora = Date.now();
    const tSite = Math.max(agora, (site?.updatedAt ?? 0) + 1);
    const tMkt = Math.max(agora, (mkt?.updatedAt ?? 0) + 1);
    const registoSite = {
      key: CHAVE,
      minAdvanceBookingHours: d.antecedenciaHoras,
      exchangeRates: d.cambios,
      announcementsEnabled: d.anunciosLigados,
      announcements: anuncios,
      toursSearchRadiusKm: d.raioPesquisaTours,
      checkoutToursRadiusKm: d.raioCheckoutTours,
      checkoutUpsellRadiusKm: d.raioCheckoutExtras,
      updatedAt: tSite,
    };
    /* reviewCountBoost não se mexe: o site não o lê, fica como está. */
    const registoMkt = {
      key: CHAVE,
      trustpilotReviewCount: d.trustpilot,
      heroDailyTravelersMin: d.viajantesHomeMin,
      heroDailyTravelersMax: d.viajantesHomeMax,
      detailDailyTravelersMin: d.viajantesTourMin,
      detailDailyTravelersMax: d.viajantesTourMax,
      checkoutBookedTodayMin: d.reservadosCheckoutMin,
      checkoutBookedTodayMax: d.reservadosCheckoutMax,
      updatedAt: tMkt,
    };
    if (site) await ctx.db.patch(site._id, registoSite);
    else await ctx.db.insert("siteSettings", registoSite);
    if (mkt) await ctx.db.patch(mkt._id, registoMkt);
    else await ctx.db.insert("marketingStats", registoMkt);
    return { versao: { site: tSite, marketing: tMkt } };
  },
});

/* ─────────────────────── Preços (transfer pricing levers) ─────────────────
 *
 * Saved apart from the rest of the screen: a mistake here changes what every
 * customer pays. The airport surcharge lives here since 2026-11-27 (it was
 * in Definições do site, away from the rest of the price). */

const vSurge = v.object({ sameDay: v.number(), lastMinute: v.number() });
const vPricing = v.object({
  bands: v.array(v.object({ upToKm: v.union(v.number(), v.null()), pct: v.number() })),
  surge: v.object({ standard: vSurge, van: vSurge, large: vSurge }),
  freeAfterHours: v.number(),
  lastMinuteHours: v.number(),
  earlyMorningFrom: v.number(),
  earlyMorningTo: v.number(),
  partnerFactor: v.number(),
  nightFrom: v.number(),
  nightTo: v.number(),
  extras: v.object({ childSeat: v.number(), surfboard: v.number(), pet: v.number() }),
});

export const precos = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "definicoes", "ver");
    const site = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", CHAVE)).first();
    return {
      versao: site?.updatedAt ?? null,
      precos: pricingConfigOf(site?.pricing),
      sobretaxaAeroporto: site?.airportSurchargePercent ?? siteSettingsDefaults.airportSurchargePercent,
      /* Active cars still without a tariff: the checkout hides them. */
      semTarifa: (await ctx.db.query("vehicles").withIndex("by_status", (q) => q.eq("status", "active")).collect())
        .filter((c) => !tariffOf(c))
        .map((c) => ({ id: c._id, nome: c.name })),
    };
  },
});

export const guardarPrecos = mutation({
  args: { versao: v.union(v.number(), v.null()), precos: vPricing, sobretaxaAeroporto: v.number() },
  handler: async (ctx, { versao, precos: p, sobretaxaAeroporto }) => {
    await exigirAdmin(ctx, "definicoes");
    const erros: Record<string, string> = {};
    const entre = (campo: string, n: number, min: number, max: number, msg: string) => {
      if (!Number.isFinite(n) || n < min || n > max) erros[campo] = msg;
    };
    if (p.bands.length === 0) erros.bands = "Pelo menos uma banda.";
    p.bands.forEach((b, i) => {
      const last = i === p.bands.length - 1;
      if (last && b.upToKm !== null) erros[`bands.${i}.upToKm`] = "A última banda não tem fim.";
      if (!last && (b.upToKm === null || !(b.upToKm > (p.bands[i - 1]?.upToKm ?? 0)))) erros[`bands.${i}.upToKm`] = "Mais km do que a banda anterior.";
      entre(`bands.${i}.pct`, b.pct, 0.1, 2, "Entre 10% e 200% da taxa.");
    });
    for (const k of ["standard", "van", "large"] as const) {
      entre(`surge.${k}.sameDay`, p.surge[k].sameDay, 1, 3, "Entre ×1 e ×3.");
      entre(`surge.${k}.lastMinute`, p.surge[k].lastMinute, 1, 3, "Entre ×1 e ×3.");
    }
    entre("freeAfterHours", p.freeAfterHours, 0, 168, "De 0 a 168 horas.");
    entre("lastMinuteHours", p.lastMinuteHours, 0, p.freeAfterHours, "Menos horas do que o limite sem acréscimo.");
    entre("earlyMorningFrom", p.earlyMorningFrom, 0, 23, "Uma hora de 0 a 23.");
    entre("earlyMorningTo", p.earlyMorningTo, p.earlyMorningFrom, 24, "Depois da hora de início.");
    entre("partnerFactor", p.partnerFactor, 0.5, 2, "Entre ×0,5 e ×2.");
    entre("nightFrom", p.nightFrom, 0, 23, "Uma hora de 0 a 23.");
    entre("nightTo", p.nightTo, 0, 23, "Uma hora de 0 a 23.");
    if (p.nightFrom === p.nightTo) erros.nightTo = "Diferente da hora de início.";
    for (const k of ["childSeat", "surfboard", "pet"] as const) entre(`extras.${k}`, p.extras[k], 0, 500, "De 0 a 500 €.");
    entre("sobretaxaAeroporto", sobretaxaAeroporto, 0, 100, "De 0 a 100%.");
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });

    const site = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", CHAVE)).first();
    if ((site?.updatedAt ?? null) !== versao) {
      throw new ConvexError({ tipo: "conflito", mensagem: "Alguém gravou estas definições depois de abrir o ecrã. Veja a versão atual antes de gravar por cima." });
    }
    const t = Math.max(Date.now(), (site?.updatedAt ?? 0) + 1);
    if (site) await ctx.db.patch(site._id, { pricing: p, airportSurchargePercent: sobretaxaAeroporto, updatedAt: t });
    else
      await ctx.db.insert("siteSettings", {
        key: CHAVE,
        minAdvanceBookingHours: siteSettingsDefaults.minAdvanceBookingHours,
        pricing: p,
        airportSurchargePercent: sobretaxaAeroporto,
        updatedAt: t,
      });
    return { versao: t };
  },
});

/* ─────────────── Avaliação de candidaturas (spec v1.0, 5.5) ─────────────── */

export const avaliacao = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "definicoes", "ver");
    const site = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", CHAVE)).first();
    return { versao: site?.updatedAt ?? null, avaliacao: configAvaliacao(site?.avaliacaoCandidaturas) };
  },
});

export const guardarAvaliacao = mutation({
  args: {
    versao: v.union(v.number(), v.null()),
    avaliacao: v.object({
      criterios: v.array(v.object({ chave: v.string(), titulo: v.string(), peso: v.number() })),
      limiteAprovar: v.number(),
      limiteRever: v.number(),
    }),
  },
  handler: async (ctx, { versao, avaliacao: a }) => {
    await exigirAdmin(ctx, "definicoes");
    const erros: Record<string, string> = {};
    if (a.criterios.length === 0) erros.criterios = "Pelo menos um critério.";
    const chaves = new Set<string>();
    a.criterios.forEach((c, i) => {
      if (!c.titulo.trim()) erros[`criterios.${i}.titulo`] = "Dê um nome ao critério.";
      if (!Number.isFinite(c.peso) || c.peso <= 0 || c.peso > 100) erros[`criterios.${i}.peso`] = "Um peso de 1 a 100.";
      if (chaves.has(c.chave)) erros[`criterios.${i}.titulo`] = "Critério repetido.";
      chaves.add(c.chave);
    });
    if (!(a.limiteRever >= 0 && a.limiteRever < a.limiteAprovar && a.limiteAprovar <= 100)) {
      erros.limites = "O limite para aprovar tem de ser maior do que o de rever, e no máximo 100.";
    }
    if (Object.keys(erros).length) throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });
    const site = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", CHAVE)).first();
    /* Its own section of the settings page, saved on its own: it doesn't
       move the page's version (updatedAt), or saving it made the rest of
       the page refuse to save («alguém gravou»). `versao` is kept for the
       callers and not checked: a criteria list edited by two at once is
       rare and the last one wins. */
    void versao;
    const limpo = { ...a, criterios: a.criterios.map((c) => ({ ...c, titulo: c.titulo.trim() })) };
    if (site) await ctx.db.patch(site._id, { avaliacaoCandidaturas: limpo });
    else await ctx.db.insert("siteSettings", { key: CHAVE, minAdvanceBookingHours: siteSettingsDefaults.minAdvanceBookingHours, avaliacaoCandidaturas: limpo });
    return { versao: site?.updatedAt ?? null };
  },
});
