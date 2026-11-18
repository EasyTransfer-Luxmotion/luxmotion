/*
 * O que um cargo da equipa interna pode fazer no back-office: um nível por
 * módulo. É a mesma lista que o dashboard mostra na sidebar, para que dar
 * acesso a "Reservas" queira dizer exactamente o ecrã Reservas.
 *
 * Fica sem imports do Convex de propósito: o dashboard importa este ficheiro
 * (@workspace/convex/convex/lib/permissoes) para desenhar a matriz de
 * permissões e esconder o que a pessoa não pode abrir. Uma lista em cada
 * repositório acabava por dizer coisas diferentes.
 *
 * Esconder no ecrã não protege nada: cada função do Convex verifica o módulo
 * no servidor (exigirAdmin em lib/admin.ts).
 */

export const NIVEIS = ["ver", "editar"] as const;
export type Nivel = (typeof NIVEIS)[number];

const DEFINICAO = [
  {
    id: "operacao",
    titulo: "Operação",
    modulos: [
      { chave: "reservas", titulo: "Reservas", ajuda: "Transfers, tours e eventos pagos; confirmar pagamentos e mudar estados." },
      { chave: "pedidos", titulo: "Pedidos", ajuda: "Formulários de orçamento e contacto do site, e a newsletter." },
      { chave: "candidaturas", titulo: "Candidaturas", ajuda: "Motoristas e parceiros que se candidataram, com os documentos." },
    ],
  },
  {
    id: "catalogo",
    titulo: "Catálogo",
    modulos: [
      { chave: "tours", titulo: "Tours", ajuda: "Tours, horários, paragens e traduções." },
      { chave: "eventos", titulo: "Eventos", ajuda: "Eventos e as suas saídas partilhadas." },
      { chave: "corporate", titulo: "Corporate", ajuda: "Experiências corporate." },
      { chave: "extras", titulo: "Extras", ajuda: "Paragens e experiências do checkout, e extras dos tours e eventos." },
      { chave: "veiculos", titulo: "Veículos", ajuda: "Frota, preços por km e mínimos." },
    ],
  },
  {
    id: "parceiros",
    titulo: "Parceiros",
    modulos: [
      { chave: "parcerias", titulo: "Parcerias", ajuda: "Páginas e checkouts dos parceiros, ajuste de preço e frota." },
      { chave: "leads", titulo: "Leads", ajuda: "Contactos que chegaram pelas páginas dos parceiros." },
    ],
  },
  {
    id: "conteudos",
    titulo: "Conteúdos",
    modulos: [
      { chave: "blog", titulo: "Blog", ajuda: "Artigos, traduções e a geração automática." },
      { chave: "fotosExtras", titulo: "Fotos dos extras", ajuda: "Biblioteca de fotografias dos extras." },
      { chave: "portefolio", titulo: "Portefólio", ajuda: "Trabalhos passados que o site mostra." },
      { chave: "avaliacoes", titulo: "Avaliações", ajuda: "Aprovar, destacar e responder a avaliações." },
      { chave: "equipaSite", titulo: "Equipa no site", ajuda: "Perfis públicos da equipa na página Sobre nós." },
      { chave: "motoristas", titulo: "Motoristas", ajuda: "Perfis públicos dos motoristas no site." },
    ],
  },
  {
    id: "configuracoes",
    titulo: "Configurações",
    modulos: [
      { chave: "definicoes", titulo: "Definições do site", ajuda: "Barra de anúncio, antecedência, câmbios, sobretaxas e números." },
      { chave: "escassez", titulo: "Escassez (Ultra)", ajuda: "Números da secção de disponibilidade da página Ultra-luxo." },
    ],
  },
  {
    id: "equipa",
    titulo: "Equipa",
    modulos: [
      {
        chave: "equipa",
        titulo: "Membros e cargos",
        ajuda: "Quem entra no back-office e o que cada cargo vê. Quem pode editar isto pode dar-se qualquer acesso.",
      },
    ],
  },
] as const;

export type ModuloPermissao = (typeof DEFINICAO)[number]["modulos"][number]["chave"];

export type AreaPermissao = {
  readonly id: string;
  readonly titulo: string;
  readonly modulos: readonly { readonly chave: ModuloPermissao; readonly titulo: string; readonly ajuda: string }[];
};

/* Com os tipos alargados: o `as const` acima só serve para tirar as chaves. */
export const AREAS_PERMISSAO: readonly AreaPermissao[] = DEFINICAO;

export const MODULOS_PERMISSAO: readonly ModuloPermissao[] = AREAS_PERMISSAO.flatMap((a) =>
  a.modulos.map((m) => m.chave),
);

export type Permissoes = Partial<Record<ModuloPermissao, Nivel>>;

export function eModulo(x: string): x is ModuloPermissao {
  return (MODULOS_PERMISSAO as readonly string[]).includes(x);
}

/*
 * Acções sensíveis, à parte dos módulos: o que um ecrã deixa fazer não diz
 * tudo. A Operação muda reservas mas não as marca como pagas; o Comercial vê
 * reservas sem a faturação. Cada uma é verificada no servidor, nas funções
 * que a fazem (exigirAdmin com capacidade, ou pode/temCapacidade).
 */
export const CAPACIDADES = [
  {
    chave: "valores",
    titulo: "Ver valores e faturação",
    ajuda: "Totais, preços e pagamentos das reservas, e os números de faturação do Início.",
  },
  {
    chave: "pagamentos",
    titulo: "Confirmar pagamentos",
    ajuda: "Marcar uma reserva como paga (dinheiro, transferência) e reenviar o aviso à operação.",
  },
  {
    chave: "apagar",
    titulo: "Apagar registos",
    ajuda: "Apagar tours, eventos, pedidos, candidaturas, artigos, parcerias… Sem isto, edita mas não apaga.",
  },
  {
    chave: "documentos",
    titulo: "Ver documentos pessoais",
    ajuda: "Cartas de condução, seguros e comprovativos bancários das candidaturas.",
  },
] as const;

export type Capacidade = (typeof CAPACIDADES)[number]["chave"];
export const CHAVES_CAPACIDADE: readonly Capacidade[] = CAPACIDADES.map((c) => c.chave);

export function eCapacidade(x: string): x is Capacidade {
  return (CHAVES_CAPACIDADE as readonly string[]).includes(x);
}

export function tituloDaCapacidade(c: Capacidade): string {
  return CAPACIDADES.find((x) => x.chave === c)?.titulo ?? c;
}

/* "editar" inclui "ver": quem muda uma reserva tem de a conseguir abrir. */
export function chega(tem: Nivel | undefined, precisa: Nivel): boolean {
  if (!tem) return false;
  return precisa === "ver" || tem === "editar";
}

/* Os donos (ADMIN_EMAILS) têm tudo. */
export const TUDO: Permissoes = Object.fromEntries(MODULOS_PERMISSAO.map((m) => [m, "editar"])) as Permissoes;

export function tituloDoModulo(chave: ModuloPermissao): string {
  for (const a of AREAS_PERMISSAO) for (const m of a.modulos) if (m.chave === chave) return m.titulo;
  return chave;
}
