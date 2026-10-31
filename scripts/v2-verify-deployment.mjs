import fs from "node:fs";
import crypto from "node:crypto";
import { deployment, publicClient, artifact } from "../server/v2/chain.mjs";
import { writeEvidence } from "../server/v2/store.mjs";
const d = deployment(),
  a = artifact("QuoteBondCoverage");
function normalize(hex) {
  const bytes = hex.slice(2).split("");
  for (const refs of Object.values(a.deployedBytecode.immutableReferences))
    for (const r of refs)
      bytes.splice(r.start * 2, r.length * 2, ..."0".repeat(r.length * 2));
  return bytes.join("");
}
const actual = await publicClient.getCode({ address: d.contract }),
  hash = crypto
    .createHash("sha256")
    .update(fs.readFileSync("contracts/QuoteBondCoverage.sol"))
    .digest("hex");
if (
  normalize(actual) !== normalize(a.deployedBytecode.object) ||
  hash !== d.contractSourceSha256
)
  throw Error("V2 deployed runtime/source mismatch");
const pinned = {};
for (const n of ["airnode", "requestHash", "usdc", "usdt"])
  pinned[n] = await publicClient.readContract({
    address: d.contract,
    abi: a.abi,
    functionName: n,
  });
writeEvidence("deployment-verification.json", {
  chainId: 84532,
  contract: d.contract,
  bytecodeMatchesLocalArtifact: true,
  immutableSlotsNormalized: true,
  sourceSha256: hash,
  pinned,
  checkedAt: new Date().toISOString(),
  explorerVerification: "Not claimed; RPC runtime bytecode comparison",
});
console.log("V2 final source and deployed runtime match");
