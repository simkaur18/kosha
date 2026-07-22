// Refund/reversal detection (PRD, P1): "A credit that matches a recent debit
// (same amount, same/similar vendor, within a short window) is offered as
// 'net against this expense?' rather than counted as new income by default."
//
// Deliberately amount-exact rather than "close enough" — the spec's own
// wording is "same amount", and matching loosely risks netting two
// coincidentally-similar, unrelated transactions against each other. Vendor
// matching is looser ("similar") since the credit side of a refund often
// carries slightly different wording than the original debit (e.g. a
// gateway name vs. the merchant name).
import type { TxnRow } from "./dashboard-data";
import { istDateKey } from "./nudges";

const REFUND_WINDOW_DAYS = 7;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function normalizeVendor(vendor: string | null): string {
  return (vendor ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function vendorsMatch(a: string | null, b: string | null): boolean {
  const na = normalizeVendor(a);
  const nb = normalizeVendor(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (24 * 60 * 60 * 1000);
}

export interface CreditLike {
  amount: number;
  vendor: string | null;
  date: string; // ISO timestamp
}

// Looks for the best matching debit a new credit might be refunding.
// Callers should exclude the credit itself (and anything not yet parsed)
// from `transactions` before calling this.
export function findRefundCandidate(transactions: TxnRow[], credit: CreditLike): TxnRow | null {
  const candidates = transactions.filter((t) => {
    if (t.status !== "parsed" || t.type !== "debit") return false;
    if (t.amount !== credit.amount) return false;
    if (!vendorsMatch(t.vendor, credit.vendor)) return false;
    const days = daysBetween(t.date, credit.date);
    return days >= 0 && days <= REFUND_WINDOW_DAYS;
  });

  if (candidates.length === 0) return null;
  // If more than one debit qualifies, the most recent is the most likely
  // match for a refund that just came in.
  return candidates.reduce((latest, t) => (t.date > latest.date ? t : latest));
}

// "today" / "yesterday" / a weekday name / a short date — matches the sample
// bot copy in the Bot Conversation Design doc ("...Swiggy order from Tuesday...").
export function relativeDayLabel(pastIso: string, nowIso: string): string {
  if (istDateKey(pastIso) === istDateKey(nowIso)) return "today";

  const days = Math.round(daysBetween(pastIso, nowIso));
  const shifted = new Date(new Date(pastIso).getTime() + IST_OFFSET_MS);

  if (days === 1) return "yesterday";
  if (days >= 0 && days < 7) return WEEKDAY_NAMES[shifted.getUTCDay()];
  return shifted.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function buildRefundPromptText(debit: TxnRow, nowIso: string): string {
  const amountStr = `₹${Math.round(debit.amount).toLocaleString("en-IN")}`;
  const vendorStr = debit.vendor ? ` ${debit.vendor}` : "";
  const dayStr = relativeDayLabel(debit.date, nowIso);
  return (
    `This looks like a refund for the ${amountStr}${vendorStr} order from ${dayStr} — want me to net it against ` +
    `that expense instead of counting it as new income? Reply yes or no.`
  );
}

// Deliberately forgiving on wording, strict on ambiguity — anything that
// isn't clearly one or the other returns null so the caller can decide what
// to do (in bot.ts: treat it as "never mind" rather than blocking the chat).
export function parseYesNo(text: string): "yes" | "no" | null {
  const t = text.trim().toLowerCase();
  if (["yes", "y", "yeah", "yep", "ya"].includes(t)) return "yes";
  if (["no", "n", "nope", "nah"].includes(t)) return "no";
  return null;
}
