import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// One row per linked bank account (e.g. HDFC, Axis). Balance is only ever
// updated when a parsed message includes an "available balance" figure —
// Kosha never calls a bank API to fetch it.
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // e.g. "hdfc", "axis" — simple slug, not a UUID
  bankName: text("bank_name").notNull(),
  maskedIdentifier: text("masked_identifier"), // last 4 digits, if known
  currentBalance: real("current_balance"),
  lastUpdated: text("last_updated"), // ISO timestamp
});

// Every logged expense/income entry, whether typed, pasted, or (later) auto-forwarded.
export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  date: text("date").notNull(), // ISO timestamp
  amount: real("amount").notNull(),
  type: text("type").notNull(), // "debit" | "credit"
  vendor: text("vendor"),
  category: text("category"),
  redactedRawText: text("redacted_raw_text"), // original message with sensitive bits stripped
  source: text("source").notNull(), // "typed" | "pasted" | "auto"
  status: text("status").notNull().$type<"parsed" | "unparsed" | "netted">(), // "netted" = a refund confirmed against another transaction — see refund_of
  accountId: text("account_id").references(() => accounts.id),
  refundOf: text("refund_of").references((): any => transactions.id), // set on the credit once confirmed as a refund; points at the debit it was netted against
});

// Teachable merchant-to-category pattern rules ("Smart Rules").
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  matchPattern: text("match_pattern").notNull(), // simple substring/regex the vendor is checked against
});

// Combined net worth view: SIPs/mutual funds, stocks, FDs, RDs.
export const investments = sqliteTable("investments", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // "sip" | "stock" | "fd" | "rd"
  name: text("name").notNull(),
  investedAmount: real("invested_amount"),
  currentValue: real("current_value"),
  lastUpdated: text("last_updated"),
});

// Per-instance configuration — one row, effectively a key-value singleton.
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pinHash: text("pin_hash"),
  pinSalt: text("pin_salt"),
  sessionSecret: text("session_secret"), // signs dashboard session cookies
  failedAttempts: integer("failed_attempts").default(0), // dashboard login lockout
  lockedUntil: text("locked_until"), // ISO timestamp, null when not locked
  notificationCadence: text("notification_cadence").default("daily"), // "daily" | "weekly" | "off"
  language: text("language").default("en"), // "en" | "hi"
  toolkitVersion: text("toolkit_version"),
  chatId: text("chat_id"), // Telegram chat to send nudges to — captured from the first message in, in bot.ts
  // The one in-flight "is this a refund?" yes/no question, if any — see src/refunds.ts.
  pendingRefundCreditId: text("pending_refund_credit_id"),
  pendingRefundDebitId: text("pending_refund_debit_id"),
});
