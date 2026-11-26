import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { triggers } from "../convex/lib/triggers";
import { makeTest } from "./convex";

/*
 * A driver's or a fleet's application reaches Contactos whole
 * (lib/candidaturasContactos.ts): through the real form mutation, the
 * contact and the organisation take what the form says, keep the rest in
 * `motorista`, and a change of status alone does not undo what the team
 * corrected by hand.
 */

const ADMIN = "recovery@example.com";
const admin = { subject: ADMIN, issuer: "test", tokenIdentifier: `test|${ADMIN}`, email: ADMIN, emailVerified: true, name: "Admin" };

let t: ReturnType<typeof makeTest>;
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  vi.useFakeTimers();
  t = makeTest();
});
/* The form schedules its notice email: let it run inside the test. */
afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const motorista = {
  operatingZone: "Lisboa",
  fullName: "Rui  Costa",
  email: "Rui@Example.test",
  representativeEmail: "rui@example.test",
  phone: "912 345 678",
  whatsapp: "912345678",
  languages: [
    { code: "pt", level: "fluent" as const },
    { code: "en", level: "intermediate" as const },
  ],
  referral: "Um colega",
  vehicleCategory: "business",
  vehicleBrand: "Mercedes",
  vehicleModel: "Classe E",
  vehiclePlate: "AA-00-BB",
  vehicleColor: "Preto",
  vehicleYear: "2022",
  vehicleOwnership: "própria",
  vehiclePassengerCapacity: "3",
  vehicleLuggageCapacity: "3",
  vehicleTvdeLicensed: "sim",
  vehicleInteriorPhotoIds: [],
  vehicleExteriorPhotoIds: [],
  childSeatBaby: 1,
  childSeatChild: 0,
  childSeatBooster: 2,
  surfboardRack: true,
  amenities: ["wifi", "água"],
  billingAccountHolder: "Rui Costa",
  billingInvoiceName: "Rui Costa Transportes",
  billingSwiftBic: "BCOMPTPL",
  billingIban: "PT50000000000000000000000",
  billingNif: "123456789",
  billingTaxOffice: "Lisboa 1",
  billingAddress: "Rua A, 1, Lisboa",
  availabilityDays: ["seg", "ter"],
  availabilityShifts: ["manhã"],
  termsAccepted: true,
};

const frota = {
  operatingZones: ["Porto", "Braga"],
  driverCount: "5-10",
  driversComfortableWithMobile: "yes" as const,
  companyName: "Norte Transfers, Lda.",
  representativeFullName: "Ana Lima",
  representativeEmail: "ana@norte.example.test",
  representativePhone: "+351 931 111 222",
  representativeWhatsapp: "931111222",
  drivers: [
    { fullName: "Bruno Sá", email: "bruno@norte.example.test", phone: "932000111", hasVideo: false },
    { fullName: "Carla Dias", email: "carla@norte.example.test", phone: "932000222", hasVideo: true },
  ],
  vehicles: [{ make: "Mercedes", model: "Vito", licensePlate: "BB-11-CC", category: "van" }],
  billingAccountHolder: "Norte Transfers",
  billingInvoiceName: "Norte Transfers, Lda.",
  billingSwiftBic: "CGDIPTPL",
  billingIban: "PT50111111111111111111111",
  billingTaxId: "512345678",
  billingTaxOffice: "Porto 2",
  billingAddress: "Av. B, 2, Porto",
  priceAgreementAcknowledged: true,
  termsAccepted: true,
};

describe("applications reach Contactos whole", () => {
  test("a driver: the contact takes the form, the rest goes to the profile", async () => {
    await t.mutation(api.driverApplications.submit, motorista);
    const [c] = await t.run((ctx) => ctx.db.query("contactos").collect());
    expect(c).toMatchObject({
      nome: "Rui Costa",
      email: "rui@example.test",
      telefone: "+351912345678",
      whatsapp: "+351912345678",
      localidade: "Lisboa",
      nif: "123456789",
      morada: "Rua A, 1, Lisboa",
      funcao: "Motorista",
      relacoes: ["motoristas"],
    });
    expect(c!.motorista).toMatchObject({
      tipo: "motorista",
      zonas: ["Lisboa"],
      linguas: [
        { codigo: "pt", nivel: "fluent" },
        { codigo: "en", nivel: "intermediate" },
      ],
      viaturas: [{ marca: "Mercedes", modelo: "Classe E", matricula: "AA-00-BB", cor: "Preto", ano: "2022", lugares: "3" }],
      disponibilidade: { dias: ["seg", "ter"], turnos: ["manhã"] },
      cadeirinhas: { bebe: 1, crianca: 0, elevatoria: 2 },
      pranchas: true,
      comodidades: ["wifi", "água"],
      faturacao: { iban: "PT50000000000000000000000", nif: "123456789", swift: "BCOMPTPL" },
    });
  });

  test("a change of status keeps the team's corrections; new data from the form does not", async () => {
    await t.mutation(api.driverApplications.submit, motorista);
    const app = (await t.run((ctx) => ctx.db.query("driverApplications").collect()))[0]!;
    const contacto = (await t.run((ctx) => ctx.db.query("contactos").collect()))[0]!;
    const w = <T>(fn: (db: Parameters<Parameters<typeof t.run>[0]>[0]["db"]) => Promise<T>) => t.run(async (ctx) => fn(triggers.wrapDB(ctx).db));

    await w((db) => db.patch(contacto._id, { localidade: "Lisboa e Sintra" }));
    await w((db) => db.patch(app._id, { status: "approved" } as never));
    let c = await t.run((ctx) => ctx.db.get(contacto._id));
    expect(c!.localidade).toBe("Lisboa e Sintra");
    expect(c!.motorista?.candidatura.estado).toBe("approved");

    await w((db) => db.patch(app._id, { operatingZone: "Faro", vehiclePlate: "ZZ-99-YY" }));
    c = await t.run((ctx) => ctx.db.get(contacto._id));
    expect(c!.localidade).toBe("Faro");
    expect(c!.motorista?.viaturas[0]?.matricula).toBe("ZZ-99-YY");
  });

  test("a fleet: the organisation, its representative and every driver it lists", async () => {
    await t.mutation(api.partnerApplications.submit, frota);
    const orgs = await t.run((ctx) => ctx.db.query("organizacoes").collect());
    expect(orgs).toHaveLength(1);
    const o = orgs[0]!;
    expect(o).toMatchObject({
      nome: "Norte Transfers, Lda.",
      nif: "512345678",
      morada: "Av. B, 2, Porto",
      localidade: "Porto, Braga",
      email: "ana@norte.example.test",
      telefone: "+351931111222",
      whatsapp: "+351931111222",
      nPessoas: 3,
    });
    expect(o.motorista).toMatchObject({ tipo: "frota", zonas: ["Porto", "Braga"], motoristasDeclarados: "5-10", aVontadeComTelemovel: true, viaturas: [{ matricula: "BB-11-CC" }] });
    const pessoas = await t.run((ctx) => ctx.db.query("contactos").collect());
    expect(pessoas.map((p) => [p.nome, p.funcao, p.organizacaoId === o._id]).sort()).toEqual([
      ["Ana Lima", "Representante", true],
      ["Bruno Sá", "Motorista", true],
      ["Carla Dias", "Motorista", true],
    ]);
  });

  test("bank details only for whoever can open Candidaturas", async () => {
    await t.mutation(api.driverApplications.submit, motorista);
    const id = (await t.run((ctx) => ctx.db.query("contactos").collect()))[0]!._id;
    const dono = await t.withIdentity(admin).query(api.contactos.ficha, { tipo: "contactos", id });
    expect(dono && "contacto" in dono && dono.contacto.motorista?.faturacao?.iban).toBe("PT50000000000000000000000");

    const cargo = await t.run((ctx) =>
      ctx.db.insert("cargos", { nome: "Contactos", permissoes: [{ modulo: "contactos", nivel: "ver" }], criadoEm: 0, actualizadoEm: 0 }),
    );
    await t.run((ctx) => ctx.db.insert("colaboradores", { email: "ana@example.test", nome: "Ana", cargoId: cargo, estado: "activo", criadoEm: 0, actualizadoEm: 0, ultimaEntradaEm: Date.now() }));
    const ana = { ...admin, subject: "ana", tokenIdentifier: "test|ana", email: "ana@example.test" };
    const semAcesso = await t.withIdentity(ana).query(api.contactos.ficha, { tipo: "contactos", id });
    expect(semAcesso && "contacto" in semAcesso && semAcesso.contacto.motorista).toBeTruthy();
    expect(semAcesso && "contacto" in semAcesso && (semAcesso.contacto.motorista as Record<string, unknown>).faturacao).toBeUndefined();
  });
});
