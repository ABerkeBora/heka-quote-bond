import fs from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { LOCAL, writeLocal } from "../server/v2/store.mjs";
if (fs.existsSync(LOCAL + "/wallets.json")) {
  console.log("V2 wallets already exist; preserving.");
  process.exit(0);
}
const roles = {};
for (const n of ["deployer", "buyer", "counterparty"]) {
  const privateKey = generatePrivateKey();
  roles[n] = { address: privateKeyToAccount(privateKey).address, privateKey };
}
writeLocal("wallets.json", {
  testOnly: true,
  project: "quote-bond-v2",
  chainId: 84532,
  roles,
});
console.log("Created isolated V2 test wallets (0600):");
for (const [name, v] of Object.entries(roles)) console.log(name, v.address);
