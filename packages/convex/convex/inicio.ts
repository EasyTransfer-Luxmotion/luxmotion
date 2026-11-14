import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { avaliarAcesso } from "./lib/admin";

/*
 * O Início do dashboard: os serviços de um dia, por hora.
 *
 * Os mesmos estados que o contador "hoje" da sidebar (contadores.ts) — pagas,
 * confirmadas e feitas. Rascunhos e pendentes são carrinhos por pagar, e as
 * canceladas não são serviço; mostrá-los aqui era pôr a operação a olhar para
 * viagens que não vão acontecer.
 *
 * null sem acesso, como as outras queries que o dashboard chama de cima.
 */

const ESTADOS_DE_SERVICO = new Set(["paid", "confirmed", "completed"]);
/* Um dia com mais do que isto já não cabe numa lista para ler de relance; a
   lista de Reservas continua a ter tudo. */
const MAXIMO = 200;

function local(p: { location?: string; name?: string } | undefined): string {
  return p?.name?.trim() || p?.location?.trim() || "—";
}

export const servicos = query({
  /* AAAA-MM-DD em Lisboa, vindo do browser (ver contadores.porTratar). */
  args: { dia: v.string() },
  handler: async (ctx, { dia }) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { linhas: [], mais: false };

    const docs = await ctx.db
      .query("orders")
      .withIndex("by_departure_date", (q) => q.gte("departureDate", dia).lt("departureDate", dia + "￿"))
      .take(MAXIMO * 3);
    const doDia = docs.filter((o) => ESTADOS_DE_SERVICO.has(o.status));

    /*
     * Ida e regresso são duas linhas ligadas por relatedOrderId nos dois
     * sentidos (orders.create). A ida é a mais antiga das duas — são criadas
     * na mesma mutation, a ida primeiro. O regresso nasce sem os dados do
     * cliente, que ficam na ida: sem ir buscá-la, a linha do regresso não
     * dizia de quem era.
     */
    const relacionadas = new Map<string, Doc<"orders"> | null>();
    await Promise.all(
      doDia
        .filter((o) => o.relatedOrderId)
        .map(async (o) => relacionadas.set(o._id, await ctx.db.get(o.relatedOrderId!))),
    );

    const linhas = doDia.slice(0, MAXIMO).map((o) => {
      const outra = relacionadas.get(o._id) ?? null;
      const perna: "ida" | "regresso" | null = outra
        ? o._creationTime > outra._creationTime
          ? "regresso"
          : "ida"
        : null;
      return {
        _id: o._id,
        orderNumber: o.orderNumber ?? "",
        hora: o.departureDate.slice(11, 16) || null,
        cliente: o.passengerName?.trim() || o.customerName?.trim() || outra?.customerName?.trim() || null,
        origem: local(o.departure),
        destino: local(o.arrival),
        passageiros: o.passengers,
        veiculo: o.vehicleName ?? outra?.vehicleName ?? null,
        voo: o.flightNumber ?? null,
        status: o.status,
        paymentStatus: o.paymentStatus ?? null,
        perna,
        tour: Boolean(o.tourBookingId) || (o.orderNumber ?? "").startsWith("TB"),
      };
    });
    linhas.sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99"));
    return { linhas, mais: doDia.length > MAXIMO };
  },
});
