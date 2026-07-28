export function calculatePosition({ balance = 0, riskPercent = 0, entry = 0, stop = 0, feePercent = 0 } = {}) {
  const account = Math.max(0, Number(balance) || 0);
  const risk = Math.max(0, Number(riskPercent) || 0);
  const entryPrice = Math.max(0, Number(entry) || 0);
  const stopPrice = Math.max(0, Number(stop) || 0);
  const fee = Math.max(0, Number(feePercent) || 0);
  const riskAmount = account * risk / 100;
  const distance = Math.abs(entryPrice - stopPrice);
  const roundTripFeePerUnit = entryPrice * (fee / 100) * 2;
  const effectiveDistance = distance + roundTripFeePerUnit;
  const quantity = effectiveDistance > 0 ? riskAmount / effectiveDistance : 0;
  const positionValue = quantity * entryPrice;
  return {
    riskAmount,
    distance,
    distancePercent: entryPrice ? distance / entryPrice * 100 : 0,
    quantity,
    positionValue,
    estimatedFees: positionValue * (fee / 100) * 2,
    valid: account > 0 && risk > 0 && entryPrice > 0 && stopPrice > 0 && distance > 0,
  };
}
