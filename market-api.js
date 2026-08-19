import { analyzeCandles } from './indicators.js';
import { EXCHANGES, exchangeName, parseCandles, parseCatalog, parseTickerVolumes, candleRequest } from './exchanges.js';
import { enrichMarketIntelligence } from './market-intelligence.js';

const candleCache = new Map(); const catalogCache = new Map(); const tickerCache = new Map();
const CANDLE_CACHE_MS = 20000; const CATALOG_CACHE_MS = 120000;
const apiHealth = { requests: 0, lastLatencyMs: 0, lastSuccessAt: 0, lastError: '' };

function validateCandles(candles = []) {
  if (!Array.isArray(candles) || candles.length < 30) return false;
  let previousTimestamp = 0;
  return candles.every((candle) => { if (!Array.isArray(candle) || candle.length < 6) return false; const [timestamp, open, high, low, close, volume] = candle.map(Number); const validNumbers = [timestamp, open, high, low, close, volume].every(Number.isFinite); const validOhlc = open > 0 && high > 0 && low > 0 && close > 0 && high >= Math.max(open, close) && low <= Math.min(open, close); const ordered = timestamp > previousTimestamp; previousTimestamp = timestamp; return validNumbers && validOhlc && volume >= 0 && ordered; });
}

export function getSystemHealth() { return { ...apiHealth }; }

async function fetchJson(url, timeoutMs = 6500) {
  const startedAt = Date.now(); apiHealth.requests += 1; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const response = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const payload = await response.json(); if (payload == null || typeof payload !== 'object') throw new Error('invalid_json_payload'); apiHealth.lastLatencyMs = Date.now() - startedAt; apiHealth.lastSuccessAt = Date.now(); apiHealth.lastError = ''; return payload; }
  catch (error) { apiHealth.lastLatencyMs = Date.now() - startedAt; apiHealth.lastError = error?.message || 'request_failed'; throw error; }
  finally { clearTimeout(timer); }
}

function compactSymbol(value) { return String(value || '').replace(/[-_/:]/g, '').toUpperCase(); }

async function loadCatalogVolumes(exchange) {
  const url = EXCHANGES[exchange]?.tickers; if (!url) return new Map(); const cached = tickerCache.get(exchange); if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_MS) return cached.volumes;
  try { const volumes = parseTickerVolumes(exchange, await fetchJson(url, 12000)); tickerCache.set(exchange, { timestamp: Date.now(), volumes }); return volumes; } catch { return new Map(); }
}

async function mapWithConcurrency(items, limit, mapper) { const results = new Array(items.length); let cursor = 0; async function worker() { while (cursor < items.length) { const index = cursor; cursor += 1; results[index] = await mapper(items[index], index); } } await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)); return results; }

function toMarketResult(market, candles, selectedIndicators, timeframe) {
  const currentAnalysis = analyzeCandles(candles, selectedIndicators, timeframe); const closedCandles = currentAnalysis.candleClosed || candles.length < 32 ? candles : candles.slice(0, -1); const confirmed = analyzeCandles(closedCandles, selectedIndicators, timeframe); const analysis = { ...confirmed, price: currentAnalysis.price, change: currentAnalysis.change, candleClosed: currentAnalysis.candleClosed }; const intelligence = enrichMarketIntelligence({ candles, analysis, market, dataSource: 'live', timeframe });
  return { market, ticker: { symbol: market.symbol, base: market.base, quote: market.quote, lastPrice: currentAnalysis.price, priceChangePercent: currentAnalysis.change, quoteVolume: Number(market.quoteVolume || 0) }, candles, analysis: { ...analysis, intelligence }, dataSource: 'live' };
}

async function loadOneMarket(exchange, timeframe, market, selectedIndicators) {
  const cacheKey = `${exchange}|${timeframe}|${market.symbol}`; const cached = candleCache.get(cacheKey); if (cached && Date.now() - cached.timestamp < CANDLE_CACHE_MS) return { result: toMarketResult(market, cached.candles, selectedIndicators, timeframe), live: true, cached: true };
  try { const payload = await fetchJson(candleRequest(exchange, market, timeframe)); const candles = parseCandles(exchange, payload, market); if (!validateCandles(candles)) throw new Error('invalid_candles'); candleCache.set(cacheKey, { timestamp: Date.now(), candles }); return { result: toMarketResult(market, candles, selectedIndicators, timeframe), live: true }; }
  catch (error) { return { result: null, live: false, error: error?.message || 'market_unavailable', market }; }
}

export async function loadCatalog(exchange) {
  const config = EXCHANGES[exchange]; if (!config) return { catalog: [], source: 'unavailable', error: 'exchange_unknown', health: getSystemHealth() }; const cached = catalogCache.get(exchange); if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_MS) return { ...cached.value, health: getSystemHealth() };
  try {
    const payloads = [await fetchJson(config.catalog, 14000)];
    if (exchange === 'bybit') { let cursor = payloads[0].result?.nextPageCursor; let page = 0; while (cursor && page < 5) { const nextPayload = await fetchJson(`${config.catalog}&cursor=${encodeURIComponent(cursor)}`, 14000); payloads.push(nextPayload); cursor = nextPayload.result?.nextPageCursor; page += 1; } }
    const parsedCatalog = payloads.flatMap((item) => parseCatalog(exchange, item)).filter((item) => item.base && item.quote); if (!parsedCatalog.length) throw new Error('empty_catalog'); const volumes = await loadCatalogVolumes(exchange); const catalog = parsedCatalog.map((item) => ({ ...item, quoteVolume: volumes.get(compactSymbol(item.symbol)) || item.quoteVolume || 0 })); const value = { catalog, source: 'live', error: '', health: getSystemHealth() }; catalogCache.set(exchange, { timestamp: Date.now(), value }); return value;
  } catch (error) { apiHealth.lastError = error?.message || 'catalog_unavailable'; return { catalog: [], source: 'unavailable', error: 'catalog_unavailable', health: getSystemHealth() }; }
}

export async function loadMarkets(exchange, timeframe, markets, selectedIndicators, onProgress) {
  const selected = [...new Map(markets.filter((market) => market?.symbol).map((market) => [market.symbol, market])).values()];
  const liveResults = [];
  let completed = 0;
  const batchSize = 96;
  for (let start = 0; start < selected.length; start += batchSize) {
    const batch = selected.slice(start, start + batchSize);
    const results = await mapWithConcurrency(batch, 24, (market) => loadOneMarket(exchange, timeframe, market, selectedIndicators));
    liveResults.push(...results.filter((item) => item.live && item.result));
    completed += batch.length;
    onProgress?.({ markets: liveResults.map((item) => item.result), requested: selected.length, completed, live: liveResults.length, unavailable: completed - liveResults.length });
  }
  const liveCount = liveResults.length;
  const requestedCount = selected.length;
  return {
    markets: liveResults.map((item) => item.result),
    source: liveCount === requestedCount && liveCount > 0 ? 'live' : liveCount > 0 ? 'partial' : 'unavailable',
    error: liveCount === requestedCount && liveCount > 0 ? '' : liveCount > 0 ? 'partial_market_unavailable' : 'market_unavailable',
    exchangeName: exchangeName(exchange),
    health: getSystemHealth(),
    scanStats: { requested: requestedCount, live: liveCount, unavailable: requestedCount - liveCount },
  };
}

export async function loadConfirmation(exchange, market, timeframes, selectedIndicators) {
  const unique = [...new Set(timeframes)].slice(0, 4); const results = await Promise.all(unique.map(async (timeframe) => ({ timeframe, ...(await loadOneMarket(exchange, timeframe, market, selectedIndicators)) }))); const liveResults = results.filter((item) => item.live && item.result);
  return { analyses: Object.fromEntries(liveResults.map(({ timeframe, result }) => [timeframe, { ...result.analysis, candles: result.candles }])), source: liveResults.length === unique.length && unique.length > 0 ? 'live' : liveResults.length ? 'partial' : 'unavailable', timeframes: unique };
}
