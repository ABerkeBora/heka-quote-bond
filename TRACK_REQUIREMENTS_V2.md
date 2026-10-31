# Quote Bond V2 — rule and acceptance gate

Selected sponsor: API3 only. Start check31 October2026,04:29 Europe/Berlin: the browser selected the actual API3 tab, expanded About/What to submit/Judging and read the general How to submit tab. Current official starter/from-API guide re-opened. No material change from V1 requirements observed.

Sources: https://hackathon.tum-blockchain.com/prizes#api3 ; https://hackathon.tum-blockchain.com/prizes#how-to-submit ; https://github.com/api3dao/airnodehub-hackathon-starter ; https://api3dao.github.io/airnodehub-hackathon/docs/from-api-to-contract .

| Mandatory track item | V2 implementation | Start status |
|---|---|---|
| Essential authenticated AirnodeHub data | Same fixed Nodary two-price request drives atomic coverage-constrained payment | PENDING |
| Deployed contract verifies signer/request/timing | Separate V2 contract retains original checks | PENDING |
| Signed value drives meaningful state; duplicate protection | Merchant-approved uncovered limit before transfers; one consumed quote | PENDING |
| Valid timely + four required invalid responses | New deployed V2 evidence, no reused V1 qualification claim | PENDING |
| Address/network + judges own response path | V2 deployment manifest and documented script | PENDING |
| Public source + setup/readme | Same repo codex/next, preserved V1 baseline tag | PENDING |
| Actual≤150s video and Devfolio description | V2 outline/copy prepared; user records/submits chosen project | PENDING |

General deadline remains31 October2026,15:00 Europe/Berlin; one submission per team, up to3 partner tracks. Submission/hosting/mainnet spend not authorized.

User V2 acceptance, additional to sponsor rules: merchant immutable acceptance binding; valid-price insufficient-coverage no-payment; full and explicit partial successes; duplicate/restart; V1 route/receipt/token preservation and regression; separate API/state/deployment/wallet namespace; browser checks; README and MORNING_HANDOFF_V2. All PENDING until actual evidence.

Example ideas and autonomous repeated cycles are judging preferences, not extra qualification. Nodary operation remains free; no invented x402 fee. Finish rule recheck remains PENDING.

## Live implementation evidence update

- Essential authenticated payment/coverage, deployed signer/request/timing guard and one-use payment: **PASS**, `evidence/v2/deployment.json`, `full-payment.json`, `partial-payment.json`, `deployment-verification.json`.
- Four required edited/stale/different-request/wrong-key cases: **PASS**, actual mined/reverted `negative-*.json`, exact decoded errors and unchanged protected state. Free Nodary remains0API fee.
- Merchant real separate-role acceptance, absent/modified/other-quote refusal: **PASS**, `acceptance/*.json`, `acceptance-binding.json`, `negative-unaccepted.json`,54 new contract tests.
- Valid-price insufficient coverage: **PASS**, `agent-coverage-block.json` (no new signature/broadcast), `negative-coverage.json` (actual revert; gas spent).
- Full and explicit partial payments: **PASS**, `full-payment.json`, `partial-payment.json`; actual browser acceptance→mandate→automatic payment in `browser-payment.json`.
- Duplicate/new-process merchant+payment recovery: **PASS**, `duplicate.json`, `process-restart.json`.
- V1 unchanged contract/engine/screen/evidence, separate V2 tokens/roles and V1 protected balances: **PASS**, `v1-regression.json`, baseline hash tests. Native setup gas allocation is disclosed separately.
- Judges' own response script: **PASS**, `scripts/v2-submit-response.mjs`, raw/wrapped response handling and direct deployed contract rejection output; recorded command check under `judge-script-check.json`.
- Tests/build/browser: **PASS**,41Node+88contract tests, production build/audit, `evidence/v2/BROWSER_QA.md` for1440/768/390px and V1 navigation.
- Public V2 push/final rule recheck/clean source startup: **PENDING** until final verification.
- Actual≤150s video and Devfolio entry: **PENDING user actions**; prepared outline in `MORNING_HANDOFF_V2.md`. No full-submission claim.

## Finish rule recheck —31 October2026,04:46 Europe/Berlin

Official prize page reloaded, actual API3 tab selected/expanded, and general submission section reread. No material requirement change. Technical mandatory integration and failure proofs above remain PASS. Actual video/Devfolio remain PENDING user actions. Start From-API guide URL was attempted but the web extractor failed; current official starter supplied the complete verifier/request/freshness implementation guide. No verification blocker was silently substituted. Public push and clean-source startup are the remaining delivery checks, not unproved protocol success claims.

Clean source-only production startup: **PASS**, `evidence/v2/clean-start.json`; no env/keys/localstate atboot, both saved histories and distinct deployments loaded, both signing controls disabled. Final13 actual receipt statuses reconfirmed in `final-receipt-check.json`. Public codex/next push is the only remaining delivery verification; actual video/Devfolio remain separately PENDING.

Final delivery verification: **PASS** — public `codex/next` implementation commit0bf86755 and preserved `v1-baseline` tag pushed; author/committer map toABerkeBora. Clean dual-version startup and final localhost comparison both passed. Actual video and Devfolio are the only mandatory submission items still PENDING; no submitted-entry or external-pilot claim is made.
