const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

function finite(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }

function timeframeMs(timeframe = '1h') {
  return { '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '12h': 43200000, '1d': 86400000, '1w': 604800000 }[timeframe] || 3600000;
}

function qualityGrade(score) { return score >= 85 ? 'A+' : score >= 75 ? 'A' : score >= 62 ? 'B' : score >= 48 ? 'C' : 'D'; }

export function detectDataQuality(candles = [], { dataSource = 'demo', timeframe = '1h', candleClosed = false } = {}) {
  if (!Array.isArray(candles) || !candles.length) return { score: 0, grade: 'D', gaps: 0, stale: true, source: dataSource, ageMinutes: null, count: 0 };
  const timestamps = candles.map((candle) => Number(candle?.[0])).filter(Number.isFinite);
  const intervals = timestamps.slice(1).map((value, index) => value - timestamps[index]).filter((value) => value > 0);
  const median = intervals.length ? [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)] : timeframeMs(timeframe);
  const expected = timeframeMs(timeframe);
  const gaps = intervals.filter((interval) => interval > Math.max(expected * 1.5, median * 1.5)).length;
  const lastTimestamp = timestamps.at(-1) || 0;
  const timestampMs = lastTimestamp < 100000000000 ? lastTimestamp * 1000 : lastTimestamp;
  const ageMinutes = timestampMs ? Math.max(0, (Date.now() - timestampMs) / 60000) : null;
  const stale = ageMinutes == null || ageMinutes > Math.max(15, expected / 60000 * 1.75);
  const sourceScore = dataSource === 'live' ? 30 : 12;
  const countScore = Math.min(25, Math.round(candles.length / 300 * 25));
  const gapScore = gaps ? Math.max(0, 20 - gaps * 4) : 20;
  const freshnessScore = stale ? 4 : 15;
  const closeScore = candleClosed ? 10 : 6;
  const score = Math.round(clamp(sourceScore + countScore + gapScore + freshnessScore + closeScore));
  return { score, grade: qualityGrade(score), gaps, stale, source: dataSource, ageMinutes: ageMinutes == null ? null : Number(ageMinutes.toFixed(1)), count: candles.length };
}

export function detectMarketRegime(candles, analysis) {
  const price = finite(analysis.price);
  const atrPercent = price ? finite(analysis.atr) / price * 100 : 0;
  const trend = finite(analysis.trendConfidence, 50);
  const directional = analysis.ema20 >= analysis.ema50 ? 'up' : 'down';
  let label = 'range';
  if (trend >= 68 && analysis.adx?.value >= 22) label = directional === 'up' ? 'uptrend' : 'downtrend';
  else if (atrPercent >= 3) label = 'volatile';
  else if (trend <= 42) label = 'range';
  else label = 'transition';
  return { key: label, atrPercent: Number(atrPercent.toFixed(2)), directional };
}

function localExtremes(candles) {
  const recent = candles.slice(-90);
  const highs = recent.map((candle) => finite(candle[2])).filter(Boolean);
  const lows = recent.map((candle) => finite(candle[3])).filter(Boolean);
  return { high: highs.length ? Math.max(...highs) : 0, low: lows.length ? Math.min(...lows) : 0 };
}

export function supportResistance(candles, price) {
  const recent = candles.slice(-90);
  const supports = recent.map((candle) => finite(candle[3])).filter((value) => value > 0 && value <= price).sort((a, b) => b - a);
  const resistances = recent.map((candle) => finite(candle[2])).filter((value) => value > price).sort((a, b) => a - b);
  const extremes = localExtremes(candles);
  const support = supports[0] || extremes.low || price;
  const resistance = resistances[0] || extremes.high || price;
  return { support, resistance, supportDistance: price ? Number(((price - support) / price * 100).toFixed(2)) : 0, resistanceDistance: price ? Number(((resistance - price) / price * 100).toFixed(2)) : 0 };
}

export function qualityScore({ analysis, dataSource = 'demo', market, dataQuality: qualityInfo } = {}) {
  const sourceScore = dataSource === 'live' ? 25 : 10;
  const candleScore = analysis?.candleClosed ? 15 : 7;
  const trendScore = clamp(finite(analysis?.trendConfidence, 50) * .2);
  const momentumScore = clamp(finite(analysis?.momentumConfidence, 50) * .15);
  const volumeScore = clamp(Math.min(finite(analysis?.volumeRatio, 1) / 1.5, 1) * 15);
  const dataScore = clamp(finite(qualityInfo?.score, 0) * .1);
  const score = Math.round(clamp(sourceScore + candleScore + trendScore + momentumScore + volumeScore + dataScore));
  const risk = score >= 75 ? 'low' : score >= 55 ? 'medium' : 'high';
  const volume = finite(market?.quoteVolume);
  const liquidity = volume > 100000000 ? 'high' : volume > 10000000 ? 'medium' : 'unknown';
  return { score, grade: qualityGrade(score), risk, liquidity, components: { source: sourceScore, candle: candleScore, trend: Math.round(trendScore), momentum: Math.round(momentumScore), volume: Math.round(volumeScore), data: Math.round(dataScore) } };
}

export function estimateCosts(analysis, market) {
  const spread = market?.quoteVolume > 10000000 ? 0.04 : 0.12;
  const fee = 0.1;
  const slippage = market?.quoteVolume > 10000000 ? 0.03 : 0.1;
  return { spread, fee, slippage, total: Number((spread + fee + slippage).toFixed(2)) };
}

export function signalCalibration(history = [], exchange, timeframe, symbol) {
  const entries = history.filter((item) => item.exchange === exchange && item.timeframe === timeframe && item.symbol === symbol && item.price > 0).slice(-40);
  let sample = 0; let correct = 0;
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1]; const current = entries[index];
    if (previous.signal === 'buy' || previous.signal === 'sell') { sample += 1; if ((previous.signal === 'buy' && current.price > previous.price) || (previous.signal === 'sell' && current.price < previous.price)) correct += 1; }
  }
  return { sample, accuracy: sample ? Math.round(correct / sample * 100) : null };
}

export function enrichMarketIntelligence({ candles = [], analysis, market, dataSource, timeframe = '1h' } = {}) {
  const dataQuality = detectDataQuality(candles, { dataSource, timeframe, candleClosed: analysis?.candleClosed });
  const regime = detectMarketRegime(candles, analysis);
  const levels = supportResistance(candles, finite(analysis.price));
  const quality = qualityScore({ analysis, dataSource, market, dataQuality });
  const costs = estimateCosts(analysis, market);
  return { regime, levels, quality, dataQuality, costs };
}
