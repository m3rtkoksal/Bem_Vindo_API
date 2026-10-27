import assert from "node:assert/strict";
import { test } from "node:test";

import { KvUsageCounter, type KvLike } from "../src/usage.ts";

class MapKv implements KvLike {
  readonly store = new Map<string, string>();
  get(key: string) { return Promise.resolve(this.store.get(key) ?? null); }
  put(key: string, value: string) { this.store.set(key, value); return Promise.resolve(); }
}

test("image limit returns not allowed after limit, per device and kind", async () => {
  const kv = new MapKv();
  const day = new Date("2026-10-27T10:00:00Z");
  const c = new KvUsageCounter(kv, { image: 2, scene: 3 }, () => day);
  assert.equal((await c.tryConsume("dev1", "image")).allowed, true);
  assert.equal((await c.tryConsume("dev1", "image")).allowed, true);
  const third = await c.tryConsume("dev1", "image");
  assert.deepEqual(third, { allowed: false, limit: 2 });
  assert.equal((await c.tryConsume("dev2", "image")).allowed, true);
  assert.equal((await c.tryConsume("dev1", "scene")).allowed, true);
  for (const key of kv.store.keys()) assert.match(key, /^dev\d:(image|scene):2026-10-27$/);
});

test("counter resets on new UTC day", async () => {
  const kv = new MapKv();
  let now = new Date("2026-10-27T23:59:00Z");
  const c = new KvUsageCounter(kv, { image: 1, scene: 1 }, () => now);
  assert.equal((await c.tryConsume("d", "image")).allowed, true);
  assert.equal((await c.tryConsume("d", "image")).allowed, false);
  now = new Date("2026-10-28T00:01:00Z");
  assert.equal((await c.tryConsume("d", "image")).allowed, true);
});
