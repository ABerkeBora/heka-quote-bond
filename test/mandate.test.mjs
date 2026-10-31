import test from "node:test";
import assert from "node:assert/strict";
import { validateMandate } from "../server/agent.mjs";

const address = (digit) => `0x${digit.repeat(40)}`;
const deployment = {
  payer: address("1"),
  merchant: address("2"),
  reserveFunder: address("3"),
  contract: address("4"),
  usdc: address("5"),
  usdt: address("6"),
};
function sample() {
  const id = `0x${"ab".repeat(32)}`;
  const q = {
    id,
    quoteUsd18: "110000000000000000000",
    mandate: {
      id,
      network: 84532,
      contract: deployment.contract,
      usdc: deployment.usdc,
      usdt: deployment.usdt,
      maxUsdc: "100000000",
      maxReserveUsdt: "25000000",
      maxActions: 1,
      actionsUsed: 0,
      maxGasWei: "200000000000000",
      gasSpentWei: "0",
    },
  };
  const c = {
    payer: deployment.payer,
    beneficiary: deployment.merchant,
    funder: deployment.reserveFunder,
    escrowAmount: 100000000n,
    reservedUsdt: 25000000n,
    quoteUsd18: BigInt(q.quoteUsd18),
    mandateExpiry: BigInt(Math.floor(Date.now() / 1000) + 600),
  };
  return { q, c, d: structuredClone(deployment) };
}

test("one exact bounded mandate is accepted without any key or network access", () => {
  const { q, c, d } = sample();
  assert.doesNotThrow(() => validateMandate(q, c, d));
});

for (const field of ["payer", "beneficiary", "funder"]) {
  test(`an unapproved ${field} is rejected before signing`, () => {
    const { q, c, d } = sample();
    c[field] = address("9");
    assert.throws(() => validateMandate(q, c, d), /Recipient or payer/);
  });
}

test("a different intent ID cannot borrow an existing mandate", () => {
  const { q, c, d } = sample();
  q.mandate.id = `0x${"cd".repeat(32)}`;
  assert.throws(() => validateMandate(q, c, d), /Recipient or payer/);
});

test("USDC spend, reserve and USD quote cannot exceed or change the mandate", () => {
  for (const change of [
    ({ q }) => {
      q.mandate.maxUsdc = "99999999";
    },
    ({ c }) => {
      c.escrowAmount += 1n;
    },
    ({ c }) => {
      c.reservedUsdt += 1n;
    },
    ({ c }) => {
      c.quoteUsd18 += 1n;
    },
  ]) {
    const data = sample();
    change(data);
    assert.throws(
      () => validateMandate(data.q, data.c, data.d),
      /budget or quote/,
    );
  }
});

test("network, contract and both token addresses are allowlisted", () => {
  for (const change of [
    ({ q }) => {
      q.mandate.network = 1;
    },
    ...["contract", "usdc", "usdt"].map((field) => ({ q }) => {
      q.mandate[field] = address("9");
    }),
  ]) {
    const data = sample();
    change(data);
    assert.throws(
      () => validateMandate(data.q, data.c, data.d),
      /Network, asset or contract/,
    );
  }
});

test("the one-action cap blocks an already consumed intent", () => {
  const { q, c, d } = sample();
  q.mandate.actionsUsed = 1;
  assert.throws(() => validateMandate(q, c, d), /Duplicate intent/);
});

test("expiry and exhausted gas budget stop new signing", () => {
  const expired = sample();
  expired.c.mandateExpiry = BigInt(Math.floor(Date.now() / 1000));
  assert.throws(
    () => validateMandate(expired.q, expired.c, expired.d),
    /expired/,
  );
  const exhausted = sample();
  exhausted.q.mandate.gasSpentWei = exhausted.q.mandate.maxGasWei;
  assert.throws(
    () => validateMandate(exhausted.q, exhausted.c, exhausted.d),
    /Gas budget/,
  );
});
