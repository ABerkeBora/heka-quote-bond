import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const SCALE18 = 10n ** 18n;
const bi = (v) => {
  try {
    return v === undefined || v === null || v === "" ? null : BigInt(v);
  } catch {
    return null;
  }
};
const short = (v, n = 6) =>
  typeof v === "string" && v.length > n * 2 + 3
    ? `${v.slice(0, n + 2)}…${v.slice(-n)}`
    : v || "—";
function fixed(value, decimals = 6, places = 2) {
  const n = bi(value);
  if (n === null) return "—";
  const negative = n < 0n;
  const a = negative ? -n : n;
  const scale = 10n ** BigInt(decimals);
  const out = (a * 10n ** BigInt(places) + scale / 2n) / scale;
  const digits = out.toString().padStart(places + 1, "0");
  const whole = (places ? digits.slice(0, -places) : digits).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `${negative ? "−" : ""}${whole}${places ? `.${digits.slice(-places)}` : ""}`;
}
const usd = (v, p = 2) => (bi(v) === null ? "—" : `$${fixed(v, 18, p)}`);
const stamp = (v, full = false) => {
  if (!v) return "—";
  const ms =
    typeof v === "string" && v.includes("T")
      ? Date.parse(v)
      : Number(v) * (Number(v) < 10 ** 11 ? 1000 : 1);
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    ...(full ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
};
const finalState = (status) =>
  ["settled", "capped", "void", "refunded"].includes(
    String(status).toLowerCase(),
  );
const statusClass = (status) =>
  [
    "settled",
    "confirmed",
    "pass",
    "paid",
    "verified",
    "complete",
    "completed",
    "rejected",
  ].includes(String(status).toLowerCase())
    ? "positive"
    : ["failed", "error", "fail"].includes(String(status).toLowerCase())
      ? "negative"
      : ["capped", "pending", "submitted", "running"].includes(
            String(status).toLowerCase(),
          )
        ? "pending"
        : "";

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M11 5H5v22h6m10-22h6v22h-6M10 12h12M10 20h12" />
    </svg>
  );
}
function Check() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="check-icon">
      <path d="m3 8 3 3 7-7" />
    </svg>
  );
}
function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="arrow">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
function External({ href, children, className = "" }) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
      <span className="external" aria-hidden="true">
        ↗
      </span>
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}
function Badge({ status, children }) {
  return (
    <span className={`badge ${statusClass(status)}`}>
      {children || status || "Not started"}
    </span>
  );
}
function Row({ label, children, className = "" }) {
  return (
    <div className={`kv ${className}`}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Waterfall({ quote, oracle, proposedUsd }) {
  const debt = bi(quote?.quoteUsd18) ?? BigInt(proposedUsd) * SCALE18;
  const escrow = bi(quote?.escrowUsdc) ?? 100000000n;
  const price = oracle?.previewFresh ? bi(oracle?.usdc18) : null;
  const priceT = oracle?.previewFresh ? bi(oracle?.usdt18) : null;
  const settled = ["settled", "capped"].includes(
    String(quote?.status).toLowerCase(),
  );
  const escrowUsd = settled
    ? bi(quote?.escrowUsd18)
    : price
      ? (escrow * price) / 1000000n
      : null;
  const shortfall =
    escrowUsd === null ? null : debt > escrowUsd ? debt - escrowUsd : 0n;
  const reserve = bi(quote?.reserveUsdt) ?? 25000000n;
  const requested =
    shortfall !== null && priceT
      ? (shortfall * 1000000n + priceT - 1n) / priceT
      : null;
  const topup = settled
    ? bi(quote?.topupUsdt)
    : requested === null
      ? null
      : requested < reserve
        ? requested
        : reserve;
  const topupUsd =
    topup !== null && priceT ? (topup * priceT) / 1000000n : null;
  const uncovered = settled
    ? (bi(quote?.uncoveredUsd18) ?? 0n)
    : shortfall !== null && topupUsd !== null && shortfall > topupUsd
      ? shortfall - topupUsd
      : 0n;
  const fundedWidth =
    escrowUsd !== null && debt > 0n
      ? Number(((escrowUsd > debt ? debt : escrowUsd) * 10000n) / debt) / 100
      : 0;
  const topupWidth =
    topupUsd !== null && debt > 0n
      ? Number(((topupUsd > debt ? debt : topupUsd) * 10000n) / debt) / 100
      : 0;
  return (
    <section className="waterfall" aria-labelledby="waterfall-title">
      <div className="section-line">
        <h2 id="waterfall-title">Payment composition</h2>
        <span className="muted small">
          {settled ? "Confirmed at settlement" : "At the signed snapshot"}
        </span>
      </div>
      <div className="waterfall-labels">
        <span>USDC invoice funds</span>
        <span>
          USD quote <b className="num">{usd(debt)}</b>
        </span>
      </div>
      <div
        className={`waterfall-track ${price === null ? "empty" : ""}`}
        role="img"
        aria-label={
          price === null
            ? "No verified rate loaded"
            : `USDC value ${usd(escrowUsd)}, reserve contribution ${usd(topupUsd)}, quote ${usd(debt)}`
        }
      >
        <div className="escrow-bar" style={{ width: `${fundedWidth}%` }} />
        <div className="topup-bar" style={{ width: `${topupWidth}%` }} />
        <div className="target-tick" />
      </div>
      <div className="waterfall-scale">
        <span>$0</span>
        <span>{usd(debt)}</span>
      </div>
      <div className="flow-amounts">
        <div>
          <div className="data-name">
            <i className="swatch ink" />
            USDC value
          </div>
          <strong className="num">{usd(escrowUsd)}</strong>
          <span className="muted small">{fixed(escrow, 6, 6)} test-USDC</span>
        </div>
        <div>
          <div className="data-name">
            <i className="swatch copper" />
            Reserve top-up
          </div>
          <strong className={`num ${topup && topup > 0n ? "copper-ink" : ""}`}>
            {topup === null ? "—" : `${fixed(topup, 6, 6)}`}
          </strong>
          <span className="muted small">test-USDT · {usd(topupUsd)} value</span>
        </div>
        <div>
          <div className="data-name">Uncovered</div>
          <strong className={`num ${uncovered > 0n ? "negative-ink" : ""}`}>
            {price ? usd(uncovered) : "—"}
          </strong>
          <span className="muted small">
            {uncovered > 0n
              ? "Reserve cap reached"
              : "After the capped reserve"}
          </span>
        </div>
      </div>
      {price === null && (
        <p className="empty-note">
          Fetch fresh signed rates to calculate the invoice shortfall.
        </p>
      )}
    </section>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [servicePreview, setServicePreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [quoteUsd, setQuoteUsd] = useState("110");
  const [newDraft, setNewDraft] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);
  const alive = useRef(true);
  const stateRequest = useRef(false);
  const request = async (path, body) => {
    const response = await fetch(
      path,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
    );
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("The local service did not return a readable response.");
    }
    if (!response.ok)
      throw new Error(
        payload.error ||
          payload.message ||
          `Request failed (${response.status}).`,
      );
    return payload;
  };
  const refresh = useCallback(async (quiet = false) => {
    if (stateRequest.current) return;
    stateRequest.current = true;
    try {
      const [payload, preview] = await Promise.all([
        request("/api/state"),
        request("/api/service-preview").catch(() => null),
      ]);
      if (alive.current && preview) setServicePreview(preview);
      if (alive.current) {
        setData(payload);
        setLastUpdate(Date.now());
        if (!quiet) setError("");
      }
    } catch (e) {
      if (alive.current && !quiet) setError(e.message);
    } finally {
      stateRequest.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    refresh();
    const id = setInterval(() => refresh(true), 4000);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [refresh]);
  const perform = async (name, path, body, success) => {
    setBusy(name);
    setError("");
    setFeedback("");
    try {
      const result = await request(path, body);
      await refresh(true);
      if (success) setFeedback(success);
      return result;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy("");
    }
  };
  const authorize = async () => {
    setBusy("authorize");
    setError("");
    setFeedback("");
    try {
      if (!servicePreview?.sha256)
        throw new Error(
          "Load and review the service report before authorizing its invoice.",
        );
      const result = await request("/api/prepare", {
        quoteUsd,
        acceptedResultSha256: servicePreview.sha256,
      });
      setNewDraft(false);
      await refresh(true);
      const id =
        result.quoteId ||
        result.id ||
        result.activeQuote?.id ||
        result.quote?.id;
      if (!id)
        throw new Error(
          "The mandate was prepared, but the invoice ID was missing. Refresh before retrying.",
        );
      setBusy("pay");
      await request("/api/run", { quoteId: id });
      await refresh(true);
      setFeedback(
        "The payer run finished. The invoice and receipt below show the confirmed result.",
      );
    } catch (e) {
      setError(e.message);
      await refresh(true);
    } finally {
      setBusy("");
    }
  };
  const check = async (kind) => {
    const result = await perform(`check-${kind}`, "/api/tamper", { kind });
    if (result) setLastCheck({ kind, ...result });
  };
  const deployment = data?.deployment;
  const currentQuote = data?.activeQuote;
  const quote = newDraft ? null : currentQuote;
  const quoteSettled = ["settled", "capped"].includes(
    String(quote?.status).toLowerCase(),
  );
  const oracleRecord =
    quoteSettled && quote?.paymentOracle ? quote.paymentOracle : data?.oracle;
  const oracleNow = Math.floor(Date.now() / 1000);
  const observationSeconds = (value) =>
    Math.floor(Number(value) / (Number(value) < 10 ** 11 ? 1 : 1000));
  const oracleFresh =
    !!oracleRecord?.verified &&
    Number(oracleRecord.timestamp) <= oracleNow + 60 &&
    Number(oracleRecord.timestamp) + 120 >= oracleNow &&
    ["usdcUpdatedAt", "usdtUpdatedAt"].every(
      (key) =>
        observationSeconds(oracleRecord[key]) <= oracleNow + 60 &&
        observationSeconds(oracleRecord[key]) + 300 >= oracleNow,
    );
  const oracle = oracleRecord
    ? { ...oracleRecord, previewFresh: quoteSettled || oracleFresh }
    : null;
  const mandate = quote?.mandate;
  const service = quote ? quote.serviceResult : servicePreview;
  const serviceSummary = service?.report?.summary || service?.report?.totals;
  const reportUrl = quote?.serviceResult
    ? `/api/service?quoteId=${encodeURIComponent(quote.id)}`
    : !quote && servicePreview
      ? "/api/service-preview?download=1"
      : null;
  const agent = data?.agent;
  const quoteStatus = quote?.status || "Draft";
  const paid = ["settled", "capped"].includes(
    String(quoteStatus).toLowerCase(),
  );
  const final = finalState(quoteStatus);
  const available = !!deployment?.contract;
  const signerReady = data?.localSignerReady !== false;
  const explorer = deployment?.explorer || "https://sepolia.basescan.org";
  const txUrl = (hash) => (hash ? `${explorer}/tx/${hash}` : null);
  const addressUrl = (address) =>
    address ? `${explorer}/address/${address}` : null;
  const quoteDebt =
    quote?.quoteUsd18 ?? (BigInt(quoteUsd) * SCALE18).toString();
  const expiry = mandate?.expiresAt;
  const expiryTime = expiry
    ? Number(expiry) * (Number(expiry) < 10 ** 11 ? 1000 : 1)
    : null;
  const expired = expiryTime !== null && expiryTime < Date.now();
  const trace = agent?.steps || [];
  const evidence = Array.isArray(data?.evidence) ? data.evidence : [];
  const history = Array.isArray(data?.history) ? data.history : [];
  const progress = ["Quote checked", "Agent payment sent", "Merchant paid"];
  const signedQuoteChecked = trace.some(
    (step) =>
      step.label === "Check signed prices" && step.status === "confirmed",
  );
  const stage = paid ? 3 : quote?.txHash ? 2 : signedQuoteChecked ? 1 : 0;
  const gasLimit = bi(mandate?.maxGasWei) ?? 200000000000000n;
  const gasSpent = bi(mandate?.gasSpentWei);
  const gasRemaining =
    gasSpent === null ? null : gasSpent > gasLimit ? 0n : gasLimit - gasSpent;
  const now = Date.now();
  const sourceAge = (v) =>
    v
      ? `${Math.max(0, Math.floor((now - Number(v) * (Number(v) < 10 ** 11 ? 1000 : 1)) / 1000))}s ago`
      : "Not loaded";

  return (
    <div className="app">
      <header className="shell">
        <a className="brand" href="/" aria-label="Quote Bond invoice desk">
          <Mark />
          <span>Quote Bond</span>
        </a>
        <span className="scope">Invoice desk</span>
        <div className="network">
          <span className="network-dot" />
          {deployment?.network || "Base Sepolia"}
          <span className="testnet-label">Test assets</span>
        </div>
      </header>
      <main>
        <div className="title-row">
          <div>
            <h1>Invoice settlement</h1>
            <p>
              {quoteStatus === "Capped"
                ? `The reserve cap was reached. ${usd(quote?.uncoveredUsd18)} of the quote remains uncovered.`
                : paid
                  ? bi(quote?.topupUsdt) === 0n
                    ? "The merchant was paid. No reserve contribution was needed."
                    : "The merchant received the invoice funds and the signed-rate reserve contribution."
                  : final
                    ? "This invoice is closed. Create a fresh quote to authorize another payment."
                    : "One invoice. One bounded authority. A reserve for the difference."}
            </p>
          </div>
          <div className="title-meta">
            <span>
              {loading
                ? "Connecting to local service"
                : lastUpdate
                  ? `Updated ${stamp(lastUpdate)}`
                  : "Local service unavailable"}
            </span>
            <button
              className="text-button"
              disabled={!!busy}
              onClick={() => refresh()}
            >
              Refresh
            </button>
          </div>
        </div>
        <a href="#mandate" className="mobile-review">
          Review payer limits <Arrow />
        </a>
        <div className="test-notice">
          <span className="notice-label">Test quote terms</span>
          <span>
            Real Nodary rates, test-USDC and test-USDT. Quotes above 100 USD are
            explicit stress terms against 100 USDC, not a claim of a market
            depeg.
          </span>
        </div>
        {error && (
          <div className="notice error" role="alert">
            <div>
              <strong>Action needs attention</strong>
              <p>{error}</p>
            </div>
            <button className="text-button" onClick={() => refresh()}>
              Check status
            </button>
          </div>
        )}
        {feedback && (
          <div className="notice feedback" role="status">
            <p>{feedback}</p>
            <button className="text-button" onClick={() => setFeedback("")}>
              Dismiss
            </button>
          </div>
        )}
        <div className="workspace">
          <article className="invoice-panel panel">
            <div className="invoice-head">
              <div>
                <span className="invoice-kind">
                  {service?.sampleInput
                    ? "Sample ledger · Reconciliation service"
                    : quote
                      ? "Recorded payment"
                      : "Proposed service invoice"}
                </span>
                <h2>
                  {service
                    ? "Agent reconciliation report"
                    : "Agent service invoice"}
                </h2>
                {serviceSummary && (
                  <p className="service-summary muted small">
                    {serviceSummary.inputRows} input rows ·{" "}
                    {serviceSummary.uniqueInvoices} invoices ·{" "}
                    {serviceSummary.duplicateRows} duplicate
                  </p>
                )}
              </div>
              <Badge
                status={
                  busy === "authorize"
                    ? "Preparing"
                    : busy === "pay"
                      ? "Running"
                      : quoteStatus
                }
              />
            </div>
            <div className="invoice-summary">
              <div>
                <span className="muted">USD quote</span>
                <div
                  className={`debt num ${loading && !data ? "skeleton" : ""}`}
                >
                  {usd(quoteDebt)}
                  <span>USD</span>
                </div>
              </div>
              <div className="invoice-identity">
                <span className="muted small">
                  {quote ? "Invoice ID" : "Proposed single invoice"}
                </span>
                <span className="mono" title={quote?.id}>
                  {quote ? short(quote.id, 7) : "Not yet authorized"}
                </span>
              </div>
            </div>
            <div className="parties">
              <div>
                <span className="muted small">Payer</span>
                <External href={addressUrl(deployment?.payer)}>
                  <span className="mono">{short(deployment?.payer)}</span>
                </External>
              </div>
              <Arrow />
              <div>
                <span className="muted small">Merchant beneficiary</span>
                <External href={addressUrl(deployment?.merchant)}>
                  <span className="mono">{short(deployment?.merchant)}</span>
                </External>
              </div>
            </div>
            <Waterfall quote={quote} oracle={oracle} proposedUsd={quoteUsd} />
            <div className="rate-sheet">
              <div className="section-line">
                <h2>Signed exchange rates</h2>
                {!paid ? (
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() => perform("oracle", "/api/oracle", {})}
                  >
                    {busy === "oracle" ? "Fetching…" : "Fetch latest"}
                  </button>
                ) : (
                  <span className="small muted">Settlement snapshot</span>
                )}
              </div>
              <div className="rates">
                <div>
                  <span>USDC / USD</span>
                  <strong className="num">
                    {oracle?.usdc18 && (paid || oracleFresh)
                      ? `$${fixed(oracle.usdc18, 18, 6)}`
                      : "—"}
                  </strong>
                  <span className="muted small">
                    Observed{" "}
                    {paid
                      ? stamp(oracle?.usdcUpdatedAt)
                      : sourceAge(oracle?.usdcUpdatedAt)}
                  </span>
                </div>
                <div>
                  <span>USDT / USD</span>
                  <strong className="num">
                    {oracle?.usdt18 && (paid || oracleFresh)
                      ? `$${fixed(oracle.usdt18, 18, 6)}`
                      : "—"}
                  </strong>
                  <span className="muted small">
                    Observed{" "}
                    {paid
                      ? stamp(oracle?.usdtUpdatedAt)
                      : sourceAge(oracle?.usdtUpdatedAt)}
                  </span>
                </div>
                <div className="attested">
                  <span className="muted small">Nodary snapshot</span>
                  <span>
                    {oracle?.timestamp
                      ? stamp(oracle.timestamp)
                      : "No response yet"}
                  </span>
                  <span className="small muted">
                    {oracle?.error
                      ? "Rate unavailable"
                      : !paid && oracle?.timestamp && !oracleFresh
                        ? "Snapshot expired"
                        : oracle?.verified
                          ? "Signature verified"
                          : "Awaiting verification"}
                  </span>
                </div>
              </div>
              {!paid && oracle?.timestamp && !oracleFresh && (
                <p className="snapshot-notice small muted">
                  Snapshot expired. Fresh rates are fetched before payment.
                </p>
              )}
              {oracle?.error && <p className="inline-error">{oracle.error}</p>}
            </div>
            <div className="invoice-foot">
              {reportUrl && (
                <a
                  className="report-link"
                  href={reportUrl}
                  download="reconciliation-report.json"
                >
                  {quote ? "Download accepted report" : "Review service report"}
                  <span className="external" aria-hidden="true">
                    ↓
                  </span>
                </a>
              )}
              <span>
                {paid
                  ? "Payment confirmed on-chain"
                  : quote
                    ? "The recipient and quote terms are fixed."
                    : "No payment has been authorized for these proposed terms."}
              </span>
              {quote?.txHash && (
                <External href={txUrl(quote.txHash)}>View payment</External>
              )}
            </div>
          </article>

          <aside
            id="mandate"
            className="mandate-panel panel"
            aria-labelledby="mandate-heading"
          >
            <div className="section-line">
              <h2 id="mandate-heading">Payer mandate</h2>
              <span className="small muted">Single invoice</span>
            </div>
            <p className="mandate-description">
              Approve one invoice for this merchant. The agent checks the signed
              rates and pays within these limits.
            </p>
            {!quote && (
              <div className="quote-choice">
                <label htmlFor="quote-terms">Quote terms</label>
                <select
                  id="quote-terms"
                  value={quoteUsd}
                  disabled={!!busy}
                  onChange={(e) => setQuoteUsd(e.target.value)}
                >
                  <option value="110">$110 · Positive shortfall</option>
                  <option value="100">$100 · Standard quote</option>
                  <option value="140">$140 · Capped shortfall</option>
                </select>
              </div>
            )}
            <div className="mandate-limits">
              <Row label="Invoice spend">
                <span className="num">
                  {fixed(
                    mandate?.maxUsdc ?? quote?.escrowUsdc ?? "100000000",
                    6,
                    2,
                  )}
                </span>
                <span className="unit">test-USDC</span>
              </Row>
              <Row label="Reserve cap">
                <span className="num">
                  {fixed(
                    mandate?.maxReserveUsdt ?? quote?.reserveUsdt ?? "25000000",
                    6,
                    2,
                  )}
                </span>
                <span className="unit">test-USDT</span>
              </Row>
              <Row label="Payment actions">
                <span className="num">
                  {mandate?.actionsUsed ?? 0} / {mandate?.maxActions ?? 1}
                </span>
              </Row>
              <Row label="Gas budget">
                <span className="num">{fixed(gasLimit, 18, 6)}</span>
                <span className="unit">test ETH</span>
              </Row>
              <Row label="API fee">
                <span className="num">0</span>
                <span className="unit">Free Nodary operation</span>
              </Row>
              <Row label={expiry ? "Authority expires" : "Authority duration"}>
                {expiry ? (
                  <span className={expired && !final ? "negative-ink" : ""}>
                    {stamp(expiry)}
                  </span>
                ) : (
                  "30 minutes"
                )}
              </Row>
            </div>
            <div className="reserve-note">
              <div className="section-line">
                <span>Separate reserve</span>
                <span className="num">
                  {fixed(quote?.reserveUsdt ?? "25000000", 6, 2)}{" "}
                  <span className="unit">test-USDT</span>
                </span>
              </div>
              <p>
                {quoteStatus === "Void"
                  ? "The expired invoice released its reserve to the funder. No USDC payment was taken."
                  : paid && bi(quote?.topupUsdt) === bi(quote?.reserveUsdt)
                    ? "The full reserve went to the merchant. The remaining USD shortfall stays uncovered."
                    : paid
                      ? bi(quote?.topupUsdt) === 0n
                        ? "No top-up was needed. The full reserve returned to the funder."
                        : "The required top-up went to the merchant. The unused reserve returned to the funder."
                      : quote && quoteStatus !== "Preparing"
                        ? "Reserved by the funder for this invoice. Only the required top-up can reach the merchant."
                        : "Funded separately from the payer’s USDC budget when this invoice is prepared."}
              </p>
            </div>
            <div className="mandate-action">
              {!quote || ["Preparing", "Funded"].includes(quoteStatus) ? (
                <button
                  className="primary"
                  onClick={authorize}
                  disabled={
                    !!busy || !available || !servicePreview || !signerReady
                  }
                >
                  {busy === "authorize" ? (
                    "Preparing mandate…"
                  ) : busy === "pay" ? (
                    "Agent is paying…"
                  ) : (
                    <>
                      {quote
                        ? "Resume authorization"
                        : "Accept report & authorize"}{" "}
                      <Arrow />
                    </>
                  )}
                </button>
              ) : !final ? (
                <button
                  className="primary"
                  disabled={!!busy || expired || !available || !signerReady}
                  onClick={() =>
                    perform("pay", "/api/run", { quoteId: quote.id })
                  }
                >
                  {busy === "pay"
                    ? "Agent is paying…"
                    : expired
                      ? "Mandate expired"
                      : "Run authorized payer"}
                  {!busy && !expired && <Arrow />}
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => {
                    setNewDraft(true);
                    setFeedback("");
                    setError("");
                  }}
                >
                  Create fresh invoice <Arrow />
                </button>
              )}
              <p className="small muted">
                {!available
                  ? "Deploy and configure the local service to enable authorization."
                  : !signerReady
                    ? "Configure isolated test wallets to authorize a new invoice."
                    : !quote
                      ? "Accept this sample-ledger report and record its invoice mandate. The agent then pays automatically."
                      : final
                        ? "The closed invoice remains in the payment history."
                        : expired
                          ? "No new payment can use this authority. The reserve may be released after the quote deadline."
                          : "Payment can only reach the fixed beneficiary."}
              </p>
            </div>
            {mandate && (
              <div className="remaining-budget">
                <Row label="Gas remaining">
                  <span className="num">
                    {gasRemaining === null ? "—" : fixed(gasRemaining, 18, 6)}
                  </span>
                  <span className="unit">test ETH</span>
                </Row>
                <p className="small muted">
                  Gas limits are enforced by the local signer guard. Token spend
                  and invoice expiry are enforced on-chain.
                </p>
              </div>
            )}
            {paid && (
              <div className="receipt">
                <span className="receipt-mark">
                  <Check />
                </span>
                <div>
                  <span>Invoice settlement receipt</span>
                  <p className="small muted">
                    {quote?.txHash
                      ? "Confirmed payment and reserve allocation"
                      : "Read the confirmed quote state before exporting"}
                  </p>
                  {quote?.txHash && (
                    <External href={txUrl(quote.txHash)}>
                      Open confirmed receipt
                    </External>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>

        <section
          className="activity-section"
          aria-labelledby="activity-heading"
        >
          <div className="section-line">
            <h2 id="activity-heading">Payment trail</h2>
            <span className="small muted">
              {trace.length
                ? `${trace.length} recorded ${trace.length === 1 ? "step" : "steps"}`
                : "Waiting for the first authorization"}
            </span>
          </div>
          <div className="payment-progress">
            {progress.map((label, i) => (
              <div
                key={label}
                className={`${stage > i ? "done" : ""} ${busy && stage === i ? "current" : ""}`}
              >
                <span className="step-mark">
                  {stage > i ? <Check /> : <span />}
                </span>
                <span>{label}</span>
                {i < progress.length - 1 && (
                  <span className="progress-connector" />
                )}
              </div>
            ))}
          </div>
          <div className="trace-list">
            {trace.length ? (
              trace.slice(-5).map((step, index) => (
                <div
                  className="trace-row"
                  key={step.id || `${step.label}-${index}`}
                >
                  <span className="trace-time num">{stamp(step.at)}</span>
                  <div className="trace-copy">
                    <span>{step.label}</span>
                    {step.detail && <p>{step.detail}</p>}
                  </div>
                  <div className="trace-status">
                    {step.txHash ? (
                      <External href={txUrl(step.txHash)}>
                        <span className="mono">{short(step.txHash, 4)}</span>
                      </External>
                    ) : (
                      <Badge status={step.status} />
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-trail">
                No agent payment has run yet. Authorize an invoice to record its
                checks, transaction and receipt.
              </div>
            )}
          </div>
        </section>

        <section className="verification-section panel">
          <details>
            <summary>
              <span>
                <span className="detail-title">Response verification</span>
                <span className="muted small">
                  Inspect the pinned source, submit rejection checks and review
                  receipts
                </span>
              </span>
              <span className="disclosure-arrow">⌄</span>
            </summary>
            <div className="verification-body">
              <div className="proof-grid">
                <div>
                  <h3>Pinned data recipe</h3>
                  <Row label="Provider">Nodary</Row>
                  <Row label="Operation">
                    <code>latestFeeds</code>
                  </Row>
                  <Row label="Feeds">USDC/USD + USDT/USD</Row>
                  <Row label="Contract">
                    <External href={addressUrl(deployment?.contract)}>
                      <code title={deployment?.contract}>
                        {short(deployment?.contract)}
                      </code>
                    </External>
                  </Row>
                  <Row label="Accepted report hash">
                    <code
                      title={mandate?.acceptedResultSha256 || service?.sha256}
                    >
                      {short(mandate?.acceptedResultSha256 || service?.sha256)}
                    </code>
                  </Row>
                  <Row label="Expected signer">
                    <code title={oracle?.signer}>{short(oracle?.signer)}</code>
                  </Row>
                  <Row label="Request hash">
                    <code title={oracle?.requestHash}>
                      {short(oracle?.requestHash)}
                    </code>
                  </Row>
                  <p className="small muted">
                    A signature authenticates this source’s answer to this exact
                    request. It does not guarantee the upstream price,
                    stablecoin backing or fiat redemption. This local harness
                    uses isolated test keys and a sample-ledger service. The
                    contract does not judge report quality.
                  </p>
                </div>
                <div>
                  <h3>Recorded rejection checks</h3>
                  <p className="small muted">
                    Replay each rejected response against the deployed contract
                    at its recorded block. These read-only checks cannot move
                    tokens. Use the documented submission script to test a new
                    response.
                  </p>
                  <div className="small muted replay-label">
                    Replay recorded rejection
                  </div>
                  <div className="tamper-controls">
                    {[
                      ["edited", "Edited value"],
                      ["stale", "Expired response"],
                      ["wrong-request", "Different request"],
                      ["wrong-signer", "Wrong signer"],
                    ].map(([kind, label]) => (
                      <button
                        className="secondary"
                        key={kind}
                        disabled={!!busy || !available}
                        onClick={() => check(kind)}
                      >
                        {busy === `check-${kind}` ? "Replaying…" : label}
                      </button>
                    ))}
                  </div>
                  {lastCheck && (
                    <div className="check-result" role="status">
                      <Badge
                        status={
                          lastCheck.status ||
                          (lastCheck.rejected ? "Rejected" : "Completed")
                        }
                      />
                      <span>
                        {lastCheck.reason ||
                          lastCheck.message ||
                          `Check completed: ${lastCheck.kind}`}
                        <span className="check-method muted">
                          {lastCheck.method ||
                            "Recorded contract rejection replay"}
                        </span>
                      </span>
                    </div>
                  )}
                  {evidence.length > 0 && (
                    <div className="evidence-list">
                      {evidence.slice(-5).map((item, i) => (
                        <div key={`${item.kind}-${i}`}>
                          <span>{item.kind}</span>
                          <Badge status={item.status} />
                          {item.reason && <p>{item.reason}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <details className="raw-response">
                <summary>Raw signed response</summary>
                <pre>
                  {oracle?.data
                    ? JSON.stringify(
                        {
                          timestamp: oracle.timestamp,
                          data: oracle.data,
                          signature: oracle.signature,
                          requestHash: oracle.requestHash,
                        },
                        null,
                        2,
                      )
                    : "No signed response has been fetched."}
                </pre>
              </details>
              <div className="verification-foot">
                <button
                  className="text-button"
                  disabled={!!busy || !quote || !available}
                  onClick={() =>
                    quote &&
                    perform(
                      "duplicate",
                      "/api/run",
                      { quoteId: quote.id },
                      "The recorded invoice state was reconciled. Inspect the trail for the duplicate decision.",
                    )
                  }
                >
                  Reconcile this invoice
                </button>
                {quote && !final && (
                  <button
                    className="text-button"
                    disabled={
                      !!busy ||
                      (quote.deadline && Number(quote.deadline) * 1000 > now)
                    }
                    onClick={() =>
                      perform("void", "/api/void", { quoteId: quote.id })
                    }
                  >
                    Release expired reserve
                  </button>
                )}
                <span className="small muted">
                  Expired quotes release the reserve; unpaid USDC stays with its
                  payer.
                </span>
              </div>
            </div>
          </details>
        </section>

        {history.length > 0 && (
          <section className="history-section">
            <details>
              <summary>
                <span className="detail-title">
                  Payment history{" "}
                  <span className="muted">{history.length}</span>
                </span>
                <span className="disclosure-arrow">⌄</span>
              </summary>
              <div className="history-list">
                {history
                  .slice()
                  .reverse()
                  .map((item, i) => (
                    <div className="history-row" key={item.id || i}>
                      <div>
                        <span>
                          {item.jobId || "Invoice settlement receipt"}
                        </span>
                        <code>{short(item.id, 5)}</code>
                      </div>
                      <span className="num">{usd(item.quoteUsd18)}</span>
                      <Badge status={item.status} />
                      {item.txHash && (
                        <External href={txUrl(item.txHash)}>Receipt</External>
                      )}
                    </div>
                  ))}
              </div>
            </details>
          </section>
        )}
        <footer>
          <span>Quote Bond · Bounded invoice payment</span>
          <span>First valid, fresh snapshot within the agreed window.</span>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
