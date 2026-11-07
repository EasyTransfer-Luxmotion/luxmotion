import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { urlDaImagem } from "./imagens";

/**
 * Junta os extras próprios de um tour ou evento com os universais do seu âmbito.
 *
 * Existe porque o mesmo bloco de leitura estava copiado em quatro sítios —
 * `tours.getBySlug`, `tours.listNearCoordinates`, `events.getBySlug` e
 * `events.listNearCoordinates`. Com a junção pelo meio, escrevê-la quatro vezes
 * era garantir que uma delas ficava para trás.
 */

export type AddonScope = "tours" | "events" | "ultraLuxury";

/** O estado dos extras teve duas gerações; ambas contam como publicado. */
function estaPublicado(a: { status?: string; isActive?: boolean }) {
  return (
    a.status === "published" || (a.status === undefined && a.isActive === true)
  );
}

type Alvo =
  | { tourId: Id<"tours">; eventId?: undefined; isUltraLuxury?: boolean }
  | { eventId: Id<"events">; tourId?: undefined; isUltraLuxury?: undefined };

type Opcoes = Alvo & {
  /** Universais que este tour ou evento dispensa. */
  disabled?: Id<"universalAddons">[];
  /**
   * Forma curta, sem traduções, para consumidores que não mostram conteúdo
   * localizado. O checkout pede a forma completa.
   */
  trimmed?: boolean;
};

/** A forma que o site consome. Explícita, e não o documento inteiro espalhado:
 *  os dois lados (extra próprio e universal) vivem em tabelas diferentes e só
 *  estes campos existem nos dois. */
export type AddonResolvido = {
  _id: string;
  title: string;
  description?: string;
  imageUrl: string | null;
  price: number;
  pricingType: "per_person" | "flat";
  currency: string;
  order: number;
  status?: "draft" | "published";
  /** O cartão de reserva usa-o para saber que id enviar para a reserva. */
  isUniversal: boolean;
  translations?: Array<{
    locale: string;
    title: string;
    description?: string;
  }>;
};

export async function resolveAddons(
  ctx: QueryCtx,
  opcoes: Opcoes,
): Promise<AddonResolvido[]> {
  const proprios = opcoes.tourId
    ? await ctx.db
        .query("tourAddons")
        .withIndex("by_tour", (q) => q.eq("tourId", opcoes.tourId))
        .collect()
    : await ctx.db
        .query("tourAddons")
        .withIndex("by_event", (q) => q.eq("eventId", opcoes.eventId))
        .collect();

  const ambito: AddonScope = opcoes.eventId
    ? "events"
    : opcoes.isUltraLuxury === true
      ? "ultraLuxury"
      : "tours";

  const dispensados = new Set<string>(opcoes.disabled ?? []);
  const universais = (
    await ctx.db
      .query("universalAddons")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect()
  ).filter((u) => u.scopes.includes(ambito) && !dispensados.has(u._id));

  /* Ordena pelo `order` de cada um e, em empate, o do tour ganha ao universal:
     entre um extra escrito para este tour e um genérico, o específico vem
     primeiro. */
  const juntos: Array<
    | { doc: Doc<"tourAddons">; universal: false }
    | { doc: Doc<"universalAddons">; universal: true }
  > = [
    ...proprios
      .filter(estaPublicado)
      .map((doc) => ({ doc, universal: false as const })),
    ...universais.map((doc) => ({ doc, universal: true as const })),
  ].sort(
    (a, b) =>
      a.doc.order - b.doc.order || Number(a.universal) - Number(b.universal),
  );

  return await Promise.all(
    juntos.map(async ({ doc, universal }): Promise<AddonResolvido> => {
      const imageUrl = doc.imageId
        ? await urlDaImagem(ctx, doc.imageId)
        : null;

      const base: AddonResolvido = {
        _id: doc._id,
        title: doc.title,
        description: doc.description,
        imageUrl,
        price: doc.price,
        pricingType: doc.pricingType,
        currency: doc.currency,
        order: doc.order,
        status: doc.status,
        isUniversal: universal,
      };

      if (opcoes.trimmed) return base;

      /* Os universais guardam as traduções junto do extra. */
      if (universal)
        return {
          ...base,
          translations:
            doc.translations?.map((entry) => ({
              locale: entry.locale,
              title: entry.title?.trim() || doc.title,
              description: entry.description,
            })) ?? [],
        };

      const translations = await ctx.db
        .query("tourAddonTranslations")
        .withIndex("by_addon", (q) => q.eq("addonId", doc._id))
        .collect();

      return {
        ...base,
        translations: translations.map((t) => ({
          locale: t.locale,
          title: t.title,
          description: t.description,
        })),
      };
    }),
  );
}
