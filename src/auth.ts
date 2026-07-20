// Dashboard PIN auth: hashing, session tokens, brute-force lockout.
// Uses Web Crypto (crypto.subtle) — available natively in Workers, no
// extra dependency needed.

const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Constant-time comparison. A 6-digit PIN only has a million possibilities,
// so leaking match progress through timing is a real risk, not a theoretical
// one — this avoids the naive `===` short-circuit.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function generateSalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return toHex(salt);
}

export function generateSessionSecret(): string {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return toHex(secret);
}

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256
  );
  return toHex(derived);
}

export async function verifyPin(pin: string, saltHex: string, expectedHash: string): Promise<boolean> {
  const actualHash = await hashPin(pin, saltHex);
  return timingSafeEqual(actualHash, expectedHash);
}

async function hmac(secretHex: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", fromHex(secretHex), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(sig);
}

// Session token: "<expiresAtMs>.<hmac-of-expiresAtMs>" — no server-side
// session store needed, just a signed expiry stamped into the cookie.
export async function createSessionToken(sessionSecret: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = await hmac(sessionSecret, String(expiresAt));
  return `${expiresAt}.${signature}`;
}

export async function verifySessionToken(token: string | undefined, sessionSecret: string): Promise<boolean> {
  if (!token) return false;
  const [expiresAtStr, signature] = token.split(".");
  if (!expiresAtStr || !signature) return false;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = await hmac(sessionSecret, expiresAtStr);
  return timingSafeEqual(signature, expected);
}

export function isLockedOut(lockedUntil: string | null | undefined): boolean {
  if (!lockedUntil) return false;
  return Date.now() < new Date(lockedUntil).getTime();
}
