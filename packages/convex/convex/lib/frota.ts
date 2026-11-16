import type { Doc, Id } from "../_generated/dataModel";

/*
 * Os carros que um checkout mostra.
 *
 * Sem parceiro: a frota global (os carros sem dono).
 * Com parceiro: a frota global menos os que esse parceiro escondeu
 * (partnerships.veiculosEscondidos), mais os carros próprios dele.
 *
 * Até 16/11/2026 um parceiro só via os carros próprios. Em produção nenhum
 * parceiro tinha carros, e o checkout de todas as parcerias aparecia sem
 * carros nenhuns — cada parceria nova obrigava a criar a frota outra vez.
 */
export function frotaVisivel(
  activos: Doc<"vehicles">[],
  parceria: Pick<Doc<"partnerships">, "_id" | "veiculosEscondidos"> | null,
): Doc<"vehicles">[] {
  const escondidos = new Set<Id<"vehicles">>(parceria?.veiculosEscondidos ?? []);
  return activos
    .filter((v) =>
      parceria
        ? v.partnershipId === parceria._id || (!v.partnershipId && !escondidos.has(v._id))
        : !v.partnershipId,
    )
    .sort((a, b) => a.order - b.order);
}
