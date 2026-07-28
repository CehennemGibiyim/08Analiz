const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&#38;', '<': '&#60;', '>': '&#62;', "'": '&#39;', '"': '&#34;' }[char]));
}

function normalize(value) {
  return String(value || '').replace(/[-_/:]/g, '').toUpperCase();
}

function confidence(analysis = {}) {
  const buy = Number.isFinite(Number(analysis.buyRatio)) ? Number(analysis.buyRatio) : 50;
  const sell = Number.isFinite(Number(analysis.sellRatio)) ? Number(analysis.sellRatio) : 100 - buy;
  if (analysis.signal === 'sell') return Math.round(sell);
  if (analysis.signal === 'buy') return Math.round(buy);
  return Math.round(Math.max(buy, sell));
}

function clock(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return new Date(value).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function signalTimestamp(state, market) {
  const entries = state.history || [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.exchange === state.exchange && entry.timeframe === state.timeframe && normalize(entry.symbol) === normalize(market.symbol)) return entry.timestamp;
  }
  return state.updatedAt;
}

function metaMarkup(analysis, timestamp, detail = false) {
  const time = clock(timestamp);
  const quality = analysis.intelligence?.quality?.grade || '—';
  const label = `${t('signal.confidence')} ${confidence(analysis)}% · ${t('signal.quality')} ${quality} · ${t('signal.timeLabel', { time })}`;
  return `<small class="${detail ? 'detail-signal-meta' : 'signal-confidence signal-meta'}" data-signal-meta title="${esc(label)}">${esc(label)}</small>`;
}

export function renderSignalMeta(root, state) {
  if (!root) return;
  const rows = root.querySelectorAll('.market-row[data-symbol]');
  rows.forEach((row) => {
    const symbol = row.dataset.symbol;
    const item = (state.markets || []).find((entry) => normalize(entry.market.symbol) === normalize(symbol));
    const signal = row.querySelector('.signal');
    if (!item || !signal) return;
    const host = row.querySelector('.signal-stack') || signal.parentElement;
    if (!host) return;
    host.querySelector('[data-signal-meta]')?.remove();
    host.insertAdjacentHTML('beforeend', metaMarkup(item.analysis, signalTimestamp(state, item.market)));
  });

  const detailSignal = root.querySelector('#detailSignal');
  const detailRatio = root.querySelector('#detailSignalRatio');
  const selected = (state.markets || []).find((entry) => normalize(entry.market.symbol) === normalize(state.selectedSymbol));
  const candleStatus = root.querySelector('#detailCandleStatus');
  if (candleStatus) {
    const closed = Boolean(selected?.analysis?.candleClosed);
    candleStatus.textContent = selected ? t(closed ? 'detail.candleClosed' : 'detail.candleOpen') : '—';
    candleStatus.className = `candle-status ${selected ? (closed ? 'is-closed' : 'is-open') : ''}`;
  }
  if (detailRatio) {
    if (!selected) detailRatio.textContent = '—';
    else {
      const quality = selected.analysis.intelligence?.quality?.grade || '—';
      const label = `${t('signal.confidence')} ${confidence(selected.analysis)}% · ${t('signal.quality')} ${quality} · ${t('signal.timeLabel', { time: clock(signalTimestamp(state, selected.market)) })}`;
      detailRatio.textContent = label;
      detailRatio.title = label;
    }
  }
  if (detailSignal?.parentElement) {
    detailSignal.parentElement.querySelector('[data-signal-meta]')?.remove();
    if (selected) detailSignal.insertAdjacentHTML('afterend', metaMarkup(selected.analysis, signalTimestamp(state, selected.market), true));
  }
}
