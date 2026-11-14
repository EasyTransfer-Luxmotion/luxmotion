import { v } from "convex/values";
import { query } from "./_generated/server";
import { avaliarAcesso } from "./lib/admin";

/*
 * O ⌘K do dashboard: encontrar uma reserva pelo número e abri-la.
 *
 * Só pelo início do número (ET…), que é um intervalo do índice
 * by_order_number — a lista de reservas carrega a tabela inteira para
 * pesquisar por nome, e a pesquisa corre a cada tecla.
 *
 * null em vez de erro sem acesso: o ⌘K vive na moldura do dashboard, acima do
 * error.tsx, e um erro aqui derrubava o back-office inteiro.
 */

function rotaDe(o: { departure?: { location?: string }; arrival?: { location?: string } }) {
  return `${o.departure?.location ?? "—"} → ${o.arrival?.location ?? "—"}`;
}

export const reservas = query({
  args: { texto: v.string() },
  handler: async (ctx, { texto }) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const prefixo = texto.trim().toUpperCase().replace(/\s+/g, "");
    if (prefixo.length < 3) return [];
    const docs = await ctx.db
      .query("orders")
      .withIndex("by_order_number", (q) => q.gte("orderNumber", prefixo).lt("orderNumber", prefixo + "￿"))
      .take(6);
    return docs.map((o) => ({
      _id: o._id,
      orderNumber: o.orderNumber ?? "",
      status: o.status,
      departureDate: o.departureDate,
      customerName: o.customerName ?? null,
      rota: rotaDe(o),
    }));
  },
});

/* A reserva inteira para o painel de detalhe, com a mesma forma das linhas de
   orders.listPaged — é o que o painel espera. */
export const reserva = query({
  args: { numero: v.string() },
  handler: async (ctx, { numero }) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    const o = await ctx.db
      .query("orders")
      .withIndex("by_order_number", (q) => q.eq("orderNumber", numero.trim().toUpperCase()))
      .first();
    if (!o) return null;
    return {
      ...o,
      adSourceName: o.adSource?.utmSource?.trim().toLowerCase() || "",
      routeLabel: rotaDe(o),
    };
  },
});
