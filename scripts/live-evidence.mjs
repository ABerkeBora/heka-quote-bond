import { acquireRuntime } from "../server/store.mjs";
import { run, prepare, tamper, validateMandate } from "../server/agent.mjs";
import { db, save, write, json, read } from "../server/store.mjs";
import {
  balanceSnapshot,
  chainQuote,
  deployment,
  publicClient,
  abi,
  roles,
} from "../server/chain.mjs";
import { toHex } from "viem";
if (read("evidence/live-summary.json", null)) {
  console.log(
    "Recorded live suite already complete; preserving original before/after evidence. Use npm run judge:prepare for a fresh current-response test.",
  );
  process.exit(0);
}
acquireRuntime();
const first = db.quotes.find((q) => !q.evidenceOnly);
const q = first || (await prepare({ quoteUsd: "110" }));
const before = await balanceSnapshot();
const paid = await run(q.id);
const after = await balanceSnapshot();
if (q.status !== "Settled" || BigInt(q.topupUsdt) <= 0n)
  throw Error("Positive atomic live settlement missing");
write("evidence/live-payment.json", {
  quote: q,
  oracle: q.paymentOracle,
  before,
  after,
  result: paid,
  source: "Real Nodary prices; explicit 110 USD stress terms, no depeg claim",
});
const dupBefore = await balanceSnapshot();
const duplicate = await run(q.id);
const dupAfter = await balanceSnapshot();
if (!duplicate.duplicate || json(dupBefore) !== json(dupAfter))
  throw Error("Duplicate guard failed");
let dupReason;
try {
  await publicClient.simulateContract({
    address: deployment().contract,
    abi: abi(),
    functionName: "payApprovedQuote",
    args: [
      q.id,
      BigInt(q.paymentOracle.timestamp),
      toHex(q.paymentOracle.data),
      q.paymentOracle.signature,
    ],
    account: roles().deployer.address,
  });
  throw Error("Duplicate accepted");
} catch (e) {
  if (e.message === "Duplicate accepted") throw e;
  dupReason = e.shortMessage;
}
write("evidence/duplicate.json", {
  intent: q.id,
  validatorDecision: "duplicate rejected",
  noBroadcast: true,
  onchainRejection: dupReason,
  before: dupBefore,
  after: dupAfter,
  unchanged: json(dupBefore) === json(dupAfter),
});
// Test recovery after a mined payment but before application result/receipt/gas fields were saved.
const hash = q.txHash;
delete q.receipt;
delete q.txHash;
delete q.deliveredResult;
q.mandate.gasSpentWei = "0";
save();
await run(q.id);
if (q.txHash !== hash || !q.deliveredResult || q.mandate.gasSpentWei === "0")
  throw Error("Receipt reconciliation failed");
write("evidence/restart-reconciliation.json", {
  intent: q.id,
  transactionHash: q.txHash,
  resultRecovered: !!q.deliveredResult,
  gasRecovered: q.mandate.gasSpentWei,
  noNewTransaction: true,
});
let guardError;
const c = await chainQuote(q.id);
try {
  validateMandate(
    { ...q, mandate: { ...q.mandate, maxUsdc: "1", actionsUsed: 0 } },
    c,
    deployment(),
  );
  throw Error("Overbudget accepted");
} catch (e) {
  if (e.message === "Overbudget accepted") throw e;
  guardError = e.message;
}
write("evidence/blocked-budget.json", {
  intent: q.id,
  decision: "rejected before broadcast",
  reason: guardError,
});
let v = db.quotes.find((q) => q.evidenceOnly && q.status === "Active");
if (!v) {
  v = await prepare({ quoteUsd: "110" });
  v.evidenceOnly = true;
  save();
}
for (const kind of ["edited", "stale", "wrong-request", "wrong-signer"]) {
  const r = await tamper(kind, { broadcast: true, quoteId: v.id });
  console.log(kind, r.reason, r.txHash);
}
await run(v.id);
write("evidence/live-summary.json", {
  network: 84532,
  contract: deployment().contract,
  valid: q.txHash,
  positiveTopupUsdt: q.topupUsdt,
  tamper: db.evidence.map((e) => ({
    kind: e.kind,
    reason: e.reason,
    txHash: e.txHash,
    protectedStateUnchanged: e.protectedStateUnchanged,
  })),
  duplicate: true,
  restart: true,
  blockedBudget: true,
});
console.log("LIVE CORE EVIDENCE PASS", q.txHash, q.topupUsdt);
