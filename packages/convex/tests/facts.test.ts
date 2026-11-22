import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { triggers } from "../convex/lib/triggers";
import { makeTest } from "./convex";

/*
 * The order facts (lib/orderFacts.ts) replace reading the whole orders table.
 * They are only right if every write keeps them right, so these tests check
 * the screens built on them against the old way of computing the same thing
 * (read everything, filter, sort, slice), after inserts, edits and deletes.
 */

const ADMIN = "recovery@example.com";
const ident = { subject: ADMIN, issuer: "test", tokenIdentifier: `test|${ADMIN}`, email: ADMIN, emailVerified: true, name: "Admin" };

let t: ReturnType<typeof makeTest>;
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  t = makeTest();
});
afterEach(() => vi.unstubAllEnvs());

/* Writes through the triggers, like every mutation of the app does. */
const write = <T>(fn: (db: Parameters<Parameters<typeof t.run>[0]>[0]["db"]) => Promise<T>) =>
  t.run(async (ctx) => fn(triggers.wrapDB(ctx).db));

function random(seed: number) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const STATUSES = ["draft", "draft", "draft", "paid", "paid", "confirmed", "completed", "pending", "pending", "cancelled"] as const;

async function seed(n: number, partners: Id<"partnerships">[]) {
  const r = random(7);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const ids: Id<"orders">[] = [];
  for (let i = 0; i < n; i++) {
    const status = pick(STATUSES);
    const partner = r() < 0.4 ? pick(partners) : undefined;
    const day = `2026-12-${String(1 + Math.floor(r() * 20)).padStart(2, "0")}`;
    const doc = {
      orderNumber: `LT${1000 + i}`,
      status,
      departure: { location: pick(["Aeroporto de Lisboa", "Cascais", "Sintra"]) },
      arrival: { location: pick(["Porto", "Évora", "Fátima"]) },
      /* Same trip time for some, so ties are tested. */
      departureDate: `${day}T${pick(["09:00", "09:00", "14:30", "22:15"])}`,
      passengers: 1 + Math.floor(r() * 6),
      isRoundTrip: false,
      totalAmount: pick([undefined, 50, 75.5, 120, 120, 300]),
      customerName: pick(["Ana Sousa", "João Mendes", "Zé Gonçalves", undefined]),
      customerEmail: `c${i}@example.test`,
      paymentMethod: status === "draft" ? undefined : pick(["card", "mbway", "mb", undefined]),
      paymentStatus: pick([undefined, "pending", "completed", "failed"] as const),
      partnershipId: partner,
      partnershipName: partner ? `Parceiro ${partners.indexOf(partner)}` : pick([undefined, "  "]),
      adSource: r() < 0.5 ? { utmSource: pick(["google", "Meta", " chatgpt ", ""]) } : undefined,
      createdAt: 0,
      updatedAt: 0,
    } as const;
    const id = await write((db) => db.insert("orders", doc as never));
    ids.push(id);
    if ((status === "paid" || status === "completed") && r() < 0.3) {
      const back = await write((db) =>
        db.insert("orders", { ...doc, orderNumber: `LT${1000 + i}R`, relatedOrderId: id, partnershipId: undefined, partnershipName: undefined, customerName: undefined } as never),
      );
      await write((db) => db.patch(id, { relatedOrderId: back }));
      ids.push(back);
    }
  }
  return ids;
}

const all = () => t.run((ctx) => ctx.db.query("orders").collect());

/* ─── The old list, verbatim in spirit: everything in memory. ─── */

const VIEW: Record<string, string[]> = {
  reservas: ["paid", "confirmed", "completed"],
  porPagar: ["pending"],
  canceladas: ["cancelled"],
  carrinhos: ["draft"],
};
type ListArgs = {
  vista: "reservas" | "porPagar" | "canceladas" | "carrinhos" | "todas";
  quando?: "proximas" | "passadas";
  dia?: string;
  pagamento?: string;
  metodo?: string;
  origem?: string;
  parceiro?: string;
  pesquisa?: string;
  ordenar?: "viagem" | "criada" | "total";
  sentido?: "asc" | "desc";
  pagina: number;
  porPagina: number;
};
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const TODAY = "2026-12-10";

function oldList(docs: Doc<"orders">[], a: ListArgs) {
  let d = docs.filter((o) => a.vista === "todas" || VIEW[a.vista]!.includes(o.status));
  if (a.dia) d = d.filter((o) => o.departureDate.startsWith(a.dia!));
  else if (a.quando) d = d.filter((o) => (a.quando === "proximas" ? o.departureDate >= TODAY : o.departureDate < TODAY));
  if (a.metodo) d = d.filter((o) => o.paymentMethod === a.metodo);
  if (a.parceiro) d = d.filter((o) => (a.parceiro === "direto" ? !o.partnershipName?.trim() : o.partnershipName?.trim() === a.parceiro));
  if (a.pagamento) d = d.filter((o) => (o.paymentStatus ?? "sem") === a.pagamento);
  const src = (o: Doc<"orders">) => o.adSource?.utmSource?.trim().toLowerCase() || "";
  if (a.origem) d = d.filter((o) => (a.origem === "desconhecida" ? !src(o) : `source:${src(o)}` === a.origem));
  const terms = plain(a.pesquisa ?? "").split(/\s+/).filter(Boolean);
  if (terms.length) d = d.filter((o) => terms.every((x) => plain([o.orderNumber, o.customerName, o.customerEmail, o.partnershipName].filter(Boolean).join(" ")).includes(x)));
  const ord = a.ordenar ?? "criada";
  const sentido = a.sentido ?? (ord === "viagem" && a.quando === "proximas" ? "asc" : "desc");
  const key = (o: Doc<"orders">) => (ord === "viagem" ? o.departureDate : ord === "total" ? (o.totalAmount ?? 0) : o._creationTime);
  d.sort((x, y) => {
    const c = key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : x._id < y._id ? -1 : x._id > y._id ? 1 : 0;
    return sentido === "asc" ? c : -c;
  });
  const paginas = Math.max(1, Math.ceil(d.length / a.porPagina));
  const pagina = Math.min(a.pagina, paginas - 1);
  return { total: d.length, pagina, ids: d.slice(pagina * a.porPagina, (pagina + 1) * a.porPagina).map((o) => o._id) };
}

async function check(a: ListArgs) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  const res = await t.withIdentity(ident).query(api.reservas.lista, a);
  vi.useRealTimers();
  const want = oldList(await all(), a);
  expect(res, JSON.stringify(a)).not.toBeNull();
  expect({ total: res!.total, pagina: res!.pagina, ids: res!.linhas.map((l) => l._id) }, JSON.stringify(a)).toEqual(want);
  expect(res!.aproximado).toBe(false);
}

describe("reservations list (reservas.lista) matches reading everything", () => {
  test("every view, sort, date range, filter and page", async () => {
    const partners = await t.run(async (ctx) => Promise.all([0, 1, 2].map((i) => ctx.db.insert("partnerships", { name: `Parceiro ${i}`, slug: `p${i}`, theme: {} }))));
    await seed(220, partners);

    const vistas = ["reservas", "porPagar", "canceladas", "carrinhos", "todas"] as const;
    const sorts = [
      { ordenar: "viagem", sentido: "asc" },
      { ordenar: "criada", sentido: "desc" },
      { ordenar: "total", sentido: "desc" },
      { ordenar: "viagem", sentido: "desc" },
    ] as const;
    const ranges = [{}, { quando: "proximas" }, { quando: "passadas" }, { dia: "2026-12-05" }] as const;
    const filters = [{}, { metodo: "card" }, { parceiro: "Parceiro 1" }, { parceiro: "direto" }, { pagamento: "sem" }, { origem: "source:google" }, { origem: "desconhecida" }, { metodo: "mbway", parceiro: "direto" }] as const;
    for (const vista of vistas)
      for (const s of sorts)
        for (const r of ranges)
          for (const f of filters)
            for (const pagina of [0, 2]) await check({ vista, ...s, ...r, ...f, pagina, porPagina: 7 });
  }, 600_000);

  test("deep pages of merged trees (carts in shards, Todas) are exact", async () => {
    await seed(760, []);
    for (const vista of ["carrinhos", "todas"] as const)
      for (const s of [{ ordenar: "criada", sentido: "desc" }, { ordenar: "viagem", sentido: "asc" }, { ordenar: "total", sentido: "asc" }] as const)
        for (const pagina of [10, 11, 13]) await check({ vista, ...s, pagina, porPagina: 50 });
  }, 600_000);

  test("search finds by name without accents, by number and with filters", async () => {
    await seed(80, []);
    for (const pesquisa of ["joao", "Gonçalves", "LT1012", "ana sousa"])
      for (const vista of ["todas", "reservas"] as const) await check({ vista, pesquisa, pagina: 0, porPagina: 50 });
  });

  test("the sidebar counts follow status changes, deletes and new orders", async () => {
    const ids = await seed(60, []);
    const counts = async () => t.withIdentity(ident).query(api.reservas.contagens, {});
    const truth = async () => {
      const d = await all();
      const n = (v: string) => d.filter((o) => VIEW[v]!.includes(o.status)).length;
      return { reservas: n("reservas"), porPagar: n("porPagar"), canceladas: n("canceladas") };
    };
    expect(await counts()).toEqual(await truth());
    for (const id of ids.slice(0, 15)) await write((db) => db.patch(id, { status: "cancelled" }));
    for (const id of ids.slice(15, 25)) await write((db) => db.delete(id));
    for (const id of ids.slice(25, 35)) await write((db) => db.patch(id, { status: "paid", departureDate: "2027-01-01T10:00" }));
    expect(await counts()).toEqual(await truth());
  });
});

describe("partner numbers (parceiros.lista) match reading everything", () => {
  test("bookings count outbound legs, revenue both, and follow changes", async () => {
    const partners = await t.run(async (ctx) => Promise.all([0, 1, 2, 3].map((i) => ctx.db.insert("partnerships", { name: `Parceiro ${i}`, slug: `p${i}`, theme: {} }))));
    const ids = await seed(150, partners);
    await t.run(async (ctx) => {
      const db = triggers.wrapDB(ctx).db;
      await db.insert("contactQuotes", { partnershipId: partners[0], fullName: "A", company: "B", email: "a@example.test", phone: "1", subject: "s", message: "m", status: "new", createdAt: 5 });
      await db.insert("tourInquiries", { partnershipId: partners[0], name: "A", email: "a@example.test", phone: "1", datesFlexible: true, interests: "x", marketingOptIn: false, createdAt: 9 } as never);
    });

    const truth = async () => {
      const d = await all();
      const byId = new Map(d.map((o) => [o._id as string, o]));
      const m = new Map<string, { reservas: number; faturacao: number }>();
      for (const o of d) {
        if (!["paid", "confirmed", "completed"].includes(o.status)) continue;
        const other = o.relatedOrderId ? byId.get(o.relatedOrderId) : undefined;
        const isReturn = Boolean(other && other._creationTime < o._creationTime);
        const outbound = isReturn ? other! : o;
        if (!outbound.partnershipId) continue;
        const x = m.get(outbound.partnershipId) ?? { reservas: 0, faturacao: 0 };
        x.faturacao += o.totalAmount ?? 0;
        if (!isReturn) x.reservas++;
        m.set(outbound.partnershipId, x);
      }
      return partners.map((p) => ({ id: p as string, reservas: m.get(p)?.reservas ?? 0, faturacao: Math.round((m.get(p)?.faturacao ?? 0) * 100) / 100 }));
    };
    const got = async () => {
      const r = await t.withIdentity(ident).query(api.parceiros.lista, { template: "todos", estado: "todas", pagina: 0, porPagina: 50 });
      return partners.map((p) => {
        const l = r.linhas.find((x) => x.id === p)!;
        return { id: p as string, reservas: l.reservas, faturacao: l.faturacao };
      });
    };
    expect(await got()).toEqual(await truth());
    const r0 = await t.withIdentity(ident).query(api.parceiros.lista, { template: "todos", estado: "todas", pagina: 0, porPagina: 50 });
    expect(r0.linhas.find((x) => x.id === partners[0])!.pedidos).toBe(2);

    /* An outbound leg moves to another partner, others are cancelled or
       deleted: the returns follow their outbound. */
    const docs = await all();
    const outbound = docs.filter((o) => o.relatedOrderId && o.partnershipId);
    for (const o of outbound.slice(0, 3)) await write((db) => db.patch(o._id, { partnershipId: partners[3] }));
    for (const id of ids.slice(0, 20)) await write((db) => db.patch(id, { status: "cancelled" }));
    for (const id of ids.slice(20, 30)) await write((db) => db.delete(id));
    expect(await got()).toEqual(await truth());
  });
});

describe("every write goes through the triggers", () => {
  /* One mutation built from _generated/server writes without them, and the
     counts and lists drift until the next backfill. */
  test("no module defines a mutation without functions.ts", () => {
    const dir = join(__dirname, "../convex");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (f === "_generated" || f === "node_modules") continue;
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.ts$/.test(f) && f !== "functions.ts") files.push(p);
      }
    };
    walk(dir);
    const offenders = files.filter((f) => /import\s*\{[^}]*\b(mutation|internalMutation)\b[^}]*\}\s*from\s*["'](\.\.?\/)+_generated\/server["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
