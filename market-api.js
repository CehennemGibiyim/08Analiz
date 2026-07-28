import { analyzeCandles } from './indicators.js';
import { EXCHANGES, exchangeName, fallbackCatalog, parseCandles, parseCatalog, candleRequest } from './exchanges.js';
import { enrichMarketIntelligence } from './market-intelligence.js';

const BASE_PRICES = { BTC: 104800, ETH: 2650, SOL: 148, BNB: 680, XRP: 2.24, DOGE: 0.18, ADA: 0.72, AVAX: 36 };
const candleCache = new Map();
const catalogCache = new Map();
const CANDLE_CACHE_MS = 20000;
const CATALOG_CACHE_MS = 120000;
const apiHealth = { requests: 0, lastLatencyMs: 0, lastSuccessAt: 0, lastError: '' };

function validateCandles(candles = []) {
  if (!Array.isArray(candles) || candles.length < 30) return false;
  let previousTimestamp = 0;
  return candles.every((candle) => {
    if (!Array.isArray(candle) || candle.length < 6) return false;
    const [timestamp, open, high, low, close, volume] = candle.map(Number);
    const validNumbers = [timestamp, open, high, low, close, volume].every(Number.isFinite);
    const validOhlc = open > 0 && high > 0 && low > 0 && close > 0 && high >= Math.max(open, close) && low <= Math.min(open, close);
    const ordered = timestamp > previousTimestamp;
    previousTimestamp = timestamp;
    return validNumbers && validOhlc && volume >= 0 && ordered;
  });
}

export function getSystemHealth() { return { ...apiHealth }; }

async function fetchJson(url, timeoutMs = 10000) {
  const startedAt = Date.now(); apiHealth.requests += 1;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload == null || typeof payload !== 'object') throw new Error('invalid_json_payload');
    apiHealth.lastLatencyMs = Date.now() - startedAt; apiHealth.lastSuccessAt = Date.now(); apiHealth.lastError = '';
    return payload;
  } catch (error) {
    apiHealth.lastLatencyMs = Date.now() - startedAt; apiHealth.lastError = error?.message || 'request_failed'; throw error;
  } finally { clearTimeout(timer); }
}

function seededCandles(market, count = 300, timeframe = '1h') {
  const base = BASE_PRICES[market.base] || 10 + (market.base.length * 3); let price = base * .94;
  const timeframeMs = { '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '12h': 43200000, '1d': 86400000, '1w': 604800000 }[timeframe] || 3600000;
  let seed = market.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Array.from({ length: count }, (_, index) => {
    seed = (seed * 9301 + 49297) % 233280; const wave = Math.sin(index / 10 + seed / 10000) * .004;
    const drift = ['BTC', 'ETH', 'SOL', 'BNB'].includes(market.base) ? .0007 : -.00015; const change = drift + wave + ((seed / 233280) - .5) * .012;
    const open = price; price = Math.max(base * .75, price * (1 + change)); const high = Math.max(open, price) * (1 + .002 + (seed % 7) / 5000);
    const low = Math.min(open, price) * (1 - .002 - (seed % 5) / 5000); const volume = base * 10 * (.8 + (seed % 30) / 100);
    return [Date.now() - (count - index) * timeframeMs, open, high, low, price, volume];
  });
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length); let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor; cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function toMarketResult(market, candles, selectedIndicators, timeframe, live) {
  const currentAnalysis = analyzeCandles(candles, selectedIndicators, timeframe);
  const closedCandles = currentAnalysis.candleClosed || candles.length < 32 ? candles : candles.slice(0, -1);
  const confirmed = analyzeCandles(closedCandles, selectedIndicators, timeframe);
  const analysis = { ...confirmed, price: currentAnalysis.price, change: currentAnalysis.change, candleClosed: currentAnalysis.candleClosed };
  const intelligence = enrichMarketIntelligence({ candles, analysis, market, dataSource: live ? 'live' : 'demo', timeframe });
  return { market, ticker: { symbol: market.symbol, base: market.base, quote: market.quote, lastPrice: currentAnalysis.price, priceChangePercent: currentAnalysis.change, quoteVolume: Number(market.quoteVolume || 0) }, candles, analysis: { ...analysis, intelligence }, dataSource: live ? 'live' : 'demo' };
}

async function loadOneMarket(exchange, timeframe, market, selectedIndicators) {
  const cacheKey = `${exchange}|${timeframe}|${market.symbol}`;
  const cached = candleCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CANDLE_CACHE_MS) return { result: toMarketResult(market, cached.candles, selectedIndicators, timeframe, true), live: true, cached: true };
  try {
    const payload = await fetchJson(candleRequest(exchange, market, timeframe));
    const candles = parseCandles(exchange, payload, market);
    if (!validateCandles(candles)) throw new Error('invalid_candles');
    candleCache.set(cacheKey, { timestamp: Date.now(), candles });
    return { result: toMarketResult(market, candles, selectedIndicators, timeframe, true), live: true };
  } catch {
    return { result: toMarketResult(market, seededCandles(market, 300, timeframe), selectedIndicators, timeframe, false), live: false };
  }
}

export async function loadCatalog(exchange) {
  const config = EXCHANGES[exchange];
  if (!config) return { catalog: [], source: 'fallback', error: 'exchange_unknown', health: getSystemHealth() };
  const cached = catalogCache.get(exchange);
  if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_MS) return { ...cached.value, health: getSystemHealth() };
  try {
    const payloads = [await fetchJson(config.catalog, 14000)];
    if (exchange === 'bybit') {
      let cursor = payloads[0].result?.nextPageCursor; let page = 0;
      while (cursor && page < 5) {
        const nextPayload = await fetchJson(`${config.catalog}&cursor=${encodeURIComponent(cursor)}`, 14000);
        payloads.push(nextPayload); cursor = nextPayload.result?.nextPageCursor; page += 1;
      }
    }
    const catalog = payloads.flatMap((item) => parseCatalog(exchange, item)).filter((item) => item.base && item.quote);
    if (!catalog.length) throw new Error('empty_catalog');
    const value = { catalog, source: 'live', error: '', health: getSystemHealth() }; catalogCache.set(exchange, { timestamp: Date.now(), value }); return value;
  } catch {
    return { catalog: fallbackCatalog(exchange), source: 'fallback', error: 'catalog_unavailable', health: getSystemHealth() };
  }
}

export async function loadMarkets(exchange, timeframe, markets, selectedIndicators) {
  const selected = markets.slice(0, 18);
  const results = await mapWithConcurrency(selected, 4, (market) => loadOneMarket(exchange, timeframe, market, selectedIndicators));
  const liveCount = results.filter((item) => item.live).length;
  return { markets: results.map((item) => item.result), source: liveCount === results.length ? 'live' : liveCount ? 'mixed' : 'demo', error: liveCount ? '' : 'market_unavailable', exchangeName: exchangeName(exchange), health: getSystemHealth() };
}

export async function loadConfirmation(exchange, market, timeframes, selectedIndicators) {
  const unique = [...new Set(timeframes)].slice(0, 4);
  const results = await Promise.all(unique.map(async (timeframe) => ({ timeframe, ...(await loadOneMarket(exchange, timeframe, market, selectedIndicators)) })));
  return {
    analyses: Object.fromEntries(results.map(({ timeframe, result }) => [timeframe, { ...result.analysis, candles: result.candles }])),
    source: results.every((item) => item.live) ? 'live' : results.some((item) => item.live) ? 'mixed' : 'demo',
    timeframes: unique,
  };
}
