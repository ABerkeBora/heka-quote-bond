# Contract policy verification

Command run from this repository:

```sh
forge test -vv
```

Result: **34 passed, 0 failed, 0 skipped**. Full captured output: [forge-tests.txt](forge-tests.txt). No source changes were made between the contract freeze and this evidence capture.

Frozen source SHA256:

- `contracts/QuoteBond.sol`: `f134fe53e319f3c8f4a8eedd2b008c6524693429572283a898e2d26a01dab9b8`
- `contracts/TestToken6.sol`: `4a65e7b9a6726772df7341efbfee5682fc29b41333a05bef974c5e2337620d74`

The suite covers permissionless positive top-up, zero top-up, varying USDT price, reserve cap/uncovered amount, ceil rounding, edited data, stale envelope, different request, wrong signer, each stale feed independently, future envelope/source, missing/zero/negative price, duplicate payment, only-payer authorization, amount budget, 30-minute maximum, exact expiry boundary, revoke, transfer failure rollback, separately backed reserves, failed funding, duplicate quote overwrite, early void rejection, post-deadline reserve return without buyer debit, unchanged grace freshness, final-state reauthorization rejection and preview/payment agreement.

The four tamper unit cases assert protected token balances, aggregate reserve and quote state remain unchanged after rejection. Tests use a deliberately synthetic signer and generated values; they isolate contract policy and monetary invariants. They **do not** prove a live Nodary response, deployed contract, real testnet transaction, agent runtime, or API3 qualification. See the separately captured integration and explorer evidence for those claims.

The compiler completed successfully with Solidity 0.8.28, optimizer enabled, via-IR and Cancun EVM settings from `foundry.toml`. Foundry reports a nightly-build advisory. Its block-timestamp lint notices concern deliberate deadline/freshness checks; the system uses chain time and a disclosed 60-second future skew.
