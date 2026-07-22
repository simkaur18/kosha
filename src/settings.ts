import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { settings } from "./db/schema";
import { generateSessionSecret } from "./auth";

// Single-tenant app — there's always exactly one settings row (id = 1).
// Created lazily on first touch so a fresh deploy doesn't need a seed row.
export async function getOrCreateSettings(db: DrizzleD1Database) {
  const [existing] = await db.select().from(settings).where(eq(settings.id, 1));
  if (existing) {
    // Backfills a session secret for a row created before this column
    // existed — without this, login would break for anyone who already had
    // a settings row before the dashboard-auth migration ran.
    if (!existing.sessionSecret) {
      const sessionSecret = generateSessionSecret();
      await db.update(settings).set({ sessionSecret }).where(eq(settings.id, 1));
      return { ...existing, sessionSecret };
    }
    return existing;
  }

  const created = {
    id: 1,
    pinHash: null as string | null,
    pinSalt: null as string | null,
    sessionSecret: generateSessionSecret(),
    failedAttempts: 0,
    lockedUntil: null as string | null,
    notificationCadence: "daily",
    language: "en",
    toolkitVersion: null as string | null,
    chatId: null as string | null,
    pendingRefundCreditId: null as string | null,
    pendingRefundDebitId: null as string | null,
  };
  await db.insert(settings).values(created);
  return created;
}
