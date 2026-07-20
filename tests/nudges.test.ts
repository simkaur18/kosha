import { describe, it, expect } from "vitest";
import {
  istDateKey,
  istMonthKey,
  isFirstOfIstMonth,
  previousMonthKey,
  monthLabelFor,
  spentOnDate,
  unparsedCountOnDate,
  buildDailyNudgeText,
  buildMonthlyNudgeText,
} from "../src/nudges";
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

describe("IST date helpers", () => {
  it("shifts a UTC timestamp forward into IST", () => {
    // 20:00 UTC on the 14th is 01:30 IST on the 15th.
    expect(istDateKey("2026-07-14T20:00:00.000Z")).toBe("2026-07-15");
  });

  it("keeps the same day when the IST shift doesn't cross midnight", () => {
    expect(istDateKey("2026-07-14T10:00:00.000Z")).toBe("2026-07-14");
  });

  it("derives the month key from the IST date", () => {
    expect(istMonthKey("2026-07-14T20:00:00.000Z")).toBe("2026-07");
  });

  it("detects the 1st of the month in IST even when UTC is still the last day of the prior month", () => {
    // 19:00 UTC on June 30 is 00:30 IST on July 1.
    expect(isFirstOfIstMonth("2026-06-30T19:00:00.000Z")).toBe(true);
  });

  it("is false on any other day", () => {
    expect(isFirstOfIstMonth("2026-07-14T10:00:00.000Z")).toBe(false);
  });
});

describe("previousMonthKey", () => {
  it("steps back a month within the same year", () => {
    expect(previousMonthKey("2026-07")).toBe("2026-06");
  });

  it("wraps back across a year boundary", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
  });
});

describe("monthLabelFor", () => {
  it("formats a month key as a readable label", () => {
    expect(monthLabelFor("2026-07")).toBe("July 2026");
  });
});

describe("spentOnDate / unparsedCountOnDate", () => {
  it("sums only parsed debits on the given IST date", () => {
    const txns = [
      txn({ amount: 300, date: "2026-07-14T10:00:00.000Z" }),
      txn({ amount: 200, date: "2026-07-14T20:00:00.000Z" }), // shifts to the 15th in IST
      txn({ amount: 999, type: "credit", date: "2026-07-14T10:00:00.000Z" }),
      txn({ amount: 999, status: "unparsed", date: "2026-07-14T10:00:00.000Z" }),
    ];
    expect(spentOnDate(txns, "2026-07-14")).toBe(300);
  });

  it("counts unparsed messages on the given IST date", () => {
    const txns = [
      txn({ status: "unparsed", date: "2026-07-14T10:00:00.000Z" }),
      txn({ status: "unparsed", date: "2026-07-13T10:00:00.000Z" }),
    ];
    expect(unparsedCountOnDate(txns, "2026-07-14")).toBe(1);
  });
});

describe("buildDailyNudgeText", () => {
  it("reports zero spend plainly", () => {
    expect(buildDailyNudgeText(0, 0)).toBe(
      "Evening check-in — No spends logged today. Anything you paid cash for that's not logged yet? Just type it in."
    );
  });

  it("reports spend and singular unparsed count correctly", () => {
    const text = buildDailyNudgeText(480, 1);
    expect(text).toContain("₹480 today");
    expect(text).toContain("1 message needs a look in /review.");
  });

  it("uses plural phrasing for more than one unparsed message", () => {
    const text = buildDailyNudgeText(480, 3);
    expect(text).toContain("3 messages need a look in /review.");
  });
});

describe("buildMonthlyNudgeText", () => {
  it("returns null when nothing was spent last month", () => {
    expect(buildMonthlyNudgeText("June 2026", 0, null)).toBe(null);
  });

  it("includes the top category when there is one", () => {
    const text = buildMonthlyNudgeText("June 2026", 39000, { category: "Food", amount: 8000 });
    expect(text).toContain("June 2026 closed out at ₹39,000 spent, mostly on Food.");
  });

  it("omits the category clause when there isn't one", () => {
    const text = buildMonthlyNudgeText("June 2026", 39000, null);
    expect(text).toBe("📅 June 2026 closed out at ₹39,000 spent. Fresh month, fresh start!");
  });
});
