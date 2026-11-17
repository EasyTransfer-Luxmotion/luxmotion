/**
 * Cliente mínimo da OpenAI por `fetch`.
 *
 * Sem o SDK `openai`, pela mesma razão que o `stripe.ts` chama a REST API à mão:
 * o repositório não usa `"use node"` em lado nenhum e todas as actions correm no
 * isolate V8 do Convex, onde `fetch`, `atob`, `Uint8Array` e `Blob` existem mas
 * os builtins do Node não.
 */

const API = "https://api.openai.com/v1";

/** Uma chamada longa não pode pendurar a action até ao limite de execução. */
const TIMEOUT_MS = 240_000;

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY not configured. Set it in the Convex Dashboard or with `npx convex env set OPENAI_API_KEY ...`",
    );
  }
  return key;
}

/**
 * Modelos sobreponíveis por env var, para trocar sem deploy quando a OpenAI
 * publicar uma versão nova. Confirmar os identificadores contra o catálogo da
 * conta antes de ligar a automação: um id errado devolve 404 com a mensagem da
 * própria OpenAI, que é propagada.
 */
export function textModel(): string {
  return process.env.OPENAI_TEXT_MODEL ?? "gpt-5";
}
export function imageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-sunburst";
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // A chave nunca entra no erro; o corpo da OpenAI não a inclui.
    throw new Error(`OpenAI ${path} failed: ${res.status} ${detail.slice(0, 500)}`);
  }
  return res.json();
}

/** Igual ao `post`, mas multipart: o `/images/edits` só aceita form-data. */
async function postForm(path: string, form: FormData): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    // Sem Content-Type à mão: o boundary é gerado pelo runtime.
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI ${path} failed: ${res.status} ${detail.slice(0, 500)}`);
  }
  return res.json();
}

export type TextResult = {
  text: string;
  /** "length" significa resposta truncada: o conteúdo não é de confiança. */
  finishReason: string | null;
  usage?: { input?: number; output?: number };
};

export async function generateText(params: {
  system: string;
  user: string;
  maxOutputTokens?: number;
  /* Resposta só em JSON (as mensagens têm de dizer "JSON"). */
  json?: boolean;
}): Promise<TextResult> {
  const json = await post("/chat/completions", {
    model: textModel(),
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    max_completion_tokens: params.maxOutputTokens ?? 16000,
    ...(params.json ? { response_format: { type: "json_object" } } : {}),
  });

  const choice = json?.choices?.[0];
  return {
    text: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason ?? null,
    usage: {
      input: json?.usage?.prompt_tokens,
      output: json?.usage?.completion_tokens,
    },
  };
}

/**
 * Aspecto das duas imagens do artigo.
 *
 * Mantemos 1536x1024 (3:2) para as duas imagens: a hero é cortada para banner pelo
 * `object-cover` do site e o briefing pede folga em cima e em baixo, a
 * editorial aparece no corpo do artigo já na proporção nativa.
 */
export const IMAGE_SIZE_LANDSCAPE = "1536x1024";

/**
 * O logo oficial, buscado uma vez por isolate e reutilizado.
 *
 * Vai como imagem de referência para o `/images/edits`, que é o único endpoint
 * de imagem da OpenAI que aceita anexos. Sem isto o modelo inventa um monograma
 * LM parecido mas errado, que é exactamente o que a direcção de arte proíbe.
 */
const DEFAULT_LOGO_PATH = "/shared/logos/luxmotion-logo-square.jpg";
let logoCache: { url: string; blob: Blob } | null = null;

export function logoUrl(siteUrl: string): string {
  return process.env.LUXMOTION_LOGO_URL ?? `${siteUrl}${DEFAULT_LOGO_PATH}`;
}

export async function fetchLogoReference(siteUrl: string): Promise<Blob> {
  const url = logoUrl(siteUrl);
  if (logoCache?.url === url) return logoCache.blob;

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`logo reference fetch failed: ${res.status} ${url}`);
  }
  const type = res.headers.get("content-type") ?? "";
  if (!/^image\/(png|jpeg|webp)$/.test(type)) {
    // A API rejeita qualquer outra coisa (SVG incluído) com um 400 críptico.
    throw new Error(`logo reference is not a png/jpeg/webp image: ${type} ${url}`);
  }
  const blob = new Blob([await res.arrayBuffer()], { type });
  logoCache = { url, blob };
  return blob;
}

function decodeB64(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function firstImage(json: any): Blob {
  const b64 = json?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || b64.length === 0) {
    throw new Error("OpenAI image response had no b64_json payload");
  }
  return decodeB64(b64, "image/jpeg");
}

/**
 * Gera uma imagem e devolve-a como Blob pronto para o storage.
 *
 * Os modelos GPT Image devolvem sempre base64 (`b64_json`); o `response_format:
 * "url"` é do DALL·E 3 e não se aplica aqui. O formato pedido é JPEG porque é o
 * que o pipeline de publicação assume, e a extensão do ficheiro tem de
 * corresponder aos bytes que a API devolveu.
 *
 * Com `reference` a chamada passa a ser multipart para `/images/edits`, a única
 * forma de o modelo ver o logo oficial em vez de o imaginar.
 */
export async function generateImage(params: {
  prompt: string;
  reference?: Blob;
  size?: string;
}): Promise<Blob> {
  const size = params.size ?? IMAGE_SIZE_LANDSCAPE;
  const model = imageModel();

  if (!params.reference) {
    const json = await post("/images/generations", {
      model,
      prompt: params.prompt,
      n: 1,
      size,
      quality: "high",
      output_format: "jpeg",
    });
    return firstImage(json);
  }

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", params.prompt);
  form.append("n", "1");
  form.append("size", size);
  form.append("quality", "high");
  form.append("output_format", "jpeg");
  // Só os modelos 1 e 1.5 aceitam este parâmetro. O GPT Image 2.5 usa
  // referências sem ele; mantemos compatibilidade com um override antigo.
  if (/^gpt-image-1(?:\.5)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) {
    form.append("input_fidelity", "high");
  }
  // O nome do anexo segue os bytes: a API valida o formato, não a extensão.
  const ext = params.reference.type === "image/webp" ? "webp"
    : params.reference.type === "image/png" ? "png"
    : "jpg";
  form.append("image[]", params.reference, `luxmotion-logo.${ext}`);

  return firstImage(await postForm("/images/edits", form));
}
