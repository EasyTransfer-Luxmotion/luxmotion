/**
 * As leads do site no Pipedrive.
 *
 * Cada formulário cria (ou reaproveita) uma Pessoa pelo email e abre um Negócio
 * na primeira etapa do funil, com uma Nota a levar o detalhe do pedido. Uma
 * reserva paga entra como negócio já ganho.
 *
 * A chave vive **só** na variável de ambiente `PIPEDRIVE_API_TOKEN`, posta com
 * `npx convex env set` — nunca em ficheiro, nunca em commit. E vai no cabeçalho
 * `x-api-token`, nunca em `?api_token=`: o Convex regista o URL completo de cada
 * pedido, e no querystring a chave ficava escrita nos logs.
 *
 * Se a variável não estiver definida, isto avisa uma vez e sai limpo. Nenhum
 * formulário do site pode partir porque o CRM ainda não está configurado.
 */

import { v } from "convex/values";
import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mapearContactSubmission,
  mapearContactQuote,
  mapearTourInquiry,
  mapearWeddingQuote,
  mapearSchoolQuote,
  mapearCorporateRequest,
  mapearPartnerLead,
  mapearNewsletter,
  mapearPartnerApplication,
  mapearDriverApplication,
  mapearReservaPaga,
  comOrigem,
  type LeadPipedrive,
} from "./lib/pipedriveMapa";

/** As dez tabelas de formulário. Ver `lib/pipedriveMapa.ts`. */
export const tabelaLead = v.union(
  v.literal("contactSubmissions"),
  v.literal("contactQuotes"),
  v.literal("tourInquiries"),
  v.literal("weddingQuoteSubmissions"),
  v.literal("schoolQuoteSubmissions"),
  v.literal("corporateRequests"),
  v.literal("partnerLeads"),
  v.literal("newsletterSubscriptions"),
  v.literal("partnerApplications"),
  v.literal("driverApplications"),
);

/**
 * O instante como o Pipedrive o quer: RFC 3339 sem milissegundos.
 *
 * `toISOString()` devolve "2026-09-01T21:03:34.461Z", e a v2 recusa-o com
 * "won_time: This value is not a valid datetime" — um 400 que deitou fora
 * quinze reservas pagas antes de alguém reparar. A única diferença para o
 * exemplo da documentação são os três dígitos dos milissegundos.
 */
function instantePipedrive(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const MAX_TENTATIVAS = 5;
/** Um 429 não é uma avaria; tem orçamento próprio para não gastar as de cima. */
const MAX_LIMITES = 8;

const BASE = process.env.PIPEDRIVE_BASE_URL ?? "https://api.pipedrive.com";

/* Opcionais: sem eles, o Pipedrive usa o funil por omissão e a sua primeira
   etapa. Definem-se com `npx convex env set PIPEDRIVE_PIPELINE_ID <n>`. */
const PIPELINE_ID = process.env.PIPEDRIVE_PIPELINE_ID ? Number(process.env.PIPEDRIVE_PIPELINE_ID) : null;
const STAGE_ID = process.env.PIPEDRIVE_STAGE_ID ? Number(process.env.PIPEDRIVE_STAGE_ID) : null;

// ---------------------------------------------------------------------------
// A camada HTTP

type Resposta =
  | { ok: true; dados: any }
  | { ok: false; erro: string; repetir: boolean; limite?: boolean; esperaMs?: number; estado?: number };

/**
 * Classificar antes de decidir repetir.
 *
 * O `if (!res.ok) retry` do `webhooks.ts` está certo para um webhook mudo, mas
 * aqui seriam cinco recusas idênticas a um 400 — e cinco custos de API. Uma
 * chave inválida ou um payload malformado não melhoram por insistência.
 */
async function pedir(
  token: string,
  metodo: "GET" | "POST",
  caminho: string,
  corpo?: unknown,
): Promise<Resposta> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: {
        "x-api-token": token,
        "Content-Type": "application/json",
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch (e) {
    // Rede, DNS ou timeout: pode ter chegado ao servidor. É por isto que os ids
    // de cada passo são guardados assim que se conhecem.
    return { ok: false, erro: `rede: ${String(e)}`, repetir: true };
  }

  if (res.ok) {
    const dados = await res.json().catch(() => ({}));
    return { ok: true, dados };
  }

  /* O corpo da RESPOSTA — nunca o do pedido, que é justamente o que a lista
     branca existe para não deixar sair. É o único sítio que diz o porquê. */
  const detalhe = (await res.text().catch(() => "")).slice(0, 500);
  const erro = `${res.status} ${res.statusText} ${detalhe}`;

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 0);
    return {
      ok: false,
      erro,
      repetir: true,
      limite: true,
      esperaMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      estado: 429,
    };
  }

  /* 5xx: avaria do lado deles, vale a pena voltar. 4xx: é connosco, insistir
     não muda nada — excepto o 404, que aqui quer quase sempre dizer que a
     pessoa guardada em `pipedriveSync` foi apagada no Pipedrive. Nesse caso o
     `tratarFalha` limpa o `personId` e a tentativa seguinte volta a criá-la. */
  return {
    ok: false,
    erro,
    repetir: res.status >= 500 || res.status === 404,
    estado: res.status,
  };
}

async function procurarPessoa(token: string, email: string): Promise<Resposta> {
  const termo = encodeURIComponent(email);
  return pedir(token, "GET", `/api/v2/persons/search?term=${termo}&fields=email&exact_match=true&limit=1`);
}

async function procurarOrganizacao(token: string, nome: string): Promise<Resposta> {
  const termo = encodeURIComponent(nome);
  return pedir(token, "GET", `/api/v2/organizations/search?term=${termo}&fields=name&exact_match=true&limit=1`);
}

/** O primeiro resultado de uma pesquisa v2, ou null. */
function primeiroId(dados: any): number | null {
  const item = dados?.data?.items?.[0]?.item;
  return typeof item?.id === "number" ? item.id : null;
}

// ---------------------------------------------------------------------------
// A linha de sincronização

export const lerEstado = internalQuery({
  args: { origem: v.string(), origemId: v.string() },
  handler: async (ctx, args): Promise<Doc<"pipedriveSync"> | null> => {
    return await ctx.db
      .query("pipedriveSync")
      .withIndex("by_origem", (q) => q.eq("origem", args.origem).eq("origemId", args.origemId))
      .first();
  },
});

/**
 * O que aconteceu a cada envio, para se ler sem entrar no painel:
 *
 *   npx convex run internal.pipedrive.diagnostico '{}'
 *
 * Quando uma lead não aparece no Pipedrive, é aqui que está o porquê — o
 * `erro` traz o corpo da resposta que eles devolveram, que é o único sítio
 * onde vem escrito o motivo.
 */
export const diagnostico = internalQuery({
  args: { limite: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const linhas = await ctx.db.query("pipedriveSync").order("desc").take(args.limite ?? 20);
    return linhas.map((l) => ({
      origem: l.origem,
      origemId: l.origemId,
      estado: l.estado,
      tentativas: l.tentativas,
      personId: l.personId,
      organizationId: l.organizationId,
      leadId: l.leadId,
      dealId: l.dealId,
      noteId: l.noteId,
      erro: l.ultimoErro,
      quando: new Date(l.criadoEm).toISOString(),
    }));
  },
});

export const marcar = internalMutation({
  args: {
    origem: v.string(),
    origemId: v.string(),
    personId: v.optional(v.number()),
    organizationId: v.optional(v.number()),
    leadId: v.optional(v.string()),
    dealId: v.optional(v.number()),
    noteId: v.optional(v.number()),
    estado: v.optional(
      v.union(v.literal("pendente"), v.literal("concluido"), v.literal("falhado")),
    ),
    tentativas: v.optional(v.number()),
    ultimoErro: v.optional(v.string()),
    /* Apagar o `personId` guardado quando o Pipedrive responde 404: a pessoa
       foi removida de lá e tem de ser criada outra vez. */
    esquecerPessoa: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    const atual = await ctx.db
      .query("pipedriveSync")
      .withIndex("by_origem", (q) => q.eq("origem", args.origem).eq("origemId", args.origemId))
      .first();

    const campos = {
      personId: args.esquecerPessoa ? undefined : (args.personId ?? atual?.personId),
      organizationId: args.organizationId ?? atual?.organizationId,
      leadId: args.leadId ?? atual?.leadId,
      dealId: args.dealId ?? atual?.dealId,
      noteId: args.noteId ?? atual?.noteId,
      estado: args.estado ?? atual?.estado ?? ("pendente" as const),
      tentativas: args.tentativas ?? atual?.tentativas ?? 0,
      ultimoErro: args.ultimoErro,
      atualizadoEm: Date.now(),
    };

    if (atual) {
      await ctx.db.patch(atual._id, campos);
    } else {
      await ctx.db.insert("pipedriveSync", {
        origem: args.origem,
        origemId: args.origemId,
        criadoEm: Date.now(),
        ...campos,
      });
    }
  },
});

/**
 * Põe uma reserva paga na fila, uma vez só.
 *
 * O equivalente dos formulários é a função `lib/pipedriveFila.ts`, que corre
 * dentro da mutation do formulário. Aqui tem de ser uma mutation porque quem
 * chama é o `sendOrderPayload`, que é uma action.
 *
 * O `false` é o que impede uma re-entrega do Stripe de criar um segundo negócio
 * ganho: o `payments.updatePaymentStatus` não tem guarda de "já estava pago" e
 * volta a correr a cadeia toda.
 */
export const enfileirarReserva = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<boolean> => {
    const jaExiste = await ctx.db
      .query("pipedriveSync")
      .withIndex("by_origem", (q) => q.eq("origem", "orders").eq("origemId", args.orderId))
      .first();
    if (jaExiste) return false;

    const agora = Date.now();
    await ctx.db.insert("pipedriveSync", {
      origem: "orders",
      origemId: args.orderId,
      estado: "pendente",
      tentativas: 0,
      criadoEm: agora,
      atualizadoEm: agora,
    });
    await ctx.scheduler.runAfter(0, internal.pipedrive.enviarReservaPaga, { orderId: args.orderId });
    return true;
  },
});

// ---------------------------------------------------------------------------
// O mapeamento — dentro da query, de propósito

/**
 * Lê o registo e devolve **só** o que vai para o CRM.
 *
 * O `switch` estreita `args.tabela` a um literal em cada ramo, e por isso o
 * `normalizeId` devolve um `Id<T>` concreto e o `get` um `Doc<T>` — sem união
 * de dez documentos e sem um único `as`. É boilerplate, e é de propósito: um
 * cast aqui seria exactamente onde um erro de lista branca se esconderia.
 */
export const mapearLead = internalQuery({
  args: { tabela: tabelaLead, id: v.string() },
  handler: async (ctx, args): Promise<LeadPipedrive | null> => {
    switch (args.tabela) {
      case "contactSubmissions": {
        const id = ctx.db.normalizeId(args.tabela, args.id);
        const doc = id && (await ctx.db.get(id));
        return doc ? comOrigem(mapearContactSubmission(doc), args.tabela) : null;
      }
      case "contactQuotes": {
        const id = ctx.db.normalizeId(args.tabela, args.id);
        const doc = id && (await ctx.db.get(id));
        return doc ? comOrigem(mapearContactQuote(doc), args.tabela) : null;
      }
      case "tourInquiries": {
        const id = ctx.db.normalizeId(args.tabela, args.id);
        const doc = id && (await ctx.db.get(id));
        return doc ? comOrigem(mapearTourInquiry(doc), args.tabela) : null;
      }
      case "weddingQuoteSubmissions": {
        const id = ctx.db.normalizeId(args.tabela, args.id);
        const doc = id && (await ctx.db.get(id));
        return doc ? comOrigem(mapearWeddingQuote(doc), args.tabela) : null;
      }
      case "schoolQuoteSubmissions": {
        const id = ctx.db.normalizeId(args.tabela, args.id);
        const doc = id && (await ctx.db.get(id));
        return doc ? comOrigem(mapearSchoolQuote(doc), args.tabela) : null;
      }
      case "corporateRequests": {
        const id = ctx.db.normalizeId(args.tabela, args.id);
        const doc = id && (await ctx.db.get(id));
        return doc ? comOrigem(mapearCorporateRequest(doc), args.tabela) : null;
      }
      case "partnerLeads": {
        const id = ctx.db.normalizeId(args.tabela, args.id);
        const doc = id && (await ctx.db.get(id));
        return doc ? comOrigem(mapearPartnerLead(doc), args.tabela) : null;
      }
      case "newsletterSubscriptions": {
        const id = ctx.db.normalizeId(args.tabela, args.id);
        const doc = id && (await ctx.db.get(id));
        return doc ? comOrigem(mapearNewsletter(doc), args.tabela) : null;
      }
      case "partnerApplications": {
        const id = ctx.db.normalizeId(args.tabela, args.id);
        const doc = id && (await ctx.db.get(id));
        return doc ? comOrigem(mapearPartnerApplication(doc), args.tabela) : null;
      }
      case "driverApplications": {
        const id = ctx.db.normalizeId(args.tabela, args.id);
        const doc = id && (await ctx.db.get(id));
        return doc ? comOrigem(mapearDriverApplication(doc), args.tabela) : null;
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Falhas: repetir, esperar, ou desistir com barulho

type Retoma =
  | { tipo: "lead"; tabela: typeof tabelaLead.type; id: string }
  | { tipo: "reserva"; orderId: Id<"orders"> };

async function tratarFalha(
  ctx: { scheduler: { runAfter: (ms: number, fn: any, args: any) => Promise<any> }; runMutation: any },
  p: {
    origem: string;
    origemId: string;
    tentativa: number;
    limites: number;
    resposta: Extract<Resposta, { ok: false }>;
    retoma: Retoma;
    passo: string;
  },
): Promise<void> {
  const { resposta, tentativa, limites } = p;
  const recuo = Math.min(5 * 60_000, 5_000 * 2 ** (tentativa - 1)); // 5s,10s,20s,40s… (máx 5min)

  const reagendar = async (esperaMs: number, proximaTentativa: number, proximosLimites: number) => {
    await ctx.runMutation(internal.pipedrive.marcar, {
      origem: p.origem,
      origemId: p.origemId,
      tentativas: proximaTentativa - 1,
      ultimoErro: `${p.passo}: ${resposta.erro}`,
      /* Um 404 numa pessoa em cache quer dizer que ela foi apagada lá. */
      esquecerPessoa: resposta.estado === 404 && p.passo !== "procurar-pessoa",
    });
    if (p.retoma.tipo === "lead") {
      await ctx.scheduler.runAfter(esperaMs, internal.pipedrive.enviarLead, {
        tabela: p.retoma.tabela,
        id: p.retoma.id,
        tentativa: proximaTentativa,
        limites: proximosLimites,
      });
    } else {
      await ctx.scheduler.runAfter(esperaMs, internal.pipedrive.enviarReservaPaga, {
        orderId: p.retoma.orderId,
        tentativa: proximaTentativa,
        limites: proximosLimites,
      });
    }
  };

  // 429: "abranda", não "avariou". Não gasta tentativa — gastá-las aqui e
  // declarar falha definitiva seria perder a lead por excesso de zelo.
  if (resposta.limite) {
    if (limites < MAX_LIMITES) {
      const espera = Math.min(5 * 60_000, Math.max(1_000, resposta.esperaMs ?? recuo));
      console.warn(`[Pipedrive] 429 em ${p.passo} — nova tentativa em ${espera}ms (${p.origem}/${p.origemId})`);
      await reagendar(espera, tentativa, limites + 1);
      return;
    }
    console.error(`[Pipedrive] limite de pedidos sem folga após ${MAX_LIMITES} esperas — ${p.origem}/${p.origemId}`);
  } else if (resposta.repetir && tentativa < MAX_TENTATIVAS) {
    console.warn(
      `[Pipedrive] ${p.passo} falhou (tentativa ${tentativa}/${MAX_TENTATIVAS}), a repetir em ${recuo}ms: ${resposta.erro}`,
    );
    await reagendar(recuo, tentativa + 1, limites);
    return;
  }

  const porque = resposta.repetir ? `${MAX_TENTATIVAS} tentativas esgotadas` : "erro definitivo";
  console.error(
    `[Pipedrive] ${p.passo} — ${porque}. ${p.origem}/${p.origemId} NÃO chegou ao CRM: ${resposta.erro}` +
      (resposta.estado === 401 || resposta.estado === 403
        ? " — verificar PIPEDRIVE_API_TOKEN (npx convex env set PIPEDRIVE_API_TOKEN …)"
        : ""),
  );
  await ctx.runMutation(internal.pipedrive.marcar, {
    origem: p.origem,
    origemId: p.origemId,
    estado: "falhado",
    tentativas: tentativa,
    ultimoErro: `${p.passo}: ${resposta.erro}`,
  });
}

function lerToken(origem: string): string | null {
  const token = process.env.PIPEDRIVE_API_TOKEN;
  if (!token) {
    console.warn(
      `[Pipedrive] PIPEDRIVE_API_TOKEN não definido — ${origem} não foi enviado. ` +
        "Definir com: npx convex env set PIPEDRIVE_API_TOKEN <chave>",
    );
    return null;
  }
  return token;
}

/** Guarda barata contra lixo de bots: sem email válido não vale um pedido. */
function emailPlausivel(email: string): boolean {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email.trim());
}

// ---------------------------------------------------------------------------
// Pessoa e organização, reaproveitadas quando já existem

async function garantirOrganizacao(
  token: string,
  nome: string,
): Promise<{ ok: true; id: number | null } | { ok: false; resposta: Extract<Resposta, { ok: false }>; passo: string }> {
  const procura = await procurarOrganizacao(token, nome);
  if (!procura.ok) return { ok: false, resposta: procura, passo: "procurar-organizacao" };
  const existente = primeiroId(procura.dados);
  if (existente) return { ok: true, id: existente };

  const criacao = await pedir(token, "POST", "/api/v2/organizations", { name: nome });
  if (!criacao.ok) return { ok: false, resposta: criacao, passo: "criar-organizacao" };
  return { ok: true, id: typeof criacao.dados?.data?.id === "number" ? criacao.dados.data.id : null };
}

async function garantirPessoa(
  token: string,
  pessoa: { nome: string; email: string; telefone?: string },
  orgId: number | null,
): Promise<{ ok: true; id: number | null } | { ok: false; resposta: Extract<Resposta, { ok: false }>; passo: string }> {
  const procura = await procurarPessoa(token, pessoa.email);
  if (!procura.ok) return { ok: false, resposta: procura, passo: "procurar-pessoa" };
  const existente = primeiroId(procura.dados);
  if (existente) return { ok: true, id: existente };

  const corpo: Record<string, unknown> = {
    name: pessoa.nome,
    emails: [{ value: pessoa.email, primary: true, label: "work" }],
  };
  // Sem telefone não se manda um array com uma string vazia: o Pipedrive
  // aceita-o e fica com um contacto de telefone em branco.
  if (pessoa.telefone) corpo.phones = [{ value: pessoa.telefone, primary: true, label: "mobile" }];
  if (orgId) corpo.org_id = orgId;

  const criacao = await pedir(token, "POST", "/api/v2/persons", corpo);
  if (!criacao.ok) return { ok: false, resposta: criacao, passo: "criar-pessoa" };
  return { ok: true, id: typeof criacao.dados?.data?.id === "number" ? criacao.dados.data.id : null };
}

// ---------------------------------------------------------------------------
// Formulário -> Pessoa + Lead + Nota

export const enviarLead = internalAction({
  args: {
    tabela: tabelaLead,
    id: v.string(),
    tentativa: v.optional(v.number()),
    limites: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const origem = args.tabela;
    const origemId = args.id;
    const tentativa = args.tentativa ?? 1;
    const limites = args.limites ?? 0;

    const token = lerToken(`${origem}/${origemId}`);
    if (!token) return;

    const estado = await ctx.runQuery(internal.pipedrive.lerEstado, { origem, origemId });
    if (estado?.estado === "concluido") {
      console.log(`[Pipedrive] ${origem}/${origemId} já tinha sido enviado — ignorado.`);
      return;
    }

    const lead = await ctx.runQuery(internal.pipedrive.mapearLead, { tabela: args.tabela, id: origemId });
    if (!lead) {
      console.warn(`[Pipedrive] registo não encontrado: ${origem}/${origemId}`);
      return;
    }
    if (!emailPlausivel(lead.pessoa.email)) {
      console.warn(`[Pipedrive] email sem forma de email em ${origem}/${origemId} — não enviado.`);
      await ctx.runMutation(internal.pipedrive.marcar, {
        origem,
        origemId,
        estado: "falhado",
        ultimoErro: "email inválido",
      });
      return;
    }

    const falhar = (resposta: Extract<Resposta, { ok: false }>, passo: string) =>
      tratarFalha(ctx, {
        origem,
        origemId,
        tentativa,
        limites,
        resposta,
        passo,
        retoma: { tipo: "lead", tabela: args.tabela, id: origemId },
      });

    // --- Organização
    let organizationId = estado?.organizationId ?? null;
    if (!organizationId && lead.organizacao) {
      const r = await garantirOrganizacao(token, lead.organizacao);
      if (!r.ok) return await falhar(r.resposta, r.passo);
      organizationId = r.id;
      if (organizationId) {
        await ctx.runMutation(internal.pipedrive.marcar, { origem, origemId, organizationId });
      }
    }

    // --- Pessoa
    let personId = estado?.personId ?? null;
    if (!personId) {
      const r = await garantirPessoa(token, lead.pessoa, organizationId);
      if (!r.ok) return await falhar(r.resposta, r.passo);
      personId = r.id;
      if (!personId) {
        console.error(`[Pipedrive] resposta sem id de pessoa em ${origem}/${origemId}`);
        return await falhar({ ok: false, erro: "resposta sem id de pessoa", repetir: false }, "criar-pessoa");
      }
      // Guardado já: se a criação da lead a seguir falhar por rede, a próxima
      // tentativa não cria uma segunda pessoa.
      await ctx.runMutation(internal.pipedrive.marcar, { origem, origemId, personId });
    }

    // --- Negócio no funil (a newsletter fica-se pela pessoa)
    let dealId = estado?.dealId ?? null;
    if (!lead.semNegocio && !dealId) {
      /* Negócio e não Lead: a Caixa de Leads do Pipedrive não tem funil nem
         etapa, e é isso que se quer ver aqui. Sem `pipeline_id`/`stage_id` o
         Pipedrive põe-no na primeira etapa do funil por omissão, que é o
         comportamento certo para um pedido acabado de chegar. */
      const corpo: Record<string, unknown> = {
        title: lead.titulo,
        person_id: personId,
        currency: "EUR",
      };
      if (organizationId) corpo.org_id = organizationId;
      // Sem orçamento não se manda 0: aparecia um negócio de €0 no funil.
      if (lead.valor !== undefined) corpo.value = lead.valor;
      if (PIPELINE_ID) corpo.pipeline_id = PIPELINE_ID;
      if (STAGE_ID) corpo.stage_id = STAGE_ID;

      const r = await pedir(token, "POST", "/api/v2/deals", corpo);
      if (!r.ok) {
        /* Uma falha que se pode repetir espera pela próxima tentativa. Uma
           definitiva não pode levar a nota atrás: era assim que o `city`, o
           `partnerType`, o volume e o "como nos conheceu" desapareciam sem
           deixar rasto, com a Pessoa criada e nada agarrado a ela. Regista-se o
           erro e segue-se para a nota, que fica na Pessoa. */
        if (r.repetir) return await falhar(r, "criar-negocio");
        console.error(`[Pipedrive] negócio recusado em ${origem}/${origemId}: ${r.erro} — o detalhe vai na nota da pessoa.`);
        await ctx.runMutation(internal.pipedrive.marcar, {
          origem,
          origemId,
          ultimoErro: `criar-negocio: ${r.erro}`,
        });
      } else {
        dealId = typeof r.dados?.data?.id === "number" ? r.dados.data.id : null;
        if (dealId) {
          await ctx.runMutation(internal.pipedrive.marcar, { origem, origemId, dealId });
        } else {
          console.error(`[Pipedrive] resposta 2xx sem id de negócio em ${origem}/${origemId}: ${JSON.stringify(r.dados).slice(0, 300)}`);
        }
      }
    }

    // --- Nota com o detalhe (o Negócio não tem campo de texto livre)
    if (lead.nota && !estado?.noteId) {
      const corpo: Record<string, unknown> = { content: lead.nota, person_id: personId };
      if (dealId) corpo.deal_id = dealId;

      const r = await pedir(token, "POST", "/api/v1/notes", corpo);
      if (!r.ok) return await falhar(r, "criar-nota");
      const noteId = typeof r.dados?.data?.id === "number" ? r.dados.data.id : undefined;
      if (noteId) await ctx.runMutation(internal.pipedrive.marcar, { origem, origemId, noteId });
    }

    await ctx.runMutation(internal.pipedrive.marcar, {
      origem,
      origemId,
      estado: "concluido",
      tentativas: tentativa,
    });
    console.log(
      `[Pipedrive] ${origem}/${origemId} → pessoa ${personId}${dealId ? `, negócio ${dealId}` : " (só pessoa)"}`,
    );
  },
});

// ---------------------------------------------------------------------------
// Reserva paga -> negócio ganho

export const enviarReservaPaga = internalAction({
  args: {
    orderId: v.id("orders"),
    tentativa: v.optional(v.number()),
    limites: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const origem = "orders";
    const origemId = args.orderId as string;
    const tentativa = args.tentativa ?? 1;
    const limites = args.limites ?? 0;

    const token = lerToken(`reserva ${origemId}`);
    if (!token) return;

    const estado = await ctx.runQuery(internal.pipedrive.lerEstado, { origem, origemId });
    if (estado?.estado === "concluido") {
      console.log(`[Pipedrive] reserva ${origemId} já tinha sido enviada — ignorada.`);
      return;
    }

    /* O mesmo conjunto que o `sendOrderPayload` monta: a ida, a volta e os
       tours vendidos em upsell. Um negócio por pagamento — se cada linha
       virasse negócio, uma ida-e-volta com um tour eram três cartões. */
    const principal: Doc<"orders"> | null = await ctx.runQuery(api.orders.getById, {
      orderId: args.orderId,
    });
    if (!principal) {
      console.warn(`[Pipedrive] reserva não encontrada: ${origemId}`);
      return;
    }
    const encomendas: Doc<"orders">[] = [principal];
    if (principal.relatedOrderId) {
      const volta = await ctx.runQuery(api.orders.getById, { orderId: principal.relatedOrderId });
      if (volta) encomendas.push(volta);
    }
    const upsells = await ctx.runQuery(internal.orders.getByTransferOrderId, { transferOrderId: args.orderId });
    for (const o of upsells) encomendas.push(o);

    const negocio = mapearReservaPaga(encomendas);
    if (!negocio) {
      console.warn(`[Pipedrive] reserva ${origemId} sem email de cliente — não enviada.`);
      return;
    }
    if (!emailPlausivel(negocio.pessoa.email)) {
      console.warn(`[Pipedrive] reserva ${origemId} com email inválido — não enviada.`);
      return;
    }

    const falhar = (resposta: Extract<Resposta, { ok: false }>, passo: string) =>
      tratarFalha(ctx, {
        origem,
        origemId,
        tentativa,
        limites,
        resposta,
        passo,
        retoma: { tipo: "reserva", orderId: args.orderId },
      });

    let personId = estado?.personId ?? null;
    if (!personId) {
      const r = await garantirPessoa(token, negocio.pessoa, null);
      if (!r.ok) return await falhar(r.resposta, r.passo);
      personId = r.id;
      if (!personId) {
        return await falhar({ ok: false, erro: "resposta sem id de pessoa", repetir: false }, "criar-pessoa");
      }
      await ctx.runMutation(internal.pipedrive.marcar, { origem, origemId, personId });
    }

    let dealId = estado?.dealId ?? null;
    if (!dealId) {
      const corpo: Record<string, unknown> = {
        title: negocio.titulo,
        person_id: personId,
        value: negocio.valor,
        currency: "EUR",
        status: "won",
        won_time: instantePipedrive(negocio.ganhoEm),
      };
      if (PIPELINE_ID) corpo.pipeline_id = PIPELINE_ID;

      const r = await pedir(token, "POST", "/api/v2/deals", corpo);
      if (!r.ok) return await falhar(r, "criar-negocio");
      dealId = typeof r.dados?.data?.id === "number" ? r.dados.data.id : null;
      if (dealId) await ctx.runMutation(internal.pipedrive.marcar, { origem, origemId, dealId });
    }

    if (negocio.nota && !estado?.noteId) {
      const r = await pedir(token, "POST", "/api/v1/notes", {
        content: negocio.nota,
        deal_id: dealId,
        person_id: personId,
      });
      if (!r.ok) return await falhar(r, "criar-nota");
      const noteId = typeof r.dados?.data?.id === "number" ? r.dados.data.id : undefined;
      if (noteId) await ctx.runMutation(internal.pipedrive.marcar, { origem, origemId, noteId });
    }

    await ctx.runMutation(internal.pipedrive.marcar, {
      origem,
      origemId,
      estado: "concluido",
      tentativas: tentativa,
    });
    console.log(`[Pipedrive] reserva ${origemId} → negócio ganho ${dealId} (€${negocio.valor})`);
  },
});
