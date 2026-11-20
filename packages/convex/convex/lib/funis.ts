/*
 * Os três funis do back-office — Reservas, Pedidos e Candidaturas — e o que
 * eles e o dashboard têm de dizer da mesma maneira: que origens caem em cada
 * um, que módulo de permissão o abre, as etapas com que começa e as cores.
 *
 * Não se criam nem se apagam funis: cada um destes ecrãs da Operação tem o
 * seu, com a vista em quadro (a principal) e a lista. As etapas é que se
 * configuram.
 *
 * Sem imports do Convex de propósito, como lib/permissoes.ts: o dashboard
 * importa este ficheiro (@workspace/convex/convex/lib/funis).
 */

export const CHAVES_FUNIL = ["reservas", "pedidos", "candidaturas"] as const;
export type ChaveFunil = (typeof CHAVES_FUNIL)[number];

export function eChaveFunil(x: string): x is ChaveFunil {
  return (CHAVES_FUNIL as readonly string[]).includes(x);
}

/* De onde vem um cartão. `orders` é uma reserva paga (a ida, com a volta e os
   tours vendidos em upsell no mesmo cartão); `manual`, um pedido que chegou
   por fora do site e se criou no back-office. */
export const ORIGENS_FUNIL = [
  { chave: "orders", titulo: "Serviço", funil: "reservas" },
  { chave: "contactSubmissions", titulo: "Contacto", funil: "pedidos" },
  { chave: "contactQuotes", titulo: "Orçamento corporate", funil: "pedidos" },
  { chave: "tourInquiries", titulo: "Ultra-luxo", funil: "pedidos" },
  { chave: "weddingQuoteSubmissions", titulo: "Casamento", funil: "pedidos" },
  { chave: "schoolQuoteSubmissions", titulo: "Escolas", funil: "pedidos" },
  { chave: "corporateRequests", titulo: "Proposta corporate", funil: "pedidos" },
  { chave: "manual", titulo: "Criado à mão", funil: "pedidos" },
  { chave: "driverApplications", titulo: "Motorista", funil: "candidaturas" },
  { chave: "partnerApplications", titulo: "Empresa parceira", funil: "candidaturas" },
] as const satisfies readonly { chave: string; titulo: string; funil: ChaveFunil }[];

export type OrigemFunil = (typeof ORIGENS_FUNIL)[number]["chave"];

export function eOrigem(x: string): x is OrigemFunil {
  return ORIGENS_FUNIL.some((o) => o.chave === x);
}

export function funilDaOrigem(x: OrigemFunil): ChaveFunil {
  return ORIGENS_FUNIL.find((o) => o.chave === x)!.funil;
}

export function tituloDaOrigem(x: string): string {
  return ORIGENS_FUNIL.find((o) => o.chave === x)?.titulo ?? x;
}

export function origensDoFunil(chave: ChaveFunil): OrigemFunil[] {
  return ORIGENS_FUNIL.filter((o) => o.funil === chave).map((o) => o.chave);
}

/* Por onde chegou um pedido criado à mão. */
export const CANAIS = [
  { chave: "telefone", titulo: "Telefone" },
  { chave: "whatsapp", titulo: "WhatsApp" },
  { chave: "email", titulo: "Email" },
  { chave: "evento", titulo: "Evento" },
  { chave: "outro", titulo: "Outro" },
] as const;

/* Aberta: está a ser trabalhado. Ganho e perdido fecham o cartão (grava
   fechadoEm; perdido pede o motivo). */
export const TIPOS_ETAPA = ["aberta", "ganho", "perdido"] as const;
export type TipoEtapa = (typeof TIPOS_ETAPA)[number];

/* As cores que se podem dar às etapas: fixas, para o quadro ler-se bem. */
export const CORES_ETAPA = [
  "#64748b", // ardósia
  "#3b82f6", // azul
  "#8b5cf6", // violeta
  "#d97706", // âmbar
  "#b8954f", // dourado da marca
  "#0d9488", // verde-azulado
  "#16a34a", // verde (ganho)
  "#dc2626", // vermelho (perdido)
] as const;

export type Etapa = { id: string; nome: string; cor: string; tipo: TipoEtapa };

/* Cada funil: o nome, o módulo de permissão que o abre (o do ecrã onde vive),
   se se criam cartões à mão, e as etapas com que começa. */
export const FUNIS: Record<
  ChaveFunil,
  { titulo: string; modulo: "reservas" | "pedidos" | "candidaturas"; manual: boolean; etapas: Etapa[] }
> = {
  reservas: {
    titulo: "Serviços",
    modulo: "reservas",
    manual: false,
    etapas: [
      { id: "porAtribuir", nome: "Por atribuir", cor: "#d97706", tipo: "aberta" },
      { id: "atribuido", nome: "Motorista atribuído", cor: "#3b82f6", tipo: "aberta" },
      { id: "confirmada", nome: "Confirmada com o cliente", cor: "#8b5cf6", tipo: "aberta" },
      { id: "concluida", nome: "Concluída", cor: "#16a34a", tipo: "ganho" },
      { id: "cancelada", nome: "Cancelada", cor: "#dc2626", tipo: "perdido" },
    ],
  },
  pedidos: {
    titulo: "Pedidos",
    modulo: "pedidos",
    manual: true,
    etapas: [
      { id: "novo", nome: "Novo", cor: "#3b82f6", tipo: "aberta" },
      { id: "contacto", nome: "Em contacto", cor: "#8b5cf6", tipo: "aberta" },
      { id: "proposta", nome: "Proposta enviada", cor: "#d97706", tipo: "aberta" },
      { id: "ganho", nome: "Ganho", cor: "#16a34a", tipo: "ganho" },
      { id: "perdido", nome: "Perdido", cor: "#dc2626", tipo: "perdido" },
    ],
  },
  candidaturas: {
    titulo: "Candidaturas",
    modulo: "candidaturas",
    manual: false,
    etapas: [
      { id: "nova", nome: "Nova", cor: "#3b82f6", tipo: "aberta" },
      { id: "analise", nome: "Em análise", cor: "#8b5cf6", tipo: "aberta" },
      { id: "entrevista", nome: "Entrevista", cor: "#d97706", tipo: "aberta" },
      { id: "aprovada", nome: "Aprovada", cor: "#16a34a", tipo: "ganho" },
      { id: "recusada", nome: "Recusada", cor: "#dc2626", tipo: "perdido" },
    ],
  },
};
