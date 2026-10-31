import express from "express";
import {
  state,
  prepare,
  merchantAccept,
  authorize,
  run,
  refreshOracle,
  voidInvoice,
} from "./agent.mjs";
import { exclusive, db, json } from "./store.mjs";
import { createServiceResult } from "../service.mjs";
export function createV2Router() {
  const router = express.Router();
  const safe = (e) =>
    String(e.shortMessage || e.message || "V2 operation failed").slice(0, 800);
  router.get("/state", async (req, res) => {
    try {
      res.type("json").send(json(await state()));
    } catch (e) {
      res.status(503).json({ error: safe(e) });
    }
  });
  router.get("/service-preview", (req, res) => {
    const s = createServiceResult();
    if (req.query.download === "1")
      return res
        .type("json")
        .set(
          "Content-Disposition",
          'attachment; filename="coverage-report.json"',
        )
        .send(JSON.stringify(s.report));
    res.json(s);
  });
  router.get("/service", (req, res) => {
    const q = db.quotes.find((q) => q.id === req.query.quoteId);
    if (!q?.serviceResult)
      return res.status(404).json({ error: "No V2 report for this invoice" });
    res
      .type("json")
      .set(
        "Content-Disposition",
        'attachment; filename="accepted-coverage-report.json"',
      )
      .send(JSON.stringify(q.serviceResult.report));
  });
  function post(path, keys, fn) {
    router.post(path, async (req, res) => {
      if (
        !req.body ||
        typeof req.body !== "object" ||
        Array.isArray(req.body) ||
        Object.keys(req.body).some((k) => !keys.includes(k))
      )
        return res.status(400).json({ error: "Unexpected V2 input fields" });
      try {
        res.type("json").send(json(await exclusive(() => fn(req.body))));
      } catch (e) {
        res.status(422).json({ error: safe(e) });
      }
    });
  }
  post(
    "/prepare",
    ["quoteUsd", "maxUncoveredUsd", "acceptedResultSha256"],
    prepare,
  );
  post("/merchant-accept", ["quoteId"], (b) => merchantAccept(b.quoteId));
  post("/authorize", ["quoteId"], (b) => authorize(b.quoteId));
  post("/run", ["quoteId"], (b) => run(b.quoteId));
  post("/oracle", [], refreshOracle);
  post("/void", ["quoteId"], (b) => voidInvoice(b.quoteId));
  return router;
}
