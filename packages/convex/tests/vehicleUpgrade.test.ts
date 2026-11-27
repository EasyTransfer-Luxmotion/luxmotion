import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { makeTest } from "./convex";

/*
 * The upgrade pair is one field (the premium points at the standard), but
 * the editor offers both sides: choosing the upgrade of a car writes the
 * link on that other car, and taking a place unlinks whoever held it.
 */

const ADMIN = "recovery@example.com";
const admin = { subject: ADMIN, issuer: "test", tokenIdentifier: `test|${ADMIN}`, email: ADMIN, emailVerified: true, name: "Admin" };

let t: ReturnType<typeof makeTest>;
beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", ADMIN);
  t = makeTest();
});
afterEach(() => vi.unstubAllEnvs());

const base = {
  passengers: 3,
  luggage: 3,
  maxBackpacks: 2,
  maxHandLuggage: 2,
  maxCheckedBaggage: 3,
  maxChildSeats: 0,
  maxBabySeats: 0,
  maxBoosterSeats: 0,
  minimumPrice: 50,
  hasWifi: true,
  isElectric: false,
  status: "active" as const,
};

async function carro(name: string, pricePerKm: number) {
  return await t.run((ctx) => ctx.db.insert("vehicles", { ...base, name, pricePerKm, pricePerKmNight: pricePerKm, order: pricePerKm, actualizadoEm: 1 }));
}

async function guardar(id: Id<"vehicles">, args: { downgrade?: Id<"vehicles"> | null; upgrade?: Id<"vehicles"> | null }) {
  const doc = (await t.run((ctx) => ctx.db.get(id)))!;
  const { _id, _creationTime, order, pricePerKmNight, actualizadoEm, ...dados } = doc;
  return await t.withIdentity(admin).mutation(api.veiculos.guardar, {
    id,
    versao: actualizadoEm ?? _creationTime,
    dados: { ...dados, upgradeFromVehicleId: args.downgrade === undefined ? dados.upgradeFromVehicleId : (args.downgrade ?? undefined) },
    ...(args.upgrade === undefined ? {} : { upgradeVehicleId: args.upgrade }),
  });
}

const ligacao = async (id: Id<"vehicles">) => (await t.run((ctx) => ctx.db.get(id)))!.upgradeFromVehicleId ?? null;

describe("vehicle upgrades go both ways", () => {
  test("choosing the upgrade of a car links that car back to it", async () => {
    const business = await carro("Business", 2);
    const first = await carro("First", 3);
    await guardar(business, { upgrade: first });
    expect(await ligacao(first)).toBe(business);
    expect(await ligacao(business)).toBeNull();
  });

  test("a car in the middle of a chain keeps both sides", async () => {
    const economy = await carro("Economy", 1);
    const business = await carro("Business", 2);
    const first = await carro("First", 3);
    await guardar(business, { downgrade: economy, upgrade: first });
    expect(await ligacao(business)).toBe(economy);
    expect(await ligacao(first)).toBe(business);
  });

  test("taking a place unlinks whoever held it", async () => {
    const business = await carro("Business", 2);
    const first = await carro("First", 3);
    const van = await carro("Van", 3.5);
    await guardar(business, { upgrade: first });
    // Van becomes the upgrade of Business, from Van's side.
    await guardar(van, { downgrade: business });
    expect(await ligacao(van)).toBe(business);
    expect(await ligacao(first)).toBeNull();
    // And clearing it from Business's side.
    await guardar(business, { upgrade: null });
    expect(await ligacao(van)).toBeNull();
  });

  test("the price must go the right way, and a car cannot be both sides", async () => {
    const economy = await carro("Economy", 1);
    const business = await carro("Business", 2);
    await expect(guardar(business, { upgrade: economy })).rejects.toThrow();
    await expect(guardar(economy, { downgrade: business })).rejects.toThrow();
    await expect(guardar(business, { downgrade: economy, upgrade: economy })).rejects.toThrow();
    expect(await ligacao(economy)).toBeNull();
    expect(await ligacao(business)).toBeNull();
  });
});
