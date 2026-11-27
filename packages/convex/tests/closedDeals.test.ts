import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { makeTest } from "./convex";

/*
 * The "Fechados" switch: every closed deal of a funnel (the board keeps them
 * a month), with won and lost counted on top and the board's filters.
 */

const ADMIN = "recovery@example.com";
const admin = { subject: ADMIN, issuer: "test", tokenIdentifier: `test|${ADMIN}`, email: ADMIN, emailVerified: true, name: "Admin" };
const DAY = 86_400_000;

let t: ReturnType<typeof makeTest>;
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  t = makeTest();
});
afterEach(() => vi.unstubAllEnvs());

async function funil(chave: string) {
  return await t.run((ctx) =>
    ctx.db.insert("funis", {
      chave,
      etapas: [
        { id: "a", nome: "Novo", cor: "#000", tipo: "aberta" },
        { id: "g", nome: "Ganho", cor: "#0a0", tipo: "ganho" },
        { id: "p", nome: "Perdido", cor: "#a00", tipo: "perdido" },
      ],
      criadoEm: 0,
      atualizadoEm: 0,
    }),
  );
}

describe("closed deals", () => {
  test("all of them, newest first, with won and lost counted", async () => {
    const id = await funil("medida");
    const now = Date.now();
    const deals = [
      { titulo: "Casamento Ana", etapaId: "g", valor: 1000, fechadoEm: now - 2 * DAY, origem: "weddingQuoteSubmissions" },
      // Closed 200 days ago: off the board, still here.
      { titulo: "Escola Norte", etapaId: "g", valor: 500, fechadoEm: now - 200 * DAY, origem: "schoolQuoteSubmissions" },
      { titulo: "Corporate Sul", etapaId: "p", valor: 300, fechadoEm: now - DAY, origem: "corporateRequests", motivoPerda: "Preço" },
      { titulo: "Ainda aberto", etapaId: "a", valor: 999, origem: "contactQuotes" },
      { titulo: "Arquivado", etapaId: "p", valor: 50, fechadoEm: now, origem: "contactQuotes", arquivadoEm: now },
    ];
    for (const [i, d] of deals.entries()) {
      await t.run((ctx) => ctx.db.insert("negocios", { funilId: id, ordem: i, pessoa: { nome: d.titulo }, criadoEm: 0, atualizadoEm: 0, movidoEm: 0, ...d }));
    }
    const as = t.withIdentity(admin);
    const all = (await as.query(api.funis.fechados, { chave: "medida", page: 0, pageSize: 25 }))!;
    expect(all.rows.map((r) => r.titulo)).toEqual(["Corporate Sul", "Casamento Ana", "Escola Norte"]);
    expect(all.metrics).toEqual({ won: { count: 2, value: 1500 }, lost: { count: 1, value: 300 }, rate: 2 / 3 });
    expect(all.rows[0]).toMatchObject({ won: false, motivoPerda: "Preço" });

    // The period counts from the close, and the type filter is the board's.
    const recent = (await as.query(api.funis.fechados, { chave: "medida", filters: { period: "30d" }, page: 0, pageSize: 25 }))!;
    expect(recent.total).toBe(2);
    const weddings = (await as.query(api.funis.fechados, { chave: "medida", filters: { type: "casamentos" }, page: 0, pageSize: 25 }))!;
    expect(weddings.rows.map((r) => r.titulo)).toEqual(["Casamento Ana"]);

    // Picking a result narrows the list, not the numbers.
    const lost = (await as.query(api.funis.fechados, { chave: "medida", result: "lost", page: 0, pageSize: 25 }))!;
    expect(lost.rows.map((r) => r.titulo)).toEqual(["Corporate Sul"]);
    expect(lost.metrics.won.count).toBe(2);
  });

  test("bookings have no closed view", async () => {
    await funil("reservas");
    expect(await t.withIdentity(admin).query(api.funis.fechados, { chave: "reservas", page: 0, pageSize: 25 })).toBeNull();
  });
});
