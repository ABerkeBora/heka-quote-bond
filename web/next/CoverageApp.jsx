import React, { useCallback, useEffect, useRef, useState } from "react";
import "../style.css";
import "./coverage.css";

const SCALE = 10n ** 18n;
const units = (value) => {
  try {
    return value === undefined || value === null || value === ""
      ? null
      : BigInt(value);
  } catch {
    return null;
  }
};
const short = (value, size = 6) =>
  typeof value === "string" && value.length > size * 2 + 3
    ? `${value.slice(0, size + 2)}…${value.slice(-size)}`
    : value || "—";
function fixed(value, decimals = 18, places = 2) {
  const n = units(value);
  if (n === null) return "—";
  const sign = n < 0n ? "−" : "";
  const positive = n < 0n ? -n : n;
  const scale = 10n ** BigInt(decimals);
  const rounded = (positive * 10n ** BigInt(places) + scale / 2n) / scale;
  const text = rounded.toString().padStart(places + 1, "0");
  const whole = (places ? text.slice(0, -places) : text).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `${sign}${whole}${places ? "." + text.slice(-places) : ""}`;
}
const usd = (value, places = 2) =>
  units(value) === null ? "—" : `$${fixed(value, 18, places)}`;
const time = (value) => {
  if (!value) return "—";
  const ms = Number(value) * (Number(value) < 10 ** 11 ? 1000 : 1);
  return Number.isFinite(ms)
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(ms))
    : "—";
};
const closed = (quote) =>
  [
    "settled",
    "capped",
    "partial",
    "paid",
    "void",
    "voided",
    "refunded",
  ].includes(String(quote?.status).toLowerCase());
const wasPaid = (quote) =>
  ["settled", "capped", "partial", "paid"].includes(
    String(quote?.status).toLowerCase(),
  );
const statusClass = (value) =>
  ["settled", "confirmed", "accepted", "paid", "pass"].includes(
    String(value).toLowerCase(),
  )
    ? "positive"
    : ["rejected", "blocked", "error", "fail"].includes(
          String(value).toLowerCase(),
        )
      ? "negative"
      : ["partial", "capped", "pending", "running"].includes(
            String(value).toLowerCase(),
          )
        ? "pending"
        : "";
export const isVoided = (quote) =>
  ["void", "voided", "refunded"].includes(
    String(quote?.status).toLowerCase(),
  ) || String(quote?.coverageState).toLowerCase() === "voided";
export function coverageViewState(quote, agent) {
  const voided = isVoided(quote);
  const paid = !voided && wasPaid(quote);
  const final = voided || closed(quote);
  const blocked =
    !paid &&
    !final &&
    (["blocked", "insufficient", "rejected"].includes(
      String(quote?.coverageState).toLowerCase(),
    ) ||
      agent?.status === "blocked" ||
      quote?.coverageDecision?.allowed === false);
  return { voided, paid, final, blocked };
}
const fresh = (oracle) => {
  if (!oracle?.verified) return false;
  const now = Math.floor(Date.now() / 1000);
  const signed = Number(oracle.timestamp);
  return (
    signed <= now + 60 &&
    signed + 120 >= now &&
    ["usdcUpdatedAt", "usdtUpdatedAt"].every((key) => {
      const seconds = Math.floor(
        Number(oracle[key]) / (Number(oracle[key]) < 10 ** 11 ? 1 : 1000),
      );
      return (
        Number.isFinite(seconds) &&
        seconds > 0 &&
        seconds <= now + 60 &&
        seconds + 300 >= now
      );
    })
  );
};
function calculate(quote, oracle, quoteUsd, recordedDecision = false) {
  const debt = units(quote?.quoteUsd18) ?? BigInt(quoteUsd) * SCALE;
  const escrow = units(quote?.escrowUsdc) ?? 100000000n;
  const reserve = units(quote?.reserveUsdt) ?? 25000000n;
  if (isVoided(quote))
    return {
      debt,
      escrow,
      reserve,
      escrowUsd: null,
      topup: 0n,
      reserveUsd: 0n,
      uncovered: null,
      valid: false,
      historical: false,
    };
  const historical = wasPaid(quote);
  const valid = historical || recordedDecision || fresh(oracle);
  const priceC = valid ? units(oracle?.usdc18) : null;
  const priceT = valid ? units(oracle?.usdt18) : null;
  const escrowUsd = historical
    ? units(quote?.escrowUsd18)
    : priceC && priceC > 0n
      ? (escrow * priceC) / 1000000n
      : null;
  const shortfall =
    escrowUsd === null ? null : debt > escrowUsd ? debt - escrowUsd : 0n;
  const requested =
    shortfall !== null && priceT && priceT > 0n
      ? (shortfall * 1000000n + priceT - 1n) / priceT
      : null;
  const topup = historical
    ? units(quote?.topupUsdt)
    : requested === null
      ? null
      : requested > reserve
        ? reserve
        : requested;
  const reserveUsd =
    topup !== null && priceT ? (topup * priceT) / 1000000n : null;
  const uncovered = historical
    ? units(quote?.uncoveredUsd18)
    : shortfall !== null && reserveUsd !== null
      ? shortfall > reserveUsd
        ? shortfall - reserveUsd
        : 0n
      : null;
  return {
    debt,
    escrow,
    reserve,
    escrowUsd,
    topup,
    reserveUsd,
    uncovered,
    valid,
    historical,
  };
}
const ratio = (value, total) =>
  value === null || total <= 0n
    ? 0
    : Number(
        ((value > total ? total : value < 0n ? 0n : value) * 10000n) / total,
      ) / 100;
async function request(path, body) {
  const response = await fetch(
    "/api/next" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error(
      "The local coverage service did not return a readable response.",
    );
  }
  if (!response.ok)
    throw new Error(
      value.error || value.message || `Request failed (${response.status}).`,
    );
  return value;
}
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M11 5H5v22h6m10-22h6v22h-6M10 12h12M10 20h12" />
    </svg>
  );
}
function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="arrow" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
function Link({ href, children, className = "" }) {
  return href ? (
    <a href={href} className={className} target="_blank" rel="noreferrer">
      {children}
      <span className="external" aria-hidden="true">
        ↗
      </span>
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}
function Badge({ state, children }) {
  return (
    <span className={`badge ${statusClass(state)}`}>{children || state}</span>
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

export default function CoverageApp() {
  const [data, setData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [newDraft, setNewDraft] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [quoteUsd, setQuoteUsd] = useState("110");
  const [limitUsd, setLimitUsd] = useState("0");
  const [updated, setUpdated] = useState(null);
  const live = useRef(true);
  const refreshing = useRef(false);
  const refresh = useCallback(async (quiet = false) => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const [state, result] = await Promise.all([
        request("/state"),
        request("/service-preview").catch(() => null),
      ]);
      if (live.current) {
        setData(state);
        if (result) setPreview(result);
        setUpdated(Date.now());
        if (!quiet) setError("");
      }
    } catch (e) {
      if (live.current && !quiet) setError(e.message);
    } finally {
      refreshing.current = false;
      if (live.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    live.current = true;
    refresh();
    const timer = setInterval(() => refresh(true), 4000);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  const history = Array.isArray(data?.history)
    ? data.history
    : Array.isArray(data?.quotes)
      ? data.quotes
      : [];
  const current =
    history.find((item) => item.id === selectedId) ||
    data?.activeQuote ||
    history.at(-1);
  const quote = newDraft ? null : current;
  const deployment = data?.deployment;
  const configured = !!deployment?.contract;
  const signerReady = data?.localSignerReady === true;
  const accepted = !!quote?.merchantAccepted;
  const preparing = quote?.status === "Preparing";
  const agent =
    quote?.agentTrace ||
    (data?.agent?.quoteId === quote?.id || !data?.agent?.quoteId
      ? data?.agent
      : null);
  const { voided, paid, final, blocked } = coverageViewState(quote, agent);
  const authorized =
    !voided &&
    (!!quote?.buyerAuthorized || Number(quote?.mandate?.expiresAt || 0) > 0);
  const expired =
    !final &&
    authorized &&
    Number(quote?.mandate?.expiresAt || 0) <= Date.now() / 1000;
  const acceptanceExpired =
    !final &&
    !!quote?.merchantAcceptanceExpiry &&
    Number(quote.merchantAcceptanceExpiry) <= Date.now() / 1000;
  const oracle =
    paid && quote?.paymentOracle
      ? quote.paymentOracle
      : quote?.lastOracle || data?.oracle;
  const recordedDecision = !!(
    blocked &&
    quote?.lastOracle &&
    quote?.lastCalculation
  );
  const amounts = calculate(quote, oracle, quoteUsd, recordedDecision);
  const maxGap =
    units(quote?.maxUncoveredUsd18 ?? quote?.maxUncoveredUSD18) ??
    BigInt(limitUsd) * SCALE;
  const minValue = amounts.debt > maxGap ? amounts.debt - maxGap : 0n;
  const estimateFits =
    amounts.uncovered === null ? null : amounts.uncovered <= maxGap;
  const result = quote?.serviceResult || (!quote ? preview : null);
  const summary = result?.report?.summary;
  const reportHref = quote?.serviceResult
    ? `/api/next/service?quoteId=${encodeURIComponent(quote.id)}`
    : !quote && preview
      ? "/api/next/service-preview?download=1"
      : null;
  const explorer = deployment?.explorer || "https://sepolia.basescan.org";
  const tx = (hash) => (hash ? `${explorer}/tx/${hash}` : null);
  const address = (value) => (value ? `${explorer}/address/${value}` : null);
  const steps = Array.isArray(agent?.steps) ? agent.steps : [];
  const evidence = Array.isArray(data?.evidence) ? data.evidence : [];
  const mandate = quote?.mandate;
  const finding = voided
    ? "Invoice voided without payment. Reserved USDT returned to its funder; buyer USDC was not debited."
    : blocked
      ? `Payment paused. The signed-price shortfall exceeds the merchant's accepted ${usd(maxGap)} limit.`
      : paid
        ? amounts.uncovered && amounts.uncovered > 0n
          ? `${usd(amounts.uncovered)} remains uncovered, within the merchant's accepted ${usd(maxGap)} limit.`
          : "The merchant received the full covered value under the accepted terms."
        : quote && !accepted
          ? "The merchant must accept this exact coverage policy before the payer can act."
          : quote && accepted
            ? "Merchant terms are locked. The buyer can delegate this one invoice payment."
            : "The merchant sets how much USD shortfall this invoice may leave unpaid.";
  async function action(name, path, body, follow) {
    setBusy(name);
    setError("");
    setFeedback("");
    try {
      const value = await request(path, body);
      if (follow) await follow(value);
      await refresh(true);
      return value;
    } catch (e) {
      setError(e.message);
      await refresh(true);
      return null;
    } finally {
      setBusy("");
    }
  }
  const prepare = () =>
    action(
      "prepare",
      "/prepare",
      {
        quoteUsd: preparing
          ? (units(quote.quoteUsd18) / SCALE).toString()
          : quoteUsd,
        maxUncoveredUsd: preparing
          ? (
              units(quote.maxUncoveredUsd18 ?? quote.maxUncoveredUSD18) / SCALE
            ).toString()
          : limitUsd,
        acceptedResultSha256: preparing
          ? quote.serviceResult?.sha256
          : preview?.sha256,
      },
      async (value) => {
        const id =
          value.id || value.quoteId || value.quote?.id || value.activeQuote?.id;
        if (!id)
          throw new Error(
            "The invoice was prepared but its ID is missing. Refresh before retrying.",
          );
        setNewDraft(false);
        setSelectedId(id);
      },
    );
  const accept = () =>
    action("merchant", "/merchant-accept", { quoteId: quote.id });
  const authorize = () =>
    action("authorize", "/authorize", { quoteId: quote.id }, async () => {
      setBusy("run");
      await refresh(true);
      await request("/run", { quoteId: quote.id });
    });
  const run = () => action("run", "/run", { quoteId: quote.id });
  const startNew = () => {
    setNewDraft(true);
    setError("");
    setFeedback("");
  };
  const disabledReason = !configured
    ? "Deploy the isolated coverage contract to prepare an invoice."
    : !signerReady
      ? "Configure the isolated V2 test wallets to act on these terms."
      : loading
        ? "Loading the current invoice state."
        : "";
  let mainAction;
  if (!quote || preparing)
    mainAction = (
      <button
        className="primary"
        disabled={!!busy || !!disabledReason || !preview?.sha256}
        onClick={prepare}
      >
        {busy === "prepare"
          ? "Preparing invoice…"
          : preparing
            ? "Resume invoice preparation"
            : "Prepare coverage invoice"}
        <Arrow />
      </button>
    );
  else if (final)
    mainAction = (
      <button className="primary" disabled={!!busy} onClick={startNew}>
        Prepare another invoice
        <Arrow />
      </button>
    );
  else if (!accepted)
    mainAction = (
      <button
        className="primary"
        disabled={!!busy || !!disabledReason || acceptanceExpired}
        onClick={accept}
      >
        {busy === "merchant"
          ? "Recording acceptance…"
          : acceptanceExpired
            ? "Acceptance expired"
            : "Accept coverage terms"}
        <Arrow />
      </button>
    );
  else if (!authorized)
    mainAction = (
      <button
        className="primary"
        disabled={!!busy || !!disabledReason || acceptanceExpired}
        onClick={authorize}
      >
        {busy === "authorize"
          ? "Recording payer mandate…"
          : busy === "run"
            ? "Agent is checking…"
            : "Authorize payer"}
        <Arrow />
      </button>
    );
  else
    mainAction = (
      <button
        className="primary"
        disabled={!!busy || !!disabledReason || expired || acceptanceExpired}
        onClick={run}
      >
        {busy === "run"
          ? "Agent is checking…"
          : expired || acceptanceExpired
            ? "Authority expired"
            : blocked
              ? "Recheck accepted coverage"
              : "Run authorized payer"}
        {!busy && !expired && !acceptanceExpired && <Arrow />}
      </button>
    );

  return (
    <div className="app next-app">
      <header className="shell">
        <a
          className="brand"
          href="/next"
          aria-label="Quote Bond merchant coverage"
        >
          <Mark />
          <span>Quote Bond</span>
        </a>
        <span className="scope">Merchant terms</span>
        <nav className="next-version-links" aria-label="Invoice flows">
          <a href="/">Original desk</a>
          <a href="/next" aria-current="page">
            Merchant coverage
          </a>
        </nav>
        <div className="network">
          <span className="network-dot" />
          {deployment?.network || "Base Sepolia"}
          <span className="testnet-label">Test assets</span>
        </div>
      </header>
      <main>
        <div className="title-row">
          <div>
            <h1>Merchant coverage</h1>
            <p>{finding}</p>
          </div>
          <div className="title-meta">
            <span>
              {loading
                ? "Connecting to coverage service"
                : updated
                  ? `Updated ${time(updated)}`
                  : "Coverage service unavailable"}
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
        <a className="mobile-review" href="#coverage-terms">
          Review accepted terms
          <Arrow />
        </a>
        <div className="test-notice">
          <span className="notice-label">Test quote terms</span>
          <span>
            Real Nodary prices with separate test assets. Quotes above 100 USD
            are agreed stress terms, not a claimed market depeg.
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
                  {result?.sampleInput
                    ? "Sample ledger · Reconciliation service"
                    : "Service invoice"}
                </span>
                <h2>
                  {result ? "Agent reconciliation report" : "Coverage invoice"}
                </h2>
                {summary && (
                  <p className="service-summary muted">
                    {summary.inputRows} input rows · {summary.uniqueInvoices}{" "}
                    invoices · {summary.duplicateRows} duplicate
                  </p>
                )}
              </div>
              <Badge
                state={
                  voided
                    ? "Void"
                    : blocked
                      ? "Blocked"
                      : quote?.status || "Draft"
                }
              >
                {voided
                  ? "Voided · unpaid"
                  : blocked
                    ? "Payment paused"
                    : paid && amounts.uncovered > 0n
                      ? "Partial accepted"
                      : quote?.status || "Draft"}
              </Badge>
            </div>
            <div className="invoice-summary">
              <div>
                <span className="muted">USD quote</span>
                <div className="debt num">
                  {usd(amounts.debt)}
                  <span>USD</span>
                </div>
              </div>
              <div className="invoice-identity">
                <span className="muted small">
                  {quote ? "Coverage invoice ID" : "Proposed terms"}
                </span>
                <code title={quote?.id}>
                  {quote ? short(quote.id, 7) : "Not yet funded"}
                </code>
              </div>
            </div>
            <div className="parties">
              <div>
                <span className="muted small">Payer</span>
                <Link href={address(deployment?.payer)}>
                  <code>{short(deployment?.payer)}</code>
                </Link>
              </div>
              <Arrow />
              <div>
                <span className="muted small">Merchant beneficiary</span>
                <Link href={address(deployment?.merchant)}>
                  <code>{short(deployment?.merchant)}</code>
                </Link>
              </div>
            </div>
            <section className="waterfall" aria-labelledby="next-composition">
              <div className="section-line">
                <h2 id="next-composition">Payment composition</h2>
                <span className="small muted">
                  {voided
                    ? "Closed without payment"
                    : paid
                      ? "Confirmed at settlement"
                      : recordedDecision
                        ? "Recorded blocked snapshot"
                        : "At the signed snapshot"}
                </span>
              </div>
              <div
                className={`waterfall-track ${amounts.escrowUsd === null ? "empty" : ""}`}
                role="img"
                aria-label={
                  voided
                    ? "Closed without payment. USDC stays with the buyer and the reserve returned to its funder."
                    : amounts.uncovered === null
                      ? "No fresh signed-price calculation loaded"
                      : `USDC value ${usd(amounts.escrowUsd)}, reserve value ${usd(amounts.reserveUsd)}, uncovered ${usd(amounts.uncovered)}, merchant maximum ${usd(maxGap)}`
                }
              >
                <div
                  className="escrow-bar"
                  style={{
                    width: ratio(amounts.escrowUsd, amounts.debt) + "%",
                  }}
                />
                <div
                  className="topup-bar"
                  style={{
                    width: ratio(amounts.reserveUsd, amounts.debt) + "%",
                  }}
                />
                {maxGap > 0n && (
                  <div
                    className="merchant-floor-tick"
                    style={{ left: ratio(minValue, amounts.debt) + "%" }}
                  />
                )}
                <div className="target-tick" />
              </div>
              <div className="waterfall-scale">
                <span>$0</span>
                {maxGap > 0n && (
                  <span className="next-floor-key">
                    <i aria-hidden="true" />
                    Merchant minimum {usd(minValue)}
                  </span>
                )}
                <span>{usd(amounts.debt)}</span>
              </div>
              <div className="flow-amounts">
                <div>
                  <span className="data-name">
                    <i className="swatch ink" />
                    USDC value
                  </span>
                  <strong className="num">{usd(amounts.escrowUsd)}</strong>
                  <span className="small muted">
                    {fixed(amounts.escrow, 6, 6)} test-USDC
                  </span>
                </div>
                <div>
                  <span className="data-name">
                    <i className="swatch copper" />
                    Reserve top-up
                  </span>
                  <strong
                    className={`num ${amounts.topup > 0n ? "copper-ink" : ""}`}
                  >
                    {fixed(amounts.topup, 6, 6)}
                  </strong>
                  <span className="small muted">
                    test-USDT · {usd(amounts.reserveUsd)} value
                  </span>
                </div>
                <div>
                  <span className="data-name">Uncovered</span>
                  <strong
                    className={`num ${amounts.uncovered > maxGap ? "negative-ink" : ""}`}
                  >
                    {usd(amounts.uncovered)}
                  </strong>
                  <span className="small muted">
                    {voided
                      ? "Quote closed unpaid"
                      : paid
                        ? "Confirmed remaining gap"
                        : blocked
                          ? "No payment was submitted"
                          : "Before any payment"}
                  </span>
                </div>
              </div>
              {!amounts.valid && (
                <p className="empty-note">
                  {voided
                    ? "No payment was made. USDC remains with the buyer and the reserved USDT returned to its funder."
                    : oracle?.verified
                      ? "Snapshot expired. The agent fetches fresh rates before payment."
                      : "Fetch fresh signed rates to calculate coverage."}
                </p>
              )}
            </section>
            <section
              className={`next-coverage-comparison ${blocked ? "is-blocked" : ""}`}
              aria-label="Coverage decision"
            >
              <div className="next-coverage-pair">
                <span>
                  Merchant maximum <b className="num">{usd(maxGap)}</b>
                </span>
                <span>
                  {paid ? "Actual gap" : "Snapshot gap"}{" "}
                  <b
                    className={`num ${amounts.uncovered > maxGap ? "negative-ink" : ""}`}
                  >
                    {usd(amounts.uncovered)}
                  </b>
                </span>
              </div>
              <p>
                {voided
                  ? "The invoice is closed unpaid. Its prior coverage decision cannot authorize a payment."
                  : blocked
                    ? "No payment: the gap exceeds the accepted limit. Buyer funds and reserve remain unchanged."
                    : paid
                      ? amounts.uncovered > 0n
                        ? "Partial payment fits the merchant's accepted coverage limit."
                        : "The invoice closed with no uncovered USD amount."
                      : estimateFits === null
                        ? "Coverage is checked on fresh signed prices before payment."
                        : estimateFits
                          ? "This snapshot fits. The contract checks again at payment."
                          : "This snapshot exceeds the limit. The agent must stop before payment."}
              </p>
            </section>
            <div className="rate-sheet">
              <div className="section-line">
                <h2>Signed exchange rates</h2>
                {!paid && !voided && (
                  <button
                    className="text-button"
                    disabled={!!busy || !configured}
                    onClick={() => action("oracle", "/oracle", {})}
                  >
                    {busy === "oracle" ? "Fetching…" : "Fetch latest"}
                  </button>
                )}
              </div>
              <div className="rates">
                <div>
                  <span>USDC / USD</span>
                  <strong className="num">
                    {oracle?.usdc18 && amounts.valid
                      ? "$" + fixed(oracle.usdc18, 18, 6)
                      : "—"}
                  </strong>
                  <span className="small muted">
                    Observed {time(oracle?.usdcUpdatedAt)}
                  </span>
                </div>
                <div>
                  <span>USDT / USD</span>
                  <strong className="num">
                    {oracle?.usdt18 && amounts.valid
                      ? "$" + fixed(oracle.usdt18, 18, 6)
                      : "—"}
                  </strong>
                  <span className="small muted">
                    Observed {time(oracle?.usdtUpdatedAt)}
                  </span>
                </div>
                <div className="attested">
                  <span>Nodary snapshot</span>
                  <span>{time(oracle?.timestamp)}</span>
                  <span className="small muted">
                    {voided
                      ? "Not used for payment"
                      : paid
                        ? "Settlement snapshot"
                        : recordedDecision
                          ? "Checked at blocked decision"
                          : amounts.valid
                            ? "Signature and age checked"
                            : oracle?.verified
                              ? "Snapshot expired"
                              : "Awaiting verification"}
                  </span>
                </div>
              </div>
            </div>
            <div className="invoice-foot">
              {reportHref && (
                <a href={reportHref} className="report-link">
                  {quote ? "Download accepted report" : "Review service report"}{" "}
                  ↓
                </a>
              )}
              <span>
                {voided
                  ? "Reserve returned; invoice closed unpaid."
                  : paid
                    ? "Payment confirmed on-chain"
                    : quote
                      ? "Quote and coverage terms are immutable."
                      : "No reserve or payment is authorized yet."}
              </span>
              {quote?.txHash && (
                <Link href={tx(quote.txHash)}>View payment</Link>
              )}
            </div>
          </article>
          <aside
            id="coverage-terms"
            className="mandate-panel panel next-policy-panel"
            aria-labelledby="merchant-policy-title"
          >
            <div className="section-line">
              <h2 id="merchant-policy-title">Merchant terms</h2>
              <Badge
                state={
                  voided ? "Closed" : accepted ? "Accepted" : "Not accepted"
                }
              />
            </div>
            <p className="mandate-description">
              The merchant chooses the largest USD gap this invoice may leave
              unpaid. The buyer cannot widen it later.
            </p>
            {!quote && (
              <div className="next-term-controls">
                <div className="quote-choice">
                  <label htmlFor="next-quote">Quote terms</label>
                  <select
                    id="next-quote"
                    value={quoteUsd}
                    disabled={!!busy}
                    onChange={(e) => setQuoteUsd(e.target.value)}
                  >
                    <option value="110">$110 · Covered shortfall</option>
                    <option value="140">$140 · Larger shortfall</option>
                  </select>
                </div>
                <div className="quote-choice">
                  <label htmlFor="next-gap">Maximum uncovered USD</label>
                  <select
                    id="next-gap"
                    value={limitUsd}
                    disabled={!!busy}
                    onChange={(e) => setLimitUsd(e.target.value)}
                  >
                    <option value="0">$0 · Full coverage only</option>
                    <option value="20">$20 · Partial allowed</option>
                  </select>
                </div>
              </div>
            )}
            <div className="mandate-limits next-merchant-limits">
              <Row label="Maximum uncovered">
                <span className="num">{usd(maxGap)}</span>
              </Row>
              <Row label="Minimum combined value">
                <span className="num">{usd(minValue)}</span>
              </Row>
              <Row label="Reserve cap">
                <span className="num">{fixed(amounts.reserve, 6, 2)}</span>
                <span className="unit">test-USDT</span>
              </Row>
              <Row label="Acceptance expires">
                {quote?.merchantAcceptanceExpiry
                  ? time(quote.merchantAcceptanceExpiry)
                  : "Fixed when prepared"}
              </Row>
            </div>
            {accepted && (
              <div className="next-acceptance">
                <span>
                  {voided
                    ? "Prior merchant acceptance"
                    : "Merchant acceptance locked"}
                </span>
                {quote?.merchantAcceptanceTx && (
                  <Link
                    href={tx(
                      typeof quote.merchantAcceptanceTx === "string"
                        ? quote.merchantAcceptanceTx
                        : quote.merchantAcceptanceTx.transactionHash,
                    )}
                  >
                    View acceptance
                  </Link>
                )}
              </div>
            )}
            <div className="next-payer-section">
              <div className="section-line">
                <h2>Payer mandate</h2>
                <Badge
                  state={
                    voided
                      ? "Closed unpaid"
                      : authorized
                        ? "Authorized"
                        : "Not authorized"
                  }
                />
              </div>
              <Row label="Invoice spend">
                <span className="num">
                  {fixed(mandate?.maxUsdc ?? amounts.escrow, 6, 2)}
                </span>
                <span className="unit">test-USDC</span>
              </Row>
              <Row label="Payment actions">
                <span className="num">
                  {mandate?.actionsUsed ?? 0} / {mandate?.maxActions ?? 1}
                </span>
              </Row>
              <Row label="Gas budget">
                <span className="num">
                  {fixed(mandate?.maxGasWei ?? 200000000000000n, 18, 6)}
                </span>
                <span className="unit">test ETH</span>
              </Row>
              <Row label="Authority expires">
                {mandate?.expiresAt
                  ? time(mandate.expiresAt)
                  : "Up to 30 minutes; bounded by merchant expiry"}
              </Row>
              <p className="small muted">
                Nodary data fee $0. Gas is separate from invoice funds and
                reserve.
              </p>
            </div>
            <div className="mandate-action">
              {mainAction}
              <p className="small muted">
                {disabledReason || !quote || preparing
                  ? disabledReason ||
                    (preparing
                      ? "Resume the same quote funding before merchant acceptance. Its fixed terms stay unchanged."
                      : "Prepare immutable terms and a separate reserve. Merchant acceptance and buyer authority follow.")
                  : final
                    ? voided
                      ? "Prepare a fresh invoice. The prior acceptance and reserve-return record remain in history."
                      : "The original acceptance and payment receipts remain available."
                    : !accepted
                      ? "This action is signed by the isolated merchant role for this exact invoice."
                      : !authorized
                        ? "One bounded initial mandate. The agent then checks coverage and initiates payment automatically."
                        : blocked
                          ? "Rechecking uses the same immutable policy. It cannot charge or consume the reserve twice."
                          : "Only the pinned beneficiary can receive the accepted payment."}
              </p>
              {(blocked || expired || acceptanceExpired) && (
                <button
                  className="text-button next-new-invoice"
                  disabled={!!busy}
                  onClick={startNew}
                >
                  Prepare another invoice
                </button>
              )}
            </div>
          </aside>
        </div>
        <section
          className="activity-section"
          aria-labelledby="next-trail-title"
        >
          <div className="section-line">
            <h2 id="next-trail-title">Payment trail</h2>
            <span className="small muted">
              {steps.length
                ? `${steps.length} recorded steps`
                : "Waiting for merchant acceptance"}
            </span>
          </div>
          <div className="next-approval-flow">
            <div>
              <span
                className={`next-state-dot ${accepted && !voided ? "is-done" : ""}`}
              />
              {voided ? "Acceptance closed" : "Merchant accepted"}
            </div>
            <div>
              <span
                className={`next-state-dot ${authorized ? "is-done" : ""}`}
              />
              {voided ? "Payer authority closed" : "Payer authorized"}
            </div>
            <div>
              <span
                className={`next-state-dot ${paid ? "is-done" : blocked ? "is-blocked" : ""}`}
              />
              {voided
                ? "Reserve returned"
                : blocked
                  ? "Coverage stopped payment"
                  : "Merchant paid"}
            </div>
          </div>
          <div className="trace-list">
            {steps.length ? (
              steps.slice(-5).map((step, index) => (
                <div className="trace-row" key={step.id || index}>
                  <span className="trace-time num">{time(step.at)}</span>
                  <div className="trace-copy">
                    <span>{step.label}</span>
                    {step.detail && <p>{step.detail}</p>}
                  </div>
                  <div className="trace-status">
                    {step.txHash ? (
                      <Link href={tx(step.txHash)}>
                        <code>{short(step.txHash, 4)}</code>
                      </Link>
                    ) : (
                      <Badge state={step.status} />
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-trail">
                The merchant acceptance, buyer mandate, coverage decision and
                payment receipt appear here as they happen.
              </div>
            )}
          </div>
        </section>
        <section className="verification-section panel">
          <details>
            <summary>
              <span>
                <span className="detail-title">
                  Acceptance and response details
                </span>
                <span className="small muted">
                  Pinned policy, source and actual evidence
                </span>
              </span>
              <span className="disclosure-arrow">⌄</span>
            </summary>
            <div className="verification-body">
              <div className="proof-grid">
                <div>
                  <h3>Immutable quote policy</h3>
                  <Row label="Contract">
                    <Link href={address(deployment?.contract)}>
                      <code>{short(deployment?.contract)}</code>
                    </Link>
                  </Row>
                  <Row label="Network">Base Sepolia · 84532</Row>
                  <Row label="Buyer">
                    <code>{short(deployment?.payer)}</code>
                  </Row>
                  <Row label="Merchant">
                    <code>{short(deployment?.merchant)}</code>
                  </Row>
                  <Row label="Test-USDC">
                    <code>{short(deployment?.usdc)}</code>
                  </Row>
                  <Row label="Test-USDT">
                    <code>{short(deployment?.usdt)}</code>
                  </Row>
                  <Row label="Maximum uncovered">
                    <span className="num">{usd(maxGap)}</span>
                  </Row>
                  <Row label="Accepted policy hash">
                    <code title={quote?.policyHash}>
                      {short(quote?.policyHash, 8)}
                    </code>
                  </Row>
                  <Row label="Report SHA-256">
                    <code title={result?.sha256}>
                      {short(result?.sha256, 8)}
                    </code>
                  </Row>
                  <p className="small muted">
                    Acceptance binds the chain, contract, invoice and all fixed
                    quote terms. A later buyer mandate cannot widen coverage.
                    The local app uses isolated test-role keys; it does not
                    claim production wallet custody.
                  </p>
                </div>
                <div>
                  <h3>Signed-price rule</h3>
                  <Row label="Provider">Nodary · latestFeeds</Row>
                  <Row label="Feeds">USDC/USD + USDT/USD</Row>
                  <Row label="Signer">
                    <code>{short(deployment?.signer || oracle?.signer)}</code>
                  </Row>
                  <Row label="Request">
                    <code>
                      {short(deployment?.requestHash || oracle?.requestHash)}
                    </code>
                  </Row>
                  <Row label="Envelope maximum age">120 seconds</Row>
                  <Row label="Each source maximum age">300 seconds</Row>
                  <Row label="Future tolerance">60 seconds</Row>
                  <p className="small muted">
                    A valid price proof can still be rejected when its
                    calculated shortfall exceeds the accepted coverage limit.
                    Signature authenticity does not prove price truth, backing
                    or service quality.
                  </p>
                  {evidence.length > 0 && (
                    <div className="evidence-list">
                      {evidence.slice(-5).map((item, index) => (
                        <div key={item.id || index}>
                          <span>
                            {item.kind || item.label || "Verification"}
                          </span>
                          <Badge
                            state={item.status || item.decision || "Recorded"}
                          />
                          {item.reason && <p>{item.reason}</p>}
                          {item.txHash && (
                            <Link href={tx(item.txHash)}>Receipt</Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {oracle?.data && (
                <details className="raw-response">
                  <summary>Raw signed response</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        timestamp: oracle.timestamp,
                        data: oracle.data,
                        signature: oracle.signature,
                        requestHash: oracle.requestHash,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
              <div className="verification-foot">
                {quote && !voided && (
                  <button
                    className="text-button"
                    disabled={!!busy || !configured}
                    onClick={run}
                  >
                    Reconcile this invoice
                  </button>
                )}
                {quote?.canVoid && !voided && (
                  <button
                    className="text-button"
                    disabled={!!busy || !signerReady}
                    onClick={() =>
                      action("void", "/void", { quoteId: quote.id })
                    }
                  >
                    Release expired reserve
                  </button>
                )}
                <span className="small muted">
                  A blocked payment leaves tokens and quote state unchanged. A
                  mined revert still spends gas.
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
                  Coverage invoices{" "}
                  <span className="muted">{history.length}</span>
                </span>
                <span className="disclosure-arrow">⌄</span>
              </summary>
              <div className="next-history-list">
                {history
                  .slice()
                  .reverse()
                  .map((item) => (
                    <div className="next-history-row" key={item.id}>
                      <button
                        className="next-history-open"
                        onClick={() => {
                          setSelectedId(item.id);
                          setNewDraft(false);
                          setError("");
                        }}
                      >
                        <span>{item.jobId || "Coverage invoice"}</span>
                        <code>{short(item.id, 7)}</code>
                      </button>
                      <div className="next-history-value">
                        <span className="num">{usd(item.quoteUsd18)}</span>
                        <span className="small muted">
                          Max gap{" "}
                          {usd(
                            item.maxUncoveredUsd18 ?? item.maxUncoveredUSD18,
                          )}
                        </span>
                      </div>
                      <Badge
                        state={
                          isVoided(item)
                            ? "Void"
                            : String(item.coverageState).toLowerCase() ===
                                "blocked"
                              ? "Blocked"
                              : item.status
                        }
                      >
                        {isVoided(item)
                          ? "Voided"
                          : String(item.coverageState).toLowerCase() ===
                              "blocked"
                            ? "Paused"
                            : item.status}
                      </Badge>
                      {item.txHash ? (
                        <Link href={tx(item.txHash)}>Payment</Link>
                      ) : (
                        <span className="small muted">Unpaid</span>
                      )}
                    </div>
                  ))}
              </div>
            </details>
          </section>
        )}
        <footer>
          <span>Quote Bond · Merchant-accepted coverage</span>
          <span>
            Original capped behavior remains available at{" "}
            <a href="/">the original desk</a>.
          </span>
        </footer>
      </main>
    </div>
  );
}
