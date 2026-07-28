import { INDICATOR_IDS } from './indicators.js';
import { DEFAULT_ALERT_SETTINGS } from './alerts.js';

const STORAGE_KEY = 'signal-terminal-preferences-v4';
const LEGACY_STORAGE_KEYS = ['signal-terminal-preferences-v3', 'signal-terminal-preferences-v2'];
const DB_NAME = '08-analiz-github-storage';
const DB_VERSION = 1;
const STORE_NAME = 'values';
const memoryStore = new Map();
let databasePromise;

function storageKey(key, options = {}) { return `${options.area || 'persistent'}:${key}`; }

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (!window.indexedDB) return Promise.resolve(null);
  databasePromise = new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return databasePromise;
}

export async function getStoredItem(key, options = {}) {
  const runtime = window.miniappsAI?.storage;
  if (runtime?.getItem) return runtime.getItem(key, options);
  const mapKey = storageKey(key, options);
  if (options.area === 'session') return memoryStore.get(mapKey) || null;
  try {
    const database = await openDatabase();
    if (!database) return memoryStore.get(mapKey) || null;
    return await new Promise((resolve) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(mapKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(memoryStore.get(mapKey) || null);
    });
  } catch { return memoryStore.get(mapKey) || null; }
}

export async function setStoredItem(key, value, options = {}) {
  const runtime = window.miniappsAI?.storage;
  if (runtime?.setItem) return runtime.setItem(key, value, options);
  const mapKey = storageKey(key, options);
  if (options.area === 'session') { memoryStore.set(mapKey, value); return; }
  try {
    const database = await openDatabase();
    if (!database) { memoryStore.set(mapKey, value); return; }
    await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, mapKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch { memoryStore.set(mapKey, value); }
}

export async function removeStoredItem(key, options = {}) {
  const runtime = window.miniappsAI?.storage;
  if (runtime?.removeItem) return runtime.removeItem(key, options);
  const mapKey = storageKey(key, options);
  memoryStore.delete(mapKey);
  if (options.area === 'session') return;
  try {
    const database = await openDatabase();
    if (!database) return;
    await new Promise((resolve) => {
      const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(mapKey);
      request.onsuccess = request.onerror = () => resolve();
    });
  } catch {}
}

function safeHistory(value) {
  return Array.isArray(value) ? value.filter((item) => item && item.symbol && item.signal).slice(-360) : [];
}

export async function loadPreferences() {
  try {
    let raw = await getStoredItem(STORAGE_KEY);
    for (const key of LEGACY_STORAGE_KEYS) if (!raw) raw = await getStoredItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const preferences = {
      exchange: parsed.exchange || 'binance',
      timeframe: parsed.timeframe || '1h',
      selectedSymbol: parsed.selectedSymbol || 'BTCUSDT',
      strengthFilter: parsed.strengthFilter || 'all',
      qualityFilter: ['all', 'aplus', 'a', 'b'].includes(parsed.qualityFilter) ? parsed.qualityFilter : 'all',
      confirmedOnly: Boolean(parsed.confirmedOnly),
      liveQualityOnly: Boolean(parsed.liveQualityOnly),
      volumeFilter: parsed.volumeFilter || 'all',
      alignmentFilter: parsed.alignmentFilter || 'all',
      minScore: parsed.minScore || 'all',
      strategyProfile: parsed.strategyProfile || 'balanced',
      watchlistOnly: Boolean(parsed.watchlistOnly),
      confirmationTimeframes: Array.isArray(parsed.confirmationTimeframes) ? parsed.confirmationTimeframes : ['1h', '4h', '1d'],
      history: safeHistory(parsed.history),
      recentAlerts: Array.isArray(parsed.recentAlerts) ? parsed.recentAlerts.slice(-40) : [],
      alertSettings: { ...DEFAULT_ALERT_SETTINGS, ...(parsed.alertSettings || {}) },
      risk: { balance: 1000, riskPercent: 1, entry: 0, stop: 0, feePercent: 0.1, ...(parsed.risk || {}) },
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      paperTrading: { balance: 1000, open: Array.isArray(parsed.paperTrading?.open) ? parsed.paperTrading.open.slice(-40) : [], closed: Array.isArray(parsed.paperTrading?.closed) ? parsed.paperTrading.closed.slice(-120) : [] },
      presets: Array.isArray(parsed.presets) ? parsed.presets.slice(0, 8) : [],
      notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
      autoRefresh: [60, 180, 'off'].includes(parsed.autoRefresh) ? parsed.autoRefresh : 'off',
      notifications: parsed.notifications || 'default',
      backtestSettings: { slippagePercent: 0.05, ...(parsed.backtestSettings || {}) },
      riskGuardrails: { maxPortfolioRiskPercent: 3, maxDailyLossPercent: 3, maxPositionExposurePercent: 25, ...(parsed.riskGuardrails || {}) },
    };
    if (Array.isArray(parsed.watchlist)) preferences.watchlist = parsed.watchlist;
    if (Array.isArray(parsed.selectedIndicators)) preferences.selectedIndicators = parsed.selectedIndicators.filter((id) => INDICATOR_IDS.includes(id));
    return preferences;
  } catch { return {}; }
}

export async function savePreferences(state) {
  try {
    await setStoredItem(STORAGE_KEY, JSON.stringify({
      exchange: state.exchange,
      timeframe: state.timeframe,
      selectedSymbol: state.selectedSymbol,
      selectedIndicators: state.selectedIndicators,
      watchlist: state.watchlist,
      strengthFilter: state.strengthFilter,
      qualityFilter: state.qualityFilter || 'all',
      confirmedOnly: Boolean(state.confirmedOnly),
      liveQualityOnly: Boolean(state.liveQualityOnly),
      volumeFilter: state.volumeFilter,
      alignmentFilter: state.alignmentFilter,
      minScore: state.minScore,
      strategyProfile: state.strategyProfile,
      watchlistOnly: state.watchlistOnly,
      confirmationTimeframes: state.confirmationTimeframes,
      history: state.history.slice(-360),
      recentAlerts: state.recentAlerts.slice(-40),
      alertSettings: state.alertSettings,
      risk: state.risk,
      positions: state.positions,
      paperTrading: { balance: Number(state.paperTrading?.balance) || 1000, open: (state.paperTrading?.open || []).slice(-40), closed: (state.paperTrading?.closed || []).slice(-120) },
      presets: (state.presets || []).slice(0, 8),
      notes: Object.fromEntries(Object.entries(state.notes || {}).slice(-30)),
      autoRefresh: state.autoRefresh || 'off',
      notifications: state.notifications || 'default',
      backtestSettings: state.backtestSettings || { slippagePercent: 0.05 },
      riskGuardrails: state.riskGuardrails || { maxPortfolioRiskPercent: 3, maxDailyLossPercent: 3, maxPositionExposurePercent: 25 },
    }));
  } catch {
    // GitHub Pages'te IndexedDB kullanılamazsa panel oturum boyunca çalışmaya devam eder.
  }
}
