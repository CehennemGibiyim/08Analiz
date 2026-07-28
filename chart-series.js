function closes(candles) { return candles.map((candle) => Number(candle[4]) || 0); }
function smaSeries(values, period) {
  let sum = 0;
  return values.map((value, index) => {
    sum += Number(value) || 0;
    if (index >= period) sum -= Number(values[index - period]) || 0;
    return sum / Math.min(index + 1, period);
  });
}
function emaSeries(values, period) {
  const output = []; const multiplier = 2 / (period + 1); let value = 0;
  values.forEach((raw, index) => { const current = Number(raw) || 0; if (index === 0) value = current; else value = (current - value) * multiplier + value; output.push(value); });
  return output;
}
function trueRanges(candles) {
  return candles.map((candle, index) => { const high = Number(candle[2]) || 0; const low = Number(candle[3]) || 0; const previous = Number(candles[index - 1]?.[4] || candle[4]) || 0; return index ? Math.max(high - low, Math.abs(high - previous), Math.abs(low - previous)) : high - low; });
}
function atrSeries(candles, period = 14) { return smaSeries(trueRanges(candles), period); }
function rsiSeries(values, period = 14) {
  const output = values.map(() => 50); if (values.length <= period) return output;
  let gain = 0; let loss = 0;
  for (let i = 1; i <= period; i += 1) { const change = values[i] - values[i - 1]; gain += Math.max(change, 0); loss += Math.max(-change, 0); }
  const valueOf = () => loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  output[period] = valueOf();
  for (let i = period + 1; i < values.length; i += 1) { const change = values[i] - values[i - 1]; gain = (gain * (period - 1) + Math.max(change, 0)) / period; loss = (loss * (period - 1) + Math.max(-change, 0)) / period; output[i] = valueOf(); }
  return output;
}
function macdSeries(values) { const fast = emaSeries(values, 12); const slow = emaSeries(values, 26); const line = values.map((_, i) => fast[i] - slow[i]); const signal = emaSeries(line, 9); return line.map((value, i) => ({ line: value, signal: signal[i], histogram: value - signal[i] })); }
function bollingerSeries(values, period = 20, multiplier = 2) {
  return values.map((_, index) => { const slice = values.slice(Math.max(0, index - period + 1), index + 1); const middle = slice.reduce((sum, value) => sum + value, 0) / slice.length; const variance = slice.reduce((sum, value) => sum + (value - middle) ** 2, 0) / slice.length; const deviation = Math.sqrt(variance); return { middle, upper: middle + deviation * multiplier, lower: middle - deviation * multiplier }; });
}
function stochasticSeries(values, period = 14) { const rsis = rsiSeries(values, period); return rsis.map((value, index) => { const window = rsis.slice(Math.max(0, index - period + 1), index + 1); const min = Math.min(...window); const max = Math.max(...window); return max === min ? 50 : ((value - min) / (max - min)) * 100; }); }
function adxSeries(candles, period = 14) {
  const plus = []; const minus = []; const ranges = [];
  candles.forEach((candle, index) => { if (!index) { plus.push(0); minus.push(0); ranges.push(Math.max(Number(candle[2]) - Number(candle[3]), 0)); return; } const high = Number(candle[2]); const low = Number(candle[3]); const prevHigh = Number(candles[index - 1][2]); const prevLow = Number(candles[index - 1][3]); plus.push(high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0); minus.push(prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0); ranges.push(trueRanges(candles.slice(index - 1, index + 1))[1]); });
  const tr = smaSeries(ranges, period); const p = smaSeries(plus, period); const m = smaSeries(minus, period); const dx = p.map((value, index) => (Math.abs(value - m[index]) / Math.max(value + m[index], 1e-9)) * 100); const adx = smaSeries(dx, period);
  return candles.map((_, index) => ({ value: adx[index], plus: tr[index] ? p[index] / tr[index] * 100 : 0, minus: tr[index] ? m[index] / tr[index] * 100 : 0 }));
}
function supertrendSeries(candles, period = 10, factor = 3) {
  const atr = atrSeries(candles, period); let upper = Infinity; let lower = -Infinity; let direction = 'up';
  return candles.map((candle, index) => { const high = Number(candle[2]); const low = Number(candle[3]); const close = Number(candle[4]); const midpoint = (high + low) / 2; const basicUpper = midpoint + factor * atr[index]; const basicLower = midpoint - factor * atr[index]; if (index === 0) { upper = basicUpper; lower = basicLower; return { value: lower, direction }; } const previousClose = Number(candles[index - 1][4]); upper = basicUpper < upper || previousClose > upper ? basicUpper : upper; lower = basicLower > lower || previousClose < lower ? basicLower : lower; if (direction === 'down' && close > upper) direction = 'up'; else if (direction === 'up' && close < lower) direction = 'down'; return { value: direction === 'up' ? lower : upper, direction }; });
}
export function indicatorSeries(id, candles) {
  const values = closes(candles);
  if (id === 'ema20') return emaSeries(values, 20);
  if (id === 'ema50') return emaSeries(values, 50);
  if (id === 'ema200') return emaSeries(values, 200);
  if (id === 'sma200') return smaSeries(values, 200);
  if (id === 'rsi') return rsiSeries(values, 14);
  if (id === 'macd') return macdSeries(values);
  if (id === 'bollinger') return bollingerSeries(values, 20);
  if (id === 'stochastic') return stochasticSeries(values, 14);
  if (id === 'adx') return adxSeries(candles, 14);
  if (id === 'vwap') { let total = 0; let volume = 0; return candles.map((candle) => { const typical = (Number(candle[2]) + Number(candle[3]) + Number(candle[4])) / 3; const amount = Number(candle[5]) || 0; total += typical * amount; volume += amount; return volume ? total / volume : Number(candle[4]); }); }
  if (id === 'supertrend') return supertrendSeries(candles, 10, 3);
  if (id === 'volume') return candles.map((candle, index) => { const start = Math.max(0, index - 20); const window = candles.slice(start, index); const average = window.reduce((sum, row) => sum + (Number(row[5]) || 0), 0) / Math.max(window.length, 1); return average ? Number(candle[5] || 0) / average : 1; });
  if (id === 'atr') return atrSeries(candles, 14);
  if (id === 'candle') return values.map((value, index) => { const previous = values[index - 1] || value; return previous ? (value - previous) / previous * 100 : 0; });
  return values;
}
