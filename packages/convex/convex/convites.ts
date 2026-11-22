import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { estadoDoConvite } from "./lib/convites";
import { notificar } from "./lib/notificar";

/*
 * A página do convite (/convite/<token> no back-office). Abertas: quem
 * recebe o convite ainda não tem conta. O token é o que dá acesso, e só
 * mostra o mínimo — o primeiro nome, o cargo, quem convidou e o email meio
 * tapado. Aceitar não é aqui: é entrar com a conta do email convidado
 * (lib/admin.ts deixa passar enquanto o convite valer).
 */

function tapar(email: string): string {
  const [nome = "", dominio = ""] = email.split("@");
  return `${nome.slice(0, 1)}•••@${dominio}`;
}

async function porTokenDe(ctx: { db: import("./_generated/server").DatabaseReader }, token: string) {
  /* Um token tem sempre 64 caracteres hexadecimais (lib/convites.ts): o
     resto nem chega ao índice. */
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return ctx.db
    .query("convites")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
}

export const porToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const c = await porTokenDe(ctx, token);
    if (!c) return null;
    const p = await ctx.db.get(c.colaboradorId);
    if (!p) return null;
    const cargo = await ctx.db.get(p.cargoId);
    const estado = p.ultimaEntradaEm ? "aceite" : estadoDoConvite(c);
    return {
      estado,
      nome: p.nome.split(" ")[0] ?? p.nome,
      email: tapar(p.email),
      /* O email inteiro só enquanto o convite vale: é o que preenche a
         entrada. Depois, o link já não mostra a quem foi. */
      emailParaEntrar: estado === "pendente" ? p.email : null,
      cargo: cargo?.nome ?? null,
      por: c.por,
      expiraEm: c.expiraEm,
      respondidoEm: c.respondidoEm ?? null,
      idioma: p.idioma ?? "pt",
      bloqueado: p.estado === "suspenso",
    };
  },
});

/* The invitation page calls this once it shows a pending invitation, so the
   member page can say the email was opened. Only the first time counts. */
export const markOpened = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const c = await porTokenDe(ctx, token);
    if (!c || c.openedAt || estadoDoConvite(c) !== "pendente") return null;
    await ctx.db.patch(c._id, { openedAt: Date.now() });
    return null;
  },
});

export const recusar = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const c = await porTokenDe(ctx, token);
    if (!c) throw new ConvexError("Este convite não existe.");
    const p = await ctx.db.get(c.colaboradorId);
    if (!p) throw new ConvexError("Este convite já não existe.");
    const estado = p.ultimaEntradaEm ? "aceite" : estadoDoConvite(c);
    if (estado === "recusado") return null;
    if (estado !== "pendente") throw new ConvexError("Este convite já não está à espera de resposta.");
    const agora = Date.now();
    await ctx.db.patch(c._id, { estado: "recusado", respondidoEm: agora });
    await ctx.db.insert("registoEquipa", {
      ator: p.email,
      accao: "Recusou o convite",
      alvo: `${p.nome} (${p.email})`,
      colaboradorId: p._id,
      em: agora,
    });
    await notificar(ctx, {
      chave: `convite:recusado:${c._id}`,
      tipo: "equipa",
      titulo: `${p.nome} recusou o convite`,
      detalhe: p.email,
      href: `/equipa/membros/${p._id}`,
      tom: "aviso",
    });
    return null;
  },
});
