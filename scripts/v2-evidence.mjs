import {
  acquireRuntime,
  db,
  save,
  writeEvidence,
  readEvidence,
  readLocal,
  json,
} from "../server/v2/store.mjs";
import {
  prepare,
  merchantAccept,
  authorize,
  run,
  negative,
} from "../server/v2/agent.mjs";
import {
  deployment,
  roles,
  publicClient,
  abi,
  callTx,
  chainQuote,
  balanceSnapshot,
  policyHash,
} from "../server/v2/chain.mjs";
import { fetchOracle } from "../server/oracle.mjs";
import { toHex } from "viem";
acquireRuntime();
if (readEvidence("live-summary.json", null)) {
  console.log("Completed V2 evidence preserved. Use fresh UI or judge script.");
  process.exit(0);
}
const d = deployment();
let strict = db.quotes.find((q) => q.scenario === "strict-blocked");
if (!strict) {
  strict = await prepare({ quoteUsd: "140", maxUncoveredUsd: "0" });
  strict.scenario = "strict-blocked";
  save();
}
// Actual caller tries a quote that has no merchant acceptance: contract fails before movement.
if (!strict.merchantAccepted) {
  strict.mandate.expiresAt = strict.merchantAcceptanceExpiry;
  save();
  await callTx(
    `${strict.id}:buyer-mandate`,
    "buyer",
    d.contract,
    abi(),
    "authorize",
    [strict.id, BigInt(strict.mandate.expiresAt), 100000000n],
    { gasCap: 200000000000000n },
  );
  await negative("unaccepted", { quoteId: strict.id, broadcast: true });
  await merchantAccept(strict.id);
}
await authorize(strict.id);
const before = await balanceSnapshot(),
  cb = await chainQuote(strict.id),
  journalBefore = Object.keys(readLocal("transactions.json", {})).length;
const blocked = await run(strict.id);
const after = await balanceSnapshot(),
  ca = await chainQuote(strict.id),
  journalAfter = Object.keys(readLocal("transactions.json", {})).length;
if (
  !blocked.blocked ||
  json(before) !== json(after) ||
  json(cb) !== json(ca) ||
  journalBefore !== journalAfter
)
  throw Error("Agent coverage block failed");
writeEvidence("agent-coverage-block.json", {
  quote: strict,
  oracle: strict.lastOracle,
  decision: blocked.decision,
  before,
  after,
  quoteBefore: cb,
  quoteAfter: ca,
  noPaymentBroadcast: true,
  noNewSignedTransaction: journalBefore === journalAfter,
  protectedStateUnchanged: true,
});
await negative("coverage", { quoteId: strict.id, broadcast: true });
let full = db.quotes.find((q) => q.scenario === "fully-covered");
if (!full) {
  full = await prepare({ quoteUsd: "110", maxUncoveredUsd: "0" });
  full.scenario = "fully-covered";
  save();
}
await merchantAccept(full.id);
await authorize(full.id);
const fullBefore = await balanceSnapshot();
await run(full.id);
const fullAfter = await balanceSnapshot();
if (full.status !== "Settled" || full.uncoveredUsd18 !== "0")
  throw Error("Full coverage settlement failed");
writeEvidence("full-payment.json", {
  quote: full,
  before: fullBefore,
  after: fullAfter,
  receipt: full.receipt,
});
let partial = db.quotes.find((q) => q.scenario === "accepted-partial");
if (!partial) {
  partial = await prepare({ quoteUsd: "140", maxUncoveredUsd: "20" });
  partial.scenario = "accepted-partial";
  save();
}
await merchantAccept(partial.id);
await authorize(partial.id);
const partialBefore = await balanceSnapshot();
await run(partial.id);
const partialAfter = await balanceSnapshot();
if (
  partial.status !== "Capped" ||
  BigInt(partial.uncoveredUsd18) <= 0n ||
  BigInt(partial.uncoveredUsd18) > BigInt(partial.maxUncoveredUsd18)
)
  throw Error("Accepted partial failed");
writeEvidence("partial-payment.json", {
  quote: partial,
  before: partialBefore,
  after: partialAfter,
  receipt: partial.receipt,
});
// Four required signed-data failures use a separate current, accepted and authorized full-only quote.
let proof = db.quotes.find((q) => q.scenario === "oracle-checks");
if (!proof) {
  proof = await prepare({ quoteUsd: "110", maxUncoveredUsd: "0" });
  proof.scenario = "oracle-checks";
  proof.evidenceOnly = true;
  save();
}
await merchantAccept(proof.id);
await authorize(proof.id);
for (const kind of ["edited", "stale", "wrong-request", "wrong-signer"]) {
  const r = await negative(kind, { quoteId: proof.id, broadcast: true });
  console.log(kind, r.expected, r.txHash);
}
// Wrong reviewed hash and another quote's hash cannot be accepted; use an unaccepted immutable quote.
let bad = db.quotes.find((q) => q.scenario === "acceptance-binding");
if (!bad) {
  bad = await prepare({ quoteUsd: "110", maxUncoveredUsd: "0" });
  bad.scenario = "acceptance-binding";
  bad.evidenceOnly = true;
  save();
}
const bindings = [];
for (const [name, account, h] of [
  ["wrong-role", roles().buyer.address, bad.policyHash],
  ["wrong-policy", roles().counterparty.address, "0x" + "11".repeat(32)],
  ["other-quote", roles().counterparty.address, full.policyHash],
]) {
  let reason;
  try {
    await publicClient.simulateContract({
      address: d.contract,
      abi: abi(),
      functionName: "acceptCoverage",
      args: [bad.id, h],
      account,
    });
    throw Error("UNSAFE acceptance succeeded");
  } catch (e) {
    if (e.message === "UNSAFE acceptance succeeded") throw e;
    let x = e;
    while (x && !x.data?.errorName) x = x.cause;
    reason = x?.data?.errorName;
    if (!reason) throw e;
  }
  bindings.push({ name, reason, account, submittedPolicyHash: h });
}
writeEvidence("acceptance-binding.json", {
  quote: bad,
  tests: bindings,
  method: "deployed contract eth_call; no broadcast",
});
const dupBefore = await balanceSnapshot(),
  countBefore = Object.keys(readLocal("transactions.json", {})).length;
const dup = await run(full.id);
const dupAfter = await balanceSnapshot(),
  countAfter = Object.keys(readLocal("transactions.json", {})).length;
if (
  !dup.duplicate ||
  json(dupBefore) !== json(dupAfter) ||
  countBefore !== countAfter
)
  throw Error("V2 duplicate consumed funds");
writeEvidence("duplicate.json", {
  intent: full.id,
  noNewTransaction: true,
  before: dupBefore,
  after: dupAfter,
  journalCountBefore: countBefore,
  journalCountAfter: countAfter,
});
await run(proof.id);
const summary = {
  chainId: 84532,
  contract: d.contract,
  merchant: d.merchant,
  strictBlocked: strict.id,
  coverageRejection: readEvidence("negative-coverage.json").txHash,
  full: {
    quoteId: full.id,
    txHash: full.txHash,
    uncoveredUsd18: full.uncoveredUsd18,
  },
  partial: {
    quoteId: partial.id,
    txHash: partial.txHash,
    uncoveredUsd18: partial.uncoveredUsd18,
    maxUncoveredUsd18: partial.maxUncoveredUsd18,
  },
  oracle: db.evidence.filter((e) =>
    ["edited", "stale", "wrong-request", "wrong-signer"].includes(e.kind),
  ),
  duplicate: true,
};
writeEvidence("live-summary.json", summary);
console.log("V2 LIVE EVIDENCE PASS", JSON.stringify(summary));
