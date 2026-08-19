import { INDICATOR_IDS } from './indicators.js';
import { DEFAULT_ALERT_SETTINGS } from './alerts.js';

export const DEFAULT_STATE = {
  exchange: 'binance',
  timeframe: '1h',
  signalFilter: 'all',
  strengthFilter: 'all',
  qualityFilter: 'all',
  confirmedOnly: false,
  liveQualityOnly: false,
  volumeFilter: 'all',
  alignmentFilter: 'all',
  minScore: 'all',
  strategyProfile: 'balanced',
  watchlistOnly: false,
  query: '',
  selectedSymbol: 'BTCUSDT',
  indicatorSource: 'core',
  selectedIndicators: [...INDICATOR_IDS],
  confirmationTimeframes: ['1h', '4h', '1d'],
  watchlist: ['BTCUSDT', 'ETHUSDT'],
  catalog: [],
  catalogStatus: 'idle',
  markets: [],
  status: 'idle',
  source: 'unavailable',
  error: '',
  updatedAt: null,
  history: [],
  recentAlerts: [],
  alertSettings: { ...DEFAULT_ALERT_SETTINGS },
  confirmation: { status: 'idle', timeframes: [], analyses: {}, error: '' },
  risk: { balance: 1000, riskPercent: 1, entry: 0, stop: 0, feePercent: 0.1 },
  tickers: {},
  streamStatus: 'off',
  liveUpdatesPaused: false,
  positions: [],
  paperTrading: { balance: 1000, open: [], closed: [] },
  backtest: null,
  presets: [],
  notes: {},
  autoRefresh: 'off',
  notifications: 'default',
  backtestSettings: { slippagePercent: 0.05 },
  riskGuardrails: { maxPortfolioRiskPercent: 3, maxDailyLossPercent: 3, maxPositionExposurePercent: 25 },
  systemHealth: { requests: 0, lastLatencyMs: 0, lastSuccessAt: 0, lastError: '' },
  scanStats: { requested: 0, completed: 0, live: 0, unavailable: 0 },
};

export function createStore(initial = {}) {
  let state = {
    ...DEFAULT_STATE,
    ...initial,
    alertSettings: { ...DEFAULT_STATE.alertSettings, ...(initial.alertSettings || {}) },
    confirmation: { ...DEFAULT_STATE.confirmation, ...(initial.confirmation || {}) },
    risk: { ...DEFAULT_STATE.risk, ...(initial.risk || {}) },
    backtestSettings: { ...DEFAULT_STATE.backtestSettings, ...(initial.backtestSettings || {}) },
    riskGuardrails: { ...DEFAULT_STATE.riskGuardrails, ...(initial.riskGuardrails || {}) },
    systemHealth: { ...DEFAULT_STATE.systemHealth, ...(initial.systemHealth || {}) },
    paperTrading: { ...DEFAULT_STATE.paperTrading, ...(initial.paperTrading || {}), open: Array.isArray(initial.paperTrading?.open) ? initial.paperTrading.open : [], closed: Array.isArray(initial.paperTrading?.closed) ? initial.paperTrading.closed : [] },
  };
  const listeners = new Set();
  return {
    getState() { return state; },
    setState(patch) { state = { ...state, ...patch }; listeners.forEach((listener) => listener(state)); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
