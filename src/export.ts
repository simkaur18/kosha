// Builds the /export CSV. Pure and D1-independent so it's unit-testable —
// bot.ts fetches rows once and hands plain arrays here.

export interface ExportTxnRow {
  date: string; // ISO timestamp
  type: "debit" | "credit";
  amount: number;
  vendor: string | null;
  category: string | null;
  source: string;
  status: "parsed" | "unparsed" | "netted";
  accountId: string | null;
  redactedRawText: string | null;
}

export interface ExportAccountRow {
  id: string;
  bankName: string;
  maskedIdentifier: string | null;
}

const HEADERS = [
  "Date",
  "Type",
  "Amount",
  "Vendor",
  "Category",
  "Account",
  "Status",
  "Source",
  "Original message (redacted)",
];

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Chronological, oldest first — matches how a bank statement or ledger
// reads, rather than the dashboard's most-recent-first convention.
export function buildExportCsv(transactions: ExportTxnRow[], accounts: ExportAccountRow[]): string {
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  const rows = [...transactions]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) => {
      const account = t.accountId ? accountsById.get(t.accountId) : undefined;
      const accountLabel = account
        ? `${account.bankName}${account.maskedIdentifier ? ` ••${account.maskedIdentifier}` : ""}`
        : "";

      return [
        t.date,
        t.type,
        t.status === "unparsed" ? "" : String(t.amount), // netted rows keep their amount for the audit trail — only truly-unparsed rows have no real amount
        t.vendor ?? "",
        t.category ?? "",
        accountLabel,
        t.status,
        t.source,
        t.redactedRawText ?? "",
      ];
    });

  return [HEADERS, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\r\n") + "\r\n";
}
