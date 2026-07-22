import { describe, it, expect } from "vitest";
import { findRefundCandidate, relativeDayLabel, buildRefundPromptText, parseYesNo } from "../src/refunds";
import type { TxnRow } from "../src/dashboard-data";

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

describe("findRefundCandidate", () => {
  it("matches a same-amount, same-vendor debit within the window", () => {
    const debit = txn({ id: "d1", amount: 480, vendor: "Swiggy", date: "2026-07-12T10:00:00.000Z" });
    const candidate = findRefundCandidate([debit], {
      amount: 480,
      vendor: "Swiggy",
      date: "2026-07-14T10:00:00.000Z",
    });
    expect(candidate?.id).toBe("d1");
  });

  it("matches loosely on vendor wording (gateway name vs merchant name)", () => {
    const debit = txn({ id: "d1", amount: 480, vendor: "Swiggy", date: "2026-07-12T10:00:00.000Z" });
    const candidate = findRefundCandidate([debit], {
      amount: 480,
      vendor: "SWIGGY BANGALORE",
      date: "2026-07-14T10:00:00.000Z",
    });
    expect(candidate?.id).toBe("d1");
  });

  it("requires an exact amount match, not just close", () => {
    const debit = txn({ id: "d1", amount: 480, vendor: "Swiggy", date: "2026-07-12T10:00:00.000Z" });
    const candidate = findRefundCandidate([debit], {
      amount: 479,
      vendor: "Swiggy",
      date: "2026-07-14T10:00:00.000Z",
    });
    expect(candidate).toBe(null);
  });

  it("ignores debits outside the refund window", () => {
    const debit = txn({ id: "d1", amount: 480, vendor: "Swiggy", date: "2026-06-01T10:00:00.000Z" });
    const candidate = findRefundCandidate([debit], {
      amount: 480,
      vendor: "Swiggy",
      date: "2026-07-14T10:00:00.000Z",
    });
    expect(candidate).toBe(null);
  });

  it("ignores unparsed and non-debit rows", () => {
    const rows = [
      txn({ id: "d1", amount: 480, vendor: "Swiggy", status: "unparsed", date: "2026-07-12T10:00:00.000Z" }),
      txn({ id: "d2", amount: 480, vendor: "Swiggy", type: "credit", date: "2026-07-12T10:00:00.000Z" }),
    ];
    const candidate = findRefundCandidate(rows, {
      amount: 480,
      vendor: "Swiggy",
      date: "2026-07-14T10:00:00.000Z",
    });
    expect(candidate).toBe(null);
  });

  it("picks the most recent match when more than one debit qualifies", () => {
    const older = txn({ id: "d1", amount: 480, vendor: "Swiggy", date: "2026-07-08T10:00:00.000Z" });
    const newer = txn({ id: "d2", amount: 480, vendor: "Swiggy", date: "2026-07-13T10:00:00.000Z" });
    const candidate = findRefundCandidate([older, newer], {
      amount: 480,
      vendor: "Swiggy",
      date: "2026-07-14T10:00:00.000Z",
    });
    expect(candidate?.id).toBe("d2");
  });

  it("never matches a future credit against a debit that hasn't happened yet", () => {
    const debit = txn({ id: "d1", amount: 480, vendor: "Swiggy", date: "2026-07-20T10:00:00.000Z" });
    const candidate = findRefundCandidate([debit], {
      amount: 480,
      vendor: "Swiggy",
      date: "2026-07-14T10:00:00.000Z",
    });
    expect(candidate).toBe(null);
  });
});

describe("relativeDayLabel", () => {
  it("labels the same IST day as today", () => {
    expect(relativeDayLabel("2026-07-14T08:00:00.000Z", "2026-07-14T16:00:00.000Z")).toBe("today");
  });

  it("labels the previous IST day as yesterday", () => {
    expect(relativeDayLabel("2026-07-13T08:00:00.000Z", "2026-07-14T08:00:00.000Z")).toBe("yesterday");
  });

  it("names the weekday within the last week", () => {
    // 2026-07-12 is a Sunday.
    expect(relativeDayLabel("2026-07-12T08:00:00.000Z", "2026-07-16T08:00:00.000Z")).toBe("Sunday");
  });

  it("falls back to a short date beyond a week", () => {
    expect(relativeDayLabel("2026-06-01T08:00:00.000Z", "2026-07-14T08:00:00.000Z")).toMatch(/Jun/);
  });
});

describe("buildRefundPromptText", () => {
  it("matches the Bot Conversation Design sample copy shape", () => {
    const debit = txn({ amount: 480, vendor: "Swiggy", date: "2026-07-12T08:00:00.000Z" }); // a Sunday
    const text = buildRefundPromptText(debit, "2026-07-16T08:00:00.000Z");
    expect(text).toBe(
      "This looks like a refund for the ₹480 Swiggy order from Sunday — want me to net it against " +
        "that expense instead of counting it as new income? Reply yes or no."
    );
  });
});

describe("parseYesNo", () => {
  it("recognizes common yes variants", () => {
    expect(parseYesNo("yes")).toBe("yes");
    expect(parseYesNo("Y")).toBe("yes");
    expect(parseYesNo(" yeah ")).toBe("yes");
  });

  it("recognizes common no variants", () => {
    expect(parseYesNo("no")).toBe("no");
    expect(parseYesNo("N")).toBe("no");
    expect(parseYesNo("nope")).toBe("no");
  });

  it("returns null for anything ambiguous", () => {
    expect(parseYesNo("maybe")).toBe(null);
    expect(parseYesNo("₹250 debit swiggy")).toBe(null);
  });
});
