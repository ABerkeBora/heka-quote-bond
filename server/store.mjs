import fs from "node:fs";
import path from "node:path";
export const ROOT = path.resolve(import.meta.dirname, "..");
export const LOCAL = path.join(ROOT, ".local");
fs.mkdirSync(LOCAL, { recursive: true, mode: 0o700 });
export const json = (v) =>
  JSON.stringify(v, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
export const read = (p, fallback) => {
  try {
    return JSON.parse(
      fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, p), "utf8"),
    );
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
};
export const write = (p, v) => {
  const target = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, json(v), { mode: 0o600 });
  fs.renameSync(tmp, target);
};
export const db = read(
  ".local/state.json",
  read("evidence/public-state.json", {
    quotes: [],
    oracle: null,
    agent: {
      status: "idle",
      message: "Authorize one invoice to delegate its payment.",
      steps: [],
    },
    evidence: [],
  }),
);
export const save = () => write(".local/state.json", db);
let tail = Promise.resolve();
export function exclusive(fn) {
  const next = tail.then(fn);
  tail = next.catch(() => {});
  return next;
}
export function step(label, status, detail, txHash) {
  if (status === "confirmed" || status === "rejected")
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
  const q = db.quotes.find((q) => q.id === db.agent.quoteId);
  if (q) q.agentTrace = structuredClone(db.agent);
  save();
}
// One mutable application-state owner. CLI evidence/deployment and the server never share a writer.
export function acquireRuntime() {
  const p = path.join(LOCAL, "runtime.lock");
  try {
    fs.writeFileSync(p, String(process.pid), { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    throw Error(
      "Quote Bond runtime lock exists. Stop the other process, or use npm run recover-lock after a crash.",
    );
  }
  process.on("exit", () => {
    try {
      fs.unlinkSync(p);
    } catch {}
  });
  for (const sig of ["SIGINT", "SIGTERM"])
    process.once(sig, () => process.exit(0));
}
