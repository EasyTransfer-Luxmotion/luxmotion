import { ConvexError } from "convex/values";
import type { Auth, UserIdentity } from "convex/server";

/**
 * Só a equipa passa daqui.
 *
 * Até aqui nenhuma função do Convex verificava quem a chamava. O URL do Convex
 * está no código que o browser descarrega, e com ele qualquer pessoa conseguia
 * chamar `vehicles.update`, apagar um tour, ler os pedidos de orçamento com
 * nomes e telefones — ou `orders.updatePaymentStatus`, que marca uma encomenda
 * como paga.
 *
 * Ter sessão não chega: o registo no Clerk de produção está aberto ao público,
 * e qualquer pessoa pode criar conta. Por isso o critério é um email
 * VERIFICADO que esteja em ADMIN_EMAILS (variável de cada deployment, separada
 * por vírgulas). Sem a variável ninguém entra — falha fechado, não aberto.
 *
 * O email vem do JWT template "convex" do Clerk (claim `email`).
 */
export async function exigirAdmin(ctx: { auth: Auth }): Promise<UserIdentity> {
  const identidade = await ctx.auth.getUserIdentity();
  if (!identidade) {
    throw new ConvexError("É preciso ter sessão iniciada no back-office.");
  }

  const permitidos = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = identidade.email?.trim().toLowerCase();

  // Um email por verificar não prova nada: com o registo aberto, qualquer um
  // podia criar conta com o endereço de alguém da equipa.
  if (!email || identidade.emailVerified !== true || !permitidos.includes(email)) {
    throw new ConvexError("Esta conta não tem acesso ao back-office.");
  }
  return identidade;
}
