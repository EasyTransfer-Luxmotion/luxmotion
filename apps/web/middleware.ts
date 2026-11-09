import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/* O admin saiu do site: vive no dashboard, num repositório e num serviço
   próprios. Um /admin antigo (favoritos, links em emails velhos) segue para lá,
   para o mesmo ecrã: /admin/orders -> <dashboard>/orders. */
const ADMIN = /^\/admin(?=\/|$)/;
const DASHBOARD_URL = process.env.DASHBOARD_URL?.replace(/\/+$/, '') || null;

/* As rotas que ficaram fora do segmento de idioma: mantêm os endereços antigos
   porque são o destino de retorno dos gateways de pagamento, ou são internas.
   O middleware do next-intl não lhes toca. */
const SEM_IDIOMA = /^\/(?:checkout|payment|preview-site|partnership-preview|checkout-preview|api)(?=\/|$)/;

const intlMiddleware = createIntlMiddleware(routing);

/* Staging e development servem o mesmo conteúdo que produção, em domínios
   públicos, e saíam com "index, follow": para o Google eram cópias do site a
   concorrer com ele. Fora do Railway (máquina local) a variável não existe. */
const AMBIENTE = process.env.RAILWAY_ENVIRONMENT_NAME;
const FORA_DO_GOOGLE = Boolean(AMBIENTE && AMBIENTE !== 'production');

function marcar(res: NextResponse): NextResponse {
  if (FORA_DO_GOOGLE) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

/**
 * Ficheiros servidos de public/, que não são páginas e não levam idioma.
 *
 * O `matcher` lá em baixo já exclui as extensões mais comuns, mas não todas: os
 * .mp4 passavam por aqui e eram reencaminhados para /en/video/..., que não
 * existe. Resultado: os vídeos das heros deixavam de tocar e ficava só o
 * poster, que é .webp e estava na lista.
 *
 * Em vez de ir acrescentando extensões a uma expressão regular que já é difícil
 * de ler, a regra fica aqui, onde se percebe e se estende.
 */
const STATIC_FILE = new RegExp(
  String.raw`\.(?:mp4|webm|mov|m4v|ogv|mp3|wav|m4a|avif|webp|jpe?g|png|gif|svg|ico|bmp|tiff?|pdf|txt|xml|json|csv|zip|woff2?|ttf|otf|eot|map|webmanifest|html?|css|js)$`,
  "i",
);

export default function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (ADMIN.test(pathname)) {
    if (!DASHBOARD_URL) return new NextResponse(null, { status: 404 });
    const destino = pathname.replace(ADMIN, '') || '/';
    // O regresso depois de entrar também tinha o /admin à frente, e no
    // dashboard os ecrãs estão na raiz: /admin/orders lá não existe.
    const params = new URLSearchParams(search);
    const regresso = params.get('redirect_url');
    if (regresso && ADMIN.test(regresso)) {
      params.set('redirect_url', regresso.replace(ADMIN, '') || '/');
    }
    const query = params.toString();
    return NextResponse.redirect(`${DASHBOARD_URL}${destino}${query ? `?${query}` : ''}`, 308);
  }

  /* O /sitemap.xml e o /robots.txt entram aqui pela regra dos ficheiros: são
     servidos por rotas de metadata do Next, mas para o Google são ficheiros e
     um redirect para /en/sitemap.xml deixava-o sem sitemap. */
  if (STATIC_FILE.test(pathname) || SEM_IDIOMA.test(pathname)) {
    return marcar(NextResponse.next());
  }

  // É aqui que os endereços antigos, sem prefixo, são reencaminhados para o
  // idioma certo: /tours passa a /en/tours, ou a /pt/tours para quem já tinha
  // escolhido português.
  return marcar(intlMiddleware(req));
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
