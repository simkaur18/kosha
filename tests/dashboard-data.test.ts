import { describe, it, expect } from "vitest";
import {
  getAvailableMonths,
  totalBalance,
  spentInMonth,
  incomeInMonth,
  unparsedCount,
  categoryBreakdown,
  topMerchants,
  monthlyTrend,
  recentTransactions,
  buildDashboardPayload,
  investmentTotalsByType,
  investmentTypesPresent,
  netWorth,
  investmentsAsOf,
  type TxnRow,
  type AccountRow,
  type InvestmentRow,
} from "../src/dashboard-data";

const NOW = "2026-07-20T12:00:00.000Z";

function txn(overrides: Partial<TxnRow>): TxnRow {
  return {
    id: "t1",
    date: "2026-07-14T10:00:00.000Z",
    amount: 100,
    type: "debit",
    vendor: "Swiggy",
    category: "Food",
    source: "typed",
    status: "parsed",
    accountId: null,
    ...overrides,
  };
}

const accounts: AccountRow[] = [
  { id: "hdfc", bankName: "HDFC", maskedIdentifier: "2291", currentBalance: 241800 },
  { id: "axis", bankName: "Axis", maskedIdentifier: "7745", currentBalance: 142410 },
];

describe("getAvailableMonths", () => {
  it("includes the current month even with no transactions", () => {
    expect(getAvailableMonths([], NOW)).toEqual(["2026-07"]);
  });

  it("includes every distinct month present in transactions, sorted", () => {
    const txns = [txn({ date: "2026-05-01T00:00:00.000Z" }), txn({ date: "2026-06-01T00:00:00.000Z" })];
    expect(getAvailableMonths(txns, NOW)).toEqual(["2026-05", "2026-06", "2026-07"]);
  });
});

describe("totalBalance", () => {
  it("sums balances across accounts", () => {
    expect(totalBalance(accounts)).toBe(384210);
  });

  it("treats a null balance as zero", () => {
    expect(totalBalance([{ id: "a", bankName: "A", maskedIdentifier: null, currentBalance: null }])).toBe(0);
  });
});

describe("spentInMonth / incomeInMonth", () => {
  it("sums only parsed debits in the given month", () => {
    const txns = [
      txn({ amount: 500, type: "debit", date: "2026-07-01T00:00:00.000Z" }),
      txn({ amount: 300, type: "debit", date: "2026-07-02T00:00:00.000Z" }),
      txn({ amount: 999, type: "debit", date: "2026-06-01T00:00:00.000Z" }), // different month
      txn({ amount: 999, type: "debit", status: "unparsed" }), // unparsed excluded
      txn({ amount: 999, type: "credit" }), // credit excluded from spend
    ];
    expect(spentInMonth(txns, "2026-07")).toBe(800);
  });

  it("sums only parsed credits in the given month", () => {
    const txns = [txn({ amount: 95000, type: "credit", date: "2026-07-13T00:00:00.000Z" })];
    expect(incomeInMonth(txns, "2026-07")).toBe(95000);
  });
});

describe("unparsedCount", () => {
  it("counts unparsed messages in the given month only", () => {
    const txns = [
      txn({ status: "unparsed", date: "2026-07-01T00:00:00.000Z" }),
      txn({ status: "unparsed", date: "2026-07-02T00:00:00.000Z" }),
      txn({ status: "unparsed", date: "2026-06-01T00:00:00.000Z" }),
      txn({ status: "parsed" }),
    ];
    expect(unparsedCount(txns, "2026-07")).toBe(2);
  });
});

describe("categoryBreakdown", () => {
  it("sums spend per category, sorted descending", () => {
    const txns = [
      txn({ category: "Food", amount: 400 }),
      txn({ category: "Food", amount: 100 }),
      txn({ category: "Transport", amount: 900 }),
    ];
    expect(categoryBreakdown(txns, "2026-07")).toEqual([
      { category: "Transport", amount: 900 },
      { category: "Food", amount: 500 },
    ]);
  });

  it("buckets uncategorized spend rather than dropping it", () => {
    const txns = [txn({ category: null, amount: 200 })];
    expect(categoryBreakdown(txns, "2026-07")).toEqual([{ category: "Uncategorized", amount: 200 }]);
  });
});

describe("topMerchants", () => {
  it("sums spend per vendor, sorted descending, respecting the limit", () => {
    const txns = [
      txn({ vendor: "Swiggy", amount: 300 }),
      txn({ vendor: "Swiggy", amount: 200 }),
      txn({ vendor: "Uber", amount: 800 }),
      txn({ vendor: "Amazon", amount: 100 }),
    ];
    expect(topMerchants(txns, "2026-07", 2)).toEqual([
      { vendor: "Uber", amount: 800 },
      { vendor: "Swiggy", amount: 500 },
    ]);
  });

  it("skips transactions with no vendor rather than grouping them together", () => {
    const txns = [txn({ vendor: null, amount: 500 })];
    expect(topMerchants(txns, "2026-07")).toEqual([]);
  });
});

describe("monthlyTrend", () => {
  it("returns exactly N months ending at the reference month, in order", () => {
    const trend = monthlyTrend([], "2026-07", 6);
    expect(trend.map((m) => m.month)).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
  });

  it("wraps correctly across a year boundary", () => {
    const trend = monthlyTrend([], "2026-02", 4);
    expect(trend.map((m) => m.month)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("recentTransactions", () => {
  it("sorts most recent first and resolves account bank names", () => {
    const txns = [
      txn({ id: "a", date: "2026-07-01T00:00:00.000Z", accountId: "hdfc" }),
      txn({ id: "b", date: "2026-07-05T00:00:00.000Z", accountId: "axis" }),
    ];
    const result = recentTransactions(txns, accounts);
    expect(result[0].bankName).toBe("Axis");
    expect(result[1].bankName).toBe("HDFC");
  });

  it("labels an unparsed message with no vendor as 'Unrecognised' rather than blank", () => {
    const result = recentTransactions([txn({ vendor: null, status: "unparsed" })], accounts);
    expect(result[0].vendor).toBe("Unrecognised");
  });
});

describe("buildDashboardPayload", () => {
  it("defaults to the most recent available month when none is requested", () => {
    const payload = buildDashboardPayload([], accounts, NOW);
    expect(payload.month).toBe("2026-07");
  });

  it("falls back to the default month if an out-of-range month is requested", () => {
    const payload = buildDashboardPayload([], accounts, NOW, "1999-01");
    expect(payload.month).toBe("2026-07");
  });

  it("honors a valid requested month", () => {
    const txns = [txn({ date: "2026-06-01T00:00:00.000Z" })];
    const payload = buildDashboardPayload(txns, accounts, NOW, "2026-06");
    expect(payload.month).toBe("2026-06");
  });

  it("computes total balance from accounts regardless of selected month", () => {
    const payload = buildDashboardPayload([], accounts, NOW);
    expect(payload.totalBalance).toBe(384210);
  });

  it("defaults investment fields sensibly when none are passed", () => {
    const payload = buildDashboardPayload([], accounts, NOW);
    expect(payload.netWorth).toBe(384210); // just the bank balance
    expect(payload.investmentTotals).toEqual({ sip: 0, stock: 0, fd: 0, rd: 0 });
    expect(payload.investmentTypesPresent).toEqual({ sip: false, stock: false, fd: false, rd: false });
    expect(payload.investmentsAsOf).toBe(null);
  });

  it("folds real investments into net worth and totals", () => {
    const investments: InvestmentRow[] = [
      { id: "i1", type: "sip", name: "XYZ Bluechip Fund", investedAmount: 15000, currentValue: 19387, lastUpdated: "2026-07-10T00:00:00.000Z" },
      { id: "i2", type: "stock", name: "Reliance", investedAmount: null, currentValue: 34567, lastUpdated: "2026-07-12T00:00:00.000Z" },
    ];
    const payload = buildDashboardPayload([], accounts, NOW, undefined, investments);
    expect(payload.netWorth).toBe(384210 + 19387 + 34567);
    expect(payload.investmentTotals).toEqual({ sip: 19387, stock: 34567, fd: 0, rd: 0 });
    expect(payload.investmentTypesPresent).toEqual({ sip: true, stock: true, fd: false, rd: false });
    expect(payload.investmentsAsOf).toBe("2026-07-12T00:00:00.000Z");
  });
});

describe("investmentTotalsByType / investmentTypesPresent", () => {
  const investments: InvestmentRow[] = [
    { id: "i1", type: "sip", name: "Fund A", investedAmount: 1000, currentValue: 1200, lastUpdated: null },
    { id: "i2", type: "sip", name: "Fund B", investedAmount: 2000, currentValue: 1800, lastUpdated: null },
  ];

  it("sums current value per type, ignoring types with no rows", () => {
    expect(investmentTotalsByType(investments)).toEqual({ sip: 3000, stock: 0, fd: 0, rd: 0 });
  });

  it("only marks a type present if at least one row exists", () => {
    expect(investmentTypesPresent(investments)).toEqual({ sip: true, stock: false, fd: false, rd: false });
  });

  it("treats a null currentValue as zero rather than throwing", () => {
    const rows: InvestmentRow[] = [{ id: "i1", type: "fd", name: "HDFC FD", investedAmount: 50000, currentValue: null, lastUpdated: null }];
    expect(investmentTotalsByType(rows)).toEqual({ sip: 0, stock: 0, fd: 0, rd: 0 });
  });
});

describe("netWorth", () => {
  it("is just the bank balance when there are no investments", () => {
    expect(netWorth(accounts, [])).toBe(384210);
  });

  it("adds investments' current value, not invested amount", () => {
    const investments: InvestmentRow[] = [
      { id: "i1", type: "sip", name: "Fund A", investedAmount: 1000, currentValue: 1200, lastUpdated: null },
    ];
    expect(netWorth(accounts, investments)).toBe(384210 + 1200);
  });
});

describe("investmentsAsOf", () => {
  it("returns null when there are no investments", () => {
    expect(investmentsAsOf([])).toBe(null);
  });

  it("returns the most recent lastUpdated date across all investments", () => {
    const investments: InvestmentRow[] = [
      { id: "i1", type: "sip", name: "Fund A", investedAmount: 1000, currentValue: 1200, lastUpdated: "2026-06-01T00:00:00.000Z" },
      { id: "i2", type: "stock", name: "Reliance", investedAmount: null, currentValue: 5000, lastUpdated: "2026-07-10T00:00:00.000Z" },
    ];
    expect(investmentsAsOf(investments)).toBe("2026-07-10T00:00:00.000Z");
  });
});
