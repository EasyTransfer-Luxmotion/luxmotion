/**
 * As regras de preço dos transfers, num sítio só.
 *
 * Estiveram sempre no browser (hooks/use-vehicles.ts) e o servidor gravava o
 * que o checkout mandasse. Isso deu pelo menos duas viagens nocturnas cobradas
 * sem a taxa: o preço era calculado uma vez, guardado como fotografia no
 * veículo escolhido, e se a data mudasse depois a fotografia ficava velha.
 *
 * Aqui o cálculo é uma função pura, sem React e sem estado, e é o servidor que
 * a corre. O checkout passa a mostrar o número que o servidor devolve.
 */

/**
 * Horário nocturno: das 20h às 08h.
 *
 * Recebe a data como está gravada — "YYYY-MM-DD HH:mm[:ss]", hora local, sem
 * fuso. Uma data sem hora não é noite: mais vale não cobrar do que cobrar por
 * causa de um campo em branco.
 */
export function isNightDeparture(departureDate: string | undefined | null, from = 20, to = 8): boolean {
  if (!departureDate) return false;
  const match = /^\d{4}-\d{2}-\d{2}[ T](\d{2}):/.exec(departureDate);
  if (!match) return false;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour)) return false;
  /* A window that crosses midnight (20→8) or not (0→6). */
  return from > to ? hour >= from || hour < to : hour >= from && hour < to;
}

export type LegPricing = {
  /** What the customer pays for the transfer, night and airport included. */
  price: number;
  /** The same without the night part, for the breakdown line. */
  dayPrice: number;
  nightTaxOutbound: number;
  nightTaxReturn: number;
  hasDistance: boolean;
};

/* ───────────────────────────── Banded model ─────────────────────────────
 *
 * The model from the pricing sheet (EasyTransfer_Precificacao_Dinamica.xlsx,
 * Nov 2026): a fixed base fare plus a per-km rate that tapers by distance
 * band, so the average €/km falls on long trips; then a night multiplier per
 * car, a lead-time surge per vehicle class and a channel factor for partner
 * checkouts. Every lever lives in siteSettings.pricing and in each car's
 * `tariff`, so the numbers can be tuned without a deploy.
 *
 * The only model since 2026-11-27: the linear one (price per km × distance,
 * flat 20% night fee) was removed. A car saved before the tariffs existed is
 * priced from its old per-km price and minimum (tariffOf) until the
 * migration gives it a tariff.
 */

/* A class key: "standard", "van", "large" or one created in Configurações →
   Preços (2026-11-28; they were these three, fixed). */
export type VehicleClass = string;

export type PricingConfig = {
  /** Slices of the distance; the last one has upToKm null (no ceiling). */
  bands: { upToKm: number | null; pct: number }[];
  /** The classes, in order, with the name people read. */
  classes: { key: string; name: string }[];
  /** The lead-time multipliers of each class, by key. */
  surge: Record<VehicleClass, { sameDay: number; lastMinute: number }>;
  /** At or beyond this many hours ahead there is no surge. */
  freeAfterHours: number;
  /** Below this many hours ahead it is last minute. */
  lastMinuteHours: number;
  /** Pickups in [from, to) local hours always pay the last-minute surge. */
  earlyMorningFrom: number;
  earlyMorningTo: number;
  /** Partner (hotel, white-label) checkouts, e.g. 1.15 = 15% commission built
      in. The default: a partner can have its own (priceMarkupPercent). */
  partnerFactor: number;
  /** The night window of the banded model, local hours [from, to). */
  nightFrom: number;
  nightTo: number;
  /** Luggage extras, euros per unit and per leg. */
  extras: { childSeat: number; surfboard: number; pet: number };
};

export const PRICING_DEFAULTS: PricingConfig = {
  bands: [
    { upToKm: 15, pct: 1 },
    { upToKm: 50, pct: 0.9 },
    { upToKm: 100, pct: 0.78 },
    { upToKm: null, pct: 0.68 },
  ],
  classes: [
    { key: "standard", name: "Standard" },
    { key: "van", name: "Van" },
    { key: "large", name: "Grande" },
  ],
  surge: {
    standard: { sameDay: 1.06, lastMinute: 1.12 },
    van: { sameDay: 1.1, lastMinute: 1.18 },
    large: { sameDay: 1.1, lastMinute: 1.2 },
  },
  freeAfterHours: 12,
  lastMinuteHours: 3,
  earlyMorningFrom: 0,
  earlyMorningTo: 7,
  partnerFactor: 1.15,
  nightFrom: 20,
  nightTo: 8,
  extras: { childSeat: 5, surfboard: 5, pet: 15 },
};

export type Tariff = {
  baseFare: number;
  ratePerKm: number;
  nightMultiplier: number;
  minimum: number;
};

/* To the cent, half up like the sheet's ROUND: 474.375 is 474.37499999… in
   floating point and Math.round alone gave 474.37 where the sheet says .38. */
const cents = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

/** Distance weighted by the bands: each slice of km pays its % of the rate. */
export function bandedKm(km: number, bands: PricingConfig["bands"]): number {
  let from = 0;
  let total = 0;
  for (const b of bands) {
    const to = b.upToKm ?? Infinity;
    if (km <= from) break;
    total += (Math.min(km, to) - from) * b.pct;
    from = to;
  }
  return total;
}

/** Base price of one leg, before night, surge and channel. */
export function tariffLeg(t: Tariff, km: number, bands: PricingConfig["bands"]): number {
  return Math.max(t.minimum, t.baseFare + t.ratePerKm * bandedKm(km, bands));
}

const LISBON_HOUR_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hourCycle: "h23" });

/**
 * "YYYY-MM-DD HH:mm" in Lisbon time (how departureDate is stored) to epoch ms.
 * The server runs in UTC; Lisbon is UTC or UTC+1.
 */
export function lisbonLocalToEpoch(local: string | undefined | null): number | null {
  const m = local ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(local) : null;
  if (!m) return null;
  const asUtc = Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`);
  if (!Number.isFinite(asUtc)) return null;
  const offset = (Number(LISBON_HOUR_FMT.format(asUtc)) - new Date(asUtc).getUTCHours() + 24) % 24;
  return asUtc - offset * 3_600_000;
}

/**
 * The lead-time surge for one pickup. Without a clock (`now`) there is no
 * surge: a quote never charges more because a field went missing.
 */
export function leadTimeSurge(
  pickupLocal: string | undefined | null,
  now: number | undefined,
  cls: VehicleClass,
  cfg: PricingConfig,
): number {
  /* A class that no longer exists pays no surge rather than a wrong one. */
  const s = cfg.surge[cls] ?? { sameDay: 1, lastMinute: 1 };
  const hm = pickupLocal ? /[ T](\d{2}):/.exec(pickupLocal) : null;
  if (hm) {
    const h = Number(hm[1]);
    if (h >= cfg.earlyMorningFrom && h < cfg.earlyMorningTo) return s.lastMinute;
  }
  if (now === undefined) return 1;
  const pickup = lisbonLocalToEpoch(pickupLocal);
  if (pickup === null) return 1;
  const hours = (pickup - now) / 3_600_000;
  if (hours >= cfg.freeAfterHours) return 1;
  if (hours > cfg.lastMinuteHours) return s.sameDay;
  return s.lastMinute;
}

export type TripInput = {
  /** The banded tariff; the old per-km fields only for cars not migrated yet. */
  vehicle: { tariff?: Tariff | null; pricePerKm?: number | null; minimumPrice?: number | null };
  vehicleClass: VehicleClass;
  config: PricingConfig;
  /** null on the main site; a partner's checkout pays its markup. */
  partner: { priceMarkupPercent?: number | null } | null;
  distance?: number | null;
  departureDate?: string | null;
  returnDate?: string | null;
  bookReturn?: boolean;
  isAirportPickup?: boolean;
  airportSurchargePercent?: number;
  /** Epoch ms of the quote (the browser's clock, or the time the car was chosen). */
  now?: number;
};

export type LegSnapshot = { base: number; airport: number; night: number; surge: number; channel: number; price: number };

export type TripPricing = LegPricing & { legs: LegSnapshot[] };

/* The night fee of the old model (+20%), for cars still without a tariff. */
const LEGACY_NIGHT_MULTIPLIER = 1.2;

/**
 * The car's tariff. A car saved before the tariffs existed gets one from its
 * old per-km price and minimum (no base fare, +20% at night, like before);
 * null when it has neither, and such a car is not offered.
 */
export function tariffOf(vehicle: TripInput["vehicle"]): Tariff | null {
  if (vehicle.tariff) return vehicle.tariff;
  if (vehicle.pricePerKm && vehicle.pricePerKm > 0) {
    return { baseFare: 0, ratePerKm: vehicle.pricePerKm, nightMultiplier: LEGACY_NIGHT_MULTIPLIER, minimum: vehicle.minimumPrice ?? 0 };
  }
  return null;
}

/**
 * The factor of a partner's checkout: its own markup when it has one
 * (partnerships.priceMarkupPercent, +10 = ×1.10), else the default of
 * Configurações → Preços. 1 on the main site.
 */
export function partnerFactorOf(partner: TripInput["partner"], config: Pick<PricingConfig, "partnerFactor">): number {
  if (!partner) return 1;
  const m = partner.priceMarkupPercent;
  return typeof m === "number" && Number.isFinite(m) ? 1 + m / 100 : config.partnerFactor;
}

/**
 * The price of a trip. The single entry point for the checkout
 * (vehicles.listQuoted), the payment check (lib/precoTransfer.ts) and the
 * back-office simulators: if they disagree the customer sees one price and
 * the payment is refused.
 */
export function priceTrip(input: TripInput): TripPricing {
  const { config } = input;
  const tariff = tariffOf(input.vehicle);
  const km = input.distance ?? 0;
  if (!tariff || !(km > 0)) {
    return { price: 0, dayPrice: 0, nightTaxOutbound: 0, nightTaxReturn: 0, hasDistance: false, legs: [] };
  }
  const channel = partnerFactorOf(input.partner, config);
  const base = tariffLeg(tariff, km, config.bands);
  const leg = (pickup: string | null | undefined, airport: boolean): LegSnapshot & { nightPart: number } => {
    const airportFactor = airport ? 1 + (input.airportSurchargePercent ?? 0) / 100 : 1;
    const night = isNightDeparture(pickup, config.nightFrom, config.nightTo) ? tariff.nightMultiplier : 1;
    const surge = leadTimeSurge(pickup, input.now, input.vehicleClass, config);
    /* In the sheet's order (Calculadora B22: base × period × surge ×
       channel), so the cents come out the same; the airport last. */
    const price = cents(base * night * surge * channel * airportFactor);
    const day = cents(base * surge * channel * airportFactor);
    return { base: cents(base), airport: airportFactor, night, surge, channel, price, nightPart: cents(price - day) };
  };
  const out = leg(input.departureDate, Boolean(input.isAirportPickup));
  const back = input.bookReturn ? leg(input.returnDate, false) : null;
  const price = cents(out.price + (back?.price ?? 0));
  const nightTaxOutbound = out.nightPart;
  const nightTaxReturn = back?.nightPart ?? 0;
  const strip = ({ nightPart: _n, ...l }: LegSnapshot & { nightPart: number }) => l;
  return {
    price,
    dayPrice: cents(price - nightTaxOutbound - nightTaxReturn),
    nightTaxOutbound,
    nightTaxReturn,
    hasDistance: true,
    legs: back ? [strip(out), strip(back)] : [strip(out)],
  };
}

/** siteSettings.pricing with the defaults filled in. */
export function pricingConfigOf(stored: (Partial<PricingConfig> & { model?: string }) | null | undefined): PricingConfig {
  /* `model` was the switch between the linear and the banded model. */
  const { model: _model, ...rest } = stored ?? {};
  const classes = stored?.classes?.length ? stored.classes : PRICING_DEFAULTS.classes;
  return {
    ...PRICING_DEFAULTS,
    ...rest,
    classes,
    /* Only the classes that exist: a removed one came back from the defaults. */
    surge: Object.fromEntries(classes.map((c) => [c.key, stored?.surge?.[c.key] ?? PRICING_DEFAULTS.surge[c.key] ?? { sameDay: 1, lastMinute: 1 }])),
    extras: { ...PRICING_DEFAULTS.extras, ...(stored?.extras ?? {}) },
  };
}
