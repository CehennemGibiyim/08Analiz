const HISTORY_LIMIT = 360;
const HORIZON_MS = { '1h': 60 * 60 * 1000, '4h': 4 * 60 * 60 * 1000, '1d': 24 * 60 * 60 * 1000 };

function keyOf(exchange, timeframe, symbol) {
  return `${exchange}|${timeframe}|${symbol}`;
}

function normalize(value) { return String(value || '').replace(/[-_/:]/g, '').toUpperCase(); }

function resolveEntry(entry, marketItem) {
  if (!entry || !['buy', 'sell'].includes(entry.signal) || !Number(entry.price) || !marketItem?.candles?.length) return entry;
  const candles = marketItem.candles;
  const outcomes = { ...(entry.outcomes || {}) };
  Object.entries(HORIZON_MS).forEach(([horizon, duration]) => {
    if (outcomes[horizon]) return;
    const targetTime = Number(entry.timestamp) + duration;
    const futureIndex = candles.findIndex((candle) => Number(candle[0]) >= targetTime);
    if (futureIndex < 0) return;
    const futurePrice = Number(candles[futureIndex]?.[4]);
    if (!futurePrice) return;
    const move = (futurePrice - Number(entry.price)) / Number(entry.price) * 100;
    const signed = entry.signal === 'sell' ? -move : move;
    const window = candles.filter((candle) => Number(candle[0]) >= Number(entry.timestamp) && Number(candle[0]) <= Number(candles[futureIndex][0]));
    const highs = window.map((candle) => Number(candle[2])).filter((value) => value > 0);
    const lows = window.map((candle) => Number(candle[3])).filter((value) => value > 0);
    const favorable = entry.signal === 'buy' ? (Math.max(...highs, Number(entry.price)) - Number(entry.price)) / Number(entry.price) * 100 : (Number(entry.price) - Math.min(...lows, Number(entry.price))) / Number(entry.price) * 100;
    const adverse = entry.signal === 'buy' ? (Number(entry.price) - Math.min(...lows, Number(entry.price))) / Number(entry.price) * 100 : (Math.max(...highs, Number(entry.price)) - Number(entry.price)) / Number(entry.price) * 100;
    outcomes[horizon] = { timestamp: Number(candles[futureIndex][0]), price: futurePrice, move, signed, win: signed > 0, favorable: Math.max(0, favorable), adverse: Math.max(0, adverse) };
  });
  return Object.keys(outcomes).length ? { ...entry, outcomes } : entry;
}

export function resolveOutcomes(history = [], markets = []) {
  return history.map((entry) => {
    const item = markets.find((candidate) => candidate.market.exchange === entry.exchange && normalize(candidate.market.symbol) === normalize(entry.symbol)) || markets.find((candidate) => normalize(candidate.market.symbol) === normalize(entry.symbol));
    return resolveEntry(entry, item);
  });
}

export function appendScanHistory(history = [], markets = [], context = {}, timestamp = Date.now()) {
  const previous = new Map();
  history.forEach((event) => previous.set(keyOf(event.exchange, event.timeframe, event.symbol), event));
  const events = markets.map(({ market, analysis, dataSource }) => {
    const prior = previous.get(keyOf(context.exchange, context.timeframe, market.symbol));
    const changeType = !prior ? 'new' : prior.signal === analysis.signal ? 'steady' : 'changed';
    return {
      id: `${timestamp}-${market.symbol}`,
      timestamp,
      exchange: context.exchange,
      timeframe: context.timeframe,
      symbol: market.symbol,
      display: market.display,
      signal: analysis.signal,
      previousSignal: prior?.signal || '',
      changeType,
      score: analysis.score,
      maxScore: analysis.maxScore,
      rsi: analysis.rsi,
      volumeRatio: analysis.volumeRatio,
      confidence: analysis.technicalConfidence,
      candleClosed: analysis.candleClosed,
      price: analysis.price,
      change: analysis.change,
      qualityScore: analysis.intelligence?.quality?.score || 0,
      qualityGrade: analysis.intelligence?.quality?.grade || 'D',
      dataQualityScore: analysis.intelligence?.dataQuality?.score || 0,
      dataQualityGrade: analysis.intelligence?.dataQuality?.grade || 'D',
      dataGaps: analysis.intelligence?.dataQuality?.gaps || 0,
      regime: analysis.intelligence?.regime?.key || 'transition',
      dataSource: dataSource || 'unavailable',
    };
  });
  const merged = [...history, ...events].slice(-HISTORY_LIMIT);
  return { history: resolveOutcomes(merged, markets), events };
}

export function annotateMarkets(markets, history = [], context = {}) {
  const latest = new Map();
  history.forEach((event) => latest.set(keyOf(event.exchange, event.timeframe, event.symbol), event));
  return markets.map((item) => {
    const prior = latest.get(keyOf(context.exchange, context.timeframe, item.market.symbol));
    const changeType = !prior ? 'new' : prior.signal === item.analysis.signal ? 'steady' : 'changed';
    return { ...item, analysis: { ...item.analysis, previousSignal: prior?.signal || '', signalChange: changeType } };
  });
}

export function pairHistory(history = [], exchange, symbol, limit = 8) {
  return history.filter((event) => event.exchange === exchange && normalize(event.symbol) === normalize(symbol)).slice(-limit).reverse();
}
