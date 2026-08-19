const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;

const EXCHANGE_NAMES = {
  binance: 'Binance',
  bybit: 'Bybit',
  okx: 'OKX',
  kucoin: 'KuCoin',
  gate: 'Gate.io',
  bitget: 'Bitget',
  kraken: 'Kraken',
};

const TAB_IDS = ['overviewSection', 'controlsSection', 'scanSection', 'toolsSection', 'labSection'];

function isSmallScreen() {
  return Boolean(window.matchMedia?.('(max-width: 860px)').matches);
}

function setOpen(root, open) {
  root.classList.toggle('sidebar-open', open);
  root.classList.toggle('sidebar-collapsed', !open);
  const sidebar = root.querySelector('#appSidebar');
  const toggle = root.querySelector('#sidebarToggleButton');
  const backdrop = root.querySelector('#sidebarBackdrop');
  sidebar?.setAttribute('aria-hidden', String(!open));
  toggle?.setAttribute('aria-expanded', String(open));
  toggle?.setAttribute('aria-label', t(open ? 'navigation.closeMenu' : 'navigation.openMenu'));
  if (backdrop) backdrop.hidden = !open;
}

function setActive(root, id) {
  root.querySelectorAll('[data-sidebar-target]').forEach((button) => {
    const active = button.dataset.sidebarTarget === id;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.setAttribute('aria-current', active ? 'page' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
}

function activateTab(root, id, { focusTab = false } = {}) {
  const nextId = TAB_IDS.includes(id) ? id : 'overviewSection';
  root.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    const active = panel.dataset.tabPanel === nextId;
    panel.hidden = !active;
    panel.setAttribute('aria-hidden', String(!active));
  });
  setActive(root, nextId);
  if (focusTab) root.querySelector(`[data-sidebar-target="${nextId}"]`)?.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function bindSidebar(root) {
  if (!root || root.dataset.sidebarBound === 'true') return;
  root.dataset.sidebarBound = 'true';

  // Capture the click at the app root so other delegated handlers cannot swallow menu clicks.
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest('[data-sidebar-target]');
    if (tab && root.contains(tab)) {
      event.preventDefault();
      activateTab(root, tab.dataset.sidebarTarget);
      if (isSmallScreen()) setOpen(root, false);
      return;
    }
    if (target?.closest('#sidebarToggleButton')) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(root, !root.classList.contains('sidebar-open'));
      return;
    }
    if (target?.closest('#sidebarCloseButton, #sidebarBackdrop')) {
      event.preventDefault();
      setOpen(root, false);
    }
  }, true);

  const buttons = [...root.querySelectorAll('[data-sidebar-target]')];
  buttons.forEach((button, index) => {
    button.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + direction + buttons.length) % buttons.length;
      activateTab(root, buttons[nextIndex].dataset.sidebarTarget, { focusTab: true });
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.classList.contains('sidebar-open')) setOpen(root, false);
  });
  window.addEventListener('resize', () => {
    if (isSmallScreen()) {
      if (!root.classList.contains('sidebar-open')) setOpen(root, false);
    } else if (!root.classList.contains('sidebar-open')) {
      setOpen(root, true);
    }
  });

  setOpen(root, !isSmallScreen());
  activateTab(root, 'overviewSection');
}

export function syncSidebar(root, state = {}) {
  const exchange = root.querySelector('#sidebarExchange');
  const dataStatus = root.querySelector('#sidebarDataStatus');
  const indicatorSet = root.querySelector('#sidebarIndicatorSet');
  if (exchange) exchange.textContent = EXCHANGE_NAMES[state.exchange] || state.exchange || '—';
  if (indicatorSet) indicatorSet.textContent = state.indicatorSource === 'gate' ? t('navigation.gateSet') : t('navigation.coreSet');
  if (dataStatus) {
    const isLive = state.source === 'live' || state.source === 'partial';
    const progress = state.scanStats;
    dataStatus.textContent = state.status === 'loading' && progress?.requested ? t('status.scanningProgress', { live: Number(progress.live || 0).toLocaleString('tr-TR'), completed: Number(progress.completed || 0).toLocaleString('tr-TR') }) : state.status === 'loading' ? t('status.scanning') : isLive ? t('status.liveShort') : t('status.unavailable');
    dataStatus.className = `sidebar-data-status ${isLive ? 'is-live' : ''}`;
  }
}
