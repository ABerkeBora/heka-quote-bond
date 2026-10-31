import { acquireRuntime, db, save, read, write } from "../server/store.mjs";
import { run } from "../server/agent.mjs";
acquireRuntime();
const q = db.quotes.filter((q) => !q.evidenceOnly).at(-1);
if (process.argv[2] === "interrupt") {
  if (!q.receipt || !q.txHash) throw Error("A confirmed invoice is required");
  write(".local/restart-test.json", {
    id: q.id,
    txHash: q.txHash,
    journalCount: Object.keys(read(".local/transactions.json")).length,
    gasSpent: q.mandate.gasSpentWei,
  });
  delete q.receipt;
  delete q.txHash;
  delete q.deliveredResult;
  q.mandate.gasSpentWei = "0";
  save();
  console.log(
    "Saved interrupted application result state; chain and signed journal retained.",
  );
} else if (process.argv[2] === "reconcile") {
  const before = read(".local/restart-test.json");
  await run(before.id);
  const after = db.quotes.find((q) => q.id === before.id);
  const journalCount = Object.keys(read(".local/transactions.json")).length;
  if (
    after.txHash !== before.txHash ||
    !after.deliveredResult ||
    after.mandate.gasSpentWei !== before.gasSpent ||
    journalCount !== before.journalCount
  )
    throw Error("Restart reconciliation failed");
  write("evidence/process-restart.json", {
    intent: before.id,
    transactionHash: after.txHash,
    actualNewNodeProcess: true,
    resultRecovered: true,
    gasRecovered: after.mandate.gasSpentWei,
    journalCountBefore: before.journalCount,
    journalCountAfter: journalCount,
    noNewTransaction: true,
  });
  console.log("New process recovered receipt/result/gas, no new transaction.");
} else
  throw Error(
    "Use interrupt then reconcile in separate Node processes with server stopped.",
  );
