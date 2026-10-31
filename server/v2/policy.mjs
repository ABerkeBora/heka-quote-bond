export function coverageDecision(calculation, maxUncoveredUsd18) {
  const uncovered = BigInt(calculation.uncoveredUsd18),
    limit = BigInt(maxUncoveredUsd18);
  if (uncovered < 0n || limit < 0n) throw Error("Negative coverage amount");
  return {
    allowed: uncovered <= limit,
    uncoveredUsd18: uncovered.toString(),
    maxUncoveredUsd18: limit.toString(),
  };
}
export function validateMandate(q, c, d, now = Math.floor(Date.now() / 1000)) {
  if (q.id !== q.mandate.id || c.state !== 2)
    throw Error("Quote is not an active bounded mandate");
  if (
    c.payer.toLowerCase() !== d.payer.toLowerCase() ||
    c.beneficiary.toLowerCase() !== d.merchant.toLowerCase() ||
    c.funder.toLowerCase() !== d.reserveFunder.toLowerCase()
  )
    throw Error("Unapproved V2 party");
  if (!c.merchantAccepted) throw Error("Merchant has not accepted coverage");
  if (
    now >= Number(c.merchantAcceptanceExpiry) ||
    now >= Number(c.mandateExpiry)
  )
    throw Error("Coverage acceptance or payer mandate expired");
  if (
    c.maxUncoveredUSD18 !== BigInt(q.maxUncoveredUsd18) ||
    c.maxUncoveredUSD18 !== BigInt(q.mandate.maxUncoveredUsd18) ||
    q.policyHash !== q.mandate.merchantPolicyHash
  )
    throw Error("Coverage policy changed");
  if (
    q.mandate.network !== 84532 ||
    q.mandate.contract.toLowerCase() !== d.contract.toLowerCase() ||
    q.mandate.usdc.toLowerCase() !== d.usdc.toLowerCase() ||
    q.mandate.usdt.toLowerCase() !== d.usdt.toLowerCase()
  )
    throw Error("Unapproved V2 network or asset");
  if (
    c.escrowAmount !== 100000000n ||
    c.escrowAmount > BigInt(q.mandate.maxUsdc) ||
    c.reservedUsdt > BigInt(q.mandate.maxReserveUsdt) ||
    c.quoteUsd18 !== BigInt(q.quoteUsd18)
  )
    throw Error("Invoice terms exceed mandate");
  if (q.mandate.actionsUsed >= q.mandate.maxActions)
    throw Error("Duplicate intent");
  if (BigInt(q.mandate.gasSpentWei) >= BigInt(q.mandate.maxGasWei))
    throw Error("Gas budget exhausted");
  return true;
}
