import fs from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { LOCAL, write } from "../server/store.mjs";
if (fs.existsSync(LOCAL + "/wallets.json"))
  throw Error("Wallet file already exists; refusing to replace it");
const roles = {};
for (const role of ["deployer", "buyer", "counterparty"]) {
  const privateKey = generatePrivateKey();
  roles[role] = {
    address: privateKeyToAccount(privateKey).address,
    privateKey,
  };
}
write(".local/wallets.json", {
  testOnly: true,
  chainId: 84532,
  project: "quote-bond",
  roles,
});
console.log("Created isolated test-only keys at .local/wallets.json (0600).");
for (const [n, v] of Object.entries(roles)) console.log(n + ": " + v.address);
console.log(
  "Fund all three addresses with Base Sepolia test ETH, then set WALLET_FILE=.local/wallets.json. Never use mainnet funds.",
);
