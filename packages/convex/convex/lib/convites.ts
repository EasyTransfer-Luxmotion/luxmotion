import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";

/*
 * O ciclo de vida de um convite para a equipa (tabela convites):
 *
 *   pendente ──► aceite      (primeira entrada, acesso.registarEntrada)
 *            ├─► recusado    (o próprio, na página do convite: convites.recusar)
 *            ├─► expirado    (7 dias depois: equipa.expirarConvite, agendado)
 *            └─► substituido (um reenvio cria outro e este deixa de valer)
 *
 * Um pendente fora do prazo conta como expirado mesmo antes de o agendamento
 * correr: é o estadoDoConvite que manda, nunca o campo sozinho.
 */

export const VALIDADE_CONVITE = 7 * 24 * 60 * 60 * 1000;

export type EstadoConvite = "pendente" | "aceite" | "recusado" | "expirado" | "substituido";

export function estadoDoConvite(c: Doc<"convites">, agora = Date.now()): EstadoConvite {
  if (c.estado === "pendente" && c.expiraEm <= agora) return "expirado";
  return c.estado;
}

export async function convitesDe(db: DatabaseReader, colaboradorId: Id<"colaboradores">) {
  return db
    .query("convites")
    .withIndex("by_colaborador", (q) => q.eq("colaboradorId", colaboradorId))
    .order("desc")
    .collect();
}

export async function ultimoConvite(db: DatabaseReader, colaboradorId: Id<"colaboradores">) {
  return db
    .query("convites")
    .withIndex("by_colaborador", (q) => q.eq("colaboradorId", colaboradorId))
    .order("desc")
    .first();
}

/* O token do link: 64 caracteres hexadecimais (dois UUID v4 sem hífenes,
   244 bits ao acaso). Quem o tem pode ver o convite e recusá-lo; entrar
   continua a exigir a conta com o email convidado, verificado. */
export function novoToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}
