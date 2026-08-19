const PROJECT_FILES = [
  '.github/workflows/deploy-pages.yml', 'admin-users.css', 'alerts.js', 'api-config.js', 'asset-icons.js', 'auth.js', 'auth-ui.js', 'backtest.js',
  'catalog.css', 'catalog-picker.js', 'chart-scroll.js', 'chart-series.js', 'chart.js', 'exchanges.js', 'gate-indicators.css', 'github-i18n.js',
  'history.js', 'index.html', 'indicators.js', 'live-data-ui.js', 'live-data.css', 'live-stream.js', 'locales/tr.json', 'main.js', 'market-api.js',
  'market-intelligence.js', 'miniapp.i18n.json', 'paper-trading.js', 'portfolio.js', 'pro-terminal.js', 'project-download.js', 'README.md', 'risk.js',
  'sidebar.css', 'sidebar.js', 'signal-age.js', 'signal-insights.js', 'signal-meta.js', 'signal-quality.js', 'state.js', 'storage.js', 'strategy.js',
  'styles.css', 'supabase-setup.sql', 'terminal-analytics.js', 'terminal-enhancements.js', 'timing-filter.js', 'ui.js',
];

const DEPLOY_WORKFLOW = `name: Deploy 08 Analiz to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Prepare static site
        run: |
          mkdir site
          rsync -a --exclude '.git' ./ site/
      - name: Upload static site
        uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - name: Deploy static site
        id: deployment
        uses: actions/deploy-pages@v4
`;

const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;
const buttons = () => [...document.querySelectorAll('#downloadProjectButton, #authDownloadProjectButton')];
const statusNodes = () => [...document.querySelectorAll('#projectDownloadTopbarStatus, #projectDownloadStatus')];

function setDownloadState(status, key, values) {
  buttons().forEach((button) => {
    button.disabled = status === 'loading';
    button.setAttribute('aria-busy', status === 'loading' ? 'true' : 'false');
  });
  statusNodes().forEach((node) => { node.textContent = key ? t(key, values) : ''; });
}

function write16(target, offset, value) { target[offset] = value & 255; target[offset + 1] = (value >>> 8) & 255; }
function write32(target, offset, value) { for (let index = 0; index < 4; index += 1) target[offset + index] = (value >>> (index * 8)) & 255; }
function crcTable() { const table = new Uint32Array(256); for (let index = 0; index < 256; index += 1) { let value = index; for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; table[index] = value >>> 0; } return table; }
const CRC = crcTable();
function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) value = CRC[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }
function dosDateTime(date = new Date()) { const year = Math.max(1980, date.getFullYear()); return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() }; }

function createZip(files) {
  const encoder = new TextEncoder(); const local = []; const central = []; let offset = 0; const stamp = dosDateTime();
  files.forEach(({ path, content }) => {
    const name = encoder.encode(path); const data = encoder.encode(content); const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + name.length); write32(localHeader, 0, 0x04034b50); write16(localHeader, 4, 20); write16(localHeader, 6, 0x0800); write16(localHeader, 8, 0); write16(localHeader, 10, stamp.time); write16(localHeader, 12, stamp.date); write32(localHeader, 14, checksum); write32(localHeader, 18, data.length); write32(localHeader, 22, data.length); write16(localHeader, 26, name.length); localHeader.set(name, 30); local.push(localHeader, data);
    const centralHeader = new Uint8Array(46 + name.length); write32(centralHeader, 0, 0x02014b50); write16(centralHeader, 4, 20); write16(centralHeader, 6, 20); write16(centralHeader, 8, 0x0800); write16(centralHeader, 10, 0); write16(centralHeader, 12, stamp.time); write16(centralHeader, 14, stamp.date); write32(centralHeader, 16, checksum); write32(centralHeader, 20, data.length); write32(centralHeader, 24, data.length); write16(centralHeader, 28, name.length); write32(centralHeader, 42, offset); centralHeader.set(name, 46); central.push(centralHeader); offset += localHeader.length + data.length;
  });
  const centralSize = central.reduce((sum, part) => sum + part.length, 0); const end = new Uint8Array(22); write32(end, 0, 0x06054b50); write16(end, 8, files.length); write16(end, 10, files.length); write32(end, 12, centralSize); write32(end, 16, offset); return new Blob([...local, ...central, end], { type: 'application/zip' });
}

function cleanUrl(path) { return new URL(path, document.baseURI).href; }
function cacheBustedUrl(path) { const url = new URL(cleanUrl(path)); url.searchParams.set('projectDownload', `${Date.now()}-${Math.random().toString(16).slice(2)}`); return url.href; }
function pageUrl() { return window.location.href.split('#')[0]; }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function requestText(url) {
  const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { window.clearTimeout(timer); }
}

function currentDocumentSource() {
  const doctype = document.doctype ? `<!DOCTYPE ${document.doctype.name}>\n` : '<!DOCTYPE html>\n';
  return `${doctype}${document.documentElement.outerHTML}`;
}

async function fetchIndexFile() {
  // GitHub Pages bazı kurulumlarda index.html isteğini aynı anda yeniden yönlendirir
  // ve ZIP hazırlama akışını kilitler. Ekranda çalışan HTML, yayınlanan index'in
  // eksiksiz DOM karşılığıdır; bu nedenle bu dosyada ağ isteği bekletmiyoruz.
  return { path: 'index.html', content: currentDocumentSource() };
}

async function fetchProjectFile(path) {
  if (path === 'index.html') return fetchIndexFile();
  if (path === '.github/workflows/deploy-pages.yml') {
    try { return { path, content: await requestText(cleanUrl(path)) }; } catch { return { path, content: DEPLOY_WORKFLOW }; }
  }
  const urls = [cleanUrl(path), cacheBustedUrl(path)]; let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const url of urls) {
      try { return { path, content: await requestText(url) }; } catch (error) { lastError = error; }
    }
    await wait(350 * (attempt + 1));
  }
  throw new Error(`${path}: ${lastError?.name === 'AbortError' ? 'timeout' : lastError?.message || 'read_failed'}`);
}

function exposeDownloadLink(blob) {
  document.querySelectorAll('.project-download-fallback').forEach((node) => node.remove());
  const link = document.createElement('a'); link.className = 'project-download-fallback'; link.href = URL.createObjectURL(blob); link.download = `08-analiz-projesi-${new Date().toISOString().slice(0, 10)}.zip`; link.textContent = t('auth.downloadFallback'); link.style.display = 'inline-block';
  statusNodes().forEach((node) => node.appendChild(link.cloneNode(true)));
  window.setTimeout(() => URL.revokeObjectURL(link.href), 10 * 60 * 1000);
}
function triggerDownload(blob) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `08-analiz-projesi-${new Date().toISOString().slice(0, 10)}.zip`; anchor.rel = 'noopener'; anchor.style.display = 'none'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); exposeDownloadLink(blob); window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000); }

async function downloadProject() {
  setDownloadState('loading', 'auth.downloadPreparing', { total: PROJECT_FILES.length });
  try {
    const files = [];
    for (const path of PROJECT_FILES) {
      const file = await fetchProjectFile(path); files.push(file);
      setDownloadState('loading', 'auth.downloadProgress', { done: files.length, total: PROJECT_FILES.length });
    }
    if (files.length !== PROJECT_FILES.length) throw new Error(`file_count_${files.length}`);
    const blob = createZip(files); setDownloadState('ready', 'auth.downloadSuccess', { count: files.length }); triggerDownload(blob);
  } catch (error) {
    console.error('Project download failed:', error);
    setDownloadState('error', 'auth.downloadErrorFile', { file: error.message.split(':')[0] });
  }
}

export function bindProjectDownload() {
  buttons().forEach((button) => { if (button.dataset.bound === 'true') return; button.dataset.bound = 'true'; button.addEventListener('click', downloadProject); });
}
