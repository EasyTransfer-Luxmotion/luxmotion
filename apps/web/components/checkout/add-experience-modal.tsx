"use client";

import * as React from "react";
import Image from "next/image";
import {
  X,
  Plus,
  Minus,
  Flame,
  Clock,
  MapPin,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { getDailyNumber } from "@/lib/daily-number";
import { useMarketingStats } from "@/hooks/use-marketing-stats";
import { useCheckoutTheme } from "@/components/checkout/checkout-theme";

import { Checkbox } from "@workspace/ui/components/checkbox";
import { TourDateTimePicker } from "@/components/tours/tour-date-time-picker";
import { DateTimePicker } from "@/components/checkout/date-time-picker";
import { useTourAvailability } from "@/hooks/use-tour-data";
import { cn } from "@workspace/ui/lib/utils";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { Experience, ExperienceExtra } from "./shared";

export type { Experience, ExperienceExtra };

/** O que se está a adicionar. Muda o título e a frase, não o comportamento. */
export type ExperienceKind = "tour" | "event" | "experience" | "stop";

const SERIF_FONT = {
  fontFamily: "var(--font-title), 'Cormorant Garamond', serif",
} as const;

/**
 * O `DateTimePicker` livre devolve um único `Date` com a hora lá dentro; o modal
 * guarda `{ date, time }` separados, com `time` no mesmo formato "HH:MM" que os
 * horários dos tours usam.
 */
export function toDateAndTime(value: Date | undefined): {
  date: Date | null;
  time: string | null;
} {
  if (!value) return { date: null, time: null };
  const hh = String(value.getHours()).padStart(2, "0");
  const mm = String(value.getMinutes()).padStart(2, "0");
  return { date: value, time: `${hh}:${mm}` };
}

/** O que foi escolhido, já valorizado — segue para a order tal e qual. */
export interface SelectedAddonLine {
  title: string;
  price: number;
  pricingType: "per_person" | "flat";
  quantity: number;
  subtotal: number;
}

interface AddExperienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  experience: Experience;
  tourId: string | null;
  /**
   * Paragens extra têm preço fixo definido no admin — não multiplicam por
   * passageiro como os tours (4 pax numa paragem de €15 são €15, não €60).
   */
  flatPrice?: boolean;
  /**
   * Nem todos os upsells pedem data. Quando `false`, o calendário desaparece e
   * o botão deixa de exigir uma hora para se poder adicionar.
   */
  requireDateTime?: boolean;
  /** Caixa de texto livre, ligada por upsell no admin. */
  showSpecialRequest?: boolean
  /**
   * Durações de uma paragem. Havendo-as, o modal troca os contadores de
   * passageiros por um selector de duração: numa paragem escolhe-se quanto
   * tempo o motorista espera, e as pessoas já vão todas no carro.
   */
  durations?: { minutes: number; price: number }[]
  /** Duração já escolhida no cartão. */
  initialMinutes?: number;
  /** Decide o título do modal e a frase de introdução. */
  kind?: ExperienceKind;
  onAdd: (data: {
    passengers: number;
    date: Date | undefined;
    time: string | null;
    selectedExtras: string[];
    selectedAddons: SelectedAddonLine[];
    specialRequest: string;
    totalPrice: number;
  }) => void;
}

export function AddExperienceModal({
  isOpen,
  onClose,
  experience,
  tourId,
  flatPrice = false,
  requireDateTime = true,
  showSpecialRequest = false,
  durations,
  initialMinutes,
  kind = "experience",
  onAdd,
}: AddExperienceModalProps) {
  const t = useTranslations("addExperience");
  const tTour = useTranslations("tourDetails");
  const isMobile = useIsMobile();
  const [passengers, setPassengers] = React.useState(1);
  const [dateTime, setDateTime] = React.useState<{
    date: Date | null;
    time: string | null;
  }>({ date: null, time: null });
  const [selectedExtras, setSelectedExtras] = React.useState<string[]>([]);
  const [specialRequest, setSpecialRequest] = React.useState("");
  const isStop = Boolean(durations && durations.length > 0);
  const [minutes, setMinutes] = React.useState<number | undefined>(
    initialMinutes ?? durations?.[durations.length - 1]?.minutes,
  );
  const chosenDuration = durations?.find((d) => d.minutes === minutes);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const now = new Date();
  const [dateRange, setDateRange] = React.useState({
    start: Date.UTC(now.getFullYear(), now.getMonth(), 1),
    end: Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  });

  const {
    availability,
    bookingDeadlineHours,
    isLoading: availabilityLoading,
  } = useTourAvailability(tourId, dateRange.start, dateRange.end);

  const handleMonthChange = React.useCallback(
    (startDate: number, endDate: number) => {
      setDateRange({ start: startDate, end: endDate });
    },
    [],
  );

  React.useEffect(() => {
    if (isOpen) {
      setPassengers(1);
      setDateTime({ date: null, time: null });
      setSelectedExtras([]);
      setSpecialRequest("");
      setMinutes(initialMinutes ?? durations?.[durations.length - 1]?.minutes);
      if (isMobile) {
        requestAnimationFrame(() => setDrawerOpen(true));
      }
    }
  }, [isOpen, experience, isMobile]);

  React.useEffect(() => {
    if (!isOpen) {
      setDrawerOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExtraToggle = (extraId: string) => {
    setSelectedExtras((prev) =>
      prev.includes(extraId)
        ? prev.filter((id) => id !== extraId)
        : [...prev, extraId],
    );
  };

  const totalGuests = passengers;

  /* Extras marcados, já valorizados. A UI sempre disse "/por pessoa" nos
     add-ons `per_person`, mas o total somava o preço uma única vez — o cartão
     de reserva do tour multiplica correctamente, e é por ele que se alinha. */
  const addonLines: SelectedAddonLine[] = experience.extras
    .filter((extra) => selectedExtras.includes(extra.id))
    .map((extra) => {
      const pricingType = extra.pricingType ?? "flat";
      const quantity = pricingType === "per_person" ? totalGuests || 1 : 1;
      return {
        title: extra.label,
        price: extra.price,
        pricingType,
        quantity,
        subtotal: extra.price * quantity,
      };
    });

  const calculateTotal = () => {
    const extrasTotal = addonLines.reduce((sum, line) => sum + line.subtotal, 0);
    // Numa paragem o preço é o da duração escolhida, e mais nada.
    if (isStop) return (chosenDuration?.price ?? experience.basePrice) + extrasTotal;
    const base = flatPrice
      ? experience.basePrice
      : experience.basePrice * (totalGuests || 1);
    return base + extrasTotal;
  };

  const handleAdd = () => {
    onAdd({
      // Numa paragem não há contagem de passageiros a fazer.
      passengers: isStop ? 0 : totalGuests,
      date: dateTime.date ?? undefined,
      time: dateTime.time,
      selectedExtras,
      selectedAddons: addonLines,
      specialRequest: specialRequest.trim(),
      totalPrice: calculateTotal(),
    });
  };

  const formatPrice = (price: number) => `€ ${price.toFixed(2)}`;

  const extras = experience.extras;

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setTimeout(onClose, 250);
  };

  const modalProps = {
    experience,
    passengers,
    kind,
    dateTime,
    selectedExtras,
    setPassengers,
    handleExtraToggle,
    setDateTime,
    calculateTotal,
    t,
    tTour,
    extras,
    formatPrice,
    handleAdd,
    availability,
    bookingDeadlineHours,
    availabilityLoading,
    onMonthChange: handleMonthChange,
    tourId,
    requireDateTime,
    showSpecialRequest,
    specialRequest,
    setSpecialRequest,
    isStop,
    durations,
    minutes,
    setMinutes,
  };

  if (isMobile) {
    return (
      <div className="checkout-dark fixed inset-0 z-50 flex items-end justify-center">
        <div
          className={cn(
            "absolute inset-0 bg-black/80 transition-opacity duration-300",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={handleCloseDrawer}
        />
        <div
          className={cn(
            "relative w-full max-w-full bg-[var(--ck-bg,#0d0d0d)] border-t border-x border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] transition-transform duration-300",
            drawerOpen ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div
            className="mx-auto mt-2 mb-1 h-1 w-12 bg-[rgba(var(--ck-text-rgb,255,255,255),0.2)]"
            aria-hidden="true"
          />
          <ModalContent {...modalProps} onClose={handleCloseDrawer} />
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-dark fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-[var(--ck-bg,#0d0d0d)] border border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] shadow-2xl max-w-[600px] w-full overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <ModalContent {...modalProps} onClose={onClose} />
      </div>
    </div>
  );
}

interface ModalContentProps {
  experience: Experience;
  passengers: number;
  kind: ExperienceKind;
  dateTime: { date: Date | null; time: string | null };
  selectedExtras: string[];
  onClose: () => void;
  setPassengers: (n: number) => void;
  handleExtraToggle: (id: string) => void;
  setDateTime: (d: { date: Date | null; time: string | null }) => void;
  calculateTotal: () => number;
  t: ReturnType<typeof useTranslations>;
  tTour: ReturnType<typeof useTranslations>;
  extras: ExperienceExtra[];
  formatPrice: (price: number) => string;
  handleAdd: () => void;
  availability: Array<{
    date: number;
    timeSlots: Array<{ startTime: string; endTime?: string }>;
    isCancelled: boolean;
    isRescheduled: boolean;
    isSpecial: boolean;
    reason?: string;
  }>;
  bookingDeadlineHours?: number;
  availabilityLoading: boolean;
  onMonthChange: (startDate: number, endDate: number) => void;
  /** Null nos upsells: não há horários, logo o calendário é livre. */
  tourId: string | null;
  requireDateTime: boolean;
  showSpecialRequest: boolean;
  specialRequest: string;
  setSpecialRequest: (value: string) => void;
  isStop: boolean;
  durations?: { minutes: number; price: number }[];
  minutes?: number;
  setMinutes: (m: number) => void;
}

function ModalContent({
  experience,
  passengers,
  kind,
  dateTime,
  selectedExtras,
  onClose,
  setPassengers,
  handleExtraToggle,
  setDateTime,
  calculateTotal,
  t,
  tTour,
  extras,
  formatPrice,
  handleAdd,
  availability,
  bookingDeadlineHours,
  availabilityLoading,
  onMonthChange,
  tourId,
  requireDateTime,
  showSpecialRequest,
  specialRequest,
  setSpecialRequest,
  isStop,
  durations,
  minutes,
  setMinutes,
}: ModalContentProps) {
  const { theme: checkoutTheme } = useCheckoutTheme();
  const { checkoutBookedTodayMin, checkoutBookedTodayMax } =
    useMarketingStats();
  const dailyBookedCount = React.useMemo(
    () =>
      getDailyNumber(
        "checkout-booked-experience",
        checkoutBookedTodayMin,
        checkoutBookedTodayMax,
      ),
    [checkoutBookedTodayMin, checkoutBookedTodayMax],
  );

  return (
    <>
      <div className="flex items-center justify-between px-6 py-5 border-b border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] shrink-0">
        <h2
          className="text-[24px] font-semibold leading-none text-[var(--ck-text,#f7f4ef)]"
          style={SERIF_FONT}
        >
          {t(`kinds.${kind}`)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--ck-text-muted,#999)] hover:text-[var(--ck-accent,#c9a96e)] transition-colors"
        >
          <X className="w-6 h-6" strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-6 py-6 overflow-y-auto flex-1">
        <div className="flex gap-4 mb-6">
          <div className="relative w-[200px] h-[140px] shrink-0 overflow-hidden border border-[rgba(var(--ck-text-rgb,255,255,255),0.08)]">
            <Image
              src={experience.image || "/shared/placeholder-experience.webp"}
              alt={experience.title}
              fill
              className="object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="mb-2 text-[26px] leading-tight text-[var(--ck-text,#f7f4ef)]"
              style={SERIF_FONT}
            >
              {experience.title}
            </h3>
            <p className="text-[13px] text-[var(--ck-text-muted,#999)] leading-[1.5] line-clamp-4">
              {experience.description}
            </p>
            {(experience.duration || experience.locationLabel) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--ck-text-muted,#999)]">
                {experience.duration && (
                  <span className="flex items-center gap-1.5">
                    <Clock
                      className="size-4 text-[var(--ck-accent,#c9a96e)]"
                      strokeWidth={1.75}
                    />
                    {experience.duration}
                  </span>
                )}
                {experience.locationLabel && (
                  <span className="flex items-center gap-1.5">
                    <MapPin
                      className="size-4 text-[var(--ck-accent,#c9a96e)]"
                      strokeWidth={1.75}
                    />
                    {experience.locationLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {!isStop && (
          <>
            <p className="mb-4 text-[13px] leading-[1.5] text-[var(--ck-text-muted,#999)]">
              {t(`intro.${kind}`)}
            </p>
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-[13px] font-semibold text-[var(--ck-text,#f7f4ef)]">
                  {t("passengers")}
                </label>
                <div className="flex h-12 w-fit items-stretch border border-[rgba(var(--ck-text-rgb,255,255,255),0.12)]">
                  <button
                    type="button"
                    onClick={() => setPassengers(Math.max(1, passengers - 1))}
                    disabled={passengers <= 1}
                    aria-label={t("passengers")}
                    className="flex w-11 items-center justify-center text-[var(--ck-text,#f7f4ef)] transition-colors hover:text-[var(--ck-accent,#c9a96e)] disabled:opacity-30"
                  >
                    <Minus className="size-4" strokeWidth={2} />
                  </button>
                  <span className="flex w-12 items-center justify-center border-x border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] text-[15px] text-[var(--ck-text,#f7f4ef)]">
                    {passengers}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPassengers(passengers + 1)}
                    aria-label={t("passengers")}
                    className="flex w-11 items-center justify-center text-[var(--ck-text,#f7f4ef)] transition-colors hover:text-[var(--ck-accent,#c9a96e)]"
                  >
                    <Plus className="size-4" strokeWidth={2} />
                  </button>
                </div>
              </div>

              {requireDateTime && (
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-[var(--ck-text,#f7f4ef)]">
              {t("date")}
            </label>
            {/* Só os tours têm horários em `tourSchedules`. Um upsell não tem, e
                o `TourDateTimePicker` só deixa escolher dias que existam na
                disponibilidade — com a lista vazia, nenhum dia era selecionável
                e o botão "adicionar" ficava morto para sempre. Aí usa-se o
                mesmo picker livre do passo do transfer. */}
            {tourId ? (
              <TourDateTimePicker
                value={dateTime}
                onChange={setDateTime}
                availability={availability}
                bookingDeadlineHours={bookingDeadlineHours}
                isLoading={availabilityLoading}
                onMonthChange={onMonthChange}
                light={checkoutTheme === "light"}
              />
            ) : (
              <DateTimePicker
                value={dateTime.date}
                onChange={(next) => setDateTime(toDateAndTime(next))}
                label={t("date")}
                placeholder={t("date")}
                /* Segue o tema do checkout. Estava fixo em escuro, e num
                   checkout claro ficava uma caixa preta a meio do modal. */
                dark={checkoutTheme === "dark"}
              />
            )}
          </div>
              )}
            </div>
          </>
        )}

        {isStop && (
          /* Numa paragem escolhe-se o tempo de espera, não quem vai: as pessoas
             já seguem no carro. Contar passageiros aqui não fazia sentido. */
          <div className="mb-6">
            <p className="mb-3 text-[13px] leading-[1.5] text-[var(--ck-text-muted,#999)]">
              {t("stopDurationHint")}
            </p>
            <label className="mb-3 block text-[12px] font-bold uppercase tracking-[1.152px] text-[var(--ck-text,#f7f4ef)]">
              {t("stopDuration")}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {durations!.map((d) => {
                const active = d.minutes === minutes;
                return (
                  <button
                    key={d.minutes}
                    type="button"
                    onClick={() => setMinutes(d.minutes)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-center gap-1 border px-4 py-4 transition-colors",
                      active
                        ? "border-[var(--ck-accent,#c9a96e)] bg-[rgba(var(--ck-accent-rgb,201,169,110),0.12)]"
                        : "border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] hover:border-[rgba(var(--ck-text-rgb,255,255,255),0.3)]",
                    )}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[1px] text-[var(--ck-text-muted,#999)]">
                      {t("minutes", { count: d.minutes })}
                    </span>
                    <span
                      className="text-[24px] leading-none text-[var(--ck-text,#f7f4ef)]"
                      style={SERIF_FONT}
                    >
                      {d.price}€
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {extras.length > 0 && (
          <div className="mb-2">
            <label className="block text-[12px] font-bold text-[var(--ck-text-muted,#999)] uppercase tracking-[1.152px] mb-3">
              {t("extras")}
            </label>
            <div className="flex flex-col gap-3">
              {extras.map((extra) => (
                <div key={extra.id} className="flex items-center gap-3">
                  <Checkbox
                    appearance="luxmotion"
                    id={extra.id}
                    checked={selectedExtras.includes(extra.id)}
                    onCheckedChange={() => handleExtraToggle(extra.id)}
                  />
                  <label
                    htmlFor={extra.id}
                    className="text-[14px] text-[var(--ck-text,#f7f4ef)] cursor-pointer select-none flex-1 truncate"
                  >
                    {extra.label}
                  </label>
                  <span className="text-[14px] font-semibold text-[var(--ck-accent,#c9a96e)] shrink-0">
                    + €{extra.price}
                    {extra.pricingType && (
                      <span className="text-[11px] font-normal text-[var(--ck-text-muted,#999)] ml-1">
                        /
                        {extra.pricingType === "per_person"
                          ? tTour("perPerson")
                          : tTour("flatFee")}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showSpecialRequest && (
          <div className="mt-6">
            <label
              htmlFor="upsell-special-request"
              className="block text-[12px] font-bold text-[var(--ck-text-muted,#999)] uppercase tracking-[1.152px] mb-3"
            >
              {t("specialRequest")}
            </label>
            <textarea
              id="upsell-special-request"
              rows={3}
              value={specialRequest}
              onChange={(event) => setSpecialRequest(event.target.value)}
              placeholder={t("specialRequestPlaceholder")}
              className="w-full bg-[var(--ck-surface,#1e1d1b)] border border-[rgba(var(--ck-text-rgb,255,255,255),0.12)] px-3 py-2 text-[14px] text-[var(--ck-text,#f7f4ef)] placeholder:text-[var(--ck-text-subtle,#696969)] focus:border-[var(--ck-accent,#c9a96e)] focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="px-6 pt-4 pb-5 bg-[var(--ck-bg,#0d0d0d)] shrink-0 border-t border-[rgba(var(--ck-text-rgb,255,255,255),0.12)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 border border-[rgba(var(--ck-accent-rgb,201,169,110),0.4)] px-3 py-1.5">
            <Flame className="w-4 h-4 text-[var(--ck-accent,#c9a96e)] fill-[var(--ck-accent,#c9a96e)]" />
            <span className="text-[12px] font-medium text-[var(--ck-accent,#c9a96e)]">
              {t("bookedTimes", { count: dailyBookedCount })}
            </span>
          </div>
          <div className="text-right">
            <div
              className="text-[24px] font-bold leading-none text-[var(--ck-accent,#c9a96e)]"
              style={SERIF_FONT}
            >
              {formatPrice(calculateTotal())}
            </div>
            <div className="text-[11px] font-medium uppercase tracking-[1.152px] text-[var(--ck-text-muted,#999)] mt-1">
              {t("total")}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={requireDateTime && !dateTime.time}
          className="w-full h-12 bg-[var(--ck-accent,#c9a96e)] hover:bg-[var(--ck-accent-hover,#b89558)] text-[#0D0D0D] text-[14px] font-medium uppercase tracking-[1.1px] inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
          <span className="px-1">{t("add")}</span>
        </button>
      </div>
    </>
  );
}
