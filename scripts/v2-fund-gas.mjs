import fs from "node:fs";
import { createWalletClient, http, keccak256 } from "viem";
import { baseSepolia } from "viem/chains";
import { acquireRuntime, ROOT, read } from "../server/store.mjs";
import {
  roles as v1Roles,
  publicClient,
  RPC,
  assertNetwork,
  loadReceipt,
  balanceSnapshot as v1Balances,
} from "../server/chain.mjs";
import { roles } from "../server/v2/chain.mjs";
import { readLocal, writeLocal, writeEvidence } from "../server/v2/store.mjs";
acquireRuntime();
const signerLock = ROOT + "/.local/signer.lock";
fs.writeFileSync(signerLock, String(process.pid), { flag: "wx", mode: 0o600 });
process.on("exit", () => {
  try {
    fs.unlinkSync(signerLock);
  } catch {}
});
const originalJournal = read(".local/transactions.json", {});
if (
  Object.values(originalJournal).some(
    (e) => e.role === "deployer" && !e.receipt,
  )
)
  throw Error("Reconcile original deployer intent before allocating V2 gas");
await assertNetwork();
const source = v1Roles().deployer;
const target = roles();
const before = await v1Balances();
const saved = readLocal("funding.json", {});
const wallet = createWalletClient({
  account: source,
  chain: baseSepolia,
  transport: http(RPC, { retryCount: 0 }),
});
// Test gas only, one-time bounded funding; V1 ERC20s/reserves/quotes are not touched.
for (const [role, value] of [
  ["deployer", 1000000000000000n],
  ["buyer", 200000000000000n],
  ["counterparty", 200000000000000n],
]) {
  let entry = saved[role];
  const to = target[role].address;
  if (entry && (entry.to !== to || entry.value !== value.toString()))
    throw Error("Funding intent changed");
  if (!entry) {
    const gas = 30000n,
      fees = await publicClient.estimateFeesPerGas();
    const nonce = await publicClient.getTransactionCount({
      address: source.address,
      blockTag: "pending",
    });
    const raw = await wallet.signTransaction({
      chain: baseSepolia,
      to,
      value,
      gas,
      type: "eip1559",
      ...fees,
      nonce,
    });
    const l1 = await publicClient.readContract({
      address: "0x420000000000000000000000000000000000000F",
      abi: [
        {
          type: "function",
          name: "getL1Fee",
          stateMutability: "view",
          inputs: [{ type: "bytes", name: "data" }],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "getL1Fee",
      args: [raw],
    });
    const spent = Object.values(saved).reduce(
      (sum, e) => sum + BigInt(e.receipt?.gasCostWei || "0"),
      0n,
    );
    if (
      spent + gas * fees.maxFeePerGas + 2n * l1 + 1000000000n >
      200000000000000n
    )
      throw Error("Funding setup gas cap exceeded before broadcast");
    entry = { to, value: value.toString(), nonce, hash: keccak256(raw), raw };
    saved[role] = entry;
    writeLocal("funding.json", saved);
  }
  if (!entry.receipt) {
    let found;
    try {
      found = await publicClient.getTransactionReceipt({ hash: entry.hash });
    } catch {}
    if (!found) {
      try {
        await publicClient.sendRawTransaction({
          serializedTransaction: entry.raw,
        });
      } catch (e) {
        try {
          await publicClient.getTransaction({ hash: entry.hash });
        } catch {
          throw Error(
            "Uncertain funding; rerun same journal before creating anything new",
          );
        }
      }
      await publicClient.waitForTransactionReceipt({
        hash: entry.hash,
        timeout: 60000,
      });
    }
    entry.receipt = await loadReceipt(entry.hash);
    if (entry.receipt.status !== "success") throw Error("Funding reverted");
    writeLocal("funding.json", saved);
  }
}
const after = await v1Balances();
if (JSON.stringify(before) !== JSON.stringify(after))
  throw Error("V1 token/reserve balances changed");
writeEvidence("gas-funding.json", {
  source: source.address,
  totalTestEthWei: "1400000000000000",
  transactions: Object.fromEntries(
    Object.entries(saved).map(([k, v]) => [
      k,
      { to: v.to, value: v.value, receipt: v.receipt },
    ]),
  ),
  v1TokenBalancesBefore: before,
  v1TokenBalancesAfter: after,
  v1TokensUnchanged: true,
});
console.log(
  "Isolated V2 gas funding complete; V1 token/reserve balances unchanged.",
);
