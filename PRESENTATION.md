# Quote Bond — 2 minute 30 second presentation

Recording status: **PENDING**. This is a recording outline, not a submitted video. Use the application and the evidence in this repository; only narrate outcomes that the current chain receipt and tests show. Do not speed through a pending transaction as though it had confirmed.

| Time | Show | Say |
|---|---|---|
| 0:00–0:20 | Sample reconciliation report, pinned merchant and initial mandate | “Review the report and authorize its invoice once. An agent can pay a fixed service invoice, but a stablecoin amount is not a fixed dollar value. Quote Bond binds one invoice to a merchant, an exact test-USDC spend and a capped test-USDT reserve before payment.” |
| 0:20–0:40 | USDC/USD and USDT/USD observations, fixed source and fresh signed response | “The payer fetches real Nodary prices through AirnodeHub. The operation is free. The contract checks the expected signer, the exact request, the signature time and both underlying observation times.” |
| 0:40–1:10 | Authorize once, agent progress, confirmed payment, merchant balance change and explorer receipt | “After this initial bounded authorization, the agent initiates the payment. In one transaction, the contract transfers the approved USDC and computes the USDT shortfall. Our positive top-up uses explicitly agreed stress quote terms and real current prices; it is not evidence of a market depeg.” |
| 1:10–1:55 | Four rejection results, raw envelope details and unchanged protected balance/state snapshot | “One edited value fails. An unchanged real response that has aged beyond the window fails. A response to another request fails. A signature from another key fails. Each rejection happens before invoice funds move.” |
| 1:55–2:15 | Re-run the same intent; consumed quote and no second payment | “The agent reconciles the receipt and on-chain quote before retrying. The quote can settle once. Duplicate work cannot charge the buyer or consume the reserve twice.” |
| 2:15–2:30 | Reserve cap, remaining uncovered amount when capped, network and contract evidence | “This is capped protection for one invoice, on Base Sepolia with test tokens. Authentic data is essential to the payment calculation. It does not establish stablecoin backing or guarantee the source is correct.” |

The browser controls replay the original rejection at its recorded block; the linked four transactions were actually mined and reverted. Say this distinction explicitly while recording.

## Recording preparation

1. Start the local application using the README. Keep the network and deployed contract visible in the evidence view.
2. Open a fresh quote without deleting previous chain history. Record the quote identifier, mandate expiry, exact allowance, beneficiary, reserve cap and gas policy.
3. Have an unchanged real signed envelope already older than the contract's accepted envelope age. Changing its timestamp would test the signature, not freshness.
4. Keep one valid payment receipt and the four rejection results accessible. Describe contract simulation as simulation; use a confirmed transaction only when a mined receipt exists.
5. Show the actual amount paid from the same receipt and balance comparison used by the application. An API response or reserve funding transaction is not the invoice payment.
6. Stop the recording at 2:30 or earlier. Do not submit on Devfolio without the user's separate instruction.

## Claims to avoid

- “Guaranteed USD”, “insured deposits”, “USDT is always one dollar”, or “the oracle proves the fact is true”.
- “A paid x402 data call” for the free Nodary operation.
- “Mainnet payment”, “real USDC”, or “real fiat backing” for the deployed test ERC20s.
- “An AI model controls settlement”. Execution checks and the contract determine authorization, prices, arithmetic and destination.
- “Zero cost” for a broadcast transaction that reverted; its gas still costs test ETH.

## Submission reminder

The official general rules checked on 31 October 2026 allow one submission per team and up to three partner tracks. The published deadline is 31 October 2026 at 15:00 Europe/Berlin. The final rule recheck in `TRACK_REQUIREMENTS.md` takes precedence over this preparation note.
