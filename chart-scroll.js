let activeBinding = null;

function chartFrame(host) {
  return host?.querySelector('.chart-frame');
}

export function bindChartScroll(root) {
  const host = root?.querySelector('#detailChart');
  if (!host) return;
  activeBinding?.disconnect();

  let rememberedScrollLeft = 0;
  let restoreQueued = false;
  let followLatest = false;

  const remember = (event) => {
    if (event.target?.classList?.contains('chart-frame')) {
      if (!followLatest) rememberedScrollLeft = event.target.scrollLeft;
    }
  };

  const restore = () => {
    restoreQueued = false;
    const frame = chartFrame(host);
    if (!frame) return;
    const maximum = Math.max(0, frame.scrollWidth - frame.clientWidth);
    const nextScrollLeft = followLatest ? maximum : Math.min(rememberedScrollLeft, maximum);
    if (nextScrollLeft >= 0 && Math.abs(frame.scrollLeft - nextScrollLeft) > 1) {
      frame.scrollLeft = nextScrollLeft;
    }
    const button = host.querySelector('[data-chart-action="toggle-follow"]');
    if (button) button.setAttribute('aria-pressed', String(followLatest));
  };

  const queueRestore = () => {
    if (restoreQueued) return;
    restoreQueued = true;
    window.requestAnimationFrame(restore);
  };

  host.addEventListener('click', (event) => {
    const action = event.target.closest('[data-chart-action]')?.dataset.chartAction;
    if (action === 'latest') { followLatest = true; queueRestore(); }
    if (action === 'toggle-follow') { followLatest = !followLatest; queueRestore(); }
  });

  host.addEventListener('scroll', remember, { passive: true });
  const observer = new MutationObserver(queueRestore);
  observer.observe(host, { childList: true, subtree: true });
  activeBinding = observer;
  queueRestore();
}
