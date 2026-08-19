import { calibratedConfidence, confirmationSummary, dataQuality, hasConfirmationConflict } from './signal-quality.js';

const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;
const esc = (value) => String(value ?? '').replace(/[&<>'\"]/g, (char) => ({ '&': '&#38;', '<': '&#60;', '>': '&#62;', "'": '&#39;', '\"': '&#34;' }[char]));
const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const normalize = (value) => String(value || '').replace(/[-_/:]/g, '').toUpperCase();

function selectedItem(state) { return (state.markets || []).find((item) => normalize(item.market.symbol) === normalize(state.selectedSymbol)); }
function recentEntries(state) { return (state.history || []).filter((entry) => entry.exchange === state.exchange && entry.timeframe === state.timeframe && normalize(entry.symbol) === normalize(state.selectedSymbol)).slice(-8); }

export function stabilityScore(entries = []) {
  if (!entries.length) return { score: 0, streak: 0, changes: 0, direction: 'wait' };
  const direction = entries.at(-1)?.signal || 'wait'; const streakIndex = [...entries].reverse().findIndex((entry) => entry.signal !== direction); const stableCount = streakIndex < 0 ? entries.length : streakIndex;
  const changes = entries.slice(1).filter((entry, index) => entry.signal !== entries[index].signal).length;
  return { score: clamp(45 + stableCount / Math.max(entries.length, 1) * 45 - changes * 8), streak: Math.max(1, stableCount), changes, direction };
}

function calibration(history, horizon, state) {
  const scoped = (history || []).filter((entry) => entry.exchange === state.exchange && entry.timeframe === state.timeframe && normalize(entry.symbol) === normalize(state.selectedSymbol));
  const samples = scoped.flatMap((entry) => entry.outcomes?.[horizon] && ['buy', 'sell'].includes(entry.signal) ? [entry.outcomes[horizon]] : []);
  const wins = samples.filter((item) => item.win).length;
  return { sample: samples.length, accuracy: samples.length ? clamp(wins / samples.length * 100) : null };
}

function sourceLabel(value) { return value === 'live' ? t('insights.live') : value === 'partial' ? t('insights.partial') : t('insights.unavailable'); }
function dataAgeLabel(quality) { return quality.ageMinutes == null ? '—' : `${quality.ageMinutes} ${t('insights.minutes')}`; }

export function renderSignalInsights(root, state) {
  const mount = root.querySelector('#signalInsightsMount'); if (!mount) return;
  const item = selectedItem(state); const entries = recentEntries(state); const stability = stabilityScore(entries); const technical = Number(item?.analysis?.technicalConfidence) || 0;
  const horizons = ['1h', '4h', '1d']; const stats = Object.fromEntries(horizons.map((horizon) => [horizon, calibration(state.history, horizon, state)])); const best = stats['1h'].sample ? stats['1h'] : stats['4h'].sample ? stats['4h'] : stats['1d']; const calibratedValue = calibratedConfidence(technical, best);
  const qualityInfo = dataQuality(item || {}); const confirmation = confirmationSummary(state.confirmation); const conflict = hasConfirmationConflict(state.confirmation); const safetyMessage = conflict ? t('insights.conflictWarning') : qualityInfo.stale ? t('insights.staleWarning') : item?.analysis?.candleClosed ? t('insights.confirmed') : t('insights.openCandle');
  mount.innerHTML = `<section class="signal-insights panel" aria-labelledby="signalInsightsTitle"><div class="insights-heading"><div><p class="eyebrow accent">${esc(t('insights.eyebrow'))}</p><h2 id="signalInsightsTitle">${esc(t('insights.title'))}</h2><p>${esc(t('insights.copy'))}</p></div><span class="stability-badge">${esc(t('insights.stability'))}: ${stability.score}%</span></div><div class="insights-grid"><article><div class="section-label"><span>${esc(t('insights.stability'))}</span><strong>${stability.score}%</strong></div><div class="insight-metric"><b>${esc(t(`signal.${stability.direction}`))}</b><span>${esc(t('insights.streak', { count: stability.streak }))}</span><span>${esc(t('insights.changes', { count: stability.changes }))}</span></div></article><article><div class="section-label"><span>${esc(t('insights.calibrated'))}</span><strong>${calibratedValue}%</strong></div><p class="insight-note">${esc(t('insights.calibratedCopy'))}</p><div class="insight-metric"><span>${esc(t('insights.technical'))}: ${technical}%</span><span>${esc(t('insights.sample'))}: ${best.sample}</span></div></article><article><div class="section-label"><span>${esc(t('insights.horizons'))}</span><strong>${esc(t('insights.accuracy'))}</strong></div><div class="horizon-grid">${horizons.map((horizon) => `<span><b>${esc(t(`pro.horizon.${horizon}`))}</b><strong>${stats[horizon].accuracy == null ? '—' : `${stats[horizon].accuracy}%`}</strong><small>${stats[horizon].sample} ${esc(t('pro.samples'))}</small></span>`).join('')}</div></article><article class="quality-insight-card"><div class="section-label"><span>${esc(t('insights.dataQuality'))}</span><strong class="grade-${esc(qualityInfo.grade)}">${esc(qualityInfo.grade)}</strong></div><div class="insight-metric"><span>${esc(t('insights.qualityScore'))}: ${qualityInfo.score}/100</span><span>${esc(t('insights.source'))}: ${esc(sourceLabel(qualityInfo.source))}</span><span>${esc(t('insights.dataAge'))}: ${esc(dataAgeLabel(qualityInfo))}</span><span>${esc(t('insights.gaps'))}: ${qualityInfo.gaps}</span></div></article><article class="quality-insight-card"><div class="section-label"><span>${esc(t('insights.multiTimeframe'))}</span><strong class="${conflict ? 'negative' : 'positive'}">${conflict ? esc(t('insights.conflict')) : esc(t('insights.aligned'))}</strong></div><div class="insight-metric"><span>${esc(t('signal.buy'))}: ${confirmation.buy} · ${esc(t('signal.sell'))}: ${confirmation.sell}</span><span>${esc(t('signal.wait'))}: ${confirmation.wait}</span><span>${esc(safetyMessage)}</span></div></article></div></section>`;
}
