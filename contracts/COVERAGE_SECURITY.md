# Merchant-accepted coverage policy

`QuoteBondCoverage` is a separate V2 deployment. It does not inherit `QuoteBond` or expose an inherited payment path without coverage checks. The V1 contract source, tests, deployments and receipt files are unchanged. Shared libraries remain the official Airnode verifier/projected JSON parser, OpenZeppelin math/token helpers and the existing test-token implementation.

## Acceptance and its binding

`createQuote` appends two immutable terms to the original quote constructor: `maxUncoveredUSD18` and `merchantAcceptanceExpiry`. The uncovered limit is an integer amount in18-decimal USD; zero means full coverage only. The creation guard requires the limit not to exceed the quote's USD amount, and acceptance expiry must be future, after the settlement start and no later than the hard deadline.

The merchant transaction is `acceptCoverage(bytes32 id, bytes32 expectedPolicyHash)`. Only the quote's pinned beneficiary may call it. The caller supplies the exact hash reviewed; a squatted or changed quote ID cannot silently borrow the acceptance of different terms. Acceptance can happen once, before its exclusive expiry, while the quote is Funded or Active. No admin, buyer or permissionless submitter can update it.

`policyHash(id)` is `keccak256(abi.encode(...))` over this exact ordered list:

1. `block.chainid` (`uint256`), `address(this)` (`address`), quote ID (`bytes32`).
2. USDC token (`address`), USDT token (`address`), expected Airnode (`address`), request hash (`bytes32`).
3. Payer, beneficiary, reserve funder (three `address` values).
4. Quote USD18, exact USDC6 spend, reserved USDT6, max uncovered USD18 (four `uint256` values).
5. Settlement start, normal deadline, hard deadline, merchant acceptance expiry (four `uint64` values).

`createdAt`, buyer mandate expiry, mutable payment state, paid amounts and the acceptance flag are deliberately excluded: merchant economic terms are immutable, while an independently bounded buyer mandate may be revoked/renewed before its allowed expiry. On-chain acceptance is specific to the chain/deployment transaction and this domain-bound hash; no off-chain signature/replay nonce scheme is claimed. A copied state on a chain fork is outside this application's trust guarantee.

The backend must compare every on-chain immutable term against its expected intent before presenting a merchant acceptance transaction. Merely trusting a hash read from a potentially squatted quote is insufficient to show the merchant accepted what the UI proposed.

## Payment guard

The existing payment and preview signatures are retained. Both use the same `_check` implementation:

- Quote must be Active under the buyer's exact mandate.
- Merchant acceptance must exist, and current chain time must be strictly before `merchantAcceptanceExpiry`.
- Buyer mandate must be unexpired and cannot have an expiry beyond the merchant's immutable expiry.
- Original fixed signer/request/raw-byte verification,120-second envelope age,300-second separate source ages and60-second future skew all remain.
- Original integer calculation floors USDC USD value, ceils requested USDT atomic units at its actual signed price, caps USDT to the reserved balance and records the remaining floor-valued USD gap.
- If the computed uncovered USD18 is greater than the merchant's limit, `CoverageInsufficient(actual,limit)` reverts before quote consumption, USDC transfer, USDT payout or reserve return. Equality is accepted. The limit is not rounded to a displayed cent before comparison.

A fully covered quote can settle with limit0. A capped quote can settle only if its remaining gap is within an explicitly accepted positive limit. Rejected valid-price coverage is not a negative market fact and does not consume the quote; a later sufficiently fresh response within both windows may succeed if actual coverage improves. A direct reverted attempt still spends its network gas; protected token/state invariance does not mean free execution.

A buyer revoke/renew operation cannot loosen coverage, change the merchant or revive expired merchant acceptance. Each quote is consumed once before any protected transfer, with SafeERC20 and reentrancy protection. After the fixed hard deadline, an unpaid quote can be voided to return its reserve, while USDC remains with the payer because this design debits it only atomically at valid payment.

## Test scope and inherited limits

The new contract unit suite retains the V1 financial/oracle/expiry/duplicate/void checks against the new implementation and adds absent/wrong-role/wrong-hash/cross-quote/cross-deployment acceptance, chain-domain binding, fixed-policy/revocation behavior, exact expiry, strict full coverage, permitted partial coverage, one-USD-wei boundary rejection, token-atom ceil coverage and preview rejection. Its synthetic signer isolates policy; these tests do not count as real Nodary/testnet evidence. Root integration must separately save new V2 merchant receipts, coverage no-payment, full and partial payouts, tamper cases and unchanged V1 balances.

Both assets remain separately deployed, unbacked test tokens. Token callbacks/rebasing/transfer fees and malicious token implementations are unsupported. The Airnode attestation authenticates a response, not stablecoin backing, fiat redemption, source truth, report acceptance quality or service delivery. Gas budgets/durable transaction reconciliation are local-agent controls. The first sufficiently fresh snapshot submitted within the fixed windows is used; no exact historical-time price is promised. The merchant's accepted uncovered tolerance is a customer preference, not a correction of a claimed V1 vulnerability.
