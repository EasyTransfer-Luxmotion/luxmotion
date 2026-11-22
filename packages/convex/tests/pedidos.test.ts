import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { triggers } from "../convex/lib/triggers";
import { TABELA, TIPOS, estadoDe, grupoDe, type Tipo } from "../convex/lib/requests";
import { makeTest } from "./convex";

/*
 * Operação → Pedidos reads the request facts (lib/orderFacts.ts) instead of
 * the six form tables. Checked against reading them all, the old way, after
 * requests come in, change state and are deleted.
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

const STATES: Record<Tipo, (string | undefined)[]> = {
  contactos: ["new", "read", "archived", undefined],
  orcamentos: ["new", "inProgress", "resolved", "archived"],
  ultraluxo: ["new", "read", "archived", undefined],
  casamentos: ["new", "read", "archived", undefined],
  escolas: ["new", "read", "archived", undefined],
  corporate: ["submitted", "reviewing", "approved", "rejected"],
};

function doc(tipo: Tipo, i: number, r: () => number) {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const base = {
    email: `p${i}@example.test`,
    createdAt: 1_790_000_000_000 + Math.floor(r() * 5_000_000_000),
    status: pick(STATES[tipo]),
    partnershipName: pick([undefined, "Hotel Sol", "Quinta Azul", " "]),
  };
  const nome = `${pick(["Ana", "João", "Inês"])} ${pick(["Sousa", "Gonçalves"])} ${i}`;
  switch (tipo) {
    case "contactos":
      return { ...base, name: nome, message: `Pergunta ${i}` };
    case "orcamentos":
      return { ...base, status: base.status ?? "new", fullName: nome, company: "Empresa", phone: "1", subject: "Orçamento", message: `m ${i}` };
    case "ultraluxo":
      return { ...base, name: nome, phone: "1", datesFlexible: true, interests: "vinho", marketingOptIn: false };
    case "casamentos":
      return { ...base, fullName: nome, phone: "1" };
    case "escolas":
      return { ...base, name: nome, phone: "1" };
    case "corporate":
      return { ...base, status: base.status ?? "submitted", fullName: nome, phone: "1", companyName: "Corp", queuePosition: i };
  }
}

type Args = { tipo: Tipo | "todos"; grupo: "porTratar" | "emCurso" | "fechados" | "todos"; parceiro?: string; desde?: number; pesquisa?: string; pagina: number; porPagina: number };

async function oldList(a: Args) {
  const rows = (
    await Promise.all(
      TIPOS.map(async (tipo) =>
        (await t.run((ctx) => ctx.db.query(TABELA[tipo]).collect())).map((d) => {
          const estado = estadoDe(tipo, d.status);
          return { tipo, id: d._id as string, grupo: grupoDe(estado), recebido: d.createdAt, parceiro: d.partnershipName ?? null, nome: ("name" in d ? d.name : (d as { fullName: string }).fullName) as string };
        }),
      ),
    )
  ).flat();
  const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const f = rows
    .filter((x) => a.tipo === "todos" || x.tipo === a.tipo)
    .filter((x) => a.grupo === "todos" || x.grupo === a.grupo)
    .filter((x) => !a.parceiro || (a.parceiro === "direto" ? !x.parceiro?.trim() : x.parceiro?.trim() === a.parceiro))
    .filter((x) => a.desde === undefined || x.recebido >= a.desde)
    .filter((x) => !a.pesquisa || plain(x.nome).includes(plain(a.pesquisa)))
    .sort((x, y) => y.recebido - x.recebido || (x.id < y.id ? 1 : x.id > y.id ? -1 : 0));
  const paginas = Math.max(1, Math.ceil(f.length / a.porPagina));
  const pagina = Math.min(a.pagina, paginas - 1);
  return { total: f.length, pagina, ids: f.slice(pagina * a.porPagina, (pagina + 1) * a.porPagina).map((x) => x.id) };
}

async function check(a: Args) {
  const got = await t.withIdentity(ident).query(api.pedidos.lista, a);
  expect({ total: got.total, pagina: got.pagina, ids: got.linhas.map((l) => l.id) }, JSON.stringify(a)).toEqual(await oldList(a));
}

describe("Pedidos (pedidos.lista) = reading the six tables", () => {
  test("every form, group, partner, period and page; counts after changes", async () => {
    const r = random(5);
    const ids: { tipo: Tipo; id: string }[] = [];
    for (let i = 0; i < 180; i++) {
      const tipo = TIPOS[i % TIPOS.length]!;
      const id = await t.run(async (ctx) => triggers.wrapDB(ctx).db.insert(TABELA[tipo], doc(tipo, i, r) as never));
      ids.push({ tipo, id });
    }
    /* Some are read, archived or deleted after arriving. */
    for (const x of ids.slice(0, 20)) await t.run(async (ctx) => triggers.wrapDB(ctx).db.patch(x.id as never, { status: x.tipo === "corporate" ? "approved" : "archived" } as never));
    for (const x of ids.slice(20, 30)) await t.run(async (ctx) => triggers.wrapDB(ctx).db.delete(x.id as never));

    for (const tipo of ["todos", ...TIPOS] as const)
      for (const grupo of ["todos", "porTratar", "emCurso", "fechados"] as const)
        for (const parceiro of [undefined, "direto", "Hotel Sol"])
          for (const desde of [undefined, 1_792_000_000_000])
            for (const pagina of [0, 1]) await check({ tipo, grupo, parceiro, desde, pagina, porPagina: 9 });

    const all = await t.withIdentity(ident).query(api.pedidos.lista, { tipo: "todos", grupo: "todos", pagina: 0, porPagina: 1 });
    expect(all.parceiros).toEqual(["Hotel Sol", "Quinta Azul"]);
    const porTratar = Object.fromEntries(
      await Promise.all(TIPOS.map(async (tipo) => [tipo, (await oldList({ tipo, grupo: "porTratar", pagina: 0, porPagina: 1 })).total])),
    );
    expect(all.porTipo).toEqual(porTratar);
  }, 600_000);

  test("search by name, without accents", async () => {
    const r = random(9);
    for (let i = 0; i < 60; i++) {
      const tipo = TIPOS[i % TIPOS.length]!;
      await t.run(async (ctx) => triggers.wrapDB(ctx).db.insert(TABELA[tipo], doc(tipo, i, r) as never));
    }
    for (const pesquisa of ["goncalves", "Inês", "joao"]) await check({ tipo: "todos", grupo: "todos", pesquisa, pagina: 0, porPagina: 100 });
  });
});
