import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { triggers } from "../convex/lib/triggers";
import { AVALIACAO_DEFAULTS, pontuacao, recomendacao } from "../convex/lib/avaliacao";
import { makeTest } from "./convex";

/*
 * Dashboard spec v1.0 (LuxMotion_Especificacao_Dashboard.docx): Reservas
 * (filters, delay, finished list), Orçamentos (won → bookings) and the
 * applications CRM (its own funnel, documents, score, manual registration).
 */

const ADMIN = "recovery@example.com";
const admin = { subject: ADMIN, issuer: "test", tokenIdentifier: `test|${ADMIN}`, email: ADMIN, emailVerified: true, name: "Admin" };

let t: ReturnType<typeof makeTest>;
beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  t = makeTest();
  await t.mutation(internal.funis.criarFunisIniciais, {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const as = () => t.withIdentity(admin);
const write = <T,>(fn: (db: Parameters<Parameters<typeof t.run>[0]>[0]["db"]) => Promise<T>) => t.run(async (ctx) => fn(triggers.wrapDB(ctx).db));

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(d);
};

async function order(o: { n: string; status: "paid" | "completed" | "cancelled" | "confirmed"; date: string; tipo?: string; partner?: Id<"partnerships">; total?: number }) {
  return await write((db) =>
    db.insert("orders", {
      orderNumber: o.n,
      status: o.status,
      paymentStatus: o.status === "confirmed" ? "pending" : "completed",
      departure: { location: "Lisboa" },
      arrival: { location: "Cascais" },
      departureDate: `${o.date} 12:00`,
      passengers: 2,
      isRoundTrip: false,
      totalAmount: o.total ?? 100,
      customerName: `Cliente ${o.n}`,
      customerEmail: `${o.n.toLowerCase()}@example.com`,
      tipoServico: o.tipo,
      partnershipId: o.partner,
      partnershipName: o.partner ? "Hotel" : "Easy Transfer",
      createdAt: 0,
      updatedAt: 0,
    } as never),
  );
}

async function onBoard(orderId: Id<"orders">) {
  await t.mutation(internal.funis.entrarReserva, { orderId });
}

const board = async (chave: string, filters = {}) => (await as().query(api.funis.quadro, { chave, filters }))!;
const cards = (b: Awaited<ReturnType<typeof board>>) => b.colunas.flatMap((c) => c.cartoes);

describe("Reservas", () => {
  test("no upcoming/past nor payment method: every open booking shows, the late ones marked", async () => {
    const past = await order({ n: "R1", status: "paid", date: day(-3) });
    const future = await order({ n: "R2", status: "paid", date: day(4) });
    await onBoard(past);
    await onBoard(future);
    /* An old dashboard still sending "upcoming" and a method: ignored. */
    const b = await board("reservas", { when: "upcoming", method: "cash" });
    const c = cards(b);
    expect(c.map((x) => x.referencia).sort()).toEqual(["R1", "R2"]);
    expect(c.find((x) => x.referencia === "R1")!.atraso).toBe(3);
    expect(c.find((x) => x.referencia === "R2")!.atraso).toBe(0);
  });

  test("calendar: a day, and a range of the service date (both ends included)", async () => {
    for (const [n, off] of [["A", 0], ["B", 1], ["C", 7], ["D", 30], ["E", 31]] as const) await onBoard(await order({ n, status: "paid", date: day(off) }));
    const refs = async (f: object) => cards(await board("reservas", f)).map((x) => x.referencia).sort();
    expect(await refs({ day: day(1) })).toEqual(["B"]);
    expect(await refs({ from: day(0), to: day(7) })).toEqual(["A", "B", "C"]);
    expect(await refs({ from: day(0), to: day(30) })).toEqual(["A", "B", "C", "D"]);
  });

  test("type of service: converted, wedding partner, tour, transfer", async () => {
    const wedding = await t.run((db) => db.db.insert("partnerships", { name: "Quinta", slug: "quinta", theme: {}, landingTemplate: "wedding-whitelabel" }));
    await onBoard(await order({ n: "T1", status: "paid", date: day(2) }));
    await onBoard(await order({ n: "T2", status: "paid", date: day(2), tipo: "escolas" }));
    await onBoard(await order({ n: "T3", status: "paid", date: day(2), partner: wedding }));
    const c = cards(await board("reservas"));
    const tipo = (r: string) => c.find((x) => x.referencia === r)!.tipoServico;
    expect([tipo("T1"), tipo("T2"), tipo("T3")]).toEqual(["transfer", "escolas", "casamento"]);
    expect(cards(await board("reservas", { service: "casamento" })).map((x) => x.referencia)).toEqual(["T3"]);
  });
});

describe("Reservas → Finalizadas", () => {
  test("concluded and cancelled, newest service first, by state and dates, paged", async () => {
    await order({ n: "F1", status: "completed", date: day(-1), total: 80 });
    await order({ n: "F2", status: "cancelled", date: day(-5) });
    await order({ n: "F3", status: "completed", date: day(-40) });
    await order({ n: "F4", status: "paid", date: day(-2) });
    const q = (a: object) => as().query(api.reservas.finalizadas, { page: 0, pageSize: 25, ...a });
    const all = await q({});
    expect(all.linhas.map((l) => l.numero)).toEqual(["F1", "F2", "F3"]);
    expect(all.linhas[0]).toMatchObject({ estado: "completed", cliente: "Cliente F1", valor: 80, origem: "Lisboa", destino: "Cascais" });
    expect((await q({ from: day(-30), to: day(0) })).linhas.map((l) => l.numero)).toEqual(["F1", "F2"]);
    expect((await q({ estado: "cancelled" })).linhas.map((l) => l.numero)).toEqual(["F2"]);
    const p2 = await q({ pageSize: 2, page: 1 });
    expect([p2.total, p2.pageCount, p2.linhas.map((l) => l.numero)]).toEqual([3, 2, ["F3"]]);
    expect((await q({ search: "cliente f2" })).linhas.map((l) => l.numero)).toEqual(["F2"]);
  });

  test("a round trip is one line, with both legs' value", async () => {
    const ida = await order({ n: "RT", status: "completed", date: day(-2), total: 50 });
    const volta = await order({ n: "RTv", status: "completed", date: day(-1), total: 60 });
    await write(async (db) => {
      await db.patch(ida, { relatedOrderId: volta, isRoundTrip: true });
      await db.patch(volta, { relatedOrderId: ida, isRoundTrip: true });
    });
    const r = await as().query(api.reservas.finalizadas, { page: 0, pageSize: 25 });
    expect(r.linhas.map((l) => [l.numero, l.valor])).toEqual([["RT", 110]]);
  });
});

describe("Orçamentos: won → bookings", () => {
  async function quote() {
    return await as().mutation(api.funis.criarManual, {
      chave: "medida",
      titulo: "Casamento Ana",
      nome: "Ana",
      email: "ana@example.com",
      telefone: "+351910000000",
      canal: "telefone",
      segmento: "Casamento",
    });
  }
  const servico = (i: number, pago: boolean) => ({
    tipoServico: "casamento",
    data: `${day(10)} ${String(10 + i).padStart(2, "0")}:00`,
    recolha: "Hotel",
    destino: "Quinta",
    passageiros: 8,
    viatura: "Van",
    valor: 300 + i,
    pago,
    metodo: pago ? "transferencia" : undefined,
  });

  test("one booking per service, all in «Por atribuir», the quote won, nothing twice", async () => {
    const id = (await quote()) as Id<"negocios">;
    const r = await as().mutation(api.funis.converterEmReservas, { id, servicos: [servico(0, true), servico(1, false)] });
    expect(r.novas).toBe(2);
    const orders = await t.run((ctx) => Promise.all(r.criadas.map((x) => ctx.db.get(x))));
    expect(orders.map((o) => [o!.status, o!.paymentStatus, o!.tipoServico, o!.customerName])).toEqual([
      ["paid", "completed", "casamento", "Ana"],
      ["confirmed", "pending", "casamento", "Ana"],
    ]);
    const b = await board("reservas");
    const porAtribuir = b.colunas.find((c) => c.etapa.id === "porAtribuir")!.cartoes;
    expect(porAtribuir).toHaveLength(2);
    const card = (await t.run((ctx) => ctx.db.get(id)))!;
    expect(card.etapaId).toBe("confirmada");
    expect(card.reservasCriadas).toEqual(r.criadas);
    /* Again: nothing new. */
    const again = await as().mutation(api.funis.converterEmReservas, { id, servicos: [servico(0, true), servico(1, false)] });
    expect(again.novas).toBe(0);
    expect(cards(await board("reservas"))).toHaveLength(2);
  });

  test("bad input is refused, in Portuguese", async () => {
    const id = (await quote()) as Id<"negocios">;
    await expect(as().mutation(api.funis.converterEmReservas, { id, servicos: [] })).rejects.toThrow(/pelo menos um serviço/);
    await expect(as().mutation(api.funis.converterEmReservas, { id, servicos: [{ ...servico(0, true), metodo: undefined }] })).rejects.toThrow(/como foi pago/);
    await expect(as().mutation(api.funis.converterEmReservas, { id, servicos: [{ ...servico(0, false), data: "amanhã" }] })).rejects.toThrow(/data e a hora/);
  });

  test("quote filters: type of service, channel, stages", async () => {
    await quote();
    const f = async (filters: object) => cards(await board("medida", filters)).length;
    expect(await f({ service: "casamento" })).toBe(1);
    expect(await f({ service: "escolas" })).toBe(0);
    expect(await f({ stages: ["recolha"] })).toBe(1);
    expect(await f({ stages: ["negociacao"] })).toBe(0);
    expect(await f({ channel: "telefone" })).toBe(1);
    expect(await f({ channel: "site" })).toBe(0);
  });
});

describe("Candidaturas: the CRM", () => {
  async function apply(name = "João") {
    const id = await as().mutation(api.candidaturas.criarManual, { tipo: "motoristas", nome: name, email: `${name.toLowerCase()}@example.com`, zona: "lisbon", categoria: "Business" });
    return id;
  }

  test("an application lands in its own funnel, first stage, not in Parcerias", async () => {
    await apply();
    expect(cards(await board("candidaturas")).map((c) => c.titulo)).toHaveLength(1);
    expect(cards(await board("candidaturas"))[0]).toMatchObject({ registo: "manual", documentacao: "falta", categorias: ["business"] });
    expect(cards(await board("parcerias"))).toHaveLength(0);
  });

  test("filters: kind, registered by, zone, category, documents, owner", async () => {
    await apply();
    const n = async (f: object) => cards(await board("candidaturas", f)).length;
    expect(await n({ kind: "driver" })).toBe(1);
    expect(await n({ kind: "company" })).toBe(0);
    expect(await n({ registeredBy: "manual" })).toBe(1);
    expect(await n({ registeredBy: "site" })).toBe(0);
    expect(await n({ category: "business" })).toBe(1);
    expect(await n({ docs: "falta" })).toBe(1);
    const card = cards(await board("candidaturas"))[0]!;
    await as().mutation(api.funis.atribuirResponsavel, { id: card.id, email: "Ana@Example.com" });
    expect(await n({ owner: "ana@example.com" })).toBe(1);
  });

  test("«Ativo» only with the required documents validated", async () => {
    const appId = await apply();
    const card = cards(await board("candidaturas"))[0]!;
    await expect(as().mutation(api.funis.mover, { id: card.id, etapaId: "ativo" })).rejects.toThrow(/Falta validar/);
    await expect(as().mutation(api.candidaturas.mudarEstado, { tipo: "motoristas", id: appId, estado: "approved" })).rejects.toThrow(/Falta validar/);
    /* The files: a manual application has none; give it some, then validate. */
    const file = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    await t.run((ctx) => ctx.db.patch(appId as Id<"driverApplications">, { professionalLicenseId: file, vehicleInsuranceId: file, proofOfAddressId: file }));
    for (const chave of ["professionalLicenseId", "vehicleInsuranceId", "proofOfAddressId"]) {
      await as().mutation(api.candidaturas.validarDocumento, { tipo: "motoristas", id: appId, chave, estado: "validado" });
    }
    expect(cards(await board("candidaturas"))[0]!.documentacao).toBe("completa");
    await as().mutation(api.funis.mover, { id: card.id, etapaId: "ativo" });
    const app = await t.run((ctx) => ctx.db.get(appId as Id<"driverApplications">));
    expect(app!.status).toBe("approved");
  });

  test("the score: weighted average, recommendation by the marks", async () => {
    const appId = await apply();
    for (const [chave, nota] of [["viaturas", 80], ["experiencia", 90], ["condicoes", 75], ["disponibilidade", 85], ["comunicacao", 90]] as const) {
      await as().mutation(api.candidaturas.pontuar, { tipo: "motoristas", id: appId, chave, nota });
    }
    const av = (await as().query(api.candidaturas.avaliacao, { tipo: "motoristas", id: appId }))!;
    /* The spec's worked example: 83.5. */
    expect(av.pontuacao).toBe(83.5);
    expect(av.recomendacao).toBe("aprovar");
    expect(recomendacao(AVALIACAO_DEFAULTS, 70)).toBe("rever");
    expect(recomendacao(AVALIACAO_DEFAULTS, 59.9)).toBe("abaixo");
    expect(pontuacao(AVALIACAO_DEFAULTS, [])).toBeNull();
  });

  test("weights and marks are configurable", async () => {
    const cur = await as().query(api.definicoes.avaliacao, {});
    await as().mutation(api.definicoes.guardarAvaliacao, {
      versao: cur.versao,
      avaliacao: { criterios: [{ chave: "viaturas", titulo: "Viaturas", peso: 1 }], limiteAprovar: 90, limiteRever: 50 },
    });
    const appId = await apply();
    await as().mutation(api.candidaturas.pontuar, { tipo: "motoristas", id: appId, chave: "viaturas", nota: 85 });
    const av = (await as().query(api.candidaturas.avaliacao, { tipo: "motoristas", id: appId }))!;
    expect([av.pontuacao, av.recomendacao]).toEqual([85, "rever"]);
  });

  test("moving the old application cards out of Parcerias, by stage", async () => {
    const parcerias = (await t.run((ctx) => ctx.db.query("funis").withIndex("by_chave", (q) => q.eq("chave", "parcerias")).first()))!;
    const mk = (etapaId: string, origem: "driverApplications" | "partnerLeads") =>
      t.run((ctx) =>
        ctx.db.insert("negocios", { funilId: parcerias._id, etapaId, ordem: 0, origem, titulo: etapaId, pessoa: { nome: "x" }, criadoEm: 0, atualizadoEm: 0, movidoEm: 0 }),
      );
    const a = await mk("lead", "driverApplications");
    const b = await mk("r2", "driverApplications");
    const c = await mk("onboarding", "driverApplications");
    const lead = await mk("r1", "partnerLeads");
    expect((await t.mutation(internal.funis.moverCandidaturas, {})).movidos).toBe(3);
    const get = (id: Id<"negocios">) => t.run((ctx) => ctx.db.get(id));
    expect([(await get(a))!.etapaId, (await get(b))!.etapaId, (await get(c))!.etapaId]).toEqual(["recebida", "prequalificacao", "ativo"]);
    expect((await get(lead))!.funilId).toBe(parcerias._id);
    expect((await t.mutation(internal.funis.moverCandidaturas, {})).movidos).toBe(0);
  });
});
