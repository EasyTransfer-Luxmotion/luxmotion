import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { avaliarAcesso } from "./lib/admin";

/*
 * O Início do dashboard: os serviços de um dia, por hora.
 *
 * Os mesmos estados que o contador "hoje" da sidebar (contadores.ts) — pagas,
 * confirmadas e feitas. Rascunhos e pendentes são carrinhos por pagar, e as
 * canceladas não são serviço; mostrá-los aqui era pôr a operação a olhar para
 * viagens que não vão acontecer.
 *
 * null sem acesso, como as outras queries que o dashboard chama de cima.
 */

const ESTADOS_DE_SERVICO = new Set(["paid", "confirmed", "completed"]);
/* Um dia com mais do que isto já não cabe numa lista para ler de relance; a
   lista de Reservas continua a ter tudo. */
const MAXIMO = 200;

function local(p: { location?: string; name?: string } | undefined): string {
  return p?.name?.trim() || p?.location?.trim() || "—";
}

export const servicos = query({
  /* AAAA-MM-DD em Lisboa, vindo do browser (ver contadores.porTratar). */
  args: { dia: v.string() },
  handler: async (ctx, { dia }) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { linhas: [], mais: false };

    const docs = await ctx.db
      .query("orders")
      .withIndex("by_departure_date", (q) => q.gte("departureDate", dia).lt("departureDate", dia + "￿"))
      .take(MAXIMO * 3);
    const doDia = docs.filter((o) => ESTADOS_DE_SERVICO.has(o.status));

    /*
     * Ida e regresso são duas linhas ligadas por relatedOrderId nos dois
     * sentidos (orders.create). A ida é a mais antiga das duas — são criadas
     * na mesma mutation, a ida primeiro. O regresso nasce sem os dados do
     * cliente, que ficam na ida: sem ir buscá-la, a linha do regresso não
     * dizia de quem era.
     */
    const relacionadas = new Map<string, Doc<"orders"> | null>();
    await Promise.all(
      doDia
        .filter((o) => o.relatedOrderId)
        .map(async (o) => relacionadas.set(o._id, await ctx.db.get(o.relatedOrderId!))),
    );

    const linhas = doDia.slice(0, MAXIMO).map((o) => {
      const outra = relacionadas.get(o._id) ?? null;
      const perna: "ida" | "regresso" | null = outra
        ? o._creationTime > outra._creationTime
          ? "regresso"
          : "ida"
        : null;
      return {
        _id: o._id,
        orderNumber: o.orderNumber ?? "",
        hora: o.departureDate.slice(11, 16) || null,
        cliente: o.passengerName?.trim() || o.customerName?.trim() || outra?.customerName?.trim() || null,
        origem: local(o.departure),
        destino: local(o.arrival),
        passageiros: o.passengers,
        veiculo: o.vehicleName ?? outra?.vehicleName ?? null,
        voo: o.flightNumber ?? null,
        status: o.status,
        paymentStatus: o.paymentStatus ?? null,
        perna,
        tour: Boolean(o.tourBookingId) || (o.orderNumber ?? "").startsWith("TB"),
      };
    });
    linhas.sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99"));
    return { linhas, mais: doDia.length > MAXIMO };
  },
});

/* ─── Estatísticas do período ─────────────────────────────────────────── */

/*
 * Os números do Início: reservas, faturação, de onde vêm e para onde vão.
 *
 * Contas:
 *  - Uma reserva é uma encomenda paga, confirmada ou feita. Ida e volta são
 *    duas encomendas ligadas por relatedOrderId: contam como uma reserva (a
 *    ida, que é a mais antiga), mas a faturação soma as duas pernas, porque
 *    cada uma tem o seu totalAmount (orders.startPaymentAction).
 *  - Um tour ou evento pago cria uma encomenda espelho com tourBookingId
 *    (tourBookings.ts) — é por ela que entra, para não contar duas vezes.
 *  - O período é pela data em que a reserva foi feita, não pela da viagem:
 *    são vendas. A data da viagem é o que a lista de Reservas mostra.
 *  - Método de pagamento e parceiro vêm da ida. "Dinheiro" conta como pago
 *    logo ao reservar: o checkout marca-o assim (orders.startPayment) e
 *    ninguém regista depois se o motorista recebeu.
 *  - A origem é só a observada no endereço (adSource). Parceiro e opprefId
 *    são outras coisas e não entram neste gráfico; sem dados, "Origem
 *    desconhecida".
 *
 * O dia de hoje vem do browser, como em contadores.porTratar: a resposta em
 * cache muda à meia-noite de Lisboa em vez de ficar presa no dia anterior.
 *
 * Em produção há 1 830 encomendas (1,8 MB, 2026-11-14), por isso lê-se a
 * tabela inteira do período sem medo do limite de leitura. Se um dia crescer
 * dez vezes, isto passa a precisar de agregados gravados.
 */

const PERIODOS = { "30d": 30, "90d": 91, "12m": 12, tudo: 0 } as const;
type Periodo = keyof typeof PERIODOS;

const diaLisboa = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" });
const paraDia = (ms: number) => diaLisboa.format(new Date(ms));
/* Dias desde 1970 de uma data AAAA-MM-DD, para contas de semanas. */
const indiceDia = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);
const deIndice = (i: number) => new Date(i * 86_400_000).toISOString().slice(0, 10);
const somarMeses = (mes: string, n: number) => {
  const t = +mes.slice(0, 4) * 12 + (+mes.slice(5, 7) - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

function origemNoEndereco(o: Doc<"orders">): string {
  const s = o.adSource?.utmSource?.trim().toLowerCase();
  if (!s) return "Origem desconhecida";
  if (s.includes("google")) return "Google";
  if (s === "meta" || s.includes("facebook") || s.includes("instagram") || s === "fb" || s === "ig") return "Meta";
  if (s.includes("chatgpt") || s.includes("openai")) return "ChatGPT";
  return s;
}

/* Os códigos que o checkout e o webhook do Stripe gravam em paymentMethod. */
const METODOS: Record<string, string> = {
  ccard: "Cartão",
  card: "Cartão",
  link: "Cartão (Stripe Link)",
  mbway: "MB WAY",
  mb: "Multibanco",
  multibanco: "Multibanco",
  cash: "Dinheiro",
  transferencia: "Transferência",
};
const SEM_METODO = "Sem método registado";
/* "Easy Transfer" é o que orders.create grava quando não veio parceria no
   endereço: é o site, não um parceiro. Contá-lo como parceiro dizia que 97%
   das reservas vinham de parcerias. */
const SEM_PARCEIRO = "Sem parceiro (site)";
const parceiroDe = (o: Doc<"orders">) => {
  const p = o.partnershipName?.trim();
  return !p || p === "Easy Transfer" ? SEM_PARCEIRO : p;
};

export const estatisticas = query({
  args: {
    periodo: v.union(v.literal("30d"), v.literal("90d"), v.literal("12m"), v.literal("tudo")),
    hoje: v.string(),
  },
  handler: async (ctx, { periodo, hoje }) => {
    if (avaliarAcesso(await ctx.auth.getUserIdentity()) !== "admin") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje)) return null;

    /* Os baldes do gráfico e o início do período (e do anterior, para a
       comparação). Dias para 30 dias, semanas para 90, meses para o resto. */
    const hj = indiceDia(hoje);
    let granularidade: "dia" | "semana" | "mes";
    let baldes: string[];
    let inicio: string | null;
    let inicioAntes: string | null;
    if (periodo === "30d" || periodo === "90d") {
      const dias = PERIODOS[periodo];
      granularidade = periodo === "30d" ? "dia" : "semana";
      inicio = deIndice(hj - dias + 1);
      inicioAntes = deIndice(hj - 2 * dias + 1);
      const passo = granularidade === "dia" ? 1 : 7;
      baldes = Array.from({ length: Math.ceil(dias / passo) }, (_, i) => deIndice(hj - dias + 1 + i * passo));
    } else {
      granularidade = "mes";
      const mesHoje = hoje.slice(0, 7);
      if (periodo === "12m") {
        inicio = somarMeses(mesHoje, -11) + "-01";
        inicioAntes = somarMeses(mesHoje, -23) + "-01";
      } else {
        inicio = null;
        inicioAntes = null;
      }
      baldes = [];
    }

    const desde = inicioAntes ? (indiceDia(inicioAntes) - 1) * 86_400_000 : 0;
    const docs = await ctx.db
      .query("orders")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", desde))
      .collect();

    if (periodo === "tudo") {
      const primeiro = docs.length ? paraDia(docs[0]!._creationTime).slice(0, 7) : hoje.slice(0, 7);
      for (let m = primeiro; m <= hoje.slice(0, 7); m = somarMeses(m, 1)) baldes.push(m);
    } else if (periodo === "12m") {
      for (let i = 11; i >= 0; i--) baldes.push(somarMeses(hoje.slice(0, 7), -i));
    }
    const balde = (dia: string): number => {
      if (granularidade === "mes") return baldes.indexOf(dia.slice(0, 7));
      const i = Math.floor((indiceDia(dia) - indiceDia(baldes[0]!)) / (granularidade === "dia" ? 1 : 7));
      return i >= 0 && i < baldes.length ? i : -1;
    };

    const porId = new Map(docs.map((o) => [o._id as string, o]));
    /* A volta é a perna mais recente das duas. Se a outra perna for de antes
       do período lido, lê-se — senão a volta passava por ida. */
    const outras = new Map<string, Doc<"orders"> | null>();
    await Promise.all(
      docs
        .filter((o) => o.relatedOrderId && !porId.has(o.relatedOrderId))
        .map(async (o) => outras.set(o.relatedOrderId!, await ctx.db.get(o.relatedOrderId!))),
    );
    const eVolta = (o: Doc<"orders">) => {
      if (!o.relatedOrderId) return false;
      const outra = porId.get(o.relatedOrderId) ?? outras.get(o.relatedOrderId);
      return Boolean(outra && outra._creationTime < o._creationTime);
    };

    /* Tours e eventos: o tipo está na reserva do tour. */
    const tipos = new Map<string, "tour" | "evento">();
    await Promise.all(
      docs
        .filter((o) => o.tourBookingId)
        .map(async (o) => {
          const b = await ctx.db.get(o.tourBookingId!);
          tipos.set(o._id, b?.productType === "event" ? "evento" : "tour");
        }),
    );
    const produto = (o: Doc<"orders">): "transfer" | "tour" | "evento" =>
      tipos.get(o._id) ?? ((o.orderNumber ?? "").startsWith("TB") ? "tour" : "transfer");

    const reserva = (o: Doc<"orders">) => ESTADOS_DE_SERVICO.has(o.status);
    const vazio = () => baldes.map(() => 0);
    const serie = { transfer: vazio(), tour: vazio(), evento: vazio() };
    const faturacaoSerie = vazio();
    const contas = () => ({ reservas: 0, faturacao: 0, passageiros: 0, iniciados: 0, pagos: 0 });
    const agora = contas();
    const antes = contas();
    const origens = new Map<string, number>();
    const viaturas = new Map<string, number>();
    const rotas = new Map<string, { origem: string; destino: string; reservas: number; faturacao: number }>();
    const metodos = new Map<string, { rotulo: string; reservas: number; faturacao: number }>();
    const parceiros = new Map<string, { rotulo: string; reservas: number; faturacao: number }>();
    const somar = (m: typeof metodos, rotulo: string, valor: number, conta: boolean) => {
      const x = m.get(rotulo) ?? { rotulo, reservas: 0, faturacao: 0 };
      x.faturacao += valor;
      if (conta) x.reservas++;
      m.set(rotulo, x);
    };

    for (const o of docs) {
      const dia = paraDia(o._creationTime);
      const noPeriodo = inicio === null || dia >= inicio;
      const c = noPeriodo ? agora : inicioAntes !== null && dia >= inicioAntes ? antes : null;
      if (!c) continue;
      const volta = eVolta(o);
      const p = produto(o);

      /* Conversão do checkout: só transfers, uma vez por viagem. Os tours
         nascem já pagos e faziam a taxa parecer melhor do que é. */
      if (p === "transfer" && !volta) {
        c.iniciados++;
        if (reserva(o)) c.pagos++;
      }
      if (!reserva(o)) continue;
      const valor = o.totalAmount ?? 0;
      c.faturacao += valor;
      if (!volta) {
        c.reservas++;
        c.passageiros += o.passengers ?? 0;
      }
      if (c !== agora) continue;

      const b = balde(dia);
      if (b >= 0) {
        faturacaoSerie[b]! += valor;
        if (!volta) serie[p][b]!++;
      }
      /* Método e parceiro são os da ida: a volta nasce sem eles (o pagamento
         é um só e fica gravado na ida), e a faturação dela vai para o mesmo
         sítio. */
      const ida = volta ? (porId.get(o.relatedOrderId!) ?? outras.get(o.relatedOrderId!) ?? o) : o;
      const metodo = ida.paymentMethod?.trim().toLowerCase();
      somar(metodos, metodo ? (METODOS[metodo] ?? metodo) : SEM_METODO, valor, !volta);
      somar(parceiros, parceiroDe(ida), valor, !volta);
      if (volta) {
        const r = rotas.get(`${local(o.arrival)}→${local(o.departure)}`.toLowerCase());
        if (r) r.faturacao += valor;
      }
      if (volta) continue;
      origens.set(origemNoEndereco(o), (origens.get(origemNoEndereco(o)) ?? 0) + 1);
      if (p === "transfer") {
        const vi = o.vehicleName?.trim() || "Sem viatura indicada";
        viaturas.set(vi, (viaturas.get(vi) ?? 0) + 1);
        const origem = local(o.departure);
        const destino = local(o.arrival);
        const chave = `${origem}→${destino}`.toLowerCase();
        const r = rotas.get(chave) ?? { origem, destino, reservas: 0, faturacao: 0 };
        r.reservas++;
        r.faturacao += valor;
        rotas.set(chave, r);
      }
    }

    const ordenar = (m: Map<string, number>) =>
      [...m.entries()].map(([rotulo, n]) => ({ rotulo, n })).sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo));
    const arredondar = <T extends { faturacao: number }>(x: T): T => ({ ...x, faturacao: Math.round(x.faturacao * 100) / 100 });
    const resumo = (c: ReturnType<typeof contas>) => ({
      reservas: c.reservas,
      faturacao: Math.round(c.faturacao * 100) / 100,
      passageiros: c.passageiros,
      valorMedio: c.reservas ? Math.round((c.faturacao / c.reservas) * 100) / 100 : null,
      conversao: c.iniciados ? Math.round((c.pagos / c.iniciados) * 1000) / 10 : null,
      iniciados: c.iniciados,
    });

    return {
      periodo: periodo as Periodo,
      granularidade,
      baldes,
      agora: resumo(agora),
      antes: inicioAntes ? resumo(antes) : null,
      serie,
      faturacao: faturacaoSerie.map((x) => Math.round(x * 100) / 100),
      origens: ordenar(origens),
      viaturas: ordenar(viaturas),
      metodos: [...metodos.values()].map(arredondar).sort((a, b) => b.faturacao - a.faturacao),
      parceiros: [...parceiros.values()].map(arredondar).sort((a, b) => b.reservas - a.reservas || b.faturacao - a.faturacao),
      semMetodo: SEM_METODO,
      semParceiro: SEM_PARCEIRO,
      rotas: [...rotas.values()].sort((a, b) => b.reservas - a.reservas || b.faturacao - a.faturacao).slice(0, 8),
    };
  },
});
