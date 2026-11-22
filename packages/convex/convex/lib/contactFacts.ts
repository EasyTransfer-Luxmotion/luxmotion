import type { GenericDatabaseWriter } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { facts, normaliseSearch, type FactEntry } from "./orderFacts";
import { RELACOES, relacaoDaOrigem, type Relacao } from "./contactos";
import { tituloDaOrigem } from "./funis";

/*
 * Contacts (organisations and people) carry their own numbers and relations,
 * kept by triggers (lib/triggers.ts), so the Contactos list never reads every
 * contact, order and card to work them out. At 10 000 orders a day there is
 * a new contact for almost every paid booking: hundreds of thousands a year.
 *
 * On each contact and organisation:
 *  - nReservas, gasto, ultimaReserva: its paid bookings (a round trip once,
 *    both legs' money), from the order facts ["contact"|"org", id, "o"|"r"].
 *  - nPedidos: its cards that are not bookings and not archived.
 *  - relProprias: what its own cards, first origin and portfolio make it;
 *    relacoes: what the list shows. A person of a partner organisation is a
 *    partner; an organisation is everything its people are. Nothing: client.
 *  - procura: the text the search looks in.
 *  - nPessoas, nEstabelecimentos (organisations).
 * And each is filed in the facts by type, relation and sort, for the list.
 */

type Kind = "contactos" | "organizacoes";
type Writer = { db: GenericDatabaseWriter<DataModel> } & Parameters<typeof facts.insert>[0] & Parameters<typeof facts.count>[0];
type Contact = Doc<"contactos">;
type Org = Doc<"organizacoes">;

const sameSet = (a: readonly string[] | undefined, b: readonly string[]) => (a ?? []).length === b.length && b.every((x) => (a ?? []).includes(x));
const sorted = (s: Iterable<string>) => RELACOES.filter((r) => [...s].includes(r));

/* ─── Numbers ──────────────────────────────────────────────────────── */

export async function refreshNumbers(ctx: Writer, kind: Kind, id: Id<"contactos"> | Id<"organizacoes">): Promise<void> {
  const doc = (await ctx.db.get(id)) as Contact | Org | null;
  if (!doc) return;
  const tag = kind === "contactos" ? "contact" : "org";
  const ns = [[tag, id, "o"], [tag, id, "r"]].map((namespace) => ({ namespace }));
  const counts = await facts.countBatch(ctx, ns);
  const sums = await facts.sumBatch(ctx, ns);
  const full = ns.filter((_, i) => counts[i]! > 0);
  const last = full.length ? await facts.atBatch(ctx, full.map((n) => ({ ...n, offset: -1 }))) : [];
  const cards =
    kind === "contactos"
      ? await ctx.db.query("negocios").withIndex("by_contacto", (q) => q.eq("contactoId", id as Id<"contactos">)).collect()
      : await ctx.db.query("negocios").withIndex("by_organizacao", (q) => q.eq("organizacaoId", id as Id<"organizacoes">)).collect();
  const next = {
    nReservas: counts[0]!,
    gasto: Math.round((sums[0]! + sums[1]!) * 100) / 100,
    ultimaReserva: last.length ? Math.max(...last.map((x) => Number(x.key))) : undefined,
    nPedidos: cards.filter((n) => n.origem !== "orders" && !n.arquivadoEm).length,
  };
  if (doc.nReservas !== next.nReservas || doc.gasto !== next.gasto || doc.ultimaReserva !== next.ultimaReserva || doc.nPedidos !== next.nPedidos)
    await ctx.db.patch(id, next);
}

/* ─── Relations ────────────────────────────────────────────────────── */

async function ownRelations(ctx: Writer, kind: Kind, doc: Contact | Org): Promise<Relacao[]> {
  const cards =
    kind === "contactos"
      ? await ctx.db.query("negocios").withIndex("by_contacto", (q) => q.eq("contactoId", doc._id as Id<"contactos">)).collect()
      : await ctx.db.query("negocios").withIndex("by_organizacao", (q) => q.eq("organizacaoId", doc._id as Id<"organizacoes">)).collect();
  const own = new Set<Relacao>();
  const keys = new Map<string, string | undefined>();
  for (const n of cards) {
    if (!keys.has(n.funilId)) keys.set(n.funilId, (await ctx.db.get(n.funilId))?.chave);
    const chave = keys.get(n.funilId);
    if (chave === "parcerias") own.add(relacaoDaOrigem(n.origem) === "motoristas" ? "motoristas" : "parceiros");
    else if (chave) own.add("clientes");
  }
  const r = relacaoDaOrigem(doc.primeiraOrigem);
  if (r) own.add(r);
  if (kind === "organizacoes" && (doc as Org).carteira) own.add("parceiros");
  return sorted(own) as Relacao[];
}

/* A person: their own, plus partner if their organisation is one. */
async function refreshPerson(ctx: Writer, c: Contact): Promise<void> {
  const own = await ownRelations(ctx, "contactos", c);
  const org = c.organizacaoId ? await ctx.db.get(c.organizacaoId) : null;
  const all = new Set<string>(own);
  if (org?.relacoes?.includes("parceiros")) all.add("parceiros");
  const relacoes = all.size ? sorted(all) : ["clientes"];
  if (!sameSet(c.relProprias, own) || !sameSet(c.relacoes, relacoes)) await ctx.db.patch(c._id, { relProprias: own, relacoes });
}

/* An organisation: its own and its people's. When whether it is a partner
   changes, its people follow. */
async function refreshOrg(ctx: Writer, o: Org): Promise<void> {
  const own = await ownRelations(ctx, "organizacoes", o);
  const people = await ctx.db.query("contactos").withIndex("by_organizacao", (q) => q.eq("organizacaoId", o._id)).collect();
  const all = new Set<string>(own);
  for (const p of people) for (const r of p.relProprias ?? []) all.add(r);
  const relacoes = all.size ? sorted(all) : ["clientes"];
  const wasPartner = Boolean(o.relacoes?.includes("parceiros"));
  const nPessoas = people.length;
  if (!sameSet(o.relProprias, own) || !sameSet(o.relacoes, relacoes) || o.nPessoas !== nPessoas) await ctx.db.patch(o._id, { relProprias: own, relacoes, nPessoas });
  if (wasPartner !== relacoes.includes("parceiros")) for (const p of people) await refreshPerson(ctx, p);
}

export async function refreshRelations(ctx: Writer, kind: Kind, id: Id<"contactos"> | Id<"organizacoes">): Promise<void> {
  const doc = await ctx.db.get(id);
  if (!doc) return;
  if (kind === "contactos") await refreshPerson(ctx, doc as Contact);
  else await refreshOrg(ctx, doc as Org);
}

/* ─── The list ─────────────────────────────────────────────────────── */

export const CONTACT_SORTS = ["recentes", "reservas", "gasto", "nome"] as const;
export type ContactSort = (typeof CONTACT_SORTS)[number];

export function contactSortKey(d: Contact | Org, sort: ContactSort): number | string | number[] {
  if (sort === "recentes") return d.atualizadoEm;
  if (sort === "reservas") return [d.nReservas ?? 0, d.ultimaReserva ?? 0];
  if (sort === "gasto") return d.gasto ?? 0;
  return normaliseSearch(d.nome);
}

/* Filed under every relation it has and "all"; a person of a drivers'
   company is not under Motoristas (the company is). */
function listEntries(kind: Kind, d: Contact | Org | null): FactEntry[] {
  if (!d) return [];
  const rels = ["all", ...(d.relacoes ?? ["clientes"])].filter((r) => !(kind === "contactos" && r === "motoristas" && (d as Contact).organizacaoId));
  return rels.flatMap((rel) => CONTACT_SORTS.map((sort) => ({ ns: ["ct", kind, rel, sort], key: contactSortKey(d, sort) as never, sum: 0 })));
}

export async function syncContactList(ctx: Writer, kind: Kind, oldDoc: Contact | Org | null, newDoc: Contact | Org | null): Promise<void> {
  const id = (newDoc ?? oldDoc)!._id as string;
  const key = (e: FactEntry) => JSON.stringify(e.ns);
  const before = new Map(listEntries(kind, oldDoc).map((e) => [key(e), e]));
  const after = new Map(listEntries(kind, newDoc).map((e) => [key(e), e]));
  for (const [k, e] of before) {
    const n = after.get(k);
    if (!n) await facts.deleteIfExists(ctx, { namespace: e.ns, key: e.key, id });
    else if (JSON.stringify(n.key) !== JSON.stringify(e.key)) await facts.replaceOrInsert(ctx, { namespace: e.ns, key: e.key, id }, { namespace: n.ns, key: n.key });
  }
  for (const [k, e] of after) if (!before.has(k)) await facts.insertIfDoesNotExist(ctx, { namespace: e.ns, key: e.key, id, sumValue: 0 });
}

/* The values the filter menus offer, and which columns have data, recorded
   the first time they appear. */
export const CONTACT_FACETS = ["segmento", "responsavel", "idioma", "localidade", "etiqueta", "origem", "carteira", "col"] as const;

export async function recordContactFacets(ctx: Writer, kind: string, d: Contact | Org, values: Partial<Record<(typeof CONTACT_FACETS)[number], (string | null | undefined)[]>>) {
  for (const [dim, list] of Object.entries(values)) {
    for (const value of list ?? []) {
      if (!value) continue;
      const seen = await ctx.db
        .query("orderFacetValues")
        .withIndex("by_view_dim", (q) => q.eq("view", kind).eq("dim", dim).eq("value", value))
        .first();
      if (!seen) await ctx.db.insert("orderFacetValues", { view: kind, dim, value });
    }
  }
  void d;
}

export function contactSearchText(kind: Kind, d: Contact | Org, orgName?: string | null): string {
  if (kind === "organizacoes") {
    const o = d as Org;
    return normaliseSearch([o.nome, o.email, o.telefone, o.localidade, o.nif, ...o.etiquetas].filter(Boolean).join(" "));
  }
  const c = d as Contact;
  return normaliseSearch([c.nome, c.email, c.telefone, c.funcao, orgName, ...c.etiquetas].filter(Boolean).join(" "));
}

/* De onde veio, em palavras: a primeira origem guardada no contacto. */
export function rotuloDaOrigem(origem: string | undefined): string | null {
  if (!origem) return null;
  if (origem === "orders") return "Reserva no site";
  if (origem.startsWith("manual")) return "Criado à mão";
  return tituloDaOrigem(origem);
}

/* ─── Triggers ─────────────────────────────────────────────────────── */

const changed = <T,>(a: T | null, b: T | null, keys: (keyof T)[]) => !a || !b || keys.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

export async function onContactChange(ctx: Writer & { innerDb: GenericDatabaseWriter<DataModel> }, oldDoc: Contact | null, newDoc: Contact | null): Promise<void> {
  const c = newDoc;
  const org = c?.organizacaoId ? await ctx.db.get(c.organizacaoId) : null;
  if (c) {
    const procura = contactSearchText("contactos", c, org?.nome);
    if (c.procura !== procura) await ctx.innerDb.patch(c._id, { procura });
  }
  if (changed(oldDoc, newDoc, ["organizacaoId", "primeiraOrigem", "relProprias"])) {
    if (c) await refreshRelations(ctx, "contactos", c._id);
    for (const o of new Set([oldDoc?.organizacaoId, newDoc?.organizacaoId].filter(Boolean) as Id<"organizacoes">[]))
      await refreshRelations(ctx, "organizacoes", o);
  }
  await syncContactList(ctx, "contactos", oldDoc, (c && (await ctx.db.get(c._id))) ?? null);
  if (c)
    await recordContactFacets(ctx, "contactos", c, {
      segmento: [org?.segmento],
      responsavel: [c.responsavel],
      idioma: [c.idioma],
      localidade: [org?.localidade],
      etiqueta: c.etiquetas,
      origem: [rotuloDaOrigem(c.primeiraOrigem)],
      carteira: [org?.carteira?.estado],
    });
  /* Which columns have data, per relation: the list shows only those of the
     relation open (a column for every relation squeezed the name away). */
  if (c) {
    const fresh = (await ctx.db.get(c._id)) ?? c;
    const rels = ["all", ...(fresh.relacoes ?? ["clientes"])].filter((r) => !(r === "motoristas" && (fresh as Contact).organizacaoId));
    const cols = [
        c.email || c.telefone ? "contacto" : null,
        c.nReservas ? "reservas" : null,
        c.gasto ? "gasto" : null,
        c.ultimaReserva ? "ultima" : null,
        c.nPedidos ? "pedidos" : null,
        rotuloDaOrigem(c.primeiraOrigem) ? "origem" : null,
        org?.localidade ? "localidade" : null,
        org?.segmento ? "segmento" : null,
        c.responsavel ? "responsavel" : null,
        org?.carteira?.estado ? "carteira" : null,
        "desde",
      ];
    for (const rel of rels) await recordContactFacets(ctx, `contactos|${rel}`, fresh, { col: cols });
  }
}

export async function onOrgChange(ctx: Writer & { innerDb: GenericDatabaseWriter<DataModel> }, oldDoc: Org | null, newDoc: Org | null): Promise<void> {
  const o = newDoc;
  if (o) {
    const procura = contactSearchText("organizacoes", o);
    if (o.procura !== procura) await ctx.innerDb.patch(o._id, { procura });
  }
  if (o && changed(oldDoc, newDoc, ["carteira", "primeiraOrigem", "relProprias"])) await refreshRelations(ctx, "organizacoes", o._id);
  /* People show the organisation's name, place, segment and portfolio. */
  if (o && oldDoc && changed(oldDoc, newDoc, ["nome", "localidade", "segmento", "carteira"])) {
    for (const p of await ctx.db.query("contactos").withIndex("by_organizacao", (q) => q.eq("organizacaoId", o._id)).collect()) {
      const procura = contactSearchText("contactos", p, o.nome);
      if (p.procura !== procura) await ctx.db.patch(p._id, { procura });
    }
  }
  /* Establishments: the count on the group. */
  for (const g of new Set([oldDoc?.grupoId, newDoc?.grupoId].filter(Boolean) as Id<"organizacoes">[])) {
    if (oldDoc?.grupoId === newDoc?.grupoId) break;
    const grupo = await ctx.db.get(g);
    const n = (await ctx.db.query("organizacoes").withIndex("by_grupo", (q) => q.eq("grupoId", g)).collect()).length;
    if (grupo && grupo.nEstabelecimentos !== n) await ctx.db.patch(g, { nEstabelecimentos: n });
  }
  await syncContactList(ctx, "organizacoes", oldDoc, (o && (await ctx.db.get(o._id))) ?? null);
  if (o)
    await recordContactFacets(ctx, "organizacoes", o, {
      segmento: [o.segmento],
      responsavel: [o.responsavel],
      idioma: [o.idioma],
      localidade: [o.localidade],
      etiqueta: o.etiquetas,
      carteira: [o.carteira?.estado],
    });
  /* Which columns have data, per relation: the list shows only those of the
     relation open (a column for every relation squeezed the name away). */
  if (o) {
    const fresh = (await ctx.db.get(o._id)) ?? o;
    const rels = ["all", ...(fresh.relacoes ?? ["clientes"])];
    const cols = [
        o.email || o.telefone ? "contacto" : null,
        o.nPessoas ? "pessoas" : null,
        o.carteira?.partnershipId ? "vendas" : null,
        o.nReservas ? "reservas" : null,
        o.gasto ? "gasto" : null,
        o.ultimaReserva ? "ultima" : null,
        o.nPedidos ? "pedidos" : null,
        o.localidade ? "localidade" : null,
        o.segmento ? "segmento" : null,
        o.responsavel ? "responsavel" : null,
        o.carteira?.estado ? "carteira" : null,
        "desde",
      ];
    for (const rel of rels) await recordContactFacets(ctx, `organizacoes|${rel}`, fresh, { col: cols });
  }
}

export async function onCardChange(ctx: Writer, oldDoc: Doc<"negocios"> | null, newDoc: Doc<"negocios"> | null): Promise<void> {
  for (const id of new Set([oldDoc?.contactoId, newDoc?.contactoId].filter(Boolean) as Id<"contactos">[])) {
    await refreshNumbers(ctx, "contactos", id);
    await refreshRelations(ctx, "contactos", id);
  }
  for (const id of new Set([oldDoc?.organizacaoId, newDoc?.organizacaoId].filter(Boolean) as Id<"organizacoes">[])) {
    await refreshNumbers(ctx, "organizacoes", id);
    await refreshRelations(ctx, "organizacoes", id);
  }
}

/* After an order's facts: the numbers of its client and organisation, old
   and new (and the other leg's, whose round trip may have changed). */
export async function onOrderForContacts(ctx: Writer, orders: (Doc<"orders"> | null)[]): Promise<void> {
  for (const id of new Set(orders.map((o) => o?.contactoId).filter(Boolean) as Id<"contactos">[])) await refreshNumbers(ctx, "contactos", id);
  for (const id of new Set(orders.map((o) => o?.organizacaoId).filter(Boolean) as Id<"organizacoes">[])) await refreshNumbers(ctx, "organizacoes", id);
}
