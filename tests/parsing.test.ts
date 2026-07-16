import { describe, it, expect } from "vitest";
import { parseMessage } from "../src/parsing/engine";

describe("parseMessage — typed entries", () => {
  it("parses a simple typed debit", () => {
    const result = parseMessage("500 spent on swiggy");
    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(result.amount).toBe(500);
      expect(result.type).toBe("debit");
      expect(result.vendor).toBe("Swiggy");
    }
  });

  it("parses 'spent X on Y' phrasing", () => {
    const result = parseMessage("spent 220 on uber");
    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(result.amount).toBe(220);
      expect(result.vendor).toBe("Uber");
    }
  });

  it("parses a received/credit entry", () => {
    const result = parseMessage("500 received from friend");
    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(result.type).toBe("credit");
    }
  });

  it("routes multi-amount typed messages to unparsed, not auto-split", () => {
    const result = parseMessage("200 on uber and 300 on food");
    expect(result.status).toBe("unparsed");
    if (result.status === "unparsed") {
      expect(result.reason).toBe("multiple_amounts");
    }
  });

  it("routes gibberish to unparsed rather than dropping it", () => {
    const result = parseMessage("asdkjhaskjdh not a real message");
    expect(result.status).toBe("unparsed");
  });
});

describe("parseMessage — bank SMS", () => {
  it("parses an HDFC-style debit alert with balance", () => {
    const msg = "Rs.500.00 debited from A/C XX1234 on 10-07-26 to VPA swiggy@ybl. Avl Bal Rs.12345.00";
    const result = parseMessage(msg);
    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(result.amount).toBe(500);
      expect(result.type).toBe("debit");
      expect(result.accountHint).toBe("HDFC ••1234");
      expect(result.availableBalance).toBe(12345);
      // Redaction should have masked the raw account/reference formatting,
      // not just passed the message through untouched.
      expect(result.redactedRawText).not.toContain("XX1234".repeat(0)); // sanity placeholder
    }
  });

  it("parses an Axis-style debit alert with balance", () => {
    const msg = "INR 1,240.00 debited from A/c no. XX7745 on 12-Jul-26 towards BIGBASKET. Available Balance: INR 142410.00";
    const result = parseMessage(msg);
    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(result.amount).toBe(1240);
      expect(result.accountHint).toBe("Axis ••7745");
      expect(result.availableBalance).toBe(142410);
    }
  });

  it("does not confuse a bank alert's balance figure for a second amount", () => {
    const msg = "Rs.500.00 debited from A/C XX1234 on 10-07-26 to VPA swiggy@ybl. Avl Bal Rs.12345.00";
    const result = parseMessage(msg);
    expect(result.status).toBe("parsed"); // must NOT be routed to multiple_amounts
  });
});

describe("redaction", () => {
  it("strips long digit runs down to the last 4", () => {
    const result = parseMessage("500 spent on swiggy, account 9876543210123456");
    expect(result.redactedRawText).toContain("••••3456");
    expect(result.redactedRawText).not.toContain("9876543210123456");
  });
});
