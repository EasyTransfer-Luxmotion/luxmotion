import { ConvexError, v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAdmin, lerAcesso, temCapacidade } from "./lib/admin";
import { acertarCartaoDaOrigem } from "./lib/funilEstado";
import { safeStorageDelete } from "./lib/storage";
import { enfileirarLead } from "./lib/pipedriveFila";
import { avisarPedido } from "./lib/avisoPedido";
import {
  DOCUMENTOS,
  configAvaliacao,
  documentosPorValidar,
  estadoDaDocumentacao,
  pontuacao,
  recomendacao,
  type ConfigAvaliacao,
  type Tabela,
} from "./lib/avaliacao";

/*
 * Operação → Candidaturas no dashboard (E4): motoristas e parceiros (empresas
 * de transporte) que se candidatam pelo site.
 *
 * Os estados são os das duas tabelas — recebida, em análise, aprovada,
 * recusada — e juntam-se nos mesmos três grupos dos Pedidos. Aprovar não cria
 * motorista nem parceiro: o plano pede que isso seja uma ação explícita
 * (PED-08/09), e continua a fazer-se à parte.
 *
 * Os documentos (carta TVDE, seguro, comprovativos de morada e bancários, o
 * vídeo) ficam no storage do Convex e não no Bunny, porque a CDN é pública.
 * Apagar uma candidatura apaga-os também: o remove antigo só apagava a linha e
 * deixava as cartas de condução e os IBAN de quem já não estava em lado
 * nenhum do back-office.
 */

const vTipo = v.union(v.literal("motoristas"), v.literal("parceiros"));
type Tipo = typeof vTipo.type;
type Grupo = "porTratar" | "emCurso" | "fechados";
const ESTADOS = ["submitted", "reviewing", "approved", "rejected"] as const;
const vEstado = v.union(v.literal("submitted"), v.literal("reviewing"), v.literal("approved"), v.literal("rejected"));
const TABELA = { motoristas: "driverApplications", parceiros: "partnerApplications" } as const;

function grupoDe(estado: string): Grupo {
  return estado === "submitted" ? "porTratar" : estado === "reviewing" ? "emCurso" : "fechados";
}

/* Os nomes que o formulário do site mostra (messages/pt.json do site). */
const ZONAS: Record<string, string> = {
  lisboa: "Lisboa", porto: "Porto", algarve: "Algarve", madeira: "Madeira", acores: "Açores", coimbra: "Coimbra",
  braga: "Braga", aveiro: "Aveiro", evora: "Évora", setubal: "Setúbal", beja: "Beja", braganca: "Bragança",
  "castelo-branco": "Castelo Branco", faro: "Faro", guarda: "Guarda", leiria: "Leiria", portalegre: "Portalegre",
  santarem: "Santarém", "viana-do-castelo": "Viana do Castelo", "vila-real": "Vila Real", viseu: "Viseu",
};
const CATEGORIAS: Record<string, string> = {
  classic: "Classic", supercar: "Supercarro", firstClass: "First Class", businessClass: "Business Class", van: "Van",
  firstClassVan: "First Class Van", vanLuxury: "Van Luxury", minibus: "Minibus", autocarro: "Autocarro",
};
/* Exportada: os cartões do quadro das Candidaturas filtram pela zona (funis.ts). */
export const zona = (z: string) => ZONAS[z] ?? z;
const categoria = (c: string) => CATEGORIAS[c] ?? c;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function linhaDe(tipo: Tipo, d: Doc<"driverApplications"> | Doc<"partnerApplications">) {
  if (tipo === "motoristas") {
    const x = d as Doc<"driverApplications">;
    return {
      nome: x.fullName,
      empresa: null,
      email: x.email,
      telefone: x.phone || x.whatsapp || null,
      linha: [zona(x.operatingZone), categoria(x.vehicleCategory), [x.vehicleBrand, x.vehicleModel].filter(Boolean).join(" "), x.vehicleYear]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const x = d as Doc<"partnerApplications">;
  return {
    nome: x.representativeFullName,
    empresa: x.companyName || null,
    email: x.representativeEmail,
    telefone: x.representativePhone || x.representativeWhatsapp || null,
    linha: [
      x.operatingZones.map(zona).join(", "),
      x.drivers.length ? plural(x.drivers.length, "motorista", "motoristas") : null,
      x.vehicles.length ? plural(x.vehicles.length, "viatura", "viaturas") : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

async function lerTodas(ctx: QueryCtx) {
  /* 13 candidaturas em produção a 2026-11-15: lê-se tudo. */
  const [motoristas, parceiros] = await Promise.all([
    ctx.db.query("driverApplications").collect(),
    ctx.db.query("partnerApplications").collect(),
  ]);
  const linhas = (tipo: Tipo, docs: (Doc<"driverApplications"> | Doc<"partnerApplications">)[]) =>
    docs.map((d) => ({
      tipo,
      id: d._id as string,
      estado: d.status as string,
      grupo: grupoDe(d.status),
      recebido: d.createdAt,
      ...linhaDe(tipo, d),
    }));
  return [...linhas("motoristas", motoristas), ...linhas("parceiros", parceiros)];
}

const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const lista = query({
  args: {
    tipo: v.union(vTipo, v.literal("todos")),
    grupo: v.union(v.literal("porTratar"), v.literal("emCurso"), v.literal("fechados"), v.literal("todos")),
    pesquisa: v.optional(v.string()),
    pagina: v.number(),
    porPagina: v.number(),
  },
  handler: async (ctx, a) => {
    await exigirAdmin(ctx, "candidaturas", "ver");
    const todas = await lerTodas(ctx);
    const porTipo = {
      motoristas: todas.filter((x) => x.tipo === "motoristas" && x.grupo === "porTratar").length,
      parceiros: todas.filter((x) => x.tipo === "parceiros" && x.grupo === "porTratar").length,
    };
    const doTipo = a.tipo === "todos" ? todas : todas.filter((x) => x.tipo === a.tipo);
    const porGrupo = {
      porTratar: doTipo.filter((x) => x.grupo === "porTratar").length,
      emCurso: doTipo.filter((x) => x.grupo === "emCurso").length,
      fechados: doTipo.filter((x) => x.grupo === "fechados").length,
      todos: doTipo.length,
    };
    const q = semAcentos(a.pesquisa?.trim() ?? "");
    const filtradas = doTipo
      .filter((x) => a.grupo === "todos" || x.grupo === a.grupo)
      .filter((x) => !q || [x.nome, x.empresa, x.email, x.telefone, x.linha].some((c) => c && semAcentos(c).includes(q)))
      .sort((x, y) => y.recebido - x.recebido);
    const porPagina = Math.max(1, Math.min(100, Math.floor(a.porPagina)));
    const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
    const pagina = Math.min(Math.max(0, Math.floor(a.pagina)), paginas - 1);
    return {
      linhas: filtradas.slice(pagina * porPagina, (pagina + 1) * porPagina),
      total: filtradas.length,
      pagina,
      paginas,
      porPagina,
      porTipo,
      porGrupo,
    };
  },
});

/* Todos os ficheiros de uma candidatura, com o nome com que se mostram. */
function ficheiros(tipo: Tipo, d: Doc<"driverApplications"> | Doc<"partnerApplications">) {
  const lista: { chave: string; rotulo: string; id: Id<"_storage">; grupo: "fotos" | "documentos" | "video" }[] = [];
  const um = (chave: string, rotulo: string, id: Id<"_storage"> | undefined, grupo: "fotos" | "documentos" | "video" = "documentos") => {
    if (id) lista.push({ chave, rotulo, id, grupo });
  };
  if (tipo === "motoristas") {
    const x = d as Doc<"driverApplications">;
    um("professionalPhotoId", "Fotografia profissional", x.professionalPhotoId, "fotos");
    x.vehicleExteriorPhotoIds.forEach((id, i) => um(`exterior${i}`, `Exterior ${i + 1}`, id, "fotos"));
    x.vehicleInteriorPhotoIds.forEach((id, i) => um(`interior${i}`, `Interior ${i + 1}`, id, "fotos"));
    um("professionalLicenseId", "Carta profissional TVDE", x.professionalLicenseId);
    um("vehicleInsuranceId", "Seguro do veículo", x.vehicleInsuranceId);
    um("proofOfAddressId", "Comprovativo de morada", x.proofOfAddressId);
    um("billingBankProofId", "Comprovativo bancário", x.billingBankProofId);
    um("introVideoId", "Vídeo de apresentação", x.introVideoId, "video");
  } else {
    const x = d as Doc<"partnerApplications">;
    um("documentLicenseId", "Alvará / licença", x.documentLicenseId);
    um("documentAddressProofPrimaryId", "Comprovativo de morada", x.documentAddressProofPrimaryId);
    um("documentAddressProofSecondaryId", "Comprovativo de morada (2)", x.documentAddressProofSecondaryId);
    um("documentLiabilityInsuranceId", "Seguro de responsabilidade civil", x.documentLiabilityInsuranceId);
    um("billingBankProofId", "Comprovativo bancário", x.billingBankProofId);
  }
  return lista;
}

export const detalhe = query({
  args: { tipo: vTipo, id: v.string() },
  handler: async (ctx, { tipo, id }) => {
    await exigirAdmin(ctx, "candidaturas", "ver");
    /* Os documentos e os dados bancários só para quem o cargo deixa
       (capacidade "documentos"): cartas de condução, seguros, comprovativos
       bancários e o IBAN são o que mais estraga se sair do sítio. Sem ela, a
       lista diz que existem mas não os abre. */
    const veDocumentos = temCapacidade(await lerAcesso(ctx), "documentos");
    const nid = ctx.db.normalizeId(TABELA[tipo], id);
    const d = nid ? ((await ctx.db.get(nid)) as Doc<"driverApplications"> | Doc<"partnerApplications"> | null) : null;
    if (!d) return null;
    /* URLs do storage do Convex: não se adivinham, mas quem tiver o link abre
       o ficheiro. Só chegam aqui depois do exigirAdmin. */
    const arquivos = await Promise.all(
      ficheiros(tipo, d).map(async (f) => {
        const meta = await ctx.db.system.get(f.id);
        const bloqueado = f.grupo === "documentos" && !veDocumentos;
        return {
          chave: f.chave,
          rotulo: f.rotulo,
          grupo: f.grupo,
          url: bloqueado ? null : await ctx.storage.getUrl(f.id),
          bloqueado,
          tipoFicheiro: meta?.contentType ?? null,
          tamanho: meta?.size ?? null,
        };
      }),
    );
    const { _id, _creationTime, ...completo } = d;
    void _creationTime;
    const resto = veDocumentos
      ? completo
      : { ...completo, billingIban: completo.billingIban ? "•••• (sem acesso)" : completo.billingIban };
    return {
      tipo,
      id: _id as string,
      estado: d.status as string,
      grupo: grupoDe(d.status),
      estados: ESTADOS,
      doc: resto,
      arquivos,
      veDocumentos,
      zonas: tipo === "motoristas" ? [zona((d as Doc<"driverApplications">).operatingZone)] : (d as Doc<"partnerApplications">).operatingZones.map(zona),
    };
  },
});

export const mudarEstado = mutation({
  args: { tipo: vTipo, id: v.string(), estado: vEstado },
  handler: async (ctx, { tipo, id, estado }) => {
    const quem = await exigirAdmin(ctx, "candidaturas");
    const nid = ctx.db.normalizeId(TABELA[tipo], id);
    if (!nid || !(await ctx.db.get(nid))) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta candidatura já não existe." });
    if (estado === "approved") await exigirDocumentosValidados(ctx, TABELA[tipo], id);
    await ctx.db.patch(nid, { status: estado, reviewedAt: Date.now() });
    /* O cartão no quadro das Candidaturas acompanha (lib/funilEstado.ts). */
    await acertarCartaoDaOrigem(ctx, TABELA[tipo], id, estado, quem.email ?? "");
    return { estado, grupo: grupoDe(estado) };
  },
});

export const notas = mutation({
  args: { tipo: vTipo, id: v.string(), notas: v.string() },
  handler: async (ctx, { tipo, id, notas }) => {
    await exigirAdmin(ctx, "candidaturas");
    const nid = ctx.db.normalizeId(TABELA[tipo], id);
    if (!nid || !(await ctx.db.get(nid))) throw new ConvexError({ tipo: "naoExiste", mensagem: "Esta candidatura já não existe." });
    if (notas.length > 5000) throw new ConvexError({ tipo: "invalido", mensagem: "Notas compridas de mais (máximo 5000 caracteres)." });
    await ctx.db.patch(nid, { internalNotes: notas.trim() || undefined });
  },
});

/*
 * Apaga a candidatura e os documentos dela. Os ficheiros de uma candidatura
 * são carregados só para ela (generateUploadUrl do próprio formulário) e não
 * são partilhados com nada — ao contrário das imagens do catálogo, aqui não
 * há risco de levar o ficheiro de outro registo.
 */
export const remover = mutation({
  args: { tipo: vTipo, id: v.string() },
  handler: async (ctx, { tipo, id }) => {
    await exigirAdmin(ctx, "candidaturas", "editar", "apagar");
    const nid = ctx.db.normalizeId(TABELA[tipo], id);
    const d = nid ? ((await ctx.db.get(nid)) as Doc<"driverApplications"> | Doc<"partnerApplications"> | null) : null;
    if (!nid || !d) return { documentos: 0 };
    const docs = ficheiros(tipo, d);
    for (const f of docs) await safeStorageDelete(ctx, f.id);
    await ctx.db.delete(nid);
    return { documentos: docs.length };
  },
});

/* ───────────────────────── Avaliação (dashboard spec v1.0, 5) ───────────── */

async function lerAvaliacao(ctx: QueryCtx, tabela: Tabela, id: string) {
  return await ctx.db
    .query("avaliacoesCandidatura")
    .withIndex("by_candidatura", (q) => q.eq("tabela", tabela).eq("candidaturaId", id))
    .first();
}

async function configDaAvaliacao(ctx: QueryCtx): Promise<ConfigAvaliacao> {
  const s = await ctx.db.query("siteSettings").withIndex("by_key", (q) => q.eq("key", "global")).first();
  return configAvaliacao(s?.avaliacaoCandidaturas);
}

/* Approving is manual, and only with every required document validated:
   the score helps, the documents decide (spec 5.5). Used by the board's
   move to «Ativo» and by the application's own status buttons. */
export async function exigirDocumentosValidados(ctx: QueryCtx, tabela: Tabela, id: string) {
  const av = await lerAvaliacao(ctx, tabela, id);
  const falta = documentosPorValidar(tabela, av?.documentos);
  if (falta.length) {
    throw new ConvexError(`Falta validar: ${falta.join(", ")}. Valide os documentos na ficha antes de aprovar.`);
  }
}

/* The evaluation of one application: its documents with their state, the
   score per criterion, the overall and the recommendation. */
export const avaliacao = query({
  args: { tipo: vTipo, id: v.string() },
  handler: async (ctx, { tipo, id }) => {
    await exigirAdmin(ctx, "candidaturas", "ver");
    const tabela = TABELA[tipo];
    const nid = ctx.db.normalizeId(tabela, id);
    const app = nid ? await ctx.db.get(nid) : null;
    if (!app) return null;
    const av = await lerAvaliacao(ctx, tabela, id);
    const cfg = await configDaAvaliacao(ctx);
    const estados = new Map((av?.documentos ?? []).map((d) => [d.chave, d]));
    const nota = pontuacao(cfg, av?.notas ?? []);
    return {
      documentos: DOCUMENTOS[tabela].map((d) => ({
        chave: d.chave,
        titulo: d.titulo,
        obrigatorio: d.obrigatorio,
        recebido: Boolean((app as Record<string, unknown>)[d.chave]),
        estado: estados.get(d.chave)?.estado ?? null,
        por: estados.get(d.chave)?.por ?? null,
        em: estados.get(d.chave)?.em ?? null,
      })),
      documentacao: estadoDaDocumentacao(tabela, app as Record<string, unknown>, av?.documentos),
      criterios: cfg.criterios.map((c) => ({ ...c, nota: av?.notas.find((n) => n.chave === c.chave)?.nota ?? null })),
      pontuacao: nota,
      recomendacao: recomendacao(cfg, nota),
      limites: { aprovar: cfg.limiteAprovar, rever: cfg.limiteRever },
    };
  },
});

async function gravarAvaliacao(
  ctx: MutationCtx,
  tabela: Tabela,
  id: string,
  por: string,
  mudar: (a: { documentos: Doc<"avaliacoesCandidatura">["documentos"]; notas: Doc<"avaliacoesCandidatura">["notas"] }) => void,
) {
  const nid = ctx.db.normalizeId(tabela, id);
  if (!nid || !(await ctx.db.get(nid))) throw new ConvexError("Esta candidatura já não existe.");
  const atual = await lerAvaliacao(ctx, tabela, id);
  const dados = { documentos: [...(atual?.documentos ?? [])], notas: [...(atual?.notas ?? [])] };
  mudar(dados);
  const agora = Date.now();
  if (atual) await ctx.db.patch(atual._id, { ...dados, atualizadoEm: agora, por });
  else await ctx.db.insert("avaliacoesCandidatura", { tabela, candidaturaId: id, ...dados, atualizadoEm: agora, por });
}

/* A document's state. Seeing documents needs «documentos»; so does judging them. */
export const validarDocumento = mutation({
  args: {
    tipo: vTipo,
    id: v.string(),
    chave: v.string(),
    estado: v.union(v.literal("recebido"), v.literal("validado"), v.literal("recusado")),
  },
  handler: async (ctx, { tipo, id, chave, estado }) => {
    const quem = await exigirAdmin(ctx, "candidaturas", "editar", "documentos");
    const tabela = TABELA[tipo];
    if (!DOCUMENTOS[tabela].some((d) => d.chave === chave)) throw new ConvexError("Esse documento não existe nesta candidatura.");
    await gravarAvaliacao(ctx, tabela, id, quem.email ?? "", (a) => {
      a.documentos = [...a.documentos.filter((d) => d.chave !== chave), { chave, estado, por: quem.email ?? undefined, em: Date.now() }];
    });
  },
});

/* A criterion's score, 0–100; null clears it. */
export const pontuar = mutation({
  args: { tipo: vTipo, id: v.string(), chave: v.string(), nota: v.union(v.number(), v.null()) },
  handler: async (ctx, { tipo, id, chave, nota }) => {
    const quem = await exigirAdmin(ctx, "candidaturas");
    if (nota !== null && (!Number.isFinite(nota) || nota < 0 || nota > 100)) throw new ConvexError("Uma pontuação de 0 a 100.");
    await gravarAvaliacao(ctx, TABELA[tipo], id, quem.email ?? "", (a) => {
      a.notas = a.notas.filter((n) => n.chave !== chave);
      if (nota !== null) a.notas.push({ chave, nota: Math.round(nota) });
    });
  },
});

/*
 * An application registered by hand (spec 5.2: «site ou registo manual»): the
 * same table and the same path as the site's (funnel card, Contactos, the
 * bell), with only what the team knows. The form's required fields that a
 * phone call doesn't give stay empty.
 */
export const criarManual = mutation({
  args: {
    tipo: vTipo,
    nome: v.string(),
    empresa: v.optional(v.string()),
    email: v.optional(v.string()),
    telefone: v.optional(v.string()),
    zona: v.optional(v.string()),
    categoria: v.optional(v.string()),
    notas: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const quem = await exigirAdmin(ctx, "candidaturas");
    const nome = a.nome.trim();
    if (!nome) throw new ConvexError("Diga o nome de quem se candidata.");
    if (a.tipo === "parceiros" && !a.empresa?.trim()) throw new ConvexError("Diga o nome da empresa.");
    const email = a.email?.trim() ?? "";
    const telefone = a.telefone?.trim() ?? "";
    if (!email && !telefone) throw new ConvexError("Indique um email ou um telefone.");
    const tabela = TABELA[a.tipo];
    const ultimo = await ctx.db.query(tabela).order("desc").first();
    const base = {
      status: "submitted" as const,
      queuePosition: (ultimo?.queuePosition ?? 0) + 1,
      createdAt: Date.now(),
      termsAccepted: false,
      origem: "manual" as const,
      internalNotes: [a.notas?.trim(), `Registada à mão por ${quem.email ?? "?"}.`].filter(Boolean).join("\n"),
      billingAccountHolder: "",
      billingInvoiceName: "",
      billingSwiftBic: "",
      billingIban: "",
      billingTaxOffice: "",
      billingAddress: "",
    };
    let id: string;
    if (a.tipo === "motoristas") {
      id = await ctx.db.insert("driverApplications", {
        ...base,
        operatingZone: a.zona?.trim() ?? "",
        fullName: nome,
        email,
        representativeEmail: email,
        phone: telefone,
        whatsapp: telefone,
        languages: [],
        referral: "manual",
        vehicleCategory: a.categoria?.trim() ?? "",
        vehicleBrand: "",
        vehicleModel: "",
        vehiclePlate: "",
        vehicleColor: "",
        vehicleYear: "",
        vehicleOwnership: "",
        vehiclePassengerCapacity: "",
        vehicleLuggageCapacity: "",
        vehicleTvdeLicensed: "",
        vehicleInteriorPhotoIds: [],
        vehicleExteriorPhotoIds: [],
        childSeatBaby: 0,
        childSeatChild: 0,
        childSeatBooster: 0,
        surfboardRack: false,
        amenities: [],
        billingNif: "",
        availabilityDays: [],
        availabilityShifts: [],
      });
    } else {
      id = await ctx.db.insert("partnerApplications", {
        ...base,
        operatingZones: a.zona?.trim() ? [a.zona.trim()] : [],
        driverCount: "",
        driversComfortableWithMobile: "no",
        companyName: a.empresa!.trim(),
        representativeFullName: nome,
        representativeEmail: email,
        representativePhone: telefone,
        representativeWhatsapp: telefone,
        drivers: [],
        vehicles: a.categoria?.trim() ? [{ make: "", model: "", licensePlate: "", category: a.categoria.trim() }] : [],
        billingTaxId: "",
        priceAgreementAcknowledged: false,
      });
    }
    await enfileirarLead(ctx, tabela, id);
    await avisarPedido(ctx, tabela, id);
    return id;
  },
});
