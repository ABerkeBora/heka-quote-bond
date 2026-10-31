import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  REQUEST,
  REQUEST_HASH,
  AIRNODE,
  deriveRequestHash,
  rawPrice,
  decimal18,
  calculate,
  verify,
} from "../server/oracle.mjs";

const real = JSON.parse(
  fs.readFileSync(
    new URL("../evidence/first-response.json", import.meta.url),
    "utf8",
  ),
);
const one = 10n ** 18n;
const quote = {
  quoteUsd18: (110n * one).toString(),
  escrowUsdc: "100000000",
  reserveUsdt: "25000000",
};

test("canonical request hash is fixed and independent of object key insertion order", () => {
  assert.equal(
    REQUEST_HASH,
    "0x5e2ded887668087a5a3151af552932c0ab022114f63c38bb7a147390c4fe23ec",
  );
  const reordered = {
    responseProjection: Object.fromEntries(
      Object.entries(REQUEST.responseProjection).reverse(),
    ),
    parameters: { name: "USDC/USD,USDT/USD" },
    operation: "latestFeeds",
  };
  assert.equal(deriveRequestHash(reordered), REQUEST_HASH);
  assert.notEqual(
    deriveRequestHash({
      ...REQUEST,
      parameters: { name: "USDT/USD,USDC/USD" },
    }),
    REQUEST_HASH,
  );
  assert.notEqual(
    deriveRequestHash({
      ...REQUEST,
      responseProjection: {
        ...REQUEST.responseProjection,
        usdc: "/USDT~1USD/value",
      },
    }),
    REQUEST_HASH,
  );
});

test("signed decimal lexemes keep every supported atomic digit", () => {
  assert.equal(rawPrice('{"usdc":1.000000000000000001}', "usdc"), one + 1n);
  assert.equal(rawPrice('{"usdc":"0.000000000000000001"}', "usdc"), 1n);
  assert.equal(
    rawPrice('{"usdc":1.1234567891234567899}', "usdc"),
    1123456789123456789n,
  );
  assert.equal(decimal18("110"), 110n * one);
});

test("unsupported or missing prices fail closed instead of becoming a dollar", () => {
  for (const data of [
    "{}",
    '{"usdc":null}',
    '{"usdc":-1}',
    '{"usdc":1e-7}',
    '{"usdc":""}',
    '{"usdc":1,"usdc":2}',
  ]) {
    assert.throws(() => rawPrice(data, "usdc"));
  }
  assert.throws(() => calculate(quote, one, 0n));
  assert.throws(() => calculate(quote, -one, one));
});

test("shortfall uses the actual USDT price and a separate reserve", () => {
  assert.deepEqual(calculate(quote, one, decimal18("0.8")), {
    escrowUsd18: (100n * one).toString(),
    requestedUsdt: "12500000",
    topupUsdt: "12500000",
    uncoveredUsd18: "0",
  });
});

test("cap and uncovered amount reconcile rather than promising full protection", () => {
  assert.deepEqual(calculate(quote, decimal18("0.5"), decimal18("0.8")), {
    escrowUsd18: (50n * one).toString(),
    requestedUsdt: "75000000",
    topupUsdt: "25000000",
    uncoveredUsd18: (40n * one).toString(),
  });
});

test("zero shortfall and one-atom ceil rounding are explicit", () => {
  const zero = calculate(quote, decimal18("1.1"), decimal18("0.8"));
  assert.equal(zero.topupUsdt, "0");
  assert.equal(zero.uncoveredUsd18, "0");
  const lastAtom = calculate(
    quote,
    decimal18("1.099999999999999999"),
    decimal18("0.999"),
  );
  assert.equal(lastAtom.requestedUsdt, "1");
  assert.equal(lastAtom.topupUsdt, "1");
  assert.equal(lastAtom.uncoveredUsd18, "0");
});

test("a real Nodary envelope recovers only the pinned signer and fixed request", async () => {
  const result = await verify(real, { fresh: false });
  assert.equal(result.signer.toLowerCase(), AIRNODE.toLowerCase());
  assert.equal(result.requestHash, REQUEST_HASH);
  assert.equal(result.verified, true);
});

test("editing a real signed value cannot pass verification", async () => {
  const edited = {
    ...real,
    data: real.data.replace(/("usdc":)\s*[^,}]+/, "$1" + "0.5"),
  };
  assert.notEqual(edited.data, real.data);
  await assert.rejects(
    verify(edited, { fresh: false }),
    /Wrong signer|edited data/,
  );
  await assert.rejects(
    verify({ ...real, requestHash: `0x${"11".repeat(32)}` }, { fresh: false }),
    /Wrong request/,
  );
});

test("unchanged real envelope is accepted at age 120 and rejected at age 121", async () => {
  const signedAt = Number(real.timestamp);
  await verify(real, { now: signedAt + 120 });
  await assert.rejects(
    verify(real, { now: signedAt + 121 }),
    /Envelope is stale/,
  );
  await assert.rejects(
    verify(real, { now: signedAt - 61 }),
    /Envelope is stale|Source observation/,
  );
});

test("a real signature does not disable source-age checks", async () => {
  const signedAt = Number(real.timestamp);
  await assert.rejects(
    verify(real, { now: signedAt + 301 }),
    /Source observation is stale/,
  );
});
