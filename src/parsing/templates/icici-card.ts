import type { ParseTemplate, ParsedTransaction } from "../types";

const ICICI_CARD_PATTERN =
    /inr\s*([\d,]+\.\d{2})\s*spent\s*using\s*icici\s*bank\s*card\s*(?:xx)?(\d{3,4})\s*on\s*[\d\-a-z]+\s*on\s*([a-z0-9\s]+?)\.\s*avl\.?\s*limit/i;

export const iciciCardTemplate: ParseTemplate = {
    name: "icici-card",

    looksLikeMatch(message: string): boolean {
          return /icici\s*bank\s*card/i.test(message) && /avl\.?\s*limit/i.test(message);
    },

    parse(message: string): ParsedTransaction | null {
          const match = message.match(ICICI_CARD_PATTERN);
          if (!match) return null;

      const [, amountStr, , vendorRaw] = match;

      return {
              status: "parsed",
              amount: parseFloat(amountStr.replace(/,/g, "")),
              type: "debit",
              vendor: vendorRaw.trim() ? titleCase(vendorRaw.trim()) : null,
              redactedRawText: message,
              accountHint: null,
              availableBalance: null,
      };
    },
};

function titleCase(s: string): string {
    return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
