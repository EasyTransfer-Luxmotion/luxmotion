import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/*
 * The six request forms of the site (Operação → Pedidos): their tables,
 * states, the three groups they share and the one line each shows. Moved here
 * from pedidos.ts so the trigger that files them (lib/orderFacts.ts) and the
 * inbox use the same rules.
 */

export const vTipo = v.union(
  v.literal("contactos"),
  v.literal("orcamentos"),
  v.literal("ultraluxo"),
  v.literal("casamentos"),
  v.literal("escolas"),
  v.literal("corporate"),
);
export type Tipo = typeof vTipo.type;
export type Grupo = "porTratar" | "emCurso" | "fechados";

export const TABELA = {
  contactos: "contactSubmissions",
  orcamentos: "contactQuotes",
  ultraluxo: "tourInquiries",
  casamentos: "weddingQuoteSubmissions",
  escolas: "schoolQuoteSubmissions",
  corporate: "corporateRequests",
} as const;

/* Os estados que cada tabela aceita, pela ordem em que se mostram. */
export const ESTADOS: Record<Tipo, readonly string[]> = {
  contactos: ["new", "read", "archived"],
  orcamentos: ["new", "inProgress", "resolved", "archived"],
  ultraluxo: ["new", "read", "archived"],
  casamentos: ["new", "read", "archived"],
  escolas: ["new", "read", "archived"],
  corporate: ["submitted", "reviewing", "approved", "rejected"],
};

/* Sem estado gravado é "novo": o campo é opcional em quatro tabelas, e os
   pedidos antigos não o têm (é a mesma regra do contador). */
export function estadoDe(tipo: Tipo, status: string | undefined): string {
  return status ?? (tipo === "corporate" ? "submitted" : "new");
}
export function grupoDe(estado: string): Grupo {
  if (estado === "new" || estado === "submitted") return "porTratar";
  if (estado === "read" || estado === "inProgress" || estado === "reviewing") return "emCurso";
  return "fechados";
}

export type Qualquer =
  | Doc<"contactSubmissions">
  | Doc<"contactQuotes">
  | Doc<"tourInquiries">
  | Doc<"weddingQuoteSubmissions">
  | Doc<"schoolQuoteSubmissions">
  | Doc<"corporateRequests">;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function dataCurta(s: string | number | undefined): string | null {
  if (s === undefined || s === "") return null;
  const d = typeof s === "number" ? new Date(s) : new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (!Number.isFinite(d.getTime())) return String(s);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/* Milhares sempre separados: em pt-PT o Intl deixa "2500 €" sem espaço e
   "12 000 €" com ele, e lado a lado parecia um erro. À mão porque o
   useGrouping: "always" não existe na versão de TypeScript do Convex. */
const euros = (n: number | undefined) =>
  typeof n === "number" ? `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")}\u00a0€` : null;

/* O nome e uma linha que diga do que se trata, para a lista. */
export function resumo(tipo: Tipo, d: Qualquer): { nome: string; empresa: string | null; linha: string } {
  const partes = (xs: (string | number | null | undefined | false)[]) => xs.filter(Boolean).join(" · ");
  switch (tipo) {
    case "contactos": {
      const x = d as Doc<"contactSubmissions">;
      return { nome: x.name, empresa: null, linha: x.message.replace(/\s+/g, " ").trim() };
    }
    case "orcamentos": {
      const x = d as Doc<"contactQuotes">;
      return { nome: x.fullName, empresa: x.company || null, linha: partes([x.subject, x.message.replace(/\s+/g, " ").trim()]) };
    }
    case "ultraluxo": {
      const x = d as Doc<"tourInquiries">;
      return {
        nome: x.name,
        empresa: null,
        linha: partes([x.tourTitle || "Itinerário à medida", x.people && `${x.people} pessoas`, x.date ? dataCurta(x.date) : x.datesFlexible && "datas flexíveis"]),
      };
    }
    case "casamentos": {
      const x = d as Doc<"weddingQuoteSubmissions">;
      return { nome: x.fullName, empresa: null, linha: partes([dataCurta(x.weddingDate), x.guests && `${x.guests} convidados`, x.venue, euros(x.budget)]) };
    }
    case "escolas": {
      const x = d as Doc<"schoolQuoteSubmissions">;
      return { nome: x.name, empresa: null, linha: partes([x.route, x.children && `${x.children} crianças`, euros(x.budget)]) };
    }
    case "corporate": {
      const x = d as Doc<"corporateRequests">;
      return { nome: x.fullName, empresa: x.companyName || null, linha: partes([dataCurta(x.eventDate), x.guests && `${x.guests} convidados`, x.vehicleType, euros(x.budget)]) };
    }
  }
}

export const TIPOS = Object.keys(TABELA) as Tipo[];
export const GRUPOS: readonly Grupo[] = ["porTratar", "emCurso", "fechados"];
export const TIPO_DA_TABELA = Object.fromEntries(TIPOS.map((t) => [TABELA[t], t])) as Record<(typeof TABELA)[Tipo], Tipo>;
