const SYMBOL_ALIASES = {
  XBT: 'btc',
  XXBT: 'btc',
  XDG: 'doge',
  XXDG: 'doge',
  BCHSV: 'bsv',
  BSV: 'bsv',
  // The icon repository stores IOTA under its full asset code.
  MIOTA: 'miota',
  IOTA: 'miota',
  XMR: 'xmr',
  XLM: 'xlm',
};

function cleanAsset(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function assetCode(value) {
  const cleaned = cleanAsset(value);
  return (SYMBOL_ALIASES[cleaned] || cleaned).toLowerCase();
}

export function assetIconUrl(value) {
  const code = assetCode(value);
  if (!code) return '';
  return `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/${encodeURIComponent(code)}.png`;
}

export function assetInitials(value) {
  const cleaned = cleanAsset(value);
  return cleaned.length > 4 ? cleaned.slice(0, 3) : cleaned || '?';
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>\"']/g, (char) => ({ '&': '&#38;', '<': '&#60;', '>': '&#62;', '"': '&#34;', "'": '&#39;' }[char]));
}

export function assetIconMarkup(value, label = '') {
  const url = assetIconUrl(value);
  const initials = assetInitials(value);
  const alt = escapeAttribute(label || value || '');
  return `<span class="asset-icon-wrap"><img class="asset-icon" src="${url}" alt="${alt}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="asset-icon-fallback" aria-hidden="true">${initials}</span></span>`;
}
