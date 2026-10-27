/**
 * Görsel prompt birleştirme.
 *
 * Sıra (prompts.json):
 * 1. side_characters anahtarları ({local_woman}, {clerk}, …) tarifleriyle değişir.
 * 2. {genero_desc} (m → "a man", f → "a woman"), {aparencia} ve {kiyafet} değişir. {kiyafet} → outfit.
 * 3. style_block sona eklenir.
 * Birleşen metinde {yer_tutucu} kalırsa çağıran 500 döner; sessizce silinmez.
 */

export interface ScenePrompt {
  chapter_id: string;
  page: number;
  kind: string;
  prompt: string;
}

export interface PromptsFile {
  version: string;
  model: string;
  fallback_models: string[];
  style_block: string;
  outfit: string;
  side_characters: Record<string, string>;
  placeholders: Record<string, string>;
  scenes: Record<string, ScenePrompt>;
}

export class UnknownPlaceholderError extends Error {
  readonly placeholders: readonly string[];

  constructor(placeholders: readonly string[]) {
    super(`Unresolved prompt placeholder: ${placeholders.join(", ")}`);
    this.name = "UnknownPlaceholderError";
    this.placeholders = placeholders;
  }
}

function placeholderPattern(): RegExp {
  return /\{([A-Za-z0-9_]+)\}/g;
}

export function assertPromptsFile(value: unknown): PromptsFile {
  if (typeof value !== "object" || value === null) {
    throw new Error("prompts_invalid");
  }
  const record = value as Partial<PromptsFile>;
  if (
    typeof record.model !== "string" ||
    record.model.length === 0 ||
    typeof record.style_block !== "string" ||
    typeof record.outfit !== "string" ||
    typeof record.side_characters !== "object" ||
    record.side_characters === null ||
    typeof record.scenes !== "object" ||
    record.scenes === null
  ) {
    throw new Error("prompts_invalid");
  }
  return record as PromptsFile;
}

export function buildImagePrompt(
  config: PromptsFile,
  scenePrompt: string,
  aparencia: string,
  genero: "m" | "f",
): string {
  const withCharacters = scenePrompt.replace(placeholderPattern(), (raw, name: string) => {
    if (Object.prototype.hasOwnProperty.call(config.side_characters, name)) {
      const description = config.side_characters[name];
      if (typeof description !== "string") {
        return raw;
      }
      return description;
    }
    return raw;
  });

  // Fonksiyon döndürmek, aparencia/outfit içindeki $& gibi dizilerin replace kalıbı sayılmasını engeller.
  const appearance = aparencia.trim();
  const generoDesc = genero === "m" ? "a man" : "a woman";
  const withAppearance = withCharacters
    .replaceAll("{genero_desc}", () => generoDesc)
    .replaceAll("{aparencia}", () => appearance)
    .replaceAll("{kiyafet}", () => config.outfit);

  const combined = `${withAppearance.trim()} ${config.style_block.trim()}`.trim();
  const unresolved = new Set<string>();
  for (const match of combined.matchAll(placeholderPattern())) {
    unresolved.add(match[0]);
  }
  if (unresolved.size > 0) {
    throw new UnknownPlaceholderError([...unresolved].sort());
  }
  return combined;
}
