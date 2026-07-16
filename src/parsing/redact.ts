/**
 * Strips sensitive substrings (account numbers, reference/transaction IDs)
 * from a raw message before it's ever stored. Per the Decision Log: this
 * happens before storage, not after, and applies to every message regardless
 * of whether it parses successfully.
 */
export function redactSensitive(raw: string): string {
  let text = raw;

  // Account numbers shown masked already (e.g. "XX1234", "****1234") are fine
  // to keep as-is (that's how we identify the account) — but fully exposed
  // long digit runs (10+ digits, e.g. a full account or card number) get
  // masked down to the last 4 digits.
  text = text.replace(/\b\d{10,}\b/g, (match) => `••••${match.slice(-4)}`);

  // Reference / UTR / transaction ID numbers, e.g. "Ref No 123456789012" or
  // "UTR:ABCD1234EFGH" — redact the value, keep the label so the message
  // still reads sensibly.
  text = text.replace(
    /\b(ref(?:erence)?\.?\s*(?:no\.?)?|UTR|txn\s*id)\s*[:\-]?\s*[A-Za-z0-9]{6,}/gi,
    (_match, label) => `${label}: [redacted]`
  );

  return text;
}
