import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServiceResult } from "../server/service.mjs";

test("sample reconciliation reports real computed totals and excludes the duplicate", () => {
  const result = createServiceResult();
  assert.equal(result.sampleInput, true);
  assert.equal(result.service, "Invoice reconciliation");
  assert.deepEqual(result.report.summary, {
    inputRows: 5,
    uniqueInvoices: 4,
    duplicateRows: 1,
    invoiceUsdCents: "16500",
    paidUsdCents: "10200",
    dueUsdCents: "6800",
    overpaidUsdCents: "500",
    netDueUsdCents: "6300",
  });
  assert.deepEqual(
    result.report.invoices.map((row) => row.status),
    ["Paid", "Partially paid", "Unpaid", "Overpaid"],
  );
  assert.deepEqual(result.report.duplicates, [
    { invoiceId: "INV-0102", sourceRow: 3, keptRow: 2 },
  ]);
});

test("the content hash verifies exact report bytes and binds the sample inputs", () => {
  const result = createServiceResult();
  const reportHash = createHash("sha256")
    .update(JSON.stringify(result.report), "utf8")
    .digest("hex");
  const inputHash = createHash("sha256")
    .update(JSON.stringify(result.input), "utf8")
    .digest("hex");
  assert.equal(result.sha256, reportHash);
  assert.equal(result.report.inputSha256, inputHash);
  assert.deepEqual(createServiceResult(), result);
  const changed = structuredClone(result.input.rows);
  changed[0].paidUsdCents = "4199";
  assert.notEqual(createServiceResult(changed).sha256, result.sha256);
});

test("conflicting duplicate IDs cannot silently choose a different financial record", () => {
  assert.throws(
    () =>
      createServiceResult([
        { invoiceId: "INV-1", invoiceUsdCents: "100", paidUsdCents: "0" },
        { invoiceId: "INV-1", invoiceUsdCents: "100", paidUsdCents: "100" },
      ]),
    /Conflicting duplicate/,
  );
});

test("integer cents preserve tiny residuals and values above Number precision", () => {
  const rows = [
    {
      invoiceId: "INV-1",
      invoiceUsdCents: "999999999999999999",
      paidUsdCents: "999999999999999998",
    },
  ];
  const before = structuredClone(rows);
  const result = createServiceResult(rows);
  assert.equal(result.report.summary.dueUsdCents, "1");
  assert.equal(result.report.summary.invoiceUsdCents, "999999999999999999");
  assert.deepEqual(rows, before);
});

test("invalid, unbounded or ambiguous amounts fail instead of entering totals", () => {
  for (const value of [
    0,
    1.5,
    "1.5",
    "-1",
    "01",
    "1e2",
    "",
    "1000000000000000000",
  ]) {
    assert.throws(
      () =>
        createServiceResult([
          { invoiceId: "INV-1", invoiceUsdCents: value, paidUsdCents: "0" },
        ]),
      /integer USD-cent/,
    );
  }
  assert.throws(() => createServiceResult([]), /between one and 100/);
  assert.throws(
    () =>
      createServiceResult([
        {
          invoiceId: "INV-1",
          invoiceUsdCents: "1",
          paidUsdCents: "0",
          currency: "EUR",
        },
      ]),
    /Each ledger row/,
  );
});
