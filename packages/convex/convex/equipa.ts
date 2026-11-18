import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin, lerAcesso, verificar } from "./lib/admin";
import { eModulo, MODULOS_PERMISSAO, tituloDoModulo, type ModuloPermissao, type Nivel } from "./lib/permissoes";

/*
 * Equipa: os membros (quem entra no back-office) e os cargos (o que cada
 * posição pode ver e alterar). Não confundir com perfis.ts, que são os perfis
 * públicos da página Sobre nós.
 *
 * Os donos (ADMIN_EMAILS) aparecem na lista mas não se editam aqui: vivem
 * numa variável do deployment para que nenhum erro neste ecrã tire o acesso a
 * toda a gente.
 *
 * Os erros vêm como { tipo, mensagem, erros } (o formato que os editores do
 * dashboard lêem com lerErro): "invalido" marca os campos, "conflito" quando
 * outra pessoa gravou o mesmo registo depois de o abrirmos.
 */

const vPermissoes = v.array(v.object({ modulo: v.string(), nivel: v.union(v.literal("ver"), v.literal("editar")) }));

function donos(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

type Registo = {
  ator: string;
  accao: string;
  alvo: string;
  detalhe?: string;
  cargoId?: Id<"cargos">;
  colaboradorId?: Id<"colaboradores">;
};

async function registar(ctx: MutationCtx, r: Registo) {
  await ctx.db.insert("registoEquipa", { ...r, em: Date.now() });
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

function invalido(erros: Record<string, string>): never {
  throw new ConvexError({ tipo: "invalido", mensagem: "Há campos por corrigir.", erros });
}

function conflito(oQue: string): never {
  throw new ConvexError({
    tipo: "conflito",
    mensagem: `Alguém gravou ${oQue} depois de o abrir. Veja a versão actual antes de gravar por cima.`,
  });
}

function linhaRegisto(l: Doc<"registoEquipa">) {
  return {
    id: l._id,
    ator: l.ator,
    accao: l.accao,
    alvo: l.alvo,
    detalhe: l.detalhe ?? null,
    cargoId: l.cargoId ?? null,
    colaboradorId: l.colaboradorId ?? null,
    em: l.em,
  };
}

function permissoesValidas(c: Doc<"cargos">) {
  return c.permissoes.filter((p): p is { modulo: ModuloPermissao; nivel: Nivel } => eModulo(p.modulo));
}

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
        .map((c) => {
          const membros = colaboradores
            .filter((p) => p.cargoId === c._id)
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
            .map((p) => ({ id: p._id, nome: p.nome, estado: p.estado }));
          return {
            id: c._id,
            nome: c.nome,
            descricao: c.descricao ?? null,
            permissoes: permissoesValidas(c),
            pessoas: membros.length,
            membros,
            actualizadoEm: c.actualizadoEm,
          };
        })
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
          actualizadoEm: p.actualizadoEm,
          ultimaEntradaEm: p.ultimaEntradaEm ?? null,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
      donos: listaDonos,
    };
  },
});

async function historico(ctx: QueryCtx, por: { cargoId?: Id<"cargos">; colaboradorId?: Id<"colaboradores"> }) {
  const linhas = por.cargoId
    ? await ctx.db.query("registoEquipa").withIndex("by_cargo", (q) => q.eq("cargoId", por.cargoId)).order("desc").take(50)
    : await ctx.db.query("registoEquipa").withIndex("by_colaborador", (q) => q.eq("colaboradorId", por.colaboradorId)).order("desc").take(50);
  return linhas.map(linhaRegisto);
}

/* O editor de um cargo: o cargo, quem o tem e o que lhe aconteceu. */
export const cargo = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "equipa", "ver");
    const nid = ctx.db.normalizeId("cargos", id);
    const c = nid ? await ctx.db.get(nid) : null;
    if (!c) return null;
    const membros = await ctx.db.query("colaboradores").withIndex("by_cargo", (q) => q.eq("cargoId", c._id)).collect();
    return {
      id: c._id,
      nome: c.nome,
      descricao: c.descricao ?? null,
      permissoes: permissoesValidas(c),
      versao: c.actualizadoEm,
      criadoEm: c.criadoEm,
      membros: membros
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
        .map((p) => ({ id: p._id, nome: p.nome, email: p.email, estado: p.estado, ultimaEntradaEm: p.ultimaEntradaEm ?? null })),
      historico: await historico(ctx, { cargoId: c._id }),
    };
  },
});

/* O editor de um membro. */
export const membro = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "equipa", "ver");
    const nid = ctx.db.normalizeId("colaboradores", id);
    const p = nid ? await ctx.db.get(nid) : null;
    if (!p) return null;
    return {
      id: p._id,
      nome: p.nome,
      email: p.email,
      cargoId: p.cargoId,
      estado: p.estado,
      dono: donos().includes(p.email),
      versao: p.actualizadoEm,
      criadoEm: p.criadoEm,
      ultimaEntradaEm: p.ultimaEntradaEm ?? null,
      historico: await historico(ctx, { colaboradorId: p._id }),
    };
  },
});

export const registo = query({
  args: { tipo: v.optional(v.union(v.literal("cargos"), v.literal("membros"))), limite: v.optional(v.number()) },
  handler: async (ctx, { tipo, limite }) => {
    await exigirAdmin(ctx, "equipa", "ver");
    const n = Math.max(1, Math.min(500, Math.floor(limite ?? 200)));
    /* O filtro lê mais do que mostra: são poucas linhas por dia, e um índice
       por tipo não compensa. */
    const linhas = await ctx.db.query("registoEquipa").withIndex("by_em").order("desc").take(tipo ? n * 3 : n);
    const filtradas = tipo
      ? linhas.filter((l) => (tipo === "cargos" ? /cargo/i.test(l.accao) || l.cargoId : !/cargo/i.test(l.accao) || l.colaboradorId))
      : linhas;
    return filtradas.slice(0, n).map(linhaRegisto);
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
      "Isto tirava-te o acesso à Equipa. Pede a outra pessoa com esse acesso, ou a um dono, que o faça.",
    );
  }
}

export const guardarCargo = mutation({
  args: {
    id: v.optional(v.id("cargos")),
    /* O actualizadoEm que o editor leu. Sem ele (ecrãs antigos), grava sem
       verificar. */
    versao: v.optional(v.number()),
    nome: v.string(),
    descricao: v.optional(v.string()),
    permissoes: vPermissoes,
  },
  handler: async (ctx, a) => {
    const acesso = await lerAcesso(ctx);
    verificar(acesso, "equipa", "editar");
    const nome = a.nome.trim().replace(/\s+/g, " ");
    const descricao = a.descricao?.trim() || undefined;
    const erros: Record<string, string> = {};
    if (!nome) erros.nome = "O cargo precisa de um nome.";
    else if (nome.length > 60) erros.nome = "O nome do cargo tem de ter até 60 caracteres.";
    if (descricao && descricao.length > 300) erros.descricao = "A descrição tem de ter até 300 caracteres.";

    const vistos = new Set<string>();
    const permissoes: { modulo: ModuloPermissao; nivel: Nivel }[] = [];
    for (const p of a.permissoes) {
      if (!eModulo(p.modulo)) throw new ConvexError(`Módulo desconhecido: ${p.modulo}.`);
      if (vistos.has(p.modulo)) continue;
      vistos.add(p.modulo);
      permissoes.push({ modulo: p.modulo, nivel: p.nivel });
    }

    if (nome && !erros.nome) {
      const todos = await ctx.db.query("cargos").collect();
      const igual = todos.find((c) => c._id !== a.id && c.nome.toLocaleLowerCase("pt") === nome.toLocaleLowerCase("pt"));
      if (igual) erros.nome = `Já existe um cargo chamado "${igual.nome}".`;
    }
    if (Object.keys(erros).length) invalido(erros);

    const agora = Date.now();
    if (!a.id) {
      const id = await ctx.db.insert("cargos", { nome, descricao, permissoes, criadoEm: agora, actualizadoEm: agora });
      await registar(ctx, {
        ator: acesso.email!,
        accao: "Criou o cargo",
        alvo: nome,
        detalhe: diferencas(new Map(), mapa(permissoes)) || "Sem acessos",
        cargoId: id,
      });
      return { id, versao: agora };
    }

    const antes = await ctx.db.get(a.id);
    if (!antes) throw new ConvexError({ tipo: "naoExiste", mensagem: "Este cargo já não existe." });
    if (a.versao !== undefined && antes.actualizadoEm !== a.versao) conflito("este cargo");
    await protegerAutor(ctx, acesso.email!, acesso.dono, async (cargoId) =>
      cargoId === a.id ? mapa(permissoes) : null,
    );
    await ctx.db.patch(a.id, { nome, descricao, permissoes, actualizadoEm: agora });
    const partes = [
      antes.nome !== nome ? `Nome: ${antes.nome} → ${nome}` : "",
      (antes.descricao ?? "") !== (descricao ?? "") ? "Descrição alterada" : "",
      diferencas(mapa(antes.permissoes as { modulo: string; nivel: Nivel }[]), mapa(permissoes)),
    ].filter(Boolean);
    if (partes.length) {
      await registar(ctx, { ator: acesso.email!, accao: "Alterou o cargo", alvo: nome, detalhe: partes.join("; "), cargoId: a.id });
    }
    return { id: a.id, versao: agora };
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
    await registar(ctx, { ator: acesso.email!, accao: "Apagou o cargo", alvo: cargo.nome, cargoId: id });
    return null;
  },
});

export const guardarColaborador = mutation({
  args: {
    id: v.optional(v.id("colaboradores")),
    versao: v.optional(v.number()),
    email: v.string(),
    nome: v.string(),
    cargoId: v.optional(v.id("cargos")),
  },
  handler: async (ctx, a) => {
    const acesso = await lerAcesso(ctx);
    verificar(acesso, "equipa", "editar");
    const email = a.email.trim().toLowerCase();
    const nome = a.nome.trim().replace(/\s+/g, " ");
    const erros: Record<string, string> = {};
    if (!nome) erros.nome = "Falta o nome da pessoa.";
    if (!email) erros.email = "Falta o email com que a pessoa entra.";
    else if (!EMAIL.test(email)) erros.email = "O email não parece válido.";
    const cargo = a.cargoId ? await ctx.db.get(a.cargoId) : null;
    if (!a.cargoId) erros.cargo = "Escolha o cargo.";
    else if (!cargo) erros.cargo = "Esse cargo já não existe. Escolha outro.";

    if (!erros.email) {
      const mesmo = await ctx.db
        .query("colaboradores")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (mesmo && mesmo._id !== a.id) erros.email = `${email} já está na equipa, como ${mesmo.nome}.`;
    }
    if (Object.keys(erros).length || !cargo) invalido(erros);

    const agora = Date.now();
    if (!a.id) {
      const id = await ctx.db.insert("colaboradores", {
        email,
        nome,
        cargoId: cargo._id,
        estado: "activo",
        criadoEm: agora,
        actualizadoEm: agora,
      });
      await registar(ctx, {
        ator: acesso.email!,
        accao: "Acrescentou",
        alvo: `${nome} (${email})`,
        detalhe: `Cargo: ${cargo.nome}`,
        colaboradorId: id,
        cargoId: cargo._id,
      });
      return { id, versao: agora };
    }

    const antes = await ctx.db.get(a.id);
    if (!antes) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta pessoa já não está na equipa." });
    if (a.versao !== undefined && antes.actualizadoEm !== a.versao) conflito("esta pessoa");
    if (antes.email === acesso.email && antes.cargoId !== cargo._id) {
      await protegerAutor(ctx, acesso.email!, acesso.dono, async () =>
        mapa(cargo.permissoes as { modulo: string; nivel: Nivel }[]),
      );
    }
    await ctx.db.patch(a.id, { email, nome, cargoId: cargo._id, actualizadoEm: agora });
    const cargoAntes = antes.cargoId !== cargo._id ? (await ctx.db.get(antes.cargoId))?.nome ?? "?" : null;
    const partes = [
      antes.nome !== nome ? `Nome: ${antes.nome} → ${nome}` : "",
      antes.email !== email ? `Email: ${antes.email} → ${email}` : "",
      cargoAntes ? `Cargo: ${cargoAntes} → ${cargo.nome}` : "",
    ].filter(Boolean);
    if (partes.length) {
      await registar(ctx, {
        ator: acesso.email!,
        accao: "Alterou",
        alvo: `${nome} (${email})`,
        detalhe: partes.join("; "),
        colaboradorId: a.id,
        cargoId: cargoAntes ? cargo._id : undefined,
      });
    }
    return { id: a.id, versao: agora };
  },
});

/* Não se apaga ninguém: suspender corta o acesso já e guarda o histórico. */
export const mudarEstadoColaborador = mutation({
  args: { id: v.id("colaboradores"), estado: v.union(v.literal("activo"), v.literal("suspenso")) },
  handler: async (ctx, { id, estado }) => {
    const acesso = await lerAcesso(ctx);
    verificar(acesso, "equipa", "editar");
    const p = await ctx.db.get(id);
    if (!p) throw new ConvexError("Esta pessoa já não está na equipa. Recarregue a página.");
    if (p.estado === estado) return { versao: p.actualizadoEm };
    if (estado === "suspenso" && p.email === acesso.email) {
      throw new ConvexError("Não pode suspender a sua própria conta.");
    }
    const agora = Date.now();
    await ctx.db.patch(id, { estado, actualizadoEm: agora });
    await registar(ctx, {
      ator: acesso.email!,
      accao: estado === "suspenso" ? "Suspendeu" : "Reactivou",
      alvo: `${p.nome} (${p.email})`,
      colaboradorId: id,
    });
    return { versao: agora };
  },
});

/*
 * Os quatro perfis do plano do CRM 2027 (administração, comercial, operação e
 * financeiro), como ponto de partida para o David ajustar no ecrã. Corre-se à
 * mão em cada ambiente:
 *   npx convex run equipa:criarCargosIniciais
 * Salta os nomes que já existem, por isso repetir não estraga o que alguém
 * entretanto mudou.
 */
const CARGOS_INICIAIS: { nome: string; descricao: string; permissoes: Partial<Record<ModuloPermissao, Nivel>> }[] = [
  {
    nome: "Administração",
    descricao: "Tudo, incluindo a equipa interna.",
    permissoes: Object.fromEntries(MODULOS_PERMISSAO.map((m) => [m, "editar"])),
  },
  {
    nome: "Comercial",
    descricao: "Pedidos, parcerias e leads; vê reservas e o catálogo para responder a clientes.",
    permissoes: {
      pedidos: "editar",
      parcerias: "editar",
      leads: "editar",
      reservas: "ver",
      tours: "ver",
      eventos: "ver",
      corporate: "ver",
      extras: "ver",
      veiculos: "ver",
      avaliacoes: "ver",
    },
  },
  {
    nome: "Operação",
    descricao: "Reservas e candidaturas; vê pedidos, frota e catálogo para preparar os serviços.",
    permissoes: {
      reservas: "editar",
      candidaturas: "editar",
      motoristas: "editar",
      pedidos: "ver",
      veiculos: "ver",
      tours: "ver",
      eventos: "ver",
      parcerias: "ver",
    },
  },
  {
    nome: "Financeiro",
    descricao: "Vê reservas, pagamentos e parcerias. Não altera nada.",
    permissoes: { reservas: "ver", parcerias: "ver", definicoes: "ver" },
  },
];

export const criarCargosIniciais = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existentes = new Set((await ctx.db.query("cargos").collect()).map((c) => c.nome.toLocaleLowerCase("pt")));
    const criados: string[] = [];
    const agora = Date.now();
    for (const c of CARGOS_INICIAIS) {
      if (existentes.has(c.nome.toLocaleLowerCase("pt"))) continue;
      const permissoes = (Object.entries(c.permissoes) as [ModuloPermissao, Nivel][]).map(([modulo, nivel]) => ({ modulo, nivel }));
      const id = await ctx.db.insert("cargos", { nome: c.nome, descricao: c.descricao, permissoes, criadoEm: agora, actualizadoEm: agora });
      await registar(ctx, { ator: "sistema", accao: "Criou o cargo", alvo: c.nome, detalhe: diferencas(new Map(), mapa(permissoes)) || "Sem acessos", cargoId: id });
      criados.push(c.nome);
    }
    return { criados };
  },
});
