const ALERT_LIMIT = 40;

export const DEFAULT_ALERT_SETTINGS = { enabled: false, mode: 'change', watchedOnly: true, liveOnly: false, closedOnly: true, threshold: 70, cooldownMinutes: 10 };

export function evaluateAlerts(events = [], settings = DEFAULT_ALERT_SETTINGS, watchlist = []) {
  if (!settings.enabled) return [];
  const rawThreshold = Number(settings.threshold) || 70;
  const threshold = settings.mode === 'volume' ? (rawThreshold > 10 ? 1.25 : rawThreshold) : settings.mode === 'price' ? (rawThreshold > 10 ? rawThreshold / 100 : rawThreshold) : rawThreshold;
  const alignmentThreshold = rawThreshold > 10 ? 2 : Math.max(1, Math.round(rawThreshold));
  return events.filter((event) => {
    const normalized = String(event.symbol || '').replace(/[-_/:]/g, '').toUpperCase();
    if (settings.watchedOnly && !watchlist.some((symbol) => String(symbol || '').replace(/[-_/:]/g, '').toUpperCase() === normalized)) return false;
    if (settings.liveOnly && event.dataSource !== 'live') return false;
    if (settings.closedOnly && event.candleClosed === false) return false;
    if (settings.mode === 'change') return event.changeType === 'changed';
    if (settings.mode === 'buy') return event.signal === 'buy' && event.changeType !== 'steady';
    if (settings.mode === 'sell') return event.signal === 'sell' && event.changeType !== 'steady';
    if (settings.mode === 'rsi') return Number(event.rsi) >= threshold || Number(event.rsi) <= 100 - threshold;
    if (settings.mode === 'volume') return Number(event.volumeRatio) >= threshold;
    if (settings.mode === 'price') return Math.abs(Number(event.change)) >= threshold;
    if (settings.mode === 'strength') return Number(event.confidence) >= threshold && event.signal !== 'wait';
    if (settings.mode === 'alignment') return Number(event.alignedCount || 0) >= alignmentThreshold;
    return event.changeType === 'changed' || event.signal === 'buy' || event.signal === 'sell';
  }).map((event) => ({ id: `alert-${event.id}-${settings.mode}`, timestamp: event.timestamp, display: event.display, symbol: event.symbol, exchange: event.exchange, timeframe: event.timeframe, signal: event.signal, previousSignal: event.previousSignal, score: event.score, maxScore: event.maxScore, mode: settings.mode, dataSource: event.dataSource || 'unavailable' })).slice(-ALERT_LIMIT);
}

export function mergeAlerts(existing = [], incoming = [], cooldownMinutes = 10) {
  const seen = new Set(existing.map((item) => item.id));
  const cooldown = Math.max(0, Number(cooldownMinutes) || 0) * 60000;
  const accepted = incoming.filter((item) => {
    if (seen.has(item.id)) return false;
    const recent = existing.find((old) => old.symbol === item.symbol && old.mode === item.mode && Number(item.timestamp) - Number(old.timestamp) < cooldown);
    return !recent;
  });
  return [...existing, ...accepted].slice(-ALERT_LIMIT);
}
