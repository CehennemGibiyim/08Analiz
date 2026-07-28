const PROJECT_FILES = [
  '.github/workflows/deploy-pages.yml',
  'README.md',
  'api-config.js',
  'alerts.js',
  'asset-icons.js',
  'auth-ui.js',
  'auth.js',
  'backtest.js',
  'chart-series.js',
  'chart-scroll.js',
  'chart.js',
  'exchanges.js',
  'github-i18n.js',
  'history.js',
  'index.html',
  'indicators.js',
  'live-stream.js',
  'locales/tr.json',
  'main.js',
  'market-api.js',
  'market-intelligence.js',
  'miniapp.i18n.json',
  'portfolio.js',
  'paper-trading.js',
  'signal-insights.js',
  'signal-quality.js',
  'pro-terminal.js',
  'project-download.js',
  'risk.js',
  'signal-age.js',
  'signal-meta.js',
  'state.js',
  'storage.js',
  'strategy.js',
  'styles.css',
  'terminal-analytics.js',
  'terminal-enhancements.js',
  'ui.js',
];

const INLINE_FALLBACKS = {
  'miniapp.i18n.json': '{\n  "version": 1,\n  "sourceLocale": "tr"\n}\n',
};

const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;

function setDownloadState(button, status, key, values) {
  button.disabled = status === 'loading';
  button.setAttribute('aria-busy', status === 'loading' ? 'true' : 'false');
  const statusElement = document.querySelector('#projectDownloadStatus');
  if (statusElement) statusElement.textContent = key ? t(key, values) : '';
}

function writeUint16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = createCrcTable();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const timestamp = dosDateTime();

  files.forEach(({ path, content }) => {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0x0800);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, timestamp.time);
    writeUint16(localHeader, 12, timestamp.date);
    writeUint32(localHeader, 14, checksum);
    writeUint32(localHeader, 18, data.length);
    writeUint32(localHeader, 22, data.length);
    writeUint16(localHeader, 26, name.length);
    localHeader.set(name, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0x0800);
    writeUint16(centralHeader, 10, 0);
    writeUint16(centralHeader, 12, timestamp.time);
    writeUint16(centralHeader, 14, timestamp.date);
    writeUint32(centralHeader, 16, checksum);
    writeUint32(centralHeader, 20, data.length);
    writeUint32(centralHeader, 24, data.length);
    writeUint16(centralHeader, 28, name.length);
    writeUint32(centralHeader, 42, offset);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralSize);
  writeUint32(end, 16, offset);

  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

function projectUrls(path) {
  const urls = [];
  const add = (value) => {
    if (value && !urls.includes(value)) urls.push(value);
  };
  try { add(new URL(path, import.meta.url).href); } catch {}
  try { add(new URL(path, document.baseURI).href); } catch {}
  try { add(new URL(path, window.location.href).href); } catch {}
  return urls;
}

function readProjectFileWithFrame(path, url) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    let settled = false;
    let timeout;
    const finish = (error, content = '') => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      frame.remove();
      if (error) reject(error); else resolve(content);
    };
    timeout = window.setTimeout(() => finish(new Error('frame_timeout')), 8000);
    frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true');
    frame.onload = () => {
      try {
        const documentElement = frame.contentDocument?.documentElement;
        const content = path.endsWith('.html')
          ? `<!DOCTYPE html>\\n${documentElement?.outerHTML || ''}`
          : frame.contentDocument?.body?.textContent || documentElement?.textContent || '';
        if (!content.trim() || /^\\s*(403|404|access denied|forbidden)\\b/i.test(content)) throw new Error('frame_invalid_content');
        finish(null, content);
      } catch (error) {
        finish(error);
      }
    };
    frame.onerror = () => finish(new Error('frame_load_failed'));
    document.body.appendChild(frame);
    frame.src = url;
  });
}

async function fetchProjectFile(path) {
  let lastStatus = '';
  const urls = projectUrls(path);
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const cached = await window.caches?.match?.(url);
        if (cached?.ok) return { path, content: await cached.text() };
        const response = await fetch(url, {
          cache: 'force-cache',
          credentials: 'include',
          redirect: 'follow',
          referrerPolicy: 'same-origin',
          headers: { Accept: 'text/plain, application/json, text/css, application/javascript, */*' },
        });
        if (response.ok) return { path, content: await response.text() };
        lastStatus = `${response.status} ${response.statusText || ''}`.trim();
      } catch (error) {
        lastStatus = error?.message || 'network_error';
      }
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
  }
  for (const url of urls) {
    try {
      const content = await readProjectFileWithFrame(path, url);
      return { path, content };
    } catch (error) {
      lastStatus = error?.message || lastStatus;
    }
  }
  if (Object.prototype.hasOwnProperty.call(INLINE_FALLBACKS, path)) {
    return { path, content: INLINE_FALLBACKS[path] };
  }
  throw new Error(`download_file_failed:${path}:${lastStatus || 'unavailable'}:urls=${urls.join('|')}`);
}

function triggerDownload(blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `kripto-piyasa-tarayici-projesi-${date}.zip`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadProject(button) {
  setDownloadState(button, 'loading', 'auth.downloadPreparing');
  try {
    const results = [];
    for (const path of PROJECT_FILES) results.push(await fetchProjectFile(path));
    triggerDownload(createZip(results));
    setDownloadState(button, 'ready', 'auth.downloadSuccess', { count: results.length });
  } catch (error) {
    const message = error?.message || String(error || 'unknown_error');
    console.error(`Project download failed: ${message}`);
    setDownloadState(button, 'error', 'auth.downloadError');
  } finally {
    window.setTimeout(() => {
      if (!button.disabled) button.removeAttribute('aria-busy');
    }, 2500);
  }
}

export function bindProjectDownload() {
  const button = document.querySelector('#downloadProjectButton');
  if (!button || button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';
  button.addEventListener('click', () => downloadProject(button));
}
