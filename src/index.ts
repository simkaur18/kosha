import { Hono } from "hono";
import { webhookCallback, Bot } from "grammy";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { createBot, Env } from "./bot";
import { settings, transactions, accounts, categories } from "./db/schema";
import { getOrCreateSettings } from "./settings";
import { categorize } from "./categorize";
import { verifyPin, verifySessionToken, createSessionToken, isLockedOut, MAX_FAILED_ATTEMPTS, LOCKOUT_MS } from "./auth";
import { renderLoginPage, renderMessagePage } from "./dashboard-pages";
import { buildDashboardPayload, spentInMonth, categoryBreakdown } from "./dashboard-data";
import {
  istDateKey,
  istMonthKey,
  isFirstOfIstMonth,
  previousMonthKey,
  monthLabelFor,
  spentOnDate,
  unparsedCountOnDate,
  buildDailyNudgeText,
  buildMonthlyNudgeText,
} from "./nudges";

const app = new Hono<{ Bindings: Env }>();
const SESSION_COOKIE = "kosha_session";

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

// Shared by every dashboard-facing route (the page itself, and its data
// API) so there's exactly one place that decides "is this request logged
// in" — returns the settings row on success, null otherwise.
async function getAuthedSettings(c: { req: { header(name: string): string | undefined }; env: Env }, db: DrizzleD1Database) {
  const current = await getOrCreateSettings(db);
  if (!current.pinHash || !current.sessionSecret) return null;
  const cookie = readCookie(c.req.header("Cookie") ?? null, SESSION_COOKIE);
  const authed = await verifySessionToken(cookie, current.sessionSecret);
  return authed ? current : null;
}

app.get("/", (c) => c.text(`Kosha toolkit — running (v${c.env.TOOLKIT_VERSION ?? "dev"})`));

// PIN-gated dashboard. Anything not authenticated gets the login page
// instead of the real content — including the underlying static assets,
// since this route is the only thing allowed to call env.ASSETS.fetch.
app.get("/dashboard", async (c) => {
  const db = drizzle(c.env.DB);
  const current = await getOrCreateSettings(db);

  if (!current.pinHash || !current.pinSalt) {
    return c.html(renderMessagePage("Not set up yet", "Text your bot a 6-digit number first to set a dashboard PIN."));
  }

  const authed = await getAuthedSettings(c, db);
  if (!authed) {
    return c.html(renderLoginPage());
  }

  const assetUrl = new URL(c.req.url);
  assetUrl.pathname = "/index.html";
  return c.env.ASSETS.fetch(new Request(assetUrl, c.req.raw));
});

// JSON data feed for the dashboard's charts/tables — same auth as the page
// itself. ?month=YYYY-MM selects which month to summarize; omit for the
// most recent month with any activity.
app.get("/api/dashboard/data", async (c) => {
  const db = drizzle(c.env.DB);
  const authed = await getAuthedSettings(c, db);
  if (!authed) return c.json({ error: "unauthorized" }, 401);

  const [txns, accts] = await Promise.all([db.select().from(transactions), db.select().from(accounts)]);
  const month = c.req.query("month");
  const payload = buildDashboardPayload(txns, accts, new Date().toISOString(), month);
  return c.json(payload);
});

// Everything currently marked unparsed — the dashboard equivalent of the
// bot's /review command. Only the fields the review UI actually needs go
// out; amount/type/category are meaningless on an unparsed row.
app.get("/api/dashboard/unparsed", async (c) => {
  const db = drizzle(c.env.DB);
  const authed = await getAuthedSettings(c, db);
  if (!authed) return c.json({ error: "unauthorized" }, 401);

  const rows = await db.select().from(transactions).where(eq(transactions.status, "unparsed"));
  const entries = rows
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((t) => ({ id: t.id, date: t.date, redactedRawText: t.redactedRawText }));
  return c.json({ entries });
});

// Approves one unparsed entry with the amount/type/vendor the person just
// filled in on the dashboard — same effect as the bot's /fix command.
app.post("/api/dashboard/unparsed/:id/approve", async (c) => {
  const db = drizzle(c.env.DB);
  const authed = await getAuthedSettings(c, db);
  if (!authed) return c.json({ error: "unauthorized" }, 401);

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const amount = Number(body?.amount);
  const type = body?.type;
  const vendor = typeof body?.vendor === "string" && body.vendor.trim() ? body.vendor.trim() : null;

  if (!Number.isFinite(amount) || amount <= 0) return c.json({ error: "Enter a valid amount" }, 400);
  if (type !== "debit" && type !== "credit") return c.json({ error: "Type must be debit or credit" }, 400);

  const [existing] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.status, "unparsed")));
  if (!existing) return c.json({ error: "Not found (already handled elsewhere?)" }, 404);

  const rules = await db.select().from(categories);
  const category = categorize(vendor, rules);

  await db.update(transactions).set({ amount, type, vendor, category, status: "parsed" }).where(eq(transactions.id, id));
  return c.json({ ok: true });
});

// Drops an unparsed entry that wasn't actually a transaction — same effect
// as the bot's /discard command.
app.post("/api/dashboard/unparsed/:id/reject", async (c) => {
  const db = drizzle(c.env.DB);
  const authed = await getAuthedSettings(c, db);
  if (!authed) return c.json({ error: "unauthorized" }, 401);

  const id = c.req.param("id");
  const [existing] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.status, "unparsed")));
  if (!existing) return c.json({ error: "Not found (already handled elsewhere?)" }, 404);

  await db.delete(transactions).where(eq(transactions.id, id));
  return c.json({ ok: true });
});

app.post("/dashboard/login", async (c) => {
  const db = drizzle(c.env.DB);
  const current = await getOrCreateSettings(db);

  if (isLockedOut(current.lockedUntil)) {
    return c.html(renderLoginPage("Too many wrong attempts — try again in a few minutes."), 429);
  }

  if (!current.pinHash || !current.pinSalt) {
    return c.html(renderMessagePage("Not set up yet", "Text your bot a 6-digit number first to set a dashboard PIN."));
  }

  const body = await c.req.parseBody();
  const pin = String(body.pin ?? "");
  const ok = /^\d{6}$/.test(pin) && (await verifyPin(pin, current.pinSalt, current.pinHash));

  if (!ok) {
    const failedAttempts = (current.failedAttempts ?? 0) + 1;
    const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
    await db.update(settings).set({ failedAttempts, lockedUntil }).where(eq(settings.id, 1));
    return c.html(renderLoginPage("Wrong PIN — try again."), 401);
  }

  await db.update(settings).set({ failedAttempts: 0, lockedUntil: null }).where(eq(settings.id, 1));

  const sessionSecret = current.sessionSecret!;
  const token = await createSessionToken(sessionSecret);
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 60 * 60}`
  );
  return c.redirect("/dashboard");
});

// Telegram webhook target — set once during setup with Telegram's
// setWebhook API, pointed at https://<your-worker>.workers.dev/telegram.
app.post("/telegram", async (c) => {
  const bot = createBot(c.env);
  return webhookCallback(bot, "hono")(c);
});

// One-time setup route: registers this Worker's URL as the bot's webhook.
// Runs on Cloudflare's own infrastructure, not from a dev machine — sidesteps
// needing direct network access to Telegram's API from anywhere else.
app.post("/setup/webhook", async (c) => {
  const url = new URL(c.req.url);
  const webhookUrl = `${url.protocol}//${url.host}/telegram`;
  const res = await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const data = await res.json();
  return c.json(data);
});

// Fires once a day (see wrangler.toml's [triggers]). Sends an evening
// check-in nudge always, plus a "month closed out" summary on the 1st.
// Silently does nothing until someone has actually texted the bot at least
// once (no chat to send to yet) or if they've turned notifications off.
async function runNudges(env: Env): Promise<void> {
  const db = drizzle(env.DB);
  const current = await getOrCreateSettings(db);
  if (!current.chatId || current.notificationCadence === "off") return;

  const txns = await db.select().from(transactions);
  const bot = new Bot(env.BOT_TOKEN);
  const nowIso = new Date().toISOString();

  const todayKey = istDateKey(nowIso);
  const dailyText = buildDailyNudgeText(spentOnDate(txns, todayKey), unparsedCountOnDate(txns, todayKey));
  await bot.api.sendMessage(current.chatId, dailyText);

  if (isFirstOfIstMonth(nowIso)) {
    const lastMonth = previousMonthKey(istMonthKey(nowIso));
    const spentLastMonth = spentInMonth(txns, lastMonth);
    const [topCategory] = categoryBreakdown(txns, lastMonth);
    const monthlyText = buildMonthlyNudgeText(monthLabelFor(lastMonth), spentLastMonth, topCategory ?? null);
    if (monthlyText) await bot.api.sendMessage(current.chatId, monthlyText);
  }
}

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runNudges(env));
  },
};
