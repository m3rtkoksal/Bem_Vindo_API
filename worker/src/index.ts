import rawPrompts from "../prompts.json" with { type: "json" };

import { authorizeDevice } from "./auth.ts";
import {
  UnknownPlaceholderError,
  assertPromptsFile,
  buildImagePrompt,
} from "./prompt.ts";
import {
  DEFAULT_IMAGE_DAILY_LIMIT,
  DEFAULT_SCENE_DAILY_LIMIT,
  KvUsageCounter,
  parseDailyLimit,
} from "./usage.ts";
import { XaiEditError, editImage } from "./xai.ts";

const prompts = assertPromptsFile(rawPrompts);

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_PHOTO_CHARS = 6_000_000;
const MAX_APARENCIA_CHARS = 300;
const DATA_URI = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const RAW_B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const ID = /^[a-zA-Z0-9_-]{1,64}$/;

interface ImageRequest {
  chapterId: string;
  imageKey: string;
  dataUri: string;
  aparencia: string;
  genero: "m" | "f";
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function logEvent(fields: Record<string, string | number>): void {
  console.log(JSON.stringify(fields));
}

function logError(fields: Record<string, string | number>): void {
  console.error(JSON.stringify(fields));
}

async function readBody(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    throw new HttpError(413, "payload_too_large");
  }
  if (request.body === null) {
    throw new HttpError(400, "empty_body");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "payload_too_large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_body");
  }
  return value;
}

/**
 * Ham base64, bölüm şemasındaki gibi JPEG sayılır.
 * TODO: xAI'nin güncel bayt tavanı bu turda REST şemasında yeniden doğrulanmadı.
 * MAX_PHOTO_CHARS Worker bellek sınırı içindir, xAI limiti olarak iddia edilmez.
 */
function toDataUri(photoBase64: string): string {
  const compact = photoBase64.trim().replace(/\s+/g, "");
  if (compact.length === 0 || compact.length > MAX_PHOTO_CHARS) {
    throw new HttpError(400, "invalid_photo");
  }
  const dataUri = DATA_URI.exec(compact);
  if (dataUri !== null) {
    return compact;
  }
  if (compact.startsWith("data:")) {
    throw new HttpError(400, "unsupported_image");
  }
  if (!RAW_B64.test(compact)) {
    throw new HttpError(400, "invalid_photo");
  }
  return `data:image/jpeg;base64,${compact}`;
}

function parseImageRequest(value: unknown): ImageRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "invalid_body");
  }
  const body = value as Record<string, unknown>;
  const chapterId = requireString(body, "chapter_id");
  const imageKey = requireString(body, "image_key");
  const aparencia = requireString(body, "aparencia");
  const genero = requireString(body, "genero");
  const photo = requireString(body, "photo_base64");

  if (!ID.test(chapterId) || !ID.test(imageKey)) {
    throw new HttpError(400, "invalid_body");
  }
  if (aparencia.length > MAX_APARENCIA_CHARS) {
    throw new HttpError(400, "invalid_body");
  }
  if (genero !== "m" && genero !== "f") {
    throw new HttpError(400, "invalid_body");
  }

  return {
    chapterId,
    imageKey,
    aparencia,
    genero,
    dataUri: toDataUri(photo),
  };
}

async function handleImage(
  request: Request,
  env: Env,
  requestId: string,
  tokenHash: string,
): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "unsupported_media_type");
  }

  const imageRequest = parseImageRequest(await readBody(request));
  if (!Object.prototype.hasOwnProperty.call(prompts.scenes, imageRequest.imageKey)) {
    throw new HttpError(404, "unknown_image_key");
  }
  const scene = prompts.scenes[imageRequest.imageKey];
  if (
    scene === undefined ||
    typeof scene.prompt !== "string" ||
    scene.chapter_id !== imageRequest.chapterId
  ) {
    throw new HttpError(400, "chapter_mismatch");
  }

  let prompt: string;
  try {
    prompt = buildImagePrompt(prompts, scene.prompt, imageRequest.aparencia, imageRequest.genero);
  } catch (error) {
    if (error instanceof UnknownPlaceholderError) {
      logError({
        message: "unknown_placeholder",
        request_id: requestId,
        image_key: imageRequest.imageKey,
        placeholders: error.placeholders.join(","),
      });
      return json(
        { error: "unknown_placeholder", placeholders: error.placeholders },
        500,
      );
    }
    throw error;
  }

  const usage = new KvUsageCounter(env.USAGE, {
    image: parseDailyLimit(env.IMAGE_DAILY_LIMIT, DEFAULT_IMAGE_DAILY_LIMIT),
    scene: parseDailyLimit(env.SCENE_DAILY_LIMIT, DEFAULT_SCENE_DAILY_LIMIT),
  });
  const decision = await usage.tryConsume(tokenHash, "image");
  if (!decision.allowed) {
    return json({ error: "daily_limit", kind: "image", limit: decision.limit }, 429);
  }

  if (env.XAI_API_KEY.trim().length === 0) {
    logError({ message: "xai_not_configured", request_id: requestId });
    return json({ error: "not_configured" }, 500);
  }

  try {
    const edited = await editImage({
      apiKey: env.XAI_API_KEY,
      model: prompts.model,
      prompt,
      imageDataUri: imageRequest.dataUri,
      userHash: tokenHash,
    });
    logEvent({
      message: "image_ok",
      request_id: requestId,
      image_key: imageRequest.imageKey,
    });
    return json(
      {
        image_base64: edited.imageBase64,
        mime_type: edited.mimeType,
        prompts_version: prompts.version,
      },
      200,
    );
  } catch (error) {
    if (error instanceof XaiEditError) {
      logError({
        message: "xai_image_edit_failed",
        request_id: requestId,
        image_key: imageRequest.imageKey,
        reason: error.reason,
        status: error.status,
      });
      return json({ error: "upstream_failed" }, 502);
    }
    throw error;
  }
}

async function handleScene(
  env: Env,
  requestId: string,
  tokenHash: string,
): Promise<Response> {
  const usage = new KvUsageCounter(env.USAGE, {
    image: parseDailyLimit(env.IMAGE_DAILY_LIMIT, DEFAULT_IMAGE_DAILY_LIMIT),
    scene: parseDailyLimit(env.SCENE_DAILY_LIMIT, DEFAULT_SCENE_DAILY_LIMIT),
  });
  const decision = await usage.tryConsume(tokenHash, "scene");
  if (!decision.allowed) {
    return json({ error: "daily_limit", kind: "scene", limit: decision.limit }, 429);
  }
  logEvent({ message: "scene_not_implemented", request_id: requestId });
  return json({ error: "not_implemented" }, 501);
}

export default {
  async fetch(request, env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    try {
      if (request.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405);
      }

      const device = await authorizeDevice(request, env.DEVICE_TOKENS);
      if (device === null) {
        logEvent({ message: "unauthorized", request_id: requestId, path: url.pathname });
        return json({ error: "unauthorized" }, 401);
      }

      if (url.pathname === "/v1/image") {
        return await handleImage(request, env, requestId, device.tokenHash);
      }
      if (url.pathname === "/v1/scene") {
        return await handleScene(env, requestId, device.tokenHash);
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof HttpError) {
        logEvent({
          message: "request_rejected",
          request_id: requestId,
          path: url.pathname,
          status: error.status,
          code: error.code,
        });
        return json({ error: error.code }, error.status);
      }
      logError({ message: "unhandled", request_id: requestId, name: error instanceof Error ? error.name : "Error" });
      return json({ error: "internal" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
