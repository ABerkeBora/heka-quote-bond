# Quote Bond — API3 requirements and evidence

Selected partner track: **API3 only**. BSV/Cardano were not selected.

Start gate:31 October2026 **03:39 Europe/Berlin**. Final rule recheck:31 October2026 **03:54 Europe/Berlin**. In both checks, the browser selected the actual API3 tab, expanded its qualification/submission/judging text and read the general How to submit tab. The final check reloaded the official page. No material requirement change was observed.

Official sources:

- [API3 prize section](https://hackathon.tum-blockchain.com/prizes#api3)
- [General submission rules](https://hackathon.tum-blockchain.com/prizes#how-to-submit)
- [Official starter](https://github.com/api3dao/airnodehub-hackathon-starter)
- [From API to contract](https://api3dao.github.io/airnodehub-hackathon/docs/from-api-to-contract)
- [Recommended integrations](https://api3dao.github.io/airnodehub-hackathon/docs/integrations)
- [Projection guide](https://api3dao.github.io/airnodehub-hackathon/docs/projections)
- [Nodary listing](https://airnodehub.api3.org/explore/nodary)
- [Live metadata](https://airnode-nodary.fly.dev/)

## Mandatory technical qualification

| Requirement | Implementation | Status and actual evidence |
|---|---|---|
| AirnodeHub is essential to core workflow | Both signed stablecoin prices determine the atomic invoice shortfall payment. Removing them stops payment. | **PASS** — `contracts/QuoteBond.sol`, `server/oracle.mjs`, `evidence/browser-payment.json` |
| Signed response submitted to a deployed contract; expected signer, exact request and timing checked | Fixed Nodary signer/request; official EIP191 verifier; raw bytes; envelope120s/source300s/skew60s | **PASS** — Base Sepolia contract `0x0adccdd8461696284b9b728267a23a4e38163ab2`; `evidence/deployment.json`, `deployment-verification.json` |
| Signed value drives meaningful state change; duplicates protected |100 test-USDC plus actual priced/capped USDT paid to pinned merchant; quote consumed once | **PASS** — `evidence/live-payment.json`, `browser-payment.json`, `duplicate.json`; explorer links in README |
| Timely valid response | Real unchanged Nodary response triggers atomic payment | **PASS** — tx `0xcc488ac491a2c9e371a2b370c0433baa0229373bd9dad831e2e28b257b17111d` |
| Real response with one edited value rejected before protected action | Expected `NotSignedByAirnode`; actual reverted transaction; all protected tokens/state unchanged | **PASS** — `evidence/tamper-edited.json`, tx `0xfb6e3a4783c3a691d64b2505192b7b26e7a64a79ebe75d45283268f5a2037f49` |
| Unchanged real response too old rejected | Aged original signed envelope, not edited timestamp; expected `ResponseTooOld` | **PASS** — `evidence/tamper-stale.json`, tx `0x55fab4bd398ca3dc30d9dd5eaef1f8177b12f5993151f28c07d9db73bfb3b1c6` |
| Real different request rejected | ETH/USD request submitted to fixed USDC+USDT consumer; expected `NotSignedByAirnode` | **PASS** — `evidence/tamper-wrong-request.json`, tx `0x35a0dba8c41821a4562279ded2c7f9d3fdc879b83a8cb4beb2b4020402bc9ea3` |
| Other key rejected | Same request/data signed by a different test key; expected `NotSignedByAirnode` | **PASS** — `evidence/tamper-wrong-signer.json`, tx `0x0c7586f35c6a0c7982cf136aa4b09b59497bef2e106947d1e02ebae19c59ac2d` |

These negative transactions spent test gas. The unchanged-balance assertion concerns protected ERC20 funds and quote state, not the sender's ETH balance. Unit tests use synthetic keys; they are separate from the actual Nodary/testnet evidence above.

## Mandatory submission items

| Item | Status | Deliverable / remaining action |
|---|---|---|
| Contract address and network | **PASS** | README and deployment manifest include chain84532 and explorer links |
| Judges can submit their own raw responses | **PASS** | `scripts/prepare-judge.mjs`, `scripts/submit-response.mjs`, README commands. Deployed contract decides; no off-chain signature gate in submit script. UI additionally replays recorded historical blocks, clearly labelled read-only. |
| Description: problem, build, mechanics, data reliance, forgery harm, unavailable desired data | **PASS** for prepared artifact | `SUBMISSION_DRAFT.md`; must be entered in Devfolio by user if selected |
| Public repository and setup/run README | **PENDING** at recheck | Repository created at https://github.com/ABerkeBora/heka-quote-bond; final push verification recorded in MORNING_HANDOFF |
| Actual video≤2.5min, with valid action then four rejects | **PENDING** |150s outline in `PRESENTATION.md`; actual recording still needed. No claim of complete submission. |
| Devfolio entry before deadline | **PENDING** | User has not authorized competition submission. Deadline reverified **31 October2026 15:00 Europe/Berlin**; one submission per team, up to3 partner tracks. |

## Additional user product acceptance

These are user requirements, not newly invented API3 qualification rules.

| User requirement | Status | Evidence |
|---|---|---|
| One bounded initial mandate; agent initiates economic action without a fresh payment click | **PASS** | Browser Accept report & authorize automatically calls agent. Actual report invoice payment in `evidence/browser-payment.json`; payer/recipient fixed on-chain |
| Mandate asset/network/recipient/spend/action/expiry boundaries | **PASS** | `QuoteBond.sol`, `validateMandate`, policy tests;100USDC,25USDT, one action,30min |
| Gas/API cap and separate economic buckets | **PASS** as local guard |0.0002testETH combined buyer approval+mandate+payment; max L2 fee plus buffered L1 estimate before broadcast; actual L1 fee in receipts. This is not an on-chain hard bound on variable Base L1 fees or a general wallet policy. Free Nodary API fee0. |
| Duplicate intent, uncertain tx and restart reconcile | **PASS** | Signed raw tx/hash/nonce saved before broadcast; per-process locks. `duplicate.json`, `restart-reconciliation.json`, actual new-process `process-restart.json` |
| One blocked action | **PASS** | `blocked-budget.json`, `duplicate.json`, Node mandate tests; no new transaction |
| Positive, capped and zero top-up | **PASS** | `browser-payment.json`, `capped-payment.json`, `standard-payment.json` all real Base Sepolia receipts |
| Useful paid result, honest test setup | **PASS** | Actual computed reconciliation report from explicitly sample ledger; exact SHA256 binds report to new quote ID. Isolated merchant role, no commercial service adoption claim. |

## Optional examples and judging preferences

Signed-price guards, conditional payments and protocol safeguards are examples, not additional requirements. Usefulness, originality and execution are judging preferences. Repeated autonomous data/action cycles add value; paid x402 calls only apply when required by the operation. Nodary is free, so no fabricated402 payment was added. The payer is a deterministic bounded agent; no runtime LLM or model-selected settlement authority is claimed.

## Remaining qualification and trust limits

The technical integration and four required rejection cases have actual evidence. The **submission package is incomplete until the user records the video and submits the chosen project**. Public push must be verified before the repository row becomes PASS. Signature authenticity does not prove upstream price truth, token backing, redemption or service quality. First fresh snapshot timing risk and local test-key custody are documented in README and `contracts/SECURITY.md`.
