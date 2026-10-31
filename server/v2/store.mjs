import fs from "node:fs";
import path from "node:path";
import { ROOT, read, write, json } from "../store.mjs";
export { ROOT, json };
export const LOCAL = path.join(ROOT, ".local/v2");
fs.mkdirSync(LOCAL, { recursive: true, mode: 0o700 });
export const readLocal = (name, fallback) =>
  read(".local/v2/" + name, fallback);
export const writeLocal = (name, value) => write(".local/v2/" + name, value);
export const readEvidence = (name, fallback) =>
  read("evidence/v2/" + name, fallback);
export const writeEvidence = (name, value) =>
  write("evidence/v2/" + name, value);
export const db = readLocal(
  "state.json",
  readEvidence("public-state.json", {
    quotes: [],
    oracle: null,
    agent: {
      status: "idle",
      message: "Prepare immutable merchant coverage terms.",
      steps: [],
    },
    evidence: [],
  }),
);
export const save = () => writeLocal("state.json", db);
let tail = Promise.resolve();
export function exclusive(fn) {
  const next = tail.then(fn);
  tail = next.catch(() => {});
  return next;
}
export function step(q, label, status, detail, txHash) {
  if (db.agent.quoteId !== q.id)
    db.agent = { quoteId: q.id, status: "idle", steps: [], message: "" };
  if (["confirmed", "rejected", "blocked"].includes(status))
    for (const s of db.agent.steps)
      if (s.status === "pending") s.status = status;
  db.agent.steps.push({
    id: crypto.randomUUID(),
    label,
    status,
    detail,
    txHash,
    at: Math.floor(Date.now() / 1000),
  });
  db.agent.message = detail || label;
  q.agentTrace = structuredClone(db.agent);
  save();
}
export function acquireRuntime() {
  const p = path.join(LOCAL, "runtime.lock");
  try {
    fs.writeFileSync(p, String(process.pid), { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    throw Error(
      "V2 runtime already active or stale lock; stop it or run v2:recover-lock",
    );
  }
  process.on("exit", () => {
    try {
      fs.unlinkSync(p);
    } catch {}
  });
}
