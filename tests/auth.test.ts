import { describe, it, expect } from "vitest";
import {
  generateSalt,
  generateSessionSecret,
  hashPin,
  verifyPin,
  createSessionToken,
  verifySessionToken,
  isLockedOut,
} from "../src/auth";

describe("PIN hashing", () => {
  it("verifies the correct PIN against its own hash", async () => {
    const salt = generateSalt();
    const hash = await hashPin("123456", salt);
    expect(await verifyPin("123456", salt, hash)).toBe(true);
  });

  it("rejects a wrong PIN", async () => {
    const salt = generateSalt();
    const hash = await hashPin("123456", salt);
    expect(await verifyPin("654321", salt, hash)).toBe(false);
  });

  it("produces different hashes for the same PIN with different salts", async () => {
    const hashA = await hashPin("123456", generateSalt());
    const hashB = await hashPin("123456", generateSalt());
    expect(hashA === hashB).toBe(false);
  });
});

describe("session tokens", () => {
  it("verifies a token signed with the matching secret", async () => {
    const secret = generateSessionSecret();
    const token = await createSessionToken(secret);
    expect(await verifySessionToken(token, secret)).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken(generateSessionSecret());
    expect(await verifySessionToken(token, generateSessionSecret())).toBe(false);
  });

  it("rejects a tampered token", async () => {
    const secret = generateSessionSecret();
    const token = await createSessionToken(secret);
    const [expiresAt] = token.split(".");
    const tampered = `${expiresAt}.deadbeef`;
    expect(await verifySessionToken(tampered, secret)).toBe(false);
  });

  it("rejects a missing token", async () => {
    expect(await verifySessionToken(undefined, generateSessionSecret())).toBe(false);
  });

  it("rejects an already-expired token", async () => {
    const secret = generateSessionSecret();
    // Hand-craft an already-expired token rather than waiting 30 days.
    const key = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(secret.match(/.{2}/g)!.map((b) => parseInt(b, 16))),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const expiredAt = String(Date.now() - 1000);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expiredAt));
    const sigHex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(await verifySessionToken(`${expiredAt}.${sigHex}`, secret)).toBe(false);
  });
});

describe("lockout", () => {
  it("is not locked when lockedUntil is null", () => {
    expect(isLockedOut(null)).toBe(false);
  });

  it("is locked when lockedUntil is in the future", () => {
    expect(isLockedOut(new Date(Date.now() + 60_000).toISOString())).toBe(true);
  });

  it("is not locked when lockedUntil is in the past", () => {
    expect(isLockedOut(new Date(Date.now() - 60_000).toISOString())).toBe(false);
  });
});
