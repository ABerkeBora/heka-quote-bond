# Contract policy and limits

`QuoteBond` is an unaudited test-token payment contract. Its two tokens must be the deployed, standard, non-rebasing `TestToken6` assets. Fee-on-transfer, callback-bearing, rebasing and malicious token contracts are unsupported. Constructor checks six decimals; reserve deposits and the USDC beneficiary debit/credit path additionally reject non-exact received amounts. There is no mainnet or fiat backing claim.

## Enforced on-chain

- Immutable token contracts, expected signer and request hash. A response never selects these itself.
- Immutable quote ID, payer, beneficiary, funder, USD liability, exact USDC debit, USDT reserve, settlement start and deadlines. Existing IDs cannot be overwritten or reused.
- A separate USDT transfer funds each quote; aggregate reserved accounting tracks each locked reserve. No admin withdrawal path exists.
- Only the quote's payer can authorize it, for the exact USDC amount and at most 30 minutes from authorization. Expiry is exclusive: payment is rejected at `block.timestamp >= mandateExpiry`. The beneficiary is implicit in the quote; payment has no recipient parameter.
- One consumed quote means one payment. Payment closes state before transfers and uses `nonReentrant`; any downstream ERC20 failure reverts all state and protected token movement.
- Verification covers the exact raw bytes, fixed request and expected signer before JSON parsing or token movement. Envelope age is 120 seconds; each source observation age is 300 seconds; future skew is at most 60 seconds. Both feed prices and both observation timestamps must be present and valid. Source time may not lead the signed envelope by more than the same skew.
- USDC USD value floors in 18 decimals. Required USDT rounds up in 6 decimals at the signed USDT price, then caps to the quote reserve. A capped result records the remaining USD shortfall.
- Anyone may submit a valid response, including a third-party keeper. Payment goes only to the approved beneficiary. Unused reserve returns to its original funder after settlement. After hard deadline an unpaid quote can only be voided, returning its reserve; USDC remains in the payer's wallet because this design debits it atomically only on valid payment.

## Off-chain and inherited limits

Gas budgets, API fee budgets, permitted signer tools and durable transaction reconciliation are agent-side controls. They are not a general on-chain wallet spending policy. ERC20 approval is separate from quote authorization and should be exact. The test-token minter is its immutable deployer.

`normalDeadline` marks the start of a disclosed grace period. The same freshness rules apply throughout; `hardDeadline` closes new payment. Mandate expiry may close the delegated debit earlier. A payer can explicitly revoke or renew an active mandate; a settled, capped or voided quote cannot be revived.

The first valid sufficiently fresh snapshot submitted within the window wins. Any submitter can influence submission timing, and a fresh signed value may differ from one at an exact deadline. The system authenticates the Nodary signer and response integrity, not the truth of the upstream price, reserve-asset solvency, redemption, or service delivery quality. It does not insure arbitrary balances or promise full USD cover beyond its explicit reserve cap.

The Foundry unit suite uses a synthetic signer deliberately to isolate monetary and authorization policy. It is not live Nodary qualification evidence; the integration scripts and saved Base Sepolia receipts provide that separately.
