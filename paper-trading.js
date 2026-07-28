const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;
const esc = (value) => String(value ?? '').replace(/[&<>'\"]/g, (char) => ({ '&': '&#38;', '<': '&#60;', '>': '&#62;', "'": '&#39;', '\"': '&#34;' }[char]));
const num = (value, digits = 2) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(Number(value) || 0);
const money = (value) => `USDT ${num(value, Math.abs(Number(value)) >= 1000 ? 0 : 4)}`;
const normalize = (value) => String(value || '').replace(/[-_/:]/g, '').toUpperCase();

export function currentPaperPrices(state = {}) {
  return Object.fromEntries((state.markets || []).map((item) => {
    const ticker = state.tickers?.[item.market.symbol] || state.tickers?.[normalize(item.market.symbol)];
    return [item.market.symbol, Number(ticker?.price || item.analysis?.price) || 0];
  }));
}

export function settlePaperTrades(paper = {}, prices = {}, now = Date.now()) {
  const open = Array.isArray(paper.open) ? paper.open : [];
  if (!open.length) return paper;
  const closed = [...(paper.closed || [])];
  let changed = false;
  const remaining = [];
  open.forEach((trade) => {
    const price = Number(prices[trade.symbol]) || Number(trade.entry);
    const stopHit = trade.stop > 0 && (trade.side === 'long' ? price <= trade.stop : price >= trade.stop);
    const targetHit = trade.target > 0 && (trade.side === 'long' ? price >= trade.target : price <= trade.target);
    if (!stopHit && !targetHit) { remaining.push(trade); return; }
    const exit = stopHit ? trade.stop : trade.target;
    const direction = trade.side === 'short' ? -1 : 1;
    const pnl = (exit - trade.entry) * trade.quantity * direction;
    closed.push({ ...trade, exit, exitPrice: exit, pnl, pnlPercent: trade.entry ? pnl / (trade.entry * trade.quantity) * 100 : 0, closeReason: stopHit ? 'stop' : 'target', closedAt: now });
    changed = true;
  });
  return changed ? { ...paper, open: remaining, closed: closed.slice(-120) } : paper;
}

function getSelected(state) {
  const item = (state.markets || []).find((entry) => normalize(entry.market.symbol) === normalize(state.selectedSymbol));
  if (!item) return null;
  const ticker = state.tickers?.[item.market.symbol] || state.tickers?.[normalize(item.market.symbol)];
  return { ...item, price: Number(ticker?.price || item.analysis?.price) || 0 };
}

function tradeRow(trade, open, prices) {
  const price = open ? Number(prices[trade.symbol]) || trade.entry : trade.exitPrice || trade.exit || trade.entry;
  const direction = trade.side === 'short' ? -1 : 1;
  const pnl = (price - trade.entry) * trade.quantity * direction;
  const value = open ? pnl : Number(trade.pnl) || pnl;
  return `<div class="paper-trade-row"><span><b>${esc(trade.symbol)}</b><small>${esc(trade.side === 'long' ? t('paper.long') : t('paper.short'))} · ${money(trade.entry)}${open ? ` · ${money(price)}` : ` · ${esc(t(`paper.${trade.closeReason || 'manual'}`))}`}</small></span><strong class="${value >= 0 ? 'positive' : 'negative'}">${value >= 0 ? '+' : ''}${money(value)}</strong>${open ? `<button class="text-button" type="button" data-paper-close="${esc(trade.id)}">${esc(t('paper.close'))}</button>` : ''}</div>`;
}

export function renderPaperTrading(root, state) {
  const mount = root.querySelector('#paperTradingMount');
  if (!mount) return;
  const selected = getSelected(state); const paper = state.paperTrading || { open: [], closed: [], balance: 1000 };
  const prices = currentPaperPrices(state); const open = paper.open || []; const closed = [...(paper.closed || [])].reverse().slice(0, 6);
  const activeInput = document.activeElement?.closest?.('#paperTradeForm');
  if (activeInput && mount.contains(activeInput)) return;
  const selectedSignal = selected?.analysis?.signal;
  const defaultSide = selectedSignal === 'sell' ? 'short' : 'long';
  const defaultEntry = selected?.price || '';
  const openPnl = open.reduce((sum, trade) => { const price = prices[trade.symbol] || trade.entry; const direction = trade.side === 'short' ? -1 : 1; return sum + (price - trade.entry) * trade.quantity * direction; }, 0);
  mount.innerHTML = `<section class="paper-terminal panel" aria-labelledby="paperTitle"><div class="paper-heading"><div><p class="eyebrow accent">${esc(t('paper.eyebrow'))}</p><h2 id="paperTitle">${esc(t('paper.title'))}</h2><p>${esc(t('paper.copy'))}</p></div><span class="paper-mode-badge">${esc(t('paper.simulation'))}</span></div><div class="paper-stats"><span>${esc(t('paper.balance'))}<b>${money(paper.balance || 1000)}</b></span><span>${esc(t('paper.openPnl'))}<b class="${openPnl >= 0 ? 'positive' : 'negative'}">${openPnl >= 0 ? '+' : ''}${money(openPnl)}</b></span><span>${esc(t('paper.openTrades'))}<b>${open.length}</b></span></div><div class="paper-grid"><form id="paperTradeForm" class="paper-form"><div class="section-label"><span>${esc(t('paper.newTrade'))}</span><strong>${selected ? esc(selected.market.display) : '—'}</strong></div><label for="paperSide">${esc(t('paper.side'))}</label><select id="paperSide"><option value="long" ${defaultSide === 'long' ? 'selected' : ''}>${esc(t('paper.long'))}</option><option value="short" ${defaultSide === 'short' ? 'selected' : ''}>${esc(t('paper.short'))}</option></select><label for="paperEntry">${esc(t('paper.entry'))}</label><input id="paperEntry" type="number" min="0" step="any" value="${esc(defaultEntry)}" required><label for="paperQuantity">${esc(t('paper.quantity'))}</label><input id="paperQuantity" type="number" min="0" step="any" value="1" required><label for="paperStop">${esc(t('paper.stop'))}</label><input id="paperStop" type="number" min="0" step="any" placeholder="${esc(t('paper.optional'))}"><label for="paperTarget">${esc(t('paper.target'))}</label><input id="paperTarget" type="number" min="0" step="any" placeholder="${esc(t('paper.optional'))}"><button class="primary-button" type="submit" ${selected ? '' : 'disabled'}>${esc(t('paper.open'))}</button><button class="small-button" type="button" data-paper-quick="true" ${selected && ['buy', 'sell'].includes(selectedSignal) ? '' : 'disabled'}>${esc(t('paper.openFromSignal'))}</button></form><div class="paper-book"><div class="section-label"><span>${esc(t('paper.openList'))}</span><strong>${open.length}</strong></div>${open.length ? open.map((trade) => tradeRow(trade, true, prices)).join('') : `<span class="indicator-empty">${esc(t('paper.emptyOpen'))}</span>`}<div class="section-label paper-history-label"><span>${esc(t('paper.closedList'))}</span><strong>${paper.closed?.length || 0}</strong></div>${closed.length ? closed.map((trade) => tradeRow(trade, false, prices)).join('') : `<span class="indicator-empty">${esc(t('paper.emptyClosed'))}</span>`}</div></div></section>`;
}

export function bindPaperTradingEvents(root, actions) {
  root.addEventListener('submit', (event) => {
    if (event.target.id !== 'paperTradeForm') return;
    event.preventDefault();
    actions.openPaperTrade({ side: root.querySelector('#paperSide')?.value, entry: root.querySelector('#paperEntry')?.value, quantity: root.querySelector('#paperQuantity')?.value, stop: root.querySelector('#paperStop')?.value, target: root.querySelector('#paperTarget')?.value });
  });
  root.addEventListener('click', (event) => {
    const close = event.target.closest('[data-paper-close]');
    if (close) { actions.closePaperTrade(close.dataset.paperClose); return; }
    if (event.target.closest('[data-paper-quick]')) actions.openPaperTrade({ quick: true });
  });
}
