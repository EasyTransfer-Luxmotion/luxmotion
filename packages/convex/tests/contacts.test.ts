import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { triggers } from "../convex/lib/triggers";
import * as legacy from "./legacy/contactos";
import { makeTest } from "./convex";

/*
 * Contactos now reads numbers and relations kept on each contact and
 * organisation (lib/contactFacts.ts) instead of every contact, order and
 * card. The old list (tests/legacy/contactos.ts) is the oracle for what each
 * row says and which rows a filter keeps; the order is the new one (ties by
 * id, names without accents), applied to the old rows.
 */

const ADMIN = "recovery@example.com";
const ident = { subject: ADMIN, issuer: "test", tokenIdentifier: `test|${ADMIN}`, email: ADMIN, emailVerified: true, name: "Admin" };

let t: ReturnType<typeof makeTest>;
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  t = makeTest();
});
afterEach(() => vi.unstubAllEnvs());

function random(seed: number) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
const w = <T>(fn: (db: Parameters<Parameters<typeof t.run>[0]>[0]["db"]) => Promise<T>) => t.run(async (ctx) => fn(triggers.wrapDB(ctx).db));

async function seed() {
  const r = random(3);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const etapas = [{ id: "e1", nome: "Novo", cor: "#000", tipo: "aberta" as const }];
  const funis = await t.run(async (ctx) =>
    Promise.all(["reservas", "medida", "parcerias"].map((chave) => ctx.db.insert("funis", { chave, etapas, criadoEm: 0, atualizadoEm: 0 }))),
  );
  const partner = await t.run((ctx) => ctx.db.insert("partnerships", { name: "Hotel Sol", slug: "hotel-sol", theme: {} }));
  const orgs: Id<"organizacoes">[] = [];
  for (let i = 0; i < 12; i++) {
    const nome = pick(["Hotel", "Ágata", "zebra", "Quinta"]) + ` ${i}`;
    orgs.push(
      await w((db) =>
        db.insert("organizacoes", {
          nome,
          nomeNormalizado: nome.toLowerCase(),
          etiquetas: r() < 0.3 ? ["vip"] : [],
          segmento: pick([undefined, "hotelaria", "eventos"]),
          localidade: pick([undefined, "Lisboa", "Porto"]),
          responsavel: pick([undefined, "ana@example.test"]),
          grupoId: i > 2 && r() < 0.3 ? orgs[0] : undefined,
          carteira: i === 1 ? ({ estado: "ativa", aceiteEm: 0, partnershipId: partner } as never) : undefined,
          primeiraOrigem: pick([undefined, "partnerLeads", "manual:motoristas", "contactQuotes"]),
          criadoEm: i,
          atualizadoEm: 1000 + Math.floor(r() * 50),
        }),
      ),
    );
  }
  const people: Id<"contactos">[] = [];
  for (let i = 0; i < 60; i++) {
    const nome = `${pick(["Ana", "Élio", "joão", "Zé", "Bruno"])} ${i}`;
    people.push(
      await w((db) =>
        db.insert("contactos", {
          nome,
          email: r() < 0.7 ? `c${i}@example.test` : undefined,
          telefone: r() < 0.5 ? `+35191${i}` : undefined,
          etiquetas: r() < 0.2 ? ["vip"] : [],
          idioma: pick([undefined, "pt", "en"]),
          responsavel: pick([undefined, "ana@example.test"]),
          organizacaoId: r() < 0.35 ? pick(orgs) : undefined,
          primeiraOrigem: pick([undefined, "orders", "driverApplications", "partnerLeads", "manual:parceiros", "weddingQuoteSubmissions"]),
          criadoEm: i,
          atualizadoEm: 2000 + Math.floor(r() * 80),
        }),
      ),
    );
  }
  for (let i = 0; i < 50; i++) {
    const contactoId = r() < 0.8 ? pick(people) : undefined;
    const organizacaoId = r() < 0.3 ? pick(orgs) : undefined;
    await w((db) =>
      db.insert("negocios", {
        funilId: pick(funis),
        etapaId: "e1",
        ordem: i,
        titulo: `c${i}`,
        pessoa: { nome: "x" },
        origem: pick(["orders", "contactQuotes", "partnerLeads", "driverApplications"]),
        contactoId,
        organizacaoId,
        arquivadoEm: r() < 0.15 ? 1 : undefined,
        criadoEm: i,
        atualizadoEm: i,
        movidoEm: i,
      }),
    );
  }
  const orders: Id<"orders">[] = [];
  for (let i = 0; i < 90; i++) {
    const doc = {
      orderNumber: `LT${i}`,
      status: pick(["paid", "paid", "completed", "confirmed", "draft", "cancelled"] as const),
      departure: { location: "A" },
      arrival: { location: "B" },
      departureDate: "2026-12-01T10:00",
      passengers: 1,
      isRoundTrip: false,
      totalAmount: Math.round(r() * 30000) / 100,
      contactoId: r() < 0.8 ? pick(people) : undefined,
      organizacaoId: r() < 0.3 ? pick(orgs) : undefined,
      partnershipId: r() < 0.2 ? partner : undefined,
      createdAt: 0,
      updatedAt: 0,
    };
    const id = await w((db) => db.insert("orders", doc as never));
    orders.push(id);
    if (!doc.partnershipId && r() < 0.2) {
      const back = await w((db) => db.insert("orders", { ...doc, orderNumber: `LT${i}R`, relatedOrderId: id, partnershipId: undefined } as never));
      await w((db) => db.patch(id, { relatedOrderId: back }));
    }
  }
  return { orgs, people, orders, funis };
}

type Args = Parameters<typeof legacy.lista._handler>[1] extends infer A ? A : never;
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function check(a: Record<string, unknown>) {
  const args = { pagina: 0, porPagina: 1000, ...a } as Args & { tipo: "contactos" | "organizacoes"; ordem?: string; pagina: number; porPagina: number };
  const old = (await t.withIdentity(ident).run((ctx) => (legacy.lista as unknown as { _handler: (c: unknown, x: unknown) => Promise<{ linhas: Record<string, unknown>[] }> })._handler(ctx, { ...args, pagina: 0, porPagina: 100000 }))).linhas;
  const ordem = (args.ordem as string) ?? "recentes";
  const key = (l: Record<string, unknown>): number | string | number[] =>
    ordem === "recentes" ? (l.atualizadoEm as number) : ordem === "reservas" ? [l.reservas as number, (l.ultimaReserva as number) ?? 0] : ordem === "gasto" ? ((l.gasto as number) ?? 0) : plain(l.nome as string);
  const dir = ordem === "nome" ? 1 : -1;
  old.sort((x, y) => {
    const a1 = key(x);
    const b1 = key(y);
    const c = Array.isArray(a1) && Array.isArray(b1) ? a1[0]! - b1[0]! || a1[1]! - b1[1]! : a1 < b1 ? -1 : a1 > b1 ? 1 : 0;
    return dir * (c || ((x.id as string) < (y.id as string) ? -1 : (x.id as string) > (y.id as string) ? 1 : 0));
  });
  const pp = args.porPagina;
  const paginas = Math.max(1, Math.ceil(old.length / pp));
  const pagina = Math.min(args.pagina, paginas - 1);
  const want = old.slice(pagina * pp, (pagina + 1) * pp).map((l) => ({ ...l, relacoes: [...(l.relacoes as string[])].sort() }));
  const got = await t.withIdentity(ident).query(api.contactos.lista, args as never);
  expect(got.total, JSON.stringify(a)).toBe(old.length);
  expect(
    got.linhas.map((l) => ({ ...l, relacoes: [...l.relacoes].sort() })),
    JSON.stringify(a),
  ).toEqual(want);
}

describe("Contactos (contactos.lista) = reading everything", () => {
  test("every type, relation, sort, filter and page, after changes", async () => {
    const { people, orders, orgs } = await seed();
    /* Changes after the fact: a booking cancelled, a person moves organisation,
       an organisation gains a portfolio, a card is archived. */
    const sos = (await t.run((ctx) => ctx.db.query("orders").collect())).filter((o) => !o.relatedOrderId).map((o) => o._id);
    for (const id of sos.slice(0, 8)) await w((db) => db.patch(id, { status: "cancelled" }));
    await w((db) => db.patch(people[3]!, { organizacaoId: orgs[1] }));
    await w((db) => db.patch(orgs[5]!, { carteira: { estado: "ativacao", aceiteEm: 0 } as never }));
    await w((db) => db.delete(sos[10]!));
    void orders;

    for (const tipo of ["contactos", "organizacoes"] as const)
      for (const relacao of [undefined, "clientes", "parceiros", "motoristas"] as const)
        for (const ordem of ["recentes", "reservas", "gasto", "nome"] as const) {
          await check({ tipo, relacao, ordem });
          await check({ tipo, relacao, ordem, pagina: 1, porPagina: 7 });
        }
    for (const tipo of ["contactos", "organizacoes"] as const)
      for (const f of [{ reservas: "com" }, { reservas: "recorrentes" }, { reservas: "sem" }, { pedidos: "com" }, { localidade: "Lisboa" }, { etiqueta: "vip" }, { responsavel: "ana@example.test" }, { segmento: "hotelaria" }, { ultima: "30" }])
        await check({ tipo, ...f });
  }, 600_000);

  test("search, and the picker finds by name and by email", async () => {
    const { people } = await seed();
    for (const pesquisa of ["joao", "Élio", "c12@example.test"]) {
      const got = await t.withIdentity(ident).query(api.contactos.lista, { tipo: "contactos", pesquisa, pagina: 0, porPagina: 100 });
      const all = await t.run((ctx) => ctx.db.query("contactos").collect());
      const want = all.filter((c) => [c.nome, c.email, c.telefone].some((x) => x && plain(x).includes(plain(pesquisa)))).map((c) => c._id as string).sort();
      expect(got.linhas.map((l) => l.id).sort(), pesquisa).toEqual(want);
    }
    const ze = await t.run((ctx) => ctx.db.get(people[0]!));
    const picked = await t.withIdentity(ident).query(api.contactos.escolher, { tipo: "contactos", semelhante: { nome: ze!.nome, email: ze!.email }, limite: 5 });
    expect(picked[0]!.id).toBe(people[0]);
  }, 600_000);
});
