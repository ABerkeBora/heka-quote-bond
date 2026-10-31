# Quote Bond implementation review

Review scope: the Quote Bond contract, oracle client and delegated payer integration in this repository. This is an implementation review for a testnet build, not an independent security audit or production certification. Live evidence and executed test results must be read alongside these notes.

## Trust and authority

- Only API3 is selected. The upstream source is Nodary's USDC/USD and USDT/USD feeds. The fixed expected Airnode is `0xE70f1e8b22a21e4Bb5188918a3033341b281E4c0`.
- The request is `latestFeeds`, parameter `name=USDC/USD,USDT/USD`, with a projection for the two prices and their observation times. The canonical request hash is `0x5e2ded887668087a5a3151af552932c0ab022114f63c38bb7a147390c4fe23ec`.
- An independent off-chain review check recovered that expected signer from `first-response.json` using the stored request hash and unchanged signed data. This is an off-chain check, not the deployed payment evidence.
- The contract's token addresses, signer and request hash are immutable. Each quote fixes payer, beneficiary, amount, USD quote, reserve funder/cap and settlement times. Payment does not accept an arbitrary recipient or arbitrary calldata.
- The payer's on-chain authorization binds the exact quote and amount. The local initial-authorization endpoint is a trusted test harness using isolated test keys; it is not proof of a browser wallet or production custody design.
- The price attestation authenticates the provider response. It does not establish asset backing, service delivery, redemption, price correctness or source independence.

## Static checks observed

| Control | Observed implementation | Practical limit |
|---|---|---|
| Authenticate before acting | `_check` verifies the expected signer against the immutable request before reading prices or changing tokens/state | A malicious or incorrect expected source can still sign incorrect data |
| Two freshness layers | 120-second envelope age; 300-second age for each source; 60-second future tolerance; source must not run more than 60 seconds ahead of the envelope | These policy values must fit actual feed cadence; unavailable/stale data stops payment |
| Exact buyer debit | Quote stores exact USDC amount; authorization requires that amount; final transfer uses pinned payer/beneficiary | An ERC20 allowance remains a separate token permission; UI should grant only the exact amount |
| Reserve isolation | Every quote deposits its own reserve; aggregate reserved amount decreases once at payment/void | Unsupported fee/rebase/malicious tokens are outside the deployed standard test-token model |
| Integer calculation | OpenZeppelin `mulDiv`, upward rounding of required USDT atoms, minimum of requirement and reserve | Caps may leave a disclosed unpaid USD remainder |
| Duplicate protection | Only Active quotes pay; final state is written before external transfers; reentrancy guard wraps payment and reserve flows | Off-chain recovery must still reconcile pending transactions before assigning a new nonce |
| Revert consistency | State changes and transfers share one transaction; a failed transfer reverts all protected token/state changes | A submitted transaction that reverts still consumes gas |
| Deadline fallback | Permissionless void after the fixed hard deadline returns reserve to the original funder; USDC remains in buyer wallet until verified atomic payment | No pre-funded USDC refund is needed in this atomic design; a revoked/expired mandate may require waiting for the reserve deadline |
| Permissionless submission | Any caller can submit valid data; payment destination stays fixed | Submitters can select the first sufficiently fresh snapshot within the allowed window |

## Integration findings sent to the implementation owner

1. Preserve numeric price lexemes from the signed raw JSON. Parsing a numeric price through JavaScript `Number` before fixed-point conversion can lose precision relative to Solidity's parser. Contract arithmetic remains authoritative, but off-chain amount displays/preflight must match it.
2. Before buyer authorization, re-read and compare all immutable on-chain quote terms with the intended mandate. Permissionless quote creation can otherwise expose a quote-ID squatting race. Use an unpredictable quote ID, check the creation receipt and stop on mismatches.
3. Persist a signed transaction's hash/nonce before broadcast, then reconcile receipt and consumed quote state after timeout/restart. An unknown transaction must not trigger an independent second payment nonce.
4. Restrict the local mutation API to loopback, expected origins and a bounded JSON schema. It controls isolated test keys and must not accept arbitrary destinations, contracts, assets or RPC instructions from a web request.
5. Age an unchanged real envelope for the required stale-response test. Editing its timestamp merely invalidates its signature and does not demonstrate freshness enforcement.

Second review observed these resolutions: raw numeric price lexemes are preserved before fixed-point conversion; the initial authorization re-reads and compares all on-chain quote terms; signed raw transactions and their expected hash/nonce are persisted before broadcast; paid on-chain quotes reconcile their saved receipt; cumulative approval, mandate and payment gas accounting includes the Base L1 fee; mutation endpoints enforce loopback host, same origin, JSON and allowed input fields. Tamper checks now require the expected decoded custom error rather than treating every RPC failure as rejection evidence.

The source's 30-minute mandate expiry is exclusive: a new payment is rejected at the expiry second. The normal deadline is informational; grace uses the same freshness checks. The contract's supported-token and policy notes are in `contracts/SECURITY.md`.

Executed offline verification: `npm test` passed **19/19** tests during this review. The tests cover request derivation, exact decimal lexemes, calculation/cap/rounding, real-envelope verification and time boundaries, and mandate recipient/asset/budget/expiry/action guards. They use no wallet keys, RPC calls or transactions. This does not replace the live transaction evidence or the separate contract suite.

Remaining operational edge checks sent to the owner: stale signer-lock recovery must not create a concurrent-signing race, and a fresh payment must recheck expiry immediately before signing after a potentially slow oracle request. Resolution and final executed checks belong in the final evidence and morning handoff; this review is not production certification.

## Reviewer boundary cases for final verification

- Valid permissionless positive top-up, zero top-up, non-$1 USDT, capped payout with explicit uncovered remainder and upward rounding by one token atom.
- Edited data, too-old unchanged envelope, different request, wrong signer, old/future USDC source time and old/future USDT source time.
- Unauthorized payer, amount mismatch, expiry beyond policy, expired/revoked mandate, duplicate payment and attempts to revive a consumed/voided quote.
- Reserve accounting across multiple quotes, failure of a token transfer, permissionless void only after deadline and no second reserve return.
- Agent duplicate intent, wrong recipient/over-budget preflight, transaction timeout/restart recovery, and the distinction between application gas controls and on-chain mandate restrictions.
