import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { exigirAdmin, lerAcesso, verificar } from "./lib/admin";
import { eModulo, MODULOS_PERMISSAO, tituloDoModulo, type ModuloPermissao, type Nivel } from "./lib/permissoes";

/*
 * Equipa interna: os cargos (o que cada posição pode ver e alterar no
 * back-office) e as pessoas que os ocupam. Não confundir com perfis.ts, que
 * são os perfis públicos da página Sobre nós.
 *
 * Os donos (ADMIN_EMAILS) aparecem na lista mas não se editam aqui: vivem
 * numa variável do deployment para que nenhum erro neste ecrã tire o acesso a
 * toda a gente.
 */

const vPermissoes = v.array(v.object({ modulo: v.string(), nivel: v.union(v.literal("ver"), v.literal("editar")) }));

function donos(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function registar(ctx: MutationCtx, ator: string, accao: string, alvo: string, detalhe?: string) {
  await ctx.db.insert("registoEquipa", { ator, accao, alvo, detalhe, em: Date.now() });
}

/* "Reservas: ver → editar; Blog: sem acesso → ver". O registo tem de dizer o
   que mudou, não só que o cargo foi gravado. */
function diferencas(antes: Map<string, Nivel>, depois: Map<string, Nivel>): string {
  const nome = (n?: Nivel) => (n === "editar" ? "editar" : n === "ver" ? "ver" : "sem acesso");
  const mudou: string[] = [];
  for (const m of MODULOS_PERMISSAO) {
    if (antes.get(m) !== depois.get(m)) mudou.push(`${tituloDoModulo(m)}: ${nome(antes.get(m))} → ${nome(depois.get(m))}`);
  }
  return mudou.join("; ");
}

function mapa(ps: { modulo: string; nivel: Nivel }[]): Map<string, Nivel> {
  return new Map(ps.map((p) => [p.modulo, p.nivel]));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const lista = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "equipa", "ver");
    const [cargos, colaboradores] = await Promise.all([
      ctx.db.query("cargos").collect(),
      ctx.db.query("colaboradores").collect(),
    ]);
    const nomeCargo = new Map(cargos.map((c) => [c._id as string, c.nome]));
    const listaDonos = donos();
    return {
      cargos: cargos
        .map((c) => ({
          id: c._id,
          nome: c.nome,
          descricao: c.descricao ?? null,
          permissoes: c.permissoes.filter((p) => eModulo(p.modulo)),
          pessoas: colaboradores.filter((p) => p.cargoId === c._id).length,
          actualizadoEm: c.actualizadoEm,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
      colaboradores: colaboradores
        .map((p) => ({
          id: p._id,
          email: p.email,
          nome: p.nome,
          cargoId: p.cargoId,
          cargo: nomeCargo.get(p.cargoId) ?? null,
          estado: p.estado,
          /* Também nos donos: o cargo não conta enquanto o email lá estiver. */
          dono: listaDonos.includes(p.email),
          criadoEm: p.criadoEm,
          ultimaEntradaEm: p.ultimaEntradaEm ?? null,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
      donos: listaDonos,
    };
  },
});

export const registo = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "equipa", "ver");
    const linhas = await ctx.db.query("registoEquipa").withIndex("by_em").order("desc").take(100);
    return linhas.map((l) => ({ id: l._id, ator: l.ator, accao: l.accao, alvo: l.alvo, detalhe: l.detalhe ?? null, em: l.em }));
  },
});

/* Quem gere a equipa sem ser dono não pode tirar a si próprio o acesso a
   este ecrã: ficava sem forma de o desfazer e tinha de ir pedir a um dono. */
async function protegerAutor(
  ctx: MutationCtx,
  email: string,
  dono: boolean,
  cargoQueFica: (cargoId: Id<"cargos">) => Promise<Map<string, Nivel> | null>,
) {
  if (dono) return;
  const eu = await ctx.db
    .query("colaboradores")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (!eu) return;
  const perms = await cargoQueFica(eu.cargoId);
  if (perms && perms.get("equipa") !== "editar") {
    throw new ConvexError(
      "Isto tirava-te o acesso à Equipa interna. Pede a outra pessoa com esse acesso, ou a um dono, que o faça.",
    );
  }
}

export const guardarCargo = mutation({
  args: {
    id: v.optional(v.id("cargos")),
    nome: v.string(),
    descricao: v.optional(v.string()),
    permissoes: vPermissoes,
  },
  handler: async (ctx, a) => {
    const acesso = await lerAcesso(ctx);
    verificar(acesso, "equipa", "editar");
    const nome = a.nome.trim().replace(/\s+/g, " ");
    if (!nome) throw new ConvexError("O cargo precisa de um nome.");
    if (nome.length > 60) throw new ConvexError("O nome do cargo tem de ter até 60 caracteres.");
    const descricao = a.descricao?.trim() || undefined;

    const vistos = new Set<string>();
    const permissoes: { modulo: ModuloPermissao; nivel: Nivel }[] = [];
    for (const p of a.permissoes) {
      if (!eModulo(p.modulo)) throw new ConvexError(`Módulo desconhecido: ${p.modulo}.`);
      if (vistos.has(p.modulo)) continue;
      vistos.add(p.modulo);
      permissoes.push({ modulo: p.modulo, nivel: p.nivel });
    }

    const todos = await ctx.db.query("cargos").collect();
    const igual = todos.find((c) => c._id !== a.id && c.nome.toLocaleLowerCase("pt") === nome.toLocaleLowerCase("pt"));
    if (igual) throw new ConvexError(`Já existe um cargo chamado "${igual.nome}".`);

    const agora = Date.now();
    if (!a.id) {
      const id = await ctx.db.insert("cargos", { nome, descricao, permissoes, criadoEm: agora, actualizadoEm: agora });
      await registar(ctx, acesso.email!, "Criou o cargo", nome, diferencas(new Map(), mapa(permissoes)) || "Sem acessos");
      return id;
    }

    const antes = await ctx.db.get(a.id);
    if (!antes) throw new ConvexError("Este cargo já não existe. Recarrega a página.");
    await protegerAutor(ctx, acesso.email!, acesso.dono, async (cargoId) =>
      cargoId === a.id ? mapa(permissoes) : null,
    );
    await ctx.db.patch(a.id, { nome, descricao, permissoes, actualizadoEm: agora });
    const partes = [
      antes.nome !== nome ? `Nome: ${antes.nome} → ${nome}` : "",
      diferencas(mapa(antes.permissoes as { modulo: string; nivel: Nivel }[]), mapa(permissoes)),
    ].filter(Boolean);
    if (partes.length) await registar(ctx, acesso.email!, "Alterou o cargo", nome, partes.join("; "));
    return a.id;
  },
});

export const removerCargo = mutation({
  args: { id: v.id("cargos") },
  handler: async (ctx, { id }) => {
    const acesso = await lerAcesso(ctx);
    verificar(acesso, "equipa", "editar");
    const cargo = await ctx.db.get(id);
    if (!cargo) return null;
    const ocupado = await ctx.db
      .query("colaboradores")
      .withIndex("by_cargo", (q) => q.eq("cargoId", id))
      .first();
    /* Também com as pessoas suspensas: ao reactivá-las, o cargo tem de lá estar. */
    if (ocupado) {
      throw new ConvexError(`Há pessoas com o cargo "${cargo.nome}". Muda-lhes o cargo antes de o apagar.`);
    }
    await ctx.db.delete(id);
    await registar(ctx, acesso.email!, "Apagou o cargo", cargo.nome);
    return null;
  },
});

export const guardarColaborador = mutation({
  args: {
    id: v.optional(v.id("colaboradores")),
    email: v.string(),
    nome: v.string(),
    cargoId: v.id("cargos"),
  },
  handler: async (ctx, a) => {
    const acesso = await lerAcesso(ctx);
    verificar(acesso, "equipa", "editar");
    const email = a.email.trim().toLowerCase();
    const nome = a.nome.trim().replace(/\s+/g, " ");
    if (!nome) throw new ConvexError("Falta o nome da pessoa.");
    if (!EMAIL.test(email)) throw new ConvexError("O email não parece válido.");
    const cargo = await ctx.db.get(a.cargoId);
    if (!cargo) throw new ConvexError("Esse cargo já não existe. Recarrega a página.");

    const mesmo = await ctx.db
      .query("colaboradores")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (mesmo && mesmo._id !== a.id) throw new ConvexError(`${email} já está na equipa, como ${mesmo.nome}.`);

    const agora = Date.now();
    if (!a.id) {
      const id = await ctx.db.insert("colaboradores", {
        email,
        nome,
        cargoId: a.cargoId,
        estado: "activo",
        criadoEm: agora,
        actualizadoEm: agora,
      });
      await registar(ctx, acesso.email!, "Acrescentou", `${nome} (${email})`, `Cargo: ${cargo.nome}`);
      return id;
    }

    const antes = await ctx.db.get(a.id);
    if (!antes) throw new ConvexError("Esta pessoa já não está na lista. Recarrega a página.");
    if (antes.email === acesso.email && antes.cargoId !== a.cargoId) {
      await protegerAutor(ctx, acesso.email!, acesso.dono, async () =>
        mapa(cargo.permissoes as { modulo: string; nivel: Nivel }[]),
      );
    }
    await ctx.db.patch(a.id, { email, nome, cargoId: a.cargoId, actualizadoEm: agora });
    const cargoAntes = antes.cargoId !== a.cargoId ? (await ctx.db.get(antes.cargoId))?.nome ?? "?" : null;
    const partes = [
      antes.nome !== nome ? `Nome: ${antes.nome} → ${nome}` : "",
      antes.email !== email ? `Email: ${antes.email} → ${email}` : "",
      cargoAntes ? `Cargo: ${cargoAntes} → ${cargo.nome}` : "",
    ].filter(Boolean);
    if (partes.length) await registar(ctx, acesso.email!, "Alterou", `${nome} (${email})`, partes.join("; "));
    return a.id;
  },
});

/* Não se apaga ninguém: suspender corta o acesso já e guarda o histórico. */
export const mudarEstadoColaborador = mutation({
  args: { id: v.id("colaboradores"), estado: v.union(v.literal("activo"), v.literal("suspenso")) },
  handler: async (ctx, { id, estado }) => {
    const acesso = await lerAcesso(ctx);
    verificar(acesso, "equipa", "editar");
    const p = await ctx.db.get(id);
    if (!p) throw new ConvexError("Esta pessoa já não está na lista. Recarrega a página.");
    if (p.estado === estado) return null;
    if (estado === "suspenso" && p.email === acesso.email) {
      throw new ConvexError("Não podes suspender a tua própria conta.");
    }
    await ctx.db.patch(id, { estado, actualizadoEm: Date.now() });
    await registar(ctx, acesso.email!, estado === "suspenso" ? "Suspendeu" : "Reactivou", `${p.nome} (${p.email})`);
    return null;
  },
});
