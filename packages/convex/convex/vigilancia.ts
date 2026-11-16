import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { frotaVisivel } from "./lib/frota";

/*
 * Verificação diária das parcerias publicadas (cron em crons.ts).
 *
 * Em 16/11/2026 o checkout de todos os parceiros estava sem carros em
 * produção e ninguém deu por isso: só se vê ao tentar reservar pela página
 * do parceiro. Isto confere todos os dias o que o site mostraria e manda um
 * email à equipa se alguma coisa estiver partida. Os mesmos avisos aparecem
 * na lista de Parcerias do back-office (parceiros.lista).
 */

const SLUG_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "LuxMotion <onboarding@resend.dev>";
const DESTINO_POR_OMISSAO = "easytransferpt@gmail.com";
const ADMIN_POR_OMISSAO = "https://www.easytransferportugal.com/admin";

export type ProblemaParceria = { id: string; nome: string; slug: string; problemas: string[] };

export const problemasDosParceiros = internalQuery({
  args: {},
  handler: async (ctx): Promise<ProblemaParceria[]> => {
    const activos = await ctx.db.query("vehicles").withIndex("by_status", (q) => q.eq("status", "active")).collect();
    const parcerias = (await ctx.db.query("partnerships").collect()).filter((p) => p.status !== "inactive");
    return parcerias
      .map((p) => {
        const problemas: string[] = [];
        if (frotaVisivel(activos, p).length === 0) problemas.push("o checkout não mostra carros nenhuns");
        if (!SLUG_VALIDO.test(p.slug)) problemas.push(`o endereço "/${p.slug}" tem caracteres que partem páginas e o sitemap (só minúsculas, números e hífens)`);
        return { id: p._id as string, nome: p.name, slug: p.slug, problemas };
      })
      .filter((x) => x.problemas.length > 0);
  },
});

export const verificarParceiros = internalAction({
  args: {},
  handler: async (ctx): Promise<{ problemas: number }> => {
    const lista: ProblemaParceria[] = await ctx.runQuery(internal.vigilancia.problemasDosParceiros, {});
    if (lista.length === 0) return { problemas: 0 };
    /* No sininho do back-office em todos os ambientes; o email só onde há Resend. */
    await ctx.runMutation(internal.notificacoes.registarAvisosParcerias, {
      lista: lista.map((x) => ({ id: x.id, nome: x.nome, problemas: x.problemas })),
    });
    console.error(`[Vigilância] ${lista.length} parcerias com problemas: ${lista.map((x) => x.slug).join(", ")}`);

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[Vigilância] RESEND_API_KEY não está definida — o aviso fica só no log.");
      return { problemas: lista.length };
    }
    const admin = (process.env.ADMIN_BASE_URL ?? ADMIN_POR_OMISSAO).replace(/\/$/, "");
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1c1b18">
        <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#9a7535;margin:0 0 8px">Verificação diária</p>
        <h1 style="font-size:20px;margin:0 0 16px">${lista.length === 1 ? "Uma parceria com problemas" : `${lista.length} parcerias com problemas`}</h1>
        <ul style="font-size:14px;line-height:1.6;padding-left:18px">
          ${lista.map((x) => `<li><b>${esc(x.nome)}</b> (/${esc(x.slug)}): ${x.problemas.map(esc).join("; ")}</li>`).join("")}
        </ul>
        <p style="margin:20px 0 0"><a href="${admin}/partnerships" style="display:inline-block;background:#1c1b18;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px">Abrir as parcerias</a></p>
      </div>`;
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? DEFAULT_FROM,
        to: [process.env.PEDIDOS_EMAIL ?? DESTINO_POR_OMISSAO],
        subject: `Parcerias com problemas: ${lista.map((x) => x.nome).join(", ")}`.slice(0, 200),
        html,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) console.error(`[Vigilância] Resend ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
    return { problemas: lista.length };
  },
});
