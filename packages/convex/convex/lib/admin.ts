import { ConvexError } from "convex/values";
import type { Auth, UserIdentity } from "convex/server";
import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  CHAVES_CAPACIDADE,
  chega,
  eCapacidade,
  eModulo,
  TUDO,
  tituloDaCapacidade,
  tituloDoModulo,
  type Capacidade,
  type ModuloPermissao,
  type Nivel,
  type Permissoes,
} from "./permissoes";

/**
 * Só a equipa passa daqui, e cada um só ao que o cargo lhe dá.
 *
 * Até 2026-11-07 nenhuma função do Convex verificava quem a chamava. O URL do
 * Convex está no código que o browser descarrega, e com ele qualquer pessoa
 * conseguia chamar `vehicles.update`, apagar um tour, ler os pedidos de
 * orçamento com nomes e telefones — ou `orders.updatePaymentStatus`, que marca
 * uma encomenda como paga.
 *
 * Ter sessão não chega: o registo no Clerk de produção está aberto ao público,
 * e qualquer pessoa pode criar conta. O critério é um email VERIFICADO que
 * seja:
 *   - dono: está em ADMIN_EMAILS (variável de cada deployment, separada por
 *     vírgulas) e tem tudo. Não depende das tabelas, para um cargo mal
 *     configurado nunca deixar ninguém de fora;
 *   - colaborador activo (tabela `colaboradores`): tem o que o cargo lhe dá.
 * Fora disto ninguém entra — falha fechado, não aberto.
 *
 * O email vem do JWT template "convex" do Clerk (claim `email`).
 */
export type EstadoAcesso = "semSessao" | "emailPorVerificar" | "semAcesso" | "admin";

export type Acesso = {
  estado: EstadoAcesso;
  email: string | null;
  nome: string | null;
  cargo: string | null;
  dono: boolean;
  permissoes: Permissoes;
  capacidades: Capacidade[];
  /* "Ver como" um cargo (tabela simulacoes): as permissões acima são as do
     cargo, e nada se pode alterar. */
  simulacao: { cargoId: Id<"cargos">; cargo: string; ate: number } | null;
};

type CtxLeitura = { auth: Auth; db: DatabaseReader };

function donos(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/* A regra numa só função: o exigirAdmin, o `acesso.minhaConta` (que o
   dashboard pergunta antes de abrir os ecrãs) e as actions não podem
   discordar. */
export async function lerAcesso(ctx: CtxLeitura, opcoes: { semSimulacao?: boolean } = {}): Promise<Acesso> {
  const real = await lerAcessoReal(ctx);
  if (opcoes.semSimulacao || real.estado !== "admin" || !real.email) return real;
  /* Só quem gere a equipa pode "ver como": é quem já podia dar-se esse cargo. */
  if (!chega(real.permissoes.equipa, "editar")) return real;
  const sim = await ctx.db
    .query("simulacoes")
    .withIndex("by_email", (q) => q.eq("email", real.email!))
    .first();
  if (!sim || sim.ate <= Date.now()) return real;
  const cargo = await ctx.db.get(sim.cargoId);
  if (!cargo) return real;
  const permissoes: Permissoes = {};
  for (const p of cargo.permissoes) if (eModulo(p.modulo)) permissoes[p.modulo] = p.nivel;
  return {
    ...real,
    cargo: cargo.nome,
    dono: false,
    permissoes,
    capacidades: (cargo.capacidades ?? []).filter(eCapacidade),
    simulacao: { cargoId: cargo._id, cargo: cargo.nome, ate: sim.ate },
  };
}

async function lerAcessoReal(ctx: CtxLeitura): Promise<Acesso> {
  const identidade = await ctx.auth.getUserIdentity();
  const email = identidade?.email?.trim().toLowerCase() ?? null;
  const fora = (estado: EstadoAcesso): Acesso => ({
    estado,
    email,
    nome: null,
    cargo: null,
    dono: false,
    permissoes: {},
    capacidades: [],
    simulacao: null,
  });
  if (!identidade) return fora("semSessao");
  if (!email) return fora("semAcesso");
  // Um email por verificar não prova nada: com o registo aberto, qualquer um
  // podia criar conta com o endereço de alguém da equipa.
  if (identidade.emailVerified !== true) return fora("emailPorVerificar");

  const colaborador = await ctx.db
    .query("colaboradores")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

  if (donos().includes(email)) {
    return {
      estado: "admin",
      email,
      nome: colaborador?.nome ?? identidade.name ?? null,
      cargo: "Dono",
      dono: true,
      permissoes: TUDO,
      capacidades: [...CHAVES_CAPACIDADE],
      simulacao: null,
    };
  }

  if (!colaborador || colaborador.estado !== "activo") return fora("semAcesso");
  const cargo = await ctx.db.get(colaborador.cargoId);
  if (!cargo) return fora("semAcesso");

  const permissoes: Permissoes = {};
  for (const p of cargo.permissoes) if (eModulo(p.modulo)) permissoes[p.modulo] = p.nivel;
  return {
    estado: "admin",
    email,
    nome: colaborador.nome,
    cargo: cargo.nome,
    dono: false,
    permissoes,
    capacidades: (cargo.capacidades ?? []).filter(eCapacidade),
    simulacao: null,
  };
}

/* Um módulo, ou vários quando o mesmo ecrã serve mais do que um (os extras de
   um tour editam-se no editor do tour e também em Extras): basta um deles. */
export type Exigencia = ModuloPermissao | readonly ModuloPermissao[];

export function permite(acesso: Acesso, modulo?: Exigencia, nivel: Nivel = "ver"): boolean {
  if (acesso.estado !== "admin") return false;
  if (!modulo) return true;
  const lista: readonly ModuloPermissao[] = typeof modulo === "string" ? [modulo] : modulo;
  return lista.some((m) => chega(acesso.permissoes[m], nivel));
}

/* A mensagem diz o que falta, para quem a lê no aviso do back-office saber a
   quem pedir o quê. */
export function temCapacidade(acesso: Acesso, c: Capacidade): boolean {
  return acesso.estado === "admin" && acesso.capacidades.includes(c);
}

export function verificar(acesso: Acesso, modulo?: Exigencia, nivel: Nivel = "editar", capacidade?: Capacidade): void {
  if (acesso.estado === "semSessao") {
    throw new ConvexError("É preciso ter sessão iniciada no back-office.");
  }
  if (acesso.estado !== "admin") {
    throw new ConvexError("Esta conta não tem acesso ao back-office.");
  }
  /* A simulação é para ver, nunca para mexer: com as permissões de outro
     cargo, uma alteração ficava no registo em nome de quem simula. */
  if (acesso.simulacao && (nivel === "editar" || capacidade)) {
    throw new ConvexError(
      `Está a ver o back-office como ${acesso.simulacao.cargo}, só para consulta. Saia do «ver como» para alterar.`,
    );
  }
  if (permite(acesso, modulo, nivel)) {
    if (capacidade && !temCapacidade(acesso, capacidade)) {
      throw new ConvexError(`O seu cargo não permite: ${tituloDaCapacidade(capacidade).toLowerCase()}.`);
    }
    return;
  }
  const lista: readonly ModuloPermissao[] = typeof modulo === "string" ? [modulo] : modulo!;
  const nomes = lista.map(tituloDoModulo).join(" ou ");
  const soVer = nivel === "editar" && lista.some((m) => acesso.permissoes[m] === "ver");
  throw new ConvexError(
    soVer
      ? `O seu cargo só permite ver ${nomes}, não alterar.`
      : `O seu cargo não dá acesso a ${nomes}.`,
  );
}

/**
 * Sem módulo: basta ser da equipa (utilitários que todos os editores usam,
 * como publicar uma imagem). Com módulo: o cargo tem de o dar ao nível pedido.
 * Por omissão "editar" — quem acrescenta uma mutation sem pensar fica do lado
 * seguro; nas queries passa-se "ver".
 */
export async function exigirAdmin(
  ctx: CtxLeitura,
  modulo?: Exigencia,
  nivel: Nivel = "editar",
  /* Uma ação sensível a mais (lib/permissoes.ts → CAPACIDADES): apagar,
     confirmar um pagamento. */
  capacidade?: Capacidade,
): Promise<UserIdentity> {
  const acesso = await lerAcesso(ctx);
  verificar(acesso, modulo, nivel, capacidade);
  return (await ctx.auth.getUserIdentity())!;
}

/* Para as queries que respondem null em vez de lançar (as da moldura do
   dashboard: um erro ali deitava abaixo o back-office inteiro). */
export async function pode(ctx: CtxLeitura, modulo?: Exigencia, nivel: Nivel = "ver"): Promise<boolean> {
  return permite(await lerAcesso(ctx), modulo, nivel);
}
