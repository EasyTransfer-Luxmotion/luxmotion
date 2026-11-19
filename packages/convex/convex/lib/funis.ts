/*
 * O que os funis e o dashboard têm de dizer da mesma maneira: as origens que
 * caem num funil, os canais de um negócio criado à mão e as cores das etapas.
 *
 * Sem imports do Convex de propósito, como lib/permissoes.ts: o dashboard
 * importa este ficheiro (@workspace/convex/convex/lib/funis). Uma lista em
 * cada repositório acabava por dizer coisas diferentes.
 */

/* De onde vem um cartão. As seis primeiras são os formulários de pedido do
   site (Operação → Pedidos); `orders` é uma reserva paga; `manual`, um
   negócio criado no back-office. */
export const ORIGENS_FUNIL = [
  { chave: "contactSubmissions", titulo: "Contacto", grupo: "pedidos" },
  { chave: "contactQuotes", titulo: "Orçamento corporate", grupo: "pedidos" },
  { chave: "tourInquiries", titulo: "Ultra-luxo", grupo: "pedidos" },
  { chave: "weddingQuoteSubmissions", titulo: "Casamento", grupo: "pedidos" },
  { chave: "schoolQuoteSubmissions", titulo: "Escolas", grupo: "pedidos" },
  { chave: "corporateRequests", titulo: "Proposta corporate", grupo: "pedidos" },
  { chave: "partnerLeads", titulo: "Lead de parceiro", grupo: "parceiros" },
  { chave: "orders", titulo: "Reserva paga", grupo: "reservas" },
  { chave: "manual", titulo: "Criado à mão", grupo: "manual" },
] as const;

export type OrigemFunil = (typeof ORIGENS_FUNIL)[number]["chave"];
export const CHAVES_ORIGEM: readonly OrigemFunil[] = ORIGENS_FUNIL.map((o) => o.chave);

export function eOrigem(x: string): x is OrigemFunil {
  return (CHAVES_ORIGEM as readonly string[]).includes(x);
}

export function tituloDaOrigem(x: string): string {
  return ORIGENS_FUNIL.find((o) => o.chave === x)?.titulo ?? x;
}

/* Por onde chegou um negócio criado à mão. */
export const CANAIS = [
  { chave: "telefone", titulo: "Telefone" },
  { chave: "whatsapp", titulo: "WhatsApp" },
  { chave: "email", titulo: "Email" },
  { chave: "evento", titulo: "Evento" },
  { chave: "outro", titulo: "Outro" },
] as const;
export type Canal = (typeof CANAIS)[number]["chave"];

/* Aberta: o negócio está a ser trabalhado. Ganho e perdido fecham-no (grava
   fechadoEm; perdido pede o motivo). */
export const TIPOS_ETAPA = ["aberta", "ganho", "perdido"] as const;
export type TipoEtapa = (typeof TIPOS_ETAPA)[number];

/* As cores que o editor oferece para as etapas. Fixas, para o quadro ler-se
   bem nos dois temas e não haver uma etapa amarelo-limão. */
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

/* Os três funis com que se começa (funis.criarFunisIniciais). Depois são da
   equipa: o editor muda nomes, etapas e origens. */
export const FUNIS_INICIAIS: { nome: string; origens: OrigemFunil[]; etapas: Etapa[] }[] = [
  {
    nome: "Pedidos",
    origens: [
      "contactSubmissions",
      "contactQuotes",
      "tourInquiries",
      "weddingQuoteSubmissions",
      "schoolQuoteSubmissions",
      "corporateRequests",
      "manual",
    ],
    etapas: [
      { id: "novo", nome: "Novo", cor: "#3b82f6", tipo: "aberta" },
      { id: "contacto", nome: "Em contacto", cor: "#8b5cf6", tipo: "aberta" },
      { id: "proposta", nome: "Proposta enviada", cor: "#d97706", tipo: "aberta" },
      { id: "ganho", nome: "Ganho", cor: "#16a34a", tipo: "ganho" },
      { id: "perdido", nome: "Perdido", cor: "#dc2626", tipo: "perdido" },
    ],
  },
  {
    nome: "Parceiros",
    origens: ["partnerLeads"],
    etapas: [
      { id: "novo", nome: "Novo", cor: "#3b82f6", tipo: "aberta" },
      { id: "contacto", nome: "Em contacto", cor: "#8b5cf6", tipo: "aberta" },
      { id: "reuniao", nome: "Reunião", cor: "#d97706", tipo: "aberta" },
      { id: "fechada", nome: "Parceria fechada", cor: "#16a34a", tipo: "ganho" },
      { id: "perdido", nome: "Perdido", cor: "#dc2626", tipo: "perdido" },
    ],
  },
  {
    nome: "Reservas",
    origens: ["orders"],
    etapas: [
      { id: "paga", nome: "Paga", cor: "#3b82f6", tipo: "aberta" },
      { id: "confirmada", nome: "Confirmada com o cliente", cor: "#8b5cf6", tipo: "aberta" },
      { id: "motorista", nome: "Motorista atribuído", cor: "#0d9488", tipo: "aberta" },
      { id: "concluida", nome: "Concluída", cor: "#16a34a", tipo: "ganho" },
      { id: "cancelada", nome: "Cancelada", cor: "#dc2626", tipo: "perdido" },
    ],
  },
];
