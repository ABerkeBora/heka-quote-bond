import fs from "node:fs";
import {
  createWalletClient,
  http,
  encodeFunctionData,
  encodeDeployData,
  keccak256,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  publicClient,
  RPC,
  artifact,
  tokenAbi,
  assertNetwork,
  loadReceipt,
} from "../chain.mjs";
import {
  LOCAL,
  readLocal,
  writeLocal,
  readEvidence,
  db,
  save,
} from "./store.mjs";
export { publicClient, RPC, artifact, tokenAbi, assertNetwork, loadReceipt };
export const abi = () => artifact("QuoteBondCoverage").abi;
export const deployment = () =>
  readLocal("deployment.json", null) || readEvidence("deployment.json", null);
let accounts;
export function roles() {
  if (accounts) return accounts;
  const p = process.env.V2_WALLET_FILE || LOCAL + "/wallets.json";
  if ((fs.statSync(p).mode & 0o077) !== 0)
    throw Error("V2 wallet file must be0600");
  const w = JSON.parse(fs.readFileSync(p));
  if (
    w.testOnly !== true ||
    w.chainId !== 84532 ||
    w.project !== "quote-bond-v2"
  )
    throw Error("Wrong isolated V2 wallets");
  accounts = {};
  for (const n of ["deployer", "buyer", "counterparty"]) {
    const a = privateKeyToAccount(w.roles[n].privateKey);
    if (a.address.toLowerCase() !== w.roles[n].address.toLowerCase())
      throw Error("V2 key/address mismatch");
    accounts[n] = a;
  }
  return accounts;
}
export function signerReady() {
  try {
    const a = roles(),
      d = deployment();
    return (
      !!d &&
      a.deployer.address.toLowerCase() === d.reserveFunder.toLowerCase() &&
      a.buyer.address.toLowerCase() === d.payer.toLowerCase() &&
      a.counterparty.address.toLowerCase() === d.merchant.toLowerCase()
    );
  } catch {
    return false;
  }
}
export const chainQuote = (id) =>
  publicClient.readContract({
    address: deployment().contract,
    abi: abi(),
    functionName: "getQuote",
    args: [id],
  });
export const policyHash = (id) =>
  publicClient.readContract({
    address: deployment().contract,
    abi: abi(),
    functionName: "policyHash",
    args: [id],
  });
export async function balanceSnapshot() {
  const d = deployment();
  const out = {};
  for (const [n, address] of [
    ["buyer", d.payer],
    ["merchant", d.merchant],
    ["platform", d.reserveFunder],
    ["reserve", d.contract],
  ]) {
    out[n] = {};
    for (const [name, token] of [
      ["usdc", d.usdc],
      ["usdt", d.usdt],
    ])
      out[n][name] = (
        await publicClient.readContract({
          address: token,
          abi: tokenAbi(),
          functionName: "balanceOf",
          args: [address],
        })
      ).toString();
  }
  out.totalReserved = (
    await publicClient.readContract({
      address: d.contract,
      abi: abi(),
      functionName: "totalReservedUsdt",
    })
  ).toString();
  return out;
}
export async function transact({
  intent,
  role = "deployer",
  to,
  data,
  gasCap,
  allowRevert = false,
  value = 0n,
}) {
  // This lock covers the entire journal+nonce+broadcast+receipt operation across CLI/server processes.
  const lock = LOCAL + "/signer.lock";
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    throw Error(
      "Quote Bond signer lock exists; another signer is active or a crashed process needs npm run v2:recover-lock",
    );
  }
  try {
    return await transactLocked({
      intent,
      role,
      to,
      data,
      gasCap,
      allowRevert,
      value,
    });
  } finally {
    fs.unlinkSync(lock);
  }
}
async function transactLocked({
  intent,
  role = "deployer",
  to,
  data,
  gasCap,
  allowRevert = false,
  value = 0n,
}) {
  await assertNetwork();
  const entries = readLocal("transactions.json", {});
  let entry = entries[intent];
  if (entry) {
    if (
      entry.to !== to ||
      entry.data !== data ||
      entry.role !== role ||
      (entry.value || "0") !== value.toString()
    )
      throw Error("Intent terms do not match durable transaction");
    if (entry.receipt) {
      if (entry.receipt.status === "reverted" && !allowRevert)
        throw Error("Prior intent reverted; no automatic retry");
      return entry.receipt;
    }
  }
  const account = roles()[role];
  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC, { timeout: 20000, retryCount: 0 }),
  });
  if (!entry) {
    // A pending tx for this signer blocks new nonces until reconciled, including across process restarts.
    for (const [id, e] of Object.entries(entries))
      if (e.role === role && !e.receipt)
        throw Error(
          `Unreconciled transaction ${id}; retry that exact intent first`,
        );
    const gas = allowRevert
      ? 900000n
      : ((await publicClient.estimateGas({
          account: account.address,
          to,
          data,
          value,
        })) *
          120n) /
        100n;
    const fees = await publicClient.estimateFeesPerGas();
    const maxFeePerGas = fees.maxFeePerGas;
    const maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
    const nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    });
    const raw = await wallet.signTransaction({
      chain: baseSepolia,
      type: "eip1559",
      to,
      data,
      value,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
    });
    const l1 = await publicClient.readContract({
      address: "0x420000000000000000000000000000000000000F",
      abi: [
        {
          type: "function",
          name: "getL1Fee",
          stateMutability: "view",
          inputs: [{ name: "_data", type: "bytes" }],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "getL1Fee",
      args: [raw],
    });
    const maxGasWei = gas * maxFeePerGas + l1 * 2n + 1000000000n;
    if (gasCap !== undefined && maxGasWei > BigInt(gasCap))
      throw Error(
        "Gas cap including buffered L1 fee would be exceeded; no transaction broadcast",
      );
    entry = {
      role,
      to,
      data,
      value: value.toString(),
      nonce,
      raw,
      hash: keccak256(raw),
      maxGasWei: maxGasWei.toString(),
      createdAt: Math.floor(Date.now() / 1000),
    };
    entries[intent] = entry;
    writeLocal("transactions.json", entries);
  }
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: entry.hash });
  } catch {}
  if (!receipt) {
    try {
      await publicClient.sendRawTransaction({
        serializedTransaction: entry.raw,
      });
    } catch (e) {
      try {
        await publicClient.getTransaction({ hash: entry.hash });
      } catch {
        throw Error(
          `Broadcast uncertain for intent ${intent}; retry this intent to reconcile its saved hash`,
        );
      }
    }
    receipt = await publicClient.waitForTransactionReceipt({
      hash: entry.hash,
      timeout: 60000,
      confirmations: 1,
    });
  }
  const rawReceipt = await publicClient.request({
    method: "eth_getTransactionReceipt",
    params: [entry.hash],
  });
  entry.receipt = await loadReceipt(entry.hash);
  entries[intent] = entry;
  writeLocal("transactions.json", entries);
  if (receipt.status === "reverted" && !allowRevert)
    throw Error(`Transaction reverted: ${entry.hash}`);
  return entry.receipt;
}
export async function callTx(
  intent,
  role,
  address,
  contractAbi,
  functionName,
  args,
  options = {},
) {
  return transact({
    intent,
    role,
    to: address,
    data: encodeFunctionData({ abi: contractAbi, functionName, args }),
    ...options,
  });
}
export async function deployContract(intent, name, args) {
  const a = artifact(name);
  return transact({
    intent,
    role: "deployer",
    to: undefined,
    data: encodeDeployData({ abi: a.abi, bytecode: a.bytecode.object, args }),
  });
}
export async function syncQuote(q) {
  const c = await chainQuote(q.id);
  q.status = ["Draft", "Funded", "Active", "Settled", "Capped", "Void"][
    c.state
  ];
  q.merchantAccepted = c.merchantAccepted;
  q.merchantAcceptanceExpiry = Number(c.merchantAcceptanceExpiry);
  q.maxUncoveredUsd18 = c.maxUncoveredUSD18.toString();
  q.onchainUncoveredUsd18 = c.uncoveredUsd18.toString();
  if ([3, 4, 5].includes(c.state)) {
    q.topupUsdt = c.paidUsdt.toString();
    q.uncoveredUsd18 = c.uncoveredUsd18.toString();
  } else if (q.lastCalculation) Object.assign(q, q.lastCalculation);
  q.mandate.expiresAt = Number(c.mandateExpiry);
  q.buyerAuthorized = c.state === 2 || c.state === 3 || c.state === 4;
  q.canVoid =
    [1, 2].includes(c.state) &&
    Math.floor(Date.now() / 1000) > Number(c.hardDeadline);
  if ([3, 4].includes(c.state)) q.mandate.actionsUsed = 1;
  save();
  return c;
}
export const paidEvent = (r) =>
  parseEventLogs({ abi: abi(), logs: r.logs, eventName: "QuotePaid" })[0]?.args;
