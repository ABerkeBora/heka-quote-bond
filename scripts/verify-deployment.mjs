import { deployment, publicClient, artifact } from "../server/chain.mjs";
import { write } from "../server/store.mjs";
import fs from "node:fs";
import crypto from "node:crypto";
const d = deployment(),
  a = artifact("QuoteBond");
let expected = a.deployedBytecode.object;
let actual = await publicClient.getCode({ address: d.contract });
function normalize(hex) {
  const arr = hex.slice(2).split("");
  for (const refs of Object.values(a.deployedBytecode.immutableReferences))
    for (const r of refs)
      arr.splice(r.start * 2, r.length * 2, ..."0".repeat(r.length * 2));
  return arr.join("");
}
const bytecodeMatch = normalize(expected) === normalize(actual);
const sourceSha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync("contracts/QuoteBond.sol"))
  .digest("hex");
if (!bytecodeMatch || sourceSha256 !== d.contractSourceSha256)
  throw Error("Deployed bytecode/source mismatch");
const pinned = {};
for (const n of ["airnode", "requestHash", "usdc", "usdt"])
  pinned[n] = await publicClient.readContract({
    address: d.contract,
    abi: a.abi,
    functionName: n,
  });
write("evidence/deployment-verification.json", {
  contract: d.contract,
  network: 84532,
  bytecodeMatchesLocalArtifact: true,
  immutableNormalization:
    "Solc immutable reference byte ranges zeroed in both codes",
  sourceSha256,
  pinned,
  checkedAt: Math.floor(Date.now() / 1000),
  explorerVerification: "Not claimed; local RPC bytecode comparison",
});
console.log("Deployed bytecode + final source match", pinned);
