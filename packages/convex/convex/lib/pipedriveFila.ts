/**
 * A linha que cada formulário chama logo a seguir a gravar. Era a fila do
 * Pipedrive; desde os funis (funis.ts), que o substituem, mete a lead no
 * quadro do back-office (lib/funilEntrada.ts). O nome ficou para não mexer
 * nos dez formulários que a chamam.
 *
 * Tem de correr na mesma transação da submissão: escrita depois, duas
 * submissões simultâneas do mesmo formulário criavam dois cartões.
 *
 * A newsletter e as leads de parceiros também a chamam e não entram: não
 * têm funil, e têm a sua caixa no back-office.
 */

import type { MutationCtx } from "../_generated/server";
import { entrarNoFunil } from "./funilEntrada";
import type { TabelaLead } from "./pipedriveMapa";

export async function enfileirarLead(ctx: MutationCtx, tabela: TabelaLead, id: string): Promise<void> {
  await entrarNoFunil(ctx, tabela, id);
}
