import fs from "node:fs";
import crypto from "node:crypto";
import {
  acquireRuntime,
  writeLocal,
  writeEvidence,
  readLocal,
} from "../server/v2/store.mjs";
import {
  roles,
  deployment,
  deployContract,
  callTx,
  tokenAbi,
  publicClient,
} from "../server/v2/chain.mjs";
import { AIRNODE, REQUEST_HASH, REQUEST } from "../server/oracle.mjs";
acquireRuntime();
if (readLocal("deployment-complete.json", null)) {
  console.log(
    "V2 deployment already complete; preserving",
    deployment().contract,
  );
  process.exit(0);
}
const a = roles();
const usdc = await deployContract("v2:deploy-usdc", "TestToken6", [
  "Quote Bond V2 test USDC",
  "qv2USDC",
]);
const usdt = await deployContract("v2:deploy-usdt", "TestToken6", [
  "Quote Bond V2 test USDT",
  "qv2USDT",
]);
const bond = await deployContract("v2:deploy-coverage", "QuoteBondCoverage", [
  usdc.contractAddress,
  usdt.contractAddress,
  AIRNODE,
  REQUEST_HASH,
]);
const d = {
  version: 2,
  network: "Base Sepolia",
  chainId: 84532,
  contract: bond.contractAddress,
  contractName: "QuoteBondCoverage",
  usdc: usdc.contractAddress,
  usdt: usdt.contractAddress,
  payer: a.buyer.address,
  merchant: a.counterparty.address,
  reserveFunder: a.deployer.address,
  explorer: "https://sepolia.basescan.org",
  deployedAt: Math.floor(Date.now() / 1000),
  signer: AIRNODE,
  requestHash: REQUEST_HASH,
  request: REQUEST,
  contractSourceSha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync("contracts/QuoteBondCoverage.sol"))
    .digest("hex"),
  receipts: { usdc, usdt, bond },
};
writeLocal("deployment.json", d);
d.receipts.mintBuyer = await callTx(
  "v2:mint-usdc",
  "deployer",
  d.usdc,
  tokenAbi(),
  "mint",
  [d.payer, 1000000000n],
);
d.receipts.mintReserve = await callTx(
  "v2:mint-usdt",
  "deployer",
  d.usdt,
  tokenAbi(),
  "mint",
  [d.reserveFunder, 250000000n],
);
for (const t of [d.usdc, d.usdt])
  if (
    (await publicClient.readContract({
      address: t,
      abi: tokenAbi(),
      functionName: "decimals",
    })) !== 6
  )
    throw Error("V2 token decimals wrong");
writeLocal("deployment.json", d);
writeEvidence("deployment.json", d);
writeLocal("deployment-complete.json", { contract: d.contract });
console.log(
  JSON.stringify({
    contract: d.contract,
    usdc: d.usdc,
    usdt: d.usdt,
    merchant: d.merchant,
  }),
);
