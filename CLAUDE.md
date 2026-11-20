# LuxMotion / EasyTransfer

Transfers privados, tours e eventos em Portugal. Monorepo pnpm + turbo.

```
apps/web            Next.js 15, App Router, next-intl (pt en es fr de nl)
packages/convex     backend: base de dados, queries, mutations, actions, crons
packages/ui         componentes partilhados (shadcn)
packages/*-config   eslint e typescript
```

## O admin não está aqui

O back-office vive no repositório `EasyTransfer-Luxmotion/dashboard`, com
serviço próprio no Railway. O site **não tem admin nem Clerk** — só chama
funções públicas do Convex. Um `/admin` antigo é reencaminhado pelo middleware
para o mesmo ecrã no dashboard (`DASHBOARD_URL`, por ambiente), e os links dos
emails de aviso seguem `ADMIN_BASE_URL` no Convex, que aponta para o dashboard.

Mudanças a ecrãs do admin fazem-se no repositório do dashboard. As funções do
Convex continuam aqui, em `packages/convex`; o dashboard vai buscá-las ao
branch com o nome do ambiente.

## Comandos

```bash
pnpm install
pnpm --filter web dev          # servidor de desenvolvimento
pnpm --filter web typecheck    # corre sempre antes de commitar
pnpm --filter web build        # o build a sério; apanha o que o typecheck não apanha
cd packages/convex && pnpm typecheck
```

Node 22, pnpm 10. Não usar npm nem yarn neste repositório.

## As duas metades, e a ordem entre elas

O site e o backend são publicados **em separado**, e a ordem importa:

1. **Convex primeiro** (`cd packages/convex && npx convex deploy`)
2. **O site depois**

Publicar funções novas não parte o site antigo — ele simplesmente não as chama.
O contrário parte: já aconteceu o checkout responder "algo correu mal" a quem
tentava reservar, porque o site foi publicado a chamar uma função que ainda não
existia. O [scripts/vercel-build.sh](scripts/vercel-build.sh) faz esta ordem
sozinho quando `CONVEX_DEPLOY_KEY` está definido.

Se mexeres no `schema.ts` ou nos argumentos de uma mutation, **o Convex tem de
ser publicado** ou o site parte no primeiro pedido.

## Ambientes

Três, um branch por cada:

| branch | ambiente | notas |
|---|---|---|
| `development` | development | |
| `staging` | staging | |
| `production` | production | o que os clientes vêem |

`main` continua a ser o branch por omissão do repositório.

Cada ambiente precisa do **seu** deployment de Convex. Não partilhar a base de
dados de produção com staging: as mutations gravam a sério, e um teste de
reserva em staging mandaria email ao cliente, criaria negócio no Pipedrive e
avisaria a operação.

Os três vivem **no mesmo projecto Convex, `luxmotion`** (equipa
`easytransferportugal`), como deployments separados:

| ambiente | deployment | URL |
|---|---|---|
| production | `clean-starling-300` | `https://clean-starling-300.convex.cloud` |
| staging | `acoustic-gazelle-962` | `https://acoustic-gazelle-962.eu-west-1.convex.cloud` |
| development | `calculating-reindeer-93` | `https://calculating-reindeer-93.eu-west-1.convex.cloud` |

Production e staging são do tipo `prod` (roxo no painel: edições pedem
confirmação). Development é do tipo `dev` (verde) e é o deployment pessoal por
omissão da conta `easytransfer` — por isso o `npx convex dev` e o `.env.local`
vão lá parar, e o trabalho local fica no mesmo sítio que o Railway development.

**A CLI do projecto (1.31) ignora o `CONVEX_DEPLOYMENT`** quando não é o
deployment pessoal por omissão da conta, e cai sem avisar nesse. Para visar
outro: `npx convex@latest <comando> --deployment staging`, ou uma deploy key
desse deployment em `CONVEX_DEPLOY_KEY`. **O `deploy` não aceita
`--deployment`**: para publicar em staging é sempre a deploy key, e com o
`CONVEX_DEPLOYMENT` definido publica no de produção do projecto. Os URLs de
staging e development levam a região (`eu-west-1`): sem ela dão 404.

**A Vercel deixou de publicar** desde que o repositório passou para a organização
`EasyTransfer-Luxmotion` (2026-11-06): os pushes ao `main` não chegam lá, e o
site em `www.easytransferportugal.com` está preso num build de antes disso. É o
Railway que tem o código actual; a Vercel fica assim até o domínio passar para
o Railway. Sintoma visível: o sitemap da Vercel só tem as 31 páginas estáticas,
e o do Railway production, com o mesmo Convex, tem 178.

## Railway

Dois repositórios, dois serviços, três ambientes cada:

| serviço | repositório | o que é |
|---|---|---|
| `site` | `EasyTransfer-Luxmotion/luxmotion` | o site público |
| `dashboard` | `EasyTransfer-Luxmotion/dashboard` | o back-office, `dashboard.easytransferportugal.com` |

Cada serviço tem um *deployment trigger* por ambiente, e cada trigger ouve o
branch com o mesmo nome. São seis ao todo. Para os ver:

```bash
railway api 'query($p:String!,$e:String!,$s:String!){ deploymentTriggers(projectId:$p, environmentId:$e, serviceId:$s){ edges{ node{ repository branch } } } }' \
  --raw-var p=<projectId> --raw-var e=<environmentId> --raw-var s=<serviceId>
```

**O `serviceConnect` escreve o mesmo branch em todos os ambientes.** Depois de
o correr é preciso repor dev e staging com `deploymentTriggerUpdate`, ou os três
ambientes passam a seguir `production`.

**Mudanças em ambientes que não sejam o de produção ficam em espera.** O
`serviceInstanceUpdate` devolve `true` e não faz nada visível até se aplicar com
`environmentPatchCommitStaged`. Ler sempre o `environmentStagedChanges` antes de
aplicar: uma tentativa anterior pode lá estar à espera de pôr o `source` a
`null` e desligar o serviço do repositório.

**O `serviceInstanceRedeploy` não serve para republicar.** Morre aos ~74 s,
logo a seguir a *Creating an optimized production build*, e **sem escrever erro
nenhum** no log — o mesmo build a partir do GitHub passa em sete minutos.
Para republicar depois de mexer em variáveis, usar `serviceInstanceDeployV2`.

**`NEXT_PUBLIC_SITE_URL` é o endereço que o Google vê** (canonical, hreflang,
sitemap, robots, og:image) e entra no build. Esteve com o URL do Railway depois
de o domínio passar para lá: todas as páginas diziam ao Google que o site
verdadeiro era `web-production-b872f.up.railway.app`. Produção:
`https://www.easytransferportugal.com` (o apex redirecciona para o www). Fora de
produção o middleware manda `X-Robots-Tag: noindex, nofollow`.

**O Next escuta na 8080, não na 3000.** Um domínio criado a apontar para a 3000
responde 502 com a aplicação perfeitamente de pé.

**Mover o repositório de dono não acompanha.** O Railway ficou a apontar ao
`Impact-Origin/luxmotion` e a resposta às mutations era *"no one in the project
has access to it"* — o que parece falta de permissões é o caminho antigo. A app
`railway-app` também tem de estar instalada na organização do GitHub:
`gh api orgs/<org>/installations --jq .total_count` tem de ser `1`.

## Bunny (imagens e vídeos)

Uma storage zone e uma CDN por ambiente, como o Convex — não partilham ficheiros:

| ambiente | storage zone | CDN |
|---|---|---|
| development | `easytransfer-development` | `https://easytransfer-development.b-cdn.net` |
| staging | `easytransfer-staging` | `https://easytransfer-staging.b-cdn.net` |
| production | `easytransfer-production` | `https://easytransfer-production.b-cdn.net` |

**Imagens carregadas no admin** (no dashboard). O browser envia para o Convex como sempre e
`imagensBunny.publicar` passa o ficheiro para o Bunny. No cliente usa-se sempre
`usePublicarImagem()`. Nas funções Convex, **nunca** `ctx.storage.getUrl` nem
`ctx.storage.delete` numa imagem de conteúdo: usar `urlDaImagem` de
`lib/imagens.ts`, que trata os dois formatos (id antigo do Convex ou caminho
`uploads/…` no Bunny). **Não se apagam ficheiros de imagem**: apagar um tour,
artigo ou experiência tira a referência e deixa o ficheiro. O mesmo ficheiro
pode estar em vários registos (a migração juntou iguais, a biblioteca dos
extras reutiliza fotos), e apagar uma experiência de teste já levou duas
fotografias de veículos.

**As candidaturas de motoristas e parceiros não vão para o Bunny.** São cartas
de condução, seguros e comprovativos bancários; a CDN é pública e não revoga
links. Ficam no storage do Convex.

**`public/`** está espelhado com os mesmos caminhos, e com `NEXT_PUBLIC_CDN_URL`
o site vai buscá-lo à CDN. O `build` corre `scripts/sincronizar-public-bunny.mjs`
primeiro, que envia o que falta. Num `<Image unoptimized>`, `<img>`, `<video>` ou
`backgroundImage` com caminho do `public/`, envolver em `cdn()` de `lib/cdn.ts` —
o loader do `<Image>` só cobre os optimizados.

**Migração feita em produção a 2026-11-07**: 1.528 ficheiros (1,28 GB) em
`uploads/migrados/<id antigo>.<ext>`. Ficaram 62 referências por migrar que
apontam para ficheiros que **já não existiam** no storage (60 em
`corporateExperiences`, 1 em `pastExperiences`, 1 em `blogs`) — imagens que já
estavam partidas antes. Para correr outra vez (é idempotente):
`npx convex run migracaoBunny:agendarMigracao --prod` e acompanhar com
`migracaoBunny:contarPorMigrar`. Não usar `npx convex run imagensBunny:migrar`
directamente: a CLI desiste de esperar antes de a action acabar.

**A CDN guarda cada ficheiro 30 dias** (browser e Bunny). Para trocar uma imagem
do `public/`, dar-lhe um nome novo — substituir o ficheiro com o mesmo nome deixa
o antigo à vista até um mês. Os uploads do admin não têm o problema: cada um
ganha um nome único.

**Os originais da migração ficaram no Convex**, e não se podem apagar sem antes
reescrever os URLs do Convex que estão **dentro do texto** dos artigos do blog
(as imagens inseridas no editor). A migração por campos não os apanha: para
isso há `migracaoTextoBunny:migrar` (`{"executar":false}` lista,
`{"executar":true}` copia e troca; idempotente). Corrida em produção a
2026-11-09 (15 artigos). Já não há imagens servidas pelo storage do Convex.

**Nenhuma imagem é redimensionada por ninguém.** O optimizador do Next está
desligado (quota da Vercel) e o Bunny Optimizer também (é pago; decidiu-se não
o ligar). O `?width=` que o loader acrescenta é ignorado: chega o ficheiro tal
como está. Por isso as imagens têm de entrar já leves — o `usePublicarImagem`
do dashboard encolhe tudo para WebP, máx. 1600 px. As 272 que passavam de 1 MB
(fotos de motoristas com 5–7 MB) foram recomprimidas a 2026-11-09 para
`uploads/recomprimidas/` com `recompressao:aplicar`; os originais ficaram.

**Fontes alojadas em `app/fonts/`**, não `next/font/google`: nos builders do
Railway o Google responde com URLs sem extensão e o Next rebenta com
*Cannot read properties of null (reading '1')*.

## Quem pode chamar o quê no Convex

O URL do Convex vai no código do browser: **toda a função exportada como
`query`/`mutation`/`action` pode ser chamada por qualquer pessoa**, sem conta.
Até 2026-11-07 nenhuma verificava quem chamava — dava para apagar tours, ler
encomendas com dados pessoais e marcar uma encomenda como paga.

- **Funções do admin** começam por `await exigirAdmin(ctx)` (`lib/admin.ts`):
  sessão + email **verificado** em `ADMIN_EMAILS` (variável de cada deployment,
  separada por vírgulas). Ter sessão não chega — o registo no Clerk de produção
  está aberto ao público. Sem a variável ninguém entra.
- **Funções que só o próprio Convex chama** (de actions, crons, `http.ts`) são
  `internalQuery`/`internalMutation`/`internalAction`, chamadas por `internal.*`.
  Uma action agendada não tem sessão: se precisa de algo que o admin também usa,
  faz-se uma versão `…Interno` com o mesmo corpo (ver `blogs.create`).
- **Abertas** só as que o site público, o checkout, as candidaturas e o servidor
  do Next (sitemap, páginas) chamam.

Ao acrescentar uma função nova, decidir em qual das três cai. Na dúvida, admin.

**Cuidado com `const x = api as any`**: esconde chamadas a funções do compilador
e de qualquer pesquisa por `api.modulo.funcao`. Foi assim que fechar o
`stripe.createCheckoutSession` ao admin partiu os dois checkouts. Usar sempre a
referência tipada (`internal.stripe.createCheckoutSession`).

**Preço dos tours**: calculado no servidor em `lib/precoTours.ts`, com as mesmas
regras do `tour-booking-card.tsx` — se mudarem lá, mudam aqui, ou o cliente vê um
número e o pagamento é recusado. Antes de cobrar, `fixarPreco` recalcula e o
pagamento é recusado se o valor que o browser viu for outro.

**Preço dos transfers: o servidor confere o total antes de cobrar.**
`orders.startPaymentAction` calcula o mínimo da reserva (`lib/precoTransfer.ts`:
carro com distância, noite, aeroporto e volta, seguros, extras, experiências,
ajuste do parceiro) e recusa um total mais de 10% abaixo; entre 1 € e 10%
aceita e grava `pricingWarning`. A folga existe porque as reservas antigas
pagaram até 20% menos por regras já corrigidas; as de Novembro de 2026 batem
certo. A distância continua a vir do browser, mas nunca abaixo da linha recta.
Se mudares preços no checkout (`*checkout/pricing.ts`), muda também ali.
`npx convex run orders:auditarMinimos` mede a regra contra as reservas pagas.

**Ajuste de preço por parceiro** (`partnerships.ajustePreco`, em %, de −50 a
+100): multiplica o preço por km e o mínimo de cada carro no checkout do
parceiro (`vehicles.listQuoted`) e no mínimo que o pagamento confere
(`lib/precoTransfer.ts`, `factorDoParceiro`). Os dois sítios têm de usar o
mesmo, ou o cliente vê um preço e o pagamento é recusado.

**Frota dos parceiros**: um parceiro mostra a frota global menos os
`veiculosEscondidos`, mais os carros que são só dele (`lib/frota.ts`). Não se
copiam carros para parceiros: preços e carros novos chegam sozinhos.

**Sininho do back-office** (`notificacoes`): cada coisa nova grava uma linha
no momento em que acontece, por `lib/notificar.ts` — reservas pagas
(`webhooks.sendOrderPayload` e o pagamento em dinheiro), formulários,
candidaturas e leads (`avisarPedido`), avaliações e a verificação diária.
**Um ponto de entrada novo tem de chamar `notificar`**, ou não aparece no
sino. A chave é única porque estes pontos repetem-se. Num ambiente novo:
`npx convex run notificacoes:preencher '{"dias":7}'`.

**Verificação diária das parcerias** (`vigilancia.ts`, 07:00 UTC): checkout
sem carros ou endereço inválido vão para o sininho; o email só sai onde há
`RESEND_API_KEY` (produção).

**Avisos à operação só por variável**: `EASYTRANSFER_ORDER_WEBHOOK_URL`,
`EASYTRANSFER_LEAD_WEBHOOK_URL`, `EASYTRANSFER_PEDIDO_WEBHOOK_URL` e
`EASYTRANSFER_ORDER_CASH_WEBHOOK_URL` (dinheiro dos transfers, n8n). Só
produção as tem; sem elas não se envia, e o log diz "Não enviado". Nunca as
definir em development ou staging — os receptores não pedem autenticação.

**Stripe em development e staging**: uma sandbox para cada — "Development" e
"Staging" — cada uma com um único webhook, para o Convex do seu ambiente.
Cartão de teste `4242 4242 4242 4242`. As contas Stripe novas recusam
`payment_method_types`; `stripe.ts` repete sem eles. A `pk_test` não é usada:
o checkout é a página alojada do Stripe.

## Regras que vieram de erros reais

**Preços.** O cálculo vive em [packages/convex/convex/lib/pricing.ts](packages/convex/convex/lib/pricing.ts)
e é o servidor que o corre. Não recalcular preços no browser — esteve assim e
deu viagens nocturnas cobradas sem a taxa.

O preço mostrado **já inclui IVA**. Os 6% são extraídos de dentro do valor para
a linha da factura, nunca somados por cima. A taxa noturna (20%, mínimo 9 €) e
a sobretaxa de aeroporto (12%) cobram-se **uma vez por viagem**, não por perna
— por isso metade de uma ida e volta não é o preço de uma ida.

**Formulários de pedido.** São sete, e cada um tem de: gravar, entrar no funil
(`enfileirarLead`, que desde os funis mete a lead no quadro e já não vai para o
Pipedrive), avisar por email (`avisarPedido`) e medir a conversão
(`medirPedidoDeOrcamento`) — esta última **só depois** de a mutation resolver,
nunca ao carregar em enviar.

**Funis substituem o Pipedrive.** Três funis (`lib/funis.ts`), cada um com
quadro e lista no dashboard e os mesmos filtros nas duas vistas:
Operação → Reservas (`reservas`: reservas pagas no site e nos sites dos
parceiros, despacho), Operação → Orçamentos (`medida`: os pedidos de
orçamento — casamentos, ultra-luxo, corporate, escolas) e Parcerias
(`parcerias`: leads da página Hotéis e todas as candidaturas). Os segmentos
são filtros, não funis. Não se criam funis: configuram-se as etapas. Cada
registo cai sozinho na 1.ª etapa aberta do seu funil (`lib/funilEntrada.ts`),
na mesma transação em que é gravado; o `by_origem` trava repetições. A etapa
e o estado do registo andam juntos nos dois sentidos (`lib/funilEstado.ts`).
Num ambiente novo: `npx convex run funis:criarFunisIniciais` e
`funis:preencher '{"dias":30}'`.

**Atribuição.** Três coisas distintas, três campos distintos, nunca misturar:
`partnershipName` (parceiro, relação comercial), `adSource` (origem observada
no endereço) e `opprefId` (identificador da OpenAI, passado tal e qual). Sem
dados, diz-se "Origem desconhecida" — nunca se inventa uma origem.

**Slugs de parceria** são segmentos de endereço: só minúsculas, dígitos e
hífens. Um `&` partiu uma página e invalidou o sitemap inteiro. Mudar o
endereço no back-office guarda o antigo em `slugsAntigos`: o site reencaminha
(308) e a atribuição continua (`lib/parceriaPorSlug.ts`). Procurar parcerias
por endereço sempre por aí, nunca só pelo índice `by_slug`.

**Nada de código de teste em commits.** Antes de commitar:
`grep -rn "TESTE LOCAL\|SONDA" apps packages` tem de vir vazio.

## Verificar, não assumir

Este projecto já custou horas a diagnósticos plausíveis e errados. Quando der
para medir, medir:

- O que o browser faz → servidor de desenvolvimento e ler a consola ou a rede
- O que uma API devolve → chamá-la
- O que está gravado → `npx convex run --prod <query>`
- O que produção serve → `curl` à página

Uma correcção publicada que não foi verificada não está confirmada.

## Idioma

O código, os comentários e as mensagens de commit são em **português europeu**.
Os comentários explicam **porquê**, não o quê — de preferência o erro concreto
que a linha evita.
