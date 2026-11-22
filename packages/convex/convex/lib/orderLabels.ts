import type { Doc } from "../_generated/dataModel";
import { codigoDoAeroporto } from "./aeroportos";

/*
 * How the back-office names and dates an order: the place, the Lisbon day,
 * the payment method, the ad source, the partner. Shared by the Início, the
 * statistics and the order stats (lib/orderStats.ts); moved here from
 * inicio.ts, which still exports them.
 */

export const ESTADOS_DE_SERVICO = new Set(["paid", "confirmed", "completed"]);

/*
 * O nome curto de um local, para as rotas e os serviços do Início.
 *
 * Aeroportos pelo código (o dashboard mostra o avião e "LIS"), reconhecidos
 * pelas coordenadas: um cliente com o browser em ucraniano gravou o aeroporto
 * de Lisboa como "Міжнародний аеропорт Портела, Alameda das Comunidades
 * Portuguesas, 1700-111 Lisboa, Портуґалія", que enchia o painel das rotas e
 * não se juntava às outras viagens do mesmo aeroporto. Sem nome curto (o
 * Google nem sempre o dá), fica o primeiro troço da morada.
 */
export function local(p: { location?: string; name?: string; lat?: number; lng?: number; placeId?: string } | undefined): string {
  if (!p) return "—";
  const codigo = codigoDoAeroporto(p);
  if (codigo) return `Aeroporto (${codigo})`;
  const nome = p.name?.trim() || p.location?.split(",")[0]?.trim() || p.location?.trim();
  if (!nome) return "—";
  /* "2655 Ericeira" e "Ericeira" são o mesmo sítio: o código postal à
     frente partia a mesma rota em duas. */
  return nome.replace(/^\d{4}(-\d{3})?\s+/, "") || nome;
}

const diaLisboa = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" });
export const paraDia = (ms: number) => diaLisboa.format(new Date(ms));
/* Dias desde 1970 de uma data AAAA-MM-DD, para contas de semanas. */
export const indiceDia = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);
export const deIndice = (i: number) => new Date(i * 86_400_000).toISOString().slice(0, 10);
export const somarMeses = (mes: string, n: number) => {
  const t = +mes.slice(0, 4) * 12 + (+mes.slice(5, 7) - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

export function origemNoEndereco(o: Doc<"orders">): string {
  const s = o.adSource?.utmSource?.trim().toLowerCase();
  if (!s) return "Origem desconhecida";
  if (s.includes("google")) return "Google";
  if (s === "meta" || s.includes("facebook") || s.includes("instagram") || s === "fb" || s === "ig") return "Meta";
  if (s.includes("chatgpt") || s.includes("openai")) return "ChatGPT";
  return s;
}

/* Os códigos que o checkout e o webhook do Stripe gravam em paymentMethod. */
export const METODOS: Record<string, string> = {
  ccard: "Cartão",
  card: "Cartão",
  link: "Cartão (Stripe Link)",
  mbway: "MB WAY",
  mb: "Multibanco",
  multibanco: "Multibanco",
  /* O checkout deixou de os oferecer: desde 2026-07-08 só se paga pelo
     Stripe (cartão, MB WAY, Multibanco, Link). As reservas antigas continuam
     a contar na faturação dos períodos que as incluem; "(antigo)" no nome
     diz que já não se oferecem, sem uma nota a ocupar o painel. */
  cash: "Dinheiro (antigo)",
  transferencia: "Transferência (antiga)",
};
export const SEM_METODO = "Sem método registado";
/* "Easy Transfer" é o que orders.create grava quando não veio parceria no
   endereço: é o site, não um parceiro. Contá-lo como parceiro dizia que 97%
   das reservas vinham de parcerias. */
export const SEM_PARCEIRO = "Sem parceiro (site)";
export const parceiroDe = (o: Doc<"orders">) => {
  const p = o.partnershipName?.trim();
  return !p || p === "Easy Transfer" ? SEM_PARCEIRO : p;
};

