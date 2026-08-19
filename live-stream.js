function normalizeSymbol(symbol) { return String(symbol || '').replace(/[-_/:]/g, '').toLowerCase(); }

function handleTickerPayload(payload, onTicker) {
  const rows = Array.isArray(payload) ? payload : [payload?.data || payload];
  rows.forEach((data) => {
    const ticker = { symbol: String(data?.s || '').toUpperCase(), price: Number(data?.c), change: Number(data?.P), eventTime: Number(data?.E) };
    if (ticker.symbol && Number.isFinite(ticker.price)) onTicker?.(ticker);
  });
}

export function createTickerStream({ exchange, symbols = [], onTicker, onStatus } = {}) {
  if (exchange !== 'binance' || !symbols.length || !window.WebSocket) return { close() {} };
  const useAllMarketStream = symbols.length > 24;
  const streams = useAllMarketStream ? '!ticker@arr' : symbols.map((symbol) => `${normalizeSymbol(symbol)}@ticker`).join('/');
  const endpoint = useAllMarketStream ? `wss://stream.binance.com:9443/ws/${streams}` : `wss://stream.binance.com:9443/stream?streams=${streams}`;
  let socket;
  try { socket = new WebSocket(endpoint); } catch { onStatus?.('error'); return { close() {} }; }
  socket.addEventListener('open', () => onStatus?.('connected'));
  socket.addEventListener('close', () => onStatus?.('closed'));
  socket.addEventListener('error', () => onStatus?.('error'));
  socket.addEventListener('message', (event) => { try { handleTickerPayload(JSON.parse(event.data), onTicker); } catch { /* malformed stream message */ } });
  return { close() { try { socket.close(); } catch { /* already closed */ } } };
}
