export const BUY_TIMING_MINUTE = 6;
// Canlı teknik sinyali görünür tutuyoruz. UTC 06 dakikası artık bilgi/teyit olarak gösterilir;
// günün diğer dakikalarında gerçek Al sinyalini Bekle'ye dönüştürmez.
export const ENFORCE_BUY_TIMING = false;

export function buyTimingState(timestamp = Date.now()) {
  const date = new Date(Number(timestamp) || Date.now());
  const minute = date.getUTCMinutes();
  return {
    minute,
    targetMinute: BUY_TIMING_MINUTE,
    eligible: minute === BUY_TIMING_MINUTE,
    timezone: 'UTC',
  };
}

export function applyBuyTimingFilter(analysis = {}, timestamp = Date.now()) {
  const timing = buyTimingState(timestamp);
  const technicalSignal = analysis.signal || 'wait';
  const timingBlocked = ENFORCE_BUY_TIMING && technicalSignal === 'buy' && !timing.eligible;
  return {
    ...analysis,
    signal: timingBlocked ? 'wait' : technicalSignal,
    technicalSignal,
    timingBlocked,
    timingMinute: timing.minute,
    buyTimingMinute: timing.targetMinute,
    buyTimingEligible: timing.eligible,
    timingTimezone: timing.timezone,
    timingEnforced: ENFORCE_BUY_TIMING,
  };
}
