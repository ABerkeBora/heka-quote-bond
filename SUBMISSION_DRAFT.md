# Quote Bond

Draft submission copy. Reconcile every implementation statement with `TRACK_REQUIREMENTS.md` and the final evidence before publishing. Contract/network addresses and actual transaction links belong in the README and evidence manifest, not invented placeholders in a submitted entry.

## One line

A bounded agent payer settles one service invoice using authenticated stablecoin prices and a capped reserve for the USD shortfall.

## Problem and target users

An agent platform promises an external service provider a fixed USD invoice amount, while its payment is funded in USDC. If the payment token's market value changes, the token amount alone may leave the provider short. Letting the platform choose its own exchange rate would also let the debtor control the calculation of what it owes.

Quote Bond is for the payer authorizing that one invoice and the external merchant receiving it. It protects a specific settlement, rather than every deposit in a wallet. The business case is a small, explicit reserve attached to an invoice whose payment terms need to survive a bounded change in token value.

## What the product does

The local merchant computes a concrete reconciliation report from an explicitly sample ledger. The initial acceptance submits its SHA-256; the report hash and unique job ID determine the on-chain quote ID before funding. The parties pin the job, merchant, USD quote, USDC payment amount, USDT reserve cap, data recipe and settlement window before exposure. The buyer grants a one-invoice mandate. The delegated payer then obtains a real signed Nodary response for USDC/USD and USDT/USD and initiates the permitted on-chain payment without a new manual approval for each payment step.

The contract checks the signature against a fixed expected Airnode signer and the exact stored request hash. It checks the envelope time and each feed's observation time separately. Only then does it transfer the agreed test-USDC to the merchant and pay the computed shortfall from the separately funded test-USDT reserve. Integer arithmetic rounds the required top-up upward by at most the necessary token atom and never exceeds the reserved amount. A capped result shows the unpaid remainder rather than claiming full protection.

The quote is consumed once. Durable intent records and receipt reconciliation supplement the contract's duplicate protection. Invalid data cannot release protected invoice or reserve funds. A hard-deadline void path returns the unused reserve under the previously fixed terms.

## Why API3 is essential

The merchant relies on the authenticated price inputs to calculate an independent settlement amount. A forged USDC price could understate the invoice shortfall; a forged USDT price could overpay the reserve or leave the merchant short. A fresh signature over an old observation would be unsafe too. Removing authenticated data would break the core payment calculation or force the platform to become the trusted exchange-rate authority.

The integration uses Nodary's existing free `latestFeeds` operation through AirnodeHub, with a fixed projection for both values and both observation times. There is no fabricated x402 charge. Expected signer and request binding are checked on-chain using the official Airnode v2 verifier, before the signed bytes influence a payment.

## Qualification evidence to attach

- Base Sepolia network and deployed Quote Bond contract address.
- A confirmed agent-initiated invoice payment receipt, emitted settlement amounts, and merchant balance changes. Identify reserve funding separately.
- One real timely response that drives the payment.
- Four required rejection cases: an edited value, an unchanged real response that is too old, a real different-request response, and a response signed by a different key.
- A reproducible way for judges to submit their own raw envelopes; distinguish `eth_call` simulation from a mined transaction.
- Duplicate-intent and authorization-limit evidence, plus the public repository's setup and run instructions.
- An actual video of at most 2.5 minutes, following `PRESENTATION.md`.

## What is test-only

Settlement uses purpose-built Base Sepolia ERC20 test tokens with USDC/USDT-style units. They are not backed or redeemable USDC/USDT. Oracle prices are real signed observations, while the invoice and collateral are test terms. A positive top-up can be demonstrated by a clearly disclosed stress quote agreed above the USDC payment's current value. That is not a fabricated depeg or a historical market claim.

## Trust boundaries and limits

An Airnode signature authenticates the selected provider's exact response. It does not independently prove the price is correct, establish stablecoin backing, or guarantee redemption. Both settlement assets can change value. Protection is limited by the allocated reserve and the first sufficiently fresh accepted snapshot in the agreed settlement window; it is not the price at an exact past instant. Permissionless submission preserves the fixed recipient but gives submitters some timing choice within that window.

The mandate's asset, beneficiary, amount, quote and expiry restrictions belong to the contract. Gas limits enforced by the local signing service are application controls, not a network-wide wallet restriction. Local test keys must stay in ignored files and never reach an LLM, browser response or repository.

## Data wanted but not available

The core workflow found the required USDC/USD and USDT/USD prices in Nodary. It does not claim to verify service quality, off-chain invoice acceptance, stablecoin reserves or fiat redemption. Those facts are outside this bounded price-settlement workflow. No arbitrary new trusted API listing is created by an agent.

## Track and submission scope

Selected partner track: API3 only. Public source publication is authorized; competition submission is not performed by this application. The team's final selection must respect the official one-submission-per-team rule.
