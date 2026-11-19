import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { lerAcesso, verificar } from "./lib/admin";
import { ultimoConvite } from "./lib/convites";
import { notificar } from "./lib/notificar";

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
    /* A primeira entrada aceita o convite: passa de "Convidado" a "Ativo",
       e quem o convidou vê no histórico e no sino que a pessoa já entrou. */
    if (!c.ultimaEntradaEm) {
      const convite = await ultimoConvite(ctx.db, c._id);
      if (convite && convite.estado === "pendente") await ctx.db.patch(convite._id, { estado: "aceite", respondidoEm: agora });
      await ctx.db.insert("registoEquipa", {
        ator: c.email,
        accao: "Aceitou o convite",
        alvo: `${c.nome} (${c.email})`,
        colaboradorId: c._id,
        em: agora,
      });
      await notificar(ctx, {
        chave: `convite:aceite:${c._id}`,
        tipo: "equipa",
        titulo: `${c.nome} entrou na equipa`,
        detalhe: c.email,
        href: `/equipa/membros/${c._id}`,
      });
    }
    return null;
  },
});

const UMA_HORA = 60 * 60 * 1000;

/*
 * "Ver como" um cargo: a partir daqui o servidor responde a esta pessoa com
 * as permissões do cargo (lib/admin.ts → lerAcesso), em todas as funções, e
 * recusa qualquer alteração. É o teste a sério de um cargo, em vez de
 * adivinhar pela lista de módulos.
 */
export const verComo = mutation({
  args: { cargoId: v.id("cargos") },
  handler: async (ctx, { cargoId }) => {
    const real = await lerAcesso(ctx, { semSimulacao: true });
    verificar(real, "equipa", "editar");
    const cargo = await ctx.db.get(cargoId);
    if (!cargo) throw new ConvexError("Esse cargo já não existe.");
    const email = real.email!;
    const ate = Date.now() + UMA_HORA;
    const antes = await ctx.db.query("simulacoes").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (antes) await ctx.db.patch(antes._id, { cargoId, ate });
    else await ctx.db.insert("simulacoes", { email, cargoId, ate });
    return { cargo: cargo.nome, ate };
  },
});

/* Sair do "ver como". Lê o acesso real: com as permissões simuladas, quem
   simula um cargo sem a Equipa não conseguia sair. */
export const terminarVerComo = mutation({
  args: {},
  handler: async (ctx) => {
    const real = await lerAcesso(ctx, { semSimulacao: true });
    if (real.estado !== "admin" || !real.email) return null;
    const sims = await ctx.db.query("simulacoes").withIndex("by_email", (q) => q.eq("email", real.email!)).collect();
    for (const x of sims) await ctx.db.delete(x._id);
    return null;
  },
});

/*
 * O ecrã de boas-vindas da primeira entrada de um membro convidado. Só para
 * colaboradores activos que ainda não o viram, e nunca a "ver como" (quem
 * simula não é a pessoa). Os donos não estão na tabela: não o vêem.
 */
export const boasVindas = query({
  args: {},
  handler: async (ctx) => {
    const acesso = await lerAcesso(ctx);
    if (acesso.estado !== "admin" || !acesso.email || acesso.simulacao) return null;
    const c = await ctx.db
      .query("colaboradores")
      .withIndex("by_email", (q) => q.eq("email", acesso.email!))
      .first();
    if (!c || c.estado !== "activo" || c.boasVindasEm) return null;
    return { nome: c.nome, cargo: acesso.cargo, idioma: c.idioma ?? "pt" };
  },
});

export const viBoasVindas = mutation({
  args: {},
  handler: async (ctx) => {
    const acesso = await lerAcesso(ctx);
    if (acesso.estado !== "admin" || !acesso.email || acesso.simulacao) return null;
    const c = await ctx.db
      .query("colaboradores")
      .withIndex("by_email", (q) => q.eq("email", acesso.email!))
      .first();
    if (c && !c.boasVindasEm) await ctx.db.patch(c._id, { boasVindasEm: Date.now() });
    return null;
  },
});
