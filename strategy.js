export const STRATEGY_PROFILES = {
  balanced: { indicators: ['ema20', 'ema50', 'rsi', 'macd', 'adx', 'volume'], timeframe: '1h', confirmationTimeframes: ['1h', '4h', '1d'], minScore: 'all', volumeFilter: 'all', alignment: 'all' },
  scalping: { indicators: ['ema20', 'rsi', 'macd', 'volume', 'candle'], timeframe: '5m', confirmationTimeframes: ['5m', '15m', '1h'], minScore: 'strong', volumeFilter: '1.25', alignment: 'all' },
  swing: { indicators: ['ema20', 'ema50', 'ema200', 'rsi', 'macd', 'adx', 'atr', 'volume'], timeframe: '4h', confirmationTimeframes: ['1h', '4h', '1d'], minScore: 'strong', volumeFilter: '1.25', alignment: '2' },
  longterm: { indicators: ['ema50', 'ema200', 'sma200', 'rsi', 'adx', 'bollinger', 'supertrend'], timeframe: '1d', confirmationTimeframes: ['4h', '1d', '1w'], minScore: 'strong', volumeFilter: 'all', alignment: '2' },
};

export function applyStrategyProfile(profileId, state) {
  const profile = STRATEGY_PROFILES[profileId] || STRATEGY_PROFILES.balanced;
  return { strategyProfile: profileId, selectedIndicators: [...profile.indicators], timeframe: profile.timeframe, confirmationTimeframes: [...profile.confirmationTimeframes], strengthFilter: profile.minScore, volumeFilter: profile.volumeFilter, alignmentFilter: profile.alignment };
}

export function tradePlan(analysis = {}) {
  const entry = Number(analysis.price) || 0; const volatility = Number(analysis.atr) || entry * .01; const direction = analysis.signal === 'sell' ? -1 : 1;
  const stopDistance = Math.max(volatility * 1.5, entry * .003); const stop = entry - direction * stopDistance; const takeProfit = entry + direction * stopDistance * 2; return { entry, stop, takeProfit, stopDistance, riskReward: 2, direction };
}
