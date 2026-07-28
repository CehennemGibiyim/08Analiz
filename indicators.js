function closes(candles) { return candles.map((candle) => Number(candle[4])); }
function highs(candles) { return candles.map((candle) => Number(candle[2])); }
function lows(candles) { return candles.map((candle) => Number(candle[3])); }
function finiteValues(values) { return values.map(Number).filter(Number.isFinite); }

export const INDICATOR_DEFINITIONS = [
  { id: 'ema20', labelKey: 'indicator.ema20' },
  { id: 'ema50', labelKey: 'indicator.ema50' },
  { id: 'ema200', labelKey: 'indicator.ema200' },
  { id: 'sma200', labelKey: 'indicator.sma200' },
  { id: 'rsi', labelKey: 'indicator.rsi14' },
  { id: 'macd', labelKey: 'indicator.macd' },
  { id: 'bollinger', labelKey: 'indicator.bollinger' },
  { id: 'stochastic', labelKey: 'indicator.stochastic' },
  { id: 'adx', labelKey: 'indicator.adx' },
  { id: 'vwap', labelKey: 'indicator.vwap' },
  { id: 'supertrend', labelKey: 'indicator.supertrend' },
  { id: 'volume', labelKey: 'indicator.volumeRatio' },
  { id: 'atr', labelKey: 'indicator.atr14' },
  { id: 'candle', labelKey: 'indicator.candleTrend' },
];

export const INDICATOR_IDS = INDICATOR_DEFINITIONS.map((indicator) => indicator.id);
export const INDICATOR_WEIGHTS = { ema20: 1.2, ema50: 1.3, ema200: 1.5, sma200: 1.5, rsi: 1, macd: 1.3, bollinger: .9, stochastic: .8, adx: 1.2, vwap: 1, supertrend: 1.3, volume: .8, atr: .5, candle: .5 };

export function sma(values, period) {
  const clean = finiteValues(values); if (!clean.length) return 0;
  const slice = clean.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

export function ema(values, period) {
  const clean = finiteValues(values); if (!clean.length) return 0;
  const multiplier = 2 / (period + 1);
  let value = sma(clean.slice(0, period), Math.min(period, clean.length));
  for (let index = period; index < clean.length; index += 1) value = (clean[index] - value) * multiplier + value;
  return value;
}

export function rsi(values, period = 14) {
  const clean = finiteValues(values); if (clean.length <= period) return 50;
  let gains = 0; let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = clean[index] - clean[index - 1];
    if (change >= 0) gains += change; else losses -= change;
  }
  let averageGain = gains / period; let averageLoss = losses / period;
  for (let index = period + 1; index < clean.length; index += 1) {
    const change = clean[index] - clean[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

export function macd(values) {
  const clean = finiteValues(values); const line = ema(clean, 12) - ema(clean, 26);
  const history = [];
  for (let index = 26; index <= clean.length; index += 1) history.push(ema(clean.slice(0, index), 12) - ema(clean.slice(0, index), 26));
  const signal = ema(history, 9);
  return { line, signal, histogram: line - signal };
}

export function atr(candles, period = 14) {
  if (candles.length < 2) return 0;
  const ranges = [];
  for (let index = 1; index < candles.length; index += 1) {
    const high = Number(candles[index][2]); const low = Number(candles[index][3]); const previousClose = Number(candles[index - 1][4]);
    ranges.push(Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
  }
  return sma(ranges, period);
}

export function bollinger(values, period = 20, multiplier = 2) {
  const clean = finiteValues(values); const middle = sma(clean, period); const slice = clean.slice(-period);
  const variance = slice.reduce((sum, value) => sum + ((value - middle) ** 2), 0) / Math.max(slice.length, 1);
  const deviation = Math.sqrt(variance);
  return { middle, upper: middle + deviation * multiplier, lower: middle - deviation * multiplier, bandwidth: middle ? (deviation * multiplier * 2) / middle * 100 : 0 };
}

export function stochasticRsi(values, period = 14) {
  const clean = finiteValues(values); const currentRsi = rsi(clean, period); const rsis = [];
  for (let index = Math.max(period, clean.length - period * 2); index <= clean.length; index += 1) rsis.push(rsi(clean.slice(0, index), period));
  if (!rsis.length) return 50;
  const min = Math.min(...rsis); const max = Math.max(...rsis);
  return max === min ? 50 : ((currentRsi - min) / (max - min)) * 100;
}

export function adx(candles, period = 14) {
  if (candles.length < period + 2) return { value: 0, plus: 0, minus: 0 };
  const plusMoves = []; const minusMoves = []; const ranges = [];
  for (let index = 1; index < candles.length; index += 1) {
    const high = Number(candles[index][2]); const low = Number(candles[index][3]);
    const prevHigh = Number(candles[index - 1][2]); const prevLow = Number(candles[index - 1][3]); const prevClose = Number(candles[index - 1][4]);
    plusMoves.push(high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0);
    minusMoves.push(prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0);
    ranges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const dxValues = []; let plus = 0; let minus = 0;
  for (let index = 0; index < ranges.length; index += 1) {
    const tr = sma(ranges.slice(0, index + 1), period) || 1;
    plus = (sma(plusMoves.slice(0, index + 1), period) / tr) * 100;
    minus = (sma(minusMoves.slice(0, index + 1), period) / tr) * 100;
    dxValues.push((Math.abs(plus - minus) / Math.max(plus + minus, 1)) * 100);
  }
  return { value: sma(dxValues, period), plus, minus };
}

export function vwap(candles) {
  let volume = 0; let total = 0;
  candles.slice(-50).forEach((candle) => { const typical = (Number(candle[2]) + Number(candle[3]) + Number(candle[4])) / 3; const amount = Number(candle[5]) || 0; total += typical * amount; volume += amount; });
  return volume ? total / volume : Number(candles.at(-1)?.[4] || 0);
}

export function supertrend(candles, period = 10, factor = 3) {
  if (!candles.length) return { value: 0, direction: 'up' };
  let finalUpper = Infinity; let finalLower = -Infinity; let direction = 'up'; let value = Number(candles[0][4]) || 0;
  candles.forEach((candle, index) => {
    const high = Number(candle[2]); const low = Number(candle[3]); const close = Number(candle[4]);
    const averageTrueRange = atr(candles.slice(0, index + 1), period); const midpoint = (high + low) / 2;
    const basicUpper = midpoint + factor * averageTrueRange; const basicLower = midpoint - factor * averageTrueRange;
    if (index === 0) { finalUpper = basicUpper; finalLower = basicLower; value = finalLower; return; }
    const previousClose = Number(candles[index - 1][4]);
    finalUpper = basicUpper < finalUpper || previousClose > finalUpper ? basicUpper : finalUpper;
    finalLower = basicLower > finalLower || previousClose < finalLower ? basicLower : finalLower;
    if (direction === 'down' && close > finalUpper) direction = 'up';
    else if (direction === 'up' && close < finalLower) direction = 'down';
    value = direction === 'up' ? finalLower : finalUpper;
  });
  return { value, direction };
}

function timeframeMilliseconds(timeframe = '1h') { const values = { '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '12h': 43200000, '1d': 86400000, '1w': 604800000 }; return values[timeframe] || values['1h']; }

export function analyzeCandles(candles, selectedIndicators = INDICATOR_IDS, timeframe = '1h') {
  const values = closes(candles); const current = values.at(-1) || 0; const previous = values.at(-2) || current;
  const ema20 = ema(values, 20); const ema50 = ema(values, 50); const ema200 = ema(values, 200); const sma200 = sma(values, 200);
  const rsi14 = rsi(values, 14); const macdValue = macd(values); const bollingerValue = bollinger(values); const atrValue = atr(candles);
  const adxValue = adx(candles); const vwapValue = vwap(candles); const stochastic = stochasticRsi(values); const supertrendValue = supertrend(candles);
  const averageVolume = sma(candles.slice(-21, -1).map((candle) => Number(candle[5])), 20); const currentVolume = Number(candles.at(-1)?.[5] || 0);
  const volumeRatio = averageVolume ? currentVolume / averageVolume : 1; const change = previous ? ((current - previous) / previous) * 100 : 0;
  const active = INDICATOR_IDS.filter((id) => selectedIndicators.includes(id));
  const scores = {
    ema20: current > ema20 ? 1 : -1,
    ema50: current > ema50 ? 1 : -1,
    ema200: current > ema200 ? 1 : -1,
    sma200: current > sma200 ? 1 : -1,
    rsi: rsi14 >= 55 && rsi14 < 75 ? 1 : rsi14 <= 45 && rsi14 > 25 ? -1 : 0,
    macd: macdValue.histogram > 0 ? 1 : -1,
    bollinger: current > bollingerValue.middle ? 1 : -1,
    stochastic: stochastic <= 20 ? 1 : stochastic >= 80 ? -1 : 0,
    adx: adxValue.value >= 20 ? (adxValue.plus >= adxValue.minus ? 1 : -1) : 0,
    vwap: current > vwapValue ? 1 : -1,
    supertrend: supertrendValue.direction === 'up' ? 1 : -1,
    volume: volumeRatio > 1.25 ? (change >= 0 ? 1 : -1) : 0,
    atr: current && atrValue / current >= 0.005 ? (change >= 0 ? 1 : -1) : 0,
    candle: change >= 0 ? 1 : -1,
  };
  const score = active.reduce((sum, id) => sum + scores[id] * (INDICATOR_WEIGHTS[id] || 1), 0);
  const indicatorScores = active.reduce((result, id) => { result[id] = scores[id]; return result; }, {});
  const maxScore = active.reduce((sum, id) => sum + (INDICATOR_WEIGHTS[id] || 1), 0);
  const buyRatio = maxScore ? Math.round(((score + maxScore) / (2 * maxScore)) * 100) : 50;
  const sellRatio = 100 - buyRatio;
  const threshold = Math.max(1, Math.ceil(maxScore * 0.5));
  const signal = maxScore && score >= threshold ? 'buy' : maxScore && score <= -threshold ? 'sell' : 'wait';
  const trendIds = active.filter((id) => ['ema20', 'ema50', 'ema200', 'sma200', 'vwap', 'supertrend', 'adx'].includes(id)); const momentumIds = active.filter((id) => ['rsi', 'macd', 'stochastic', 'volume', 'candle'].includes(id));
  const weightedConfidence = (ids) => { const total = ids.reduce((sum, id) => sum + (INDICATOR_WEIGHTS[id] || 1), 0); if (!total) return 50; const value = ids.reduce((sum, id) => sum + (scores[id] || 0) * (INDICATOR_WEIGHTS[id] || 1), 0) / total; return Math.round(50 + value * 50); };
  const lastTimestamp = Number(candles.at(-1)?.[0] || 0); const candleClosed = Boolean(lastTimestamp && Date.now() >= lastTimestamp + timeframeMilliseconds(timeframe));
  return { price: current, change, ema20, ema50, ema200, sma200, rsi: rsi14, macd: macdValue, atr: atrValue, volumeRatio, bollinger: bollingerValue, stochasticRsi: stochastic, adx: adxValue, vwap: vwapValue, supertrend: supertrendValue, score, maxScore, buyRatio, sellRatio, indicatorScores, activeIndicators: active, signal, trendConfidence: weightedConfidence(trendIds), momentumConfidence: weightedConfidence(momentumIds), technicalConfidence: Math.round(50 + (score / Math.max(maxScore, 1)) * 50), candleClosed };
}

export function sparklinePoints(candles, width = 160, height = 48) {
  const values = closes(candles).slice(-30); if (!values.length) return '';
  const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1;
  return values.map((value, index) => `${((index / Math.max(values.length - 1, 1)) * width).toFixed(1)},${(height - ((value - min) / range) * (height - 6) - 3).toFixed(1)}`).join(' ');
}

// Grafikler için tam zaman serileri. Analiz fonksiyonları son değeri döndürür;
// bu yardımcı her mum için aynı hesabı tekrarlar ve çizgilerin kopmasını önler.
export function indicatorSeries(id, candles) {
  const prefix = (calculator) => candles.map((_, index) => calculator(candles.slice(0, index + 1)));
  const values = closes(candles);
  if (id === 'ema20') return prefix((part) => ema(closes(part), 20));
  if (id === 'ema50') return prefix((part) => ema(closes(part), 50));
  if (id === 'ema200') return prefix((part) => ema(closes(part), 200));
  if (id === 'sma200') return prefix((part) => sma(closes(part), 200));
  if (id === 'rsi') return prefix((part) => rsi(closes(part), 14));
  if (id === 'macd') return prefix((part) => macd(closes(part)));
  if (id === 'bollinger') return prefix((part) => bollinger(closes(part), 20));
  if (id === 'stochastic') return prefix((part) => stochasticRsi(closes(part), 14));
  if (id === 'adx') return prefix((part) => adx(part, 14));
  if (id === 'vwap') return prefix((part) => vwap(part));
  if (id === 'supertrend') return prefix((part) => supertrend(part, 10, 3));
  if (id === 'volume') return candles.map((_, index) => {
    const part = candles.slice(0, index + 1); const current = Number(part.at(-1)?.[5] || 0);
    const average = sma(part.slice(-21, -1).map((candle) => Number(candle[5]) || 0), 20);
    return average ? current / average : 1;
  });
  if (id === 'atr') return prefix((part) => atr(part, 14));
  if (id === 'candle') return values.map((value, index) => {
    const previous = values[index - 1] || value;
    return previous ? ((value - previous) / previous) * 100 : 0;
  });
  return values;
}
