/*
 * Os três funis do back-office — Serviços do website, Serviços por medida e
 * Parcerias — e o que
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

/* «reservas» é Operação → Transfers (os transfers pagos no site e nos sites
   dos parceiros: despacho); «medida» é Operação → Pedidos Parceiros (casamentos,
   ultra-luxo, corporate, escolas: venda); «parcerias» é a aquisição de
   parceiros (leads da página Hotéis e todas as candidaturas). Os que houve
   antes («pedidos», «candidaturas») apaga-os criarFunisIniciais. */
export const CHAVES_FUNIL = ["reservas", "medida", "parcerias"] as const;
export type ChaveFunil = (typeof CHAVES_FUNIL)[number];

export function eChaveFunil(x: string): x is ChaveFunil {
  return (CHAVES_FUNIL as readonly string[]).includes(x);
}

/* De onde vem um cartão. `orders` é uma reserva paga (a ida, com a volta e os
   tours vendidos em upsell no mesmo cartão); os formulários de pedido do
   site são venda por medida; as leads da página Hotéis e as candidaturas
   são parcerias; `manual`, o que começou por fora do site. */
export const ORIGENS_FUNIL = [
  { chave: "orders", titulo: "Website", funil: "reservas" },
  { chave: "contactSubmissions", titulo: "Contacto", funil: "medida" },
  { chave: "contactQuotes", titulo: "Orçamento corporate", funil: "medida" },
  { chave: "tourInquiries", titulo: "Ultra-luxo", funil: "medida" },
  { chave: "weddingQuoteSubmissions", titulo: "Casamento", funil: "medida" },
  { chave: "schoolQuoteSubmissions", titulo: "Escolas", funil: "medida" },
  { chave: "corporateRequests", titulo: "Proposta corporate", funil: "medida" },
  { chave: "partnerLeads", titulo: "Lead do site", funil: "parcerias" },
  { chave: "driverApplications", titulo: "Candidatura de motorista", funil: "parcerias" },
  { chave: "partnerApplications", titulo: "Candidatura de empresa", funil: "parcerias" },
  /* Criado à mão: o funil é o do quadro onde se carregou em «Novo». */
  { chave: "manual", titulo: "Criado à mão", funil: "medida" },
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

/* Por onde chegou o que se criou à mão. */
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
  { titulo: string; modulo: "reservas" | "pedidos" | "leads"; manual: boolean; etapas: Etapa[] }
> = {
  reservas: {
    titulo: "Transfers",
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
  medida: {
    titulo: "Pedidos Parceiros",
    modulo: "pedidos",
    manual: true,
    etapas: [
      { id: "recolha", nome: "Recolha de Informações", cor: "#64748b", tipo: "aberta" },
      { id: "orcamento", nome: "Envio do Orçamento", cor: "#3b82f6", tipo: "aberta" },
      { id: "aguardar", nome: "A Aguardar Confirmação", cor: "#d97706", tipo: "aberta" },
      { id: "negociacao", nome: "Negociação", cor: "#8b5cf6", tipo: "aberta" },
      { id: "confirmada", nome: "Reserva Confirmada", cor: "#16a34a", tipo: "ganho" },
      { id: "perdido", nome: "Perdido", cor: "#dc2626", tipo: "perdido" },
    ],
  },
  parcerias: {
    titulo: "Parcerias",
    modulo: "leads",
    manual: true,
    etapas: [
      { id: "lead", nome: "Lead", cor: "#64748b", tipo: "aberta" },
      { id: "nutricao", nome: "Nutrição", cor: "#3b82f6", tipo: "aberta" },
      { id: "r1", nome: "Primeira Reunião R1", cor: "#8b5cf6", tipo: "aberta" },
      { id: "r2", nome: "Segunda Reunião R2", cor: "#8b5cf6", tipo: "aberta" },
      { id: "r3", nome: "Q&A/R3", cor: "#d97706", tipo: "aberta" },
      { id: "followup", nome: "Follow up", cor: "#0d9488", tipo: "aberta" },
      { id: "reativacao", nome: "Reativação", cor: "#b8954f", tipo: "aberta" },
      { id: "onboarding", nome: "Onboarding", cor: "#16a34a", tipo: "ganho" },
      { id: "perdido", nome: "Perdido", cor: "#dc2626", tipo: "perdido" },
    ],
  },
};

/*
 * Os segmentos de cada funil: no arranque, um filtro (não um funil cada).
 * Vêm da origem do cartão; num cartão criado à mão escolhe-se.
 */
export const SEGMENTOS: Record<ChaveFunil, string[]> = {
  reservas: [],
  medida: ["Casamentos", "Ultra-luxo", "Corporate", "Escolas", "Contactos", "Outro"],
  parcerias: ["Hotelaria", "Weddings", "Agências e operadores", "Restauração", "Motoristas", "Empresas de motoristas", "Outro"],
};

/* O tipo de parceiro chega como o formulário o mostrou (em pt ou en). */
function segmentoDoTipo(tipo: string): string {
  const t = tipo.toLowerCase();
  if (/hotel|resort/.test(t)) return "Hotelaria";
  if (/quinta|estate|evento|event|venue/.test(t)) return "Weddings";
  if (/ag[eê]nc|agency|operador|operator/.test(t)) return "Agências e operadores";
  if (/restaura/.test(t)) return "Restauração";
  return "Outro";
}

export function segmentoDaOrigem(origem: string, tipoParceiro?: string | null): string | null {
  switch (origem) {
    case "weddingQuoteSubmissions":
      return "Casamentos";
    case "tourInquiries":
      return "Ultra-luxo";
    case "contactQuotes":
    case "corporateRequests":
      return "Corporate";
    case "schoolQuoteSubmissions":
      return "Escolas";
    case "contactSubmissions":
      return "Contactos";
    case "partnerLeads":
      return tipoParceiro ? segmentoDoTipo(tipoParceiro) : "Outro";
    case "driverApplications":
      return "Motoristas";
    case "partnerApplications":
      return "Empresas de motoristas";
    default:
      return null;
  }
}
