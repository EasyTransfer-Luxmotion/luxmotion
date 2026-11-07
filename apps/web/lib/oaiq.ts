/**
 * O pixel do ChatGPT Ads.
 *
 * São duas coisas separadas e é bom não as confundir. O script base carrega uma
 * vez por página (`components/analytics/openai-pixel.tsx`) e serve para o
 * OpenAI reconhecer a visita. O evento `lead_created` é outra coisa: só sai
 * quando um pedido de orçamento foi mesmo recebido e guardado.
 *
 * A regra que interessa, e a razão de isto viver aqui e não solto em cada
 * formulário: **uma vez por pedido**. Não quando alguém abre o formulário, não
 * quando carrega em enviar, não quando a submissão dá erro. Um número de leads
 * inflacionado estraga a campanha de duas maneiras — paga-se por conversões que
 * não existem e as decisões passam a ser tomadas sobre um número falso.
 */

type Oaiq = (comando: string, ...resto: unknown[]) => void

declare global {
  interface Window {
    oaiq?: Oaiq
  }
}

/* Só por variável, definida só em produção. Com o id escrito aqui como valor
   por omissão, development e staging mandavam as visitas e os pedidos de teste
   para as estatísticas dos anúncios — a mesma armadilha dos webhooks. */
export const OPENAI_PIXEL_ID = process.env.NEXT_PUBLIC_OPENAI_PIXEL_ID?.trim() || null

/**
 * Um pedido de orçamento que já está guardado do nosso lado.
 *
 * Chamar só a seguir a a mutation resolver, nunca antes. Nada aqui rebenta: se
 * o script não carregou — bloqueador de anúncios, rede a falhar — a submissão
 * do visitante não pode ir atrás.
 */
export function medirPedidoDeOrcamento(): void {
  try {
    window.oaiq?.("measure", "lead_created", { type: "customer_action" })
  } catch {
    /* Uma medição perdida não é motivo para partir um formulário. */
  }
}

/**
 * Uma compra confirmada.
 *
 * A forma não é adivinhada: foi lida do próprio SDK (`bzrcdn.openai.com/sdk/
 * oaiq.min.js`), depois de a primeira tentativa ter sido recusada com
 * "validation failed; event dropped". O que ele exige:
 *
 *   `order_created` é do tipo **`contents`** e não `customer_action` — esse é
 *   o do `lead_created`. Os campos aceites para este tipo são exactamente
 *   `type`, `amount`, `currency` e `contents`; qualquer outro derruba o evento.
 *
 *   `amount` tem de ser **inteiro**, o que confirma que são cêntimos: 52,40 €
 *   não se escreve em euros sem casas decimais.
 *
 *   `currency` tem de ser um código ISO 4217 de três letras.
 *
 *   O identificador de deduplicação vai num **quarto argumento**, à parte das
 *   propriedades. É por aí que a OpenAI despreza o repetido quando a mesma
 *   compra chegar também pelo servidor — o mecanismo não é enviar menos, é
 *   dizer que é a mesma.
 */
export function medirCompra(compra: {
  orderNumber: string
  amountCents: number
}): void {
  try {
    window.oaiq?.(
      "measure",
      "order_created",
      {
        type: "contents",
        amount: Math.round(compra.amountCents),
        currency: "EUR",
        contents: [
          {
            id: compra.orderNumber,
            name: "Transfer",
            content_type: "product",
            quantity: 1,
            amount: Math.round(compra.amountCents),
            currency: "EUR",
          },
        ],
      },
      { event_id: compra.orderNumber },
    )
  } catch {
    /* Uma medição perdida não estraga uma reserva que já está paga. */
  }
}
