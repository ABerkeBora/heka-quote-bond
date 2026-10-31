import { acquireRuntime, save, db, write } from "../server/store.mjs";
import { prepare } from "../server/agent.mjs";
import { fetchResponse } from "../server/oracle.mjs";
acquireRuntime();
const q = await prepare({ quoteUsd: "110" });
q.evidenceOnly = true;
save();
const response = await fetchResponse();
write("evidence/judge-response.json", response);
console.log("Active judge quote:", q.id);
console.log(
  "npm run submit-response -- --file evidence/judge-response.json --quote " +
    q.id,
);
