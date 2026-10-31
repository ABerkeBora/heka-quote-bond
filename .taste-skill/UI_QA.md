# Quote Bond UI verification

Checked 2026-10-31 03:47–03:52 Europe/Berlin using a dedicated CUA in-app browser tab at http://127.0.0.1:3104. No other project's tab or process was used.

## Checks run

- Production Vite build passed after final UI changes.
- TasteSkill app source lint: 0 FAIL. The three warnings are deliberate: Geist Mono is restricted to literal IDs/code, and em dashes represent missing values.
- Real browser screenshots emitted at 1440×900, 768×1024 and 390×844 for live Settled and Capped invoices. No horizontal document overflow at any width; every rendered text size was at least 11px.
- Desktop columns end at the same y=815.695px after refinement. The invoice and payer mandate both begin at y=201.891px. The payment trail heading and progress figure are visible in the first 900px.
- Tablet columns stack before the mandate would narrow below 340px. The invoice width at 768px was 712px.
- Phone invoice width at 390px was 358px. The first-screen Review payer limits link was clicked and moved directly to the full limit/action panel. Phone primary and tamper controls are at least 44px high.
- Local Geist fonts rendered (computed family Geist). Font license files are in web/assets.
- The proof disclosure opened; Edited value replay returned NotSignedByAirnode at recorded block 52464214, explicitly labeled historical deployed-contract eth_call; no new transaction. Loading/disabled feedback and the rejected result rendered correctly.
- Confirmed the active invoice payment receipt and its payment trail reference the same transaction after the backend's per-quote trace fix. Pending steps are confirmed in the finished trace.
- The report download link and accepted report hash come from the actual quote result. Old receipt-only invoices are not retroactively described as purchased reports.

## Data seen

Positive report quote: 0x52b8ceaedb409a7bf298878032632a875e677fe192fd3c4a2e2536932b6c6e6e, payment 0xcc488ac491a2c9e371a2b370c0433baa0229373bd9dad831e2e28b257b17111d. Displayed $100.09 USDC value + $9.91 USDT value = $110.00 quote, top-up 9.916874 test-USDT.

Capped report quote: 0x7f3c080bc968ec5aca9df5d9a0a2ff17ff321702c8b5b0be4ca324f39f87f4f8, payment 0xf2067aea97fe5e83b384668192f9a90e6308851d493399a8ba836c01b14a15df. Displayed $100.09 + $24.98 + $14.93 uncovered = $140.00. The entire 25.000000 test-USDT reserve was used; the main finding and reserve copy state the remaining gap.

These are API/chain-derived values, not frontend fixtures. Report input is explicitly the sample ledger (5 rows, 4 invoices, 1 duplicate), supplied by the backend service.

## Critique and decisions

1. The biggest figure is the fixed invoice debt; its composition is the largest visual block. Capped invoices lead with the exact uncovered amount in the title's finding.
2. Both columns and all subsequent blocks share the canvas edges. The real next action is pinned to the mandate footer, making the desktop columns align without a decorative blank panel.
3. Copper belongs to the reserve contribution and small product mark. Status colors are limited to actual rejection/coverage facts; chrome stays neutral.
4. Every displayed monetary figure uses BigInt-based formatting. The chart's Number conversion is a bounded percentage only. Repeated quote/debt/receipt fields come from one active quote.
5. Real zero remains 0.00; missing or stale preview rates are dashes. A stale draft snapshot cannot generate a displayed waterfall calculation. Completed payments keep their historical snapshot.
6. Legend swatches and actual bar segments use the same CSS colors. Both $0 and the USD target label the bar scale. No unrelated charts or implied market history are present.
7. On phone, the first-screen link reaches the mandate immediately, all content remains readable, and page width stays fixed.

## Browser inspection substitution and artifact limit

The standalone TasteSkill inspector would launch another browser automation stack, which conflicts with this session's CUA-only browser instruction. Supported CUA screenshots and read-only DOM bounds/style inspection were used instead. The screenshot API provides inline JPEG bytes and has no documented filesystem destination/export method in this session. Screenshots were emitted in the UI agent's tool record; no local image filenames are claimed. Root can capture/export an image separately if a file is required for the presentation.

Temporary viewport override reset after verification. Root owns the separate full payment end-to-end browser walkthrough; this UI subtask only performed a read-only historical rejection replay and layout actions.

A final documented clipboard-to-Preview export attempt was made. The tab clipboard accepted JPEG bytes, but Preview's New from Clipboard command remained disabled, so the browser clipboard did not reach the native pasteboard. The menu was dismissed and the existing Preview document was left unchanged. No screenshot file was written; evidence/screenshots is empty. This does not change the successful visual QA above.
