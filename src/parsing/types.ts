export type TxnType = "debit" | "credit";
export type Source = "typed" | "pasted" | "auto";

export interface ParsedTransaction {
  status: "parsed";
  amount: number;
  type: TxnType;
  vendor: string | null;
  redactedRawText: string;
  accountHint: string | null; // e.g. "HDFC" — bank name detected in the message, if any
  availableBalance: number | null; // present if the message included one
}

export interface UnparsedMessage {
  status: "unparsed";
  redactedRawText: string;
  reason: "no_template_matched" | "multiple_amounts";
}

export type ParseResult = ParsedTransaction | UnparsedMessage;

export interface ParseTemplate {
  name: string;
  /** Cheap pre-check so the engine doesn't run every regex on every message. */
  looksLikeMatch(message: string): boolean;
  /** Full parse attempt. Return null if it turns out not to match after all. */
  parse(message: string): ParsedTransaction | null;
}
