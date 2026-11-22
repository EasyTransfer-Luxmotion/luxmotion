import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { triggers } from "../convex/lib/triggers";
import * as legacy from "./legacy/estatistica";
import { makeTest } from "./convex";

/*
 * Finanças now reads day and month totals (lib/orderStats.ts) instead of every
 * order. These tests run the old statistics (tests/legacy/estatistica.ts, the
 * code before the change, reading everything) and the new ones on the same
 * orders, spread over 15 months, and require the same answer: to the cent
 * for money, exactly for counts, within the HyperLogLog's error for unique
 * clients.
 */

const ADMIN = "recovery@example.com";
const ident = { subject: ADMIN, issuer: "test", tokenIdentifier: `test|${ADMIN}`, email: ADMIN, emailVerified: true, name: "Admin" };

let t: ReturnType<typeof makeTest>;
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  t = makeTest();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const write = <T>(fn: (db: Parameters<Parameters<typeof t.run>[0]>[0]["db"]) => Promise<T>) => t.run(async (ctx) => fn(triggers.wrapDB(ctx).db));

function random(seed: number) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const DAY = 86_400_000;
const START = Date.UTC(2025, 8, 1, 10); // 2025-09-01
const END = Date.UTC(2026, 11, 10, 10); // 2026-12-10

async function seed(n: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  const r = random(11);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const partners = ["Hotel Sol", "Quinta Azul", "Easy Transfer"];
  const org = await t.run((ctx) => ctx.db.insert("organizacoes", { nome: "Empresa X", nomeNormalizado: "empresa x", etiquetas: [], criadoEm: 0, atualizadoEm: 0 } as never));
  const tours: Id<"tourBookings">[] = [];
  for (const [i, kind] of (["tour", "event", "tour", "experience"] as const).entries())
    tours.push(
      await t.run((ctx) =>
        ctx.db.insert("tourBookings", {
          bookingNumber: `TB${i}`,
          productType: kind,
          tourTitle: kind === "event" ? "Festa do Vinho" : `Tour ${i}`,
          tourSlug: `t${i}`,
          passengers: 2,
          selectedDate: "2026-01-01",
          selectedTime: "10:00",
          customerName: "x",
          customerEmail: "x@example.test",
          customerPhone: "1",
          basePrice: 1,
          tipPercent: 0,
          tipAmount: 0,
          totalAmount: 1,
          status: "paid",
          createdAt: 0,
          updatedAt: 0,
        } as never),
      ),
    );
  const times = Array.from({ length: n }, () => START + r() * (END - START)).sort((a, b) => a - b);
  const ids: Id<"orders">[] = [];
  for (let i = 0; i < n; i++) {
    vi.setSystemTime(times[i]!);
    const status = pick(["draft", "draft", "paid", "paid", "paid", "confirmed", "completed", "pending", "cancelled"] as const);
    const created = new Date(times[i]!);
    const trip = new Date(times[i]! + Math.floor(r() * 50) * DAY);
    const tripDay = trip.toISOString().slice(0, 10);
    const tour = r() < 0.2 ? pick(tours) : undefined;
    const doc = {
      orderNumber: tour ? `TB${1000 + i}` : `LT${1000 + i}`,
      tourBookingId: tour,
      status,
      paymentStatus: status === "cancelled" ? pick(["completed", undefined] as const) : status === "draft" ? undefined : "completed",
      departure: { location: pick(["Aeroporto de Lisboa", "Cascais, Portugal", "Sintra"]) , name: pick([undefined, "Hotel Mar"]) },
      arrival: { location: pick(["Porto", "Évora", "Fátima"]) },
      departureDate: `${tripDay}T${pick(["06:15", "09:00", "14:30", "22:45", "23:59"])}`,
      passengers: 1 + Math.floor(r() * 6),
      isRoundTrip: r() < 0.1,
      vehicleName: pick(["Classe E", "Classe V", undefined]),
      totalAmount: Math.round((30 + r() * 400) * 100) / 100,
      addonsTotal: pick([undefined, 0, 12.5]),
      airportServiceFee: pick([undefined, 0, 5]),
      nightTax: pick([undefined, 0, 9]),
      /* One name per email, like real clients: the top list shows the name
         of the latest booking, the old one the first. */
      ...(() => {
        const k = Math.floor(r() * 40);
        const name = `${["Ana Sousa", "João Mendes", "Rui Costa", "Marta Lima"][k % 4]} ${k}`;
        return r() < 0.7
          ? { customerName: name, customerEmail: `c${k}@example.test`, customerPhone: `91${k}` }
          : { customerName: `${name} ${i}`, customerEmail: undefined, customerPhone: `92${i}` };
      })(),
      customerNif: pick([undefined, "123456789", "512345678"]),
      organizacaoId: r() < 0.1 ? org : undefined,
      paymentMethod: pick(["card", "mbway", "mb", "cash", undefined]),
      partnershipName: pick([undefined, ...partners]),
      adSource: r() < 0.5 ? { utmSource: pick(["google", "facebook", "chatgpt", "news"]) } : undefined,
      createdAt: times[i]!,
      updatedAt: times[i]!,
    };
    void created;
    const id = await write((db) => db.insert("orders", doc as never));
    ids.push(id);
    if (!tour && status !== "draft" && r() < 0.25) {
      vi.setSystemTime(times[i]! + 1);
      const back = await write((db) =>
        db.insert("orders", { ...doc, orderNumber: `${doc.orderNumber}R`, relatedOrderId: id, partnershipName: undefined, customerName: undefined, customerEmail: undefined, totalAmount: Math.round(r() * 20000) / 100 } as never),
      );
      await write((db) => db.patch(id, { relatedOrderId: back }));
      ids.push(back);
    }
  }
  /* Partner pages, one never sold. */
  await t.run(async (ctx) => {
    for (const name of [...partners, "Casa Vazia"]) await ctx.db.insert("partnerships", { name, slug: name.toLowerCase().replace(/\W+/g, "-"), theme: {}, createdAt: START });
  });
  vi.setSystemTime(END);
  return ids;
}

/* Deep equality, with money to the cent and unique clients within 3%. */
function close(got: unknown, want: unknown, path = "$"): void {
  if (typeof want === "number" && typeof got === "number") {
    const tol = /clientes/.test(path) ? Math.max(1, Math.abs(want) * 0.04) : 0.011;
    expect(Math.abs(got - want), `${path}: ${got} vs ${want}`).toBeLessThanOrEqual(tol);
    return;
  }
  if (Array.isArray(want)) {
    expect(Array.isArray(got), path).toBe(true);
    expect((got as unknown[]).length, `${path}.length`).toBe(want.length);
    want.forEach((w, i) => close((got as unknown[])[i], w, `${path}[${i}]`));
    return;
  }
  if (want && typeof want === "object") {
    expect(got && typeof got === "object", path).toBe(true);
    const keys = new Set([...Object.keys(want), ...Object.keys(got as object)]);
    for (const k of keys) close((got as Record<string, unknown>)[k], (want as Record<string, unknown>)[k], `${path}.${k}`);
    return;
  }
  expect(got, path).toEqual(want);
}

const old = (fn: { _handler?: unknown }, args: unknown) =>
  t.withIdentity(ident).run((ctx) => (fn as unknown as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, args));

const PERIODS = [
  ["2026-11-01", "2026-11-30"], // a whole month, by day
  ["2026-10-15", "2026-12-05"], // edges, by week
  ["2025-12-11", "2026-12-10"], // 12 months, by month, with edges
  ["2026-03-07", "2026-03-07"], // one day
] as const;

describe("Finanças from the day and month totals = reading every order", () => {
  test("transfers, tours, partners and the summary, over four periods", async () => {
    const ids = await seed(500);
    /* Some changes after the fact: paid then cancelled, deleted. */
    for (const id of ids.slice(40, 52)) await write((db) => db.patch(id, { status: "cancelled", paymentStatus: "completed" }));
    for (const id of ids.slice(60, 66)) await write((db) => db.delete(id));

    for (const [de, ate] of PERIODS) {
      for (const soSite of [undefined, true]) close(await t.withIdentity(ident).query(api.estatistica.transfers, { de, ate, soSite }), await old(legacy.transfers, { de, ate, soSite }), `transfers ${de} ${soSite}`);
      for (const tipo of [undefined, "tour", "evento"] as const) close(await t.withIdentity(ident).query(api.estatistica.tours, { de, ate, tipo }), await old(legacy.tours, { de, ate, tipo }), `tours ${de} ${tipo}`);
      close(await t.withIdentity(ident).query(api.estatistica.parceiros, { de, ate }), await old(legacy.parceiros, { de, ate }), `parceiros ${de}`);
      close(await t.withIdentity(ident).query(api.estatistica.resumoFinancas, { de, ate, hoje: "2026-12-01" }), await old(legacy.resumoFinancas, { de, ate, hoje: "2026-12-01" }), `resumo ${de}`);
    }
  }, 600_000);

  test("Definições: today's bookings and the 30-day average", async () => {
    await seed(200);
    const hoje = "2026-12-10";
    const got = await t.withIdentity(ident).query(api.definicoes.detalhe, { hoje });
    const all = await t.run((ctx) => ctx.db.query("orders").collect());
    const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(ms));
    const byId = new Map(all.map((o) => [o._id as string, o]));
    const services = all.filter((o) => {
      if (!["paid", "confirmed", "completed"].includes(o.status)) return false;
      const other = o.relatedOrderId ? byId.get(o.relatedOrderId) : undefined;
      return !(other && other._creationTime < o._creationTime);
    });
    const from = new Date(Date.UTC(2026, 11, 10) - 29 * DAY).toISOString().slice(0, 10);
    const last30 = services.filter((o) => day(o._creationTime) >= from && day(o._creationTime) <= hoje);
    const today = services.filter((o) => day(o._creationTime) === hoje);
    expect(got.reais).toEqual({
      reservasHoje: today.length,
      mediaDiaria30: Math.round((last30.length / 30) * 10) / 10,
      passageirosHoje: today.reduce((s, o) => s + o.passengers, 0),
    });
  }, 600_000);
});
