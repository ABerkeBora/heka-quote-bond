import { acquireRuntime, read, write } from "../server/store.mjs";
import { AIRNODE, REQUEST_HASH, REQUEST, URL } from "../server/oracle.mjs";
import {
  roles,
  publicClient,
  deployContract,
  callTx,
  tokenAbi,
  deployment,
  artifact,
} from "../server/chain.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
acquireRuntime();
let run = read(".local/deploy-run.json", null);
if (
  (run?.completed && !process.argv.includes("--new")) ||
  (!run && !process.argv.includes("--new") && deployment())
) {
  console.log("Recorded deployment preserved:", deployment().contract);
  console.log("For your own isolated wallets: npm run deploy -- --new");
  process.exit(0);
}
if (!run || run.completed) {
  run = { id: crypto.randomUUID(), completed: false };
  write(".local/deploy-run.json", run);
}
const prefix = run.id + ":",
  a = roles();
const usdc = await deployContract(prefix + "deploy-usdc", "TestToken6", [
  "Quote Bond test USDC",
  "qtUSDC",
]);
const usdt = await deployContract(prefix + "deploy-usdt", "TestToken6", [
  "Quote Bond test USDT",
  "qtUSDT",
]);
const bond = await deployContract(prefix + "deploy-bond", "QuoteBond", [
  usdc.contractAddress,
  usdt.contractAddress,
  AIRNODE,
  REQUEST_HASH,
]);
const d = {
  network: "Base Sepolia",
  chainId: 84532,
  contract: bond.contractAddress,
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
  airnodeUrl: URL,
  contractSourceSha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync("contracts/QuoteBond.sol"))
    .digest("hex"),
  receipts: { usdc, usdt, bond },
};
write(".local/deployment.json", d);
d.receipts.mintBuyer = await callTx(
  prefix + "mint-usdc",
  "deployer",
  d.usdc,
  tokenAbi(),
  "mint",
  [a.buyer.address, 1000_000000n],
);
d.receipts.mintReserve = await callTx(
  prefix + "mint-usdt",
  "deployer",
  d.usdt,
  tokenAbi(),
  "mint",
  [a.deployer.address, 250_000000n],
);
for (const token of [d.usdc, d.usdt])
  if (
    (await publicClient.readContract({
      address: token,
      abi: tokenAbi(),
      functionName: "decimals",
    })) !== 6
  )
    throw Error("Unexpected decimals");
write(".local/deployment.json", d);
write(".local/state.json", {
  quotes: [],
  oracle: null,
  agent: { status: "idle", message: "Authorize one invoice.", steps: [] },
  evidence: [],
});
run.completed = true;
write(".local/deploy-run.json", run);
console.log(
  JSON.stringify({
    contract: d.contract,
    usdc: d.usdc,
    usdt: d.usdt,
    chainId: d.chainId,
  }),
);
