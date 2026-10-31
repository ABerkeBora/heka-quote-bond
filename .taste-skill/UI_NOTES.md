# Quote Bond screen decisions

- Style: achromatic-ledger, seed 961220014. Brand copper replaces the sheet's blue on the actual reserve contribution only.
- Screen question: can this one invoice be paid under its approved limits, and what fills the USD shortfall?
- The product face is the copper shortfall section of the payment waterfall; the signature element is USDC value joined to USDT reserve against one fixed USD quote.
- No sidebar: there is one operational destination. The app uses the documented no-sidebar shell to preserve the invoice and mandate columns.
- Object inventory: one invoice/job ID, pinned merchant and payer addresses, USD debt18, USDC atomic spend6, USDT reserve6 and topup6, one mandate ID, exact caps, expiry, local gas guard, source and envelope timestamps, receipt and action trace.
- Draft terms are proposed, not funded balances. Rates, quotes, steps and all payment success states come from /api/state. No fixture records are in the frontend.
- Desktop grid: 1160px = 786px invoice + 24px gutter + 350px mandate; smaller widths adjust the invoice. Below 740px sections stack; Review payer limits reaches the initial action from the first screen.
- Numbers use integer BigInt input. Number is used only for bounded chart percentages and time formatting. Missing data uses an em dash; zero remains zero.
- Source lint: 0 FAIL; accepted warnings are Geist Mono for literal IDs and raw response code, and repeated em dashes representing missing fields. All body text is at least 11px.
- Fonts: Geist and Geist Mono loaded locally, SIL Open Font licenses in web/assets.
- Browser QA completed through CUA at1440/768/390px; see UI_QA.md. The standalone inspector was replaced under the session browser-use rule.
