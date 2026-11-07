/**
 * Cliente mínimo do Bunny Storage.
 *
 * Só `fetch`, sem dependências de Node: assim serve tanto as actions normais
 * (a automação do blog) como as de Node (a publicação de uploads, que precisa
 * dos 512 MB do runtime de Node para vídeos).
 *
 * Cada deployment Convex tem a sua storage zone — development, staging e
 * production não partilham ficheiros, tal como não partilham base de dados.
 * Um upload de teste em staging nunca aparece no site a sério.
 */

function config() {
  const zona = process.env.BUNNY_STORAGE_ZONE;
  const password = process.env.BUNNY_STORAGE_PASSWORD;
  const host = process.env.BUNNY_STORAGE_HOST ?? "storage.bunnycdn.com";
  if (!zona || !password) {
    throw new Error(
      "Bunny por configurar neste deployment: faltam BUNNY_STORAGE_ZONE e/ou BUNNY_STORAGE_PASSWORD.",
    );
  }
  return { zona, password, host };
}

/** Codifica cada segmento, mas mantém as barras: `uploads/a b.webp` → `uploads/a%20b.webp`. */
function codificar(caminho: string): string {
  return caminho.split("/").map(encodeURIComponent).join("/");
}

/**
 * URL público de um ficheiro na CDN deste deployment.
 *
 * Devolve `null` em vez de rebentar quando a CDN não está configurada: uma
 * query que lista vinte tours não pode falhar inteira por causa de uma imagem.
 */
export function urlCdn(caminho: string): string | null {
  const base = process.env.BUNNY_CDN_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${codificar(caminho)}`;
}

/**
 * Tipos aceites, e a extensão com que ficam gravados.
 *
 * É uma lista fechada de propósito: a CDN serve o que lá estiver, e um `.html`
 * ou `.js` carregado pelo admin ficava a ser servido como página a partir de um
 * domínio nosso.
 */
export const EXTENSAO_POR_TIPO: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export async function enviarParaBunny(caminho: string, conteudo: Blob): Promise<void> {
  const { zona, password, host } = config();
  const url = `https://${host}/${zona}/${codificar(caminho)}`;
  let ultimoErro = "";
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(url, {
      method: "PUT",
      headers: { AccessKey: password, "Content-Type": "application/octet-stream" },
      body: conteudo,
    });
    if (r.status === 201) return;
    ultimoErro = `${r.status} ${await r.text().catch(() => "")}`.slice(0, 200);
  }
  throw new Error(`Bunny recusou o envio de ${caminho}: ${ultimoErro}`);
}

/**
 * Grava um ficheiro novo com nome aleatório e devolve o caminho a guardar no
 * registo. Recusa tipos fora da lista em vez de os gravar com outra extensão.
 */
export async function publicarNoBunny(conteudo: Blob): Promise<string> {
  const tipo = ((conteudo.type || "").split(";")[0] ?? "").trim().toLowerCase();
  const extensao = EXTENSAO_POR_TIPO[tipo];
  if (!extensao) throw new Error(`Tipo de ficheiro não aceite: ${tipo || "desconhecido"}.`);
  const agora = new Date();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, "0");
  const caminho = `uploads/${agora.getUTCFullYear()}/${mes}/${crypto.randomUUID()}.${extensao}`;
  await enviarParaBunny(caminho, conteudo);
  return caminho;
}

/**
 * Apaga um ficheiro. Um 404 conta como sucesso: o objectivo é o ficheiro não
 * existir, e uma segunda tentativa depois de um timeout não pode ser um erro.
 */
export async function apagarDoBunny(caminho: string): Promise<void> {
  const { zona, password, host } = config();
  const url = `https://${host}/${zona}/${codificar(caminho)}`;
  const r = await fetch(url, { method: "DELETE", headers: { AccessKey: password } });
  if (r.status === 200 || r.status === 404) return;
  throw new Error(`Bunny recusou apagar ${caminho}: ${r.status}`);
}
