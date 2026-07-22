// Manual /investments entry (PRD, P1: "SIP/RD tracking", "FD tracking") —
// the lighter-weight sibling of the CAS PDF import for anything CAS doesn't
// cover (RDs, FDs) or when someone would rather just type a number than dig
// out their CAS.
//
// The exact command shape isn't specified anywhere in the PRD/Bot
// Conversation Design (those docs only cover CAS setup) — this is designed
// from scratch, matching the rest of the bot's single-message,
// space-separated-args style (see /fix, /discard in bot.ts) rather than a
// multi-turn guided conversation.
import type { InvestmentRow, InvestmentType } from "./dashboard-data";
import { effectiveCurrentValue } from "./dashboard-data";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const INVESTMENTS_USAGE =
  "Usage:\n" +
  "/investments add sip <name> <invested|-> <current>\n" +
  "/investments add stock <name> <invested|-> <current>\n" +
  "/investments add rd <name> <invested|-> <current>\n" +
  "/investments add fd <name> <amount> <rate%> <maturity YYYY-MM-DD>\n" +
  "/investments update <type> <name> ... (same shape as add)\n" +
  "/investments remove <type> <name>\n\n" +
  'Use "-" for invested amount if you don\'t know/track it (e.g. a stock\'s cost basis).';

export type InvestmentAction =
  | { kind: "add" | "update"; type: "sip" | "stock" | "rd"; name: string; investedAmount: number | null; currentValue: number }
  | { kind: "add" | "update"; type: "fd"; name: string; principal: number; interestRate: number; maturityDate: string }
  | { kind: "remove"; type: InvestmentType; name: string };

export interface InvestmentCommandError {
  error: string;
}

function isInvestmentType(t: string): t is InvestmentType {
  return t === "sip" || t === "stock" || t === "fd" || t === "rd";
}

export function parseInvestmentCommand(payload: string): InvestmentAction | InvestmentCommandError {
  const tokens = payload.trim().split(/\s+/).filter(Boolean);
  const verb = (tokens[0] ?? "").toLowerCase();
  const typeToken = (tokens[1] ?? "").toLowerCase();
  const rest = tokens.slice(2);

  if (verb !== "add" && verb !== "update" && verb !== "remove") return { error: INVESTMENTS_USAGE };
  if (!isInvestmentType(typeToken)) return { error: INVESTMENTS_USAGE };

  if (verb === "remove") {
    const name = rest.join(" ").trim();
    if (!name) return { error: `Usage: /investments remove ${typeToken} <name>` };
    return { kind: "remove", type: typeToken, name };
  }

  if (typeToken === "fd") {
    if (rest.length < 4) {
      return { error: `Usage: /investments ${verb} fd <name> <amount> <rate%> <maturity YYYY-MM-DD>` };
    }
    const maturityDate = rest[rest.length - 1];
    const rateStr = rest[rest.length - 2];
    const amountStr = rest[rest.length - 3];
    const name = rest.slice(0, rest.length - 3).join(" ").trim();

    if (!DATE_RE.test(maturityDate)) return { error: `"${maturityDate}" doesn't look like a date — use YYYY-MM-DD` };
    const principal = parseFloat(amountStr.replace(/,/g, ""));
    const interestRate = parseFloat(rateStr.replace(/%/g, ""));
    if (!Number.isFinite(principal) || principal <= 0) return { error: `"${amountStr}" doesn't look like a valid amount` };
    if (!Number.isFinite(interestRate) || interestRate <= 0) return { error: `"${rateStr}" doesn't look like a valid interest rate` };
    if (!name) return { error: 'Give the FD a name, e.g. "HDFC FD"' };

    return { kind: verb, type: "fd", name, principal, interestRate, maturityDate };
  }

  if (rest.length < 3) {
    return { error: `Usage: /investments ${verb} ${typeToken} <name> <invested|-> <current>` };
  }
  const currentStr = rest[rest.length - 1];
  const investedStr = rest[rest.length - 2];
  const name = rest.slice(0, rest.length - 2).join(" ").trim();

  const currentValue = parseFloat(currentStr.replace(/,/g, ""));
  const investedAmount = investedStr === "-" ? null : parseFloat(investedStr.replace(/,/g, ""));
  if (!Number.isFinite(currentValue) || currentValue < 0) return { error: `"${currentStr}" doesn't look like a valid amount` };
  if (investedAmount !== null && !Number.isFinite(investedAmount)) return { error: `"${investedStr}" doesn't look like a valid amount` };
  if (!name) return { error: "Give it a name" };

  return { kind: verb, type: typeToken, name, investedAmount, currentValue };
}

const TYPE_LABELS: Record<InvestmentType, string> = {
  sip: "SIPs / Mutual Funds",
  stock: "Stocks",
  fd: "FDs",
  rd: "RDs",
};

export function formatInvestmentsList(rows: InvestmentRow[], nowIso: string): string {
  if (rows.length === 0) {
    return (
      "No investments tracked yet.\n\n" +
      INVESTMENTS_USAGE +
      "\n\nOr upload your CAS PDF from the dashboard to import SIPs/stocks automatically."
    );
  }

  const byType: Record<InvestmentType, InvestmentRow[]> = { sip: [], stock: [], fd: [], rd: [] };
  for (const r of rows) byType[r.type].push(r);

  const lines: string[] = [];
  let total = 0;

  for (const type of ["sip", "stock", "fd", "rd"] as InvestmentType[]) {
    if (byType[type].length === 0) continue;
    lines.push(`${TYPE_LABELS[type]}:`);
    for (const r of byType[type]) {
      const value = effectiveCurrentValue(r, nowIso);
      total += value;
      const extra = type === "fd" && r.maturityDate ? ` (matures ${r.maturityDate})` : "";
      lines.push(`  ${r.name}: ₹${Math.round(value).toLocaleString("en-IN")}${extra}`);
    }
  }

  lines.push("", `Total: ₹${Math.round(total).toLocaleString("en-IN")}`);
  return lines.join("\n");
}
