import { ConvexError, v } from "convex/values";
import { matchesSearch, pageArgs, pageOf } from "./lib/list";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin, lerAcesso, permite, verificar } from "./lib/admin";
import { VALIDADE_CONVITE, convitesDe, estadoDoConvite, novoToken, ultimoConvite } from "./lib/convites";
import { notificar } from "./lib/notificar";
import { urlDaImagem } from "./lib/imagens";
import {
  CHAVES_CAPACIDADE,
  eCapacidade,
  eModulo,
  MODULOS_PERMISSAO,
  tituloDaCapacidade,
  tituloDoModulo,
  type Capacidade,
  type ModuloPermissao,
  type Nivel,
} from "./lib/permissoes";

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

function capacidadesValidas(c: Doc<"cargos">): Capacidade[] {
  return (c.capacidades ?? []).filter(eCapacidade);
}

function diferencasCapacidades(antes: readonly string[], depois: readonly string[]): string {
  const mudou: string[] = [];
  for (const k of CHAVES_CAPACIDADE) {
    const a = antes.includes(k);
    const d = depois.includes(k);
    if (a !== d) mudou.push(`${tituloDaCapacidade(k)}: ${a ? "sim" : "não"} → ${d ? "sim" : "não"}`);
  }
  return mudou.join("; ");
}

/* O estado de um membro como a equipa o vê: "convidado" até entrar pela
   primeira vez. Não se grava: deduz-se da última entrada. */
function situacao(p: Doc<"colaboradores">): "activo" | "convidado" | "suspenso" {
  if (p.estado === "suspenso") return "suspenso";
  return p.ultimaEntradaEm ? "activo" : "convidado";
}

/* O convite como o dashboard o mostra: o estado já com o prazo contado, e
   quantas vezes foi reenviado (todos menos o primeiro). */
function resumoConvite(c: Doc<"convites"> | null | undefined, total: number, agora = Date.now()) {
  if (!c) return null;
  return {
    id: c._id,
    estado: estadoDoConvite(c, agora),
    criadoEm: c.criadoEm,
    expiraEm: c.expiraEm,
    respondidoEm: c.respondidoEm ?? null,
    envio: c.envio,
    enviadoEm: c.enviadoEm ?? null,
    por: c.por,
    reenvios: Math.max(0, total - 1),
  };
}

/*
 * Um convite novo para este colaborador: o pendente anterior deixa de valer
 * (substituido), sai o email e fica agendado o fim do prazo. Usado ao
 * acrescentar alguém e ao reenviar.
 */
async function criarConvite(ctx: MutationCtx, p: Doc<"colaboradores">, por: string) {
  const agora = Date.now();
  for (const c of await convitesDe(ctx.db, p._id)) {
    if (c.estado === "pendente") await ctx.db.patch(c._id, { estado: "substituido" });
  }
  const id = await ctx.db.insert("convites", {
    colaboradorId: p._id,
    email: p.email,
    token: novoToken(),
    estado: "pendente",
    criadoEm: agora,
    expiraEm: agora + VALIDADE_CONVITE,
    envio: "aEnviar",
    por,
  });
  await ctx.scheduler.runAfter(0, internal.equipa.enviarConvite, { conviteId: id });
  await ctx.scheduler.runAt(agora + VALIDADE_CONVITE, internal.equipa.expirarConvite, { conviteId: id });
  return id;
}

/* Everything the team screens show; `lista`, `members` and `roles` share it. */
async function loadTeam(ctx: QueryCtx) {
  const [cargos, colaboradores, convites] = await Promise.all([
    ctx.db.query("cargos").collect(),
    ctx.db.query("colaboradores").collect(),
    ctx.db.query("convites").collect(),
  ]);
  /* Os convites de cada pessoa, do mais recente para o mais antigo. */
  const convitesPor = new Map<string, Doc<"convites">[]>();
  for (const c of convites.sort((a, b) => b.criadoEm - a.criadoEm)) {
    const l = convitesPor.get(c.colaboradorId) ?? [];
    l.push(c);
    convitesPor.set(c.colaboradorId, l);
  }
  const agora = Date.now();
  const nomeCargo = new Map(cargos.map((c) => [c._id as string, c.nome]));
  const listaDonos = donos();
  /* A última linha do registo de cada cargo: quem lhe mexeu por último,
     para a lista. São poucos cargos; uma leitura por cada chega. */
  const ultimas = await Promise.all(
    cargos.map((c) =>
      ctx.db.query("registoEquipa").withIndex("by_cargo", (q) => q.eq("cargoId", c._id)).order("desc").first(),
    ),
  );
  // Each member's own photo (acesso.setMyPhoto), for the avatars on every team screen.
  const photoUrls = new Map(
    await Promise.all(colaboradores.filter((p) => p.photo).map(async (p) => [p._id as string, await urlDaImagem(ctx, p.photo)] as const)),
  );
  return {
    cargos: cargos
      .map((c, i) => {
        const membros = colaboradores
          .filter((p) => p.cargoId === c._id)
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
          .map((p) => ({ id: p._id, nome: p.nome, estado: p.estado, photoUrl: photoUrls.get(p._id) ?? null }));
        return {
          id: c._id,
          nome: c.nome,
          descricao: c.descricao ?? null,
          permissoes: permissoesValidas(c),
          capacidades: capacidadesValidas(c),
          pessoas: membros.length,
          membros,
          actualizadoEm: c.actualizadoEm,
          alteradoPor: ultimas[i]?.ator ?? null,
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
        situacao: situacao(p),
        convite: resumoConvite(convitesPor.get(p._id)?.[0], convitesPor.get(p._id)?.length ?? 0, agora),
        /* Também nos donos: o cargo não conta enquanto o email lá estiver. */
        dono: listaDonos.includes(p.email),
        criadoEm: p.criadoEm,
        actualizadoEm: p.actualizadoEm,
        ultimaEntradaEm: p.ultimaEntradaEm ?? null,
        photoUrl: photoUrls.get(p._id) ?? null,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
    donos: listaDonos,
  };
}

export const lista = query({
  args: {},
  handler: async (ctx) => {
    await exigirAdmin(ctx, "equipa", "ver");
    return loadTeam(ctx);
  },
});

type MemberStatus = "active" | "pending" | "declined" | "expired" | "blocked";
type TeamMember = Awaited<ReturnType<typeof loadTeam>>["colaboradores"][number];

/* The filter's status: someone who never signed in is in their invite's state;
   a blocked person is blocked whether or not they ever signed in. */
function memberStatus(m: TeamMember): MemberStatus {
  if (m.situacao === "suspenso") return "blocked";
  if (m.situacao === "convidado") {
    const invite = m.ultimaEntradaEm ? "aceite" : (m.convite?.estado ?? "pendente");
    return invite === "aceite" ? "active" : invite === "recusado" ? "declined" : invite === "expirado" ? "expired" : "pending";
  }
  return "active";
}

const vMemberStatus = v.union(v.literal("active"), v.literal("pending"), v.literal("declined"), v.literal("expired"), v.literal("blocked"));

/* Team → People: status, role, search and page come from the URL and are
   resolved here. Owners (ADMIN_EMAILS) with no member row come separately, on
   the first page only, because they are not rows anyone can edit. */
export const members = query({
  args: { search: v.optional(v.string()), status: v.optional(vMemberStatus), roleId: v.optional(v.string()), ...pageArgs },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "equipa", "ver");
    const team = await loadTeam(ctx);
    const all = team.colaboradores;
    const emails = new Set(all.map((m) => m.email));
    const looseOwners = team.donos.filter((e) => !emails.has(e));
    const matching = all
      .filter((m) => !a.status || memberStatus(m) === a.status)
      .filter((m) => !a.roleId || m.cargoId === a.roleId)
      .filter((m) => matchesSearch(a.search, [m.nome, m.email, m.cargo]))
      // People who signed in first; then invites, newest first.
      .sort((x, y) => {
        const ix = x.situacao === "convidado" ? 1 : 0;
        const iy = y.situacao === "convidado" ? 1 : 0;
        if (ix !== iy) return ix - iy;
        return ix ? (y.convite?.criadoEm ?? 0) - (x.convite?.criadoEm ?? 0) : 0;
      });
    const pg = pageOf(matching, a);
    const owners =
      pg.page === 0 && (!a.status || a.status === "active") && !a.roleId ? looseOwners.filter((e) => matchesSearch(a.search, [e, "dono"])) : [];
    const count = (st: MemberStatus) => all.filter((m) => memberStatus(m) === st).length + (st === "active" ? looseOwners.length : 0);
    return {
      ...pg,
      rows: pg.rows.map((m) => ({ ...m, status: memberStatus(m) })),
      owners,
      counts: {
        all: all.length + looseOwners.length,
        active: count("active"),
        pending: count("pending"),
        declined: count("declined"),
        expired: count("expired"),
        blocked: count("blocked"),
      },
      // The role filter and the invite dialog need every role, not one page.
      roles: team.cargos,
    };
  },
});

/* Team → Roles: search and page come from the URL and are resolved here. */
export const roles = query({
  args: { search: v.optional(v.string()), ...pageArgs },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "equipa", "ver");
    const { cargos } = await loadTeam(ctx);
    const pg = pageOf(cargos.filter((c) => matchesSearch(a.search, [c.nome, c.descricao])), a);
    return { ...pg, unfilteredTotal: cargos.length, peopleTotal: cargos.reduce((n, c) => n + c.pessoas, 0) };
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
      capacidades: capacidadesValidas(c),
      versao: c.actualizadoEm,
      criadoEm: c.criadoEm,
      membros: await Promise.all(
        membros
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
          .map(async (p) => ({
            id: p._id,
            nome: p.nome,
            email: p.email,
            estado: p.estado,
            situacao: situacao(p),
            ultimaEntradaEm: p.ultimaEntradaEm ?? null,
            photoUrl: await urlDaImagem(ctx, p.photo),
          })),
      ),
      historico: await historico(ctx, { cargoId: c._id }),
    };
  },
});

/* O editor de um membro. */
export const membro = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    await exigirAdmin(ctx, "equipa", "ver");
    const acesso = await lerAcesso(ctx);
    const nid = ctx.db.normalizeId("colaboradores", id);
    const p = nid ? await ctx.db.get(nid) : null;
    if (!p) return null;
    const convites = await convitesDe(ctx.db, p._id);
    const ultimo = convites[0];
    const agora = Date.now();
    return {
      id: p._id,
      nome: p.nome,
      email: p.email,
      cargoId: p.cargoId,
      estado: p.estado,
      situacao: situacao(p),
      convite: resumoConvite(ultimo, convites.length, agora),
      /* O link do convite, para mandar à mão: só a quem gere a equipa e só
         enquanto vale. */
      linkConvite:
        ultimo && estadoDoConvite(ultimo, agora) === "pendente" && permite(acesso, "equipa", "editar") && !acesso.simulacao
          ? `/convite/${ultimo.token}`
          : null,
      convites: convites.map((c) => ({
        id: c._id,
        estado: estadoDoConvite(c, agora),
        criadoEm: c.criadoEm,
        expiraEm: c.expiraEm,
        respondidoEm: c.respondidoEm ?? null,
        envio: c.envio,
        por: c.por,
      })),
      dono: donos().includes(p.email),
      versao: p.actualizadoEm,
      criadoEm: p.criadoEm,
      ultimaEntradaEm: p.ultimaEntradaEm ?? null,
      telefone: p.telefone ?? null,
      idioma: p.idioma ?? "pt",
      mensagemConvite: p.mensagemConvite ?? null,
      photoUrl: await urlDaImagem(ctx, p.photo),
      historico: await historico(ctx, { colaboradorId: p._id }),
    };
  },
});

/*
 * A ficha de um dono (ADMIN_EMAILS). Não é um registo da tabela: vive na
 * variável do servidor. Mostra o que fez na equipa (o registo guarda o
 * email de quem fez). Só para emails que estão mesmo na variável — não
 * serve para sondar o registo de qualquer pessoa por email.
 */
export const dono = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    await exigirAdmin(ctx, "equipa", "ver");
    const e = email.trim().toLowerCase();
    if (!donos().includes(e)) return null;
    const colaborador = await ctx.db
      .query("colaboradores")
      .withIndex("by_email", (q) => q.eq("email", e))
      .first();
    /* Sem índice por autor: são poucas linhas, e as últimas chegam. */
    const recentes = await ctx.db.query("registoEquipa").withIndex("by_em").order("desc").take(500);
    return {
      email: e,
      nome: colaborador?.nome ?? null,
      colaboradorId: colaborador?._id ?? null,
      historico: recentes.filter((l) => l.ator === e).slice(0, 30).map(linhaRegisto),
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

/* The team log screen: type, search and page come from the URL and are
   resolved here. It reads the most recent 1000 entries, which is months of
   changes; the screen never showed more than 500. */
export const log = query({
  args: { type: v.optional(v.union(v.literal("cargos"), v.literal("membros"))), search: v.optional(v.string()), ...pageArgs },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "equipa", "ver");
    const recent = await ctx.db.query("registoEquipa").withIndex("by_em").order("desc").take(1000);
    const matching = recent
      .filter((l) => !a.type || (a.type === "cargos" ? /cargo/i.test(l.accao) || l.cargoId : !/cargo/i.test(l.accao) || l.colaboradorId))
      .filter((l) => matchesSearch(a.search, [l.ator, l.accao, l.alvo, l.detalhe]));
    const pg = pageOf(matching, a);
    return { ...pg, rows: pg.rows.map(linhaRegisto) };
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
    /* Opcional para os ecrãs de antes das capacidades: sem ele, ficam as
       que o cargo tinha. */
    capacidades: v.optional(v.array(v.string())),
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

    for (const c of a.capacidades ?? []) if (!eCapacidade(c)) throw new ConvexError(`Ação desconhecida: ${c}.`);
    const capacidadesNovas = a.capacidades ? [...new Set(a.capacidades.filter(eCapacidade))] : undefined;

    if (nome && !erros.nome) {
      const todos = await ctx.db.query("cargos").collect();
      const igual = todos.find((c) => c._id !== a.id && c.nome.toLocaleLowerCase("pt") === nome.toLocaleLowerCase("pt"));
      if (igual) erros.nome = `Já existe um cargo chamado "${igual.nome}".`;
    }
    if (Object.keys(erros).length) invalido(erros);

    const agora = Date.now();
    if (!a.id) {
      const capacidades = capacidadesNovas ?? [];
      const id = await ctx.db.insert("cargos", { nome, descricao, permissoes, capacidades, criadoEm: agora, actualizadoEm: agora });
      await registar(ctx, {
        ator: acesso.email!,
        accao: "Criou o cargo",
        alvo: nome,
        detalhe: [diferencas(new Map(), mapa(permissoes)), diferencasCapacidades([], capacidades)].filter(Boolean).join("; ") || "Sem acessos",
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
    const capacidades = capacidadesNovas ?? antes.capacidades ?? [];
    await ctx.db.patch(a.id, { nome, descricao, permissoes, capacidades, actualizadoEm: agora });
    const partes = [
      antes.nome !== nome ? `Nome: ${antes.nome} → ${nome}` : "",
      (antes.descricao ?? "") !== (descricao ?? "") ? "Descrição alterada" : "",
      diferencas(mapa(antes.permissoes as { modulo: string; nivel: Nivel }[]), mapa(permissoes)),
      diferencasCapacidades(antes.capacidades ?? [], capacidades),
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
    /* Opcionais para os ecrãs de antes destes campos: sem eles, ficam os
       que a pessoa tinha. */
    telefone: v.optional(v.string()),
    idioma: v.optional(v.union(v.literal("pt"), v.literal("en"))),
    mensagemConvite: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const acesso = await lerAcesso(ctx);
    verificar(acesso, "equipa", "editar");
    const email = a.email.trim().toLowerCase();
    const nome = a.nome.trim().replace(/\s+/g, " ");
    const telefone = a.telefone === undefined ? undefined : a.telefone.trim().replace(/\s+/g, " ");
    const mensagemConvite = a.mensagemConvite === undefined ? undefined : a.mensagemConvite.trim();
    const erros: Record<string, string> = {};
    if (!nome) erros.nome = "Falta o nome da pessoa.";
    if (telefone && !/^\+?[\d ()-]{6,20}$/.test(telefone)) erros.telefone = "O telemóvel só leva algarismos, espaços e o + do indicativo.";
    if (mensagemConvite && mensagemConvite.length > 600) erros.mensagemConvite = "A mensagem tem de caber em 600 caracteres.";
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
        telefone: telefone || undefined,
        idioma: a.idioma,
        mensagemConvite: mensagemConvite || undefined,
      });
      await registar(ctx, {
        ator: acesso.email!,
        accao: "Acrescentou",
        alvo: `${nome} (${email})`,
        detalhe: `Cargo: ${cargo.nome}`,
        colaboradorId: id,
        cargoId: cargo._id,
      });
      const novo = await ctx.db.get(id);
      await criarConvite(ctx, novo!, acesso.nome ?? acesso.email!);
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
    await ctx.db.patch(a.id, {
      email,
      nome,
      cargoId: cargo._id,
      actualizadoEm: agora,
      /* undefined no patch apaga o campo: só se mexe no que veio. */
      ...(telefone !== undefined && { telefone: telefone || undefined }),
      ...(a.idioma !== undefined && { idioma: a.idioma }),
      ...(mensagemConvite !== undefined && { mensagemConvite: mensagemConvite || undefined }),
    });
    const cargoAntes = antes.cargoId !== cargo._id ? (await ctx.db.get(antes.cargoId))?.nome ?? "?" : null;
    const partes = [
      antes.nome !== nome ? `Nome: ${antes.nome} → ${nome}` : "",
      antes.email !== email ? `Email: ${antes.email} → ${email}` : "",
      cargoAntes ? `Cargo: ${cargoAntes} → ${cargo.nome}` : "",
      telefone !== undefined && (antes.telefone ?? "") !== telefone ? `Telemóvel: ${antes.telefone || "—"} → ${telefone || "—"}` : "",
      a.idioma !== undefined && (antes.idioma ?? "pt") !== a.idioma ? `Idioma: ${antes.idioma === "en" ? "inglês" : "português"} → ${a.idioma === "en" ? "inglês" : "português"}` : "",
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
    /* Bloquear corta o acesso de alguém já: decisão de dono. */
    if (!acesso.dono) throw new ConvexError("Só os donos podem bloquear ou desbloquear membros.");
    const p = await ctx.db.get(id);
    if (!p) throw new ConvexError("Esta pessoa já não está na equipa. Recarregue a página.");
    if (p.estado === estado) return { versao: p.actualizadoEm };
    if (estado === "suspenso" && p.email === acesso.email) {
      throw new ConvexError("Não se pode bloquear a si próprio.");
    }
    const agora = Date.now();
    await ctx.db.patch(id, { estado, actualizadoEm: agora });
    await registar(ctx, {
      ator: acesso.email!,
      accao: estado === "suspenso" ? "Bloqueou" : "Desbloqueou",
      alvo: `${p.nome} (${p.email})`,
      colaboradorId: id,
    });
    return { versao: agora };
  },
});

/*
 * Apagar um membro: só os donos. Sai da equipa e os convites dele também;
 * as linhas do registo ficam (o alvo é texto) para se saber quem foi e
 * quando. Para cortar o acesso sem perder a pessoa, há o bloquear.
 */
export const apagarColaborador = mutation({
  args: { id: v.id("colaboradores") },
  handler: async (ctx, { id }) => {
    const acesso = await lerAcesso(ctx);
    verificar(acesso, "equipa", "editar");
    if (!acesso.dono) throw new ConvexError("Só os donos podem apagar membros.");
    const p = await ctx.db.get(id);
    if (!p) throw new ConvexError("Esta pessoa já não está na equipa. Recarregue a página.");
    if (p.email === acesso.email) throw new ConvexError("Não se pode apagar a si próprio.");
    const cargo = await ctx.db.get(p.cargoId);
    for (const c of await convitesDe(ctx.db, id)) await ctx.db.delete(c._id);
    /* "Ver como" e simulações são por email de quem simula, não deste. */
    await ctx.db.delete(id);
    await registar(ctx, {
      ator: acesso.email!,
      accao: "Apagou o membro",
      alvo: `${p.nome} (${p.email})`,
      detalhe: cargo ? `Cargo: ${cargo.nome}` : undefined,
      colaboradorId: id,
    });
    return null;
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
const CARGOS_INICIAIS: { nome: string; descricao: string; permissoes: Partial<Record<ModuloPermissao, Nivel>>; capacidades: Capacidade[] }[] = [
  {
    nome: "Administração",
    descricao: "Tudo, incluindo a equipa interna.",
    permissoes: Object.fromEntries(MODULOS_PERMISSAO.map((m) => [m, "editar"])),
    capacidades: [...CHAVES_CAPACIDADE],
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
    capacidades: ["valores"],
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
    capacidades: ["pagamentos", "documentos"],
  },
  {
    nome: "Financeiro",
    descricao: "Vê reservas, pagamentos e parcerias. Não altera nada.",
    permissoes: { reservas: "ver", parcerias: "ver", definicoes: "ver" },
    capacidades: ["valores"],
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
      const id = await ctx.db.insert("cargos", { nome: c.nome, descricao: c.descricao, permissoes, capacidades: c.capacidades, criadoEm: agora, actualizadoEm: agora });
      await registar(ctx, { ator: "sistema", accao: "Criou o cargo", alvo: c.nome, detalhe: diferencas(new Map(), mapa(permissoes)) || "Sem acessos", cargoId: id });
      criados.push(c.nome);
    }
    return { criados };
  },
});

/* Os cargos criados antes das capacidades ficam com as do plano: sem isto
   ninguém (além dos donos) via valores, apagava ou confirmava pagamentos.
 *   npx convex run equipa:capacidadesIniciais
 * Só mexe nos cargos de CARGOS_INICIAIS que ainda não têm o campo. */
export const capacidadesIniciais = internalMutation({
  args: {},
  handler: async (ctx) => {
    const mudados: string[] = [];
    for (const c of await ctx.db.query("cargos").collect()) {
      if (c.capacidades !== undefined) continue;
      const base = CARGOS_INICIAIS.find((x) => x.nome.toLocaleLowerCase("pt") === c.nome.toLocaleLowerCase("pt"));
      if (!base) continue;
      await ctx.db.patch(c._id, { capacidades: base.capacidades });
      await registar(ctx, { ator: "sistema", accao: "Alterou o cargo", alvo: c.nome, detalhe: diferencasCapacidades([], base.capacidades), cargoId: c._id });
      mudados.push(c.nome);
    }
    return { mudados };
  },
});

/* ─── Convites ───────────────────────────────────────────────────────── */

/*
 * Acrescentar alguém à equipa não lhe dizia nada: tinha de adivinhar que
 * devia criar conta com aquele email. Agora sai um email com o link do
 * back-office e o email já preenchido. O membro fica "Convidado" até entrar
 * pela primeira vez (acesso.registarEntrada).
 *
 * Só sai onde há RESEND_API_KEY (produção). Sem ela fica "semEmail" e o
 * ecrã diz para enviar o link à mão — em development e staging, de
 * propósito, como os outros avisos.
 */
export const reenviarConvite = mutation({
  args: { id: v.id("colaboradores") },
  handler: async (ctx, { id }) => {
    const acesso = await lerAcesso(ctx);
    verificar(acesso, "equipa", "editar");
    const p = await ctx.db.get(id);
    if (!p) throw new ConvexError("Esta pessoa já não está na equipa.");
    if (p.estado === "suspenso") throw new ConvexError("Esta pessoa está bloqueada. Desbloqueie-a antes de reenviar o convite.");
    if (p.ultimaEntradaEm) throw new ConvexError(`${p.nome} já entrou no back-office: não precisa de convite.`);
    /* Um clique duplo, ou dois separadores, não mandam dois emails. */
    const ultimo = await ultimoConvite(ctx.db, id);
    if (ultimo && ultimo.envio === "aEnviar" && Date.now() - ultimo.criadoEm < 60_000) return null;
    const recusado = ultimo && estadoDoConvite(ultimo) === "recusado";
    await criarConvite(ctx, p, acesso.nome ?? acesso.email!);
    await registar(ctx, {
      ator: acesso.email!,
      accao: recusado ? "Voltou a convidar" : "Reenviou o convite a",
      alvo: `${p.nome} (${p.email})`,
      detalhe: "Válido por 7 dias",
      colaboradorId: id,
    });
    return null;
  },
});

export const dadosDoConvite = internalQuery({
  args: { conviteId: v.id("convites") },
  handler: async (ctx, { conviteId }) => {
    const c = await ctx.db.get(conviteId);
    if (!c) return null;
    const p = await ctx.db.get(c.colaboradorId);
    if (!p) return null;
    const cargo = await ctx.db.get(p.cargoId);
    return {
      nome: p.nome,
      email: p.email,
      cargo: cargo?.nome ?? null,
      idioma: p.idioma ?? "pt",
      mensagem: p.mensagemConvite ?? null,
      token: c.token,
      expiraEm: c.expiraEm,
      por: c.por,
      /* Já não vale (substituído por um reenvio, recusado, aceite): não sai. */
      valido: estadoDoConvite(c) === "pendente" && !p.ultimaEntradaEm,
    };
  },
});

export const marcarConvite = internalMutation({
  args: {
    conviteId: v.id("convites"),
    envio: v.union(v.literal("enviado"), v.literal("falhou"), v.literal("semEmail")),
  },
  handler: async (ctx, { conviteId, envio }) => {
    const c = await ctx.db.get(conviteId);
    if (!c) return;
    await ctx.db.patch(conviteId, { envio, enviadoEm: Date.now() });
  },
});

/* O fim do prazo, agendado ao criar o convite. Um aceite, recusado ou
   substituído entretanto fica como está. */
export const expirarConvite = internalMutation({
  args: { conviteId: v.id("convites") },
  handler: async (ctx, { conviteId }) => {
    const c = await ctx.db.get(conviteId);
    if (!c || c.estado !== "pendente") return;
    const p = await ctx.db.get(c.colaboradorId);
    if (p?.ultimaEntradaEm) return;
    await ctx.db.patch(conviteId, { estado: "expirado" });
    if (p) {
      await registar(ctx, { ator: "sistema", accao: "Expirou o convite de", alvo: `${p.nome} (${p.email})`, colaboradorId: p._id });
    }
  },
});

/*
 * Para os testes do ciclo do convite em development: põe o prazo de um
 * convite no passado e corre o fim. Interna, como todas as de teste.
 *   npx convex run equipa:anteciparFimDoConvite '{"conviteId":"…"}'
 */
export const anteciparFimDoConvite = internalMutation({
  args: { conviteId: v.id("convites") },
  handler: async (ctx, { conviteId }) => {
    const c = await ctx.db.get(conviteId);
    if (!c || c.estado !== "pendente") return "não está pendente";
    await ctx.db.patch(conviteId, { expiraEm: Date.now() - 1 });
    await ctx.scheduler.runAfter(0, internal.equipa.expirarConvite, { conviteId });
    return "expirado";
  },
});

/*
 * Os convites que estavam como campos do colaborador passam à tabela
 * convites. Pode correr mais de uma vez: quem já tem convite na tabela
 * salta.
 *   npx convex run equipa:migrarConvites
 */
export const migrarConvites = internalMutation({
  args: {},
  handler: async (ctx) => {
    const agora = Date.now();
    let criados = 0;
    for (const p of await ctx.db.query("colaboradores").collect()) {
      if (await ultimoConvite(ctx.db, p._id)) continue;
      const entrou = Boolean(p.ultimaEntradaEm);
      const id = await ctx.db.insert("convites", {
        colaboradorId: p._id,
        email: p.email,
        token: novoToken(),
        estado: entrou ? "aceite" : "pendente",
        criadoEm: p.conviteEnviadoEm ?? p.criadoEm,
        expiraEm: entrou ? (p.conviteEnviadoEm ?? p.criadoEm) + VALIDADE_CONVITE : agora + VALIDADE_CONVITE,
        respondidoEm: p.ultimaEntradaEm,
        envio: p.conviteEstado === "aEnviar" || !p.conviteEstado ? "semEmail" : p.conviteEstado,
        enviadoEm: p.conviteEnviadoEm,
        por: "sistema",
      });
      if (!entrou) await ctx.scheduler.runAt(agora + VALIDADE_CONVITE, internal.equipa.expirarConvite, { conviteId: id });
      await ctx.db.patch(p._id, { conviteEnviadoEm: undefined, convitesEnviados: undefined, conviteEstado: undefined });
      criados++;
    }
    return { criados };
  },
});

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ESC[c]!);

export const enviarConvite = internalAction({
  args: { conviteId: v.id("convites") },
  handler: async (ctx, { conviteId }) => {
    const d = await ctx.runQuery(internal.equipa.dadosDoConvite, { conviteId });
    if (!d || !d.valido) return;
    const por = d.por;
    const base = (process.env.ADMIN_BASE_URL ?? "https://dashboard.easytransferportugal.com").replace(/\/$/, "");
    /* A página do convite (aceitar ou recusar), não a entrada directa:
       quem não o quer tem de poder dizê-lo. */
    const link = `${base}/convite/${d.token}`;
    const chave = process.env.RESEND_API_KEY;
    if (!chave) {
      /* Sem o link no log: é o que dá para recusar o convite de alguém. O
         back-office mostra-o a quem gere a equipa. */
      console.log(`[Convite] Não enviado (sem RESEND_API_KEY): ${d.email}`);
      await ctx.runMutation(internal.equipa.marcarConvite, { conviteId, envio: "semEmail" });
      return;
    }
    const primeiro = d.nome.split(" ")[0] ?? d.nome;
    const en = d.idioma === "en";
    const ate = new Intl.DateTimeFormat(en ? "en-GB" : "pt-PT", { day: "numeric", month: "long", timeZone: "Europe/Lisbon" }).format(d.expiraEm);
    const como = d.cargo;
    /* A mensagem de quem convida, como citação: quebras de linha mantidas,
       e escapada como o resto (vem de um campo de texto livre). */
    const mensagem = d.mensagem
      ? `<blockquote style="margin:0 0 24px;padding:12px 16px;border-left:3px solid #c9a96e;background:#faf7f1;font-size:15px;line-height:1.6;color:#3a3833">${escapar(d.mensagem).replace(/\n/g, "<br>")}<br><span style="font-size:13px;color:#8a8780">— ${escapar(por)}</span></blockquote>`
      : "";
    const t = en
      ? {
          titulo: `Hi ${escapar(primeiro)}, you now have access to the back-office`,
          quem: `${escapar(por)} added you to the team${como ? ` as <strong>${escapar(como)}</strong>` : ""}.`,
          como: `Sign in with <strong>${escapar(d.email)}</strong> — with Google, or with a code sent to this address. If you don't have an account yet, you'll create it in the same step.`,
          botao: "See the invitation",
          validade: `The invitation is valid until ${ate}. On the next page you can accept it or decline it.`,
          rodape: "If you weren't expecting this email, you can ignore it: nothing happens unless you sign in with this address.",
          assunto: "Your invitation to the LuxMotion back-office",
        }
      : {
          titulo: `Olá ${escapar(primeiro)}, tem acesso ao back-office`,
          quem: `${escapar(por)} acrescentou-o à equipa${como ? ` como <strong>${escapar(como)}</strong>` : ""}.`,
          como: `Entre com <strong>${escapar(d.email)}</strong> — com o Google, ou com um código enviado para este email. Se ainda não tem conta, cria-a no mesmo passo.`,
          botao: "Ver o convite",
          validade: `O convite é válido até ${ate}. Na página seguinte pode aceitá-lo ou recusá-lo.`,
          rodape: "Se não esperava este email, pode ignorá-lo: sem entrar com este endereço, nada acontece.",
          assunto: "Convite para o back-office da LuxMotion",
        };
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1c1b18">
        <p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#9a7535;margin:0 0 12px">LuxMotion · Back-office</p>
        <h1 style="font-size:22px;margin:0 0 16px">${t.titulo}</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${t.quem}</p>
        ${mensagem}
        <p style="font-size:15px;line-height:1.6;margin:0 0 24px">${t.como}</p>
        <a href="${link}" style="display:inline-block;background:#1c1b18;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:15px">${t.botao}</a>
        <p style="font-size:13px;color:#5a5852;margin:16px 0 0">${t.validade}</p>
        <p style="font-size:12px;color:#8a8780;margin:28px 0 0">${t.rodape}</p>
      </div>`;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? "LuxMotion <onboarding@resend.dev>",
          to: [d.email],
          subject: t.assunto,
          html,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
      await ctx.runMutation(internal.equipa.marcarConvite, { conviteId, envio: "enviado" });
    } catch (e) {
      console.error(`[Convite] ${d.email} falhou: ${e instanceof Error ? e.message : String(e)}`);
      await ctx.runMutation(internal.equipa.marcarConvite, { conviteId, envio: "falhou" });
    }
  },
});
