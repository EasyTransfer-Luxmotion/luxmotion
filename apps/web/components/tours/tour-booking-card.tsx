"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Minus, Plus, CalendarClock, Users, Layers, ArrowRight, User, UsersRound, Info } from "lucide-react"
import { useTranslations } from "next-intl"
import { TourDateTimePicker } from "@/components/tours/tour-date-time-picker"
import { EventDateTimePicker } from "@/components/events/event-date-time-picker"
import { EscolhaSaidas, type EscolhaDeSaidas, type SaidaPublica } from "@/components/events/escolha-saidas"
import { localDateTimeFields, validEventSelection } from "@/lib/event-date-time"
import { emLisboa, relogioDeLisboa } from "@/lib/hora-lisboa"
import { useHomeTheme } from "@/components/new-landing-page/home-theme"
import { useTourAvailability } from "@/hooks/use-tour-data"
import { BookingAddonsSelector, type BookingAddon } from "@/components/shared/booking-addons-selector"
import { useMoney } from "@/components/currency-provider"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

/** Privado: o evento é só do grupo de quem reserva. Partilhado: vai-se com
 *  outros participantes e paga-se menos por pessoa. */
export type SharingMode = "private" | "shared"

interface TourBookingCardProps {
  price: number
  /**
   * Preço por pessoa em lugar partilhado. Só quando existe é que o cartão mostra
   * a escolha — sem ele nada muda, que é o caso de todos os tours.
   */
  sharedPrice?: number
  currency?: string
  rating: number
  reviewCount: number
  tourId?: string
  skipAvailability?: boolean
  fixedDateTime?: number
  eventEndDate?: number
  hideReviews?: boolean
  minPassengers?: number
  maxPassengers?: number
  /**
   * Serviço de evento: rota, regresso e viatura. Só os eventos passam isto —
   * os tours não, e por isso a barra deles não muda em nada.
   */
  service?: {
    /** Ponto de encontro, de onde se parte. */
    origin?: string
    /** Onde é o evento. */
    destination?: string
    /** Hora de regresso ao ponto de encontro; sem ela a rota é só de ida. */
    returnTime?: string
    /** Nome da classe da viatura, ex. "First Class". */
    vehicleName?: string
    /** Lugares da viatura; manda no "até N passageiros" e no limite do checkout. */
    vehicleSeats?: number
    /** Horas antes da partida em que a viagem se confirma. */
    confirmationHours?: number
  }
  addons?: BookingAddon[]
  /**
   * Saídas partilhadas do evento (E3A). Com `usaSaidas`, o partilhado vende-se
   * por saídas: escolhe-se a ida, o regresso ou os dois, e o preço por pessoa
   * é a soma. Sem isto o cartão fica como sempre (data do evento).
   */
  saidas?: { usaSaidas: boolean; saidas: SaidaPublica[] }
  onBook?: (data: BookingData) => void
  /** Chamada quando já há data e hora: o pai usa-a para guardar o
   *  carrinho pendente e acender a barra de baixo. */
  onSelectionReady?: (data: {
    date: Date | null
    time: string | null
    adults: number
    children: number
    infants: number
    total: number
  }) => void
}

interface BookingData {
  date: Date | null
  time: string | null
  adults: number
  children: number
  infants: number
  total: number
  /** Só vem preenchido quando o produto tem preço partilhado. */
  sharingMode?: SharingMode
  /** Preço que a escolha determinou: por pessoa no partilhado, por viatura no privado. */
  unitPrice?: number
  /** Quando verdadeiro, `unitPrice` NÃO se multiplica pelos passageiros. */
  perVehicle?: boolean
  /** As saídas escolhidas, num evento partilhado com saídas. */
  saidas?: EscolhaDeSaidas
  selectedAddons?: Array<{
    /** Um dos dois, nunca os dois: um extra próprio do tour ou um universal. */
    addonId?: string
    universalAddonId?: string
    title: string
    price: number
    pricingType: "per_person" | "flat"
    quantity: number
    subtotal: number
  }>
  addonsTotal?: number
}

function CounterButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="size-[32px] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] flex items-center justify-center text-[var(--lm-muted,#999)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] hover:text-[var(--lm-accent,#C9A96E)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  )
}

function PaxRow({ label, desc, count, onDec, onInc, disableInc }: { label: string; desc: string; count: number; onDec: () => void; onInc: () => void; disableInc?: boolean }) {
  return (
    <div className="flex items-center justify-between px-[14px] py-[12px] border-b border-[rgba(var(--lm-text-rgb,255,255,255),0.04)] last:border-b-0">
      <div className="flex flex-col">
        <span className="text-[12px] font-medium text-[var(--lm-text,#fff)]">{label}</span>
        <span className="text-[10px] text-[var(--lm-muted,#8c8680)]">{desc}</span>
      </div>
      <div className="flex items-center">
        <CounterButton onClick={onDec} disabled={count <= 0}>
          <Minus className="size-[14px]" />
        </CounterButton>
        <div className="w-[40px] text-center text-[14px] font-medium text-[var(--lm-text,#fff)]">{count}</div>
        <CounterButton onClick={onInc} disabled={disableInc}>
          <Plus className="size-[14px]" />
        </CounterButton>
      </div>
    </div>
  )
}

/**
 * Linha só de leitura: rótulo pequeno em maiúsculas por cima do valor, no molde
 * das caixas de informação que a página do evento já usa.
 */
function LinhaDeInfo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="border border-[rgba(var(--lm-text-rgb,255,255,255),0.1)] bg-[var(--lm-surface,#1E1D1B)] px-[13px] py-[9px]">
      <span className="block text-[10px] font-semibold uppercase tracking-[1.3px] text-[var(--lm-muted,#8c8680)]">
        {rotulo}
      </span>
      <span className="mt-0.5 block text-[13px] leading-[1.35] text-[var(--lm-text,#fff)]">
        {valor}
      </span>
    </div>
  )
}

export function TourBookingCard({ price, sharedPrice, currency = "€", rating, reviewCount, tourId, skipAvailability, fixedDateTime, eventEndDate, hideReviews, minPassengers, maxPassengers: maxPassengersBase, service, addons, saidas, onBook, onSelectionReady }: TourBookingCardProps) {
  const t = useTranslations("tourDetails")
  const { format } = useMoney()
  // O picker escolhe a paleta por prop (não por var CSS). Só clareia dentro do
  // tema da homepage em modo claro; fora dele continua escuro como hoje.
  const { theme, isHome } = useHomeTheme()
  const [selectedDateTime, setDateTime] = useState<{ date: Date | null; time: string | null }>({ date: null, time: null })
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([])
  /* Começa no partilhado quando existe: é o mais barato, e é o que a etiqueta
     "desde" em cima do preço promete. */
  const temEscolha = typeof sharedPrice === "number" && sharedPrice > 0
  const [sharingMode, setSharingMode] = useState<SharingMode>(
    temEscolha ? "shared" : "private",
  )
  /* O partilhado vende-se por pessoa e o privado por viatura: são unidades
     diferentes, e tratar as duas como "por pessoa" multiplicava o preço da
     viatura pelo número de passageiros. */
  const porViatura = temEscolha && sharingMode === "private"
  /* Partilhado num evento com saídas: escolhe-se a viagem em vez de se usar a
     data do evento, e o preço por pessoa é a soma das pernas escolhidas. */
  const porSaidas = temEscolha && sharingMode === "shared" && saidas?.usaSaidas === true
  const [escolha, setEscolha] = useState<EscolhaDeSaidas>({})
  const pernas = [escolha.ida, escolha.regresso].filter((x): x is SaidaPublica => Boolean(x))
  const precoUnitario = porSaidas
    ? pernas.reduce((t, p) => t + p.preco, 0)
    : temEscolha && sharingMode === "shared" ? sharedPrice! : price
  /* O preço partilhado a mostrar com saídas: o da saída mais barata (uma
     perna). O `sharedPrice` do evento era o de antes das saídas e não bate
     com o que se paga. */
  const precoPartilhado = saidas?.usaSaidas && saidas.saidas.length
    ? Math.min(...saidas.saidas.map((x) => x.preco))
    : sharedPrice
  /* Em cima, sem viagem escolhida, o "desde" em vez de zero. */
  const precoEmCima = porSaidas && pernas.length === 0 ? (precoPartilhado ?? 0) : precoUnitario
  /* Não se pode levar mais gente do que os lugares livres da perna mais cheia. */
  const livresNasPernas = pernas.length ? Math.min(...pernas.map((p) => p.livres)) : undefined
  const maxPassengers = porSaidas && livresNasPernas !== undefined
    ? Math.min(livresNasPernas, maxPassengersBase ?? Infinity)
    : maxPassengersBase

  const isPrivateEvent = fixedDateTime !== undefined && (!temEscolha || sharingMode === "private")
  const dateTime = useMemo(() => {
    if (porSaidas) {
      const primeira = escolha.ida ?? escolha.regresso
      return primeira
        ? { date: relogioDeLisboa(primeira.partida), time: localDateTimeFields(primeira.partida).time }
        : { date: null, time: null }
    }
    if (fixedDateTime !== undefined && !isPrivateEvent) {
      return { date: relogioDeLisboa(fixedDateTime), time: localDateTimeFields(fixedDateTime).time }
    }
    return selectedDateTime
  }, [fixedDateTime, isPrivateEvent, selectedDateTime, porSaidas, escolha.ida, escolha.regresso])
  const selectionIsValid = porSaidas
    ? pernas.length > 0 &&
      !(escolha.ida && escolha.regresso && escolha.regresso.partida <= escolha.ida.partida) &&
      adults + children + infants <= (livresNasPernas ?? 0)
    : isPrivateEvent
      ? validEventSelection(dateTime, fixedDateTime!, eventEndDate)
      : Boolean(dateTime.date && dateTime.time)

  const [dateRange, setDateRange] = useState(() => {
    const now = new Date()
    const startDate = Date.UTC(now.getFullYear(), now.getMonth(), 1)
    const endDate = Date.UTC(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999)
    return { startDate, endDate }
  })

  const { availability, bookingDeadlineHours, isLoading: isLoadingAvailability } = useTourAvailability(
    skipAvailability ? null : (tourId || null),
    dateRange.startDate,
    dateRange.endDate
  )

  const handleMonthChange = useCallback((startDate: number, endDate: number) => {
    const extendedEnd = new Date(endDate)
    extendedEnd.setMonth(extendedEnd.getMonth() + 1)
    setDateRange({ startDate, endDate: extendedEnd.getTime() })
  }, [])

  const formatFixedDateTime = () => {
    if (!fixedDateTime) return null
    // Dia e hora de Lisboa: no fuso do browser o evento das 10h00 aparecia às
    // 05h00 a quem visitava de Nova Iorque.
    const { dia, hora } = emLisboa(fixedDateTime)
    const [year, month, day] = dia.split("-")
    return `${day}/${month}/${year} ${t("at")} ${hora}`
  }

  /* A rota sai do que o evento já tem: ponto de encontro e local. Com hora de
     regresso é ida e volta; sem ela, só ida. */
  const rota = useMemo(() => {
    const origem = service?.origin?.trim()
    const destino = service?.destination?.trim()
    if (!origem || !destino) return null
    return service?.returnTime ? `${origem} → ${destino} → ${origem}` : `${origem} → ${destino}`
  }, [service?.origin, service?.destination, service?.returnTime])

  const horarios = useMemo(() => {
    const partida = dateTime.time
    if (!partida) return null
    return service?.returnTime
      ? `${partida} · ${t("service.returnAt", { time: service.returnTime })}`
      : partida
  }, [dateTime.time, service?.returnTime, t])

  /** Lugares: os da viatura quando há uma, senão o máximo do evento. */
  const lugares = service?.vehicleSeats ?? maxPassengers

  /* Preço por viatura: o que é preciso explicar é que não sobe ao juntar
     passageiros. Preço por pessoa: aí sim, o que interessa é o partilhado. */
  const infoTitulo = porViatura ? t("sharing.vehicleWhat") : t("sharing.what")
  const infoTexto = porViatura
    ? lugares
      ? t("sharing.vehicleIncludes", { count: lugares })
      : t("sharing.vehicleFlat")
    : t("sharing.explainer")
  const incluido = [
    lugares ? t("sharing.upToPassengers", { count: lugares }) : null,
    service?.vehicleName,
  ]
    .filter(Boolean)
    .join(" · ")

  const totalGuests = adults + children + infants

  const handleToggleAddon = useCallback((addonId: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    )
  }, [])

  const addonsTotal = useMemo(() => {
    if (!addons) return 0
    return addons
      .filter((a) => selectedAddonIds.includes(a._id))
      .reduce((sum, a) => sum + (a.pricingType === "per_person" ? a.price * (totalGuests || 1) : a.price), 0)
  }, [addons, selectedAddonIds, totalGuests])

  const payingGuests = adults + children
  const total = (porViatura ? precoUnitario : precoUnitario * (totalGuests || 1)) + addonsTotal
  const isAtMax = maxPassengers ? totalGuests >= maxPassengers : false
  /* Numa viatura inteira não há mínimo de pessoas a cumprir — vende-se o
     carro. Sem isto, e sem contadores, o botão ficava desligado para sempre. */
  const isBelowMin = !porViatura && minPassengers ? payingGuests < minPassengers : false

  // Basta escolher data e hora para a reserva passar a existir: o pai guarda-a
  // e a barra de baixo acende, mesmo que a pessoa nunca abra o checkout.
  const lastSelection = useRef<string | null>(null)
  useEffect(() => {
    // Basta a data. Há tours sem escolha de hora nenhuma — exigir as duas
    // fazia com que nesses o carrinho nunca chegasse a ser guardado.
    if (!dateTime.date || (isPrivateEvent && !selectionIsValid)) return
    // Só avisa quando a escolha muda mesmo. Sem esta guarda o efeito voltava a
    // gravar a cada render e a contagem decrescente reiniciava-se sempre,
    // porque a gravação renova o prazo.
    const signature = [
      dateTime.date.toISOString(),
      dateTime.time ?? "",
      adults,
      children,
      infants,
      total,
      sharingMode,
    ].join("|")
    if (lastSelection.current === signature) return
    lastSelection.current = signature
    onSelectionReady?.({
      date: dateTime.date,
      time: dateTime.time,
      adults,
      children,
      infants,
      total,
    })
  }, [dateTime.date, dateTime.time, isPrivateEvent, selectionIsValid, adults, children, infants, total, sharingMode, onSelectionReady])

  const handleBook = () => {
    if (!selectionIsValid || isBelowMin) return
    const selectedAddonsData = addons
      ?.filter((a) => selectedAddonIds.includes(a._id))
      .map((a) => ({
        ...(a.isUniversal ? { universalAddonId: a._id } : { addonId: a._id }),
        title: a.title,
        price: a.price,
        pricingType: a.pricingType,
        quantity: a.pricingType === "per_person" ? (totalGuests || 1) : 1,
        subtotal: a.pricingType === "per_person" ? a.price * (totalGuests || 1) : a.price,
      }))

    onBook?.({
      date: dateTime.date,
      time: dateTime.time,
      adults,
      children,
      infants,
      total,
      sharingMode: temEscolha ? sharingMode : undefined,
      unitPrice: precoUnitario,
      perVehicle: porViatura,
      ...(porSaidas && { saidas: escolha }),
      selectedAddons: selectedAddonsData?.length ? selectedAddonsData : undefined,
      addonsTotal: addonsTotal > 0 ? addonsTotal : undefined,
    })
  }

  return (
    <div className="bg-[var(--lm-surface,#1A1A1A)] border border-[rgba(var(--lm-accent-rgb,201,169,110),0.12)] overflow-hidden" style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
      <div className="h-[2px] bg-gradient-to-r from-[var(--lm-accent,#C9A96E)] to-[rgba(var(--lm-accent-rgb,201,169,110),0.2)]" />

      <div className="border-b border-[rgba(var(--lm-text-rgb,255,255,255),0.05)] px-6 pt-6 pb-5">
        <span className="text-[12px] font-semibold text-[var(--lm-muted,#8c8680)] tracking-[1.35px] uppercase">
          {t("from")}
          {temEscolha && (
            <> · {sharingMode === "shared" ? t("sharing.shared") : t("sharing.private")}</>
          )}
        </span>
        <div className="flex items-baseline gap-[10px] mt-1">
          <span className="text-[48px] font-semibold text-[var(--lm-accent,#C9A96E)] leading-[48px]" style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}>
            {format(precoEmCima)}
          </span>
          {/* O "i" e o "por pessoa" na mesma caixa: assim o círculo centra-se
              com o texto ao lado, e não com a linha inteira, que é alta por
              causa do preço a 48px. */}
          <span className="flex items-center gap-1.5 text-[14px] text-[var(--lm-muted,rgba(255,255,255,0.3))]">
            {porViatura ? t("sharing.perVehicle") : t("perPerson")}
            {/* O "i" está encostado à unidade do preço, e é a unidade que tem
                de explicar. Explicava o partilhado/privado, que é o que os dois
                cartões aqui em baixo já dizem: quem carregava por causa dos
                "€175 por viatura" ficava sem saber se o preço subia ao juntar
                passageiros. As frases já existiam traduzidas e não eram usadas. */}
            {temEscolha && (
            <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={infoTitulo}
                    className="flex size-[16px] shrink-0 items-center justify-center rounded-full border border-[rgba(var(--lm-accent-rgb,201,169,110),0.5)] text-[var(--lm-accent,#C9A96E)] transition-colors hover:bg-[rgba(var(--lm-accent-rgb,201,169,110),0.15)]"
                  >
                    <Info className="size-[10px]" strokeWidth={2.4} />
                  </button>
                </PopoverTrigger>
                {/* Popover e não tooltip: no telemóvel um tooltip não abre. */}
                <PopoverContent
                  align="start"
                  className="w-[260px] border-[rgba(var(--lm-accent-rgb,201,169,110),0.25)] bg-[var(--lm-surface,#1A1A1A)] text-[var(--lm-text,#fff)]"
                >
                  <p className="text-[12px] font-semibold uppercase tracking-[1px] text-[var(--lm-accent,#C9A96E)]">
                    {infoTitulo}
                  </p>
                  <p className="mt-2 text-[12px] leading-[1.5] text-[var(--lm-muted,#999)]">
                    {infoTexto}
                  </p>
                </PopoverContent>
            </Popover>
            )}
          </span>
        </div>

        {temEscolha && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {([
              {
                modo: "shared" as const,
                preco: precoPartilhado!,
                Icone: UsersRound,
                rotulo: t("sharing.shared"),
                unidade: t("perPerson"),
                nota: t("sharing.sharedNote"),
              },
              {
                modo: "private" as const,
                preco: price,
                Icone: User,
                rotulo: t("sharing.private"),
                unidade: t("sharing.perVehicle"),
                /* Quantas pessoas cabem na viatura: sem isto, "por viatura" não
                   diz a quem está a comprar se o seu grupo cabe lá. Os lugares
                   da viatura mandam no máximo do evento — é o carro que limita. */
                nota: lugares
                  ? t("sharing.upToPassengers", { count: lugares })
                  : t("sharing.privateNote"),
              },
            ]).map(({ modo, preco, Icone, rotulo, unidade, nota }) => {
              const activo = sharingMode === modo
              return (
                <button
                  key={modo}
                  type="button"
                  onClick={() => setSharingMode(modo)}
                  aria-pressed={activo}
                  className={`flex flex-col gap-1 border px-3 py-2.5 text-left transition-colors ${
                    activo
                      ? "border-[var(--lm-accent,#C9A96E)] bg-[rgba(var(--lm-accent-rgb,201,169,110),0.1)]"
                      : "border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] hover:border-[rgba(var(--lm-accent-rgb,201,169,110),0.4)]"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Icone
                      className={`size-[14px] ${activo ? "text-[var(--lm-accent,#C9A96E)]" : "text-[var(--lm-muted,#999)]"}`}
                      strokeWidth={1.6}
                    />
                    <span className={`text-[12px] font-semibold ${activo ? "text-[var(--lm-text,#fff)]" : "text-[var(--lm-muted,#999)]"}`}>
                      {rotulo}
                    </span>
                  </span>
                  <span className="text-[13px] text-[var(--lm-accent,#C9A96E)]">
                    {format(preco)}{" "}
                    <span className="text-[10px] text-[var(--lm-muted,#8c8680)]">{unidade}</span>
                  </span>
                  <span className="text-[10px] leading-[1.35] text-[var(--lm-muted,#8c8680)]">{nota}</span>
                </button>
              )
            })}
          </div>
        )}
        {!hideReviews && (
          <div className="flex items-center gap-[6px] mt-1">
            <span className="text-[12px] text-[var(--lm-accent,#C9A96E)] tracking-[0.5px]">★★★★★</span>
            <span className="text-[12px] font-semibold text-[var(--lm-text,#fff)]">{rating.toFixed(1)}</span>
            <span className="text-[12px] text-[var(--lm-muted,#999)]">· {reviewCount} {t("reviews")}</span>
          </div>
        )}
      </div>

      <div className="px-6 py-6 flex flex-col gap-[10px]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-[var(--lm-muted,#999)]" strokeWidth={1.2} />
            <span className="text-[12px] font-semibold text-[var(--lm-muted,#999)] tracking-[1.35px] uppercase">{porSaidas ? t("departures.title") : t("dateAndTime")}</span>
          </div>
          {porSaidas ? (
            <EscolhaSaidas saidas={saidas!.saidas} escolha={escolha} aoMudar={setEscolha} pessoas={adults + children + infants} />
          ) : isPrivateEvent ? (
            <EventDateTimePicker
              start={fixedDateTime!}
              end={eventEndDate}
              value={dateTime}
              onChange={setDateTime}
              dark={!(isHome && theme === "light")}
            />
          ) : fixedDateTime ? (
            <div className="w-full h-[44px] px-[13px] border border-[rgba(var(--lm-text-rgb,255,255,255),0.12)] bg-[var(--lm-surface,#1E1D1B)] flex items-center gap-3">
              {/* Branco como os valores das linhas abaixo: é informação, não
                  um campo por preencher. */}
              <span className="flex-1 text-[14px] text-[var(--lm-text,#fff)]">{formatFixedDateTime()}</span>
              <CalendarClock className="size-6 text-[var(--lm-muted,#999)]" strokeWidth={1.2} />
            </div>
          ) : (
            <TourDateTimePicker
              light={isHome && theme === "light"}
              value={dateTime}
              onChange={setDateTime}
              availability={availability}
              bookingDeadlineHours={bookingDeadlineHours}
              isLoading={isLoadingAvailability}
              onMonthChange={handleMonthChange}
            />
          )}
        </div>

        {/* Com saídas cada viagem já diz a rota e a hora: estas duas linhas, do
            evento em geral, contradiziam-nas. */}
        {rota && !porSaidas && <LinhaDeInfo rotulo={t("service.route")} valor={rota} />}

        {/* Em partilhado interessa a hora a que se parte e se volta; em privado
            a recolha é combinada, e o que interessa é o que a viatura leva. */}
        {porViatura ? (
          <>
            <LinhaDeInfo rotulo={t("service.flexibility")} valor={t("service.scheduledPickup")} />
            <LinhaDeInfo rotulo={t("service.included")} valor={incluido} />
          </>
        ) : (
          <>
            {horarios && !porSaidas && (
              <LinhaDeInfo rotulo={t("service.departureReturn")} valor={horarios} />
            )}

            <div className="flex items-center gap-2 pt-3">
              <Users className="size-4 text-[var(--lm-muted,#999)]" strokeWidth={1.2} />
              <span className="text-[12px] font-semibold text-[var(--lm-muted,#999)] tracking-[1.35px] uppercase">{t("passengers")}</span>
            </div>

            {/* Os contadores ficam só aqui: em partilhado é o número de pessoas
                que faz o preço. Em privado vende-se a viatura, e o número real
                é pedido no checkout, limitado aos lugares. */}
            <div className="border border-[rgba(var(--lm-text-rgb,255,255,255),0.06)]">
              <PaxRow label={t("adult")} desc={t("adultAge")} count={adults} onDec={() => setAdults(Math.max(1, adults - 1))} onInc={() => setAdults(adults + 1)} disableInc={isAtMax} />
              <PaxRow label={t("children")} desc={t("childrenAge")} count={children} onDec={() => setChildren(Math.max(0, children - 1))} onInc={() => setChildren(children + 1)} disableInc={isAtMax} />
              <PaxRow label={t("infant")} desc={t("infantAge")} count={infants} onDec={() => setInfants(Math.max(0, infants - 1))} onInc={() => setInfants(infants + 1)} disableInc={isAtMax} />
            </div>
          </>
        )}

        {temEscolha && (
          <div className="flex items-center gap-2 pt-1">
            <span className="relative inline-flex size-2 shrink-0">
              <span className="absolute inset-0 rounded-full bg-[#4ADE80] opacity-75 animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-[#4ADE80]" />
            </span>
            <span className="text-[11px] leading-[1.35] text-[#4ADE80]">
              {porViatura
                ? t("service.exclusiveVehicle")
                : t("service.plannedDeparture", {
                    hours: service?.confirmationHours ?? 72,
                  })}
            </span>
          </div>
        )}

        {addons && addons.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-3">
              <Layers className="size-4 text-[var(--lm-muted,#999)]" strokeWidth={1.2} />
              <span className="text-[12px] font-semibold text-[var(--lm-muted,#999)] tracking-[1.35px] uppercase">{t("addOns")}</span>
            </div>
            <BookingAddonsSelector
              addons={addons}
              selectedAddonIds={selectedAddonIds}
              onToggleAddon={handleToggleAddon}
              totalGuests={totalGuests || 1}
              currency={currency}
            />
          </>
        )}

        <div className="border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.06)] pt-4 pb-4 flex items-center justify-between">
          <span className="text-[12px] font-bold text-[var(--lm-muted,#999)] tracking-[1px] uppercase">{t("total")}</span>
          <span className="text-[32px] font-bold text-[var(--lm-text,#fff)]" style={{ fontFamily: "var(--font-title), 'Cormorant Garamond', serif" }}>
            {/* Sem viagem escolhida ainda não há total: "€ 0" parecia grátis. */}
            {porSaidas && pernas.length === 0 ? "—" : format(total)}
          </span>
        </div>

        <button
          onClick={handleBook}
          disabled={!selectionIsValid || isBelowMin}
          className="w-full h-[48px] bg-[var(--lm-accent,#C9A96E)] border border-[var(--lm-accent,#C9A96E)] flex items-center justify-center gap-2 hover:bg-[#b8954f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-[14px] font-medium text-[#0D0D0D] uppercase tracking-[1.1px]">
            {temEscolha
              ? porViatura
                ? t("service.ctaPrivate")
                : t("service.ctaShared")
              : t("bookNow")}
          </span>
          <ArrowRight className="size-[18px] text-[#0D0D0D]" />
        </button>

        <div
          aria-hidden={!isBelowMin}
          className={`grid transition-all duration-300 ease-out ${
            isBelowMin ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <p className="text-[12px] text-[var(--lm-muted,#999)] text-center pt-1">
              {t("minPassengersRequired", { count: minPassengers ?? 1 })}
            </p>
          </div>
        </div>

        {temEscolha && (
          <p className="px-1 text-center text-[10px] leading-[1.5] text-[var(--lm-muted,#8c8680)]">
            {porViatura ? t("service.finePrivate") : t("service.fineShared")}
          </p>
        )}

        <div className="border-t border-[rgba(var(--lm-text-rgb,255,255,255),0.04)] pt-4 flex items-center justify-center gap-2">
          <span className="relative inline-flex size-2">
            <span className="absolute inset-0 rounded-full bg-[#4ADE80] opacity-75 animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-[#4ADE80]" />
          </span>
          <span className="text-[10px] font-semibold text-[var(--lm-accent,#C9A96E)]">141 {t("travelers")}</span>
          <span className="text-[10px] text-[var(--lm-muted,#999)]">{t("bookedToday")}</span>
        </div>
      </div>
    </div>
  )
}
