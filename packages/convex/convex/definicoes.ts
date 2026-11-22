import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { exigirAdmin } from "./lib/admin";
import { siteSettingsDefaults } from "./siteSettings";
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
        sobretaxaAeroporto: site?.airportSurchargePercent ?? d.airportSurchargePercent,
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
      sobretaxaAeroporto: v.number(),
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
    entre("sobretaxaAeroporto", d.sobretaxaAeroporto, 0, 100, false);
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
      airportSurchargePercent: d.sobretaxaAeroporto,
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
