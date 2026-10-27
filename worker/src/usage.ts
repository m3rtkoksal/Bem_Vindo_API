/**
 * Cihaz başına günlük kota.
 * Görsel: 120, sahne: 300 (UTC günü). Sayılar wrangler vars ile gelir.
 *
 * Sayaç Workers KV (USAGE) içinde; anahtar `hash:kind:YYYY-MM-DD` (UTC).
 * Ham cihaz token'ı yazılmaz ve loglanmaz. Aşımda Worker 429 döner.
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

/** Kalıcı sayaç için gereken KV alt kümesi (testte Map ile taklit edilir). */
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Workers KV sayacı. Anahtar `hash:kind:YYYY-MM-DD` (UTC); ham token yazılmaz.
 * KV atomik değildir; 2 kullanıcı için küçük yarış payı kabul edilir.
 */
export class KvUsageCounter implements UsageCounter {
  private readonly kv: KvLike;
  private readonly limits: { image: number; scene: number };
  private readonly now: () => Date;

  constructor(
    kv: KvLike,
    limits: { image: number; scene: number },
    now: () => Date = () => new Date(),
  ) {
    this.kv = kv;
    this.limits = limits;
    this.now = now;
  }

  async tryConsume(deviceKey: string, kind: UsageKind): Promise<UsageDecision> {
    const limit = this.limits[kind];
    const key = `${deviceKey}:${kind}:${utcDay(this.now())}`;
    const current = Number((await this.kv.get(key)) ?? "0") || 0;
    if (current >= limit) {
      return { allowed: false, limit };
    }
    await this.kv.put(key, String(current + 1), { expirationTtl: 60 * 60 * 48 });
    return { allowed: true, limit };
  }
}
