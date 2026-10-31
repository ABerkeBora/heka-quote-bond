import fs from "node:fs";
import { LOCAL } from "../server/store.mjs";
for (const name of ["signer.lock", "runtime.lock"]) {
  const p = LOCAL + "/" + name;
  if (!fs.existsSync(p)) continue;
  const pid = Number(fs.readFileSync(p, "utf8"));
  if (!Number.isSafeInteger(pid) || pid < 1)
    throw Error("Invalid lock PID; inspect file manually");
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch (e) {
    if (e.code === "ESRCH") alive = false;
    else throw e;
  }
  if (alive) throw Error(`Process ${pid} is alive; no lock removed`);
  fs.unlinkSync(p);
  console.log("Removed stale " + name);
}
