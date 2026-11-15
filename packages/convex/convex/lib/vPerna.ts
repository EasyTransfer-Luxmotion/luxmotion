import { v } from "convex/values";

/* Uma perna de uma reserva com saídas (E3A): copiada da saída no momento da
   reserva, para a reserva e a order dizerem quando e de onde se parte mesmo
   que a saída mude ou seja cancelada depois. */
export const vPerna = v.object({
  saidaId: v.id("eventDepartures"),
  sentido: v.union(v.literal("ida"), v.literal("regresso")),
  partida: v.number(),
  origem: v.string(),
  destino: v.string(),
  preco: v.number(),
});
