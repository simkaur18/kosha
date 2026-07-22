import { Bot, InputFile } from "grammy";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { accounts, transactions, categories, settings } from "./db/schema";
import { parseMessage } from "./parsing/engine";
import { categorize } from "./categorize";
import { generateSalt, hashPin } from "./auth";
import { getOrCreateSettings } from "./settings";
import { buildExportCsv } from "./export";
import { findRefundCandidate, buildRefundPromptText, parseYesNo } from "./refunds";

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

  bot.command("export", async (ctx) => {
    const txns = await db.select().from(transactions);
    if (txns.length === 0) {
      await ctx.reply("Nothing to export yet — log an expense first, or paste a bank message.");
      return;
    }

    const accts = await db.select().from(accounts);
    const csv = buildExportCsv(txns, accts);
    const filename = `kosha-export-${new Date().toISOString().slice(0, 10)}.csv`;
    await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(csv), filename), {
      caption: `Your full history — ${txns.length} entries. Opens in Excel, Sheets, or Numbers.`,
    });
  });

  bot.command(["forgotpin", "resetpin"], async (ctx) => {
    await ctx.reply(
      "No problem — just reply here with a new 6-digit PIN and it'll replace your old one right away. " +
        "Only you can do this, since only you have this chat."
    );
  });

  // Lists whatever couldn't be auto-parsed, tagged with a short id (the last
  // 6 characters of the transaction's uuid — plenty unique at this scale)
  // so /fix and /discard have something short enough to type back.
  bot.command("review", async (ctx) => {
    const unparsed = await db.select().from(transactions).where(eq(transactions.status, "unparsed"));
    if (unparsed.length === 0) {
      await ctx.reply("Nothing to review — everything you've sent has parsed cleanly.");
      return;
    }

    const recent = unparsed.slice(-10);
    const lines = recent.map((t) => {
      const shortId = t.id.slice(-6);
      const date = new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      const snippet = (t.redactedRawText ?? "").slice(0, 80);
      return `#${shortId} (${date}): ${snippet}`;
    });
    const exampleId = recent[recent.length - 1].id.slice(-6);

    await ctx.reply(
      `${unparsed.length} unparsed message${unparsed.length === 1 ? "" : "s"}${unparsed.length > recent.length ? ` (showing the ${recent.length} most recent)` : ""}:\n\n` +
        `${lines.join("\n")}\n\n` +
        `To fix one: /fix <id> <amount> <debit|credit> [vendor]\n` +
        `e.g. /fix ${exampleId} 250 debit swiggy\n\n` +
        `Wasn't actually an expense? /discard <id> to drop it for good.`
    );
  });

  bot.command("fix", async (ctx) => {
    const payload = (ctx.match as string | undefined)?.trim() ?? "";
    const parts = payload.split(/\s+/).filter(Boolean);
    const [shortId, amountStr, directionRaw, ...vendorParts] = parts;

    if (!shortId || !amountStr || !directionRaw) {
      await ctx.reply("Usage: /fix <id> <amount> <debit|credit> [vendor]\nGrab the id from /review.");
      return;
    }

    const direction = directionRaw.toLowerCase();
    if (direction !== "debit" && direction !== "credit") {
      await ctx.reply(`"${directionRaw}" has to be either "debit" or "credit" — e.g. /fix ${shortId} 250 debit swiggy`);
      return;
    }

    const amount = parseFloat(amountStr.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      await ctx.reply(`"${amountStr}" doesn't look like a valid amount — e.g. /fix ${shortId} 250 debit swiggy`);
      return;
    }

    const unparsed = await db.select().from(transactions).where(eq(transactions.status, "unparsed"));
    const match = unparsed.find((t) => t.id.endsWith(shortId));
    if (!match) {
      await ctx.reply(`Couldn't find an unparsed entry ending in "${shortId}" — check /review for current ids.`);
      return;
    }

    const vendor = vendorParts.join(" ").trim() || null;
    const rules = await db.select().from(categories);
    const category = vendor ? categorize(vendor, rules) : null;

    await db
      .update(transactions)
      .set({ amount, type: direction, vendor, category, status: "parsed" })
      .where(eq(transactions.id, match.id));

    const amountDisplay = `₹${amount.toLocaleString("en-IN")}`;
    const vendorStr = vendor ? ` to ${vendor}` : "";
    const categoryStr = category ? `, tagged as ${category}` : "";
    await ctx.reply(`Fixed — ${amountDisplay}${vendorStr}${categoryStr}.`);
  });

  bot.command("discard", async (ctx) => {
    const shortId = (ctx.match as string | undefined)?.trim();
    if (!shortId) {
      await ctx.reply("Usage: /discard <id> — grab the id from /review.");
      return;
    }

    const unparsed = await db.select().from(transactions).where(eq(transactions.status, "unparsed"));
    const match = unparsed.find((t) => t.id.endsWith(shortId));
    if (!match) {
      await ctx.reply(`Couldn't find an unparsed entry ending in "${shortId}" — check /review for current ids.`);
      return;
    }

    await db.delete(transactions).where(eq(transactions.id, match.id));
    await ctx.reply("Discarded — that one's gone for good.");
  });

  // A 6-digit reply is treated as a PIN set/reset, anything else goes
  // through the expense-parsing pipeline.
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();

    // Captures the chat to send nudges to. Cheap to check every message —
    // it's a single-tenant bot, so this only ever actually writes once.
    const current = await getOrCreateSettings(db);
    const chatId = String(ctx.chat.id);
    if (current.chatId !== chatId) {
      await db.update(settings).set({ chatId }).where(eq(settings.id, 1));
    }

    // A refund question is waiting on a yes/no reply — handle that before
    // anything else so "yes"/"no" never gets fed into the expense parser.
    // Anything else clears the question rather than blocking the chat: the
    // credit already landed as ordinary income when it came in, so ignoring
    // the question just leaves it that way (the PRD's "by default" case).
    if (current.pendingRefundCreditId && current.pendingRefundDebitId) {
      const pendingCreditId = current.pendingRefundCreditId;
      const pendingDebitId = current.pendingRefundDebitId;
      const answer = parseYesNo(text);
      if (answer !== null) {
        if (answer === "yes") {
          const [credit] = await db.select().from(transactions).where(eq(transactions.id, pendingCreditId));
          const [debit] = await db.select().from(transactions).where(eq(transactions.id, pendingDebitId));
          if (credit && debit) {
            await db
              .update(transactions)
              .set({ amount: Math.max(0, debit.amount - credit.amount) })
              .where(eq(transactions.id, debit.id));
            await db
              .update(transactions)
              .set({ status: "netted", refundOf: debit.id })
              .where(eq(transactions.id, credit.id));
          }
        }
        await db
          .update(settings)
          .set({ pendingRefundCreditId: null, pendingRefundDebitId: null })
          .where(eq(settings.id, 1));
        await ctx.reply(
          answer === "yes"
            ? "Done — netted against that expense, won't count as separate income."
            : "Got it — keeping it as income."
        );
        return;
      }
      await db
        .update(settings)
        .set({ pendingRefundCreditId: null, pendingRefundDebitId: null })
        .where(eq(settings.id, 1));
    }

    if (/^\d{6}$/.test(text)) {
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

    const now = new Date().toISOString();
    const newTxnId = crypto.randomUUID();
    await db.insert(transactions).values({
      id: newTxnId,
      date: now,
      amount: result.amount,
      type: result.type,
      vendor: result.vendor,
      category,
      redactedRawText: result.redactedRawText,
      source: "typed",
      status: "parsed",
      accountId,
    });

    // Refund/reversal detection (PRD, P1) — only credits can be refunds of an
    // earlier expense, so debits skip straight to the normal reply below.
    if (result.type === "credit") {
      const parsedTxns = await db.select().from(transactions).where(eq(transactions.status, "parsed"));
      const candidate = findRefundCandidate(
        parsedTxns.filter((t) => t.id !== newTxnId),
        { amount: result.amount, vendor: result.vendor, date: now }
      );
      if (candidate) {
        await db
          .update(settings)
          .set({ pendingRefundCreditId: newTxnId, pendingRefundDebitId: candidate.id })
          .where(eq(settings.id, 1));
        await ctx.reply(buildRefundPromptText(candidate, now));
        return;
      }
    }

    const amountStr = `₹${result.amount.toLocaleString("en-IN")}`;
    const vendorStr = result.vendor ? ` to ${result.vendor}` : "";
    const categoryStr = category ? `, tagged as ${category}` : "";
    const verb = result.type === "debit" ? "Got it" : "Nice";
    await ctx.reply(`${verb} — ${amountStr}${vendorStr}${categoryStr}.`);
  });

  return bot;
}
