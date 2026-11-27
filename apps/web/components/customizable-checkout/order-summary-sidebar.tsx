"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@workspace/ui/components/button";
import {
  Users,
  Briefcase,
  ChevronDown,
  MapPin,
  CalendarClock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { getDailyNumber } from "@/lib/daily-number";
import { useMarketingStats } from "@/hooks/use-marketing-stats";
import {
  TripIconsRow,
  InvoiceLineItem,
  RouteMap,
  TripSegment,
  AnimatedCollapse,
  FreeCancellationBanner,
} from "./shared";
import { useCheckout } from "./checkout-context";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { formatPrice, formatPriceShort, formatTime, truncateAddress, extractCity, calculateTotalLuggage, calculatePriceBreakdown, splitInvoiceWithNightTax } from "@/lib/format";
import { insurancePrice, calcExtras } from "@/components/customizable-checkout/pricing";
import { useExtraPrices } from "@/hooks/use-site-settings"

export function OrderSummarySidebar() {
  const t = useTranslations("orderSummary");
  const tCommon = useTranslations("common");
  const { checkoutBookedTodayMin, checkoutBookedTodayMax } =
    useMarketingStats();
  const { formatDate } = useDateFormatter();
  const { state, setStep, setShowTransferForm } = useCheckout();
  const extraPrices = useExtraPrices()
  const { selectedVehicle, transfer, orderId, payment, experiences } = state;

  const [isItineraryExpanded, setIsItineraryExpanded] = useState(false);
  const [isInvoiceExpanded, setIsInvoiceExpanded] = useState(false);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [dailyBookedCount, setDailyBookedCount] = useState(() =>
    getDailyNumber(
      "checkout-booked",
      checkoutBookedTodayMin,
      checkoutBookedTodayMax,
    ),
  );

  useEffect(() => {
    const updateDailyBookedCount = () => {
      setDailyBookedCount(
        getDailyNumber(
          "checkout-booked",
          checkoutBookedTodayMin,
          checkoutBookedTodayMax,
        ),
      );
    };
    updateDailyBookedCount();
    const interval = setInterval(updateDailyBookedCount, 3600000);
    return () => clearInterval(interval);
  }, [checkoutBookedTodayMin, checkoutBookedTodayMax]);

  const basePrice = selectedVehicle?.price ?? 0;
  const isRoundTrip = transfer.bookReturn;
  const baseTotalPrice = basePrice;
  const nightTaxAmount = selectedVehicle?.nightTaxAmount ?? 0;

  const premiumInsurancePrice = payment.premiumInsurance ? insurancePrice("premiumInsurance", isRoundTrip) : 0;
  const refundTermsPrice = payment.refundTerms ? insurancePrice("refundTerms", isRoundTrip) : 0;
  const comfortConnectionPrice = payment.comfortConnection ? insurancePrice("comfortConnection", isRoundTrip) : 0;
  const insuranceTotal =
    premiumInsurancePrice + refundTermsPrice + comfortConnectionPrice;
  const cardFeeRate = payment.method === "cartao" ? 0.02 : 0;

  const passengers = transfer.passengers;
  const luggage = calculateTotalLuggage(transfer.luggage);
  // Luggage extras — shared with the payment charge so the invoice == the charge. See ./pricing.
  const { childSeats, surfboards, pets, childSeatsCost, surfboardsCost, petsCost, total: extrasTotal } =
    calcExtras(transfer, isRoundTrip, extraPrices);

  const experiencesTotal = experiences.reduce(
    (sum, exp) => sum + exp.totalPrice,
    0,
  );
  const tipAmount = state.tipAmount ?? 0;

  // Calculate price breakdown with all fees and extras included in rounding
  const priceBreakdownWithExtras = calculatePriceBreakdown({
    basePrice: baseTotalPrice,
    cardFeeRate,
    insuranceTotal: insuranceTotal + extrasTotal,
  });
  const totalPriceWithExtras =
    priceBreakdownWithExtras.total + experiencesTotal + tipAmount;

  // Para round trip, dividir o preço entre outbound e return
  const outboundPrice = isRoundTrip
    ? totalPriceWithExtras / 2
    : totalPriceWithExtras;
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

  // Transfer line: only day price (pre-IVA); imposto de noite has its own line
  const { transfer: transferDisplay, nightTax: nightTaxDisplay } =
    splitInvoiceWithNightTax({
      netTransferPrice: priceBreakdownWithExtras.transferPrice,
      nightTaxAmount,
    });

  const invoiceItems: Array<{ key: string; value: string; isBold?: boolean }> =
    [
      {
        key: isRoundTrip ? "transferRoundTrip" : "transferOneWay",
        value: formatPrice(transferDisplay),
      },
      {
        key: "tax",
        value: formatPrice(priceBreakdownWithExtras.tax),
      },
    ];

  if (nightTaxAmount > 0) {
    invoiceItems.push({
      key: "nightTax",
      value: formatPrice(nightTaxDisplay),
    });
  }

  if (priceBreakdownWithExtras.refundTax > 0) {
    invoiceItems.push({
      key: "refundTax",
      value: formatPrice(priceBreakdownWithExtras.refundTax),
    });
  }

  // Add experiences if selected
  experiences.forEach((exp) => {
    invoiceItems.push({ key: exp.title, value: formatPrice(exp.totalPrice) });
  });

  // Add extras items if selected
  if (childSeats > 0) {
    invoiceItems.push({
      key: "childSeats",
      value: formatPrice(childSeatsCost),
    });
  }

  if (surfboards > 0) {
    invoiceItems.push({
      key: "surfboards",
      value: formatPrice(surfboardsCost),
    });
  }

  if (pets > 0) {
    invoiceItems.push({
      key: "pets",
      value: formatPrice(petsCost),
    });
  }

  if (tipAmount > 0) {
    invoiceItems.push({
      key: "tip",
      value: formatPrice(tipAmount),
    });
  }

  // Add discount/coupon if applied (must be after extras to avoid confusion)
  // TODO: Add discount calculation and invoice item here when implemented

  // Add insurance items if selected
  if (payment.premiumInsurance) {
    invoiceItems.push({
      key: "premiumInsurance",
      value: formatPrice(premiumInsurancePrice),
    });
  }

  if (payment.refundTerms) {
    invoiceItems.push({
      key: "refundTerms",
      value: formatPrice(refundTermsPrice),
    });
  }

  if (payment.comfortConnection) {
    invoiceItems.push({
      key: "comfortConnection",
      value: formatPrice(comfortConnectionPrice),
    });
  }

  // Add card fee if applicable
  if (payment.method === "cartao" && priceBreakdownWithExtras.cardFee > 0) {
    invoiceItems.push({
      key: "cardFee",
      value: formatPrice(priceBreakdownWithExtras.cardFee),
    });
  }

  // Total always at the end
  invoiceItems.push({
    key: isRoundTrip ? "subtotalRoundTrip" : "subtotalOneWay",
    value: formatPrice(totalPriceWithExtras),
    isBold: true,
  });

  // Se for round trip (bookReturn = true), mostra 2 stops. Se for one way, mostra 1 stop
  const stopsCount = isRoundTrip ? 2 : 1;

  const estimatedArrival =
    transfer.departureDate && routeDuration !== null
      ? formatTime(
          new Date(transfer.departureDate).getTime() + routeDuration * 60000,
        )
      : null;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="mb-6">
          <h2 className="text-[20px] font-bold text-[#222222] mb-1">
            {t("title")}
          </h2>
          <p className="text-[13px] text-[#222222]">
            {t("orderNumber")}{" "}
            <span className="text-[#808080]">{orderId || "—"}</span>
          </p>
        </div>

        <div className="bg-[#f3f4f4] rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[18px] font-bold text-[#222222]">
              {isRoundTrip ? t("totalRoundTrip") : t("total")}
            </span>
            <span className="text-[32px] font-bold text-[#222222]">
              {formatPriceShort(totalPriceWithExtras)}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-[#e9f9ff] rounded-full px-3 py-1.5">
                <CalendarClock className="w-4 h-4 text-[#0E4659]" />
                <p className="text-[13px] font-semibold text-[#0E4659]">
                  {transfer.departureDate
                    ? formatDate(transfer.departureDate)
                    : t("selectDate")}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="relative flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-[#a0a0a0]" />
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[2px] h-5 bg-[#a0a0a0]" />
                </div>
                <p className="text-[13px] text-[#222222] truncate">
                  {truncateAddress(transfer.fromLocation, 28) ||
                    t("selectOrigin")}
                </p>
              </div>
              <p className="text-[13px] font-semibold text-[#222222] flex-shrink-0">
                {transfer.departureDate
                  ? formatTime(transfer.departureDate)
                  : "—"}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-[#a0a0a0]" />
                </div>
                <p className="text-[13px] text-[#222222] truncate">
                  {truncateAddress(transfer.toLocation, 28) ||
                    t("selectDestination")}
                </p>
              </div>
              <p className="text-[13px] font-semibold text-[#222222] flex-shrink-0">
                {estimatedArrival ?? "—"}
              </p>
            </div>
          </div>
        </div>

        {selectedVehicle && (
          <div className="mb-6">
            <h3 className="text-[20px] font-bold text-[#222222] mb-4">
              {t("selectedCar")}
            </h3>

            <div className="flex items-start gap-4 mb-3">
              <div className="w-[180px] flex-shrink-0">
                <Image
                  src={selectedVehicle.image || "/shared/image-54.png"}
                  alt={selectedVehicle.name}
                  width={180}
                  height={110}
                  className="w-full h-auto object-contain"
                />
              </div>
              <div className="flex flex-col items-end flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[24px] font-bold text-[#222222]">
                    {selectedVehicle.name}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-[#0E4659]">
                <div className="flex items-center gap-1.5 bg-[#E9F9FF] rounded-full px-3 py-1.5">
                  <Users className="w-4 h-4" />
                  <span className="text-[15px] font-semibold">
                    {passengers}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-[#E9F9FF] rounded-full px-3 py-1.5">
                  <Briefcase className="w-4 h-4" />
                  <span className="text-[15px] font-semibold">{luggage}</span>
                </div>
              </div>
              <Button
                onClick={() => {
                  setShowTransferForm(false);
                  setStep(1);
                }}
                className="bg-[#27c7ff] hover:bg-[#23b3e6] text-white font-bold text-[15px] h-11 px-8 rounded-lg"
              >
                {tCommon("edit").toUpperCase()}
              </Button>
            </div>
          </div>
        )}

        <div className="mb-6 border-t border-[#e0e0e0] pt-6">
          <button
            onClick={() => setIsItineraryExpanded(!isItineraryExpanded)}
            className="w-full flex items-center justify-between mb-2"
          >
            <div className="flex items-center gap-3">
              <h3 className="text-[20px] font-bold text-[#222222]">
                {t("itinerary")}
              </h3>
              <div className="flex items-center gap-1.5 bg-[#e9f9ff] rounded-full px-3 py-1.5">
                <MapPin className="w-4 h-4 text-[#0E4659]" />
                <span className="text-[13px] font-semibold text-[#0E4659]">
                  {stopsCount} {stopsCount === 1 ? t("stop") : t("stops")}
                </span>
              </div>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-[#222222] transition-transform ${isItineraryExpanded ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatedCollapse
            isOpen={isItineraryExpanded}
            className={isItineraryExpanded ? "mt-6" : "mt-0"}
          >
            <div className="space-y-6">
              <TripSegment
                title={t("outbound")}
                from={fromLocation}
                to={toLocation}
                stops={transfer.stops}
                date={transfer.departureDate}
                price={outboundPrice}
                tripIcons={tripIcons}
                editLabel={tCommon("edit")}
              />
              {transfer.bookReturn && (
                <div className="border-t border-[#e0e0e0] pt-6">
                  <TripSegment
                    title={t("return")}
                    from={toLocation}
                    to={fromLocation}
                    stops={[...transfer.stops].reverse()}
                    date={transfer.returnDate}
                    price={returnPrice}
                    tripIcons={tripIcons}
                    editLabel={tCommon("edit")}
                  />
                </div>
              )}
            </div>
          </AnimatedCollapse>
        </div>

        <div className="mb-6 border-t border-[#e0e0e0] pt-6">
          <button
            onClick={() => setIsInvoiceExpanded(!isInvoiceExpanded)}
            className="w-full flex items-center justify-between"
          >
            <h3 className="text-[20px] font-bold text-[#222222]">
              {t("invoice")}
            </h3>
            <ChevronDown
              className={`w-5 h-5 text-[#222222] transition-transform ${isInvoiceExpanded ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatedCollapse
            isOpen={isInvoiceExpanded}
            className={isInvoiceExpanded ? "mt-6" : "mt-0"}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[12px] text-[#808080] font-medium uppercase tracking-[0.12px] pb-2">
                <span>{t("itemDescription")}</span>
                <span>{t("price")}</span>
              </div>
              <div className="space-y-3">
                {invoiceItems.map((item, index) => (
                  <InvoiceLineItem
                    key={`${item.key}-${index}`}
                    label={
                      item.key.startsWith("transfer") ||
                      item.key.startsWith("tax") ||
                      item.key.startsWith("refund") ||
                      item.key.startsWith("subtotal") ||
                      item.key === "cardFee" ||
                      item.key === "premiumInsurance" ||
                      item.key === "refundTerms" ||
                      item.key === "comfortConnection" ||
                      item.key === "childSeats" ||
                      item.key === "surfboards" ||
                      item.key === "pets" ||
                      item.key === "tip" ||
                      item.key === "nightTax"
                        ? t(item.key)
                        : item.key
                    }
                    value={item.value}
                    isBold={"isBold" in item ? item.isBold : false}
                  />
                ))}
              </div>
            </div>
          </AnimatedCollapse>
        </div>

        <div className="border-t border-[#e0e0e0] mb-4" />

        <div className="flex flex-col items-end gap-2 mb-4">
          <div className="text-[24px] font-bold text-[#27c7ff]">
            {formatPriceShort(totalPriceWithExtras)}
          </div>
          <div className="flex flex-col items-end gap-1 text-[14px]">
            <div className="font-normal text-[#222222]">{t("totalPrice")}</div>
            <div className="font-normal text-[#808080]">
              {t("taxesIncluded")}
            </div>
          </div>
        </div>

        <FreeCancellationBanner
          title={t("freeCancellation")}
          description={t("freeCancellationDesc")}
        />

        <div className="flex items-center justify-center gap-2 text-[12px] text-[#808080]">
          <span className="text-lg">🔥</span>
          <span>{t("bookedToday", { count: dailyBookedCount })}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h3 className="text-[20px] font-bold text-[#222222] mb-2">
          {t("map")}
        </h3>
        {(transfer.fromLocation || transfer.toLocation) && (
          <>
            <p className="text-[14px] text-[#808080] mb-2">
              <span className="font-semibold">{t("route")}</span>{" "}
              {[
                extractCity(transfer.fromLocation),
                ...transfer.stops.map((s) => extractCity(s.text)),
                extractCity(transfer.toLocation),
              ]
                .filter(Boolean)
                .join(" → ") || "—"}
            </p>
            {(routeDistance !== null || routeDuration !== null) && (
              <p className="text-[14px] text-[#808080] mb-4">
                {routeDistance !== null && (
                  <span className="font-semibold">
                    {routeDistance.toFixed(1)} km
                  </span>
                )}
                {routeDistance !== null && routeDuration !== null && " • "}
                {routeDuration !== null && (
                  <span className="font-semibold">{routeDuration} min</span>
                )}
              </p>
            )}
          </>
        )}
        <RouteMap
          from={{
            lat: transfer.fromLat,
            lng: transfer.fromLng,
            address: transfer.fromLocation,
          }}
          to={{
            lat: transfer.toLat,
            lng: transfer.toLng,
            address: transfer.toLocation,
          }}
          stops={transfer.stops.map((s) => ({
            lat: s.lat,
            lng: s.lng,
            address: s.text,
          }))}
          className="aspect-[4/3]"
          onRouteCalculated={(distance, duration) => {
            setRouteDistance(distance);
            setRouteDuration(duration);
          }}
        />
      </div>
    </div>
  );
}
