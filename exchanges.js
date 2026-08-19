const INTERVALS = {
  '5m': { binance: '5m', bybit: '5', okx: '5m', kucoin: '5min', gate: '5m', bitget: '5m', kraken: 5 },
  '15m': { binance: '15m', bybit: '15', okx: '15m', kucoin: '15min', gate: '15m', bitget: '15m', kraken: 15 },
  '30m': { binance: '30m', bybit: '30', okx: '30m', kucoin: '30min', gate: '30m', bitget: '30m', kraken: 30 },
  '1h': { binance: '1h', bybit: '60', okx: '1H', kucoin: '1hour', gate: '1h', bitget: '1H', kraken: 60 },
  '2h': { binance: '2h', bybit: '120', okx: '2H', kucoin: '2hour', gate: '2h', bitget: '2H', kraken: 120 },
  '4h': { binance: '4h', bybit: '240', okx: '4H', kucoin: '4hour', gate: '4h', bitget: '4H', kraken: 240 },
  '6h': { binance: '6h', bybit: '360', okx: '6H', kucoin: '6hour', gate: '6h', bitget: '6H', kraken: 360 },
  '12h': { binance: '12h', bybit: '720', okx: '12H', kucoin: '12hour', gate: '12h', bitget: '12H', kraken: 720 },
  '1d': { binance: '1d', bybit: 'D', okx: '1D', kucoin: '1day', gate: '1d', bitget: '1D', kraken: 1440 },
  '1w': { binance: '1w', bybit: 'W', okx: '1W', kucoin: '1week', gate: '7d', bitget: '1W', kraken: 10080 },
  '1M': { binance: '1M', bybit: 'M', okx: '1M', kucoin: '1month', gate: '30d', bitget: '1M', kraken: 21600 },
};
const CANDLE_LIMIT = 300;

export const EXCHANGES = {
  binance: { name: 'Binance', region: 'Global', catalog: 'https://api.binance.com/api/v3/exchangeInfo', tickers: 'https://api.binance.com/api/v3/ticker/24hr' },
  bybit: { name: 'Bybit', region: 'Global', catalog: 'https://api.bybit.com/v5/market/instruments-info?category=spot&limit=1000', tickers: 'https://api.bybit.com/v5/market/tickers?category=spot' },
  okx: { name: 'OKX', region: 'Global', catalog: 'https://www.okx.com/api/v5/public/instruments?instType=SPOT', tickers: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT' },
  kucoin: { name: 'KuCoin', region: 'Global', catalog: 'https://api.kucoin.com/api/v2/symbols', tickers: 'https://api.kucoin.com/api/v1/market/allTickers' },
  gate: { name: 'Gate.io', region: 'Global', catalog: 'https://api.gateio.ws/api/v4/spot/currency_pairs', tickers: 'https://api.gateio.ws/api/v4/spot/tickers' },
  bitget: { name: 'Bitget', region: 'Global', catalog: 'https://api.bitget.com/api/v2/spot/public/symbols', tickers: 'https://api.bitget.com/api/v2/spot/market/tickers' },
  kraken: { name: 'Kraken', region: 'Global', catalog: 'https://api.kraken.com/0/public/AssetPairs', tickers: '' },
};

export const exchangeKeys = Object.keys(EXCHANGES);

export function intervalFor(exchange, timeframe) {
  return INTERVALS[timeframe]?.[exchange] || INTERVALS['1h'].binance;
}

export function exchangeName(exchange) {
  return EXCHANGES[exchange]?.name || exchange;
}

export function normalizeSymbol(raw, exchange) {
  const value = String(raw || '').toUpperCase().replace(/[-_/:]/g, '');
  const quote = ['USDT', 'USDC', 'USD', 'EUR', 'TRY', 'BTC', 'ETH'].find((item) => value.endsWith(item));
  const base = quote ? value.slice(0, -quote.length) : value;
  const symbol = exchange === 'okx' ? `${base}-${quote || 'USDT'}`
    : exchange === 'kraken' ? raw
      : `${base}${quote || 'USDT'}`;
  return { symbol, base, quote: quote || 'USDT', display: `${base}/${quote || 'USDT'}` };
}

function commonMarket(item, exchange, symbol, base, quote, quoteVolume = 0) {
  return { id: `${exchange}:${symbol}`, symbol, exchange, base, quote, display: `${base}/${quote}`, quoteVolume: Number(quoteVolume) || 0, raw: item };
}

function compactSymbol(value) { return String(value || '').replace(/[-_/:]/g, '').toUpperCase(); }

export function parseTickerVolumes(exchange, payload) {
  const rows = exchange === 'binance' ? payload
    : exchange === 'bybit' ? payload.result?.list
      : exchange === 'okx' ? payload.data
        : exchange === 'kucoin' ? payload.data?.ticker
          : exchange === 'gate' || exchange === 'bitget' ? payload.data || payload
            : [];
  if (!Array.isArray(rows)) return new Map();
  const volumes = new Map();
  rows.forEach((item) => {
    const symbol = item.symbol || item.instId || item.currency_pair;
    const volume = item.quoteVolume ?? item.quote_volume ?? item.turnover24h ?? item.volCcy24h ?? item.volValue;
    const numericVolume = Number(volume);
    if (symbol && Number.isFinite(numericVolume) && numericVolume >= 0) volumes.set(compactSymbol(symbol), numericVolume);
  });
  return volumes;
}

export function parseCatalog(exchange, payload) {
  if (exchange === 'binance') {
    return (payload.symbols || []).filter((item) => item.status === 'TRADING' && item.isSpotTradingAllowed !== false)
      .map((item) => commonMarket(item, exchange, item.symbol, item.baseAsset, item.quoteAsset));
  }
  if (exchange === 'bybit') {
    return (payload.result?.list || []).filter((item) => item.status === 'Trading')
      .map((item) => commonMarket(item, exchange, item.symbol, item.baseCoin, item.quoteCoin));
  }
  if (exchange === 'okx') {
    return (payload.data || []).filter((item) => item.state === 'live')
      .map((item) => commonMarket(item, exchange, item.instId, item.baseCcy, item.quoteCcy));
  }
  if (exchange === 'kucoin') {
    return (payload.data || []).filter((item) => item.enableTrading !== false)
      .map((item) => commonMarket(item, exchange, item.symbol, item.baseCurrency, item.quoteCurrency));
  }
  if (exchange === 'gate') {
    return (payload || []).filter((item) => item.trade_status !== 'untradable')
      .map((item) => commonMarket(item, exchange, item.id, item.base, item.quote));
  }
  if (exchange === 'bitget') {
    return (payload.data || []).filter((item) => item.status === 'online')
      .map((item) => commonMarket(item, exchange, item.symbol, item.baseCoin, item.quoteCoin));
  }
  if (exchange === 'kraken') {
    return Object.entries(payload.result || {}).filter(([key, item]) => item.altname && item.wsname && item.quote)
      .map(([key, item]) => {
        const base = item.base === 'XXBT' ? 'BTC' : item.base.replace(/^X/, '');
        const quote = ({ ZUSD: 'USD', ZEUR: 'EUR', ZGBP: 'GBP' }[item.quote] || item.quote.replace(/^Z/, ''));
        return commonMarket(item, exchange, key, base, quote);
      });
  }
  return [];
}

export function candleRequest(exchange, market, timeframe) {
  const interval = intervalFor(exchange, timeframe);
  const base = encodeURIComponent(market.symbol);
  const urls = {
    binance: `https://api.binance.com/api/v3/klines?symbol=${base}&interval=${interval}&limit=${CANDLE_LIMIT}`,
    bybit: `https://api.bybit.com/v5/market/kline?category=spot&symbol=${base}&interval=${interval}&limit=${CANDLE_LIMIT}`,
    okx: `https://www.okx.com/api/v5/market/candles?instId=${base}&bar=${interval}&limit=${CANDLE_LIMIT}`,
    kucoin: `https://api.kucoin.com/api/v1/market/candles?type=${interval}&symbol=${base}&limit=${CANDLE_LIMIT}`,
    gate: `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${base}&interval=${interval}&limit=${CANDLE_LIMIT}`,
    bitget: `https://api.bitget.com/api/v2/spot/market/candles?symbol=${base}&granularity=${interval}&limit=${CANDLE_LIMIT}`,
    kraken: `https://api.kraken.com/0/public/OHLC?pair=${base}&interval=${interval}`,
  };
  return urls[exchange];
}

export function parseCandles(exchange, payload, market) {
  let rows = exchange === 'binance' ? payload
    : exchange === 'bybit' ? payload.result?.list
      : exchange === 'okx' || exchange === 'bitget' ? payload.data
        : exchange === 'kucoin' || exchange === 'gate' ? payload.data || payload
          : Object.values(payload.result || {}).find((value) => Array.isArray(value));
  if (!Array.isArray(rows)) return [];
  const candles = rows.map((row) => {
    if (exchange === 'binance') return [Number(row[0]), Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4]), Number(row[5])];
    if (exchange === 'bybit') return [Number(row[0]), Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4]), Number(row[5])];
    if (exchange === 'okx' || exchange === 'bitget') return [Number(row[0]), Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4]), Number(row[5] || 0)];
    if (exchange === 'kucoin') return [Number(row[0]) * 1000, Number(row[1]), Number(row[3]), Number(row[4]), Number(row[2]), Number(row[5] || 0)];
    if (exchange === 'gate') return [Number(row[0]) * 1000, Number(row[5]), Number(row[3]), Number(row[4]), Number(row[2]), Number(row[1] || 0)];
    return [Number(row[0]) * 1000, Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4]), Number(row[6] || row[5] || 0)];
  }).filter((row) => {
    const [timestamp, open, high, low, close, volume] = row;
    return row.every(Number.isFinite) && timestamp > 0 && open > 0 && high > 0 && low > 0 && close > 0 && volume >= 0 && high >= Math.max(open, close) && low <= Math.min(open, close) && high >= low;
  });
  return candles.sort((a, b) => a[0] - b[0]).slice(-CANDLE_LIMIT);
}

