import { createHash } from "node:crypto";

// Explicit sample input for the isolated test merchant's actual reconciliation service.
// Amounts are integer USD cents, separate from Quote Bond's test-token payment terms.
const SAMPLE_LEDGER = [
  { invoiceId: "INV-0101", invoiceUsdCents: "4200", paidUsdCents: "4200" },
  { invoiceId: "INV-0102", invoiceUsdCents: "6800", paidUsdCents: "2500" },
  { invoiceId: "INV-0102", invoiceUsdCents: "6800", paidUsdCents: "2500" },
  { invoiceId: "INV-0103", invoiceUsdCents: "2500", paidUsdCents: "0" },
  { invoiceId: "INV-0104", invoiceUsdCents: "3000", paidUsdCents: "3500" },
];

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
const amount = (value) => {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,17})$/.test(value)) {
    throw new Error(
      "Ledger amounts must be bounded non-negative integer USD-cent strings",
    );
  }
  return BigInt(value);
};

/**
 * Compute a concrete service result from an explicitly sample invoice ledger.
 * Exact duplicate IDs are counted once; conflicting duplicates fail closed.
 * sha256 is the lowercase hex SHA-256 of UTF-8 JSON.stringify(report), without
 * indentation or a trailing newline. Download those exact bytes to verify it.
 * This service output is not an oracle claim or a contract judgment of quality.
 */
export function createServiceResult(rows = SAMPLE_LEDGER) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) {
    throw new Error("Provide between one and 100 sample ledger rows");
  }

  const normalized = rows.map((row) => {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      Object.keys(row).sort().join(",") !==
        "invoiceId,invoiceUsdCents,paidUsdCents" ||
      typeof row.invoiceId !== "string" ||
      !/^[A-Z0-9-]{1,40}$/.test(row.invoiceId)
    ) {
      throw new Error(
        "Each ledger row needs an invoice ID and its invoice/paid USD cents",
      );
    }
    amount(row.invoiceUsdCents);
    amount(row.paidUsdCents);
    return {
      invoiceId: row.invoiceId,
      invoiceUsdCents: row.invoiceUsdCents,
      paidUsdCents: row.paidUsdCents,
    };
  });

  const input = {
    sample: true,
    currency: "USD",
    amountUnit: "cent",
    rows: normalized,
  };
  const seen = new Map();
  const duplicates = [];
  const invoices = [];
  let invoiceTotal = 0n;
  let paidTotal = 0n;
  let dueTotal = 0n;
  let overpaidTotal = 0n;

  normalized.forEach((row, index) => {
    const previous = seen.get(row.invoiceId);
    if (previous) {
      if (
        row.invoiceUsdCents !== previous.row.invoiceUsdCents ||
        row.paidUsdCents !== previous.row.paidUsdCents
      ) {
        throw new Error(`Conflicting duplicate invoice ID: ${row.invoiceId}`);
      }
      duplicates.push({
        invoiceId: row.invoiceId,
        sourceRow: index + 1,
        keptRow: previous.sourceRow,
      });
      return;
    }
    seen.set(row.invoiceId, { row, sourceRow: index + 1 });
    const billed = amount(row.invoiceUsdCents);
    const paid = amount(row.paidUsdCents);
    const due = billed > paid ? billed - paid : 0n;
    const overpaid = paid > billed ? paid - billed : 0n;
    invoiceTotal += billed;
    paidTotal += paid;
    dueTotal += due;
    overpaidTotal += overpaid;
    invoices.push({
      ...row,
      dueUsdCents: due.toString(),
      overpaidUsdCents: overpaid.toString(),
      status:
        overpaid > 0n
          ? "Overpaid"
          : due === 0n
            ? "Paid"
            : paid === 0n
              ? "Unpaid"
              : "Partially paid",
    });
  });

  const report = {
    schema: "quote-bond.invoice-reconciliation.v1",
    sampleInput: true,
    currency: "USD",
    amountUnit: "cent",
    inputSha256: hash(input),
    duplicatePolicy:
      "Identical duplicate invoice IDs are excluded from totals; conflicting duplicates are rejected.",
    summary: {
      inputRows: normalized.length,
      uniqueInvoices: invoices.length,
      duplicateRows: duplicates.length,
      invoiceUsdCents: invoiceTotal.toString(),
      paidUsdCents: paidTotal.toString(),
      dueUsdCents: dueTotal.toString(),
      overpaidUsdCents: overpaidTotal.toString(),
      netDueUsdCents: (invoiceTotal - paidTotal).toString(),
    },
    invoices,
    duplicates,
    limit:
      "Computed from sample inputs by an isolated test merchant. The payment contract does not adjudicate report quality or prove a live commercial provider.",
  };

  return {
    input,
    report,
    sha256: hash(report),
    service: "Invoice reconciliation",
    sampleInput: true,
  };
}
