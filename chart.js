import { indicatorSeries } from './chart-series.js';

const t = (key, values) => window.miniappI18n?.t(key, values) ?? key;
const COLORS = {
  ema20: '#49e3c2', ema50: '#f2b66d', ema200: '#b693ff', sma200: '#ff8b94',
  bollinger: '#68a8ff', vwap: '#f5d76e', supertrend: '#d9f99d',
  rsi: '#c084fc', macd: '#49e3c2', stochastic: '#f2b66d', adx: '#68a8ff',
  volume: '#d9f99d', atr: '#ff9f68', candle: '#ff8b94',
};
const OVERLAYS = ['ema20', 'ema50', 'ema200', 'sma200', 'bollinger', 'vwap', 'supertrend'];
const OSCILLATORS = ['rsi', 'macd', 'stochastic', 'adx', 'volume', 'atr', 'candle'];

function esc(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function price(value, quote) { return `${quote} ${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: value >= 1000 ? 2 : value >= 1 ? 4 : 8 }).format(Number(value) || 0)}`; }
function axisValue(value, id, quote) {
  if (!Number.isFinite(Number(value))) return '—';
  if (id === 'volume') return `${Number(value).toFixed(2)}x`;
  if (id === 'candle') return `${Number(value).toFixed(2)}%`;
  if (['rsi', 'stochastic', 'adx'].includes(id)) return Number(value).toFixed(0);
  if (id === 'macd') return Number(value).toFixed(4);
  return price(value, quote);
}
function yFor(value, min, max, top, height) { return top + (max - value) / Math.max(max - min, 1e-12) * height; }
function xFor(index, count, left, width) { return left + index * width / Math.max(count - 1, 1); }
function pathFor(values, min, max, left, top, width, height) {
  let started = false;
  const points = values.map((value, index) => {
    if (!Number.isFinite(Number(value))) { started = false; return ''; }
    const command = started ? 'L' : 'M'; started = true;
    return `${command} ${xFor(index, values.length, left, width).toFixed(2)} ${yFor(Number(value), min, max, top, height).toFixed(2)}`;
  }).filter(Boolean);
  return points.join(' ');
}
function finite(values) { return values.map(Number).filter(Number.isFinite); }
function range(values, forcedMin = null, forcedMax = null) {
  const valid = finite(values); if (!valid.length) return { min: 0, max: 1 };
  const safeMin = forcedMin !== null && Number.isFinite(Number(forcedMin)) ? Number(forcedMin) : null;
  const safeMax = forcedMax !== null && Number.isFinite(Number(forcedMax)) ? Number(forcedMax) : null;
  let min = safeMin ?? Math.min(...valid); let max = safeMax ?? Math.max(...valid);
  if (safeMin === null || safeMax === null) { const padding = (max - min || Math.abs(max) * .02 || 1) * .1; min = safeMin ?? min - padding; max = safeMax ?? max + padding; }
  if (max <= min) { const padding = Math.abs(max || 1) * .08; min -= padding; max += padding; }
  return { min, max };
}
function series(id, candles) { return indicatorSeries(id, candles); }
function overlayValues(id, candles, seriesMap) {
  const result = seriesMap?.get(id) || series(id, candles);
  if (id === 'bollinger') return [
    result.map((value) => value.upper),
    result.map((value) => value.middle),
    result.map((value) => value.lower),
  ];
  return [result.map((value) => Number(value.value ?? value))];
}
function indicatorLabel(id) {
  const keys = { ema20: 'indicator.ema20', ema50: 'indicator.ema50', ema200: 'indicator.ema200', sma200: 'indicator.sma200', rsi: 'indicator.rsi14', macd: 'indicator.macd', bollinger: 'indicator.bollinger', stochastic: 'indicator.stochastic', adx: 'indicator.adx', vwap: 'indicator.vwap', supertrend: 'indicator.supertrend', volume: 'indicator.volumeRatio', atr: 'indicator.atr14', candle: 'indicator.candleTrend' };
  const translated = t(keys[id] || id); return translated === keys[id] && id === 'vwap' ? 'VWAP' : translated;
}
function paneTitle(id) {
  const keys = { rsi: 'chart.paneRsi', macd: 'chart.paneMacd', stochastic: 'chart.paneStochastic', adx: 'chart.paneAdx', volume: 'chart.paneVolume', atr: 'chart.paneAtr', candle: 'chart.paneCandle' };
  return t(keys[id] || 'chart.paneIndicator');
}
function gridMarkup(min, max, id, quote, left, top, width, height, title) {
  const rows = Array.from({ length: 3 }, (_, index) => {
    const value = max - ((max - min) * index / 2); const y = yFor(value, min, max, top, height);
    return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${(left + width).toFixed(1)}" y2="${y.toFixed(1)}" class="chart-grid-line"></line><text x="${left - 8}" y="${(y + 4).toFixed(1)}" class="chart-axis-label" text-anchor="end">${esc(axisValue(value, id, quote))}</text>`;
  }).join('');
  return `<text x="${left}" y="${(top - 7).toFixed(1)}" class="chart-pane-title">${esc(title)}</text>${rows}`;
}
function drawLine(values, min, max, left, top, width, height, color, extra = '') {
  const path = pathFor(values, min, max, left, top, width, height); return path ? `<path d="${path}" class="chart-line ${extra}" style="--line-color:${color}"></path>` : '';
}
function renderPricePane(visible, selected, candles, seriesMap, left, top, width, height, totalWidth, quote) {
  const candleValues = visible.flatMap((candle) => [Number(candle[2]), Number(candle[3])]);
  const overlays = selected.filter((id) => OVERLAYS.includes(id));
  const overlaySeriesValues = overlays.flatMap((id) => overlayValues(id, candles, seriesMap).flatMap((item) => item.slice(-visible.length)));
  const { min, max } = range(candleValues.concat(overlaySeriesValues));
  const grid = gridMarkup(min, max, 'price', quote, left, top + 18, width, height - 30, t('chart.panePrice'));
  const x = (index) => xFor(index, visible.length, left, width); const y = (value) => yFor(value, min, max, top + 18, height - 30);
  const candleWidth = Math.max(3, Math.min(10, width / visible.length * .62));
  const candlesSvg = visible.map((candle, index) => {
    const open = Number(candle[1]); const high = Number(candle[2]); const low = Number(candle[3]); const close = Number(candle[4]);
    const rising = close >= open; const bodyTop = y(Math.max(open, close)); const bodyHeight = Math.max(2, Math.abs(y(open) - y(close)));
    return `<g class="candle ${rising ? 'candle-up' : 'candle-down'}"><line x1="${x(index).toFixed(1)}" y1="${y(high).toFixed(1)}" x2="${x(index).toFixed(1)}" y2="${y(low).toFixed(1)}" class="candle-wick"></line><rect x="${(x(index) - candleWidth / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${candleWidth.toFixed(1)}" height="${bodyHeight.toFixed(1)}" rx="1.5" class="candle-body"></rect></g>`;
  }).join('');
  const overlaySvg = overlays.map((id) => {
    const parts = overlayValues(id, candles, seriesMap).map((item) => item.slice(-visible.length));
    return parts.map((item, index) => drawLine(item, min, max, left, top + 18, width, height - 30, COLORS[id], id === 'bollinger' ? 'chart-line-bollinger' : '')).join('');
  }).join('');
  return { markup: `<g class="chart-pane">${grid}<g clip-path="url(#chartClipPrice)">${candlesSvg}${overlaySvg}</g></g>`, min, max };
}
function renderOscillatorPane(id, candles, visible, seriesMap, left, top, width, height, quote) {
  const result = seriesMap?.get(id) || series(id, candles);
  let values = []; let lines = []; let forcedMin = null; let forcedMax = null;
  if (id === 'macd') { const line = result.map((item) => item.line).slice(-visible.length); const signal = result.map((item) => item.signal).slice(-visible.length); const histogram = result.map((item) => item.histogram).slice(-visible.length); values = [...line, ...signal, ...histogram]; const r = range([...values, 0]); const zero = yFor(0, r.min, r.max, top + 20, height - 36); const barWidth = Math.max(2, width / visible.length * .55); lines.push(`<line x1="${left}" y1="${zero.toFixed(1)}" x2="${(left + width).toFixed(1)}" y2="${zero.toFixed(1)}" class="chart-reference-line"></line>`); lines.push(histogram.map((value, index) => { const y = yFor(Math.max(0, value), r.min, r.max, top + 20, height - 36); const barY = yFor(Math.min(0, value), r.min, r.max, top + 20, height - 36); return `<rect x="${(xFor(index, visible.length, left, width) - barWidth / 2).toFixed(1)}" y="${Math.min(y, barY).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(1, Math.abs(barY - y)).toFixed(1)}" class="${value >= 0 ? 'chart-histogram-positive' : 'chart-histogram-negative'}"></rect>`; }).join('')); lines.push(drawLine(line, r.min, r.max, left, top + 20, width, height - 36, COLORS.macd)); lines.push(drawLine(signal, r.min, r.max, left, top + 20, width, height - 36, COLORS.stochastic, 'chart-line-secondary')); return `<g class="chart-pane">${gridMarkup(r.min, r.max, id, quote, left, top + 20, width, height - 36, paneTitle(id))}${lines.join('')}</g>`; }
  if (id === 'adx') { const value = result.map((item) => item.value).slice(-visible.length); const plus = result.map((item) => item.plus).slice(-visible.length); const minus = result.map((item) => item.minus).slice(-visible.length); values = [...value, ...plus, ...minus]; forcedMin = 0; forcedMax = 100; lines = [drawLine(value, forcedMin, forcedMax, left, top + 20, width, height - 36, COLORS.adx), drawLine(plus, forcedMin, forcedMax, left, top + 20, width, height - 36, COLORS.ema20, 'chart-line-secondary'), drawLine(minus, forcedMin, forcedMax, left, top + 20, width, height - 36, COLORS.candle, 'chart-line-secondary')]; }
  else { const scalar = result.map((item) => Number(item.value ?? item)).slice(-visible.length); values = scalar; if (['rsi', 'stochastic'].includes(id)) { forcedMin = 0; forcedMax = 100; } if (id === 'volume') forcedMin = 0; if (id === 'candle') { const clean = finite(scalar); forcedMin = Math.min(...clean, 0); forcedMax = Math.max(...clean, 0); } const scalarRange = range(values, forcedMin, forcedMax); lines = [drawLine(scalar, scalarRange.min, scalarRange.max, left, top + 20, width, height - 36, COLORS[id])]; }
  const r = range(values, forcedMin, forcedMax); const zero = r.min < 0 && r.max > 0 ? yFor(0, r.min, r.max, top + 20, height - 36) : null;
  if (zero !== null) lines.unshift(`<line x1="${left}" y1="${zero.toFixed(1)}" x2="${(left + width).toFixed(1)}" y2="${zero.toFixed(1)}" class="chart-reference-line"></line>`);
  return `<g class="chart-pane">${gridMarkup(r.min, r.max, id, quote, left, top + 20, width, height - 36, paneTitle(id))}${lines.join('')}</g>`;
}
function legend(selected) {
  return `<div class="chart-legend" aria-label="${esc(t('chart.legend'))}"><span class="legend-item"><i class="legend-swatch candle-swatch"></i>${esc(t('chart.candles'))}</span>${selected.map((id) => `<span class="legend-item"><i class="legend-swatch" style="--legend-color:${COLORS[id] || '#49e3c2'}"></i>${esc(indicatorLabel(id))}</span>`).join('')}</div>`;
}

export function renderTechnicalChart(candles, selectedIndicators = [], quote = 'USDT') {
  if (!Array.isArray(candles) || candles.length < 2) return `<div class="chart-empty">${esc(t('chart.empty'))}</div>`;
  const selected = [...new Set(selectedIndicators)].filter((id) => OVERLAYS.includes(id) || OSCILLATORS.includes(id));
  const visible = candles.slice(-72); const width = 760; const left = 64; const right = 18; const priceHeight = 282; const paneHeight = 126; const gap = 16;
  const plotWidth = width - left - right; const oscillatorIds = selected.filter((id) => OSCILLATORS.includes(id));
  const seriesMap = new Map(selected.map((id) => [id, series(id, candles)]));
  const totalHeight = 18 + priceHeight + oscillatorIds.length * (paneHeight + gap) + 34;
  const pricePane = renderPricePane(visible, selected, candles, seriesMap, left, 0, plotWidth, priceHeight, width, quote);
  let panes = pricePane.markup; oscillatorIds.forEach((id, index) => { panes += renderOscillatorPane(id, candles, visible, seriesMap, left, 18 + priceHeight + index * (paneHeight + gap), plotWidth, paneHeight, quote); });
  const tickIndexes = [0, Math.floor((visible.length - 1) / 2), visible.length - 1];
  const ticks = tickIndexes.map((index) => `<text x="${xFor(index, visible.length, left, plotWidth).toFixed(1)}" y="${totalHeight - 10}" class="chart-axis-label" text-anchor="middle">${new Date(Number(visible[index][0])).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}</text>`).join('');
  return `<div class="technical-chart"><div class="chart-toolbar"><div><span class="eyebrow">${esc(t('chart.eyebrow'))}</span><strong>${esc(t('chart.title'))}</strong></div><div class="chart-actions"><span class="chart-timeframe">${esc(t('chart.candleCount', { count: visible.length }))}</span><button class="small-button" type="button" data-chart-action="latest">${esc(t('chart.goLatest'))}</button><button class="small-button" type="button" data-chart-action="toggle-follow" aria-pressed="false">${esc(t('chart.followLatest'))}</button><button class="small-button" type="button" data-chart-action="toggle-stream" aria-pressed="false">${esc(t('chart.pauseStream'))}</button></div></div><div class="chart-frame"><svg viewBox="0 0 ${width} ${totalHeight}" role="img" aria-label="${esc(t('chart.ariaLabel'))}" preserveAspectRatio="none"><defs><clipPath id="chartClipPrice"><rect x="${left}" y="0" width="${plotWidth}" height="${priceHeight}"></rect></clipPath></defs>${panes}${ticks}</svg></div>${legend(selected)}</div>`;
}
