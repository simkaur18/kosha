import type { ParseResult, ParseTemplate } from "./types";
import { redactSensitive } from "./redact";
import { hdfcTemplate } from "./templates/hdfc";
import { hdfcCardTemplate } from "./templates/hdfc-card";
import { iciciCardTemplate } from "./templates/icici-card";
import { iciciAccountTemplate } from "./templates/icici-account";
import { axisTemplate } from "./templates/axis";
import { typedTemplate } from "./templates/typed";

const TEMPLATES: ParseTemplate[] = [
  hdfcTemplate,
  hdfcCardTemplate,
  iciciCardTemplate,
  iciciAccountTemplate,
  axisTemplate,
  typedTemplate,
];

function hasMultipleAmountClauses(message: string): boolean {
  const isBankAlert =
    /a\/c|avl\.?\s*bal|available\s*balance|hdfc\s*bank\s*card|txn\s*rs\.?\s*[\d,]+\.\d{2}|icici\s*bank\s*(card|acc)|avl\.?\s*limit|av[bl]\.?\s*bal/i.test(
      message
    );
  if (isBankAlert) return false;

  const clauses = message.split(/\band\b/i);
  if (clauses.length < 2) return false;

  const amountLikeClauses = clauses.filter((clause) => /\d+(?:\.\d{1,2})?/.test(clause));
  return amountLikeClauses.length >= 2;
}

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
