"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { translatedField } from "@/lib/catalog-translations";
import { useQuery } from "convex/react";
import { api } from "@workspace/convex/api";
import { precoPrivado } from "@/hooks/use-event-data";
import type { NearbyTour } from "@/components/checkout/experiences-step";
import { extractTextContent } from "@/lib/seo";
import { useSafeQuery } from "@/hooks/use-safe-query";
import { useCheckoutRadiiKm } from "@/hooks/use-site-settings";
import { formatarEmLisboa } from "@/lib/hora-lisboa";

interface UseNearbyToursProps {
  lat: number | null;
  lng: number | null;
  /** Só para casos especiais: por omissão vêm das definições do admin. */
  radiusKm?: number;
}

type UpsellLists = {
  stops: NonNullable<
    ReturnType<typeof useQuery<typeof api.upsells.listForDestination>>
  >["stops"];
  experiences: NonNullable<
    ReturnType<typeof useQuery<typeof api.upsells.listForDestination>>
  >["experiences"];
};

const NO_UPSELLS: UpsellLists = { stops: [], experiences: [] };

/* O dia do evento em Lisboa: sem `timeZone`, um evento às 00h30 aparecia na
   véspera a quem estava a oeste. */
function formatEventDate(timestamp: number, locale: string): string {
  return formatarEmLisboa(timestamp, locale, { month: "short", day: "numeric", year: "numeric" });
}

export function useNearbyTours({ lat, lng, radiusKm }: UseNearbyToursProps) {
  const locale = useLocale();
  /* Dois raios distintos, ambos do admin (/admin/numbers): quem procura um tour
     no destino quer resultados apertados, quem já vai a caminho aceita um
     desvio maior. Antes eram 30 km fixos escondidos no backend, iguais para os
     dois. */
  const { toursKm: toursRadiusKm, upsellKm: upsellRadiusKm } =
    useCheckoutRadiiKm();
  const hasPlace = lat != null && lng != null;
  const effectiveToursRadiusKm = radiusKm ?? toursRadiusKm;
  const effectiveUpsellRadiusKm = radiusKm ?? upsellRadiusKm;

  const tours = useQuery(
    api.tours.listNearCoordinates,
    hasPlace && effectiveToursRadiusKm != null
      ? { lat, lng, radiusKm: effectiveToursRadiusKm }
      : "skip",
  );

  const events = useQuery(
    api.events.listNearCoordinates,
    hasPlace && effectiveToursRadiusKm != null
      ? { lat, lng, radiusKm: effectiveToursRadiusKm }
      : "skip",
  );

  /* Paragens extra e experiências passaram a ter tabelas próprias, geridas em
     /admin/upsells. A query trata do cross-match: universais aparecem sempre,
     os restantes só se estiverem dentro do raio do destino.

     `useQueries` e não `useQuery`, pela mesma razão que `use-site-settings.ts`:
     se esta função ainda não estiver no deployment — o frontend vai ao ar pelo
     Vercel, o backend só com `npx convex deploy` — o `useQuery` RE-LANÇA o erro
     durante o render. Como este hook vive na raiz da página de checkout, isso
     não escondia só as secções novas: derrubava a página inteira, incluindo os
     tours, os eventos e o pagamento. Aqui o erro chega como VALOR e degrada
     para "não há upsells". */
  const { data: upsellsData, error: upsellsError } = useSafeQuery(
    api.upsells.listForDestination,
    hasPlace && effectiveUpsellRadiusKm != null
      ? { lat, lng, radiusKm: effectiveUpsellRadiusKm }
      : "skip",
  );

  const upsells = upsellsError ? NO_UPSELLS : upsellsData;

  const allItems = useMemo(() => {
    const transformedEvents: NearbyTour[] = (events ?? []).map((event) => {
      const translation = event.translations?.find(
        (entry) => entry.locale === locale,
      );
      const localized = {
        ...event,
        title: translation?.title?.trim() || event.title,
        subtitle: translation?.subtitle?.trim() || event.subtitle,
        description: translation?.description ?? event.description,
      };
      return {
        _id: event._id,
        slug: event.slug,
        title: localized.title,
        originalTitle: event.title,
        translations: (event.translations ?? []).map((entry) => ({
          locale: entry.locale,
          title: entry.title,
        })),
        subtitle: localized.subtitle,
        /* Como nos tours: `description` é TipTap, não uma string. Sem isto o
         cartão do evento ficava sem texto nenhum. */
        description:
          localized.subtitle?.trim() ||
          extractTextContent(localized.description),
        bannerImageUrl: event.bannerImageUrl,
        // O DTO chama-se `basePrice` e é partilhado com os upsells; o que muda
        // é a origem, que passou a ser o preço da viatura.
        basePrice: precoPrivado(event),
        duration: formatEventDate(event.eventDate, locale),
        /* A cidade do evento; quem desenha o cartão junta-lhe a data. */
        locationLabel: event.location,
        distanceKm: event.distanceKm,
        category: "events" as const,
        addons: event.addons.map((addon) => ({
          ...addon,
          title: translatedField(
            addon.translations,
            locale,
            "title",
            addon.title,
          ),
        })),
      };
    });

    const transformedStops: NearbyTour[] = (upsells?.stops ?? []).map(
      (stop) => ({
        _id: stop._id,
        slug: "",
        title: translatedField(stop.translations, locale, "title", stop.title),
        originalTitle: stop.title,
        translations: stop.translations,
        description: translatedField(
          stop.translations,
          locale,
          "description",
          stop.description,
        ),
        bannerImageUrl: stop.imageUrl,
        basePrice: stop.price30,
        duration: "30 min",
        /* As duas durações seguem para o cartão e para o modal. O preço de 15
         minutos era pedido no admin e não chegava a lado nenhum. */
        durations: [
          ...(stop.price15 != null
            ? [{ minutes: 15, price: stop.price15 }]
            : []),
          { minutes: 30, price: stop.price30 },
        ],
        locationLabel: stop.location?.title ?? undefined,
        // Universais não têm distância: mostrar "a 0 km" seria uma mentira.
        distanceKm: stop.distanceKm ?? undefined,
        category: "upsellStop" as const,
        tag: stop.tag,
        // Uma paragem cobra-se por paragem: quatro pessoas numa de €15 pagam €15.
        flatPrice: true,
        hasDateField: false,
        hasSpecialRequest: true,
        location: stop.location,
      }),
    );

    const transformedUpsellExperiences: NearbyTour[] = (
      upsells?.experiences ?? []
    ).map((experience) => ({
      _id: experience._id,
      slug: "",
      title: translatedField(
        experience.translations,
        locale,
        "title",
        experience.title,
      ),
      originalTitle: experience.title,
      translations: experience.translations,
      description: translatedField(
        experience.translations,
        locale,
        "description",
        experience.description,
      ),
      bannerImageUrl: experience.imageUrl,
      basePrice: experience.basePrice,
      duration: translatedField(
        experience.translations,
        locale,
        "duration",
        experience.duration,
      ),
      distanceKm: experience.distanceKm ?? undefined,
      category: "upsellExperience" as const,
      tag: experience.tag,
      /* Só o facto, não a etiqueta: escrita aqui ficava em português nos seis
         idiomas. Quem desenha o cartão é que a traduz. */
      perPerson: experience.pricingModel === "perPerson",
      flatPrice: experience.pricingModel === "flat",
      hasDateField: experience.hasDateField,
      hasSpecialRequest: experience.hasSpecialRequest,
      location: experience.location,
      locationLabel: experience.location?.title ?? undefined,
      addons: experience.addons.map((addon) => ({
        _id: addon.id,
        title: translatedField(addon.translations, locale, "name", addon.name),
        price: addon.price,
        pricingType: addon.pricingType,
        currency: experience.currency,
      })),
    }));

    // As categorias `stops` e `experiences` de `tours` deixam de ser oferecidas:
    // foram substituídas pelas tabelas de upsells. Ficam na base de dados até a
    // migração ser dada por boa, mas não voltam ao checkout.
    const legacyFiltered = (tours ?? []).filter(
      (tour) => tour.category !== "stops" && tour.category !== "experiences",
    );

    /* Os tours vinham em bruto do Convex e o cartão ficava quase vazio: sem
       selo, sem localidade e — o mais visível — sem descrição nenhuma, porque
       `description` é conteúdo TipTap e não uma string, e o `subtitle` está
       vazio na maioria dos tours. */
    const transformedTours: NearbyTour[] = legacyFiltered.map((tour) => {
      const translation = tour.translations?.find(
        (entry) => entry.locale === locale,
      );
      const localized = {
        ...tour,
        title: translation?.title?.trim() || tour.title,
        subtitle: translation?.subtitle?.trim() || tour.subtitle,
        description: translation?.description ?? tour.description,
      };
      return {
        ...tour,
        addons: tour.addons.map((addon) => ({
          ...addon,
          title: translatedField(
            addon.translations,
            locale,
            "title",
            addon.title,
          ),
        })),
        title: localized.title,
        originalTitle: tour.title,
        translations: (tour.translations ?? []).map((entry) => ({
          locale: entry.locale,
          title: entry.title,
        })),
        tag: tour.isBestSeller
          ? ("mostPopular" as const)
          : tour.isFeatured
            ? ("recommended" as const)
            : undefined,
        locationLabel: tour.destination || undefined,
        description:
          localized.subtitle?.trim() ||
          extractTextContent(localized.description),
      };
    });

    return [
      ...transformedTours,
      ...transformedEvents,
      ...transformedStops,
      ...transformedUpsellExperiences,
    ];
  }, [tours, events, upsells, locale]);

  /* Só os tours e os eventos decidem se o passo das experiências existe. Os
     upsells, quando chegarem, acrescentam cartões — nunca decidem o passo.

     Amarrá-los aqui tinha uma consequência que não se via: enquanto
     `nearbyToursLoaded` fosse falso, `passengerStep` valia 2, o mesmo número
     que `experiencesStep`, e o passo 2 desenhava o formulário de passageiro por
     cima dos tours que já tinham chegado. */
  const isLoading = hasPlace && (tours === undefined || events === undefined);

  return {
    tours: allItems,
    isLoading,
  };
}
