# Merchant coverage UI verification

Checked31 October2026,04:38–04:42 Europe/Berlin in a dedicated CUA in-app browser tab at http://127.0.0.1:3104/next. Only read-only navigation/history selection and client-side draft selection were performed by the UI subtask. Root performed the real merchant/payer transaction walkthrough separately.

## Checks run

- Standalone esbuild compilation of CoverageApp, plus production Vite build with the real dynamic /next entry: PASS (27 modules).
- Prettier check: PASS. TasteSkill app source lint:0FAIL,1WARN. The em-dash warning is intentionally accepted for missing values, not prose punctuation.
- Real browser screenshots emitted at1440×900,768×1024 and390×844. No horizontal document overflow. Rendered text sizes were all≥11px; computed body family was Geist.
- Final desktop partial invoice and merchant panel begin at y202.594 and end together at y856.742. Primary action y754.742–794.742. Payment trail starts at y872.742, visible in the900px first view.
- Tablet panels are712px wide at x28 on a768px viewport. Phone panels are358px wide at x16 on390px. Tablet stacks before columns become too narrow.
- Phone Review accepted terms link was clicked. The terms panel moved to y17.773 and the actual primary action was visible at y556.047–600.047. Phone primary height44px.
- History selection was verified for partial paid and strict blocked invoices. Selecting an old quote uses its matching trace, acceptance receipt and payment receipt; polling a newly prepared root invoice did not overwrite that selection.
- The blocked history row renders Paused from lowercase backend coverageState='blocked'. Preparing state offers Resume invoice preparation using the same stored terms, rather than attempting merchant acceptance of an incomplete funding job.
- Pre-authorization duration accurately says up to30minutes, bounded by merchant expiry. Actual accepted/authorized timestamps are shown once recorded.
- Draft choice was opened without preparing/funding a new invoice. It showed proposed/freshness states and an enabled concrete preparation action; no invented approval or payment occurred.

## Actual values inspected

Partial invoice0xb5a664d3224bf1944e07b0677f20c164f32eccbbafa9b717614d204d4bdcfafb:140USD quote,20USD maximum uncovered,120USD merchant minimum. Displayed100.08USDC USD value +24.98reserve USD value +14.94uncovered =140.00. Actual reserve contribution25.000000test-USDT. Payment receipt0x36568d01ff15c8294a3f4ede918eabc9622017b45c99860ca7172e61b0fc0357 and acceptance0x06f03966fdef302348efa1bc2e02a0f7a121ea6537bfc17cfcf95962addfc12d came from the selected quote.

Blocked invoice0xd2d5687ddfb257e9072219d25a108fba036d9f7f17df45b27c444bffcb118580:140USD quote,0USD maximum uncovered,14.94USD recorded gap. UI states Payment paused,0/1payment actions, buyer funds/reserve unchanged and no payment submitted. It explicitly labels the old proof Recorded blocked snapshot / Checked at blocked decision, preserving useful evidence without claiming that an aged response is currently fresh. A fresh estimate for an unpaid draft instead blanks when the envelope/source limits expire.

The new full-covered browser invoice0x97fffba94a8738acbebb2cb0a949307936619550786192da3f3398b5962c4c7e was observed progressing from Preparing/Funded through merchant acceptance into Settled via root's separate interaction. Its accepted0USD limit and actual0USD uncovered were displayed from API state; the UI subtask did not trigger those transactions.

## V1 comparison

The Original desk link was followed to /. V1 loaded its original100USD settled invoice0x62940cbd860e610e886e9c13c536856224d60602ddee8b3f38f27f56baa741a7 with payment0x96c1664cc70eb635783bc8c908511cfda44b7ec9e8131f6fea2d6ebeb2ad6029, original payer0xfd6606…b5Ceef, original merchant0x839278…4a4a46 and its original zero-top-up state. V2 showed separate0x2b376d…4c5CD1 payer and0xe7D2dB…91C1c8 merchant. The shared stylesheet introduced no visible V1 redesign or coverage fields.

## Visual critique and refinement

The preserved product face is copper reserve contribution on the achromatic invoice sheet. Coverage is the small numerical comparison and merchant minimum marker, not a new design theme. The maximum, minimum and actual gap all come from the same integer variables. An initial over-tall comparison duplicated headline figures; it was reduced to a concise decision row and the merchant floor legend moved into the chart scale. This removed a dead strip, aligned both desktop panels and brought the action/trail into the first view.

The biggest figure remains the fixed invoice obligation. A blocked result leads with the actual policy failure; an explicitly accepted partial result is not coloured as a failure merely because a gap exists. Missing data is a dash; actual zeros remain0.00. Chrome remains neutral, with copper on reserve data and restrained actual status colours.

## Supported browser substitution

The standalone TasteSkill inspector uses another browser automation stack, so the session's mandatory CUA route was used instead: real screenshots plus read-only DOM bounds/style inspection. The screenshot API exposes inline JPEG bytes without a documented filesystem destination in this session; screenshots are in the tool record, and no nonexistent local screenshot filenames are claimed. Temporary viewport override was reset and the UI subtask's tab closed after checks. No V1 source, global stylesheet, backend, contract or evidence files were changed by this UI subtask.

## Final void-state source check

A source-only derived-state check covers Void, Voided and coverageState=voided even if a prior blocked decision/agent state remains. All become final unpaid, never paid or blocked. The UI now states reserve returned and buyer USDC not debited, closes payer/acceptance badges, suppresses hypothetical top-ups and new payment/reconcile controls, and offers a fresh invoice. This is a render/state guard check, not claimed live chain refund evidence; no extra transaction was sent.
