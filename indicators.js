import { applyBuyTimingFilter } from './timing-filter.js';

function closes(candles) { return candles.map((candle) => Number(candle[4])); }
function finiteValues(values) { return values.map(Number).filter(Number.isFinite); }

export const INDICATOR_DEFINITIONS = [
  { id: 'ema20', labelKey: 'indicator.ema20' }, { id: 'ema50', labelKey: 'indicator.ema50' }, { id: 'ema200', labelKey: 'indicator.ema200' }, { id: 'sma200', labelKey: 'indicator.sma200' },
  { id: 'rsi', labelKey: 'indicator.rsi14' }, { id: 'macd', labelKey: 'indicator.macd' }, { id: 'bollinger', labelKey: 'indicator.bollinger' }, { id: 'stochastic', labelKey: 'indicator.stochastic' },
  { id: 'adx', labelKey: 'indicator.adx' }, { id: 'vwap', labelKey: 'indicator.vwap' }, { id: 'supertrend', labelKey: 'indicator.supertrend' }, { id: 'volume', labelKey: 'indicator.volumeRatio' },
  { id: 'atr', labelKey: 'indicator.atr14' }, { id: 'candle', labelKey: 'indicator.candleTrend' },
];

// Gate.io grafikleri sabit bir "özel sinyal" üretmez; standart grafik göstergeleri kullanıcı tarafından seçilir.
// Bu katalog Gate.io grafiğinde yaygın olarak bulunan göstergeleri ayrı bir set olarak uygular.
export const GATE_INDICATOR_DEFINITIONS = [
  { id: 'gate_ma20', labelKey: 'indicator.gateMa20' }, { id: 'gate_ema20', labelKey: 'indicator.gateEma20' }, { id: 'gate_bollinger', labelKey: 'indicator.gateBollinger' },
  { id: 'gate_sar', labelKey: 'indicator.gateSar' }, { id: 'gate_rsi', labelKey: 'indicator.gateRsi' }, { id: 'gate_macd', labelKey: 'indicator.gateMacd' },
  { id: 'gate_kdj', labelKey: 'indicator.gateKdj' }, { id: 'gate_cci', labelKey: 'indicator.gateCci' }, { id: 'gate_wr', labelKey: 'indicator.gateWr' },
  { id: 'gate_atr', labelKey: 'indicator.gateAtr' }, { id: 'gate_dmi', labelKey: 'indicator.gateDmi' }, { id: 'gate_obv', labelKey: 'indicator.gateObv' },
  { id: 'gate_vol', labelKey: 'indicator.gateVol' }, { id: 'gate_roc', labelKey: 'indicator.gateRoc' }, { id: 'gate_mtm', labelKey: 'indicator.gateMtm' },
  { id: 'gate_stochrsi', labelKey: 'indicator.gateStochRsi' },
];

export const INDICATOR_IDS = INDICATOR_DEFINITIONS.map((indicator) => indicator.id);
export const GATE_INDICATOR_IDS = GATE_INDICATOR_DEFINITIONS.map((indicator) => indicator.id);
export const ALL_INDICATOR_DEFINITIONS = [...INDICATOR_DEFINITIONS, ...GATE_INDICATOR_DEFINITIONS];
export const ALL_INDICATOR_IDS = ALL_INDICATOR_DEFINITIONS.map((indicator) => indicator.id);
export const INDICATOR_WEIGHTS = {
  ema20: 1.2, ema50: 1.3, ema200: 1.5, sma200: 1.5, rsi: 1, macd: 1.3, bollinger: .9, stochastic: .8, adx: 1.2, vwap: 1, supertrend: 1.3, volume: .8, atr: .5, candle: .5,
  gate_ma20: 1, gate_ema20: 1.1, gate_bollinger: 1, gate_sar: 1, gate_rsi: 1, gate_macd: 1.1, gate_kdj: .9, gate_cci: .8, gate_wr: .8, gate_atr: .6, gate_dmi: 1, gate_obv: .8, gate_vol: .8, gate_roc: .8, gate_mtm: .7, gate_stochrsi: .8,
};
export const INDICATOR_SETS = {
  core: { definitions: INDICATOR_DEFINITIONS, ids: INDICATOR_IDS, profile: 'tv-binance-standard' },
  gate: { definitions: GATE_INDICATOR_DEFINITIONS, ids: GATE_INDICATOR_IDS, profile: 'gate-compatible-standard' },
};
export function indicatorSet(source = 'core') { return INDICATOR_SETS[source] || INDICATOR_SETS.core; }

export function sma(values, period) { const clean = finiteValues(values); if (!clean.length) return 0; const slice = clean.slice(-period); return slice.reduce((sum, value) => sum + value, 0) / slice.length; }

export function ema(values, period) {
  const clean = finiteValues(values); if (!clean.length) return 0;
  const multiplier = 2 / (period + 1); let value = sma(clean.slice(0, period), Math.min(period, clean.length));
  for (let index = period; index < clean.length; index += 1) value = (clean[index] - value) * multiplier + value;
  return value;
}

export function rma(values, period) {
  const clean = finiteValues(values); if (!clean.length) return 0;
  if (clean.length < period) return sma(clean, clean.length);
  let value = sma(clean.slice(0, period), period);
  for (let index = period; index < clean.length; index += 1) value = ((value * (period - 1)) + clean[index]) / period;
  return value;
}

export function rsi(values, period = 14) {
  const clean = finiteValues(values); if (clean.length <= period) return 50; const gains = []; const losses = [];
  for (let index = 1; index < clean.length; index += 1) { const change = clean[index] - clean[index - 1]; gains.push(Math.max(change, 0)); losses.push(Math.max(-change, 0)); }
  const averageGain = rma(gains, period); const averageLoss = rma(losses, period);
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

export function macd(values) {
  const clean = finiteValues(values); const line = ema(clean, 12) - ema(clean, 26); const history = [];
  for (let index = 26; index <= clean.length; index += 1) history.push(ema(clean.slice(0, index), 12) - ema(clean.slice(0, index), 26));
  const signal = ema(history, 9); return { line, signal, histogram: line - signal };
}

export function atr(candles, period = 14) {
  if (candles.length < 2) return 0; const ranges = [];
  for (let index = 1; index < candles.length; index += 1) { const high = Number(candles[index][2]); const low = Number(candles[index][3]); const previousClose = Number(candles[index - 1][4]); ranges.push(Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose))); }
  return rma(ranges, period);
}

export function bollinger(values, period = 20, multiplier = 2) {
  const clean = finiteValues(values); const middle = sma(clean, period); const slice = clean.slice(-period); const variance = slice.reduce((sum, value) => sum + ((value - middle) ** 2), 0) / Math.max(slice.length, 1); const deviation = Math.sqrt(variance);
  return { middle, upper: middle + deviation * multiplier, lower: middle - deviation * multiplier, bandwidth: middle ? (deviation * multiplier * 2) / middle * 100 : 0 };
}

export function stochasticRsi(values, period = 14) {
  const clean = finiteValues(values); if (clean.length <= period) return 50; const rsis = [];
  for (let index = period; index < clean.length; index += 1) rsis.push(rsi(clean.slice(0, index + 1), period));
  const window = rsis.slice(-period); const current = window.at(-1) ?? 50; const min = Math.min(...window); const max = Math.max(...window);
  return max === min ? 50 : ((current - min) / (max - min)) * 100;
}

export function adx(candles, period = 14) {
  if (candles.length < period + 2) return { value: 0, plus: 0, minus: 0 };
  const plusMoves = []; const minusMoves = []; const ranges = [];
  for (let index = 1; index < candles.length; index += 1) {
    const high = Number(candles[index][2]); const low = Number(candles[index][3]); const prevHigh = Number(candles[index - 1][2]); const prevLow = Number(candles[index - 1][3]); const prevClose = Number(candles[index - 1][4]);
    plusMoves.push(high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0); minusMoves.push(prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0); ranges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  let trSmooth = ranges.slice(0, period).reduce((sum, value) => sum + value, 0); let plusSmooth = plusMoves.slice(0, period).reduce((sum, value) => sum + value, 0); let minusSmooth = minusMoves.slice(0, period).reduce((sum, value) => sum + value, 0); const dxValues = [];
  for (let index = period - 1; index < ranges.length; index += 1) {
    if (index >= period) { trSmooth = trSmooth - trSmooth / period + ranges[index]; plusSmooth = plusSmooth - plusSmooth / period + plusMoves[index]; minusSmooth = minusSmooth - minusSmooth / period + minusMoves[index]; }
    const plus = trSmooth ? plusSmooth / trSmooth * 100 : 0; const minus = trSmooth ? minusSmooth / trSmooth * 100 : 0; dxValues.push((Math.abs(plus - minus) / Math.max(plus + minus, 1)) * 100);
  }
  const latestTr = trSmooth || 1; return { value: rma(dxValues, period), plus: plusSmooth / latestTr * 100, minus: minusSmooth / latestTr * 100 };
}

export function vwap(candles) {
  const last = candles.at(-1); const lastTimestamp = Number(last?.[0] || 0); const dayStart = lastTimestamp - ((lastTimestamp % 86400000 + 86400000) % 86400000); const session = lastTimestamp ? candles.filter((candle) => Number(candle[0]) >= dayStart) : candles.slice(-50); let volume = 0; let total = 0;
  session.forEach((candle) => { const typical = (Number(candle[2]) + Number(candle[3]) + Number(candle[4])) / 3; const amount = Number(candle[5]) || 0; total += typical * amount; volume += amount; });
  return volume ? total / volume : Number(last?.[4] || 0);
}

export function supertrend(candles, period = 10, factor = 3) {
  if (!candles.length) return { value: 0, direction: 'up' }; let finalUpper = Infinity; let finalLower = -Infinity; let direction = 'up'; let value = Number(candles[0][4]) || 0;
  candles.forEach((candle, index) => { const high = Number(candle[2]); const low = Number(candle[3]); const close = Number(candle[4]); const averageTrueRange = atr(candles.slice(0, index + 1), period); const midpoint = (high + low) / 2; const basicUpper = midpoint + factor * averageTrueRange; const basicLower = midpoint - factor * averageTrueRange; if (index === 0) { finalUpper = basicUpper; finalLower = basicLower; value = finalLower; return; } const previousClose = Number(candles[index - 1][4]); finalUpper = basicUpper < finalUpper || previousClose > finalUpper ? basicUpper : finalUpper; finalLower = basicLower > finalLower || previousClose < finalLower ? basicLower : finalLower; if (direction === 'down' && close > finalUpper) direction = 'up'; else if (direction === 'up' && close < finalLower) direction = 'down'; value = direction === 'up' ? finalLower : finalUpper; });
  return { value, direction };
}

function typical(candle) { return (Number(candle[2]) + Number(candle[3]) + Number(candle[4])) / 3; }
function gateKdj(candles, period = 9) { const window = candles.slice(-period); const high = Math.max(...window.map((candle) => Number(candle[2]))); const low = Math.min(...window.map((candle) => Number(candle[3]))); const close = Number(candles.at(-1)?.[4] || 0); const rsv = high === low ? 50 : (close - low) / (high - low) * 100; const k = rsv; const d = rsv; return { k, d, j: 3 * k - 2 * d }; }
function gateCci(candles, period = 20) { const values = candles.slice(-period).map(typical); const average = sma(values, period); const deviation = values.reduce((sum, value) => sum + Math.abs(value - average), 0) / Math.max(values.length, 1); return deviation ? (values.at(-1) - average) / (.015 * deviation) : 0; }
function gateWilliamsR(candles, period = 14) { const window = candles.slice(-period); const high = Math.max(...window.map((candle) => Number(candle[2]))); const low = Math.min(...window.map((candle) => Number(candle[3]))); const close = Number(candles.at(-1)?.[4] || 0); return high === low ? -50 : (high - close) / (high - low) * -100; }
function gateObvSeries(candles) { let value = 0; return candles.map((candle, index) => { if (index) { const close = Number(candle[4]); const previous = Number(candles[index - 1][4]); const volume = Number(candle[5]) || 0; if (close > previous) value += volume; else if (close < previous) value -= volume; } return value; }); }
function gateMfi(candles, period = 14) { const flows = candles.slice(-(period + 1)).map((candle) => typical(candle) * (Number(candle[5]) || 0)); let positive = 0; let negative = 0; for (let index = 1; index < flows.length; index += 1) { if (flows[index] >= flows[index - 1]) positive += flows[index]; else negative += flows[index]; } return negative ? 100 - 100 / (1 + positive / negative) : positive ? 100 : 50; }
function gateSar(candles, step = .02, maximum = .2) { if (!candles.length) return { value: 0, direction: 'up' }; let rising = true; let sar = Number(candles[0][3]); let extreme = Number(candles[0][2]); let acceleration = step; for (let index = 1; index < candles.length; index += 1) { const high = Number(candles[index][2]); const low = Number(candles[index][3]); sar = sar + acceleration * (extreme - sar); if (rising) { sar = Math.min(sar, Number(candles[index - 1][3]), Number(candles[index - 2]?.[3] ?? candles[index - 1][3])); if (low < sar) { rising = false; sar = extreme; extreme = low; acceleration = step; } else if (high > extreme) { extreme = high; acceleration = Math.min(maximum, acceleration + step); } } else { sar = Math.max(sar, Number(candles[index - 1][2]), Number(candles[index - 2]?.[2] ?? candles[index - 1][2])); if (high > sar) { rising = true; sar = extreme; extreme = high; acceleration = step; } else if (low < extreme) { extreme = low; acceleration = Math.min(maximum, acceleration + step); } } } return { value: sar, direction: rising ? 'up' : 'down' }; }

export function timeframeMilliseconds(timeframe = '1h', timestamp = Date.now()) { if (timeframe === '1M') { const date = new Date(Number(timestamp) || Date.now()); const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1); const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1); return next - current; } return { '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '12h': 43200000, '1d': 86400000, '1w': 604800000 }[timeframe] || 3600000; }

export function analyzeCandles(candles, selectedIndicators = INDICATOR_IDS, timeframe = '1h', options = {}) {
  const values = closes(candles); const current = values.at(-1) || 0; const previous = values.at(-2) || current; const ema20 = ema(values, 20); const ema50 = ema(values, 50); const ema200 = ema(values, 200); const sma200 = sma(values, 200);
  const rsi14 = rsi(values, 14); const macdValue = macd(values); const bollingerValue = bollinger(values); const atrValue = atr(candles); const adxValue = adx(candles); const vwapValue = vwap(candles); const stochastic = stochasticRsi(values); const supertrendValue = supertrend(candles);
  const averageVolume = sma(candles.slice(-21, -1).map((candle) => Number(candle[5])), 20); const currentVolume = Number(candles.at(-1)?.[5] || 0); const volumeRatio = averageVolume ? currentVolume / averageVolume : 1; const change = previous ? ((current - previous) / previous) * 100 : 0;
  const gateMa20 = sma(values, 20); const gateEma20 = ema(values, 20); const gateBollinger = bollingerValue; const gateSarValue = gateSar(candles); const gateRsi = rsi14; const gateMacd = macdValue; const gateKdjValue = gateKdj(candles); const gateCciValue = gateCci(candles); const gateWrValue = gateWilliamsR(candles); const gateAtr = atrValue; const gateDmi = adxValue; const obvSeries = gateObvSeries(candles); const gateObv = obvSeries.at(-1) > sma(obvSeries, 14) ? 1 : -1; const gateVol = volumeRatio; const gateRoc = values.length > 12 && values.at(-13) ? (current - values.at(-13)) / values.at(-13) * 100 : 0; const gateMtm = values.length > 12 ? current - values.at(-13) : 0; const gateStochRsi = stochasticRsi(values);
  const active = ALL_INDICATOR_IDS.filter((id) => selectedIndicators.includes(id));
  const scores = {
    ema20: current > ema20 ? 1 : -1, ema50: current > ema50 ? 1 : -1, ema200: current > ema200 ? 1 : -1, sma200: current > sma200 ? 1 : -1, rsi: rsi14 >= 55 && rsi14 < 75 ? 1 : rsi14 <= 45 && rsi14 > 25 ? -1 : 0, macd: macdValue.histogram > 0 ? 1 : -1, bollinger: current > bollingerValue.middle ? 1 : -1, stochastic: stochastic <= 20 ? 1 : stochastic >= 80 ? -1 : 0, adx: adxValue.value >= 20 ? (adxValue.plus >= adxValue.minus ? 1 : -1) : 0, vwap: current > vwapValue ? 1 : -1, supertrend: supertrendValue.direction === 'up' ? 1 : -1, volume: volumeRatio > 1.25 ? (change >= 0 ? 1 : -1) : 0, atr: current && atrValue / current >= 0.005 ? (change >= 0 ? 1 : -1) : 0, candle: change >= 0 ? 1 : -1,
    gate_ma20: current > gateMa20 ? 1 : -1, gate_ema20: current > gateEma20 ? 1 : -1, gate_bollinger: current > gateBollinger.middle ? 1 : -1, gate_sar: gateSarValue.direction === 'up' ? 1 : -1, gate_rsi: gateRsi >= 55 && gateRsi < 75 ? 1 : gateRsi <= 45 && gateRsi > 25 ? -1 : 0, gate_macd: gateMacd.histogram > 0 ? 1 : -1, gate_kdj: gateKdjValue.j <= 20 ? 1 : gateKdjValue.j >= 80 ? -1 : 0, gate_cci: gateCciValue <= -100 ? 1 : gateCciValue >= 100 ? -1 : 0, gate_wr: gateWrValue <= -80 ? 1 : gateWrValue >= -20 ? -1 : 0, gate_atr: current && gateAtr / current >= .005 ? (change >= 0 ? 1 : -1) : 0, gate_dmi: gateDmi.value >= 20 ? (gateDmi.plus >= gateDmi.minus ? 1 : -1) : 0, gate_obv: gateObv, gate_vol: gateVol > 1.25 ? (change >= 0 ? 1 : -1) : 0, gate_roc: gateRoc > 0 ? 1 : gateRoc < 0 ? -1 : 0, gate_mtm: gateMtm > 0 ? 1 : gateMtm < 0 ? -1 : 0, gate_stochrsi: gateStochRsi <= 20 ? 1 : gateStochRsi >= 80 ? -1 : 0,
  };
  const score = active.reduce((sum, id) => sum + scores[id] * (INDICATOR_WEIGHTS[id] || 1), 0); const indicatorScores = active.reduce((result, id) => { result[id] = scores[id]; return result; }, {}); const maxScore = active.reduce((sum, id) => sum + (INDICATOR_WEIGHTS[id] || 1), 0); const buyRatio = maxScore ? Math.round(((score + maxScore) / (2 * maxScore)) * 100) : 50; const sellRatio = 100 - buyRatio; const threshold = Math.max(1, Math.ceil(maxScore * 0.5)); const technicalSignal = maxScore && score >= threshold ? 'buy' : maxScore && score <= -threshold ? 'sell' : 'wait';
  const trendIds = active.filter((id) => ['ema20', 'ema50', 'ema200', 'sma200', 'vwap', 'supertrend', 'adx', 'gate_ma20', 'gate_ema20', 'gate_sar', 'gate_dmi'].includes(id)); const momentumIds = active.filter((id) => ['rsi', 'macd', 'stochastic', 'volume', 'candle', 'gate_rsi', 'gate_macd', 'gate_kdj', 'gate_cci', 'gate_wr', 'gate_obv', 'gate_vol', 'gate_roc', 'gate_mtm', 'gate_stochrsi'].includes(id)); const weightedConfidence = (ids) => { const total = ids.reduce((sum, id) => sum + (INDICATOR_WEIGHTS[id] || 1), 0); if (!total) return 50; const value = ids.reduce((sum, id) => sum + (scores[id] || 0) * (INDICATOR_WEIGHTS[id] || 1), 0) / total; return Math.round(50 + value * 50); };
  const lastTimestamp = Number(candles.at(-1)?.[0] || 0); const candleClosed = Boolean(lastTimestamp && Date.now() >= lastTimestamp + timeframeMilliseconds(timeframe, lastTimestamp)); const profile = active.some((id) => id.startsWith('gate_')) ? (active.some((id) => !id.startsWith('gate_')) ? 'hybrid-standard' : 'gate-compatible-standard') : 'tv-binance-standard'; const base = { price: current, change, ema20, ema50, ema200, sma200, rsi: rsi14, macd: macdValue, atr: atrValue, volumeRatio, bollinger: bollingerValue, stochasticRsi: stochastic, adx: adxValue, vwap: vwapValue, supertrend: supertrendValue, gateMa20, gateEma20, gateBollinger, gateSar: gateSarValue, gateRsi, gateMacd, gateKdj: gateKdjValue, gateCci: gateCciValue, gateWr: gateWrValue, gateAtr, gateDmi, gateObv, gateVol, gateRoc, gateMtm, gateStochRsi, score, maxScore, buyRatio, sellRatio, indicatorScores, activeIndicators: active, signal: technicalSignal, trendConfidence: weightedConfidence(trendIds), momentumConfidence: weightedConfidence(momentumIds), technicalConfidence: Math.round(50 + (score / Math.max(maxScore, 1)) * 50), candleClosed, calculationProfile: profile };
  return applyBuyTimingFilter(base, options.timingTimestamp ?? Date.now());
}

export function sparklinePoints(candles, width = 160, height = 48) { const values = closes(candles).slice(-30); if (!values.length) return ''; const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1; return values.map((value, index) => `${((index / Math.max(values.length - 1, 1)) * width).toFixed(1)},${(height - ((value - min) / range) * (height - 6) - 3).toFixed(1)}`).join(' '); }

export function indicatorSeries(id, candles) {
  const prefix = (calculator) => candles.map((_, index) => calculator(candles.slice(0, index + 1))); const values = closes(candles);
  if (id === 'ema20') return prefix((part) => ema(closes(part), 20)); if (id === 'ema50') return prefix((part) => ema(closes(part), 50)); if (id === 'ema200') return prefix((part) => ema(closes(part), 200)); if (id === 'sma200') return prefix((part) => sma(closes(part), 200)); if (id === 'rsi') return prefix((part) => rsi(closes(part), 14)); if (id === 'macd') return prefix((part) => macd(closes(part))); if (id === 'bollinger') return prefix((part) => bollinger(closes(part), 20)); if (id === 'stochastic') return prefix((part) => stochasticRsi(closes(part), 14)); if (id === 'adx') return prefix((part) => adx(part, 14)); if (id === 'vwap') return prefix((part) => vwap(part)); if (id === 'supertrend') return prefix((part) => supertrend(part, 10, 3));
  if (id === 'volume') return candles.map((_, index) => { const part = candles.slice(0, index + 1); const current = Number(part.at(-1)?.[5] || 0); const average = sma(part.slice(-21, -1).map((candle) => Number(candle[5]) || 0), 20); return average ? current / average : 1; });
  if (id === 'atr') return prefix((part) => atr(part, 14)); if (id === 'candle') return values.map((value, index) => { const previous = values[index - 1] || value; return previous ? ((value - previous) / previous) * 100 : 0; }); return values;
}
