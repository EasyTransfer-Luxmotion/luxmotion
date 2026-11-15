import type { Id } from "@workspace/convex/dataModel"
import type { ExperienceSelection } from "@/components/checkout/checkout-context"
import { diaDoRelogio } from "@/lib/hora-lisboa"

/**
 * Converte um extra escolhido no passo 2 no formato que a order guarda até o
 * pagamento confirmar (`orders.setPendingCheckoutExperiences`).
 *
 * Vive aqui, e não dentro de cada passo de pagamento, porque o checkout está
 * duplicado (site principal e parcerias) e as duas cópias tinham de mapear isto
 * exactamente da mesma maneira — o que já não acontecia.
 */
export function toPendingExperience(exp: ExperienceSelection) {
  const isEvent = exp.category === "events"
  const isUpsellStop = exp.category === "upsellStop"
  const isUpsellExperience = exp.category === "upsellExperience"
  const isUpsell = isUpsellStop || isUpsellExperience
  const isTour = exp.category === "tours" || exp.category === "private"

  const addonsTotal = (exp.selectedAddons ?? []).reduce(
    (sum, line) => sum + line.subtotal,
    0,
  )

  return {
    // Paragens e experiências de upsell contam como "experience" para a
    // operação: não são tours com página própria.
    productType: (isEvent ? "event" : isTour ? "tour" : "experience") as
      | "tour"
      | "experience"
      | "event",
    tourId: (!isEvent && !isUpsell ? exp.experienceId : undefined) as
      | Id<"tours">
      | undefined,
    eventId: (isEvent ? exp.experienceId : undefined) as Id<"events"> | undefined,
    upsellStopId: (isUpsellStop ? exp.experienceId : undefined) as
      | Id<"upsellStops">
      | undefined,
    upsellExperienceId: (isUpsellExperience ? exp.experienceId : undefined) as
      | Id<"upsellExperiences">
      | undefined,
    tourTitle: exp.title,
    tourSlug: exp.slug,
    passengers: exp.passengers,
    // Dia do calendário, não toISOString: a leste de UTC dava o dia anterior.
    selectedDate: exp.date ? diaDoRelogio(exp.date) : "",
    selectedTime: exp.time ?? "",
    basePrice: exp.totalPrice,
    // Os upsells não têm paragens em `tourStops` de onde tirar partida/chegada.
    pickup: exp.location
      ? {
          title: exp.location.title,
          address: exp.location.address,
          lat: exp.location.lat,
          lng: exp.location.lng,
          placeId: exp.location.placeId,
        }
      : undefined,
    selectedAddons: exp.selectedAddons?.length ? exp.selectedAddons : undefined,
    addonsTotal: addonsTotal > 0 ? addonsTotal : undefined,
    specialRequest: exp.specialRequest?.trim() ? exp.specialRequest.trim() : undefined,
  }
}
