import type { Doc, Id } from "../_generated/dataModel";

/*
 * Os carros que um checkout mostra.
 *
 * Cada carro diz onde aparece (reachOf): no site principal ou não, e nos
 * parceiros — todos, só alguns, ou nenhum. Com «todos», cada parceiro ainda
 * pode esconder o carro na sua Frota (partnerships.veiculosEscondidos).
 *
 * Até 16/11/2026 um parceiro só via os carros próprios. Em produção nenhum
 * parceiro tinha carros, e o checkout de todas as parcerias aparecia sem
 * carros nenhuns — cada parceria nova obrigava a criar a frota outra vez.
 * Até 27/11/2026 um carro tinha um dono só (partnershipId): ou era do site e
 * de todos os parceiros, ou só de um parceiro, e o editor dizia «Associado a».
 */

export type PartnerMode = "all" | "some" | "none";
export type Reach = { site: boolean; mode: PartnerMode; partnerIds: Id<"partnerships">[] };

type CarReach = Pick<Doc<"vehicles">, "showOnSite" | "partnerMode" | "partnerIds" | "partnershipId">;

/** Where a car is offered, with the old single owner read the old way. */
export function reachOf(car: CarReach): Reach {
  if (car.partnerMode) {
    return { site: car.showOnSite ?? true, mode: car.partnerMode, partnerIds: car.partnerMode === "some" ? (car.partnerIds ?? []) : [] };
  }
  if (car.partnershipId) return { site: false, mode: "some", partnerIds: [car.partnershipId] };
  return { site: car.showOnSite ?? true, mode: "all", partnerIds: [] };
}

/** Whether this partner's checkout offers the car (before the car's status). */
export function offeredTo(
  car: CarReach & Pick<Doc<"vehicles">, "_id">,
  parceria: Pick<Doc<"partnerships">, "_id" | "veiculosEscondidos"> | null,
): boolean {
  const r = reachOf(car);
  if (!parceria) return r.site;
  if (r.mode === "all") return !(parceria.veiculosEscondidos ?? []).includes(car._id);
  return r.mode === "some" && r.partnerIds.includes(parceria._id);
}

export function frotaVisivel(
  activos: Doc<"vehicles">[],
  parceria: Pick<Doc<"partnerships">, "_id" | "veiculosEscondidos"> | null,
): Doc<"vehicles">[] {
  return activos.filter((v) => offeredTo(v, parceria)).sort((a, b) => a.order - b.order);
}
