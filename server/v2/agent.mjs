import { keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  db,
  save,
  readLocal,
  writeLocal,
  writeEvidence,
  readEvidence,
  json,
  step,
} from "./store.mjs";
import {
  deployment,
  roles,
  publicClient,
  abi,
  tokenAbi,
  chainQuote,
  policyHash,
  syncQuote,
  callTx,
  paidEvent,
  balanceSnapshot,
  signerReady,
  loadReceipt,
} from "./chain.mjs";
import {
  fetchOracle,
  fetchResponse,
  calculate,
  decimal18,
  digest,
} from "../oracle.mjs";
import { createServiceResult } from "../service.mjs";
import { coverageDecision, validateMandate } from "./policy.mjs";
export const GAS_CAP = 200000000000000n;
const ACCEPT_GAS_CAP = 50000000000000n;
export function updateGas(q) {
  const j = readLocal("transactions.json", {});
  q.mandate.gasSpentWei = Object.entries(j)
    .filter(([id]) =>
      ["buyer-approval", "buyer-mandate", "payment"].some(
        (s) => id === `${q.id}:${s}`,
      ),
    )
    .reduce((sum, [, e]) => sum + BigInt(e.receipt?.gasCostWei || "0"), 0n)
    .toString();
  q.merchantGasSpentWei =
    j[`${q.id}:merchant-accept`]?.receipt?.gasCostWei || "0";
  save();
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
function sameAddress(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}
async function assertTerms(q) {
  const d = deployment(),
    c = await chainQuote(q.id);
  if (
    !sameAddress(c.payer, d.payer) ||
    !sameAddress(c.beneficiary, d.merchant) ||
    !sameAddress(c.funder, d.reserveFunder) ||
    c.escrowAmount !== BigInt(q.escrowUsdc) ||
    c.reservedUsdt !== BigInt(q.reserveUsdt) ||
    c.quoteUsd18 !== BigInt(q.quoteUsd18) ||
    c.maxUncoveredUSD18 !== BigInt(q.maxUncoveredUsd18) ||
    Number(c.merchantAcceptanceExpiry) !== q.merchantAcceptanceExpiry ||
    Number(c.settleAfter) !== q.settleAfter ||
    Number(c.normalDeadline) !== q.normalDeadline ||
    Number(c.hardDeadline) !== q.deadline
  )
    throw Error("Immutable V2 quote terms do not match the reviewed policy");
  const h = await policyHash(q.id);
  if (q.policyHash && h !== q.policyHash)
    throw Error("Merchant policy hash changed");
  return { c, h };
}
export async function prepare({
  quoteUsd = "110",
  maxUncoveredUsd = "0",
  acceptedResultSha256,
} = {}) {
  if (
    !["110", "140"].includes(quoteUsd) ||
    !["0", "20"].includes(maxUncoveredUsd)
  )
    throw Error("Use fixed quote and coverage choices");
  const service = createServiceResult();
  if (
    acceptedResultSha256 !== undefined &&
    acceptedResultSha256 !== service.sha256
  )
    throw Error("Report acceptance hash mismatch");
  const d = deployment();
  if (!d || !signerReady())
    throw Error("Configure/deploy isolated V2 wallets first");
  let q = db.quotes.find((q) => q.status === "Preparing");
  if (!q) {
    if (db.quotes.length >= 10)
      throw Error("V2 isolated test limit is10 invoices");
    const now = Math.floor(Date.now() / 1000),
      jobId = `coverage-${crypto.randomUUID()}`,
      id = keccak256(toHex("quote-bond-v2:" + jobId + ":" + service.sha256));
    q = {
      id,
      jobId,
      status: "Preparing",
      quoteUsd18: decimal18(quoteUsd).toString(),
      maxUncoveredUsd18: decimal18(maxUncoveredUsd).toString(),
      escrowUsdc: "100000000",
      reserveUsdt: "25000000",
      topupUsdt: "0",
      uncoveredUsd18: "0",
      escrowUsd18: "0",
      createdAt: now,
      settleAfter: now,
      normalDeadline: now + 900,
      deadline: now + 2700,
      merchantAcceptanceExpiry: now + 1800,
      merchantAccepted: false,
      buyerAuthorized: false,
      serviceResult: service,
      setupReceipts: [],
      coverageState: "unchecked",
      mandate: {
        id,
        network: 84532,
        contract: d.contract,
        usdc: d.usdc,
        usdt: d.usdt,
        maxUsdc: "100000000",
        maxReserveUsdt: "25000000",
        maxUncoveredUsd18: decimal18(maxUncoveredUsd).toString(),
        expiresAt: 0,
        maxGasWei: GAS_CAP.toString(),
        gasSpentWei: "0",
        maxApiFee: "0",
        maxActions: 1,
        actionsUsed: 0,
        acceptedResultSha256: service.sha256,
      },
    };
    db.quotes.push(q);
    save();
  }
  db.agent = {
    quoteId: q.id,
    status: "preparing",
    steps: [],
    message: "Funding immutable coverage terms.",
  };
  step(
    q,
    "Fund quote",
    "pending",
    "Allocating a separate V2 reserve; buyer USDC is not debited.",
  );
  for (const [op, address, ca, fn, args] of [
    [
      "reserve-approval",
      d.usdt,
      tokenAbi(),
      "approve",
      [d.contract, 25000000n],
    ],
    [
      "quote-funding",
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
        BigInt(q.maxUncoveredUsd18),
        BigInt(q.merchantAcceptanceExpiry),
      ],
    ],
  ]) {
    const r = await callTx(`${q.id}:${op}`, "deployer", address, ca, fn, args, {
      gasCap: GAS_CAP,
    });
    if (!q.setupReceipts.some((x) => x.op === op))
      q.setupReceipts.push({ op, ...r });
    save();
  }
  const { h } = await assertTerms(q);
  q.policyHash = h;
  q.mandate.merchantPolicyHash = h;
  await syncQuote(q);
  db.agent.status = "awaiting-merchant";
  step(
    q,
    "Quote prepared",
    "confirmed",
    "Coverage limit is fixed. The merchant must accept this exact policy before payment.",
  );
  return q;
}
export async function merchantAccept(id) {
  const q = db.quotes.find((q) => q.id === id);
  if (!q) throw Error("Unknown V2 invoice");
  const { c, h } = await assertTerms(q);
  if (c.merchantAccepted) {
    const saved = readLocal("transactions.json", {})[`${id}:merchant-accept`];
    let receipt;
    if (saved)
      receipt = await callTx(
        `${id}:merchant-accept`,
        "counterparty",
        deployment().contract,
        abi(),
        "acceptCoverage",
        [id, h],
      );
    else {
      const from =
        q.setupReceipts.find((x) => x.op === "quote-funding")?.blockNumber ||
        deployment().receipts.bond.blockNumber;
      const events = await publicClient.getContractEvents({
        address: deployment().contract,
        abi: abi(),
        eventName: "CoverageAccepted",
        args: { quoteId: id },
        fromBlock: BigInt(from),
      });
      if (events.length) receipt = await loadReceipt(events[0].transactionHash);
    }
    if (!receipt) throw Error("Accepted coverage needs receipt reconciliation");
    q.merchantAcceptanceTx = receipt.transactionHash;
    q.merchantAcceptanceReceipt = receipt;
    updateGas(q);
    await syncQuote(q);
    save();
    return q;
  }
  if (Math.floor(Date.now() / 1000) >= q.merchantAcceptanceExpiry)
    throw Error("Merchant acceptance expired");
  step(
    q,
    "Merchant acceptance",
    "pending",
    "The merchant role is accepting the exact immutable policy hash.",
  );
  const r = await callTx(
    `${id}:merchant-accept`,
    "counterparty",
    deployment().contract,
    abi(),
    "acceptCoverage",
    [id, h],
    { gasCap: ACCEPT_GAS_CAP },
  );
  q.merchantAcceptanceTx = r.transactionHash;
  q.merchantAcceptanceReceipt = r;
  updateGas(q);
  await syncQuote(q);
  db.agent.status = "awaiting-buyer";
  step(
    q,
    "Merchant accepted",
    "confirmed",
    "Maximum uncovered USD, parties, assets, amount and expiry are locked.",
    r.transactionHash,
  );
  writeEvidence(`acceptance/${id}.json`, {
    quote: q,
    policyHash: h,
    merchant: deployment().merchant,
    receipt: r,
  });
  return q;
}
export async function authorize(id) {
  const q = db.quotes.find((q) => q.id === id);
  if (!q) throw Error("Unknown V2 invoice");
  const { c } = await assertTerms(q);
  if (!c.merchantAccepted)
    throw Error("Merchant must accept before buyer authorization");
  if ([3, 4, 5].includes(c.state)) throw Error("Invoice is final");
  const expiry =
    q.mandate.expiresAt ||
    Math.min(Math.floor(Date.now() / 1000) + 1800, q.merchantAcceptanceExpiry);
  q.mandate.expiresAt = expiry;
  save();
  if (Math.floor(Date.now() / 1000) >= expiry)
    throw Error("Authorization expired");
  step(
    q,
    "Buyer authorization",
    "pending",
    "Recording exact100USDC and one payment under the accepted merchant policy.",
  );
  for (const [op, address, ca, fn, args] of [
    [
      "buyer-approval",
      deployment().usdc,
      tokenAbi(),
      "approve",
      [deployment().contract, 100000000n],
    ],
    [
      "buyer-mandate",
      deployment().contract,
      abi(),
      "authorize",
      [id, BigInt(expiry), 100000000n],
    ],
  ]) {
    updateGas(q);
    const r = await callTx(`${id}:${op}`, "buyer", address, ca, fn, args, {
      gasCap: GAS_CAP - BigInt(q.mandate.gasSpentWei),
    });
    if (!q.setupReceipts.some((x) => x.op === op))
      q.setupReceipts.push({ op, ...r });
    updateGas(q);
  }
  await syncQuote(q);
  db.agent.status = "authorized";
  step(
    q,
    "Buyer mandate ready",
    "confirmed",
    "The agent may pay once if the signed-price coverage satisfies the merchant limit.",
  );
  return q;
}
function deliver(q, r) {
  const e = paidEvent(r);
  if (!e || e.quoteId !== q.id)
    throw Error("Payment event reconciliation failed");
  q.txHash = r.transactionHash;
  q.receipt = r;
  q.escrowUsd18 = ((e.paidUsdc * e.usdcPrice18) / 1000000n).toString();
  q.topupUsdt = e.paidUsdt.toString();
  q.uncoveredUsd18 = e.uncoveredUsd18.toString();
  q.coverageState = "allowed";
  q.coverageAllowed = true;
  q.deliveredResult = {
    serviceResultSha256: q.serviceResult.sha256,
    receipt: r.transactionHash,
    paidUsdc: e.paidUsdc.toString(),
    paidUsdt: e.paidUsdt.toString(),
    uncoveredUsd18: e.uncoveredUsd18.toString(),
    maxUncoveredUsd18: q.maxUncoveredUsd18,
    merchantPolicyHash: q.policyHash,
  };
  updateGas(q);
  writeEvidence(`receipts/${q.id}.json`, {
    quote: q,
    oracle: q.paymentOracle,
    receipt: r,
    result: q.deliveredResult,
  });
  return q.deliveredResult;
}
export async function run(id) {
  const q = db.quotes.find((q) => q.id === id);
  if (!q) throw Error("Unknown V2 invoice");
  const d = deployment(),
    c = await syncQuote(q);
  if (db.agent.quoteId !== id)
    db.agent = q.agentTrace
      ? structuredClone(q.agentTrace)
      : { quoteId: id, status: "idle", steps: [], message: "" };
  const entry = readLocal("transactions.json", {})[`${id}:payment`];
  if ([3, 4].includes(c.state)) {
    if (entry) {
      const o = q.paymentOracle;
      deliver(
        q,
        await callTx(
          `${id}:payment`,
          "deployer",
          d.contract,
          abi(),
          "payApprovedQuote",
          [id, BigInt(o.timestamp), toHex(o.data), o.signature],
        ),
      );
    } else if (!q.receipt) {
      const from =
        q.setupReceipts.find((x) => x.op === "quote-funding")?.blockNumber ||
        d.receipts.bond.blockNumber;
      const events = await publicClient.getContractEvents({
        address: d.contract,
        abi: abi(),
        eventName: "QuotePaid",
        args: { quoteId: id },
        fromBlock: BigInt(from),
      });
      if (!events.length)
        throw Error("Paid invoice needs event reconciliation");
      deliver(q, await loadReceipt(events[0].transactionHash));
    }
    db.agent.status = "confirmed";
    step(
      q,
      "Duplicate intent blocked",
      "rejected",
      "Already paid on-chain; no new transaction.",
    );
    return { duplicate: true, quote: q };
  }
  try {
    db.agent.status = "running";
    if (!entry) {
      validateMandate(q, c, d);
      const liveHash = await policyHash(id);
      if (liveHash !== q.policyHash)
        throw Error("Merchant policy hash mismatch");
      step(
        q,
        "Validate accepted mandate",
        "confirmed",
        "Merchant acceptance, buyer authority, roles and immutable terms match.",
      );
      step(
        q,
        "Request signed prices",
        "pending",
        "Fetching the fixed free Nodary USDC/USD+USDT/USD request.",
      );
      const o = await refreshOracle();
      q.lastOracle = o;
      const calc = calculate(q, BigInt(o.usdc18), BigInt(o.usdt18));
      q.lastCalculation = calc;
      Object.assign(q, calc);
      const decision = coverageDecision(calc, q.maxUncoveredUsd18);
      q.coverageAllowed = decision.allowed;
      q.coverageState = decision.allowed ? "allowed" : "blocked";
      save();
      if (!decision.allowed) {
        db.agent.status = "blocked";
        step(
          q,
          "Coverage payment blocked",
          "blocked",
          "A valid signed price leaves more USD uncovered than the merchant accepted. No payment transaction was signed or broadcast.",
        );
        writeEvidence(`blocked/${q.id}.json`, {
          quote: q,
          oracle: o,
          decision,
          noPaymentBroadcast: true,
          protectedQuoteUnconsumed: c.state === 2,
        });
        return { blocked: true, quote: q, decision };
      }
      q.paymentOracle = o;
      save();
      await publicClient.simulateContract({
        address: d.contract,
        abi: abi(),
        functionName: "payApprovedQuote",
        args: [id, BigInt(o.timestamp), toHex(o.data), o.signature],
        account: roles().deployer.address,
      });
      validateMandate(q, await chainQuote(id), d);
      step(
        q,
        "Coverage accepted",
        "confirmed",
        "The exact signed snapshot satisfies the locked merchant limit.",
      );
    }
    const o = q.paymentOracle;
    if (!o) throw Error("Saved intent missing its oracle proof");
    step(
      q,
      "Pay approved invoice",
      "pending",
      entry
        ? "Reconciling the saved transaction hash before any retry."
        : "Agent submitting the single permitted atomic payment.",
    );
    const r = await callTx(
      `${id}:payment`,
      "deployer",
      d.contract,
      abi(),
      "payApprovedQuote",
      [id, BigInt(o.timestamp), toHex(o.data), o.signature],
      { gasCap: GAS_CAP - BigInt(q.mandate.gasSpentWei) },
    );
    await syncQuote(q);
    const result = deliver(q, r);
    db.agent.status = "confirmed";
    step(
      q,
      "Merchant paid",
      "confirmed",
      q.status === "Capped"
        ? "Paid with the explicitly accepted partial coverage."
        : "Fully covered payment confirmed.",
      r.transactionHash,
    );
    return { quote: q, result };
  } catch (e) {
    updateGas(q);
    db.agent.status = "error";
    step(q, "Payment paused", "rejected", e.shortMessage || e.message);
    throw e;
  }
}
export async function voidInvoice(id) {
  const q = db.quotes.find((q) => q.id === id);
  if (!q) throw Error("Unknown V2 invoice");
  const r = await callTx(
    `${id}:void`,
    "deployer",
    deployment().contract,
    abi(),
    "voidQuote",
    [id],
    { gasCap: GAS_CAP },
  );
  await syncQuote(q);
  q.coverageState = "voided";
  q.coverageAllowed = false;
  save();
  step(
    q,
    "Reserve released",
    "confirmed",
    "Unpaid USDC remains with the buyer; reserve returned to the platform.",
    r.transactionHash,
  );
  return r;
}
export async function state() {
  await Promise.all(
    db.quotes.filter((q) => q.status !== "Preparing").map(syncQuote),
  );
  const q = db.quotes.filter((q) => !q.evidenceOnly).at(-1) || null;
  return {
    deployment: deployment(),
    localSignerReady: signerReady(),
    quotes: db.quotes.filter((q) => !q.evidenceOnly),
    activeQuote: q,
    oracle: db.oracle,
    agent: q?.agentTrace || db.agent,
    evidence: db.evidence,
    history: db.quotes.filter((q) => !q.evidenceOnly),
  };
}
export async function negative(kind, { quoteId, broadcast = false } = {}) {
  const q = db.quotes.find((q) => q.id === quoteId);
  if (!q) throw Error("Unknown V2 proof quote");
  const d = deployment();
  let o = readLocal(`proof-${q.id}-${kind}.json`, null);
  if (!o) {
    if (kind === "stale") o = readEvidence("first-response.json");
    else if (kind === "wrong-request")
      o = await fetchResponse({
        operation: "latestFeeds",
        parameters: { name: "ETH/USD" },
        responseProjection: {
          price: "/ETH~1USD/value",
          updatedAt: "/ETH~1USD/timestamp",
        },
      });
    else o = await fetchResponse();
    if (kind === "edited")
      o = { ...o, data: o.data.replace(/("usdc":)\s*[^,}]+/, "$10.5") };
    if (kind === "wrong-signer") {
      const a = privateKeyToAccount(generatePrivateKey());
      o = {
        ...o,
        signature: await a.signMessage({ message: { raw: digest(o) } }),
      };
    }
    writeLocal(`proof-${q.id}-${kind}.json`, o);
  }
  const expected =
    kind === "stale"
      ? "ResponseTooOld"
      : kind === "coverage"
        ? "CoverageInsufficient"
        : kind === "unaccepted"
          ? "MerchantNotAccepted"
          : "NotSignedByAirnode";
  const before = await balanceSnapshot(),
    cb = await chainQuote(q.id);
  let error;
  try {
    await publicClient.simulateContract({
      address: d.contract,
      abi: abi(),
      functionName: "payApprovedQuote",
      args: [q.id, BigInt(o.timestamp), toHex(o.data), o.signature],
      account: roles().deployer.address,
    });
    throw Error("UNSAFE proof accepted");
  } catch (e) {
    let x = e;
    while (x && !x.data?.errorName) x = x.cause;
    if (x?.data?.errorName !== expected)
      throw Error(`Expected${expected}; got ${e.shortMessage || e.message}`);
    error = x.data;
  }
  let receipt;
  if (broadcast)
    receipt = await callTx(
      `${q.id}:negative:${kind}`,
      "deployer",
      d.contract,
      abi(),
      "payApprovedQuote",
      [q.id, BigInt(o.timestamp), toHex(o.data), o.signature],
      { allowRevert: true, gasCap: GAS_CAP },
    );
  const after = await balanceSnapshot(),
    ca = await chainQuote(q.id);
  if (json(before) !== json(after) || json(cb) !== json(ca))
    throw Error("Protected V2 state changed on rejection");
  if (receipt && receipt.status !== "reverted")
    throw Error("Negative transaction did not revert");
  const result = {
    kind,
    contract: d.contract,
    quoteId: q.id,
    response: o,
    error,
    expected,
    receipt,
    txHash: receipt?.transactionHash,
    before,
    after,
    quoteBefore: cb,
    quoteAfter: ca,
    protectedStateUnchanged: true,
    at: Math.floor(Date.now() / 1000),
  };
  db.evidence.push({
    kind,
    status: "rejected",
    reason: expected,
    txHash: receipt?.transactionHash,
  });
  save();
  writeEvidence(`negative-${kind}.json`, result);
  return result;
}
