import type { ParseTemplate, ParsedTransaction } from "../types";

const HDFC_CARD_PATTERN =
    /txn\s*rs\.?\s*([\d,]+\.\d{2})[\s\S]*?hdfc\s*bank\s*card\s*(\d{3,4})[\s\S]*?at\s*([^\n]+?)\s*(?:by\s*upi|\n)/i;

export const hdfcCardTemplate: ParseTemplate = {
    name: "hdfc-card",

    looksLikeMatch(message: string): boolean {
          return /txn\s*rs\.?\s*[\d,]+\.\d{2}/i.test(message) && /hdfc\s*bank\s*card/i.test(message);
    },

    parse(message: string): ParsedTransaction | null {
          const match = message.match(HDFC_CARD_PATTERN);
          if (!match) return null;

      const [, amountStr, cardLast4, vendorHandle] = match;

      return {
              status: "parsed",
              amount: parseFloat(amountStr.replace(/,/g, "")),
              type: "debit",
              vendor: cleanVendorFromUpiHandle(vendorHandle),
              redactedRawText: message,
              accountHint: null,
              availableBalance: null,
      };
    },
};

function cleanVendorFromUpiHandle(raw: string): string | null {
    let v = raw.trim();
    v = v.split("@")[0];
    v = v.split(".")[0];
    v = v.replace(/\d+/g, "");
    v = v.replace(/online|instore|store/gi, "");
    v = v.trim();
    return v ? titleCase(v) : null;
}

function titleCase(s: string): string {
    return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
