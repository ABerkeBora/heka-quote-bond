import { acquireRuntime, writeLocal } from "../server/v2/store.mjs";
import { prepare, merchantAccept, authorize } from "../server/v2/agent.mjs";
import { fetchResponse } from "../server/oracle.mjs";
acquireRuntime();
const q = await prepare({ quoteUsd: "110", maxUncoveredUsd: "0" });
await merchantAccept(q.id);
await authorize(q.id);
writeLocal("judge-response.json", await fetchResponse());
console.log("Merchant-accepted, buyer-authorized V2 quote:", q.id);
console.log(
  "npm run v2:submit-response -- --file .local/v2/judge-response.json --quote " +
    q.id,
);
