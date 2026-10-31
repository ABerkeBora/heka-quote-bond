import fs from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  encodeDeployData,
  keccak256,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { ROOT, read, write, db, save } from "./store.mjs";
if (fs.existsSync(ROOT + "/.env")) process.loadEnvFile(ROOT + "/.env");
export const RPC = process.env.RPC_URL || "https://sepolia.base.org";
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC, { timeout: 20000, retryCount: 1 }),
});
export const artifact = (name) => read(`out/${name}.sol/${name}.json`);
export const abi = () => artifact("QuoteBond").abi;
export const tokenAbi = () => artifact("TestToken6").abi;
let accounts;
export function roles() {
  if (accounts) return accounts;
  const file = process.env.WALLET_FILE || ROOT + "/.local/wallets.json";
  const stat = fs.statSync(file);
  if ((stat.mode & 0o077) !== 0)
    throw Error("Wallet file must have 0600 permissions");
  const w = JSON.parse(fs.readFileSync(file, "utf8"));
  if (w.testOnly !== true || w.chainId !== 84532 || w.project !== "quote-bond")
    throw Error("Wrong test wallet project/network");
  accounts = {};
  for (const n of ["deployer", "buyer", "counterparty"]) {
    const a = privateKeyToAccount(w.roles[n].privateKey);
    if (a.address.toLowerCase() !== w.roles[n].address.toLowerCase())
      throw Error("Wallet address mismatch");
    accounts[n] = a;
  }
  return accounts;
}
export const deployment = () =>
  read(".local/deployment.json", null) ||
  read("evidence/deployment.json", null);
export function signerReady() {
  try {
    const file = process.env.WALLET_FILE || ROOT + "/.local/wallets.json";
    const w = JSON.parse(fs.readFileSync(file, "utf8"));
    const d = deployment();
    return (
      w.testOnly === true &&
      w.chainId === 84532 &&
      w.project === "quote-bond" &&
      w.roles.deployer.address.toLowerCase() ===
        d.reserveFunder.toLowerCase() &&
      w.roles.buyer.address.toLowerCase() === d.payer.toLowerCase() &&
      w.roles.counterparty.address.toLowerCase() === d.merchant.toLowerCase()
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
export async function assertNetwork() {
  if ((await publicClient.getChainId()) !== 84532)
    throw Error("Only Base Sepolia is allowed");
}
export async function balanceSnapshot() {
  const d = deployment();
  const a = roles();
  const out = {};
  for (const [n, account] of Object.entries(a)) {
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
          args: [account.address],
        })
      ).toString();
  }
  out.reserve = (
    await publicClient.readContract({
      address: d.usdt,
      abi: tokenAbi(),
      functionName: "balanceOf",
      args: [d.contract],
    })
  ).toString();
  out.totalReserved = (
    await publicClient.readContract({
      address: d.contract,
      abi: abi(),
      functionName: "totalReservedUsdt",
    })
  ).toString();
  return out;
}
const receiptJson = (r, raw) => {
  if (raw.l1Fee === undefined)
    throw Error("Base receipt is missing its L1 fee; accounting cannot finish");
  const l1Fee = BigInt(raw.l1Fee),
    execution = r.gasUsed * r.effectiveGasPrice;
  return {
    transactionHash: r.transactionHash,
    blockNumber: r.blockNumber.toString(),
    status: r.status,
    gasUsed: r.gasUsed.toString(),
    effectiveGasPrice: r.effectiveGasPrice.toString(),
    executionGasWei: execution.toString(),
    l1FeeWei: l1Fee.toString(),
    gasCostWei: (execution + l1Fee).toString(),
    contractAddress: r.contractAddress,
    logs: r.logs,
  };
};
export async function loadReceipt(hash) {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const raw = await publicClient.request({
    method: "eth_getTransactionReceipt",
    params: [hash],
  });
  return receiptJson(receipt, raw);
}
// Persist signed bytes + expected hash BEFORE network broadcast. Retries only rebroadcast the same bytes.
// This journal is local/private; publish only sanitized receipts.
export async function transact({
  intent,
  role = "deployer",
  to,
  data,
  gasCap,
  allowRevert = false,
}) {
  // This lock covers the entire journal+nonce+broadcast+receipt operation across CLI/server processes.
  const lock = ROOT + "/.local/signer.lock";
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    throw Error(
      "Quote Bond signer lock exists; another signer is active or a crashed process needs npm run recover-lock",
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
}) {
  await assertNetwork();
  const entries = read(".local/transactions.json", {});
  let entry = entries[intent];
  if (entry) {
    if (entry.to !== to || entry.data !== data || entry.role !== role)
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
      nonce,
      raw,
      hash: keccak256(raw),
      maxGasWei: maxGasWei.toString(),
      createdAt: Math.floor(Date.now() / 1000),
    };
    entries[intent] = entry;
    write(".local/transactions.json", entries);
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
  entry.receipt = receiptJson(receipt, rawReceipt);
  entries[intent] = entry;
  write(".local/transactions.json", entries);
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
  q.mandate.expiresAt = Number(c.mandateExpiry);
  q.topupUsdt = c.paidUsdt.toString();
  q.uncoveredUsd18 = c.uncoveredUsd18.toString();
  if (c.state === 3 || c.state === 4) q.mandate.actionsUsed = 1;
  save();
  return c;
}
export function paidEvent(receipt) {
  return parseEventLogs({
    abi: abi(),
    logs: receipt.logs,
    eventName: "QuotePaid",
  })[0]?.args;
}
