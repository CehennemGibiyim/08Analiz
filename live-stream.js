function normalizeSymbol(symbol) { return String(symbol || '').replace(/[-_/:]/g, '').toLowerCase(); }
export function createTickerStream({ exchange, symbols = [], onTicker, onStatus } = {}) {
  if (exchange !== 'binance' || !symbols.length || !window.WebSocket) return { close() {} };
  const streams = symbols.slice(0, 24).map((symbol) => `${normalizeSymbol(symbol)}@ticker`).join('/');
  let socket;
  try { socket = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`); } catch { onStatus?.('error'); return { close() {} }; }
  socket.addEventListener('open', () => onStatus?.('connected')); socket.addEventListener('close', () => onStatus?.('closed')); socket.addEventListener('error', () => onStatus?.('error')); socket.addEventListener('message', (event) => { try { const payload = JSON.parse(event.data); const data = payload.data || payload; const ticker = { symbol: String(data.s || '').toUpperCase(), price: Number(data.c), change: Number(data.P), eventTime: Number(data.E) }; if (ticker.symbol && Number.isFinite(ticker.price)) onTicker?.(ticker); } catch { /* malformed stream message */ } });
  return { close() { try { socket.close(); } catch { /* already closed */ } } };
}
