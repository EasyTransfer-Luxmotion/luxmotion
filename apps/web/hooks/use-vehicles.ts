"use client";

import { useQuery } from "convex/react";
import { api } from "@workspace/convex/api";
import { useEffect, useMemo, useState } from "react";
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
 *
 * One line per vehicle category: `passengers`/`luggage` are the category's
 * largest car (the counters' cap and the upgrade banner follow the category,
 * not the size picked), `seats` and `size` the car the server chose for the
 * group. Changing the group may swap that car — and its id — inside the same
 * category; the checkout follows the line by `categoryId`.
 */

/* The lead-time surge depends on the clock, and a Convex query doesn't re-run
   as time passes: send the time, in quarter hours so the query isn't
   re-subscribed every second. */
const QUARTER = 15 * 60_000;
function useQuarterHour() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / QUARTER) * QUARTER);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / QUARTER) * QUARTER), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

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
  const now = useQuarterHour();
  const quoted = useQuery(api.vehicles.listQuoted, {
    now,
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
          v.maxPassengers > currentVehiclePassengers || v.maxLuggage > currentVehicleLuggage
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
        passengers: v.maxPassengers,
        luggage: v.maxLuggage,
        categoryId: v.categoryId as string | undefined,
        /* The size inside the category ("Mini Bus (16–20 pax)") and its seats. */
        size: v.categoryId ? v.vehicleName : undefined,
        seats: v.passengers,
        bags: v.luggage,
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
