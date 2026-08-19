import './api-config.js';
import './github-i18n.js';
import { createStore } from './state.js';
import { loadPreferences, savePreferences } from './storage.js';
import { loadCatalog, loadMarkets, loadConfirmation } from './market-api.js';
import { appendScanHistory, annotateMarkets } from './history.js';
import { evaluateAlerts, mergeAlerts } from './alerts.js';
import { render, bindEvents, applyTranslations } from './ui.js';
import { refreshSignalAges } from './signal-age.js';
import { sparklinePoints, INDICATOR_IDS, GATE_INDICATOR_IDS } from './indicators.js';
import { applyStrategyProfile, tradePlan } from './strategy.js';
import { runBacktest } from './backtest.js';
import { createTickerStream } from './live-stream.js';
import { normalizePosition } from './portfolio.js';
import { startAuth } from './auth-ui.js';
import { DEFAULT_PRESETS } from './terminal-analytics.js';
import { renderEnhancements, bindEnhancementEvents } from './terminal-enhancements.js';
import { bindChartScroll } from './chart-scroll.js';
import { renderSignalMeta } from './signal-meta.js';
import { renderProTerminal, bindProTerminalEvents } from './pro-terminal.js';
import { renderPaperTrading, bindPaperTradingEvents, currentPaperPrices, settlePaperTrades } from './paper-trading.js';
import { renderSignalInsights } from './signal-insights.js';
import { renderLiveDataUi } from './live-data-ui.js';
import { bindSidebar, syncSidebar } from './sidebar.js';

window.indicators = { sparklinePoints };
const root = document.querySelector('#app'); const store = createStore();
let refreshPromise; let activeScanKey = ''; let catalogToken = 0; let scanToken = 0; let confirmationToken = 0; let tickerStream; let tickerTimer = 0; let pendingTickers = {}; let searchTimer = 0; let autoRefreshTimer = 0;
const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;

let persistTimer;
function persistIfNeeded(state) { if (state.status !== 'loading' && state.catalogStatus !== 'loading') { clearTimeout(persistTimer); persistTimer = setTimeout(() => savePreferences(state), 400); } }
function configureAutoRefresh(value) { window.clearInterval(autoRefreshTimer); autoRefreshTimer = 0; const seconds = Number(value); if (seconds > 0) autoRefreshTimer = window.setInterval(() => refresh(), seconds * 1000); }
function applyPreset(id) { const state = store.getState(); const preset = [...DEFAULT_PRESETS, ...(state.presets || [])].find((item) => item.id === id); if (!preset) return; const indicatorSource = state.exchange === 'gate' && preset.indicators.some((item) => String(item).startsWith('gate_')) ? 'gate' : 'core'; store.setState({ strategyProfile: preset.profile, indicatorSource, selectedIndicators: [...preset.indicators], confirmationTimeframes: [...preset.timeframes], signalFilter: 'all', watchlistOnly: false }); refresh(); }
function saveNote(value) { const state = store.getState(); store.setState({ notes: { ...(state.notes || {}), [state.selectedSymbol]: String(value).slice(0, 500) } }); }
function savePreset() { const state = store.getState(); const preset = { id: `custom-${Date.now()}`, name: t('enhancements.customPreset', { time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) }), profile: state.strategyProfile, indicators: [...state.selectedIndicators], timeframes: [...state.confirmationTimeframes] }; store.setState({ presets: [...(state.presets || []).slice(-7), preset] }); }
function setSlippage(value) { store.setState({ backtestSettings: { ...store.getState().backtestSettings, slippagePercent: Math.max(0, Number(value) || 0) } }); }
function setAlertCooldown(value) { store.setState({ alertSettings: { ...store.getState().alertSettings, cooldownMinutes: Math.max(0, Number(value) || 0) } }); }
function updateGuardrails(patch) { store.setState({ riskGuardrails: { ...store.getState().riskGuardrails, ...patch } }); }
async function requestNotifications() { if (!('Notification' in window)) return; try { const permission = await Notification.requestPermission(); store.setState({ notifications: permission }); } catch { store.setState({ notifications: 'denied' }); } }
function notifyAlerts(alerts = []) { const state = store.getState(); if (state.notifications !== 'granted' || !window.Notification || !alerts.length) return; const alert = alerts[alerts.length - 1]; try { new Notification(`${alert.display} · ${t(`signal.${alert.signal}`)}`, { body: t('alerts.notificationBody', { timeframe: alert.timeframe }) }); } catch {} }
function sameSymbol(left, right) { return String(left || '').replace(/[-_/:]/g, '').toUpperCase() === String(right || '').replace(/[-_/:]/g, '').toUpperCase(); }
function preferredMarket(catalog, selectedSymbol) { return catalog.find((item) => item.symbol === selectedSymbol) || catalog.find((item) => sameSymbol(item.symbol, selectedSymbol)) || catalog.find((item) => item.base === 'BTC' && ['USDT', 'USD', 'USDC'].includes(item.quote)) || catalog[0]; }
function scanUniverse(state) { const selected = preferredMarket(state.catalog, state.selectedSymbol); const ordered = state.catalog.slice().sort((left, right) => Number(right.quoteVolume || 0) - Number(left.quoteVolume || 0)); if (!selected) return ordered; return [selected, ...ordered.filter((item) => item.symbol !== selected.symbol)]; }

async function refreshConfirmation(symbol = store.getState().selectedSymbol) {
  const state = store.getState(); const marketResult = state.markets.find((item) => sameSymbol(item.market.symbol, symbol)); const market = marketResult?.market || preferredMarket(state.catalog, symbol); if (!market) return;
  const token = ++confirmationToken; const timeframes = [...new Set([state.timeframe, ...(state.confirmationTimeframes || [])])].slice(0, 4);
  store.setState({ confirmation: { status: 'loading', timeframes, analyses: {}, error: '' } });
  try { const result = await loadConfirmation(state.exchange, market, timeframes, state.selectedIndicators); if (token === confirmationToken) { const analyses = result.analyses || {}; const alignedCount = Object.values(analyses).filter((item) => item.signal === Object.values(analyses)[0]?.signal && item.signal !== 'wait').length; store.setState({ confirmation: { status: 'ready', ...result, alignedCount, error: '' } }); } }
  catch { if (token === confirmationToken) store.setState({ confirmation: { status: 'error', timeframes, analyses: {}, error: 'confirmation_failed' } }); }
}

function startTickerStream() {
  tickerStream?.close(); clearTimeout(tickerTimer); tickerTimer = 0; pendingTickers = {}; const state = store.getState(); const symbols = state.markets.map((item) => item.market.symbol); tickerStream = createTickerStream({ exchange: state.exchange, symbols, onStatus: (status) => store.setState({ streamStatus: status === 'connected' ? 'connected' : status === 'error' ? 'error' : 'off' }), onTicker: (ticker) => { if (!ticker.symbol || store.getState().liveUpdatesPaused) return; pendingTickers[ticker.symbol] = ticker; if (!tickerTimer) tickerTimer = window.setTimeout(() => { const nextTickers = { ...store.getState().tickers, ...pendingTickers }; pendingTickers = {}; tickerTimer = 0; const current = store.getState();
        const paperTrading = settlePaperTrades(current.paperTrading, currentPaperPrices({ ...current, tickers: nextTickers }));
        store.setState({ tickers: nextTickers, paperTrading }); }, 250); } });
  if (state.exchange !== 'binance') store.setState({ streamStatus: 'off' });
}

async function refresh() {
  const state = store.getState();
  if (!state.catalog.length) {
    if (state.catalogStatus !== 'loading') store.setState({ status: 'error', source: 'unavailable', error: state.error || 'market_unavailable' });
    return undefined;
  }
  const scanKey = [state.exchange, state.timeframe, state.selectedSymbol, [...state.selectedIndicators].sort().join(','), state.strategyProfile].join('|'); if (refreshPromise && activeScanKey === scanKey) return refreshPromise;
  const requestToken = ++scanToken; activeScanKey = scanKey; store.setState({ status: 'loading', error: '' });
  const request = loadMarkets(state.exchange, state.timeframe, scanUniverse(state), state.selectedIndicators, (progress) => {
    if (requestToken !== scanToken) return;
    store.setState({ markets: progress.markets, source: progress.live > 0 ? 'partial' : 'unavailable', error: progress.live > 0 ? 'partial_market_unavailable' : 'market_unavailable', scanStats: progress, status: 'loading', updatedAt: progress.live > 0 ? Date.now() : null });
  }).then((result) => {
    if (requestToken !== scanToken) return; const selected = result.markets.some((item) => sameSymbol(item.market.symbol, state.selectedSymbol)) ? state.selectedSymbol : result.markets[0]?.market.symbol; const context = { exchange: state.exchange, timeframe: state.timeframe };
    const historyPack = appendScanHistory(state.history, result.markets, context); const markets = annotateMarkets(result.markets, state.history, context); const newAlerts = evaluateAlerts(historyPack.events, state.alertSettings, state.watchlist);
    const recentAlerts = mergeAlerts(state.recentAlerts, newAlerts, state.alertSettings?.cooldownMinutes); const acceptedAlerts = recentAlerts.filter((item) => !state.recentAlerts.some((old) => old.id === item.id)); notifyAlerts(acceptedAlerts);
    const paperPrices = Object.fromEntries(result.markets.map((item) => [item.market.symbol, Number(item.analysis?.price) || 0]));
    const paperTrading = settlePaperTrades(store.getState().paperTrading, paperPrices);
    store.setState({ ...result, systemHealth: result.health || store.getState().systemHealth, markets, history: historyPack.history, recentAlerts, paperTrading, selectedSymbol: selected, status: 'ready', updatedAt: Date.now() }); startTickerStream(); refreshConfirmation(selected);
  }).catch(() => { if (requestToken === scanToken) store.setState({ status: 'error', error: 'request_failed' }); }).finally(() => { if (refreshPromise === request) { refreshPromise = null; activeScanKey = ''; } });
  refreshPromise = request; return refreshPromise;
}

async function loadExchangeCatalog(exchange) {
  const token = ++catalogToken; scanToken += 1; confirmationToken += 1; refreshPromise = null; activeScanKey = ''; tickerStream?.close();
  const source = exchange === 'gate' ? 'gate' : 'core'; const indicators = source === 'gate' ? GATE_INDICATOR_IDS : INDICATOR_IDS; store.setState({ exchange, indicatorSource: source, selectedIndicators: [...indicators], catalogStatus: 'loading', status: 'loading', markets: [], confirmation: { status: 'idle', timeframes: [], analyses: {}, error: '' }, streamStatus: 'off', scanStats: { requested: 0, completed: 0, live: 0, unavailable: 0 }, error: '' }); const result = await loadCatalog(exchange); if (token !== catalogToken) return;
  const selected = preferredMarket(result.catalog, store.getState().selectedSymbol); store.setState({ catalog: result.catalog, catalogStatus: 'ready', selectedSymbol: selected?.symbol || '', error: result.error, systemHealth: result.health || store.getState().systemHealth }); await refresh();
}
function chooseSymbol(value) { const state = store.getState(); const selected = state.catalog.find((item) => item.symbol.toUpperCase() === value.trim().toUpperCase()) || state.catalog.find((item) => item.display.toUpperCase() === value.trim().toUpperCase()) || state.catalog.find((item) => sameSymbol(item.symbol, value.trim())); if (!selected) return; store.setState({ selectedSymbol: selected.symbol, query: '', signalFilter: 'all', watchlistOnly: false }); refresh(); }
function selectSymbol(symbol) { store.setState({ selectedSymbol: symbol }); refreshConfirmation(symbol); }
function toggleWatch() { const state = store.getState(); const symbol = state.selectedSymbol; const watchlist = state.watchlist.some((item) => sameSymbol(item, symbol)) ? state.watchlist.filter((item) => !sameSymbol(item, symbol)) : [...state.watchlist, symbol]; store.setState({ watchlist }); }
function openPaperTrade(data = {}) {
  const state = store.getState(); const item = state.markets.find((entry) => sameSymbol(entry.market.symbol, state.selectedSymbol)); if (!item || (data.quick && !['buy', 'sell'].includes(item.analysis.signal))) return;
  const ticker = state.tickers?.[item.market.symbol] || state.tickers?.[String(item.market.symbol).replace(/[-_/:]/g, '').toUpperCase()];
  const entry = Number(data.quick ? (ticker?.price || item.analysis.price) : data.entry) || 0;
  const side = data.quick ? (item.analysis.signal === 'sell' ? 'short' : 'long') : data.side === 'short' ? 'short' : 'long';
  const quantity = Number(data.quick ? 1 : data.quantity) || 0; if (entry <= 0 || quantity <= 0) return;
  const plan = data.quick ? tradePlan(item.analysis) : null;
  const trade = { id: `paper-${Date.now()}-${Math.random().toString(16).slice(2)}`, symbol: item.market.symbol, display: item.market.display, side, entry, quantity, stop: Number(data.stop) || Number(plan?.stop) || 0, target: Number(data.target) || Number(plan?.takeProfit) || 0, signal: item.analysis.signal, openedAt: Date.now() };
  store.setState({ paperTrading: { ...(state.paperTrading || {}), open: [...(state.paperTrading?.open || []), trade] } });
}
function closePaperTrade(id) {
  const state = store.getState(); const paper = state.paperTrading || {}; const trade = (paper.open || []).find((item) => item.id === id); if (!trade) return;
  const prices = currentPaperPrices(state); const exit = prices[trade.symbol] || trade.entry; const direction = trade.side === 'short' ? -1 : 1; const pnl = (exit - trade.entry) * trade.quantity * direction;
  const closed = { ...trade, exit, exitPrice: exit, pnl, pnlPercent: trade.entry ? pnl / (trade.entry * trade.quantity) * 100 : 0, closeReason: 'manual', closedAt: Date.now() };
  store.setState({ paperTrading: { ...paper, open: (paper.open || []).filter((item) => item.id !== id), closed: [...(paper.closed || []), closed].slice(-120) } });
}
function matchesFilter(item, state, signalFilter = state.signalFilter) { const ratio = item.analysis.maxScore ? Math.abs(item.analysis.score / item.analysis.maxScore) : 0; const trend = item.analysis.trendConfidence || 50; const volume = item.analysis.volumeRatio || 0; return (signalFilter === 'all' || item.analysis.signal === signalFilter) && (state.strengthFilter !== 'strong' || ratio >= .7) && (state.minScore === 'all' || ratio >= .7) && (state.volumeFilter === 'all' || volume >= Number(state.volumeFilter)) && (state.alignmentFilter === 'all' || trend >= 60); }
function changeSignalFilter(filter) { const nextFilter = ['all', 'buy', 'sell', 'wait'].includes(filter) ? filter : 'all'; const state = store.getState(); const matching = state.markets.filter((item) => matchesFilter(item, state, nextFilter)); store.setState({ signalFilter: nextFilter, watchlistOnly: false, selectedSymbol: matching[0]?.market.symbol || state.selectedSymbol }); if (matching[0]) refreshConfirmation(matching[0].market.symbol); }
function changeAdvancedFilter(key, value) { store.setState({ [key]: value }); }
function changeStrengthFilter(value) { store.setState({ strengthFilter: ['all', 'strong'].includes(value) ? value : 'all' }); }
function toggleWatchlistFilter() { const state = store.getState(); const watchlistOnly = !state.watchlistOnly; const matching = state.markets.filter((item) => !watchlistOnly || state.watchlist.some((symbol) => sameSymbol(symbol, item.market.symbol))); store.setState({ watchlistOnly, selectedSymbol: matching[0]?.market.symbol || state.selectedSymbol }); if (matching[0]) refreshConfirmation(matching[0].market.symbol); }
function changeIndicators(selectedIndicators) { store.setState({ selectedIndicators }); refresh(); }
function changeIndicatorSource(source) { const next = source === 'gate' && store.getState().exchange === 'gate' ? 'gate' : 'core'; store.setState({ indicatorSource: next, selectedIndicators: [...(next === 'gate' ? GATE_INDICATOR_IDS : INDICATOR_IDS)] }); refresh(); }
function changeConfirmationTimeframes(timeframes) { store.setState({ confirmationTimeframes: timeframes }); refreshConfirmation(); }
function updateAlertSettings(patch) {
  const current = store.getState().alertSettings || {};
  const next = { ...current, ...patch };
  if (patch.mode && patch.mode !== current.mode) {
    const defaults = { rsi: 70, volume: 1.25, price: 1, strength: 70, alignment: 2, change: 70, buy: 70, sell: 70, all: 70 };
    next.threshold = defaults[patch.mode] ?? 70;
  }
  store.setState({ alertSettings: next });
}
function clearAlerts() { store.setState({ recentAlerts: [] }); }
function updateRisk(risk) { store.setState({ risk: { ...store.getState().risk, ...risk } }); }
function applyProfile(profileId) { store.setState({ indicatorSource: 'core', ...applyStrategyProfile(profileId, store.getState()) }); refresh(); }
function applyPlanToRisk() { const state = store.getState(); const item = state.markets.find((entry) => sameSymbol(entry.market.symbol, state.selectedSymbol)); if (!item) return; const plan = tradePlan(item.analysis); updateRisk({ entry: plan.entry, stop: plan.stop }); root.querySelector('[data-sidebar-target="toolsSection"]')?.click(); window.setTimeout(() => root.querySelector('#riskPanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }
function runSelectedBacktest(options = {}) { const state = store.getState(); const item = state.markets.find((entry) => sameSymbol(entry.market.symbol, state.selectedSymbol)); if (!item) return; const read = (id, fallback = 0) => Number(root.querySelector(`#${id}`)?.value ?? fallback) || fallback; const costs = { spreadPercent: read('backtestSpread', 0.04), fundingPercent: read('backtestFunding', 0) }; store.setState({ backtest: runBacktest(item.candles, { ...options, ...costs, ...state.backtestSettings, indicators: state.selectedIndicators, timeframe: state.timeframe }) }); }
function addPosition(data) { const state = store.getState(); store.setState({ positions: [...state.positions, normalizePosition({ ...data, symbol: data.symbol || state.selectedSymbol })] }); }
function removePosition(id) { store.setState({ positions: store.getState().positions.filter((position) => position.id !== id) }); }
function exportData(type) { const state = store.getState(); const payload = { markets: state.markets.map(({ market, analysis }) => ({ ...market, signal: analysis.signal, score: analysis.score, maxScore: analysis.maxScore, price: analysis.price, qualityGrade: analysis.intelligence?.quality?.grade || 'D', qualityScore: analysis.intelligence?.quality?.score || 0, dataQualityGrade: analysis.intelligence?.dataQuality?.grade || 'D', dataQualityScore: analysis.intelligence?.dataQuality?.score || 0, dataGaps: analysis.intelligence?.dataQuality?.gaps || 0 })), history: state.history, alerts: state.recentAlerts, paperTrading: state.paperTrading }; const rows = payload.markets; const text = type === 'json' ? JSON.stringify(payload, null, 2) : [Object.keys(rows[0] || {}).join(','), ...rows.map((row) => Object.values(row).map((value) => JSON.stringify(value ?? '')).join(','))].join('\n'); const blob = new Blob([text], { type: type === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `kripto-tarama-${Date.now()}.${type === 'json' ? 'json' : 'csv'}`; anchor.click(); URL.revokeObjectURL(url); }

function syncChartStreamControl(state) { const button = root.querySelector('[data-chart-action="toggle-stream"]'); if (!button) return; const paused = Boolean(state.liveUpdatesPaused); button.textContent = t(paused ? 'chart.resumeStream' : 'chart.pauseStream'); button.setAttribute('aria-pressed', String(paused)); button.classList.toggle('is-active', paused); }

async function boot() {
  await (window.githubI18nReady || Promise.resolve());
  await startAuth({ app: root, onAuthenticated: async () => {
    const preferences = await loadPreferences(); store.setState(preferences); applyTranslations();
    bindSidebar(root);
    bindChartScroll(root);
    bindEvents(root, { getState: () => store.getState(), refresh, toggleWatch, changeSignalFilter, selectSymbol, chooseSymbol, changeIndicators, changeIndicatorSource, changeStrengthFilter, toggleWatchlistFilter, changeConfirmationTimeframes, updateAlertSettings, clearAlerts, updateRisk, changeAdvancedFilter, applyProfile, applyPlanToRisk, runSelectedBacktest, addPosition, removePosition, exportData, openPaperTrade, closePaperTrade, search: (query) => { clearTimeout(searchTimer); searchTimer = window.setTimeout(() => store.setState({ query }), 120); }, changeTimeframe: (timeframe) => { store.setState({ timeframe }); refresh(); }, changeExchange: (exchange) => loadExchangeCatalog(exchange) });
    root.addEventListener('change', (event) => { if (event.target.id === 'alertsLiveOnly') updateAlertSettings({ liveOnly: event.target.checked }); if (event.target.id === 'alertsClosedOnly') updateAlertSettings({ closedOnly: event.target.checked }); if (event.target.id === 'qualitySelect') store.setState({ qualityFilter: ['all', 'aplus', 'a', 'b'].includes(event.target.value) ? event.target.value : 'all' }); if (event.target.id === 'confirmedOnly') store.setState({ confirmedOnly: event.target.checked }); if (event.target.id === 'liveQualityOnly') store.setState({ liveQualityOnly: event.target.checked }); });
    root.addEventListener('click', (event) => { if (event.target.closest('[data-chart-action="toggle-stream"]')) store.setState({ liveUpdatesPaused: !store.getState().liveUpdatesPaused }); });
    bindEnhancementEvents(root, { selectSymbol, applyPreset, saveNote, savePreset, setSlippage, setAlertCooldown, requestNotifications, setAutoRefresh: (value) => { const next = value === 'off' ? 60 : Number(value); store.setState({ autoRefresh: next }); configureAutoRefresh(next); } });
    bindProTerminalEvents(root, { updateGuardrails });
    bindPaperTradingEvents(root, { openPaperTrade, closePaperTrade });
    store.subscribe((state) => { render(root, state); renderSignalMeta(root, state); renderEnhancements(root, state); renderProTerminal(root, state); renderSignalInsights(root, state); renderPaperTrading(root, state); renderLiveDataUi(root, state); syncSidebar(root, state); syncChartStreamControl(state); persistIfNeeded(state); }); render(root, store.getState()); renderSignalMeta(root, store.getState()); renderEnhancements(root, store.getState()); renderProTerminal(root, store.getState()); renderSignalInsights(root, store.getState()); renderPaperTrading(root, store.getState()); renderLiveDataUi(root, store.getState()); syncSidebar(root, store.getState()); syncChartStreamControl(store.getState()); configureAutoRefresh(store.getState().autoRefresh); window.setInterval(() => refreshSignalAges(root, t), 5000); await loadExchangeCatalog(store.getState().exchange);
  } });
}
boot();
