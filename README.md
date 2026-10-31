# Quote Bond

An agent pays one accepted service invoice in test-USDC. A separately funded test-USDT reserve covers the USD shortfall, up to a fixed cap, using real API3/Nodary signed prices. The payer authorizes the exact invoice once; the agent fetches, checks and submits the atomic payment without another payment click.

The working screen is an invoice desk, not a marketing page. It includes a concrete reconciliation report from explicitly sample ledger input, the payer mandate, payment composition, transaction trail and recorded rejection checks. The report's exact content hash is included in the invoice ID before funding. The contract governs payment, not report quality.


## Compare the two invoice flows

| Version | Open locally | Code/history | Behavior |
|---|---|---|---|
| V1 | [Original invoice desk](http://localhost:3104/) | [v1-baseline](https://github.com/ABerkeBora/heka-quote-bond/tree/v1-baseline), commit974ae378 | Pays the capped contribution and reports any remaining gap. |
| V2 | [Merchant coverage](http://localhost:3104/next) | [codex/next](https://github.com/ABerkeBora/heka-quote-bond/tree/codex/next) | Pays only when the signed-price gap is within the merchant's immutable accepted limit. |

V2 adds one customer choice, `maxUncoveredUSD18`:0 requires full coverage; a positive amount permits an explicitly accepted partial payment. V1's capped behavior remains intentional. Both routes share the same product identity and server on3104; contracts, test tokens, wallet roles, APIs, intent journals and local state are separate. See `BASELINE_V1.md` and `MORNING_HANDOFF_V2.md`.

### V2 operation and evidence

Prepare an invoice and review the exact coverage terms. **Accept coverage terms** records a transaction from the separate test merchant. **Authorize payer** records the bounded buyer mandate, then the agent fetches real Nodary prices and pays automatically or stops before broadcast. The contract independently enforces coverage before any protected transfer.

- Contract: [0x1f92600480b282026e2bf4c252763566b4212cb6](https://sepolia.basescan.org/address/0x1f92600480b282026e2bf4c252763566b4212cb6), Base Sepolia84532.
- Separate V2 test assets/roles: `evidence/v2/deployment.json`. Native gas allocation from the prepared V1 deployer was0.0014 testETH; V1 ERC20/reserve balances were unchanged (`gas-funding.json`). No V1 token is V2 collateral.
- [Merchant full-only acceptance](https://sepolia.basescan.org/tx/0x5b476fcbb9900b9bcb3446fbf0fab1178c29fd8d51cc94b730d2323603e15514), [full payment](https://sepolia.basescan.org/tx/0xf8bd1654e25094757f64fb4c2bbef0295e0d5af799786078aae3c2467a03669f).
- [Explicit partial payment](https://sepolia.basescan.org/tx/0x36568d01ff15c8294a3f4ede918eabc9622017b45c99860ca7172e61b0fc0357):14.94330398188768USD uncovered within the accepted20USD maximum.
- [Valid-price insufficient coverage rejected](https://sepolia.basescan.org/tx/0x402739633ab7716188eef1e25c5f3649167b70d0ab223ce8cee99d5cc1ac3eb6). `agent-coverage-block.json` separately proves the agent produced no new signed payment/broadcast; protected tokens and state stayed unchanged. The direct reverted attempt spent test gas.
- New V2 four-oracle-tamper receipts: `evidence/v2/live-summary.json`; accepted/binding, duplicate, actual new-process merchant+payment recovery, runtime-bytecode verification and V1 regression evidence are in the same directory.
- Real UI acceptance→buyer delegation→automatic payment: `evidence/v2/browser-payment.json`; three viewport checks: `BROWSER_QA.md`.

Merchant acceptance is an on-chain `acceptCoverage(id,expectedPolicyHash)` from the pinned beneficiary. The hash binds chain, contract, quote/job ID, both parties/funder, both tokens, oracle recipe, USD amount, exact USDC spend, reserve, uncovered limit and fixed windows/expiry. It cannot be widened by a buyer mandate or reused for another quote. The comparison is exact USD18, inclusive at the limit, after the existing integer floor/ceil/cap calculation. Acceptance and buyer expiry are exclusive; buyer authority ends no later than merchant acceptance.

An unpaid coverage-blocked quote remains unconsumed; its reserve stays allocated until the fixed hard deadline. A new invoice never edits the old policy. Expired unpaid quotes can release their reserve through the existing void rule. Report acceptance/quality and real commercial merchant adoption are not proved by price verification: this is a real test-role transaction flow with explicitly sample service input, not an external merchant pilot.

For your own V2 wallets, stop the server first:

```sh
npm run v2:wallets:init
# Fund the three printed Base Sepolia addresses with testETH.
# Alternatively, your own funded V1 test deployer can allocate the fixed0.0014testETH:
npm run v2:fund-gas
npm run v2:deploy
npm run build
npm start
```

V2 keys/journal/state live only in `.local/v2/` (keys0600); published evidence is under `evidence/v2/`. Both runtime locks prevent mutation scripts beside the server. `npm run v2:recover-lock` only removes locks for dead PIDs. No automatic top-up or new API fee exists.

Judges can test a fresh raw response without an off-chain signature/coverage gate:

```sh
# Stop the server. This prepares/funds a new full-only test quote,
# records actual merchant acceptance and buyer authority, but does not pay it.
npm run v2:judge:prepare
npm run v2:submit-response -- --file .local/v2/judge-response.json --quote QUOTE_ID
# Optional actual broadcast; invalid calls still spend capped test gas.
npm run v2:submit-response -- --file .local/v2/judge-response.json --quote QUOTE_ID --broadcast
```

Keep an original envelope unchanged for more than120seconds to test age. Saved edited/different-request/wrong-key examples are in `evidence/v2/negative-*.json`. A fresh acceptable response also needs both source observations within300seconds; wait for provider updates rather than weakening the policy. `v2:evidence` preserves the recorded complete suite; `v2:regression` repeats read-only V1 isolation/historical checks. The accepted report and V2 receipts remain distinct from V1's history.

Current combined tests:41 Node +88 contract tests. Video recording/Devfolio submission remain human actions. Both versions are locally runnable; hosting/mainnet spending/submission were not performed.

## Run locally

Prerequisites: Node.js24+, npm and [Foundry](https://getfoundry.sh/). No paid API account, model runtime or hosted service is required. Port **3104** is isolated to this app.

```sh
npm ci
forge build
npm test
forge test
npm run build
npm start
```

Open [Quote Bond](http://127.0.0.1:3104). `npm run dev` provides the same local service with Vite editing support, sharing port3104. Both bind to127.0.0.1. A fresh clone shows the saved real testnet run and can replay its rejection checks without keys. Authorization requires separately configured isolated test wallets. No fixtures count as live payment evidence.

### Create your own fresh test scenario

Stop the server before running mutation scripts. The app has one runtime owner and a durable signer lock.

```sh
cp .env.example .env
npm run wallets:init
# Fund each printed address with Base Sepolia TEST ETH.
# Suggested test funding: deployer0.01 ETH; buyer/counterparty0.001 ETH each.
npm run deploy -- --new
npm start
```

`wallets:init` generates three separate test roles in ignored `.local/wallets.json` with0600 permissions. Never use a mainnet key. `.env` points to that file. The deployment mints1000 test-USDC to the buyer and250 test-USDT to the platform reserve funder; these are purpose-built, unbacked test ERC20s. Deployments and mints are setup costs, separate from invoice gas. No aUSD is consumed because Nodary's operation is free.

The new deployment and state remain under ignored `.local/`. Published deployment history stays in `evidence/`. An interrupted deployment resumes the same durable transaction intents. A completed deployment is preserved unless `--new` is explicitly given.

1. Review/download the sample reconciliation report before authorization.
2. Choose110USD against100 test-USDC for a positive shortfall;100USD for normal terms;140USD to exercise the25 test-USDT cap. Higher quotes are explicit stress terms, **not a claimed market depeg**.
3. Select **Accept report & authorize**. The platform funds the separate reserve, and the buyer records exact token approval and a one-invoice on-chain mandate. This local harness uses isolated server-side test keys, not a browser wallet or a production custody design.
4. The agent runs automatically: validate mandate → fetch real signed prices → simulate the deployed payment path → submit one atomic transaction → reconcile its receipt and delivered result.
5. Download the accepted report and inspect the payment receipt. Create another invoice only when the prior one is final. This isolated scenario has a ten-invoice limit; no automatic gas or collateral top-up occurs.

If a process crashes, stop any remaining owner and run `npm run recover-lock`. It removes only locks whose recorded PID is no longer alive. Then resume the same invoice. Never delete the transaction journal to make a pending operation look new.

## Live deployment and evidence

Network: **Base Sepolia, chain84532**.

| Item | Explorer |
|---|---|
| Quote Bond contract | [0x0adccdd8461696284b9b728267a23a4e38163ab2](https://sepolia.basescan.org/address/0x0adccdd8461696284b9b728267a23a4e38163ab2) |
| Test-USDC,6 decimals | [0x9836ce4422c66ff3d1eed23345349d4fad2a7341](https://sepolia.basescan.org/address/0x9836ce4422c66ff3d1eed23345349d4fad2a7341) |
| Test-USDT,6 decimals | [0x72a335c7739d000d5aaa49239f60594f03a55b0c](https://sepolia.basescan.org/address/0x72a335c7739d000d5aaa49239f60594f03a55b0c) |
| Browser-authorized report invoice | [Confirmed100 test-USDC +9.916874 test-USDT](https://sepolia.basescan.org/tx/0xcc488ac491a2c9e371a2b370c0433baa0229373bd9dad831e2e28b257b17111d) |
| Capped140USD invoice | [Confirmed25 test-USDT;14.9331125USD uncovered](https://sepolia.basescan.org/tx/0xf2067aea97fe5e83b384668192f9a90e6308851d493399a8ba836c01b14a15df) |
| Normal100USD invoice | [Confirmed100 test-USDC; zero top-up](https://sepolia.basescan.org/tx/0x96c1664cc70eb635783bc8c908511cfda44b7ec9e8131f6fea2d6ebeb2ad6029) |
| First atomic positive settlement | [Confirmed100 test-USDC +9.917226 test-USDT](https://sepolia.basescan.org/tx/0x22c0cb79051b3c8b8d922dc79e5c89ce1c3afa983ce13eb93bb7f929087833da) |
| Edited value rejected | [Reverted transaction](https://sepolia.basescan.org/tx/0xfb6e3a4783c3a691d64b2505192b7b26e7a64a79ebe75d45283268f5a2037f49) |
| Unchanged aged real response rejected | [Reverted transaction](https://sepolia.basescan.org/tx/0x55fab4bd398ca3dc30d9dd5eaef1f8177b12f5993151f28c07d9db73bfb3b1c6) |
| Real different request rejected | [Reverted transaction](https://sepolia.basescan.org/tx/0x35a0dba8c41821a4562279ded2c7f9d3fdc879b83a8cb4beb2b4020402bc9ea3) |
| Wrong key rejected | [Reverted transaction](https://sepolia.basescan.org/tx/0x0c7586f35c6a0c7982cf136aa4b09b59497bef2e106947d1e02ebae19c59ac2d) |

`evidence/browser-payment.json` binds the new report invoice to its actual receipt and submitted report hash. `evidence/live-payment.json` records actual before/after token balances for the first integration payment. That earlier payment is not retroactively claimed as acceptance of the subsequently added report feature.

Each `evidence/tamper-*.json` has the raw envelope, expected decoded error, actual reverted receipt and unchanged protected balance/state snapshots. `duplicate.json`, `blocked-budget.json` and `process-restart.json` cover delegated execution safety. `deployment-verification.json` compares deployed runtime bytecode to the frozen local artifact, normalizing compiler immutable slots; this is not a claim of explorer source verification.

## Submit your own response

The UI's four replay controls execute **historical `eth_call`** at the original recorded blocks. They do not broadcast a new transaction and are labelled accordingly. The original four negative transactions above were actually mined. Historical replay requires an RPC with those blocks available.

For a new current response, stop the server and create an active judge invoice using your configured test wallets:

```sh
npm run judge:prepare
# The command prints QUOTE_ID and saves evidence/judge-response.json.
npm run submit-response -- --file evidence/judge-response.json --quote QUOTE_ID
# Optional: submit to the network, including a deliberately invalid proof.
npm run submit-response -- --file evidence/judge-response.json --quote QUOTE_ID --broadcast
```

The submit script deliberately bypasses the off-chain signature check so the **deployed contract** decides. It only targets the configured Quote Bond contract; it cannot choose another recipient or arbitrary function. A simulation is read-only. `--broadcast` spends test gas, including on a revert, within its explicit cap. For the stale case, keep the original signed timestamp/data/signature unchanged and wait more than120 seconds. Changing the timestamp tests integrity, not age. Different-request and wrong-key response construction is reproducible in `server/agent.mjs`; the saved real test cases are available in `evidence/`.

`npm run evidence` preserves the completed original integration suite instead of overwriting its original before/after snapshots. For fresh current responses, use `judge:prepare` and `submit-response` above. Stop the server before mutation scripts; these spend test gas and reserve test collateral.

## Mandate, arithmetic and trust

| Bound | Enforcement |
|---|---|
| Network84532; immutable USDC/USDT, contract, payer and beneficiary | Contract state plus chain-specific buyer authorization; deterministic tool guard |
| Exact100 test-USDC, one successful invoice payment, reserve≤25 test-USDT | On-chain immutable quote, exact buyer authorization, consumed state, exact ERC20 allowance |
| Mandate30min; normal window15min, hard deadline45min | Contract, with expiry exclusive; no post-expiry new debit |
| Combined buyer approval+mandate+payment budget0.0002 testETH | Local signing guard; includes execution gas plus buffered L1 estimate, records actual receipt L1 fee; not a network-wide wallet policy |
| API fee0; no automatic top-up | Fixed free Nodary operation and local policy |

```text
escrowUSD18 = floor(escrowUSDC6 * priceUSDC18 / 1e6)
shortfallUSD18 = max(quoteUSD18 - escrowUSD18,0)
requestedUSDT6 = ceil(shortfallUSD18 * 1e6 / priceUSDT18)
paidUSDT6 = min(requestedUSDT6,reservedUSDT6)
```

Both actual prices matter; USDT is never assumed to be1USD. JSON price lexemes remain exact integers after decimal scaling. The contract uses the official [Airnode v2 verifier and projected JSON parser](https://github.com/api3dao/airnodehub-hackathon-starter), pinned Nodary signer `0xE70f1e8b22a21e4Bb5188918a3033341b281E4c0`, and exact request hash `0x5e2ded887668087a5a3151af552932c0ab022114f63c38bb7a147390c4fe23ec`. `server/oracle.mjs` contains the full canonical operation/parameters/projection.

Envelope age≤120s, each source observation age≤300s, future skew≤60s are checked independently. Invalid data reverts before protected transfers. Unused reserve returns after settlement. After hard deadline, anyone can void an unpaid quote: reserve returns to its funder, USDC stays in the buyer's wallet because it was never prefunded into escrow. A mandate can expire before that hard deadline.

The first sufficiently fresh accepted snapshot in the agreed window wins; it does not prove an exact historical deadline price. The signature authenticates Nodary's answer, not source truth, stablecoin solvency, fiat redemption, commercial invoice acceptance or service quality. The system is a bounded deterministic payer, not an LLM settlement authority. The local merchant is an isolated test participant; no commercial customers or revenue are claimed. See `contracts/SECURITY.md` and `evidence/SECURITY_REVIEW.md`.

## V1 baseline checks and delivery

- `npm test`:24 Node policy/precision/service tests.
- `forge test`:34 contract tests, including oracle/time/recipient/replay/cap/void cases.
- `npm run build`: production frontend.
- `npm audit --audit-level=moderate`: dependency audit.
- Real browser walkthrough and viewport report: `evidence/BROWSER_QA.md`.
- Current track checklist: `TRACK_REQUIREMENTS.md`.
- Turkish review handoff: `MORNING_HANDOFF.md`.
- 150-second recording outline: `PRESENTATION.md`; submission copy: `SUBMISSION_DRAFT.md`.

Selected track: API3 only. The actual video remains to be recorded and Devfolio submission is not performed here. Official rules allow one submission per team; the published deadline is31 October2026 at15:00 Europe/Berlin. The final rule recheck in `TRACK_REQUIREMENTS.md` is authoritative for this build.

MIT license. Official API3 library attribution is retained under `contracts/vendor/`; font licenses are under `web/assets/`.
