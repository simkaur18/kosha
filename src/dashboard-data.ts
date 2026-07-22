// Pure aggregation functions for the dashboard — deliberately independent of
// D1/drizzle so they're unit-testable with plain arrays. The API route in
// index.ts is the only thing that touches the database; it fetches
// everything once and hands plain rows to buildDashboardPayload().

export interface TxnRow {
  id: string;
  date: string; // ISO timestamp
  amount: number;
  type: "debit" | "credit";
  vendor: string | null;
  category: string | null;
  source: string;
  // "netted" = a credit confirmed as a refund against another transaction
  // (see src/refunds.ts) — excluded from spend/income totals below same as
  // "unparsed", since it isn't really new income; the expense it refunds had
  // its own amount reduced instead.
  status: "parsed" | "unparsed" | "netted";
  accountId: string | null;
}

export interface AccountRow {
  id: string;
  bankName: string;
  maskedIdentifier: string | null;
  currentBalance: number | null;
}

export type InvestmentType = "sip" | "stock" | "fd" | "rd";

export interface InvestmentRow {
  id: string;
  type: InvestmentType;
  name: string;
  investedAmount: number | null;
  currentValue: number | null;
  lastUpdated: string | null;
  // FD-only formula inputs (see fdCurrentValue below) — null/absent for
  // sip/stock/rd rows, which just use currentValue directly.
  principal?: number | null;
  interestRate?: number | null;
  startDate?: string | null;
  maturityDate?: string | null;
}

function monthKeyOf(dateIso: string): string {
  return dateIso.slice(0, 7); // "2026-07-14T..." -> "2026-07"
}

function lastNMonths(referenceMonth: string, n: number): string[] {
  const [yearStr, monthStr] = referenceMonth.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  const result: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let y = year;
    let m = month - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    result.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return result;
}

// Always includes the current real-world month, even with zero transactions,
// so a brand-new instance still has something selectable.
export function getAvailableMonths(transactions: TxnRow[], nowIso: string): string[] {
  const months = new Set(transactions.map((t) => monthKeyOf(t.date)));
  months.add(monthKeyOf(nowIso));
  return Array.from(months).sort();
}

export function totalBalance(accounts: AccountRow[]): number {
  return accounts.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0);
}

// FD value via simple interest from its principal, deliberately not
// compound: FDs quote an annual rate that's already the bank's own
// compounding math baked in, and this is meant as a transparent personal
// estimate, not a bank-exact reconciliation. Growth freezes at whatever the
// value was on the maturity date rather than continuing to accrue past it.
// Falls back to a stored currentValue if the formula inputs aren't set
// (e.g. an older row, or a type this doesn't apply to).
export function fdCurrentValue(inv: InvestmentRow, nowIso: string): number {
  if (inv.principal == null || inv.interestRate == null || !inv.startDate) {
    return inv.currentValue ?? 0;
  }
  const startMs = new Date(inv.startDate).getTime();
  const capMs = inv.maturityDate ? new Date(inv.maturityDate).getTime() : Infinity;
  const nowMs = Math.min(new Date(nowIso).getTime(), capMs);
  const yearsElapsed = Math.max(0, (nowMs - startMs) / (365.25 * 24 * 60 * 60 * 1000));
  return inv.principal * (1 + (inv.interestRate / 100) * yearsElapsed);
}

// The value to actually use for an investment row "right now" — formula-
// backed for FDs (see fdCurrentValue), a plain stored number for everything
// else (sip/stock from a CAS import or manual entry, rd manual entry).
export function effectiveCurrentValue(inv: InvestmentRow, nowIso: string): number {
  return inv.type === "fd" ? fdCurrentValue(inv, nowIso) : inv.currentValue ?? 0;
}

// Current value only, by type — SIPs/stocks come from a CAS import or
// manual /investments entry; FDs are computed live (see fdCurrentValue); RDs
// are manual /investments entry.
export function investmentTotalsByType(
  investments: InvestmentRow[],
  nowIso: string = new Date().toISOString()
): Record<InvestmentType, number> {
  const totals: Record<InvestmentType, number> = { sip: 0, stock: 0, fd: 0, rd: 0 };
  for (const inv of investments) {
    totals[inv.type] += effectiveCurrentValue(inv, nowIso);
  }
  return totals;
}

// Lets the dashboard show "—" for a type with no data yet instead of a
// misleading ₹0, which would otherwise look like "confirmed zero holdings".
export function investmentTypesPresent(investments: InvestmentRow[]): Record<InvestmentType, boolean> {
  const present: Record<InvestmentType, boolean> = { sip: false, stock: false, fd: false, rd: false };
  for (const inv of investments) present[inv.type] = true;
  return present;
}

// Bank balances + investments' current value. Invested amount (cost basis)
// deliberately isn't part of this — net worth is what things are worth now.
export function netWorth(
  accounts: AccountRow[],
  investments: InvestmentRow[],
  nowIso: string = new Date().toISOString()
): number {
  return totalBalance(accounts) + investments.reduce((sum, i) => sum + effectiveCurrentValue(i, nowIso), 0);
}

// Most recent CAS import date across all investments, for a "as of ..."
// label — null when nothing's been imported yet.
export function investmentsAsOf(investments: InvestmentRow[]): string | null {
  const dates = investments.map((i) => i.lastUpdated).filter((d): d is string => Boolean(d));
  if (dates.length === 0) return null;
  return dates.reduce((latest, d) => (d > latest ? d : latest));
}

export function spentInMonth(transactions: TxnRow[], month: string): number {
  return transactions
    .filter((t) => t.status === "parsed" && t.type === "debit" && monthKeyOf(t.date) === month)
    .reduce((sum, t) => sum + t.amount, 0);
}

export function incomeInMonth(transactions: TxnRow[], month: string): number {
  return transactions
    .filter((t) => t.status === "parsed" && t.type === "credit" && monthKeyOf(t.date) === month)
    .reduce((sum, t) => sum + t.amount, 0);
}

export function unparsedCount(transactions: TxnRow[], month: string): number {
  return transactions.filter((t) => t.status === "unparsed" && monthKeyOf(t.date) === month).length;
}

export function categoryBreakdown(transactions: TxnRow[], month: string): { category: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.status !== "parsed" || t.type !== "debit" || monthKeyOf(t.date) !== month) continue;
    const key = t.category ?? "Uncategorized";
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }
  return Array.from(totals, ([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}

export function topMerchants(
  transactions: TxnRow[],
  month: string,
  limit = 6
): { vendor: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.status !== "parsed" || t.type !== "debit" || !t.vendor || monthKeyOf(t.date) !== month) continue;
    totals.set(t.vendor, (totals.get(t.vendor) ?? 0) + t.amount);
  }
  return Array.from(totals, ([vendor, amount]) => ({ vendor, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function monthlyTrend(
  transactions: TxnRow[],
  referenceMonth: string,
  monthsBack = 6
): { month: string; spent: number; income: number }[] {
  return lastNMonths(referenceMonth, monthsBack).map((m) => ({
    month: m,
    spent: spentInMonth(transactions, m),
    income: incomeInMonth(transactions, m),
  }));
}

export function recentTransactions(
  transactions: TxnRow[],
  accounts: AccountRow[],
  limit = 8
): { date: string; vendor: string; bankName: string | null; source: string; type: string; status: string; amount: number }[] {
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  return [...transactions]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map((t) => ({
      date: t.date,
      vendor: t.vendor ?? (t.status === "unparsed" ? "Unrecognised" : "—"),
      bankName: t.accountId ? accountsById.get(t.accountId)?.bankName ?? null : null,
      source: t.source,
      type: t.type,
      status: t.status,
      amount: t.amount,
    }));
}

export interface DashboardPayload {
  month: string;
  availableMonths: string[];
  totalBalance: number;
  accounts: { bankName: string; maskedIdentifier: string | null; balance: number }[];
  spentThisMonth: number;
  spentLastMonth: number;
  unparsedCount: number;
  categoryBreakdown: { category: string; amount: number }[];
  topMerchants: { vendor: string; amount: number }[];
  monthlyTrend: { month: string; spent: number; income: number }[];
  recentTransactions: ReturnType<typeof recentTransactions>;
  netWorth: number;
  investmentTotals: Record<InvestmentType, number>;
  investmentTypesPresent: Record<InvestmentType, boolean>;
  investmentsAsOf: string | null;
}

export function buildDashboardPayload(
  transactions: TxnRow[],
  accounts: AccountRow[],
  nowIso: string,
  requestedMonth?: string,
  investmentRows: InvestmentRow[] = []
): DashboardPayload {
  const availableMonths = getAvailableMonths(transactions, nowIso);
  const month = requestedMonth && availableMonths.includes(requestedMonth)
    ? requestedMonth
    : availableMonths[availableMonths.length - 1];
  const [lastMonth] = lastNMonths(month, 2);

  return {
    month,
    availableMonths,
    totalBalance: totalBalance(accounts),
    accounts: accounts.map((a) => ({
      bankName: a.bankName,
      maskedIdentifier: a.maskedIdentifier,
      balance: a.currentBalance ?? 0,
    })),
    spentThisMonth: spentInMonth(transactions, month),
    spentLastMonth: spentInMonth(transactions, lastMonth),
    unparsedCount: unparsedCount(transactions, month),
    categoryBreakdown: categoryBreakdown(transactions, month),
    topMerchants: topMerchants(transactions, month),
    monthlyTrend: monthlyTrend(transactions, month),
    recentTransactions: recentTransactions(transactions, accounts),
    netWorth: netWorth(accounts, investmentRows, nowIso),
    investmentTotals: investmentTotalsByType(investmentRows, nowIso),
    investmentTypesPresent: investmentTypesPresent(investmentRows),
    investmentsAsOf: investmentsAsOf(investmentRows),
  };
}
