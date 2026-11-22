import { haversineKm } from "./geo";

/*
 * The airports, on their own so that what only needs a place's airport code
 * (lib/orderLabels.ts, the order stats) does not import the pricing, which
 * imports siteSettings, which imports functions.ts, whose triggers import
 * the order stats: a cycle that left `mutation` undefined at load.
 */

/* Os aeroportos de apps/web/lib/airport.ts: o mesmo critério que o checkout
   usa para a sobretaxa — perto de um aeroporto, o placeId dele, ou a palavra
   "aeroporto" no texto. */
export const AEROPORTOS = [
  { codigo: "LIS", placeId: "ChIJgwHZFkYyGQ0RRm0DWD6lZgo", lat: 38.7788454, lng: -9.1319758 },
  { codigo: "OPO", placeId: "ChIJrStKYWRvJA0R0TlgbYpXGhU", lat: 41.2473992, lng: -8.6806638 },
  { codigo: "FAO", placeId: "ChIJm5mnTbBSBQ0RRztnYx5VRCE", lat: 37.0165746, lng: -7.9705537 },
  { codigo: "FNC", placeId: "ChIJ6xlRBVRiYAwR7cmGjBb7wVY", lat: 32.6975155, lng: -16.774145 },
  { codigo: "PDL", placeId: "ChIJ-QPpnfoqQwsR1yGd6x257gU", lat: 37.7493461, lng: -25.7103849 },
  { codigo: "CAT", placeId: "ChIJn3CH1mjPHg0RCIXOSj2NWKY", lat: 38.7247009, lng: -9.3534113 },
];
export const PALAVRAS_AEROPORTO = ["airport", "aeroporto", "aeropuerto", "aéroport", "aeroport", "flughafen", "luchthaven", "vliegveld", "lufthavn", "flygplats", "lentoasema", "lotnisko", "letiště", "letiste", "havalimanı", "havalimani", "repülőtér", "aerodrom"];

export type Local = { location: string; placeId?: string; lat?: number; lng?: number } | undefined;

/* O código do aeroporto (LIS, OPO…) pelas coordenadas ou pelo placeId, que
   não dependem da língua: o Google devolve a morada na língua do browser do
   cliente, e "Міжнародний аеропорт Портела" é o aeroporto de Lisboa. */
export function codigoDoAeroporto(l: Omit<NonNullable<Local>, "location"> | undefined): string | null {
  if (!l) return null;
  const a = AEROPORTOS.find(
    (x) =>
      (typeof l.lat === "number" && typeof l.lng === "number" && haversineKm({ lat: l.lat, lng: l.lng }, x) <= 2) ||
      (l.placeId !== undefined && l.placeId === x.placeId),
  );
  return a?.codigo ?? null;
}

export function eAeroporto(l: Local): boolean {
  if (!l) return false;
  if (typeof l.lat === "number" && typeof l.lng === "number" && AEROPORTOS.some((a) => haversineKm(l as { lat: number; lng: number }, a) <= 2)) return true;
  if (l.placeId && AEROPORTOS.some((a) => a.placeId === l.placeId)) return true;
  const t = l.location.toLowerCase();
  return PALAVRAS_AEROPORTO.some((p) => t.includes(p));
}

