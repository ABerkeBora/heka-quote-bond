import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");

test("V2 preserves the frozen V1 contract, verifier and published evidence byte for byte", () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(root, "evidence/v2/v1-baseline-hashes.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.commit, "974ae378b3e953d1dc8804c51ffb721133be70a7");
  assert.ok(
    Object.keys(manifest.paths).length >= 30,
    "baseline inventory must not silently shrink",
  );
  for (const [file, expected] of Object.entries(manifest.paths)) {
    const actual = createHash("sha256")
      .update(fs.readFileSync(path.join(root, file)))
      .digest("hex");
    assert.equal(actual, expected, `V1 baseline changed: ${file}`);
  }
});

import { coverageDecision, validateMandate } from "../server/v2/policy.mjs";
import { calculate } from "../server/oracle.mjs";

const address = (digit) => `0x${digit.repeat(40)}`;
const NOW = 1800000000;
const USD = 10n ** 18n;
function mandate() {
  const id = `0x${"ab".repeat(32)}`;
  const policyHash = `0x${"ef".repeat(32)}`;
  const d = {
    payer: address("1"),
    merchant: address("2"),
    reserveFunder: address("3"),
    contract: address("4"),
    usdc: address("5"),
    usdt: address("6"),
  };
  const q = {
    id,
    policyHash,
    quoteUsd18: (140n * USD).toString(),
    maxUncoveredUsd18: (20n * USD).toString(),
    mandate: {
      id,
      network: 84532,
      contract: d.contract,
      usdc: d.usdc,
      usdt: d.usdt,
      merchantPolicyHash: policyHash,
      maxUncoveredUsd18: (20n * USD).toString(),
      maxUsdc: "100000000",
      maxReserveUsdt: "25000000",
      maxActions: 1,
      actionsUsed: 0,
      maxGasWei: "200000000000000",
      gasSpentWei: "1000",
    },
  };
  const c = {
    state: 2,
    payer: d.payer,
    beneficiary: d.merchant,
    funder: d.reserveFunder,
    merchantAccepted: true,
    merchantAcceptanceExpiry: BigInt(NOW + 900),
    mandateExpiry: BigInt(NOW + 600),
    maxUncoveredUSD18: 20n * USD,
    escrowAmount: 100000000n,
    reservedUsdt: 25000000n,
    quoteUsd18: 140n * USD,
  };
  return { q, c, d };
}

const validate = ({ q, c, d }, now = NOW) => validateMandate(q, c, d, now);

test("a pinned accepted merchant policy and one active payer mandate pass without keys or RPC", () => {
  assert.equal(validate(mandate()), true);
});

test("zero uncovered is admissible under a full-coverage-only policy", () => {
  assert.deepEqual(coverageDecision({ uncoveredUsd18: "0" }, "0"), {
    allowed: true,
    uncoveredUsd18: "0",
    maxUncoveredUsd18: "0",
  });
});

test("a full-policy rejection is not a rejection of the valid price itself", () => {
  const quote = {
    quoteUsd18: (140n * USD).toString(),
    escrowUsdc: "100000000",
    reserveUsdt: "25000000",
  };
  const calculation = calculate(quote, USD, USD);
  assert.equal(calculation.uncoveredUsd18, (15n * USD).toString());
  const before = structuredClone(calculation);
  assert.equal(coverageDecision(calculation, "0").allowed, false);
  assert.deepEqual(
    calculation,
    before,
    "preflight must not mutate the signed-price calculation",
  );
});

test("an explicitly accepted partial policy allows the exact inclusive limit, but not one USD18 atom above it", () => {
  const limit = 20n * USD;
  assert.equal(
    coverageDecision({ uncoveredUsd18: limit.toString() }, limit.toString())
      .allowed,
    true,
  );
  assert.equal(
    coverageDecision(
      { uncoveredUsd18: (limit + 1n).toString() },
      limit.toString(),
    ).allowed,
    false,
  );
});

test("coverage respects the actual USDT rate and precise residual after the capped payment", () => {
  const quote = {
    quoteUsd18: (140n * USD).toString(),
    escrowUsdc: "100000000",
    reserveUsdt: "25000000",
  };
  const result = calculate(quote, (98n * USD) / 100n, (9n * USD) / 10n);
  assert.equal(result.topupUsdt, "25000000");
  assert.equal(result.uncoveredUsd18, "19500000000000000000");
  assert.equal(coverageDecision(result, "19500000000000000000").allowed, true);
  assert.equal(coverageDecision(result, "19499999999999999999").allowed, false);
});

test("coverage comparisons retain integer digits above JavaScript Number precision", () => {
  const limit = 10n ** 26n + 17n;
  assert.equal(
    coverageDecision({ uncoveredUsd18: limit.toString() }, limit.toString())
      .allowed,
    true,
  );
  assert.equal(
    coverageDecision(
      { uncoveredUsd18: (limit + 1n).toString() },
      limit.toString(),
    ).allowed,
    false,
  );
});

test("negative or non-integer coverage amounts cannot become payment permission", () => {
  for (const [uncovered, limit] of [
    ["-1", "0"],
    ["0", "-1"],
    ["1.2", "2"],
    ["1", "2.5"],
    ["NaN", "0"],
  ]) {
    assert.throws(() => coverageDecision({ uncoveredUsd18: uncovered }, limit));
  }
});

test("an unaccepted quote or another quote's mandate is rejected before signing", () => {
  const noAcceptance = mandate();
  noAcceptance.c.merchantAccepted = false;
  assert.throws(() => validate(noAcceptance), /Merchant has not accepted/);
  const otherQuote = mandate();
  otherQuote.q.mandate.id = `0x${"cd".repeat(32)}`;
  assert.throws(() => validate(otherQuote), /not an active bounded mandate/);
});

test("final, void, funded and nonexistent quote states cannot reuse the payer authority", () => {
  for (const state of [0, 1, 3, 4, 5]) {
    const data = mandate();
    data.c.state = state;
    assert.throws(() => validate(data), /not an active bounded mandate/);
  }
});

test("merchant acceptance and buyer mandate expire exclusively at their respective boundaries", () => {
  const merchantExpired = mandate();
  merchantExpired.c.merchantAcceptanceExpiry = BigInt(NOW);
  assert.throws(() => validate(merchantExpired), /expired/);
  const buyerExpired = mandate();
  buyerExpired.c.mandateExpiry = BigInt(NOW);
  assert.throws(() => validate(buyerExpired), /expired/);
  const lastSecond = mandate();
  lastSecond.c.merchantAcceptanceExpiry = BigInt(NOW + 1);
  lastSecond.c.mandateExpiry = BigInt(NOW + 1);
  assert.equal(validate(lastSecond), true);
});

test("neither cached quote nor buyer mandate can widen the merchant's on-chain uncovered limit", () => {
  for (const change of [
    ({ q }) => {
      q.maxUncoveredUsd18 = (21n * USD).toString();
    },
    ({ q }) => {
      q.mandate.maxUncoveredUsd18 = (21n * USD).toString();
    },
    ({ c }) => {
      c.maxUncoveredUSD18 += 1n;
    },
    ({ q }) => {
      q.mandate.merchantPolicyHash = `0x${"11".repeat(32)}`;
    },
  ]) {
    const data = mandate();
    change(data);
    assert.throws(() => validate(data), /Coverage policy changed/);
  }
});

test("payer, merchant and reserve funder are pinned independently", () => {
  for (const field of ["payer", "beneficiary", "funder"]) {
    const data = mandate();
    data.c[field] = address("9");
    assert.throws(() => validate(data), /Unapproved V2 party/);
  }
});

test("a V1 or other deployment, chain or token cannot borrow the V2 mandate", () => {
  for (const change of [
    ({ q }) => {
      q.mandate.network = 1;
    },
    ...["contract", "usdc", "usdt"].map((field) => ({ q }) => {
      q.mandate[field] = address("9");
    }),
  ]) {
    const data = mandate();
    change(data);
    assert.throws(() => validate(data), /Unapproved V2 network or asset/);
  }
});

test("approval spend, separate reserve and USD invoice terms cannot silently expand", () => {
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
    const data = mandate();
    change(data);
    assert.throws(() => validate(data), /Invoice terms exceed mandate/);
  }
});

test("duplicate action and exhausted gas budget stop a new signature", () => {
  const duplicate = mandate();
  duplicate.q.mandate.actionsUsed = 1;
  assert.throws(() => validate(duplicate), /Duplicate intent/);
  const exhausted = mandate();
  exhausted.q.mandate.gasSpentWei = exhausted.q.mandate.maxGasWei;
  assert.throws(() => validate(exhausted), /Gas budget exhausted/);
});

test("the V1 payer engine, source readers, service, screen and original contract tests remain frozen", () => {
  // These hashes were read from v1-baseline:974ae378, not regenerated from the V2 tree.
  // The shared HTTP host/entrypoint may add the /next route; the V1 implementation itself stays unchanged.
  const frozen = {
    "contracts/test/QuoteBond.t.sol":
      "d3a5f1f01773eae886b15b1cb563cae9d35422a800e29074cf3c8921420e9d60",
    "server/agent.mjs":
      "75d874e2ad94e91addbb516ca03b70734d89d8dbecbcbf011de7372984614592",
    "server/chain.mjs":
      "a23bdbac90181bc9b37ce72e9177cc1bb20371a6ba30df546cbbf2ffcd5e2b8d",
    "server/oracle.mjs":
      "e024a29cd74d86a6c8197a2976620292c92c1f563a2c7c5f8481efc84501301a",
    "server/service.mjs":
      "c436be73e4c2fe59a1851e3b93266e1793371330b04a2ae77a850d85c5586d7a",
    "server/store.mjs":
      "a4b8e13b003a577d8a63ce4da2003a4605b808e559e8abaddff4d034c5389ec5",
    "web/src.jsx":
      "30730c63802ab97d666db27ec2255c9bd4c73b981324ef83e628150a24971502",
    "web/style.css":
      "c9f962e7fc0c67618d3142a9192cce4235049c45e043909a47bda181f893298c",
  };
  for (const [file, expected] of Object.entries(frozen)) {
    assert.equal(
      createHash("sha256")
        .update(fs.readFileSync(path.join(root, file)))
        .digest("hex"),
      expected,
      `Frozen V1 implementation changed: ${file}`,
    );
  }
});
