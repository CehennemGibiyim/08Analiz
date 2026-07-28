const normalize = (value) => String(value || '').replace(/[-_/:]/g, '').toUpperCase();

export const DEFAULT_PRESETS = [
  { id: 'trend', nameKey: 'enhancements.presetTrend', profile: 'swing', indicators: ['ema20', 'ema50', 'ema200', 'macd', 'adx', 'volume', 'atr'], timeframes: ['4h', '1d'] },
  { id: 'scalp', nameKey: 'enhancements.presetScalp', profile: 'scalping', indicators: ['ema20', 'rsi', 'macd', 'bollinger', 'stochastic', 'volume'], timeframes: ['5m', '15m', '1h'] },
  { id: 'swing', nameKey: 'enhancements.presetSwing', profile: 'swing', indicators: ['ema50', 'ema200', 'rsi', 'macd', 'supertrend', 'volume', 'atr'], timeframes: ['1h', '4h', '1d'] },
  { id: 'low-risk', nameKey: 'enhancements.presetLowRisk', profile: 'longterm', indicators: ['ema50', 'ema200', 'sma200', 'adx', 'vwap', 'volume', 'atr'], timeframes: ['4h', '1d', '1w'] },
];

export function marketOverview(markets = []) {
  const rows = markets.map(({ market, analysis, dataSource }) => ({ market, analysis, dataSource }));
  const total = rows.length || 1;
  const buy = rows.filter((row) => row.analysis.signal === 'buy').length;
  const sell = rows.filter((row) => row.analysis.signal === 'sell').length;
  const live = rows.filter((row) => row.dataSource === 'live').length;
  const quality = rows.reduce((sum, row) => sum + Number(row.analysis.intelligence?.quality?.score || 0), 0) / total;
  return { rows, buy, sell, wait: rows.length - buy - sell, live, total: rows.length, breadth: Math.round((buy - sell) / total * 100), quality: Math.round(quality) };
}

export function signalOutcomeStats(history = [], horizon = '') {
  const samples = [];
  history.forEach((entry) => {
    if (!['buy', 'sell'].includes(entry.signal) || !Number(entry.price)) return;
    const outcome = horizon ? entry.outcomes?.[horizon] : Object.values(entry.outcomes || {}).find(Boolean);
    if (outcome) samples.push({ ...entry, ...outcome, signed: Number(outcome.signed) || 0, win: Boolean(outcome.win) });
  });
  if (!samples.length && !horizon) {
    const ordered = [...history].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    ordered.forEach((entry, index) => {
      if (!['buy', 'sell'].includes(entry.signal) || !Number(entry.price)) return;
      const next = ordered.slice(index + 1).find((candidate) => candidate.exchange === entry.exchange && candidate.timeframe === entry.timeframe && normalize(candidate.symbol) === normalize(entry.symbol) && Number(candidate.price) > 0);
      if (!next) return;
      const move = (Number(next.price) - Number(entry.price)) / Number(entry.price) * 100;
      const signed = entry.signal === 'sell' ? -move : move;
      samples.push({ ...entry, move, signed, win: signed > 0 });
    });
  }
  const wins = samples.filter((item) => item.win).length;
  return { sample: samples.length, wins, losses: samples.length - wins, accuracy: samples.length ? Math.round(wins / samples.length * 100) : null, averageMove: samples.length ? samples.reduce((sum, item) => sum + item.signed, 0) / samples.length : 0, buys: samples.filter((item) => item.signal === 'buy').length, sells: samples.filter((item) => item.signal === 'sell').length };
}

export function portfolioRisk(positions = [], prices = {}, balance = 0) {
  const rows = positions.map((position) => {
    const entry = Number(position.entry) || 0; const quantity = Number(position.quantity) || 0; const stop = Number(position.stop) || 0;
    const risk = stop > 0 ? Math.abs(entry - stop) * quantity : 0;
    const price = Number(prices[position.symbol]) || entry;
    const pnl = (price - entry) * quantity * (position.side === 'short' ? -1 : 1);
    return { ...position, risk, pnl, exposure: Math.abs(entry * quantity) };
  });
  const riskTotal = rows.reduce((sum, row) => sum + row.risk, 0);
  const exposure = rows.reduce((sum, row) => sum + row.exposure, 0);
  return { rows, risk: riskTotal, exposure, pnl: rows.reduce((sum, row) => sum + row.pnl, 0), riskPercent: balance ? riskTotal / balance * 100 : 0 };
}

export function freshness(updatedAt, streamStatus) {
  const age = updatedAt ? Math.max(0, Date.now() - Number(updatedAt)) : Infinity;
  return { ageMs: age, stale: age > 120000 && streamStatus !== 'connected', label: age === Infinity ? 'unknown' : age > 120000 ? 'stale' : 'current' };
}
