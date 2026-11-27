"use client";

import { useQuery } from "convex/react";
import { api } from "@workspace/convex/api";
import { useMemo } from "react";
import { useLocale } from "next-intl";
import { localizeVehicle } from "@/lib/catalog-translations";

/**
 * Os veículos e os seus preços.
 *
 * O cálculo vivia aqui e o servidor gravava o que este ficheiro mandasse.
 * Agora vem do `vehicles.listQuoted`: as regras estão em
 * packages/convex/convex/lib/pricing.ts e o preço muda com os parâmetros da
 * viagem, em vez de ser uma fotografia tirada uma vez.
 *
 * As datas vão como texto "YYYY-MM-DD HH:mm", hora local — o mesmo formato com
 * que a encomenda é gravada, para o servidor decidir noite/dia uma só vez.
 */

interface LuggageRequirement {
  checkedBaggage: number;
  handLuggage: number;
  backpack: number;
}

interface UseVehiclesProps {
  passengers?: number;
  luggage?: LuggageRequirement;
  distance?: number;
  /** "YYYY-MM-DD HH:mm", hora local. O servidor é que decide se é noite. */
  departureDate?: string;
  returnDate?: string;
  /** When true, price is computed for both outbound and return legs. */
  bookReturn?: boolean;
  /** When true, the outbound pickup is an airport → surcharge on that leg. */
  isAirportPickup?: boolean;
  partnershipSlug?: string;
  upgradeMode?: boolean;
  currentVehiclePassengers?: number;
  currentVehicleLuggage?: number;
}

export function useVehicles({
  passengers = 1,
  luggage,
  distance,
  departureDate,
  returnDate,
  bookReturn = false,
  isAirportPickup = false,
  partnershipSlug,
  upgradeMode = false,
  currentVehiclePassengers = 0,
  currentVehicleLuggage = 0,
}: UseVehiclesProps) {
  const locale = useLocale();
  const quoted = useQuery(api.vehicles.listQuoted, {
    partnershipSlug,
    passengers,
    checkedBaggage: luggage?.checkedBaggage ?? 0,
    handLuggage: luggage?.handLuggage ?? 0,
    backpack: luggage?.backpack ?? 0,
    distance: distance ?? undefined,
    departureDate,
    returnDate,
    bookReturn,
    isAirportPickup,
  });

  const formattedVehicles = useMemo(() => {
    if (!quoted) return [];

    return quoted
      .filter((v) => {
        // Em modo de upgrade só entram os que dão mais do que o actual.
        if (!upgradeMode) return true;
        return (
          v.passengers > currentVehiclePassengers || v.luggage > currentVehicleLuggage
        );
      })
      .map((v) => localizeVehicle({
        id: v._id,
        name: v.name,
        translations: v.translations,
        examples: v.examples,
        price: v.price,
        dayPrice: v.dayPrice,
        nightTaxAmount: v.nightTaxOutbound + v.nightTaxReturn,
        nightTaxOutbound: v.nightTaxOutbound,
        nightTaxReturn: v.nightTaxReturn,
        pricePerKm: v.pricePerKm,
        hasDistance: v.hasDistance,
        image: v.imageUrl || "/shared/image-54.png",
        passengers: v.passengers,
        luggage: v.luggage,
        isElectric: v.isElectric,
        hasWifi: v.hasWifi,
        order: v.order,
        // Premium upsell: the standard vehicle this one is an upgrade of (if any).
        upgradeFromVehicleId: v.upgradeFromVehicleId as string | undefined,
      }, locale));
  }, [locale, quoted, upgradeMode, currentVehiclePassengers, currentVehicleLuggage]);

  return {
    vehicles: formattedVehicles,
    isLoading: quoted === undefined,
  };
}
