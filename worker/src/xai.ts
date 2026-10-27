/**
 * xAI image edit.
 *
 * Doğrulanan istek (27 Eki 2026):
 * - POST https://api.x.ai/v1/images/edits  (metin-only kardeş: /v1/images/generations)
 * - Content-Type: application/json (multipart değil)
 * - Authorization: Bearer <XAI_API_KEY>
 * - model: prompts.json → grok-imagine-image
 * - referans fotoğraf: image: { url: <data URI>, type: "image_url" }
 * - aspect_ratio "4:5" (dikey sahne kartı); response_format "b64_json"
 *   → data[].b64_json, data-URI öneki yok
 * Gözlem: yaklaşık $0.022/görsel, yaklaşık 9 sn.
 * Kaynak: https://docs.x.ai/docs/guides/image-generations
 *         https://docs.x.ai/developers/rest-api-reference/inference/images
 *
 * TODO: prompting guide `quality` gönderiyor; aynı gün okunan REST istek
 * gövdesinde bu alan yok. Gönderilmiyor.
 * TODO: REST `resolution` olarak "1k" | "2k" | "1.5k" sayıyor. Varsayılan
 * bırakıldı; hangi değerin seçileceği belli değil.
 * TODO: prompts.json fallback_models bu iskelette kullanılmıyor.
 * TODO: b64_json gelmezse url indirilmez ve loglanmaz (geçici URL).
 */

export interface XaiImageEditBody {
  model: string;
  prompt: string;
  image: {
    url: string;
    type: "image_url";
  };
  aspect_ratio: "4:5";
  response_format: "b64_json";
  n: 1;
  user: string;
}

export function buildImageEditBody(input: {
  model: string;
  prompt: string;
  imageDataUri: string;
  userHash: string;
}): XaiImageEditBody {
  return {
    model: input.model,
    prompt: input.prompt,
    image: {
      url: input.imageDataUri,
      type: "image_url",
    },
    aspect_ratio: "4:5",
    response_format: "b64_json",
    n: 1,
    user: input.userHash,
  };
}

export interface XaiEditResult {
  imageBase64: string;
  mimeType: string | null;
}

export class XaiEditError extends Error {
  readonly reason: "http" | "b64_missing" | "invalid_response";
  readonly status: number;

  constructor(reason: "http" | "b64_missing" | "invalid_response", status: number) {
    super("xai_image_edit_failed");
    this.name = "XaiEditError";
    this.reason = reason;
    this.status = status;
  }
}

interface XaiImageObject {
  b64_json?: string | null;
  mime_type?: string | null;
  url?: string | null;
}

interface XaiEditResponse {
  data?: XaiImageObject[];
}

const XAI_EDITS_URL = "https://api.x.ai/v1/images/edits";
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export async function editImage(input: {
  apiKey: string;
  model: string;
  prompt: string;
  imageDataUri: string;
  userHash: string;
}): Promise<XaiEditResult> {
  const response = await fetch(XAI_EDITS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(
      buildImageEditBody({
        model: input.model,
        prompt: input.prompt,
        imageDataUri: input.imageDataUri,
        userHash: input.userHash,
      }),
    ),
  });

  if (!response.ok) {
    // Gövde fotoğrafı veya prompt'u yankılayabilir. Okunup atılır, loglanmaz.
    await response.arrayBuffer();
    throw new XaiEditError("http", response.status);
  }

  let payload: XaiEditResponse;
  try {
    payload = (await response.json()) as XaiEditResponse;
  } catch {
    throw new XaiEditError("invalid_response", response.status);
  }

  const first = payload.data?.[0];
  const raw = typeof first?.b64_json === "string" ? first.b64_json.trim() : "";
  if (raw.length === 0) {
    throw new XaiEditError("b64_missing", response.status);
  }

  const withoutPrefix = raw.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  const compact = withoutPrefix.replace(/\s+/g, "");
  if (!B64.test(compact)) {
    throw new XaiEditError("invalid_response", response.status);
  }

  const mimeType = typeof first?.mime_type === "string" ? first.mime_type : null;
  return { imageBase64: compact, mimeType };
}
