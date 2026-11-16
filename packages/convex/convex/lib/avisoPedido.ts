/**
 * A linha que cada formulário acrescenta para o pedido ser avisado por email.
 *
 * Vive ao lado de `enfileirarLead` e chama-se logo a seguir a ela, de propósito:
 * quem abrir um `submit` vê as duas na mesma linha de vista e percebe para onde
 * vai o pedido. O email em si está em `avisoPedidos.ts`.
 *
 * A newsletter não passa por aqui. Quem escreve o email no rodapé não fez um
 * pedido, e três formulários alimentam a mesma tabela — em duas semanas a caixa
 * de entrada era só isso e os pedidos a sério afogavam-se no meio.
 */

import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { TabelaLead } from "./pipedriveMapa";
import { notificarPedido } from "./notificar";

export async function avisarPedido(
  ctx: MutationCtx,
  tabela: Exclude<TabelaLead, "newsletterSubscriptions">,
  id: string,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.avisoPedidos.enviarAviso, { tabela, id });
  /* E o sininho do back-office (lib/notificar.ts). */
  await notificarPedido(ctx, tabela, id);
}
