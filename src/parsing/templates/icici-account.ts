import type { ParseTemplate, ParsedTransaction } from "../types";

const ICICI_ACCOUNT_PATTERN =
  /icici\s*bank\s*acc\s*(?:xx)?(\d{2,6})\s*(debited|credited)\s*rs\.?\s*([\d,]+\.\d{2})\s*on\s*[\d\-a-z]+\s*([^.]*)\.\s*av[bl]\.?\s*bal\s*rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i;

export const iciciAccountTemplate: ParseTemplate = {
  name: "icici-account",

  looksLikeMatch(message: string): boolean {
    return /icici\s*bank\s*acc\b/i.test(message) && /av[bl]\.?\s*bal/i.test(message);
  },

  parse(message: string): ParsedTransaction | null {
    const match = message.match(ICICI_ACCOUNT_PATTERN);
    if (!match) return null;

    const [, acctLast, direction, amountStr, vendorRaw, balanceStr] = match;

    return {
      status: "parsed",
      amount: parseFloat(amountStr.replace(/,/g, "")),
      type: direction.toLowerCase() === "debited" ? "debit" : "credit",
      vendor: cleanVendor(vendorRaw),
      redactedRawText: message,
      accountHint: `ICICI ••${acctLast}`,
      availableBalance: parseFloat(balanceStr.replace(/,/g, "")),
    };
  },
};

function cleanVendor(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("*")) return null;
  return titleCase(trimmed);
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
