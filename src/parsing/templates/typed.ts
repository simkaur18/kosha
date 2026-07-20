import type { ParseTemplate, ParsedTransaction } from "../types";

// Handles messages someone types directly, e.g.:
//   "500 spent on swiggy"
//   "spent 500 on swiggy"
//   "paid 220 to uber"
//   "received 500 from friend"
// Deliberately loose — this is the "just type it" path, not a bank alert.
const SPENT_PATTERN =
  /^(?:spent\s+)?(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)?\s*(?:spent\s+)?(?:on|at|to|for)\s+([a-zA-Z][\w\s]*?)\s*$/i;

const RECEIVED_PATTERN =
  /^(?:received\s+)?(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)?\s*(?:received\s+)?(?:from)\s+([a-zA-Z][\w\s]*?)\s*$/i;

export const typedTemplate: ParseTemplate = {
  name: "typed",

  looksLikeMatch(message: string): boolean {
    // Bank alerts mention account numbers / debited-credited jargon; typed
    // messages generally won't. This is just a cheap filter, not the source
    // of truth — bank templates get tried first by the engine anyway.
    const hasNumber = /\d/.test(message);
    const looksLikeBankAlert = /\ba\/c\b|debited|credited|avl\s*bal|available\s*balance/i.test(message);
    return hasNumber && !looksLikeBankAlert;
  },

  parse(message: string): ParsedTransaction | null {
    const clean = message.trim();

    const spentMatch = clean.match(SPENT_PATTERN);
    if (spentMatch) {
      return {
        status: "parsed",
        amount: parseFloat(spentMatch[1]),
        type: "debit",
        vendor: titleCase(spentMatch[2].trim()),
        redactedRawText: clean,
        accountHint: null,
        availableBalance: null,
      };
    }

    const receivedMatch = clean.match(RECEIVED_PATTERN);
    if (receivedMatch) {
      return {
        status: "parsed",
        amount: parseFloat(receivedMatch[1]),
        type: "credit",
        vendor: titleCase(receivedMatch[2].trim()),
        redactedRawText: clean,
        accountHint: null,
        availableBalance: null,
      };
    }

    return null;
  },
};

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
