const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));

export const QUALITY_RANK = Object.freeze({ 'A+': 5, A: 4, B: 3, C: 2, D: 1 });

export function qualityGrade(item = {}) {
  return item.analysis?.intelligence?.quality?.grade || 'D';
}

export function dataQuality(item = {}) {
  const quality = item.analysis?.intelligence?.dataQuality;
  return quality || { score: 0, grade: 'D', gaps: 0, stale: true, source: item.dataSource || 'demo' };
}

export function hasConfirmationConflict(confirmation = {}) {
  const signals = Object.values(confirmation.analyses || {}).map((analysis) => analysis?.signal).filter((signal) => signal === 'buy' || signal === 'sell');
  return signals.includes('buy') && signals.includes('sell');
}

export function confirmationSummary(confirmation = {}) {
  const entries = Object.values(confirmation.analyses || {});
  const buy = entries.filter((analysis) => analysis?.signal === 'buy').length;
  const sell = entries.filter((analysis) => analysis?.signal === 'sell').length;
  const wait = entries.filter((analysis) => analysis?.signal === 'wait').length;
  return { buy, sell, wait, total: entries.length, conflict: buy > 0 && sell > 0, aligned: Math.max(buy, sell) };
}

export function qualityMatches(item, state = {}) {
  const selected = state.qualityFilter || 'all';
  const minimumRank = selected === 'aplus' ? QUALITY_RANK['A+'] : selected === 'a' ? QUALITY_RANK.A : selected === 'b' ? QUALITY_RANK.B : 0;
  const gradeMatch = (QUALITY_RANK[qualityGrade(item)] || 1) >= minimumRank;
  const candleMatch = !state.confirmedOnly || Boolean(item.analysis?.candleClosed);
  const quality = dataQuality(item);
  const dataMatch = !state.liveQualityOnly || (quality.source === 'live' && !quality.stale && quality.score >= 60);
  return gradeMatch && candleMatch && dataMatch;
}

export function calibratedConfidence(technical, outcome = {}) {
  const value = Number(technical) || 0;
  return outcome.sample >= 3 ? clamp(value * .55 + Number(outcome.accuracy || 0) * .45) : clamp(value);
}
