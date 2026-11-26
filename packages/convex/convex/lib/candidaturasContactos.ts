import type { GenericDatabaseWriter } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ligarContacto, ligarOrganizacao, normalizarEmail, normalizarTelefone } from "./contactos";
import type { PerfilMotorista } from "./perfilMotorista";

/*
 * A driver's or a fleet's application written into Contactos, all of it.
 *
 * The funnel entry (lib/funilEntrada.ts) only gave the contact a name, an
 * email and a phone, and only where empty. The form says much more, and the
 * team needs it on the person: the contact and the organisation now take
 * what the form says (name, email, phone, WhatsApp, zone, NIF, address) and
 * keep the rest (languages, vehicles, availability, billing...) in
 * `motorista` (lib/perfilMotorista.ts).
 *
 * Runs when an application arrives and when its data change, from the
 * trigger (lib/triggers.ts); a change of status only updates the status in
 * the profile, so what the team corrected by hand later stays. A fleet's
 * representative and every driver it lists become people of the
 * organisation.
 */

type Ctx = { db: GenericDatabaseWriter<DataModel> };
type Tabela = "driverApplications" | "partnerApplications";
type Candidatura = Doc<"driverApplications"> | Doc<"partnerApplications">;

/* The fields that are the team's, not the applicant's: a change in these is
   not new data from the form. */
const DA_EQUIPA = new Set(["_id", "_creationTime", "status", "reviewedAt", "internalNotes", "queuePosition"]);
function mesmosDados(a: Candidatura, b: Candidatura): boolean {
  const k = new Set([...Object.keys(a), ...Object.keys(b)].filter((x) => !DA_EQUIPA.has(x)));
  for (const x of k) if (JSON.stringify((a as Record<string, unknown>)[x]) !== JSON.stringify((b as Record<string, unknown>)[x])) return false;
  return true;
}

const limpo = (s: string | undefined | null) => s?.trim().replace(/\s+/g, " ") || undefined;

function perfilDoMotorista(d: Doc<"driverApplications">): PerfilMotorista {
  return {
    tipo: "motorista",
    candidatura: { tabela: "driverApplications", id: d._id, estado: d.status, recebidaEm: d.createdAt },
    zonas: [d.operatingZone].filter(Boolean),
    linguas: (d.languages ?? []).map((l) => ({ codigo: l.code, nivel: l.level })),
    viaturas: [
      {
        marca: d.vehicleBrand,
        modelo: d.vehicleModel,
        matricula: d.vehiclePlate,
        categoria: d.vehicleCategory,
        cor: d.vehicleColor || undefined,
        ano: d.vehicleYear || undefined,
        lugares: d.vehiclePassengerCapacity || undefined,
        malas: d.vehicleLuggageCapacity || undefined,
        propriedade: d.vehicleOwnership || undefined,
        tvde: d.vehicleTvdeLicensed || undefined,
      },
    ],
    disponibilidade: { dias: d.availabilityDays ?? [], turnos: d.availabilityShifts ?? [] },
    cadeirinhas: { bebe: d.childSeatBaby ?? 0, crianca: d.childSeatChild ?? 0, elevatoria: d.childSeatBooster ?? 0 },
    pranchas: d.surfboardRack,
    comodidades: d.amenities ?? [],
    comoSoube: d.referral || undefined,
    faturacao: {
      titular: d.billingAccountHolder,
      nomeFatura: d.billingInvoiceName,
      nif: d.billingNif,
      iban: d.billingIban,
      swift: d.billingSwiftBic,
      reparticao: d.billingTaxOffice,
      morada: d.billingAddress,
    },
  };
}

function perfilDaFrota(d: Doc<"partnerApplications">): PerfilMotorista {
  return {
    tipo: "frota",
    candidatura: { tabela: "partnerApplications", id: d._id, estado: d.status, recebidaEm: d.createdAt },
    zonas: d.operatingZones ?? [],
    linguas: [],
    viaturas: (d.vehicles ?? []).map((x) => ({ marca: x.make, modelo: x.model, matricula: x.licensePlate, categoria: x.category })),
    motoristasDeclarados: d.driverCount || undefined,
    aVontadeComTelemovel: d.driversComfortableWithMobile === "yes",
    faturacao: {
      titular: d.billingAccountHolder,
      nomeFatura: d.billingInvoiceName,
      nif: d.billingTaxId,
      iban: d.billingIban,
      swift: d.billingSwiftBic,
      reparticao: d.billingTaxOffice,
      morada: d.billingAddress,
    },
  };
}

/* Patch only what differs: these patches fire the contact triggers. */
async function actualizar<T extends "contactos" | "organizacoes">(ctx: Ctx, id: Id<T>, novos: Record<string, unknown>) {
  const atual = (await ctx.db.get(id)) as Record<string, unknown> | null;
  if (!atual) return;
  const diferentes = Object.fromEntries(Object.entries(novos).filter(([k, v]) => v !== undefined && JSON.stringify(atual[k]) !== JSON.stringify(v)));
  if (Object.keys(diferentes).length) await ctx.db.patch(id, { ...diferentes, atualizadoEm: Date.now() } as never);
}

export async function sincronizarCandidatura(ctx: Ctx, tabela: Tabela, antes: Candidatura | null, depois: Candidatura | null): Promise<void> {
  if (!depois) return;
  /* Only the status changed: only the status in the profile follows. */
  const soEstado = antes !== null && mesmosDados(antes, depois);
  const mctx = ctx as unknown as MutationCtx;

  if (tabela === "driverApplications") {
    const d = depois as Doc<"driverApplications">;
    const { contactoId } = await ligarContacto(mctx, { nome: d.fullName, email: d.email, telefone: d.phone, origem: tabela });
    if (!contactoId) return;
    const perfil = perfilDoMotorista(d);
    if (soEstado) return actualizar(ctx, contactoId, { motorista: perfil });
    const c = await ctx.db.get(contactoId);
    return actualizar(ctx, contactoId, {
      nome: limpo(d.fullName),
      email: normalizarEmail(d.email),
      telefone: normalizarTelefone(d.phone),
      whatsapp: normalizarTelefone(d.whatsapp),
      localidade: limpo(d.operatingZone),
      nif: limpo(d.billingNif),
      morada: limpo(d.billingAddress),
      funcao: c?.funcao || "Motorista",
      motorista: perfil,
    });
  }

  const d = depois as Doc<"partnerApplications">;
  const empresa = limpo(d.companyName);
  const organizacaoId = empresa ? await ligarOrganizacao(mctx, empresa, tabela) : null;
  const perfil = perfilDaFrota(d);
  if (organizacaoId) {
    await actualizar(
      ctx,
      organizacaoId,
      soEstado
        ? { motorista: perfil }
        : {
            email: normalizarEmail(d.representativeEmail),
            telefone: normalizarTelefone(d.representativePhone),
            whatsapp: normalizarTelefone(d.representativeWhatsapp),
            nif: limpo(d.billingTaxId),
            morada: limpo(d.billingAddress),
            localidade: d.operatingZones?.length ? d.operatingZones.join(", ") : undefined,
            motorista: perfil,
          },
    );
  }
  if (soEstado) return;

  /* The representative, then every driver the fleet lists. */
  const pessoas = [
    { nome: d.representativeFullName, email: d.representativeEmail, telefone: d.representativePhone, whatsapp: d.representativeWhatsapp, funcao: "Representante" },
    ...(d.drivers ?? []).map((m) => ({ nome: m.fullName, email: m.email, telefone: m.phone, whatsapp: undefined as string | undefined, funcao: "Motorista" })),
  ];
  for (const p of pessoas) {
    const { contactoId } = await ligarContacto(mctx, { nome: p.nome, email: p.email, telefone: p.telefone, empresa, origem: tabela });
    if (!contactoId) continue;
    const c = await ctx.db.get(contactoId);
    await actualizar(ctx, contactoId, {
      nome: limpo(p.nome),
      whatsapp: normalizarTelefone(p.whatsapp),
      funcao: c?.funcao || p.funcao,
      organizacaoId: organizacaoId ?? undefined,
      localidade: d.operatingZones?.length ? d.operatingZones.join(", ") : undefined,
    });
  }
}
