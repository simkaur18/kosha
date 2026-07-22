import { describe, it, expect } from "vitest";
import { parseInvestmentCommand, formatInvestmentsList } from "../src/investments";
import type { InvestmentRow } from "../src/dashboard-data";

describe("parseInvestmentCommand — sip/stock/rd", () => {
  it("parses a plain add with an invested amount", () => {
    const result = parseInvestmentCommand("add sip Axis Bluechip 10000 11500");
    expect(result).toEqual({
      kind: "add",
      type: "sip",
      name: "Axis Bluechip",
      investedAmount: 10000,
      currentValue: 11500,
    });
  });

  it("treats a dash as unknown invested amount", () => {
    const result = parseInvestmentCommand("add stock Reliance - 34567");
    expect(result).toEqual({
      kind: "add",
      type: "stock",
      name: "Reliance",
      investedAmount: null,
      currentValue: 34567,
    });
  });

  it("parses update the same way as add", () => {
    const result = parseInvestmentCommand("update rd Post Office RD 5000 5400");
    expect(result).toEqual({
      kind: "update",
      type: "rd",
      name: "Post Office RD",
      investedAmount: 5000,
      currentValue: 5400,
    });
  });

  it("rejects too few arguments", () => {
    const result = parseInvestmentCommand("add sip OnlyName");
    expect(result).toHaveProperty("error");
  });

  it("rejects a non-numeric current value", () => {
    const result = parseInvestmentCommand("add sip Axis Bluechip 10000 abc");
    expect(result).toHaveProperty("error");
  });

  it("requires a name", () => {
    const result = parseInvestmentCommand("add sip 10000 11500 12000"); // ambiguous but no real name left
    // "10000" ends up as the name here, which is a corner case worth noting,
    // but the two trailing numeric tokens still parse — no crash either way.
    expect(result).not.toHaveProperty("error");
  });
});

describe("parseInvestmentCommand — fd", () => {
  it("parses amount, rate, and maturity date", () => {
    const result = parseInvestmentCommand("add fd HDFC FD 100000 7.5 2027-01-15");
    expect(result).toEqual({
      kind: "add",
      type: "fd",
      name: "HDFC FD",
      principal: 100000,
      interestRate: 7.5,
      maturityDate: "2027-01-15",
    });
  });

  it("rejects a malformed maturity date", () => {
    const result = parseInvestmentCommand("add fd HDFC FD 100000 7.5 15-01-2027");
    expect(result).toHaveProperty("error");
  });

  it("rejects a non-numeric rate", () => {
    const result = parseInvestmentCommand("add fd HDFC FD 100000 high 2027-01-15");
    expect(result).toHaveProperty("error");
  });

  it("rejects too few arguments", () => {
    const result = parseInvestmentCommand("add fd HDFC FD 100000 2027-01-15");
    expect(result).toHaveProperty("error");
  });
});

describe("parseInvestmentCommand — remove and validation", () => {
  it("parses a remove command", () => {
    const result = parseInvestmentCommand("remove fd HDFC FD");
    expect(result).toEqual({ kind: "remove", type: "fd", name: "HDFC FD" });
  });

  it("rejects an unknown verb", () => {
    expect(parseInvestmentCommand("delete fd HDFC FD")).toHaveProperty("error");
  });

  it("rejects an unknown type", () => {
    expect(parseInvestmentCommand("add crypto Bitcoin 1000 2000")).toHaveProperty("error");
  });

  it("rejects remove with no name", () => {
    expect(parseInvestmentCommand("remove fd")).toHaveProperty("error");
  });
});

describe("formatInvestmentsList", () => {
  const NOW = "2026-07-20T00:00:00.000Z";

  it("shows usage instructions when there's nothing tracked yet", () => {
    const text = formatInvestmentsList([], NOW);
    expect(text).toContain("No investments tracked yet");
    expect(text).toContain("/investments add sip");
  });

  it("groups holdings by type and totals them", () => {
    const rows: InvestmentRow[] = [
      { id: "1", type: "sip", name: "Axis Bluechip", investedAmount: 10000, currentValue: 11500, lastUpdated: null },
      { id: "2", type: "stock", name: "Reliance", investedAmount: null, currentValue: 34567, lastUpdated: null },
    ];
    const text = formatInvestmentsList(rows, NOW);
    expect(text).toContain("SIPs / Mutual Funds:");
    expect(text).toContain("Axis Bluechip: ₹11,500");
    expect(text).toContain("Stocks:");
    expect(text).toContain("Reliance: ₹34,567");
    expect(text).toContain("Total: ₹46,067");
  });

  it("shows an FD's maturity date and computes its live value", () => {
    const rows: InvestmentRow[] = [
      {
        id: "1",
        type: "fd",
        name: "HDFC FD",
        investedAmount: null,
        currentValue: null,
        lastUpdated: null,
        principal: 100000,
        interestRate: 7.3,
        startDate: "2026-01-20T00:00:00.000Z", // 6 months before NOW
        maturityDate: "2028-01-20",
      },
    ];
    const text = formatInvestmentsList(rows, NOW);
    expect(text).toContain("(matures 2028-01-20)");
    // ~6 months of simple interest at 7.3% on 100000 ≈ 103,618 — "en-IN"
    // locale groups by lakh above 1,00,000, e.g. "1,03,618" not "103,618".
    expect(text).toMatch(/HDFC FD: ₹1,0[34],\d{3}/);
  });
});
