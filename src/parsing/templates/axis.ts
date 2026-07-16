import { ParseTemplate, ParsedTransaction } from "../types";

// Example shape (starting template — refine against real, redacted Axis
// messages once we have them):
//   "INR 1,240.00 debited from A/c no. XX7745 on 12-Jul-26 towards BIGBASKET. Available Balance: INR 142410.00"
const AXIS_PATTERN =
  /inr\s*([\d,]+\.\d{2})\s*(debited|credited)\s*(?:from|to)?\s*a\/c\s*no\.?\s*(?:xx|x{2,})?(\d{2,6})\s*on\s*[\d\-a-z]+\s*(?:towards|by)?\s*([a-z0-9\s]*?)\.?\s*available\s*balance\s*:?\s*inr\s*([\d,]+\.\d{2})/i;

export const axisTemplate: ParseTemplate = {
  name: "axis",

  looksLikeMatch(message: string): boolean {
    return /a\/c\s*no/i.test(message) && /available\s*balance/i.test(message) && /inr\s*[\d,]+\.\d{2}/i.test(message);
  },

  parse(message: string): ParsedTransaction | null {
    const match = message.match(AXIS_PATTERN);
    if (!match) return null;

    const [, amountStr, direction, acctLast4, vendorRaw, balanceStr] = match;

    return {
      status: "parsed",
      amount: parseFloat(amountStr.replace(/,/g, "")),
      type: direction.toLowerCase() === "debited" ? "debit" : "credit",
      vendor: vendorRaw.trim() ? titleCase(vendorRaw.trim()) : null,
      redactedRawText: message,
      accountHint: `Axis ••${acctLast4}`,
      availableBalance: parseFloat(balanceStr.replace(/,/g, "")),
    };
  },
};

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
