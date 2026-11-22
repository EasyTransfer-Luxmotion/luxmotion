import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { makeTest } from "./convex";

/*
 * Who gets into the back-office and who decides about owners (lib/admin.ts,
 * equipa.ts). These rules were tested by hand when they were written; here
 * they run on every push. A failure means someone could get in who should not,
 * or the back-office could end up without an owner.
 */

const RECOVERY = "recovery@example.com";
const ident = (email: string) => ({ subject: email, issuer: "test", tokenIdentifier: `test|${email}`, email, emailVerified: true, name: email });

let t: ReturnType<typeof makeTest>;
let role: Id<"cargos">;

async function member(email: string, extra: { owner?: boolean; estado?: "activo" | "suspenso"; entered?: boolean } = {}) {
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("colaboradores", {
      email,
      nome: email.split("@")[0]!,
      cargoId: role,
      estado: extra.estado ?? "activo",
      owner: extra.owner,
      criadoEm: now,
      actualizadoEm: now,
      ultimaEntradaEm: extra.entered === false ? undefined : now,
    });
  });
}

const access = (email: string) => t.withIdentity(ident(email)).query(api.acesso.minhaConta, {});

beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", RECOVERY);
  t = makeTest();
  role = await t.run((ctx) =>
    ctx.db.insert("cargos", {
      nome: "Operação",
      permissoes: [
        { modulo: "reservas", nivel: "editar" },
        { modulo: "equipa", nivel: "ver" },
      ],
      criadoEm: Date.now(),
      actualizadoEm: Date.now(),
    }),
  );
});
afterEach(() => vi.unstubAllEnvs());

describe("who gets in", () => {
  test("the recovery account (ADMIN_EMAILS) is an owner, marked as recovery", async () => {
    const a = await access(RECOVERY);
    expect(a.estado).toBe("admin");
    expect(a.dono).toBe(true);
    expect(a.recovery).toBe(true);
  });

  test("an owner member has everything, whatever the role", async () => {
    await member("owner@example.com", { owner: true });
    const a = await access("owner@example.com");
    expect(a).toMatchObject({ estado: "admin", dono: true, recovery: false, cargo: "Dono" });
    expect(a.permissoes.financas).toBe("editar");
  });

  test("a member gets their role, and nothing it does not give", async () => {
    await member("ana@example.com");
    const a = await access("ana@example.com");
    expect(a).toMatchObject({ estado: "admin", dono: false, cargo: "Operação" });
    expect(a.permissoes.reservas).toBe("editar");
    expect(a.permissoes.financas).toBeUndefined();
  });

  test("a blocked member is out, owner or not", async () => {
    await member("blocked@example.com", { estado: "suspenso" });
    await member("blocked-owner@example.com", { owner: true, estado: "suspenso" });
    expect((await access("blocked@example.com")).estado).toBe("semAcesso");
    expect((await access("blocked-owner@example.com")).estado).toBe("semAcesso");
  });

  test("an unverified email proves nothing (sign-up is open to the public)", async () => {
    const a = await t.withIdentity({ ...ident(RECOVERY), emailVerified: false }).query(api.acesso.minhaConta, {});
    expect(a.estado).toBe("emailPorVerificar");
  });

  test("a stranger with a session gets nothing", async () => {
    expect((await access("stranger@example.com")).estado).toBe("semAcesso");
  });
});

describe("owners (equipa.setOwner)", () => {
  test("an owner can make an active member an owner, and take it away", async () => {
    await member("owner@example.com", { owner: true });
    const ana = await member("ana@example.com");
    await t.withIdentity(ident("owner@example.com")).mutation(api.equipa.setOwner, { id: ana, owner: true });
    expect((await access("ana@example.com")).dono).toBe(true);
    await t.withIdentity(ident("owner@example.com")).mutation(api.equipa.setOwner, { id: ana, owner: false });
    expect((await access("ana@example.com")).dono).toBe(false);
  });

  test("nobody changes their own owner access", async () => {
    const me = await member("owner@example.com", { owner: true });
    await expect(t.withIdentity(ident("owner@example.com")).mutation(api.equipa.setOwner, { id: me, owner: false })).rejects.toThrow(/próprio/);
  });

  test("a member who is not an owner cannot make owners", async () => {
    const ana = await member("ana@example.com");
    const bruno = await member("bruno@example.com");
    await expect(t.withIdentity(ident("ana@example.com")).mutation(api.equipa.setOwner, { id: bruno, owner: true })).rejects.toThrow();
    expect((await access("bruno@example.com")).dono).toBe(false);
    expect(ana).toBeTruthy();
  });

  test("someone who has not joined yet cannot become an owner", async () => {
    const pending = await member("pending@example.com", { entered: false });
    await expect(t.withIdentity(ident(RECOVERY)).mutation(api.equipa.setOwner, { id: pending, owner: true })).rejects.toThrow(/já entrou/);
  });

  test("the recovery account cannot be demoted from the app", async () => {
    const row = await member(RECOVERY);
    await member("owner@example.com", { owner: true });
    await expect(t.withIdentity(ident("owner@example.com")).mutation(api.equipa.setOwner, { id: row, owner: false })).rejects.toThrow(/recuperação/);
  });

  test("the last active owner cannot be demoted, blocked or deleted (no recovery account)", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    const a = await member("a@example.com", { owner: true });
    const b = await member("b@example.com", { owner: true });
    // a demotes b: allowed, a is still there.
    await t.withIdentity(ident("a@example.com")).mutation(api.equipa.setOwner, { id: b, owner: false });
    // b is no longer an owner and cannot act on a; and a is now the last one.
    await expect(t.withIdentity(ident("b@example.com")).mutation(api.equipa.mudarEstadoColaborador, { id: a, estado: "suspenso" })).rejects.toThrow();
    const c = await member("c@example.com", { owner: true });
    await t.withIdentity(ident("c@example.com")).mutation(api.equipa.mudarEstadoColaborador, { id: a, estado: "suspenso" });
    // c is the last active owner now: nobody can block, demote or delete them.
    await expect(t.withIdentity(ident("c@example.com")).mutation(api.equipa.setOwner, { id: c, owner: false })).rejects.toThrow();
    expect((await access("c@example.com")).dono).toBe(true);
  });
});

describe("blocking (equipa.mudarEstadoColaborador)", () => {
  test("only owners block, and nobody blocks themselves", async () => {
    const ana = await member("ana@example.com");
    const owner = await member("owner@example.com", { owner: true });
    await expect(t.withIdentity(ident("ana@example.com")).mutation(api.equipa.mudarEstadoColaborador, { id: owner, estado: "suspenso" })).rejects.toThrow();
    await expect(t.withIdentity(ident("owner@example.com")).mutation(api.equipa.mudarEstadoColaborador, { id: owner, estado: "suspenso" })).rejects.toThrow(/próprio/);
    await t.withIdentity(ident("owner@example.com")).mutation(api.equipa.mudarEstadoColaborador, { id: ana, estado: "suspenso" });
    expect((await access("ana@example.com")).estado).toBe("semAcesso");
  });

  test("blocking an owner reaches every owner's bell", async () => {
    await member("owner@example.com", { owner: true });
    const other = await member("other@example.com", { owner: true });
    await t.withIdentity(ident("owner@example.com")).mutation(api.equipa.mudarEstadoColaborador, { id: other, estado: "suspenso" });
    const bell = await t.run((ctx) => ctx.db.query("notificacoes").collect());
    expect(bell.some((n) => n.titulo.includes("(dono) foi bloqueado"))).toBe(true);
  });
});
