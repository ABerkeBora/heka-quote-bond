import fs from "node:fs";
import crypto from "node:crypto";
import { toHex } from "viem";
import { read } from "../server/store.mjs";
import {
  publicClient,
  abi,
  deployment,
  balanceSnapshot,
} from "../server/chain.mjs";
import { deployment as v2Deployment } from "../server/v2/chain.mjs";
import { writeEvidence } from "../server/v2/store.mjs";
const v1 = deployment(),
  v2 = v2Deployment();
for (const k of [
  "contract",
  "usdc",
  "usdt",
  "payer",
  "merchant",
  "reserveFunder",
])
  if (v1[k].toLowerCase() === v2[k].toLowerCase())
    throw Error("V1/V2 isolation failed:" + k);
const hashes = read("evidence/v2/v1-baseline-hashes.json").paths;
for (const [p, h] of Object.entries(hashes))
  if (
    crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") !== h
  )
    throw Error("V1 baseline changed:" + p);
const before = await balanceSnapshot(),
  baseline = read("evidence/v2/gas-funding.json").v1TokenBalancesBefore;
if (JSON.stringify(before) !== JSON.stringify(baseline))
  throw Error("V2 consumed protected V1 funds");
const saved = read("evidence/browser-payment.json"),
  q = saved.quote,
  o = q.paymentOracle,
  blockNumber = BigInt(saved.transaction.blockNumber) - 1n;
await publicClient.simulateContract({
  address: v1.contract,
  abi: abi(),
  functionName: "payApprovedQuote",
  args: [q.id, BigInt(o.timestamp), toHex(o.data), o.signature],
  account: v1.reserveFunder,
  blockNumber,
});
const after = await balanceSnapshot();
if (JSON.stringify(before) !== JSON.stringify(after))
  throw Error("Read-only regression moved funds");
writeEvidence("v1-regression.json", {
  v1Commit: "974ae378b3e953d1dc8804c51ffb721133be70a7",
  tag: "v1-baseline",
  v1Url: "http://localhost:3104/",
  v2Url: "http://localhost:3104/next",
  distinctContractsTokensAndRoles: true,
  protectedV1FilesUnchanged: true,
  v1TokenReservesUnchanged: true,
  before,
  after,
  originalValidPaymentSimulatedAtHistoricalBlock: blockNumber.toString(),
  simulationWasReadOnly: true,
  originalReceipt: q.txHash,
});
console.log(
  "V1 historical payment, protected files/funds and V2 isolation PASS",
);
