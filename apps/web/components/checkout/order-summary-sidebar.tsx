"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Users,
  Briefcase,
  Car,
  ChevronDown,
  CalendarClock,
  MapPinCheckInside,
  MapPin,
  Info,
  CheckCircle2,
  Pencil,
  PawPrint,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { getDailyNumber } from "@/lib/daily-number";
import { useMarketingStats } from "@/hooks/use-marketing-stats";
import { RouteMap, AnimatedCollapse } from "./shared";
import { useCheckout } from "./checkout-context";
import { VehicleInfoTooltip } from "./vehicle-info-tooltip";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { formatPrice, formatTime, truncateAddress, extractCity, calculateTotalLuggage, calculatePriceBreakdown, splitInvoiceWithNightTax } from "@/lib/format";
import { insurancePrice, calcExtras } from "@/components/checkout/pricing";
import { cn } from "@workspace/ui/lib/utils";
import { useMoney } from "@/components/currency-provider";
import { useExtraPrices } from "@/hooks/use-site-settings"

const SERIF_FONT = { fontFamily: "var(--font-title), 'Cormorant Garamond', serif" };

interface OrderSummarySidebarProps {
  /** When true, renders a compact header by default and expands the body on tap. */
  collapsible?: boolean;
}

export function OrderSummarySidebar({ collapsible = false }: OrderSummarySidebarProps = {}) {
  const t = useTranslations("orderSummary");
  const tCommon = useTranslations("common");
  const { checkoutBookedTodayMin, checkoutBookedTodayMax } = useMarketingStats();
  const { formatDate, formatDateTime } = useDateFormatter();
  const { state, setStep, setShowTransferForm } = useCheckout();
  const extraPrices = useExtraPrices()
  const { selectedVehicle, transfer, orderId, payment, experiences } = state;

  const [isExpanded, setIsExpanded] = useState(!collapsible);
  const [isItineraryExpanded, setIsItineraryExpanded] = useState(false);
  const [showVehicleInfo, setShowVehicleInfo] = useState(false);
  const [isInvoiceExpanded, setIsInvoiceExpanded] = useState(false);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [dailyBookedCount, setDailyBookedCount] = useState(() =>
    getDailyNumber("checkout-booked", checkoutBookedTodayMin, checkoutBookedTodayMax),
  );

  useEffect(() => {
    const updateDailyBookedCount = () => {
      setDailyBookedCount(
        getDailyNumber("checkout-booked", checkoutBookedTodayMin, checkoutBookedTodayMax),
      );
    };
    updateDailyBookedCount();
    const interval = setInterval(updateDailyBookedCount, 3600000);
    return () => clearInterval(interval);
  }, [checkoutBookedTodayMin, checkoutBookedTodayMax]);

  const basePrice = selectedVehicle?.price ?? 0;
  const isRoundTrip = transfer.bookReturn;
  const { format, isEur } = useMoney();
  const baseTotalPrice = basePrice;
  const nightTaxAmount = selectedVehicle?.nightTaxAmount ?? 0;

  const premiumInsurancePrice = payment.premiumInsurance ? insurancePrice("premiumInsurance", isRoundTrip) : 0;
  const refundTermsPrice = payment.refundTerms ? insurancePrice("refundTerms", isRoundTrip) : 0;
  const priorityPickupPrice = payment.priorityPickup ? insurancePrice("priorityPickup", isRoundTrip) : 0;
  const comfortConnectionPrice = payment.comfortConnection ? insurancePrice("comfortConnection", isRoundTrip) : 0;
  const insuranceTotal = premiumInsurancePrice + refundTermsPrice + priorityPickupPrice + comfortConnectionPrice;
  const cardFeeRate = 0; // taxa de cartão removida (Stripe escolhe o método; sobretaxa proibida na UE)

  const passengers = transfer.passengers;
  const luggage = calculateTotalLuggage(transfer.luggage);
  // Luggage extras — shared with the payment charge so the invoice == the charge. See ./pricing.
  const { childSeats, surfboards, pets, childSeatsCost, surfboardsCost, petsCost, total: extrasTotal } =
    calcExtras(transfer, isRoundTrip, extraPrices);

  const experiencesTotal = experiences.reduce((sum, exp) => sum + exp.totalPrice, 0);
  const tipAmount = state.tipAmount ?? 0;

  const priceBreakdownWithExtras = calculatePriceBreakdown({
    basePrice: baseTotalPrice,
    cardFeeRate,
    insuranceTotal: insuranceTotal + extrasTotal,
  });
  const totalPriceWithExtras =
    priceBreakdownWithExtras.total + experiencesTotal + tipAmount;

  const outboundPrice = isRoundTrip ? totalPriceWithExtras / 2 : totalPriceWithExtras;
  const returnPrice = isRoundTrip ? totalPriceWithExtras / 2 : 0;

  const fromLocation = { address: transfer.fromLocation || t("notSelected") };
  const toLocation = { address: transfer.toLocation || t("notSelected") };

  const tripIcons = {
    passengers,
    luggage: luggage > 0 ? luggage : undefined,
    surfboards: surfboards > 0 ? surfboards : undefined,
    childSeats: childSeats > 0 ? childSeats : undefined,
    pets: pets > 0 ? pets : undefined,
  };

  const { transfer: transferDisplay, nightTax: nightTaxDisplay } =
    splitInvoiceWithNightTax({
      netTransferPrice: priceBreakdownWithExtras.transferPrice,
      nightTaxAmount,
    });

  const invoiceItems: Array<{ key: string; value: string; isBold?: boolean }> = [
    {
      key: isRoundTrip ? "transferRoundTrip" : "transferOneWay",
      value: formatPrice(transferDisplay),
    },
    { key: "tax", value: formatPrice(priceBreakdownWithExtras.tax) },
  ];

  if (nightTaxAmount > 0) {
    invoiceItems.push({ key: "nightTax", value: formatPrice(nightTaxDisplay) });
  }
  if (priceBreakdownWithExtras.refundTax > 0) {
    invoiceItems.push({
      key: "refundTax",
      value: formatPrice(priceBreakdownWithExtras.refundTax),
    });
  }
  experiences.forEach((exp) => {
    invoiceItems.push({ key: exp.title, value: formatPrice(exp.totalPrice) });
  });
  if (childSeats > 0) {
    invoiceItems.push({ key: "childSeats", value: formatPrice(childSeatsCost) });
  }
  if (surfboards > 0) {
    invoiceItems.push({ key: "surfboards", value: formatPrice(surfboardsCost) });
  }
  if (pets > 0) {
    invoiceItems.push({ key: "pets", value: formatPrice(petsCost) });
  }
  if (tipAmount > 0) {
    invoiceItems.push({ key: "tip", value: formatPrice(tipAmount) });
  }
  if (payment.premiumInsurance) {
    invoiceItems.push({ key: "premiumInsurance", value: formatPrice(premiumInsurancePrice) });
  }
  if (payment.refundTerms) {
    invoiceItems.push({ key: "refundTerms", value: formatPrice(refundTermsPrice) });
  }
  if (payment.priorityPickup) {
    invoiceItems.push({ key: "priorityPickup", value: formatPrice(priorityPickupPrice) });
  }
  if (payment.comfortConnection) {
    invoiceItems.push({ key: "comfortConnection", value: formatPrice(comfortConnectionPrice) });
  }
  if (payment.method === "cartao" && priceBreakdownWithExtras.cardFee > 0) {
    invoiceItems.push({
      key: "cardFee",
      value: formatPrice(priceBreakdownWithExtras.cardFee),
    });
  }
  invoiceItems.push({
    key: isRoundTrip ? "subtotalRoundTrip" : "subtotalOneWay",
    value: formatPrice(totalPriceWithExtras),
    isBold: true,
  });

  const handleEditTrip = () => {
    setShowTransferForm(true);
    setStep(1);
  };

  const stopsCount = transfer.stops.length;
  const formattedDate = transfer.departureDate ? formatDate(transfer.departureDate) : null;
  const departureTime = transfer.departureDate ? formatTime(transfer.departureDate) : null;
  const estimatedArrival =
    transfer.departureDate && routeDuration !== null
      ? formatTime(new Date(transfer.departureDate).getTime() + routeDuration * 60000)
      : null;
  const euros = Math.floor(totalPriceWithExtras);
  const finalAmount = totalPriceWithExtras.toFixed(0);

  const headerNode = (
    <div className="flex items-start justify-between w-full gap-3">
      <div className="flex flex-col gap-3.5 min-w-0 flex-1">
        <h2
          className="text-[24px] font-semibold text-[var(--ck-text,#f7f4ef)] leading-none"
          style={SERIF_FONT}
        >
          {t("title")}
        </h2>
        <p className="text-[12px] text-[rgba(var(--ck-text-rgb,247,244,239),0.38)] leading-[14.85px]">
          {t("orderNumber")} <span>{orderId || "—"}</span>
        </p>
      </div>
      {collapsible && (
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-baseline text-[var(--ck-accent,#c9a96e)]">
            <span className="text-[18px] font-medium leading-none">€</span>
            <span className="text-[18px] font-bold leading-none">{euros}</span>
          </div>
          <span className="flex size-9 items-center justify-center border border-[rgba(var(--ck-accent-rgb,201,169,110),0.4)] bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.12)] transition-colors">
            <ChevronDown
              className={cn(
                "size-4 text-[var(--ck-accent,#c9a96e)] transition-transform duration-300",
                isExpanded && "rotate-180",
              )}
              strokeWidth={1.75}
            />
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-6 pt-8 text-[var(--ck-text,#f7f4ef)] border-x border-b border-[rgba(var(--ck-text-rgb,255,255,255),0.12)]",
        collapsible && !isExpanded ? "pb-4" : "pb-8",
      )}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="w-full text-left"
          aria-expanded={isExpanded}
        >
          {headerNode}
        </button>
      ) : (
        <header className="w-full">{headerNode}</header>
      )}

      {collapsible && !isExpanded && (
        <div className="flex flex-wrap items-center gap-1.5 w-full">
          <CompactBadge icon={Users} label={String(passengers)} />
          <CompactBadge icon={Briefcase} label={String(luggage)} />
          {selectedVehicle && (
            <CompactBadge icon={Car} label={selectedVehicle.name} />
          )}
          <CompactBadge
            icon={MapPinCheckInside}
            label={`${stopsCount} ${t("stopsLabel")}`}
          />
        </div>
      )}

      <AnimatedCollapse isOpen={isExpanded}>
        <div className="flex flex-col gap-3 pt-1">
      <section className="bg-[var(--ck-surface,#1a1918)] flex flex-col gap-2 px-4 py-3 w-full">
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] font-semibold text-[var(--ck-text,#f7f4ef)] leading-none">
            {isRoundTrip ? t("totalRoundTrip") : t("total")}
          </span>
          <div className="flex items-baseline text-[var(--ck-text,#f7f4ef)]">
            <span className="text-[18px] font-medium leading-none">€</span>
            <span className="text-[18px] font-bold leading-[19.97px]">{euros}</span>
          </div>
        </div>

        {formattedDate && (
          <div className="inline-flex self-start items-center gap-2 bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.22)] pl-2 pr-3 py-1">
            <CalendarClock className="size-4 text-[var(--ck-accent,#c9a96e)]" strokeWidth={1.5} />
            <span className="text-[12px] font-semibold uppercase tracking-[0.72px] text-[var(--ck-accent,#c9a96e)]">
              {formattedDate}
            </span>
          </div>
        )}

        <div className="flex flex-col w-full pt-1">
          <ItineraryPreviewRow
            accent
            label={truncateAddress(transfer.fromLocation, 26) || t("selectOrigin")}
            time={departureTime ?? "—"}
          />
          {transfer.stops.map((stop, i) => (
            <ItineraryPreviewRow
              key={`${stop.text}-${i}`}
              label={truncateAddress(stop.text, 24) || `${t("stop")} ${i + 1}`}
              small
            />
          ))}
          <ItineraryPreviewRow
            accent
            label={truncateAddress(transfer.toLocation, 26) || t("selectDestination")}
            time={estimatedArrival ?? "—"}
            last
          />
        </div>
      </section>

      {selectedVehicle && (
        <section className="flex flex-col gap-4 py-4 border-b border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] w-full">
          <p className="text-[12px] font-bold uppercase tracking-[1.152px] text-[var(--ck-text-muted,#999)] leading-none">
            {t("selectedCar")}
          </p>
          <div className="flex items-start justify-between w-full gap-3">
            <div className="flex flex-col min-w-0 flex-1">
              <div className="relative h-[84px] w-[132px]">
                <Image
                  src={selectedVehicle.image || "/shared/placeholder-experience.webp"}
                  alt={selectedVehicle.name}
                  fill
                  sizes="132px"
                  className="object-contain object-left"
                />
              </div>
              <div className="flex items-center gap-1 mt-2">
                <div className="bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.22)] inline-flex items-center pl-2 py-1">
                  <Users className="size-4 text-[var(--ck-accent,#c9a96e)]" strokeWidth={1.5} />
                  <span className="px-2 text-[14px] font-medium text-[var(--ck-accent,#c9a96e)] leading-none">
                    {passengers}
                  </span>
                </div>
                <div className="bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.22)] inline-flex items-center pl-2 py-1">
                  <Briefcase className="size-4 text-[var(--ck-accent,#c9a96e)]" strokeWidth={1.5} />
                  <span className="px-2 text-[14px] font-medium text-[var(--ck-accent,#c9a96e)] leading-none">
                    {luggage || selectedVehicle.luggage}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end justify-between self-stretch gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[18px] font-bold tracking-[0.9px] text-[var(--ck-text,#f7f4ef)] leading-none">
                  {selectedVehicle.name}
                </span>
                <button
                  type="button"
                  onClick={() => setShowVehicleInfo(true)}
                  aria-label={t("selectedCar")}
                  className="p-0 text-[rgba(var(--ck-text-rgb,247,244,239),0.55)] hover:text-[var(--ck-accent,#c9a96e)] transition-colors"
                >
                  <Info className="size-6" strokeWidth={1.5} />
                </button>
                {showVehicleInfo && (
                  <VehicleInfoTooltip
                    vehicleName={selectedVehicle.name}
                    examples={selectedVehicle.examples}
                    onClose={() => setShowVehicleInfo(false)}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTransferForm(false);
                  setStep(1);
                }}
                className="h-10 px-8 bg-[var(--ck-accent,#c9a96e)] hover:bg-[var(--ck-accent-hover,#b89558)] border border-[var(--ck-accent,#c9a96e)] text-[#0D0D0D] uppercase tracking-[1.1px] text-[14px] font-medium transition-colors"
              >
                {tCommon("edit")}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4 border-b border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] py-4 w-full">
        <button
          type="button"
          onClick={() => setIsItineraryExpanded(!isItineraryExpanded)}
          className="flex h-8 items-center justify-between w-full"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-[12px] font-bold uppercase tracking-[1.152px] text-[var(--ck-text-muted,#999)] leading-none">
              {t("itinerary")}
            </span>
            <div className="inline-flex items-center gap-1.5 bg-[rgba(var(--ck-accent-rgb,201,169,110),0.18)] px-2 py-1 rounded-[2px]">
              <MapPinCheckInside className="size-[14px] text-[var(--ck-accent,#c9a96e)]" strokeWidth={1.75} />
              <span className="text-[12px] font-medium text-[var(--ck-accent,#c9a96e)] leading-none tracking-[0.2px]">
                {stopsCount} {t("stopsLabel")}
              </span>
            </div>
          </div>
          <ChevronButton open={isItineraryExpanded} />
        </button>
        <AnimatedCollapse isOpen={isItineraryExpanded}>
          <div className="flex flex-col gap-4 pt-1">
            <TripLeg
              title={t("outbound")}
              dateLabel={transfer.departureDate ? formatDateTime(transfer.departureDate) : "—"}
              fromAddress={transfer.fromLocation || t("notSelected")}
              fromCity={extractCity(transfer.fromLocation)}
              toAddress={transfer.toLocation || t("notSelected")}
              toCity={extractCity(transfer.toLocation)}
              price={outboundPrice}
              icons={tripIcons}
              editLabel={tCommon("edit")}
              onEdit={handleEditTrip}
            />
            {transfer.stops.map((stop, i) => (
              <div key={`stop-${i}`} className="flex flex-col gap-4">
                <DashedDivider />
                <TripLeg
                  title={t("stop")}
                  fromAddress={stop.text || t("notSelected")}
                  fromCity={extractCity(stop.text)}
                  toAddress={stop.text || t("notSelected")}
                  toCity={extractCity(stop.text)}
                />
              </div>
            ))}
            {transfer.bookReturn && (
              <>
                <DashedDivider />
                <TripLeg
                  title={t("return")}
                  dateLabel={transfer.returnDate ? formatDateTime(transfer.returnDate) : "—"}
                  fromAddress={transfer.toLocation || t("notSelected")}
                  fromCity={extractCity(transfer.toLocation)}
                  toAddress={transfer.fromLocation || t("notSelected")}
                  toCity={extractCity(transfer.fromLocation)}
                  price={returnPrice}
                  icons={tripIcons}
                  editLabel={tCommon("edit")}
                  onEdit={handleEditTrip}
                />
              </>
            )}
          </div>
        </AnimatedCollapse>
      </section>

      <section className="flex flex-col gap-4 border-b border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] py-4 w-full">
        <button
          type="button"
          onClick={() => setIsInvoiceExpanded(!isInvoiceExpanded)}
          className="flex h-8 items-center justify-between w-full"
        >
          <span className="text-[12px] font-bold uppercase tracking-[1.152px] text-[var(--ck-text-muted,#999)] leading-none">
            {t("invoice")}
          </span>
          <ChevronButton open={isInvoiceExpanded} />
        </button>
        <AnimatedCollapse isOpen={isInvoiceExpanded}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.12em] text-[rgba(var(--ck-text-rgb,247,244,239),0.38)]">
              <span>{t("itemDescription")}</span>
              <span>{t("price")}</span>
            </div>
            <div className="flex flex-col gap-2">
              {invoiceItems.map((item, index) => {
                const isLocalKey =
                  item.key.startsWith("transfer") ||
                  item.key.startsWith("tax") ||
                  item.key.startsWith("refund") ||
                  item.key.startsWith("subtotal") ||
                  [
                    "cardFee",
                    "premiumInsurance",
                    "refundTerms",
                    "priorityPickup",
                    "comfortConnection",
                    "childSeats",
                    "surfboards",
                    "pets",
                    "tip",
                    "nightTax",
                  ].includes(item.key);
                return (
                  <div
                    key={`${item.key}-${index}`}
                    className={cn(
                      "flex items-center justify-between text-[12px]",
                      item.isBold ? "text-[var(--ck-text,#f7f4ef)] font-bold pt-2 border-t border-[rgba(var(--ck-text-rgb,255,255,255),0.08)]" : "text-[var(--ck-text-muted,#999)]",
                    )}
                  >
                    <span className={item.isBold ? "font-bold" : "font-normal"}>
                      {isLocalKey ? t(item.key) : item.key}
                    </span>
                    <span className={item.isBold ? "font-bold text-[var(--ck-accent,#c9a96e)]" : "font-medium"}>{item.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </AnimatedCollapse>
      </section>

      <div className="flex flex-col gap-2 items-end w-full py-2">
        <p
          className="text-[24px] font-bold text-[var(--ck-accent,#c9a96e)] leading-none"
          style={SERIF_FONT}
        >
          €{finalAmount}
        </p>
        {!isEur && (
          <p className="text-[13px] text-[var(--ck-text-muted,#999)] leading-none">
            ≈ {format(totalPriceWithExtras)}
          </p>
        )}
        <div className="flex flex-col items-end gap-1 text-[14px] text-[var(--ck-text-muted,#999)]">
          <span>{t("totalPrice")}</span>
          <span>{t("taxesIncluded")}</span>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-[rgba(46,125,82,0.08)] border border-[rgba(46,125,82,0.2)] p-[12.8px] w-full">
        <CheckCircle2 className="size-[18px] text-[#2E7D52] shrink-0 mt-px" strokeWidth={1.5} />
        <p className="flex-1 min-w-0 text-[12px] leading-[18.43px]">
          <span className="font-bold text-[#2E7D52]">{t("freeCancellation")}</span>
          <br />
          <span className="font-normal text-[var(--ck-text,#f7f4ef)]">{t("freeCancellationDesc")}</span>
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 text-[12px] text-[var(--ck-text-muted,#808080)]">
        <span className="text-base leading-none">🔥</span>
        <span>{t("bookedToday", { count: dailyBookedCount })}</span>
      </div>

      <section className="flex flex-col gap-3 border-t border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] pt-6 mt-2 w-full">
        <h3
          className="text-[24px] font-semibold text-[var(--ck-text,#f7f4ef)] leading-none"
          style={SERIF_FONT}
        >
          {t("map")}
        </h3>
        {(transfer.fromLocation || transfer.toLocation) && (
          <p className="text-[12px] text-[rgba(var(--ck-text-rgb,247,244,239),0.38)] leading-[14.85px]">
            <span className="font-semibold uppercase tracking-[0.06em]">{t("route")}</span>{" "}
            {routeDistance !== null && <>{routeDistance.toFixed(0)} km</>}
            {routeDistance !== null && routeDuration !== null && ", "}
            {routeDuration !== null && <>{routeDuration} min</>}
          </p>
        )}
        <RouteMap
          from={{ lat: transfer.fromLat, lng: transfer.fromLng, address: transfer.fromLocation }}
          to={{ lat: transfer.toLat, lng: transfer.toLng, address: transfer.toLocation }}
          stops={transfer.stops.map((s) => ({ lat: s.lat, lng: s.lng, address: s.text }))}
          className="h-[242px] rounded-[5px] overflow-hidden"
          onRouteCalculated={(distance, duration) => {
            setRouteDistance(distance);
            setRouteDuration(duration);
          }}
        />
      </section>
        </div>
      </AnimatedCollapse>
    </div>
  );
}

function CompactBadge({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="bg-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.22)] inline-flex items-center pl-2 py-1">
      <Icon className="size-4 text-[var(--ck-accent,#c9a96e)]" strokeWidth={1.5} />
      <span className="px-2 text-[14px] font-medium text-[var(--ck-accent,#c9a96e)] leading-none">
        {label}
      </span>
    </div>
  );
}

function ChevronButton({ open }: { open: boolean }) {
  return (
    <span className="flex size-8 items-center justify-center border border-[rgba(var(--ck-accent-tint-rgb,154,117,53),0.22)] p-px transition-colors hover:border-[var(--ck-accent,#c9a96e)]">
      <ChevronDown
        className={cn("size-4 text-[var(--ck-accent,#c9a96e)] transition-transform duration-300", open && "rotate-180")}
        strokeWidth={1.75}
      />
    </span>
  );
}

interface TripLegIcons {
  passengers?: number;
  luggage?: number;
  surfboards?: number;
  childSeats?: number;
  pets?: number;
}

interface TripLegProps {
  title: string;
  dateLabel?: string;
  fromAddress: string;
  fromCity: string;
  toAddress: string;
  toCity: string;
  price?: number;
  icons?: TripLegIcons;
  editLabel?: string;
  onEdit?: () => void;
}

function TripLeg({
  title,
  dateLabel,
  fromAddress,
  fromCity,
  toAddress,
  toCity,
  price,
  icons,
  editLabel,
  onEdit,
}: TripLegProps) {
  const hasDate = !!dateLabel;
  const hasEdit = !!editLabel && !!onEdit;
  const hasIcons = !!icons && Object.values(icons).some((v) => (v ?? 0) > 0);

  return (
    <div className="flex flex-col gap-[11.568px]">
      <div className="bg-[var(--ck-surface,#1a1a1a)] flex items-center justify-between px-4 py-1.5 w-full">
        <span className="text-[14px] font-bold uppercase text-[var(--ck-text-muted,#999)] leading-normal">
          {title}
        </span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex flex-col items-start", hasDate ? "gap-4" : "gap-0")}>
          {hasDate && (
            <p className="text-[14px] font-bold uppercase text-[var(--ck-text,#f7f4ef)] leading-normal">
              {dateLabel}
            </p>
          )}

          <div className="flex gap-[8.153px] items-stretch">
            <div className="flex flex-col items-center pt-[3px] pb-[46px] gap-[2px]">
              <MapPin className="size-4 text-[var(--ck-accent,#c9a96e)] shrink-0" strokeWidth={1.75} />
              <span
                className="flex-1 w-px border-l border-dashed border-[rgba(var(--ck-accent-rgb,201,169,110),0.6)]"
                aria-hidden
              />
              <MapPin className="size-4 text-[var(--ck-accent,#c9a96e)] shrink-0" strokeWidth={1.75} />
            </div>

            <div className="flex flex-col gap-[37.708px] text-[12px]">
              <div className="flex flex-col gap-2">
                <p className="font-medium leading-[1.2] text-[var(--ck-text-muted,#999)] break-words">
                  {fromAddress}
                </p>
                {fromCity && (
                  <p className="font-normal leading-normal text-[var(--ck-text-subtle,#696969)] break-words">
                    {fromCity}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="font-medium leading-[1.2] text-[var(--ck-text-muted,#999)] break-words">
                  {toAddress}
                </p>
                {toCity && (
                  <p className="font-normal leading-normal text-[var(--ck-text-subtle,#696969)] break-words">
                    {toCity}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={cn("flex flex-col items-end shrink-0", hasEdit ? "gap-[17px]" : "gap-0")}>
          {hasEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-[2.892px] text-[12px] font-medium uppercase text-[var(--ck-accent,#c9a96e)] hover:text-[var(--ck-accent-hover,#b89558)] transition-colors leading-normal"
            >
              <span>{editLabel}</span>
              <Pencil className="size-3" strokeWidth={1.75} />
            </button>
          )}
          {price !== undefined && (
            <p className="text-[14px] font-bold text-[var(--ck-accent,#c9a96e)] whitespace-nowrap leading-normal">
              {formatPrice(price)}
            </p>
          )}
        </div>
      </div>

      {hasIcons && icons && <TripLegIconsRow icons={icons} />}
    </div>
  );
}

function TripLegIconsRow({ icons }: { icons: TripLegIcons }) {
  const items: Array<{ kind: "lucide" | "svg"; render: () => React.ReactNode; value: number }> = [];

  if ((icons.passengers ?? 0) > 0) {
    items.push({
      kind: "lucide",
      render: () => <Users className="size-6 text-[var(--ck-text-muted,#999)]" strokeWidth={1.5} />,
      value: icons.passengers!,
    });
  }
  if ((icons.luggage ?? 0) > 0) {
    items.push({
      kind: "lucide",
      render: () => <Briefcase className="size-6 text-[var(--ck-text-muted,#999)]" strokeWidth={1.5} />,
      value: icons.luggage!,
    });
  }
  if ((icons.surfboards ?? 0) > 0) {
    items.push({
      kind: "svg",
      render: () => (
        <Image
          src="/checkout/icons/surfboard-checkout.png"
          alt=""
          width={24}
          height={24}
          className="size-6"
        />
      ),
      value: icons.surfboards!,
    });
  }
  if ((icons.childSeats ?? 0) > 0) {
    items.push({
      kind: "svg",
      render: () => (
        <Image
          src="/checkout/icons/baby-seat.svg"
          alt=""
          width={24}
          height={24}
          className="size-6"
        />
      ),
      value: icons.childSeats!,
    });
  }
  if ((icons.pets ?? 0) > 0) {
    items.push({
      kind: "lucide",
      render: () => <PawPrint className="size-6 text-[var(--ck-text-muted,#999)]" strokeWidth={1.5} />,
      value: icons.pets!,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-6 px-[35px] py-4 w-full">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 shrink-0">
          {item.render()}
          <span className="text-[14px] font-medium text-[var(--ck-text,#f7f4ef)] leading-normal">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function DashedDivider() {
  return (
    <div
      className="h-px w-full border-t border-dashed border-[rgba(var(--ck-text-rgb,255,255,255),0.12)]"
      aria-hidden
    />
  );
}

interface ItineraryPreviewRowProps {
  label: string;
  time?: string;
  accent?: boolean;
  small?: boolean;
  last?: boolean;
}

function ItineraryPreviewRow({ label, time, accent, small, last }: ItineraryPreviewRowProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 w-full">
        <span
          className={cn(
            "size-2 shrink-0",
            accent ? "bg-[var(--ck-accent,#c9a96e)]" : "bg-[var(--ck-text-muted,#999)]",
          )}
        />
        <p
          className={cn(
            "flex-1 min-w-0 truncate not-italic",
            small ? "text-[10px]" : "text-[12px]",
            "text-[var(--ck-text-muted,#999)] font-normal",
          )}
        >
          {label}
        </p>
        {time && (
          <p className="text-[12px] font-medium text-[var(--ck-text-muted,#999)] text-right whitespace-nowrap">{time}</p>
        )}
      </div>
      {!last && <span className="ml-[3px] h-[10px] w-px bg-[rgba(153,153,153,0.35)]" aria-hidden />}
    </div>
  );
}
