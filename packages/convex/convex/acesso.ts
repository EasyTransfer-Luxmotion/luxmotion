import { query } from "./_generated/server";
import { avaliarAcesso } from "./lib/admin";

/*
 * O dashboard pergunta isto antes de montar qualquer ecrã. Sem esta pergunta,
 * uma conta fora do ADMIN_EMAILS entrava, a primeira query do ecrã (por
 * exemplo `orders.listPaged`) respondia "Esta conta não tem acesso ao
 * back-office." e a página rebentava com "Application error".
 *
 * Aberta de propósito: só diz a quem chama se ele próprio tem acesso, e o email
 * que devolve é o da sessão de quem pergunta. Não revela a lista.
 */
export const minhaConta = query({
  args: {},
  handler: async (ctx) => {
    const identidade = await ctx.auth.getUserIdentity();
    return {
      estado: avaliarAcesso(identidade),
      email: identidade?.email ?? null,
    };
  },
});
