import { exchangeName } from './exchanges.js';

const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;

function statusClass(source) {
  if (source === 'live') return 'status-live';
  if (source === 'partial') return 'status-partial';
  return 'status-unavailable';
}

function statusKey(state) {
  if (state.status === 'loading' || state.catalogStatus === 'loading') return 'status.scanning';
  if (state.source === 'live') return 'status.live';
  if (state.source === 'partial') return 'status.partial';
  return 'status.unavailable';
}

function selectedItem(state) {
  return (state.markets || []).find((item) => String(item.market.symbol) === String(state.selectedSymbol)) || state.markets?.[0];
}

export function renderLiveDataUi(root, state) {
  const status = root.querySelector('#dataStatus');
  const notice = root.querySelector('#dataNotice');
  const provenance = root.querySelector('#analysisProvenance');
  const exchange = exchangeName(state.exchange);
  const busy = state.status === 'loading' || state.catalogStatus === 'loading';
  const source = busy ? 'loading' : state.source;
  const progress = state.scanStats;
  const statusText = busy && progress?.requested ? t('status.scanningProgress', { live: Number(progress.live || 0).toLocaleString('tr-TR'), completed: Number(progress.completed || 0).toLocaleString('tr-TR') }) : t(statusKey(state));
  if (status) {
    status.textContent = statusText;
    status.className = `status-pill ${source === 'loading' ? 'status-loading' : statusClass(source)}`;
  }
  if (notice) {
    notice.hidden = busy || state.source === 'live';
    notice.textContent = state.source === 'partial' ? t('status.partialNotice') : t('status.noLiveData');
  }
  const profile = state.indicatorSource === 'gate' ? t('detail.gateIndicatorProfile', { count: state.selectedIndicators?.length || 0 }) : t('detail.coreIndicatorProfile');
  if (provenance) provenance.textContent = t('detail.provenanceWithProfile', { exchange, profile });
  const timingStatus = root.querySelector('#timingEngineStatus');
  if (timingStatus) {
    const analysis = selectedItem(state)?.analysis;
    const key = analysis?.timingBlocked ? 'timing.blocked' : analysis?.technicalSignal === 'buy' ? 'timing.monitoring' : 'timing.engineActive';
    timingStatus.textContent = t(key);
  }
}
