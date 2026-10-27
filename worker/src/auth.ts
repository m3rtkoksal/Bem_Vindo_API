/**
 * DEVICE_TOKENS: virgülle ayrılmış cihaz token listesi (Worker secret).
 * Karşılaştırma sabit sürelidir; token loglanmaz.
 */

const encoder = new TextEncoder();

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(value));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await sha256(value));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashesEqual(left: ArrayBuffer, right: ArrayBuffer): Promise<boolean> {
  return crypto.subtle.timingSafeEqual(left, right);
}

export async function authorizeDevice(
  request: Request,
  deviceTokens: string,
): Promise<{ tokenHash: string } | null> {
  const header = request.headers.get("Authorization");
  if (header === null) {
    return null;
  }
  const match = /^Bearer\s+(\S+)\s*$/.exec(header);
  if (match === null) {
    return null;
  }
  const presented = match[1];
  const allowed = deviceTokens
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (allowed.length === 0 || presented === undefined || presented.length === 0) {
    return null;
  }

  const presentedHash = await sha256(presented);
  let accepted = false;
  for (const token of allowed) {
    const expectedHash = await sha256(token);
    const same = await hashesEqual(presentedHash, expectedHash);
    if (same) {
      accepted = true;
    }
  }
  if (!accepted) {
    return null;
  }
  return { tokenHash: await sha256Hex(presented) };
}
