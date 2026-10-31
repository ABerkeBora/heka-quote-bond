import {
  acquireRuntime,
  db,
  save,
  readLocal,
  writeLocal,
  writeEvidence,
} from "../server/v2/store.mjs";
import { merchantAccept, run } from "../server/v2/agent.mjs";
acquireRuntime();
const q = db.quotes.find((q) => q.scenario === "fully-covered");
if (!q) throw Error("Run live evidence first");
if (process.argv[2] === "interrupt") {
  if (!q.receipt || !q.merchantAcceptanceReceipt)
    throw Error("Confirmed payment and acceptance required");
  const j = readLocal("transactions.json");
  writeLocal("restart-test.json", {
    id: q.id,
    payment: q.txHash,
    acceptance: q.merchantAcceptanceTx,
    gas: q.mandate.gasSpentWei,
    count: Object.keys(j).length,
  });
  delete j[`${q.id}:merchant-accept`].receipt;
  delete j[`${q.id}:payment`].receipt;
  writeLocal("transactions.json", j);
  delete q.receipt;
  delete q.txHash;
  delete q.deliveredResult;
  delete q.merchantAcceptanceReceipt;
  delete q.merchantAcceptanceTx;
  q.mandate.gasSpentWei = "0";
  save();
  console.log(
    "Saved interrupted V2 acceptance/payment result state; raw signed journal and chain history preserved.",
  );
} else if (process.argv[2] === "reconcile") {
  const before = readLocal("restart-test.json");
  await merchantAccept(before.id);
  await run(before.id);
  const now = db.quotes.find((q) => q.id === before.id),
    j = readLocal("transactions.json");
  if (
    now.txHash !== before.payment ||
    now.merchantAcceptanceTx !== before.acceptance ||
    now.mandate.gasSpentWei !== before.gas ||
    Object.keys(j).length !== before.count ||
    !now.deliveredResult
  )
    throw Error("V2 new-process reconciliation failed");
  writeEvidence("process-restart.json", {
    intent: before.id,
    actualNewNodeProcess: true,
    merchantReceiptRecovered: true,
    paymentReceiptRecovered: true,
    payment: now.txHash,
    acceptance: now.merchantAcceptanceTx,
    gasRecovered: now.mandate.gasSpentWei,
    journalCountBefore: before.count,
    journalCountAfter: Object.keys(j).length,
    noNewTransaction: true,
  });
  console.log(
    "New V2 process reconciled actual merchant acceptance and payment without a new transaction.",
  );
} else
  throw Error(
    "Use interrupt then reconcile in separate processes, server stopped.",
  );
