import type { Doc } from "../_generated/dataModel";

/*
 * Evaluating drivers' and fleets' applications (dashboard spec v1.0, 5.3–5.5).
 *
 * Documents: each required file has a state (received, validated, refused);
 * an application is "complete" when every required one is validated.
 * Score: 0–100 per criterion, the overall is the weighted average. The
 * criteria, weights and marks are configurable (siteSettings); these are the
 * spec's example values, the defaults. The score only helps: approving stays
 * manual and needs every required document validated.
 *
 * No Convex imports: the dashboard imports this file.
 */

export type Tabela = "driverApplications" | "partnerApplications";

/* The files of each application (candidaturas.ts → ficheiros), and which of
   them are required for that kind of applicant. */
export const DOCUMENTOS: Record<Tabela, { chave: string; titulo: string; obrigatorio: boolean }[]> = {
  driverApplications: [
    { chave: "professionalLicenseId", titulo: "Carta profissional TVDE", obrigatorio: true },
    { chave: "vehicleInsuranceId", titulo: "Seguro da viatura", obrigatorio: true },
    { chave: "proofOfAddressId", titulo: "Comprovativo de morada", obrigatorio: true },
    { chave: "billingBankProofId", titulo: "Comprovativo bancário", obrigatorio: false },
  ],
  partnerApplications: [
    { chave: "documentLicenseId", titulo: "Alvará / licença", obrigatorio: true },
    { chave: "documentLiabilityInsuranceId", titulo: "Seguro de responsabilidade civil", obrigatorio: true },
    { chave: "documentAddressProofPrimaryId", titulo: "Comprovativo de morada", obrigatorio: true },
    { chave: "documentAddressProofSecondaryId", titulo: "Comprovativo de morada (2.º)", obrigatorio: false },
    { chave: "billingBankProofId", titulo: "Comprovativo bancário", obrigatorio: false },
  ],
};

export type EstadoDocumento = "recebido" | "validado" | "recusado";
export type Documentacao = "completa" | "falta" | "validar";

/* Missing (or refused) a required file: "falta"; all there but not all
   validated: "validar"; every required one validated: "completa". */
export function estadoDaDocumentacao(
  tabela: Tabela,
  app: Record<string, unknown> | null,
  estados: { chave: string; estado: EstadoDocumento }[] | undefined,
): Documentacao {
  const porChave = new Map((estados ?? []).map((d) => [d.chave, d.estado]));
  let porValidar = false;
  for (const d of DOCUMENTOS[tabela]) {
    if (!d.obrigatorio) continue;
    const tem = Boolean(app?.[d.chave]);
    const estado = porChave.get(d.chave);
    if (!tem || estado === "recusado") return "falta";
    if (estado !== "validado") porValidar = true;
  }
  return porValidar ? "validar" : "completa";
}

/* The required documents not yet validated, by title (to refuse approving). */
export function documentosPorValidar(
  tabela: Tabela,
  estados: { chave: string; estado: EstadoDocumento }[] | undefined,
): string[] {
  const porChave = new Map((estados ?? []).map((d) => [d.chave, d.estado]));
  return DOCUMENTOS[tabela].filter((d) => d.obrigatorio && porChave.get(d.chave) !== "validado").map((d) => d.titulo);
}

export type Criterio = { chave: string; titulo: string; peso: number };
export type ConfigAvaliacao = { criterios: Criterio[]; limiteAprovar: number; limiteRever: number };

/* The spec's example (5.5), "subject to validation": the starting values. */
export const AVALIACAO_DEFAULTS: ConfigAvaliacao = {
  criterios: [
    { chave: "viaturas", titulo: "Qualidade das viaturas", peso: 25 },
    { chave: "experiencia", titulo: "Profissionalismo e experiência", peso: 25 },
    { chave: "condicoes", titulo: "Condições comerciais", peso: 20 },
    { chave: "disponibilidade", titulo: "Disponibilidade e cobertura", peso: 20 },
    { chave: "comunicacao", titulo: "Comunicação", peso: 10 },
  ],
  limiteAprovar: 80,
  limiteRever: 60,
};

export function configAvaliacao(stored: ConfigAvaliacao | null | undefined): ConfigAvaliacao {
  return stored && stored.criterios.length ? stored : AVALIACAO_DEFAULTS;
}

/* The weighted average of the criteria scored so far (0–100), to one
   decimal; null with nothing scored. Weights need not add up to 100. */
export function pontuacao(cfg: ConfigAvaliacao, notas: { chave: string; nota: number }[]): number | null {
  const porChave = new Map(notas.map((n) => [n.chave, n.nota]));
  let soma = 0;
  let pesos = 0;
  for (const c of cfg.criterios) {
    const n = porChave.get(c.chave);
    if (n === undefined) continue;
    soma += n * c.peso;
    pesos += c.peso;
  }
  return pesos > 0 ? Math.round((soma / pesos) * 10) / 10 : null;
}

export type Recomendacao = "aprovar" | "rever" | "abaixo";
export function recomendacao(cfg: ConfigAvaliacao, nota: number | null): Recomendacao | null {
  if (nota === null) return null;
  if (nota >= cfg.limiteAprovar) return "aprovar";
  if (nota >= cfg.limiteRever) return "rever";
  return "abaixo";
}

/* The vehicle categories an application declares, lower case. */
export function categoriasDe(tabela: Tabela, app: Partial<Doc<"driverApplications"> & Doc<"partnerApplications">> | null): string[] {
  if (!app) return [];
  const xs = tabela === "driverApplications" ? [app.vehicleCategory] : (app.vehicles ?? []).map((v) => v.category);
  return [...new Set(xs.filter((x): x is string => Boolean(x?.trim())).map((x) => x.trim().toLowerCase()))];
}
