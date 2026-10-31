import fs from "node:fs";
import { LOCAL } from "../server/v2/store.mjs";
for (const name of ["runtime.lock", "signer.lock"]) {
  const p = LOCAL + "/" + name;
  if (!fs.existsSync(p)) continue;
  const pid = Number(fs.readFileSync(p, "utf8"));
  if (!Number.isSafeInteger(pid) || pid < 1) throw Error("Invalid lock PID");
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch (e) {
    if (e.code === "ESRCH") alive = false;
    else throw e;
  }
  if (alive) throw Error("V2 process still alive:" + pid);
  fs.unlinkSync(p);
  console.log("Removed stale V2 " + name);
}
