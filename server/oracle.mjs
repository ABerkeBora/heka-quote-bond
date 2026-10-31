import { encodePacked, keccak256, recoverMessageAddress, toHex } from "viem";
export const AIRNODE = "0xE70f1e8b22a21e4Bb5188918a3033341b281E4c0";
export const URL = "https://airnode-nodary.fly.dev/";
export const REQUEST = {
  operation: "latestFeeds",
  parameters: { name: "USDC/USD,USDT/USD" },
  responseProjection: {
    usdc: "/USDC~1USD/value",
    usdcUpdatedAt: "/USDC~1USD/timestamp",
    usdt: "/USDT~1USD/value",
    usdtUpdatedAt: "/USDT~1USD/timestamp",
  },
};
// Canonical derivation from api3dao/airnodehub-hackathon-starter/src/airnode-v2.ts (MIT).
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v === null || typeof v !== "object"
      ? v
      : Object.entries(v)
          .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
          .map(([k, v]) => [k, canonical(v)]);
export const deriveRequestHash = ({
  operation,
  parameters,
  responseProjection,
}) =>
  keccak256(
    toHex(
      JSON.stringify(
        responseProjection
          ? [operation, canonical(parameters), canonical(responseProjection)]
          : [operation, canonical(parameters)],
      ),
    ),
  );
export const REQUEST_HASH = deriveRequestHash(REQUEST);
export const digest = (r) =>
  keccak256(
    encodePacked(
      ["bytes32", "uint256", "bytes"],
      [r.requestHash, BigInt(r.timestamp), toHex(r.data)],
    ),
  );
export const decimal18 = (v) => {
  const s = String(v);
  if (!/^\d+(\.\d+)?$/.test(s)) throw Error("Unsupported non-positive decimal");
  const [a, b = ""] = s.split(".");
  return BigInt(a) * 10n ** 18n + BigInt((b + "0".repeat(18)).slice(0, 18));
};
// The signed top-level decimal lexeme is preserved; JSON.parse prices would introduce binary floats.
export function rawPrice(data, key) {
  const matches = [
    ...data.matchAll(
      new RegExp(
        '"' +
          key +
          '"\\s*:\\s*("[0-9]+(?:\\.[0-9]+)?"|[0-9]+(?:\\.[0-9]+)?)(?=\\s*[,}])',
        "g",
      ),
    ),
  ];
  if (matches.length !== 1) throw Error("Missing or repeated price");
  return decimal18(matches[0][1].replaceAll('"', ""));
}
export function calculate(quote, usdc, usdt) {
  if (usdc <= 0n || usdt <= 0n) throw Error("Price must be positive");
  const escrowUsd18 = (BigInt(quote.escrowUsdc) * usdc) / 1000000n;
  const shortfall =
    BigInt(quote.quoteUsd18) > escrowUsd18
      ? BigInt(quote.quoteUsd18) - escrowUsd18
      : 0n;
  const requested = (shortfall * 1000000n + usdt - 1n) / usdt;
  const paid =
    requested > BigInt(quote.reserveUsdt)
      ? BigInt(quote.reserveUsdt)
      : requested;
  const covered = (paid * usdt) / 1000000n;
  return {
    escrowUsd18: escrowUsd18.toString(),
    requestedUsdt: requested.toString(),
    topupUsdt: paid.toString(),
    uncoveredUsd18: (shortfall > covered ? shortfall - covered : 0n).toString(),
  };
}
export async function verify(
  r,
  { fresh = true, now = Math.floor(Date.now() / 1000) } = {},
) {
  if (r.requestHash !== REQUEST_HASH) throw Error("Wrong request");
  const signer = await recoverMessageAddress({
    message: { raw: digest(r) },
    signature: r.signature,
  });
  if (signer.toLowerCase() !== AIRNODE.toLowerCase())
    throw Error("Wrong signer or edited data");
  const d = JSON.parse(r.data);
  if (
    !d ||
    Array.isArray(d) ||
    Object.keys(d).sort().join(",") !==
      "usdc,usdcUpdatedAt,usdt,usdtUpdatedAt" ||
    Object.values(d).some((v) => v === null || typeof v === "object")
  )
    throw Error("Expected the exact flat projection");
  const usdc18 = rawPrice(r.data, "usdc"),
    usdt18 = rawPrice(r.data, "usdt");
  if (!usdc18 || !usdt18) throw Error("Zero price");
  for (const n of ["usdcUpdatedAt", "usdtUpdatedAt"]) {
    if (!Number.isSafeInteger(d[n]) || d[n] <= 0)
      throw Error("Missing source timestamp");
    const t = Math.floor(d[n] / 1000);
    if (
      fresh &&
      (t > now + 60 || t + 300 < now || t > Number(r.timestamp) + 60)
    )
      throw Error("Source observation is stale or in the future");
  }
  const t = Number(r.timestamp);
  if (
    !Number.isSafeInteger(t) ||
    t <= 0 ||
    (fresh && (t > now + 60 || t + 120 < now))
  )
    throw Error("Envelope is stale or in the future");
  return {
    ...r,
    usdc18: usdc18.toString(),
    usdt18: usdt18.toString(),
    usdcUpdatedAt: d.usdcUpdatedAt,
    usdtUpdatedAt: d.usdtUpdatedAt,
    signer,
    verified: true,
    fetchedAt: now,
  };
}
export async function fetchResponse(request = REQUEST) {
  const response = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Error(`Nodary HTTP ${response.status}: no signed result`);
  return response.json();
}
export async function fetchOracle() {
  return verify(await fetchResponse());
}
