const TIMEFRAME_MS = Object.freeze({
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
});

function safeTimestamp(timestamp, now) {
  const value = Number(timestamp);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.max(value, 0), now) : 0;
}

function formatSignalClock(timestamp, now = Date.now()) {
  const safe = safeTimestamp(timestamp, now);
  if (!safe) return '—';
  return new Date(safe).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatSignalAge(timestamp, t, now = Date.now()) {
  const safe = safeTimestamp(timestamp, now);
  if (!safe) return t('signal.ageUnknown');
  const elapsed = Math.max(0, now - safe);
  if (elapsed < 10 * 1000) return t('signal.ageNow');
  if (elapsed < 60 * 1000) return t('signal.ageSeconds', { count: Math.max(1, Math.floor(elapsed / 1000)) });
  if (elapsed < 60 * 60 * 1000) return t('signal.ageMinutes', { count: Math.floor(elapsed / (60 * 1000)) });
  if (elapsed < 24 * 60 * 60 * 1000) return t('signal.ageHours', { count: Math.floor(elapsed / (60 * 60 * 1000)) });
  return t('signal.ageDays', { count: Math.floor(elapsed / (24 * 60 * 60 * 1000)) });
}

export function signalFreshness(timestamp, timeframe, now = Date.now()) {
  const safe = safeTimestamp(timestamp, now);
  if (!safe) return 'unknown';
  const elapsed = Math.max(0, now - safe);
  const interval = TIMEFRAME_MS[timeframe] || TIMEFRAME_MS['1h'];
  const currentWindow = Math.max(30 * 1000, Math.min(interval * 0.25, 15 * 60 * 1000));
  if (elapsed <= currentWindow) return 'current';
  if (elapsed <= interval) return 'aging';
  return 'stale';
}

function freshnessLabel(status, t) {
  const key = { current: 'signal.freshnessCurrent', aging: 'signal.freshnessAging', stale: 'signal.freshnessStale' }[status] || 'signal.freshnessUnknown';
  return t(key);
}

export function signalAgeMarkup({ timestamp, timeframe = '1h', live = false, t }) {
  if (!timestamp || typeof t !== 'function') return '';
  const age = formatSignalAge(timestamp, t);
  const status = signalFreshness(timestamp, timeframe);
  const time = formatSignalClock(timestamp);
  const label = `${t('signal.timeLabel', { time })} · ${t('signal.ageLabel', { age })} · ${freshnessLabel(status, t)}${live ? ` · ${t('signal.livePrice')}` : ''}`;
  return `<small class="signal-age signal-age-${status}" data-signal-age data-signal-timestamp="${Number(timestamp)}" data-signal-timeframe="${String(timeframe)}" data-signal-live="${live ? 'true' : 'false'}" title="${label}">${label}</small>`;
}

export function refreshSignalAges(root, t, now = Date.now()) {
  if (!root || typeof t !== 'function') return;
  root.querySelectorAll('[data-signal-age]').forEach((element) => {
    const timestamp = Number(element.dataset.signalTimestamp);
    const timeframe = element.dataset.signalTimeframe || '1h';
    const live = element.dataset.signalLive === 'true';
    const age = formatSignalAge(timestamp, t, now);
    const status = signalFreshness(timestamp, timeframe, now);
    const time = formatSignalClock(timestamp, now);
    const label = `${t('signal.timeLabel', { time })} · ${t('signal.ageLabel', { age })} · ${freshnessLabel(status, t)}${live ? ` · ${t('signal.livePrice')}` : ''}`;
    element.className = `signal-age signal-age-${status}`;
    element.textContent = label;
    element.title = label;
  });
}
