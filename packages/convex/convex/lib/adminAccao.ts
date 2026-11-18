import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Capacidade, Nivel } from "./permissoes";
import { verificar, type Acesso, type Exigencia } from "./admin";

/* O exigirAdmin das actions. Uma action não lê a base de dados directamente,
   por isso pergunta ao acesso.doChamador, que corre com a mesma sessão e a
   mesma regra (lib/admin.ts). */
export async function exigirAdminAccao(
  ctx: ActionCtx,
  modulo?: Exigencia,
  nivel: Nivel = "editar",
  capacidade?: Capacidade,
): Promise<Acesso> {
  const acesso: Acesso = await ctx.runQuery(internal.acesso.doChamador, {});
  verificar(acesso, modulo, nivel, capacidade);
  return acesso;
}
