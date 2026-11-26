import { v, type Infer } from "convex/values";

/*
 * What a driver's or a fleet's application says, kept on the contact and the
 * organisation it created (lib/candidaturasContactos.ts). The application
 * only gave the contact a name, an email and a phone; zones, languages,
 * vehicles, availability and billing stayed in the form, out of reach from
 * Contactos. Everything the form brings is kept here.
 */
export const vPerfilMotorista = v.object({
  tipo: v.union(v.literal("motorista"), v.literal("frota")),
  candidatura: v.object({
    tabela: v.union(v.literal("driverApplications"), v.literal("partnerApplications")),
    id: v.string(),
    estado: v.string(),
    recebidaEm: v.number(),
  }),
  zonas: v.array(v.string()),
  linguas: v.array(v.object({ codigo: v.string(), nivel: v.string() })),
  viaturas: v.array(
    v.object({
      marca: v.string(),
      modelo: v.string(),
      matricula: v.string(),
      categoria: v.string(),
      cor: v.optional(v.string()),
      ano: v.optional(v.string()),
      lugares: v.optional(v.string()),
      malas: v.optional(v.string()),
      propriedade: v.optional(v.string()),
      tvde: v.optional(v.string()),
    }),
  ),
  disponibilidade: v.optional(v.object({ dias: v.array(v.string()), turnos: v.array(v.string()) })),
  cadeirinhas: v.optional(v.object({ bebe: v.number(), crianca: v.number(), elevatoria: v.number() })),
  pranchas: v.optional(v.boolean()),
  comodidades: v.optional(v.array(v.string())),
  /* Fleets: how many drivers they say they have, and whether those are at
     ease with a phone app. */
  motoristasDeclarados: v.optional(v.string()),
  aVontadeComTelemovel: v.optional(v.boolean()),
  comoSoube: v.optional(v.string()),
  /* Bank details: only shown to whoever can open Candidaturas. */
  faturacao: v.object({
    titular: v.string(),
    nomeFatura: v.string(),
    nif: v.string(),
    iban: v.string(),
    swift: v.string(),
    reparticao: v.string(),
    morada: v.string(),
  }),
});
export type PerfilMotorista = Infer<typeof vPerfilMotorista>;
