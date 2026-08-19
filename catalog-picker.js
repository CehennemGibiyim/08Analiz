const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;
let renderKey = '';
let bound = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&#38;', '<': '&#60;', '>': '&#62;', "'": '&#39;', '"': '&#34;' }[char]));
}

function normalize(value) {
  return String(value || '').replace(/[-_/\s:]/g, '').toUpperCase();
}

function formatVolume(value, quote) {
  const volume = Number(value);
  if (!Number.isFinite(volume) || volume <= 0) return t('controls.catalogVolumeUnknown');
  const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(volume);
  return t('controls.catalogVolume', { value: `${compact} ${quote}` });
}

function filteredCatalog(state, query, quote, watchedOnly, sortMode) {
  const normalizedQuery = normalize(query);
  return (state.catalog || [])
    .filter((item) => !quote || item.quote === quote)
    .filter((item) => !watchedOnly || (state.watchlist || []).some((symbol) => normalize(symbol) === normalize(item.symbol)))
    .filter((item) => !normalizedQuery || `${normalize(item.base)} ${normalize(item.quote)} ${normalize(item.symbol)} ${normalize(item.display)}`.includes(normalizedQuery))
    .sort((a, b) => {
      const aSelected = normalize(a.symbol) === normalize(state.selectedSymbol) ? 1 : 0;
      const bSelected = normalize(b.symbol) === normalize(state.selectedSymbol) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      if (sortMode === 'popular') {
        const volumeDifference = (Number(b.quoteVolume) || 0) - (Number(a.quoteVolume) || 0);
        if (volumeDifference !== 0) return volumeDifference;
      }
      const aWatched = (state.watchlist || []).some((symbol) => normalize(symbol) === normalize(a.symbol)) ? 1 : 0;
      const bWatched = (state.watchlist || []).some((symbol) => normalize(symbol) === normalize(b.symbol)) ? 1 : 0;
      if (aWatched !== bWatched) return bWatched - aWatched;
      return String(a.display).localeCompare(String(b.display), 'tr');
    });
}

function quoteOptions(catalog) {
  return [...new Set((catalog || []).map((item) => item.quote).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function renderList(root, state) {
  const dialog = root.querySelector('#catalogDialog');
  if (!dialog) return;
  const query = dialog.querySelector('#catalogSearch')?.value || '';
  const quote = dialog.querySelector('#catalogQuote')?.value || '';
  const sortMode = dialog.querySelector('#catalogSort')?.value || 'popular';
  const watchedOnly = Boolean(dialog.querySelector('#catalogWatchedOnly')?.checked);
  const matches = filteredCatalog(state, query, quote, watchedOnly, sortMode);
  const results = dialog.querySelector('#catalogResults');
  const count = dialog.querySelector('#catalogResultCount');
  if (count) count.textContent = t('controls.catalogResults', { count: matches.length.toLocaleString('tr-TR') });
  if (!matches.length) {
    results.innerHTML = `<div class="catalog-empty">${escapeHtml(t('controls.catalogEmptySearch'))}</div>`;
    return;
  }
  results.innerHTML = matches.map((item) => {
    const selected = normalize(item.symbol) === normalize(state.selectedSymbol);
    const watched = (state.watchlist || []).some((symbol) => normalize(symbol) === normalize(item.symbol));
    return `<button class="catalog-item${selected ? ' is-selected' : ''}" type="button" role="option" data-catalog-symbol="${escapeHtml(item.symbol)}" aria-selected="${selected}"><span class="catalog-item-main"><strong>${escapeHtml(item.display)}</strong><small>${escapeHtml(item.symbol)} · ${escapeHtml(item.quote)}</small><small class="catalog-item-volume">${escapeHtml(formatVolume(item.quoteVolume, item.quote))}</small></span><span class="catalog-item-state" aria-hidden="true">${watched ? '★' : selected ? '✓' : ''}</span></button>`;
  }).join('');
}

export function renderCatalogPicker(root, state) {
  const dialog = root.querySelector('#catalogDialog');
  const launcher = root.querySelector('#openCatalogButton');
  const selectedLabel = root.querySelector('#selectedCatalogLabel');
  const selected = (state.catalog || []).find((item) => String(item.symbol) === String(state.selectedSymbol)) || (state.catalog || []).find((item) => normalize(item.symbol) === normalize(state.selectedSymbol));
  if (selectedLabel) selectedLabel.textContent = selected ? `${selected.display} · ${selected.symbol}` : t('controls.catalogEmpty');
  if (launcher) {
    launcher.disabled = state.catalogStatus === 'loading' || !(state.catalog || []).length;
    launcher.setAttribute('aria-busy', String(state.catalogStatus === 'loading'));
  }
  if (!dialog) return;
  const quote = dialog.querySelector('#catalogQuote');
  const options = quoteOptions(state.catalog);
  const optionKey = options.join('|');
  if (dialog.dataset.quoteKey !== optionKey) {
    const currentQuote = quote.value;
    quote.innerHTML = `<option value="">${escapeHtml(t('controls.catalogAllQuotes'))}</option>${options.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}`;
    quote.value = options.includes(currentQuote) ? currentQuote : '';
    dialog.dataset.quoteKey = optionKey;
  }
  const sort = dialog.querySelector('#catalogSort');
  if (sort && !sort.value) sort.value = 'popular';
  const nextKey = `${state.exchange}|${state.catalogStatus}|${state.catalog.length}|${state.catalog[0]?.quoteVolume || 0}|${state.selectedSymbol}|${state.watchlist.join(',')}|${dialog.querySelector('#catalogSearch')?.value || ''}|${quote.value}|${sort?.value || 'popular'}|${dialog.querySelector('#catalogWatchedOnly')?.checked ? '1' : '0'}`;
  if (nextKey !== renderKey) {
    renderList(root, state);
    renderKey = nextKey;
  }
}

export function bindCatalogPicker(root, actions) {
  if (bound) return;
  bound = true;
  const dialog = root.querySelector('#catalogDialog');
  if (!dialog) return;
  const close = () => {
    dialog.hidden = true;
    dialog.setAttribute('aria-hidden', 'true');
  };
  root.addEventListener('click', (event) => {
    if (event.target.closest('#openCatalogButton')) {
      dialog.hidden = false;
      dialog.setAttribute('aria-hidden', 'false');
      dialog.querySelector('#catalogSearch').focus();
      renderKey = '';
      renderList(root, actions.getState?.() || {});
      return;
    }
    if (event.target.closest('#closeCatalogButton') || event.target === dialog) {
      close();
      return;
    }
    const item = event.target.closest('[data-catalog-symbol]');
    if (item) {
      actions.chooseSymbol(item.dataset.catalogSymbol);
      close();
    }
  });
  root.addEventListener('input', (event) => {
    if (event.target.id === 'catalogSearch') {
      renderKey = '';
      renderList(root, actions.getState?.() || {});
    }
  });
  root.addEventListener('change', (event) => {
    if (event.target.id === 'catalogQuote' || event.target.id === 'catalogSort' || event.target.id === 'catalogWatchedOnly') {
      renderKey = '';
      renderList(root, actions.getState?.() || {});
    }
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}
