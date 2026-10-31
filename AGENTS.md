# Quote Bond

This repository owns Quote Bond only. Use port **3104** and isolated `.local/` state, wallets and deployment. Do not change sibling projects, global Git identity or shared services.

## Product and authorization

- Selected sponsor track: **API3 only**. No BSV/Cardano claims or requirements.
- Before contract/application work, read the actual API3 tab and general rules at https://hackathon.tum-blockchain.com/prizes. URL fragments alone may show the wrong default sponsor. Read the linked official starter, update `TRACK_REQUIREMENTS.md` with sources, Europe/Berlin time, mandatory/optional separation and evidence. Recheck before reporting ready.
- The core is one approved service invoice: exact test-USDC debit, pinned merchant, fixed USD quote and separately funded capped test-USDT reserve. Real signed Nodary USDC/USD and USDT/USD determine the atomic settlement. No arbitrary API source, recipient, calldata, asset or model-chosen amount.
- Initial authority is recorded on-chain by the payer, then a bounded deterministic agent initiates the payment. Gas/API policy is enforced by the local signer; token/recipient/expiry/one-payment restrictions are enforced by the contract. No unlimited ERC20 approval.
- Persist signed transaction bytes/hash/nonce before broadcast. Reconcile before retry; never create a replacement nonce for an uncertain intent. One runtime owner and signer lock protect the journal. Do not run mutation scripts beside a running server.
- Use only Base Sepolia test assets. No mainnet spend, paid services, auto-top-up or third-party messages. Keep keys ignored in 0600 files; never send them to UI, logs or a model. Verify chainId/testOnly/project and address-key binding.
- The merchant reconciliation result uses explicitly sample ledger input. Hash binds the accepted report to the invoice ID. Settlement authenticates prices, not service quality, commercial adoption, stablecoin backing or fiat redemption.

## Verification and design

- Essential oracle checks: fixed signer and canonical exact request; raw signed data unchanged; envelope age120s, both source ages300s, future skew60s. Invalid data cannot move protected payment funds.
- Test real valid response plus edited/stale/different-request/wrong-signer failures against deployed contract, preserve explorer receipts. A fixture/unit test is not a live qualification proof. Historical UI replays must say so; judges can submit fresh responses using the documented script.
- Integer amounts only. Floor USDC USD valuation, ceil USDT units, cap to reserve, show uncovered amount. Reserve is separate from invoice spend and network/data fees. Revert gas is a real test-ETH cost.
- UI English; morning handoff Turkish. Compact invoice desk, copper shortfall data on flat neutral surfaces. Main task available immediately. Use the applicable TasteSkill app-screen workflow if installed; inspect real browser at1440/768/390px. Do not invent balances, transactions, customer names or success states.
- Run `npm test`, `forge test`, production build and browser end-to-end checks for material changes. Keep README, environment example, lockfile, presentation and morning handoff current. Each mandatory track item must be PASS/PENDING/FAIL/BLOCKED with actual evidence. Do not claim complete submission while the video is pending.
- Public repository: `ABerkeBora/heka-quote-bond`. Commits must use verified ABerkeBora identity, configured locally. Inspect the staged tree for secrets before every publication.
