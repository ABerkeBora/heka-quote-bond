# Merchant coverage screen decisions

V2 keeps Quote Bond's approved achromatic-ledger identity (seed961220014), Geist fonts, neutral invoice sheet and copper reserve contribution. The explicit V1-preservation brief overrides drawing a new direction simply to distinguish versions.

Screen question: can this invoice close within the merchant's accepted USD shortfall limit?

Objects: invoice/job ID, report hash, fixed USD quote18,100test-USDC6,25test-USDT6 reserve, merchant-accepted maxUncoveredUSD18, acceptance expiry/receipt, buyer mandate/expiry, signed snapshot and paid/blocked result. New fields show merchant acceptance before buyer authority. Acceptance is immutable and quote-specific.

The main visual remains the money waterfall. Its additional useful mark is a merchant-floor tick derived from quoteUSD minus maxUncoveredUSD, and the actual shortfall is compared beside that immutable limit. A current browser calculation is labelled an estimate; only backend/contract evidence can claim payment or rejection.

V1 is linked directly at /. V2 uses /next and /api/next only. No V1 source/styles/state/receipt changes are owned by this UI subtask. The shared CSS is imported, with all new rules scoped to .next-app.

The main actions are prepare immutable quote → merchant accept → buyer authorize and automatic agent run. A blocked old invoice remains unchanged and locked; a new example creates a different quote rather than relaxing the old policy. Missing values are dashes; stale preview snapshots do not generate monetary estimates. All money uses BigInt, with Number restricted to bounded chart ratios and timestamps.

A recorded blocked decision uses its saved lastOracle/lastCalculation for historical display, explicitly labelled Recorded blocked snapshot. It is not silently replaced or repriced by a newer global fetch. New unpaid draft estimates still require fresh data.
