import { Bot } from "grammy";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { accounts, transactions, categories, settings } from "./db/schema";
import { parseMessage } from "./parsing/engine";
import { categorize } from "./categorize";
import { generateSalt, hashPin } from "./auth";
import { getOrCreateSettings } from "./settings";

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  TOOLKIT_VERSION: string;
  DASHBOARD_URL: string;
  ASSETS: Fetcher;
}

// Slugifies a bank name from an account hint like "HDFC ••1234" -> "hdfc".
function accountSlug(hint: string): string {
  return hint.split(" ")[0].toLowerCase();
}

export function createBot(env: Env) {
  const bot = new Bot(env.BOT_TOKEN);
  const db = drizzle(env.DB);

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Hey! I'm your Kosha bot — just yours, nobody else can see this. Let's get you set up. " +
        "First, pick a 6-digit PIN for your dashboard. Reply with 6 digits whenever you're ready."
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Here's what I can do:\n" +
        "• Type or paste an expense to log it\n" +
        "• /review — fix anything marked unparsed\n" +
        "• /export — download your full history\n" +
        "• /forgotpin, /resetpin — dashboard access\n" +
        "• /investments — set up CAS tracking"
    );
  });

  bot.command(["forgotpin", "resetpin"], async (ctx) => {
    await ctx.reply(
      "No problem — just reply here with a new 6-digit PIN and it'll replace your old one right away. " +
        "Only you can do this, since only you have this chat."
    );
  });

  // A 6-digit reply is treated as a PIN set/reset, anything else goes
  // through the expense-parsing pipeline.
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();

    if (/^\d{6}$/.test(text)) {
      const current = await getOrCreateSettings(db);
      const salt = generateSalt();
      const pinHash = await hashPin(text, salt);

      await db
        .update(settings)
        .set({ pinHash, pinSalt: salt, failedAttempts: 0, lockedUntil: null })
        .where(eq(settings.id, 1));

      const dashboardUrl = env.DASHBOARD_URL ? `${env.DASHBOARD_URL}/dashboard` : "your Worker's /dashboard URL";
      await ctx.reply(`Done — your dashboard PIN is set. Open ${dashboardUrl} any time and enter it there.`);
      return;
    }

    const result = parseMessage(text);

    if (result.status === "unparsed") {
      const reasonCopy =
        result.reason === "multiple_amounts"
          ? "This one's got more than one amount, so I didn't want to guess — saved it as unparsed. Check /review when you get a sec."
          : "Couldn't quite make sense of this one — saved it as unparsed, nothing's lost. Check /review to fix it up.";
      await db.insert(transactions).values({
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        amount: 0,
        type: "debit",
        vendor: null,
        category: null,
        redactedRawText: result.redactedRawText,
        source: "typed",
        status: "unparsed",
        accountId: null,
      });
      await ctx.reply(reasonCopy);
      return;
    }

    // Resolve/create the linked account if the message identified one.
    let accountId: string | null = null;
    if (result.accountHint) {
      accountId = accountSlug(result.accountHint);
      const [existing] = await db.select().from(accounts).where(eq(accounts.id, accountId));
      if (!existing) {
        await db.insert(accounts).values({
          id: accountId,
          bankName: result.accountHint.split(" ")[0],
          maskedIdentifier: result.accountHint.split("••")[1] ?? null,
          currentBalance: result.availableBalance,
          lastUpdated: new Date().toISOString(),
        });
      } else if (result.availableBalance != null) {
        await db
          .update(accounts)
          .set({ currentBalance: result.availableBalance, lastUpdated: new Date().toISOString() })
          .where(eq(accounts.id, accountId));
      }
    }

    const rules = await db.select().from(categories);
    const category = categorize(result.vendor, rules);

    await db.insert(transactions).values({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      amount: result.amount,
      type: result.type,
      vendor: result.vendor,
      category,
      redactedRawText: result.redactedRawText,
      source: "typed",
      status: "parsed",
      accountId,
    });

    const amountStr = `₹${result.amount.toLocaleString("en-IN")}`;
    const vendorStr = result.vendor ? ` to ${result.vendor}` : "";
    const categoryStr = category ? `, tagged as ${category}` : "";
    const verb = result.type === "debit" ? "Got it" : "Nice";
    await ctx.reply(`${verb} — ${amountStr}${vendorStr}${categoryStr}.`);
  });

  return bot;
}
