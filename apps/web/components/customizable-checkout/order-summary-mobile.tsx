"use client";

import { useState, useEffect } from "react";
import {
  ChevronDown,
  User,
  Briefcase,
  Car,
  MapPinCheckInside,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { getDailyNumber } from "@/lib/daily-number";
import { useMarketingStats } from "@/hooks/use-marketing-stats";
import { Separator } from "@workspace/ui/components/separator";
import {
  TripIconsRow,
  InvoiceLineItem,
  TripSegment,
  AnimatedCollapse,
  FreeCancellationBanner,
} from "./shared";
import { useCheckout } from "./checkout-context";
import { formatPrice, formatPriceShort, calculateTotalLuggage, calculatePriceBreakdown, splitInvoiceWithNightTax } from "@/lib/format";
import { insurancePrice, calcExtras } from "@/components/customizable-checkout/pricing";
import { useExtraPrices } from "@/hooks/use-site-settings"

export function OrderSummaryMobile() {
  const t = useTranslations("orderSummary");
  const { state } = useCheckout();
  const { selectedVehicle, transfer } = state;

  const [isExpanded, setIsExpanded] = useState(false);

  const basePrice = selectedVehicle?.price ?? 0;
  const isRoundTrip = transfer.bookReturn; // Se bookReturn está marcado, é round trip (independente da aba)
  const baseTotalPrice = basePrice;

  // Calculate price breakdown for display (will be recalculated in OrderSummaryContent with extras)
  const priceBreakdown = calculatePriceBreakdown(baseTotalPrice);
  const totalPrice = priceBreakdown.total;

  const passengers = transfer.passengers;
  const luggage = calculateTotalLuggage(transfer.luggage);
  // Se for round trip (bookReturn = true), mostra 2 stops. Se for one way, mostra 1 stop
  const stopsCount = isRoundTrip ? 2 : 1;

  return (
    <div className="lg:hidden w-full">
      <div className="bg-white rounded-[22px] shadow-sm overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-6 pt-0 pb-4 text-left"
        >
          <div className="flex justify-center py-2">
            <div className="w-[80px] h-[5px] bg-[#e0e0e0] rounded-full" />
          </div>

          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <h2 className="text-[18px] font-bold text-[#222222] leading-tight">
                {t("title")}
              </h2>
              <div className="mt-1.5 flex flex-col">
                <span className="text-[14px] text-[#222222]">
                  {t("totalPrice")}
                </span>
                <span className="text-[14px] text-[#808080]">
                  {t("taxesIncluded")}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[22px] sm:text-[28px] font-bold text-[#000000] leading-none">
                {formatPriceShort(totalPrice)}
              </span>
              <ChevronDown
                className={`w-6 h-6 text-[#27c7ff] transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 flex-wrap text-[#0E4659]">
            <div className="flex items-center gap-1.5 bg-[#E9F9FF] rounded-full px-3 py-1.5">
              <User className="w-[18px] h-[18px]" />
              <span className="text-[15px] font-semibold">{passengers}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#E9F9FF] rounded-full px-3 py-1.5">
              <Briefcase className="w-[18px] h-[18px]" />
              <span className="text-[15px] font-semibold">{luggage}</span>
            </div>
            {selectedVehicle && (
              <div className="flex items-center gap-1.5 bg-[#E9F9FF] rounded-full px-3 py-1.5">
                <Car className="w-[18px] h-[18px]" />
                <span className="text-[15px] font-semibold">
                  {selectedVehicle.name}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-[#E9F9FF] rounded-full px-3 py-1.5">
              <MapPinCheckInside className="w-[18px] h-[18px]" />
              <span className="text-[15px] font-semibold">
                {stopsCount} {stopsCount === 1 ? t("stop") : t("stops")}
              </span>
            </div>
          </div>
        </button>

        <AnimatedCollapse isOpen={isExpanded}>
          <div className="px-6 pb-4">
            <OrderSummaryContent />
          </div>
        </AnimatedCollapse>
      </div>
    </div>
  );
}

function OrderSummaryContent() {
  const t = useTranslations("orderSummary");
  const { checkoutBookedTodayMin, checkoutBookedTodayMax } =
    useMarketingStats();
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
  const tCommon = useTranslations("common");
  const { state } = useCheckout();
  const extraPrices = useExtraPrices();
  const { selectedVehicle, transfer, experiences, payment } = state;

  const [isItineraryExpanded, setIsItineraryExpanded] = useState(true);
  const [isInvoiceExpanded, setIsInvoiceExpanded] = useState(true);

  const basePrice = selectedVehicle?.price ?? 0;
  const isRoundTrip = transfer.bookReturn;
  const baseTotalPrice = basePrice;
  const nightTaxAmount = selectedVehicle?.nightTaxAmount ?? 0;

  const premiumInsurancePrice = payment.premiumInsurance ? insurancePrice("premiumInsurance", isRoundTrip) : 0;
  const refundTermsPrice = payment.refundTerms ? insurancePrice("refundTerms", isRoundTrip) : 0;
  const comfortConnectionPrice = payment.comfortConnection ? insurancePrice("comfortConnection", isRoundTrip) : 0;
  const insuranceTotal =
    premiumInsurancePrice + refundTermsPrice + comfortConnectionPrice;

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

  // Calculate with card fee and extras included in rounding
  const priceBreakdownWithExtras = calculatePriceBreakdown({
    basePrice: baseTotalPrice,
    cardFeeRate: payment.method === "cartao" ? 0.02 : 0,
    insuranceTotal: insuranceTotal + extrasTotal,
  });
  const totalPriceWithExtras =
    priceBreakdownWithExtras.total + experiencesTotal + tipAmount;

  // Para round trip, dividir o preço entre outbound e return
  const outboundPrice = isRoundTrip
    ? totalPriceWithExtras / 2
    : totalPriceWithExtras;
  const returnPrice = isRoundTrip ? totalPriceWithExtras / 2 : 0;
  // Se for round trip (bookReturn = true), mostra 2 stops. Se for one way, mostra 1 stop
  const stopsCount = isRoundTrip ? 2 : 1;

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
      {
        key: "refundTax",
        value: formatPrice(priceBreakdownWithExtras.refundTax),
      },
    ];

  if (nightTaxAmount > 0) {
    invoiceItems.push({
      key: "nightTax",
      value: formatPrice(nightTaxDisplay),
    });
  }

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

  if (payment.method === "cartao" && priceBreakdownWithExtras.cardFee > 0) {
    invoiceItems.push({
      key: "cardFee",
      value: formatPrice(priceBreakdownWithExtras.cardFee),
    });
  }

  // Total sempre no final
  invoiceItems.push({
    key: isRoundTrip ? "subtotalRoundTrip" : "subtotalOneWay",
    value: formatPrice(totalPriceWithExtras),
    isBold: true,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="border-t border-[#e0e0e0] pt-3">
        <button
          onClick={() => setIsItineraryExpanded(!isItineraryExpanded)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <h3 className="text-[18px] font-bold text-[#222222]">
              {t("itinerary")}
            </h3>
            <div className="flex items-center bg-[#e9f9ff] rounded-full px-2 py-1">
              <MapPinCheckInside className="w-5 h-5 text-[#27c7ff]" />
              <span className="text-[14px] font-medium text-[#0E4659] px-2">
                {stopsCount} {stopsCount === 1 ? t("stop") : t("stops")}
              </span>
            </div>
          </div>
          <ChevronDown
            className={`w-6 h-6 text-[#27c7ff] transition-transform ${isItineraryExpanded ? "rotate-180" : ""}`}
          />
        </button>

        <AnimatedCollapse
          isOpen={isItineraryExpanded}
          className={isItineraryExpanded ? "mt-2" : "mt-0"}
        >
          <div className="flex flex-col gap-1.5">
            <TripSegment
              title={t("outbound")}
              from={fromLocation}
              to={toLocation}
              stops={transfer.stops}
              date={transfer.departureDate}
              price={outboundPrice}
              editLabel={tCommon("edit")}
              showTripIcons={false}
              className="space-y-2"
            />
            <TripIconsRow data={tripIcons} className="py-1.5" />

            {transfer.bookReturn && (
              <>
                <Separator className="py-1.5" />
                <TripSegment
                  title={t("return")}
                  from={toLocation}
                  to={fromLocation}
                  stops={[...transfer.stops].reverse()}
                  date={transfer.returnDate}
                  price={returnPrice}
                  editLabel={tCommon("edit")}
                  showTripIcons={false}
                  className="space-y-2"
                />
                <TripIconsRow data={tripIcons} className="py-1.5" />
              </>
            )}
          </div>
        </AnimatedCollapse>
      </div>

      <div className="flex justify-center">
        <div className="w-full border-t border-[#bfbfbf]" />
      </div>

      <div className="pt-0.5">
        <button
          onClick={() => setIsInvoiceExpanded(!isInvoiceExpanded)}
          className="w-full flex items-center justify-between"
        >
          <h3 className="text-[18px] font-bold text-[#222222]">
            {t("invoice")}
          </h3>
          <ChevronDown
            className={`w-6 h-6 text-[#27c7ff] transition-transform ${isInvoiceExpanded ? "rotate-180" : ""}`}
          />
        </button>

        <AnimatedCollapse
          isOpen={isInvoiceExpanded}
          className={isInvoiceExpanded ? "mt-2" : "mt-0"}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-[12px] text-neutral-700 font-medium uppercase tracking-[0.12px]">
              <span>{t("itemDescription")}</span>
              <span>{t("price")}</span>
            </div>
            <div className="flex flex-col gap-4 text-[12px] text-[#808080]">
              {invoiceItems.map((item, index) => (
                <InvoiceLineItem
                  key={`${item.key}-${index}`}
                  label={
                    item.key.startsWith("transfer") ||
                    item.key.startsWith("tax") ||
                    item.key.startsWith("refund") ||
                    item.key.startsWith("subtotal") ||
                    item.key === "nightTax" ||
                    item.key === "cardFee" ||
                    item.key === "premiumInsurance" ||
                    item.key === "refundTerms" ||
                    item.key === "comfortConnection" ||
                    item.key === "childSeats" ||
                    item.key === "surfboards" ||
                    item.key === "pets" ||
                    item.key === "tip"
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

      <div className="flex justify-center">
        <div className="w-full border-t border-[#bfbfbf]" />
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="text-[24px] font-extrabold text-[#27c7ff]">
          {formatPriceShort(totalPriceWithExtras)}
        </div>
        <div className="flex flex-col items-end gap-1 text-[14px]">
          <div className="text-[#222222]">{t("totalPrice")}</div>
          <div className="text-[#808080]">{t("taxesIncluded")}</div>
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
  );
}
