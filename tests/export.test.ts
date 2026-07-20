import { describe, it, expect } from "vitest";
import { buildExportCsv, type ExportTxnRow, type ExportAccountRow } from "../src/export";

function txn(overrides: Partial<ExportTxnRow>): ExportTxnRow {
  return {
    date: "2026-07-14T10:00:00.000Z",
    type: "debit",
    amount: 500,
    vendor: "Swiggy",
    category: "Food",
    source: "typed",
    status: "parsed",
    accountId: null,
    redactedRawText: "500 spent on swiggy",
    ...overrides,
  };
}

const accounts: ExportAccountRow[] = [{ id: "hdfc", bankName: "HDFC", maskedIdentifier: "1234" }];

describe("buildExportCsv", () => {
  it("includes the header row", () => {
    const csv = buildExportCsv([], []);
    expect(csv.split("\r\n")[0]).toBe(
      "Date,Type,Amount,Vendor,Category,Account,Status,Source,Original message (redacted)"
    );
  });

  it("produces just the header when there are no transactions", () => {
    expect(buildExportCsv([], [])).toBe(
      "Date,Type,Amount,Vendor,Category,Account,Status,Source,Original message (redacted)\r\n"
    );
  });

  it("resolves the account label from the accounts list", () => {
    const csv = buildExportCsv([txn({ accountId: "hdfc" })], accounts);
    expect(csv).toContain("HDFC ••1234");
  });

  it("leaves the account column blank when there's no linked account", () => {
    const csv = buildExportCsv([txn({ accountId: null })], []);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toContain(",,parsed,typed,");
  });

  it("leaves amount blank for unparsed rows instead of showing a fake 0", () => {
    const csv = buildExportCsv([txn({ status: "unparsed", amount: 0, vendor: null, category: null })], []);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine.startsWith("2026-07-14T10:00:00.000Z,debit,,,,")).toBe(true);
  });

  it("sorts chronologically, oldest first", () => {
    const csv = buildExportCsv(
      [txn({ date: "2026-07-14T10:00:00.000Z", vendor: "Later" }), txn({ date: "2026-07-01T10:00:00.000Z", vendor: "Earlier" })],
      []
    );
    const lines = csv.split("\r\n");
    expect(lines[1].includes("Earlier")).toBe(true);
    expect(lines[2].includes("Later")).toBe(true);
  });

  it("quotes and escapes a redacted message containing a comma", () => {
    const csv = buildExportCsv([txn({ redactedRawText: "500 spent on swiggy, account ••••3456" })], []);
    expect(csv).toContain('"500 spent on swiggy, account ••••3456"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    const csv = buildExportCsv([txn({ vendor: 'The "Best" Cafe' })], []);
    expect(csv).toContain('"The ""Best"" Cafe"');
  });
});
