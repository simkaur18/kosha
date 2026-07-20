import type { ParseResult, ParseTemplate } from "./types";
import { redactSensitive } from "./redact";
import { hdfcTemplate } from "./templates/hdfc";
import { axisTemplate } from "./templates/axis";
import { typedTemplate } from "./templates/typed";

// Bank templates are tried before the generic typed template, since a bank
// alert could otherwise loosely match the typed pattern too.
const TEMPLATES: ParseTemplate[] = [hdfcTemplate, axisTemplate, typedTemplate];

/**
 * Catches typed multi-expense messages like "200 on uber and 300 on food" —
 * per the PRD, these are routed to "unparsed" rather than auto-split or
 * guessed at. Bank alerts aren't affected: their balance figure is captured
 * through its own labeled field (Avl Bal / Available Balance), not counted
 * here.
 */
function hasMultipleAmountClauses(message: string): boolean {
  const isBankAlert = /a\/c|avl\.?\s*bal|available\s*balance/i.test(message);
  if (isBankAlert) return false;

  const clauses = message.split(/\band\b/i);
  if (clauses.length < 2) return false;

  const amountLikeClauses = clauses.filter((clause) => /\d+(?:\.\d{1,2})?/.test(clause));
  return amountLikeClauses.length >= 2;
}

/**
 * Runs a raw message (typed or pasted) through the parsing pipeline.
 * Never throws — anything it can't confidently handle comes back as
 * "unparsed" so nothing is silently dropped (per the PRD).
 */
export function parseMessage(rawMessage: string): ParseResult {
  const trimmed = rawMessage.trim();

  if (hasMultipleAmountClauses(trimmed)) {
    return {
      status: "unparsed",
      redactedRawText: redactSensitive(trimmed),
      reason: "multiple_amounts",
    };
  }

  for (const template of TEMPLATES) {
    if (!template.looksLikeMatch(trimmed)) continue;
    const result = template.parse(trimmed);
    if (result) {
      return { ...result, redactedRawText: redactSensitive(result.redactedRawText) };
    }
  }

  return {
    status: "unparsed",
    redactedRawText: redactSensitive(trimmed),
    reason: "no_template_matched",
  };
}
