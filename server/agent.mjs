import { keccak256, toHex, encodeFunctionData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { db, save, step, read, write, json } from "./store.mjs";
import {
  AIRNODE,
  REQUEST_HASH,
  REQUEST,
  fetchResponse,
  fetchOracle,
  calculate,
  decimal18,
  digest,
} from "./oracle.mjs";
import {
  deployment,
  roles,
  publicClient,
  abi,
  tokenAbi,
  chainQuote,
  syncQuote,
  callTx,
  paidEvent,
  balanceSnapshot,
  signerReady,
  loadReceipt,
} from "./chain.mjs";
import { createServiceResult } from "./service.mjs";
export const GAS_CAP = 200000000000000n;
export function updateGas(q) {
  const journal = read(".local/transactions.json", {});
  q.mandate.gasSpentWei = Object.entries(journal)
    .filter(([id]) =>
      [
        `${q.id}:buyer-exact-approval`,
        `${q.id}:buyer-mandate`,
        `${q.id}:payment`,
      ].includes(id),
    )
    .reduce((sum, [, e]) => sum + BigInt(e.receipt?.gasCostWei || "0"), 0n)
    .toString();
  save();
}
function deliver(q, receipt) {
  const event = paidEvent(receipt);
  if (!event || event.quoteId !== q.id)
    throw Error("Payment event missing; reconciliation required");
  q.txHash = receipt.transactionHash;
  q.receipt = receipt;
  q.escrowUsd18 = (
    (BigInt(event.paidUsdc) * event.usdcPrice18) /
    1000000n
  ).toString();
  updateGas(q);
  const delivered = {
    intent: q.id,
    jobId: q.jobId,
    result: "Invoice settlement receipt",
    beneficiary: deployment().merchant,
    paidUsdc: event.paidUsdc.toString(),
    paidUsdt: event.paidUsdt.toString(),
    uncoveredUsd18: event.uncoveredUsd18.toString(),
    status: q.status,
    transactionHash: receipt.transactionHash,
    confirmedAt: Math.floor(Date.now() / 1000),
  };
  q.deliveredResult = delivered;
  write(`evidence/receipts/${q.id}.json`, {
    mandate: q.mandate,
    quote: q,
    oracle: q.paymentOracle,
    receipt,
    delivered,
  });
  return delivered;
}

export async function refreshOracle() {
  try {
    db.oracle = await fetchOracle();
    save();
    return db.oracle;
  } catch (e) {
    db.oracle = { ...db.oracle, verified: false, error: e.message };
    save();
    throw e;
  }
}
export function validateMandate(q, c, d) {
  if (
    q.id !== q.mandate.id ||
    c.payer.toLowerCase() !== d.payer.toLowerCase() ||
    c.beneficiary.toLowerCase() !== d.merchant.toLowerCase() ||
    c.funder.toLowerCase() !== d.reserveFunder.toLowerCase()
  )
    throw Error("Recipient or payer is not allowed");
  if (
    c.escrowAmount !== 100000000n ||
    c.escrowAmount > BigInt(q.mandate.maxUsdc) ||
    c.reservedUsdt > BigInt(q.mandate.maxReserveUsdt) ||
    c.quoteUsd18 !== BigInt(q.quoteUsd18)
  )
    throw Error("Mandate budget or quote terms exceeded");
  if (
    q.mandate.network !== 84532 ||
    q.mandate.contract.toLowerCase() !== d.contract.toLowerCase() ||
    q.mandate.usdc.toLowerCase() !== d.usdc.toLowerCase() ||
    q.mandate.usdt.toLowerCase() !== d.usdt.toLowerCase()
  )
    throw Error("Network, asset or contract is not allowed");
  if (q.mandate.actionsUsed >= q.mandate.maxActions)
    throw Error("Duplicate intent: action limit reached");
  if (Math.floor(Date.now() / 1000) >= Number(c.mandateExpiry))
    throw Error("Mandate expired");
  if (BigInt(q.mandate.gasSpentWei) >= BigInt(q.mandate.maxGasWei))
    throw Error("Gas budget exhausted");
}
export async function prepare({ quoteUsd = "110", acceptedResultSha256 } = {}) {
  if (
    acceptedResultSha256 !== undefined &&
    acceptedResultSha256 !== createServiceResult().sha256
  )
    throw Error(
      "Accepted report hash does not match the proposed service result",
    );
  if (!["100", "110", "140"].includes(quoteUsd))
    throw Error("Choose one of the fixed quote terms");
  const d = deployment();
  if (!d) throw Error("Deploy contracts first: npm run deploy");
  // Recovery resumes the same prepared job rather than creating a second reserve/approval.
  let q = db.quotes.find((q) => ["Preparing", "Funded"].includes(q.status));
  if (db.quotes.some((q) => q.status === "Active"))
    throw Error(
      "An invoice is already active; finish or void it before creating another",
    );
  if (!q) {
    if (db.quotes.length >= 10)
      throw Error(
        "This isolated test wallet is limited to ten sample invoices",
      );
    const createdAt = Math.floor(Date.now() / 1000);
    const jobId = `invoice-${crypto.randomUUID()}`;
    const serviceResult = createServiceResult();
    const id = keccak256(toHex(jobId + ":" + serviceResult.sha256));
    q = {
      id,
      jobId,
      serviceResult,
      status: "Preparing",
      quoteUsd18: decimal18(quoteUsd).toString(),
      escrowUsdc: "100000000",
      reserveUsdt: "25000000",
      topupUsdt: "0",
      uncoveredUsd18: "0",
      escrowUsd18: "0",
      createdAt,
      settleAfter: createdAt,
      normalDeadline: createdAt + 900,
      deadline: createdAt + 2700,
      mandate: {
        id,
        network: 84532,
        contract: d.contract,
        usdc: d.usdc,
        usdt: d.usdt,
        expiresAt: createdAt + 1800,
        maxUsdc: "100000000",
        maxReserveUsdt: "25000000",
        maxGasWei: GAS_CAP.toString(),
        gasSpentWei: "0",
        maxApiFee: "0",
        maxActions: 1,
        actionsUsed: 0,
      },
      setupReceipts: [],
    };
    db.quotes.push(q);
    save();
  }
  if (!q.serviceResult) q.serviceResult = createServiceResult();
  q.mandate.acceptedResultSha256 = q.serviceResult.sha256;
  save();
  db.agent = {
    status: "preparing",
    quoteId: q.id,
    message: "Recording the bounded initial authorization.",
    steps: [],
  };
  save();
  for (const [op, role, address, contractAbi, fn, args] of [
    [
      "reserve-approval",
      "deployer",
      d.usdt,
      tokenAbi(),
      "approve",
      [d.contract, 25000000n],
    ],
    [
      "quote-funding",
      "deployer",
      d.contract,
      abi(),
      "createQuote",
      [
        q.id,
        d.payer,
        d.merchant,
        BigInt(q.quoteUsd18),
        100000000n,
        25000000n,
        BigInt(q.settleAfter),
        BigInt(q.normalDeadline),
        BigInt(q.deadline),
      ],
    ],
  ]) {
    step(op, "pending", "Initial setup transaction pending.");
    const r = await callTx(
      `${q.id}:${op}`,
      role,
      address,
      contractAbi,
      fn,
      args,
    );
    q.setupReceipts.push({ op, ...r });
    step(op, "confirmed", "Initial setup confirmed.", r.transactionHash);
  }
  const c = await chainQuote(q.id);
  if (
    c.payer.toLowerCase() !== d.payer.toLowerCase() ||
    c.beneficiary.toLowerCase() !== d.merchant.toLowerCase() ||
    c.funder.toLowerCase() !== d.reserveFunder.toLowerCase() ||
    c.quoteUsd18 !== BigInt(q.quoteUsd18) ||
    c.escrowAmount !== 100000000n ||
    c.reservedUsdt !== 25000000n ||
    Number(c.settleAfter) !== q.settleAfter ||
    Number(c.normalDeadline) !== q.normalDeadline ||
    Number(c.hardDeadline) !== q.deadline
  )
    throw Error("On-chain quote terms differ; buyer authorization stopped");
  for (const [op, address, contractAbi, fn, args] of [
    [
      "buyer-exact-approval",
      d.usdc,
      tokenAbi(),
      "approve",
      [d.contract, 100000000n],
    ],
    [
      "buyer-mandate",
      d.contract,
      abi(),
      "authorize",
      [q.id, BigInt(q.mandate.expiresAt), 100000000n],
    ],
  ]) {
    step(op, "pending", "Buyer initial authorization pending.");
    updateGas(q);
    const r = await callTx(
      `${q.id}:${op}`,
      "buyer",
      address,
      contractAbi,
      fn,
      args,
      { gasCap: BigInt(q.mandate.maxGasWei) - BigInt(q.mandate.gasSpentWei) },
    );
    updateGas(q);
    q.setupReceipts.push({ op, ...r });
    step(
      op,
      "confirmed",
      "Exact invoice authority confirmed.",
      r.transactionHash,
    );
  }
  await syncQuote(q);
  db.agent.status = "authorized";
  step(
    "Mandate ready",
    "confirmed",
    "One invoice, one recipient, one payment. The agent can now act.",
  );
  return q;
}
export async function run(quoteId) {
  const q = db.quotes.find((q) => q.id === quoteId);
  if (!q) throw Error("Unknown invoice");
  const d = deployment();
  const c = await syncQuote(q);
  if (db.agent.quoteId !== q.id)
    db.agent = q.agentTrace
      ? structuredClone(q.agentTrace)
      : {
          quoteId: q.id,
          status: "running",
          message: "Reconciling approved invoice.",
          steps: [],
        };
  const savedPayment = read(".local/transactions.json", {})[`${q.id}:payment`];
  if ([3, 4].includes(c.state) && savedPayment) {
    const o = q.paymentOracle;
    const receipt = await callTx(
      `${q.id}:payment`,
      "deployer",
      d.contract,
      abi(),
      "payApprovedQuote",
      [q.id, BigInt(o.timestamp), toHex(o.data), o.signature],
    );
    deliver(q, receipt);
    save();
  }
  if ([3, 4].includes(c.state) && !savedPayment && !q.receipt) {
    const from =
      q.setupReceipts.find((r) => r.op === "quote-funding")?.blockNumber ||
      d.receipts.bond.blockNumber;
    const events = await publicClient.getContractEvents({
      address: d.contract,
      abi: abi(),
      eventName: "QuotePaid",
      args: { quoteId: q.id },
      fromBlock: BigInt(from),
    });
    if (!events.length)
      throw Error(
        "Paid quote detected; event reconciliation is required before further action",
      );
    deliver(q, await loadReceipt(events[0].transactionHash));
    save();
  }
  if ([3, 4].includes(c.state)) {
    db.agent.status = "confirmed";
    step(
      "Duplicate intent blocked",
      "rejected",
      "Already paid on-chain. No new transaction or charge.",
    );
    return { duplicate: true, quote: q };
  }
  if (db.agent.quoteId !== q.id)
    db.agent = q.agentTrace
      ? structuredClone(q.agentTrace)
      : {
          quoteId: q.id,
          status: "running",
          message: "Resuming approved invoice.",
          steps: [],
        };
  db.agent.status = "running";
  save();
  try {
    if (!savedPayment) validateMandate(q, c, d);
    step(
      "Validate mandate",
      "confirmed",
      "Pinned merchant, assets, amount, deadline and action cap accepted.",
    );
    const pending = read(".local/transactions.json", {})[`${q.id}:payment`];
    let oracle;
    if (pending) {
      oracle = q.paymentOracle;
      if (!oracle)
        throw Error("Saved transaction has no saved proof; inspect journal");
      step(
        "Reconcile saved intent",
        "pending",
        "Checking the exact saved transaction hash before retry.",
      );
    } else {
      step(
        "Request signed prices",
        "pending",
        "Fetching USDC/USD and USDT/USD from Nodary. Data fee: $0.",
      );
      oracle = await refreshOracle();
      q.paymentOracle = oracle;
      Object.assign(
        q,
        calculate(q, BigInt(oracle.usdc18), BigInt(oracle.usdt18)),
      );
      save();
      await publicClient.simulateContract({
        address: d.contract,
        abi: abi(),
        functionName: "payApprovedQuote",
        args: [
          q.id,
          BigInt(oracle.timestamp),
          toHex(oracle.data),
          oracle.signature,
        ],
        account: roles().deployer.address,
      });
      step(
        "Check signed prices",
        "confirmed",
        "Expected signer, exact request and all three timestamps accepted.",
      );
    }
    if (!pending) validateMandate(q, await chainQuote(q.id), d);
    step(
      "Pay approved invoice",
      "pending",
      "Submitting the atomic USDC payment and capped USDT top-up.",
    );
    const receipt = await callTx(
      `${q.id}:payment`,
      "deployer",
      d.contract,
      abi(),
      "payApprovedQuote",
      [q.id, BigInt(oracle.timestamp), toHex(oracle.data), oracle.signature],
      { gasCap: BigInt(q.mandate.maxGasWei) - BigInt(q.mandate.gasSpentWei) },
    );
    await syncQuote(q);
    const delivered = deliver(q, receipt);
    db.agent.status = "confirmed";
    step(
      "Confirm merchant receipt",
      "confirmed",
      q.status === "Capped"
        ? "Payment confirmed. Reserve cap reached; uncovered USD is shown."
        : BigInt(q.topupUsdt) === 0n
          ? "Merchant received the invoice USDC. No USDT top-up was needed."
          : "Merchant received USDC plus the signed-price shortfall in USDT.",
      receipt.transactionHash,
    );
    save();
    return { quote: q, result: delivered };
  } catch (e) {
    updateGas(q);
    db.agent.status = "error";
    step("Payment paused", "rejected", e.shortMessage || e.message);
    throw e;
  }
}
export async function voidInvoice(id) {
  const q = db.quotes.find((q) => q.id === id);
  if (!q) throw Error("Unknown invoice");
  const r = await callTx(
    `${id}:void`,
    "deployer",
    deployment().contract,
    abi(),
    "voidQuote",
    [id],
  );
  await syncQuote(q);
  step(
    "Void invoice",
    "confirmed",
    "Unpaid USDC remains with buyer; reserve returned to funder.",
    r.transactionHash,
  );
  return r;
}
export async function tamper(kind, { broadcast = false, quoteId } = {}) {
  if (!["edited", "stale", "wrong-request", "wrong-signer"].includes(kind))
    throw Error("Unknown proof case");
  const d = deployment();
  let q = quoteId
    ? db.quotes.find((q) => q.id === quoteId)
    : db.quotes.find((q) => q.evidenceOnly && q.status === "Active");
  if (!q) {
    const recorded = read(`evidence/tamper-${kind}.json`);
    if (!recorded?.receipt?.blockNumber)
      throw Error("No recorded rejection yet; run npm run evidence");
    const r = recorded.response;
    try {
      await publicClient.simulateContract({
        address: recorded.contract || read("evidence/deployment.json").contract,
        abi: abi(),
        functionName: "payApprovedQuote",
        args: [
          recorded.quoteId,
          BigInt(r.timestamp),
          toHex(r.data),
          r.signature,
        ],
        account: d.reserveFunder,
        blockNumber: BigInt(recorded.receipt.blockNumber),
      });
      throw Error("UNSAFE: historical response was accepted");
    } catch (e) {
      let decoded = e;
      while (decoded && !decoded.data?.errorName) decoded = decoded.cause;
      const expected =
        kind === "stale" ? "ResponseTooOld" : "NotSignedByAirnode";
      if (decoded?.data?.errorName !== expected)
        throw Error(
          "Historical verification unavailable: " +
            (e.shortMessage || e.message),
        );
      return {
        kind,
        status: "rejected",
        reason:
          expected +
          " · replay at recorded block " +
          recorded.receipt.blockNumber,
        method: "historical deployed-contract eth_call; no new transaction",
        txHash: recorded.txHash,
        historical: true,
        at: Math.floor(Date.now() / 1000),
      };
    }
  }
  const active = await chainQuote(q.id);
  const now = Math.floor(Date.now() / 1000);
  if (
    active.state !== 2 ||
    now >= Number(active.mandateExpiry) ||
    now < Number(active.settleAfter) ||
    now > Number(active.hardDeadline)
  )
    throw Error(
      "Verification invoice must be active and within its authorization window",
    );
  let r;
  if (kind === "stale") r = read("evidence/first-response.json");
  else if (kind === "wrong-request")
    r = await fetchResponse({
      operation: "latestFeeds",
      parameters: { name: "ETH/USD" },
      responseProjection: {
        price: "/ETH~1USD/value",
        updatedAt: "/ETH~1USD/timestamp",
      },
    });
  else r = await fetchResponse();
  if (kind === "edited")
    r = { ...r, data: r.data.replace(/("usdc":)\s*[^,}]+/, "$10.5") };
  if (kind === "wrong-signer") {
    const key = privateKeyToAccount(generatePrivateKey());
    r = {
      ...r,
      signature: await key.signMessage({ message: { raw: digest(r) } }),
    };
  }
  const before = await balanceSnapshot();
  const qBefore = await chainQuote(q.id);
  let reason;
  try {
    await publicClient.simulateContract({
      address: d.contract,
      abi: abi(),
      functionName: "payApprovedQuote",
      args: [q.id, BigInt(r.timestamp), toHex(r.data), r.signature],
      account: roles().deployer.address,
    });
    throw Error("UNSAFE: response was accepted");
  } catch (e) {
    if (e.message === "UNSAFE: response was accepted") throw e;
    let cause = e;
    while (cause.cause) cause = cause.cause;
    const expected = kind === "stale" ? "ResponseTooOld" : "NotSignedByAirnode";
    let decoded = e;
    while (decoded && !decoded.data?.errorName) decoded = decoded.cause;
    if (decoded?.data?.errorName !== expected)
      throw Error(
        `Expected ${expected}; cannot count this failure: ${e.shortMessage || e.message}`,
      );
    reason = expected;
  }
  let receipt;
  if (broadcast)
    receipt = await callTx(
      `${q.id}:tamper:${kind}`,
      "deployer",
      d.contract,
      abi(),
      "payApprovedQuote",
      [q.id, BigInt(r.timestamp), toHex(r.data), r.signature],
      { gasCap: GAS_CAP, allowRevert: true },
    );
  const after = await balanceSnapshot();
  const qAfter = await chainQuote(q.id);
  if (json(before) !== json(after) || json(qBefore) !== json(qAfter))
    throw Error("Protected state changed during rejection test");
  if (receipt && receipt.status !== "reverted")
    throw Error("Tamper transaction unexpectedly succeeded");
  const result = {
    kind,
    contract: d.contract,
    status: "rejected",
    reason,
    at: Math.floor(Date.now() / 1000),
    quoteId: q.id,
    response: r,
    before,
    after,
    protectedStateUnchanged: true,
    txHash: receipt?.transactionHash,
    receipt,
    method: broadcast
      ? "deployed transaction (reverted; gas spent)"
      : "deployed contract eth_call (no broadcast)",
  };
  db.evidence.push(result);
  save();
  write(`evidence/tamper-${kind}.json`, result);
  return result;
}
export async function state() {
  const d = deployment();
  await Promise.all(
    db.quotes.filter((q) => q.status !== "Preparing").map(syncQuote),
  );
  const visible = db.quotes.filter((q) => !q.evidenceOnly);
  const last = visible.at(-1);
  const trace = last?.agentTrace || {
    status: last?.status === "Settled" ? "confirmed" : "idle",
    message: last?.receipt
      ? "Confirmed invoice payment."
      : "Authorize one invoice to delegate its payment.",
    steps: last?.receipt
      ? [
          {
            id: last.id,
            label: "Confirm merchant receipt",
            status: "confirmed",
            txHash: last.txHash,
            at: last.deliveredResult?.confirmedAt,
            detail: "Payment and top-up confirmed in the saved chain receipt.",
          },
        ]
      : [],
  };
  return {
    deployment: d,
    localSignerReady: signerReady(),
    quotes: visible,
    activeQuote: last || null,
    oracle: db.oracle,
    agent: trace,
    evidence: db.evidence,
    history: visible,
  };
}
