import { freshness, portfolioRisk } from './terminal-analytics.js';

const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&#38;', '<': '&#60;', '>': '&#62;', "'": '&#39;', '"': '&#34;' }[char]));
const num = (value, digits = 1) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(Number(value) || 0);
const normalize = (value) => String(value || '').replace(/[-_/:]/g, '').toUpperCase();
const HORIZONS = ['1h', '4h', '1d'];
let lastKey = '';

function outcomeStats(history = [], horizon) {
  const samples = history.flatMap((entry) => entry.outcomes?.[horizon] ? [{ ...entry, ...entry.outcomes[horizon] }] : []).filter((entry) => ['buy', 'sell'].includes(entry.signal));
  const wins = samples.filter((entry) => entry.win).length;
  return { sample: samples.length, wins, accuracy: samples.length ? Math.round(wins / samples.length * 100) : null, average: samples.length ? samples.reduce((sum, entry) => sum + Number(entry.signed || 0), 0) / samples.length : 0 };
}

function grade(quality = {}) {
  return quality.grade || (Number(quality.score) >= 85 ? 'A+' : Number(quality.score) >= 75 ? 'A' : Number(quality.score) >= 62 ? 'B' : Number(quality.score) >= 48 ? 'C' : 'D');
}

function systemRows(state, freshnessInfo) {
  const health = state.systemHealth || {};
  return [
    [t('pro.healthSource'), state.source === 'live' ? t('pro.live') : state.source === 'partial' ? t('pro.partial') : t('pro.unavailable')],
    [t('pro.healthAge'), freshnessInfo.ageMs === Infinity ? '—' : `${num(freshnessInfo.ageMs / 1000, 0)} ${t('pro.seconds')}`],
    [t('pro.healthApi'), health.lastLatencyMs ? `${num(health.lastLatencyMs, 0)} ms` : '—'],
    [t('pro.healthRequests'), health.requests ? num(health.requests, 0) : '—'],
    [t('pro.healthStream'), state.streamStatus === 'connected' ? t('pro.connected') : t('pro.disconnected')],
  ];
}

export function renderProTerminal(root, state) {
  const mount = root.querySelector('#proInsightsMount');
  if (!mount) return;
  const marketRows = state.markets || [];
  const prices = Object.fromEntries(marketRows.map((item) => [item.market.symbol, item.analysis.price]));
  const risk = portfolioRisk(state.positions || [], prices, state.risk?.balance);
  const limits = state.riskGuardrails || { maxPortfolioRiskPercent: 3, maxDailyLossPercent: 3, maxPositionExposurePercent: 25 };
  const freshnessInfo = freshness(state.updatedAt, state.streamStatus);
  const regimeCounts = marketRows.reduce((map, item) => { const key = item.analysis.intelligence?.regime?.key || 'transition'; map[key] = (map[key] || 0) + 1; return map; }, {});
  const grades = marketRows.reduce((map, item) => { const quality = item.analysis.intelligence?.quality || {}; const key = grade(quality); map[key] = (map[key] || 0) + 1; return map; }, {});
  const selected = marketRows.find((item) => normalize(item.market.symbol) === normalize(state.selectedSymbol));
  const selectedQuality = selected?.analysis?.intelligence?.quality || {};
  const key = [state.updatedAt, state.history.length, state.positions.length, state.streamStatus, state.source, JSON.stringify(regimeCounts), JSON.stringify(grades), JSON.stringify(state.riskGuardrails), state.systemHealth?.lastLatencyMs].join('|');
  if (key === lastKey) return;
  lastKey = key;
  const healthRows = systemRows(state, freshnessInfo).map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  const horizonRows = HORIZONS.map((horizon) => { const stat = outcomeStats(state.history, horizon); return `<div class="pro-outcome-row"><b>${esc(t(`pro.horizon.${horizon}`))}</b><span>${stat.accuracy == null ? '—' : `${stat.accuracy}%`}</span><small>${stat.sample} ${esc(t('pro.samples'))} · ${stat.average >= 0 ? '+' : ''}${num(stat.average, 2)}%</small></div>`; }).join('');
  const regimes = Object.entries(regimeCounts).map(([keyName, count]) => `<span><b>${count}</b>${esc(t(`intelligence.regime.${keyName}`))}</span>`).join('') || `<small>${esc(t('pro.noData'))}</small>`;
  const gradeRows = Object.entries(grades).sort(([a], [b]) => a.localeCompare(b)).map(([keyName, count]) => `<span><b>${esc(keyName)}</b>${count}</span>`).join('') || `<small>${esc(t('pro.noData'))}</small>`;
  const warnings = [];
  const largestExposure = risk.exposure ? Math.max(...risk.rows.map((row) => row.exposure), 0) / risk.exposure * 100 : 0;
  const dailyLoss = state.risk?.balance ? Math.max(0, -risk.pnl) / Number(state.risk.balance) * 100 : 0;
  if (risk.riskPercent > Number(limits.maxPortfolioRiskPercent)) warnings.push(t('pro.warningRisk', { value: num(risk.riskPercent, 2), limit: num(limits.maxPortfolioRiskPercent, 2) }));
  if (dailyLoss > Number(limits.maxDailyLossPercent)) warnings.push(t('pro.warningDailyLoss', { value: num(dailyLoss, 2), limit: num(limits.maxDailyLossPercent, 2) }));
  if (largestExposure > Number(limits.maxPositionExposurePercent)) warnings.push(t('pro.warningExposure', { value: num(largestExposure, 2), limit: num(limits.maxPositionExposurePercent, 2) }));
  if (freshnessInfo.stale) warnings.push(t('pro.warningStale'));
  if (state.source !== 'live') warnings.push(t('pro.warningUnavailable'));
  mount.innerHTML = `<section class="pro-terminal" aria-labelledby="proTerminalTitle"><div class="pro-heading"><div><p class="eyebrow accent">${esc(t('pro.eyebrow'))}</p><h2 id="proTerminalTitle">${esc(t('pro.title'))}</h2><p>${esc(t('pro.copy'))}</p></div><span class="pro-grade grade-${esc(grade(selectedQuality))}">${esc(t('pro.selectedQuality'))}: ${esc(grade(selectedQuality))}</span></div><div class="pro-grid"><article class="pro-card"><div class="section-label"><span>${esc(t('pro.regimeTitle'))}</span><strong>${marketRows.length}</strong></div><div class="pro-chip-list">${regimes}</div><div class="pro-subtitle">${esc(t('pro.qualityTitle'))}</div><div class="pro-chip-list quality-list">${gradeRows}</div></article><article class="pro-card"><div class="section-label"><span>${esc(t('pro.outcomeTitle'))}</span><strong>${esc(t('pro.realized'))}</strong></div><p class="pro-muted">${esc(t('pro.outcomeCopy'))}</p><div class="pro-outcomes">${horizonRows}</div></article><article class="pro-card"><div class="section-label"><span>${esc(t('pro.healthTitle'))}</span><strong class="${freshnessInfo.stale ? 'negative' : 'positive'}">${esc(t(`enhancements.freshness.${freshnessInfo.label}`))}</strong></div><div class="pro-health">${healthRows}</div></article><article class="pro-card"><div class="section-label"><span>${esc(t('pro.guardTitle'))}</span><strong class="${risk.riskPercent > Number(limits.maxPortfolioRiskPercent) ? 'negative' : 'positive'}">${num(risk.riskPercent, 2)}%</strong></div><div class="pro-guard-fields"><label>${esc(t('pro.maxRisk'))}<input type="number" min="0" step="0.1" data-pro-guard="maxPortfolioRiskPercent" value="${esc(limits.maxPortfolioRiskPercent)}"></label><label>${esc(t('pro.maxDailyLoss'))}<input type="number" min="0" step="0.1" data-pro-guard="maxDailyLossPercent" value="${esc(limits.maxDailyLossPercent)}"></label><label>${esc(t('pro.maxExposure'))}<input type="number" min="0" step="1" data-pro-guard="maxPositionExposurePercent" value="${esc(limits.maxPositionExposurePercent)}"></label></div><small class="pro-muted">${esc(warnings.join(' · ') || t('pro.guardOk'))}</small></article></div></section>`;
}

export function bindProTerminalEvents(root, actions) {
  root.addEventListener('change', (event) => {
    const input = event.target.closest('[data-pro-guard]');
    if (!input) return;
    actions.updateGuardrails({ [input.dataset.proGuard]: Math.max(0, Number(input.value) || 0) });
  });
}
