# Quote Bond V1 baseline

Captured31 October2026,04:28 Europe/Berlin before V2. The preceding implementation goal was explicitly completed in this chat; the new `get_goal` response reported no active goal (`goal:null`). V1 is a finished deliverable, not reduced or relabelled by V2.

- Working commit: `974ae378b3e953d1dc8804c51ffb721133be70a7` on `codex/build`.
- Immutable tag: `v1-baseline` points to that commit. It must not be moved.
- V1 URL: http://localhost:3104/ (also http://127.0.0.1:3104/).
- Run: `npm ci`, `forge build`, `npm run build`, `npm start`; Node24+, Foundry. Local production service was already running on3104 at capture.
- API namespace: `/api/*` (existing endpoints preserved).
- Mutable local state: `.local/state.json`; signed intent/nonce/receipt journal `.local/transactions.json`; current deployed manifest from `.local/deployment.json` if present, otherwise `evidence/deployment.json`; isolated wallet selection from ignored `.env`/`WALLET_FILE`.
- Base Sepolia84532 contract: `0x0adccdd8461696284b9b728267a23a4e38163ab2`.
- Test-USDC: `0x9836ce4422c66ff3d1eed23345349d4fad2a7341`; test-USDT: `0x72a335c7739d000d5aaa49239f60594f03a55b0c`.
- Frozen contract source SHA256: `f134fe53e319f3c8f4a8eedd2b008c6524693429572283a898e2d26a01dab9b8`.
- Existing evidence: `evidence/deployment*.json`, `live-payment.json`, `browser-payment.json`, `capped-payment.json`, `standard-payment.json`, `tamper-*.json`, `process-restart.json`, `final-receipt-check.json`, `public-state.json` and `receipts/`. These files are immutable V1 history during V2.
- At capture:35 journal entries, zero pending/unreconciled transactions; five final quotes (four Settled, one Capped), one quote marked evidence-only. No active escrow/payment job is cancelled or reused.
- V1 checks already passed:24 Node tests,34 contract tests, production build/audit and1440/768/390px browser checks. Video and Devfolio entry remain user actions; technical integration readiness is not a submitted competition entry.

V2 is a narrow customer preference: merchant-approved `maxUncoveredUSD18`. V1's capped payout is intentional behavior, not retroactively called a security defect. `/next`, `/api/next/*`, `.local/v2/`, `evidence/v2/`, new wallets/tokens/contract and a separate deployment isolate V2. V1's reserves, token balances and receipts are not used as V2 collateral.
