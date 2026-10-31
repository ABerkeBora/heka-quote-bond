# Quote Bond

An agent pays one accepted service invoice in test-USDC. A separately funded test-USDT reserve covers the USD shortfall, up to a fixed cap, using real API3/Nodary signed prices. The payer authorizes the exact invoice once; the agent fetches, checks and submits the atomic payment without another payment click.

The working screen is an invoice desk, not a marketing page. It includes a concrete reconciliation report from explicitly sample ledger input, the payer mandate, payment composition, transaction trail and recorded rejection checks. The report's exact content hash is included in the invoice ID before funding. The contract governs payment, not report quality.

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

## Checks and delivery

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
