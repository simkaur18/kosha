import type { TxnRow } from "./dashboard-data";

// This app assumes IST users (per the PRD's default) — nudges fire once a
// day, so "today" and "this month" are computed against IST rather than UTC
// so they match the day the person actually experienced, not the server's.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function istDateKey(nowIso: string): string {
  const shifted = new Date(new Date(nowIso).getTime() + IST_OFFSET_MS);
  return shifted.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export function istMonthKey(nowIso: string): string {
  return istDateKey(nowIso).slice(0, 7); // "YYYY-MM"
}

export function isFirstOfIstMonth(nowIso: string): boolean {
  return istDateKey(nowIso).slice(8, 10) === "01";
}

export function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function monthLabelFor(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function spentOnDate(transactions: TxnRow[], dateKey: string): number {
  return transactions
    .filter((t) => t.status === "parsed" && t.type === "debit" && istDateKey(t.date) === dateKey)
    .reduce((sum, t) => sum + t.amount, 0);
}

export function unparsedCountOnDate(transactions: TxnRow[], dateKey: string): number {
  return transactions.filter((t) => t.status === "unparsed" && istDateKey(t.date) === dateKey).length;
}

export function buildDailyNudgeText(spentToday: number, unparsedToday: number): string {
  const spentLine =
    spentToday > 0
      ? `You logged ₹${Math.round(spentToday).toLocaleString("en-IN")} today.`
      : "No spends logged today.";
  const reviewLine =
    unparsedToday > 0
      ? ` ${unparsedToday} message${unparsedToday === 1 ? "" : "s"} need${unparsedToday === 1 ? "s" : ""} a look in /review.`
      : "";
  return `Evening check-in — ${spentLine}${reviewLine} Anything you paid cash for that's not logged yet? Just type it in.`;
}

// Returns null when there's nothing to report, so callers know to skip
// sending rather than pinging an empty summary.
export function buildMonthlyNudgeText(
  monthLabel: string,
  spentLastMonth: number,
  topCategory: { category: string; amount: number } | null
): string | null {
  if (spentLastMonth <= 0) return null;
  const amountStr = `₹${Math.round(spentLastMonth).toLocaleString("en-IN")}`;
  const categoryStr = topCategory ? `, mostly on ${topCategory.category}` : "";
  return `📅 ${monthLabel} closed out at ${amountStr} spent${categoryStr}. Fresh month, fresh start!`;
}
