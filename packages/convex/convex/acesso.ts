import { internalQuery, mutation, query } from "./_generated/server";
import { lerAcesso } from "./lib/admin";

/*
 * O dashboard pergunta isto antes de montar qualquer ecrã. Sem esta pergunta,
 * uma conta fora da equipa entrava, a primeira query do ecrã (por exemplo
 * `orders.listPaged`) respondia "Esta conta não tem acesso ao back-office." e a
 * página rebentava com "Application error".
 *
 * Também devolve as permissões do cargo, para a sidebar mostrar só os módulos
 * que a pessoa pode abrir. Quem decide continua a ser cada função.
 *
 * Aberta de propósito: só diz a quem chama o que ele próprio pode. Não revela
 * a lista dos donos nem a dos colaboradores.
 */
export const minhaConta = query({
  args: {},
  handler: async (ctx) => lerAcesso(ctx),
});

/* As actions não têm ctx.db: perguntam por aqui (lib/adminAccao.ts). O
   runQuery de uma action leva a sessão de quem a chamou. */
export const doChamador = internalQuery({
  args: {},
  handler: async (ctx) => lerAcesso(ctx),
});

/* "Última entrada" na lista da equipa interna. O dashboard chama isto ao abrir;
   só grava se passou mais de uma hora, para não escrever a cada página. */
export const registarEntrada = mutation({
  args: {},
  handler: async (ctx) => {
    const acesso = await lerAcesso(ctx);
    if (acesso.estado !== "admin" || !acesso.email) return null;
    const c = await ctx.db
      .query("colaboradores")
      .withIndex("by_email", (q) => q.eq("email", acesso.email!))
      .first();
    if (!c) return null;
    const agora = Date.now();
    if (c.ultimaEntradaEm && agora - c.ultimaEntradaEm < 60 * 60 * 1000) return null;
    await ctx.db.patch(c._id, { ultimaEntradaEm: agora });
    return null;
  },
});
