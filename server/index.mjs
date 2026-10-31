import { acquireRuntime } from "./store.mjs";
acquireRuntime();
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createServer as createViteServer } from "vite";
import { ROOT, exclusive, db, save, json } from "./store.mjs";
import {
  state,
  prepare,
  run,
  tamper,
  refreshOracle,
  voidInvoice,
} from "./agent.mjs";
import { createServiceResult } from "./service.mjs";
const app = express();
const httpServer = createServer(app);
const PORT = 3104;
// Mutations have a same-origin JSON boundary. This local harness never listens on a public interface.
app.use((req, res, next) => {
  if (!["127.0.0.1:3104", "localhost:3104"].includes(req.headers.host))
    return res.status(403).json({ error: "Unexpected host" });
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  if (
    req.method === "POST" &&
    req.headers.origin !== `http://127.0.0.1:${PORT}` &&
    req.headers.origin !== `http://localhost:${PORT}`
  )
    return res.status(403).json({ error: "Same-origin access required" });
  if (req.method === "POST" && !req.is("application/json"))
    return res.status(415).json({ error: "JSON required" });
  next();
});
app.use(express.json({ limit: "32kb" }));
const safe = (e) =>
  String(e.shortMessage || e.message || "Operation failed").slice(0, 800);
app.get("/api/state", async (req, res) => {
  try {
    res.type("json").send(json(await state()));
  } catch (e) {
    res.status(503).json({ error: safe(e) });
  }
});
app.get("/api/service", (req, res) => {
  const q = db.quotes.find((q) => q.id === req.query.quoteId);
  if (!q?.serviceResult)
    return res
      .status(404)
      .json({ error: "No accepted report bound to this invoice" });
  res
    .type("json")
    .set(
      "Content-Disposition",
      'attachment; filename="reconciliation-report.json"',
    )
    .send(JSON.stringify(q.serviceResult.report));
});
app.get("/api/service-preview", (req, res) => {
  const s = createServiceResult();
  if (req.query.download === "1")
    return res
      .type("json")
      .set(
        "Content-Disposition",
        'attachment; filename="proposed-reconciliation-report.json"',
      )
      .send(JSON.stringify(s.report));
  res.json(s);
});
function endpoint(url, keys, fn) {
  app.post(url, async (req, res) => {
    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body) ||
      Object.keys(req.body).some((k) => !keys.includes(k))
    )
      return res.status(400).json({ error: "Unexpected input fields" });
    try {
      const result = await exclusive(() => fn(req.body));
      res.type("json").send(json(result));
    } catch (e) {
      res.status(422).json({ error: safe(e) });
    }
  });
}
endpoint("/api/prepare", ["quoteUsd", "acceptedResultSha256"], prepare);
endpoint("/api/run", ["quoteId"], (b) => run(b.quoteId));
endpoint("/api/oracle", [], refreshOracle);
endpoint("/api/tamper", ["kind"], (b) => tamper(b.kind));
endpoint("/api/void", ["quoteId"], (b) => voidInvoice(b.quoteId));
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(ROOT, "dist")));
  app.get("/{*path}", (_, res) =>
    res.sendFile(path.join(ROOT, "dist/index.html")),
  );
} else {
  const vite = await createViteServer({
    configFile: path.join(ROOT, "vite.config.js"),
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use((err, req, res, next) =>
  res.status(400).json({ error: "Invalid request" }),
);
httpServer.listen(PORT, "127.0.0.1", () =>
  console.log(`Quote Bond ready: http://127.0.0.1:${PORT}`),
);
