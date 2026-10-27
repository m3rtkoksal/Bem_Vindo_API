/**
 * Cihaz başına günlük kota.
 * Görsel: 120, sahne: 300 (UTC günü). Sayılar wrangler vars ile gelir.
 *
 * TODO: Kalıcı sayaç yok. Workers KV veya Durable Object bağlanınca
 * anahtar `hash:kind:YYYY-MM-DD` (UTC) olmalı. Ham cihaz token'ı
 * yazılmamalı ve loglanmamalı. Bu yer tutucu kotayı uygulamaz.
 */

export type UsageKind = "image" | "scene";

export interface UsageDecision {
  allowed: boolean;
  limit: number;
}

export interface UsageCounter {
  tryConsume(deviceKey: string, kind: UsageKind): Promise<UsageDecision>;
}

export const DEFAULT_IMAGE_DAILY_LIMIT = 120;
export const DEFAULT_SCENE_DAILY_LIMIT = 300;

export function parseDailyLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return value;
}

export class UnenforcedUsageCounter implements UsageCounter {
  constructor(
    private readonly limits: { image: number; scene: number },
  ) {}

  tryConsume(deviceKey: string, kind: UsageKind): Promise<UsageDecision> {
    // TODO: KV / Durable Object sayacı. deviceKey saklanmaz, loglanmaz.
    void deviceKey;
    return Promise.resolve({ allowed: true, limit: this.limits[kind] });
  }
}
