import type { ParseTemplate, ParsedTransaction } from "../types";

// Example shape (real HDFC wording varies — this is a starting template to
// refine against real, redacted messages once we have them; see the
// Technical Architecture doc's open risks):
//   "Rs.500.00 debited from A/C XX1234 on 10-07-26 to VPA swiggy@ybl. Avl Bal Rs.12345.00"
//   "Rs.95000.00 credited to A/C XX1234 on 13-07-26 by NEFT. Avl Bal Rs.107345.00"
const HDFC_PATTERN =
  /rs\.?\s*([\d,]+\.\d{2})\s*(debited|credited)\s*(?:from|to)?\s*a\/c\s*(?:no\.?\s*)?(?:xx|x{2,})?(\d{2,6})\s*on\s*[\d\-a-z]+\s*(?:to|by|towards)?\s*(?:vpa\s*)?([a-z0-9@.\s]*?)\.?\s*avl\.?\s*bal\.?\s*rs\.?\s*([\d,]+\.\d{2})/i;

export const hdfcTemplate: ParseTemplate = {
  name: "hdfc",

  looksLikeMatch(message: string): boolean {
    return /a\/c/i.test(message) && /avl\.?\s*bal/i.test(message) && /rs\.?\s*[\d,]+\.\d{2}/i.test(message);
  },

  parse(message: string): ParsedTransaction | null {
    const match = message.match(HDFC_PATTERN);
    if (!match) return null;

    const [, amountStr, direction, acctLast4, vendorRaw, balanceStr] = match;
    const vendor = cleanVendor(vendorRaw);

    return {
      status: "parsed",
      amount: parseFloat(amountStr.replace(/,/g, "")),
      type: direction.toLowerCase() === "debited" ? "debit" : "credit",
      vendor: vendor || null,
      redactedRawText: message, // redaction happens centrally in redact.ts before this is stored
      accountHint: `HDFC ••${acctLast4}`,
      availableBalance: parseFloat(balanceStr.replace(/,/g, "")),
    };
  },
};

function cleanVendor(raw: string): string {
  return raw
    .replace(/@[\w.]+/g, "") // strip UPI handle suffix like "@ybl"
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
