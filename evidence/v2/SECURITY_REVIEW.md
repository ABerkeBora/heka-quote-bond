# Quote Bond V2 independent implementation review

Scope: merchant-accepted coverage extension in this repository only. This is an implementation review and reproducible policy testing, not an audit or a claim of production custody/insurance safety. V1's existing capped payout is intentional behavior; V2 adds a merchant preference rather than reclassifying that behavior as a vulnerability.

## Contract observations

Reviewed `contracts/QuoteBondCoverage.sol` after its initial implementation and compared the payment order with V1. The new contract is standalone and exposes no inherited V1 payment method that bypasses coverage.

- Quote financial terms, payer/beneficiary/funder, source and both token addresses are immutable. The one extra economic field is integer `maxUncoveredUSD18`; zero requires full coverage. Creation also fixes a merchant acceptance expiry no later than the quote hard deadline.
- `acceptCoverage(id,expectedPolicyHash)` is callable only by the pinned merchant and at most once. Its reviewed hash covers chain/deployment/ID, both tokens, expected signer/request, all parties, USD quote/exact spend/reserve, uncovered limit and all immutable settlement/acceptance times. A different quote/deployment/hash cannot borrow acceptance. Buyer mandate expiry is intentionally separate but cannot exceed merchant expiry.
- Both preview and payment check merchant acceptance and its exclusive expiry, the active unexpired payer mandate, original oracle signer/request/freshness rules, and exact integer coverage. The uncovered limit comparison happens before quote consumption or any protected token transfer. Equality is accepted; it is not rounded to displayed cents.
- Buyer revocation/reauthorization cannot change the accepted merchant policy or revive expired merchant acceptance. Final quotes cannot be revived. Reentrancy and downstream transfer failures retain the original atomic semantics.

No obvious high-severity acceptance/coverage bypass was found in this static review. The contract owner additionally reports54 new contract tests plus34 original tests passing; the final root delivery must retain the actual command output and independently reconcile live evidence.

## Independent offline checks

`test/v2-policy.test.mjs` was added and executed without keys, RPC or transaction submission. Its17 tests pass:

- V1 protected evidence/verifier/contract hashes match the frozen inventory.
- V1 payer engine, source/service code, original contract tests and screen/CSS match hashes read from immutable tag `v1-baseline` at974ae378; only the shared HTTP/entrypoint is allowed to add routing.
- Full-coverage zero limit, explicit partial limit, inclusive equality and one-USD18-atom rejection.
- Actual non-one-dollar USDT rate, capped residual, and integers beyond JavaScript Number precision.
- No mutation of the calculation by the coverage decision; negative/non-integer amounts fail closed.
- Missing merchant acceptance, a different mandate ID, final/funded/nonexistent state, either exclusive expiry boundary.
- Modified local/on-chain limit or reviewed hash, wrong party/network/deployment/token, expanded spend/reserve/USD terms, duplicate action and exhausted gas budget.

At the first complete Node run,24 original tests plus16 then-present V2 tests passed40/40. The additional frozen-engine guard was then added and its targeted V2 suite passed17/17. Root's final all-suite run should report41 tests if no further tests are added.

## Namespace and execution observations

The V2 store reads/writes `.local/v2/` and `evidence/v2/`. Its chain module has independent wallet schema/project marker, journal and signer lock. Sharing the existing read-only network client, artifact loader, receipt normalizer, oracle math, service and CSS is appropriate and does not grant V2 use of V1 collateral. The one-time gas funding script now acquires the V1 runtime and signer locks, rejects an unreconciled original deployer intent and checks a separate setup gas/L1 budget before broadcasting. It writes its own V2 funding journal. Native test-ETH allocation is recorded separately from unchanged V1 protected token/reserve balances.

Findings sent to root during implementation:

1. Retain all-term on-chain reread before merchant acceptance; merely trusting a returned policy hash could accept a squatted quote different from the proposed intent.
2. Acquire both runtime namespaces in the shared server so a V2 CLI cannot race the live V2 state writer.
3. Point V2 signer-lock recovery text to the V2 recovery command, not V1's command.
4. Reconcile an already signed/mined payment before expiry or coverage checks that decide a new signature. A restart must not rebuild calldata from a newer oracle snapshot or skip recovery of receipt/result/gas.
5. The initial merchantAccept early return had the same crash-after-mining gap: chain acceptance could be true while its saved transaction lacked a receipt. Root was asked to reconcile that exact saved acceptance before returning (and recover the event if an external merchant accepted). This is a setup receipt/recovery defect, not an on-chain double-payment bypass.
6. Initialize the global trace to the selected quote before the first step when switching invoices, so a reset to idle does not mask a running operation.

## Resolution and recorded live-evidence reconciliation

The final formatted backend was re-read after fixes. Merchant acceptance now reconciles the exact saved acceptance transaction before its accepted-state return, even after expiry; an externally submitted acceptance can be recovered from its event. Payment recovery similarly uses the persisted proof/calldata before any new coverage or expiry decision. The shared host acquires both runtime locks, and the agent selects its per-quote trace before running. The UI owner confirmed the interrupted Preparing flow now resumes preparation and blocked history casing is normalized; these UI fixes require the final browser check, not just this source review.

A separate read-only Node verification of saved `evidence/v2/` records was run without keys, RPC or transaction submission:

- Deployment, USDC, USDT, payer, merchant and reserve funder all differ from V1.
- All four saved merchant acceptance policy hashes were independently recomputed with the documented ordered ABI types. Each successful receipt decodes to the expected `CoverageAccepted` merchant, quote ID and policy hash.
- `full-payment.json`: real saved Nodary response independently recovers the fixed signer/request; integer recomputation matches9.929256 test-USDT, zero uncovered and limit0. Receipt success and buyer/merchant/reserve deltas agree.
- `partial-payment.json`: real saved Nodary response and integer recomputation match25.000000 test-USDT,14.94330398188768USD uncovered, within the expressly accepted20USD limit. Receipt and balance deltas agree.
- `agent-coverage-block.json`: valid saved Nodary proof, false coverage decision under limit0, no new signed transaction or broadcast, unchanged protected balances and active state2.
- The six negative records (coverage, unaccepted, edited, stale, wrong-request, wrong-signer) contain the specifically expected decoded errors, reverted receipts and identical protected quote/token snapshots. Coverage reverts with `CoverageInsufficient`; stale is the unchanged original V2 envelope and rejects as `ResponseTooOld`. The different-request envelope independently recovers Nodary's actual signer for its own request, while the target contract binds another request.
- `acceptance-binding.json` correctly labels wrong-role/wrong-policy/other-quote checks as deployed `eth_call` without broadcast; these are not misrepresented as new mined transactions.
- `process-restart.json` records a new Node process recovering both merchant and payment receipts with unchanged journal count and no new transaction.
- `v1-regression.json` has identical protected token/reserve snapshots, distinct V2 roles/assets/contracts and an explicitly read-only historical replay of the original valid V1 payment. V1 source/evidence hash assertions pass.

This verifies consistency and signatures of the recorded evidence, not an independent RPC confirmation of every mined receipt. Root owns the final receipt/network/bytecode/browser recheck and submission checklist. Protected token invariance excludes test ETH gas spent by direct reverted calls and the disclosed initial native gas allocation.

The local merchant is a separate test role under one trusted local harness, not proof of an independent commercial provider. The attestation authenticates Nodary's exact response, not stablecoin backing, fiat redemption, source truth or report quality. A blocked quote is not consumed and may become payable on a later sufficiently fresh snapshot if coverage improves within both fixed windows; no promise of permanent rejection is made. No automatic top-up or new mainnet/paid-service authority is introduced.
