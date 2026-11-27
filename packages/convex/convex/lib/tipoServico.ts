import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/*
 * The type of service, one list for Reservas and Orçamentos (dashboard spec
 * v1.0, 2.2 and 3.3): Transfer, Tour, Casamento, Corporate, Escolas, Ultra
 * Luxo, Eventos. A quote gets it from its form (or, made by hand, from the
 * card's segment); a booking from what was booked — a tour, an event — or
 * from the quote it came from.
 */

export const TIPOS_SERVICO = [
  { id: "transfer", titulo: "Transfer" },
  { id: "tour", titulo: "Tour" },
  { id: "casamento", titulo: "Casamento" },
  { id: "corporate", titulo: "Corporate" },
  { id: "escolas", titulo: "Escolas" },
  { id: "ultra", titulo: "Ultra Luxo" },
  { id: "eventos", titulo: "Eventos" },
] as const;

export type TipoServico = (typeof TIPOS_SERVICO)[number]["id"];

const IDS = new Set<string>(TIPOS_SERVICO.map((t) => t.id));
export const eTipoServico = (x: unknown): x is TipoServico => typeof x === "string" && IDS.has(x);
export const tituloDoTipo = (id: string | null | undefined) => TIPOS_SERVICO.find((t) => t.id === id)?.titulo ?? null;

/* A quote request by its form. The contact form says nothing about the
   service: it has none until someone sets it on the card. */
export function tipoDaOrigem(origem: string): TipoServico | null {
  switch (origem) {
    case "weddingQuoteSubmissions":
      return "casamento";
    case "tourInquiries":
      return "ultra";
    case "contactQuotes":
    case "corporateRequests":
      return "corporate";
    case "schoolQuoteSubmissions":
      return "escolas";
    default:
      return null;
  }
}

/* A card's segment, old names included (cards made by hand before the
   types, lib/funis.ts SEGMENTOS.medida). */
export function tipoDoSegmento(segmento: string | null | undefined): TipoServico | null {
  if (!segmento) return null;
  if (eTipoServico(segmento)) return segmento;
  const s = segmento.toLowerCase();
  if (s.startsWith("casament")) return "casamento";
  if (s.startsWith("ultra")) return "ultra";
  if (s.startsWith("corporate")) return "corporate";
  if (s.startsWith("escola")) return "escolas";
  if (s.startsWith("evento")) return "eventos";
  if (s === "tour" || s === "tours") return "tour";
  if (s === "transfer" || s === "transfers") return "transfer";
  return null;
}

/* A quote card: the type set on the card wins over the form's. */
export function tipoDoPedido(n: Pick<Doc<"negocios">, "segmento" | "origem">): TipoServico | null {
  return tipoDoSegmento(n.segmento) ?? tipoDaOrigem(n.origem);
}

/* A booking: what was converted from a quote keeps that type; a tour or an
   event bought in the checkout is that; a wedding partner's page sells
   weddings; everything else is a transfer. */
export async function tipoDaEncomenda(ctx: Pick<QueryCtx, "db">, o: Doc<"orders">): Promise<TipoServico> {
  if (eTipoServico(o.tipoServico)) return o.tipoServico;
  if (o.tourBookingId) {
    const b = await ctx.db.get(o.tourBookingId);
    if (b?.productType === "event") return "eventos";
    if (b?.tourId) {
      const tour = await ctx.db.get(b.tourId);
      if (tour?.isUltraLuxury) return "ultra";
    }
    return "tour";
  }
  if ((o.orderNumber ?? "").startsWith("TB")) return "tour";
  if (o.partnershipId) {
    const p = await ctx.db.get(o.partnershipId);
    if (p?.landingTemplate === "wedding-whitelabel") return "casamento";
  }
  return "transfer";
}
