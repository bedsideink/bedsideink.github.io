// 共用的 DOM 工具：元素建立、圖示、唯讀筆跡（SVG）、病人標題、對話框。

import { CANVAS_WIDTH, STROKE_WIDTH, pathData } from './ink.js';
import { isHandwritten, titleText } from './model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** h('div', { class: 'x', onclick: fn, style: {…} }, 子元素或文字…) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  setProps(el, props);
  el.append(...children.flat().filter(c => c != null && c !== false));
  return el;
}

function setProps(el, props) {
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
}

export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  setProps(el, props);
  el.append(...children.filter(c => c != null));
  return el;
}

/** Material Icons 的路徑（24×24）。 */
const ICONS = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  list: 'M3 14h4v-4H3v4zm0 5h4v-4H3v4zM3 9h4V5H3v4zm5 5h13v-4H8v4zm0 5h13v-4H8v4zM8 5v4h13V5H8z',
  book: 'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z',
  edit: 'M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z',
  delete: 'M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z',
  qr: 'M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5zm-6 8h1.5v1.5H13V13zm1.5 1.5H16V16h-1.5v-1.5zM16 13h1.5v1.5H16V13zm-3 3h1.5v1.5H13V16zm1.5 1.5H16V19h-1.5v-1.5zM16 16h1.5v1.5H16V16zm1.5-1.5H19V16h-1.5v-1.5zm0 3H19V19h-1.5v-1.5zM22 7h-2V4h-3V2h5v5zm0 15v-5h-2v3h-3v2h5zM2 22h5v-2H4v-3H2v5zM2 2v5h2V4h3V2H2z',
  // 「依主治醫師」：一個人頭，下方三條清單線
  doctors: 'M8.5 6a3.5 3.5 0 1 1 7 0a3.5 3.5 0 1 1 -7 0zM4 12h16v2H4zM4 16h16v2H4zM4 20h16v2H4z',
};

export function icon(name, size = 24) {
  return svg('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'icon', 'aria-hidden': 'true' },
    svg('path', { d: ICONS[name] }));
}

/** 頂端列：返回鍵、標題、右側動作。 */
export function topBar(onBack, title, ...actions) {
  return h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn', 'aria-label': '返回', onclick: onBack }, icon('back')),
    h('div', { class: 'topbar-title' }, title),
    ...actions);
}

/** 唯讀筆跡：每筆一個 path，顏色由 CSS 決定（深淺色模式切換時跟著變）。 */
function strokePaths(strokes, width = STROKE_WIDTH) {
  const g = svg('g', { class: 'ink', 'stroke-width': width });
  for (const s of strokes) g.append(svg('path', { d: pathData(s) }));
  return g;
}

/** 依序畫各段筆記，第二段起上方畫分隔線。 */
function segmentsGroup(segments) {
  const g = svg('g');
  segments.forEach((s, i) => {
    if (i > 0) g.append(svg('line', { class: 'separator', x1: 0, x2: CANVAS_WIDTH, y1: s.topY, y2: s.topY }));
    g.append(strokePaths(s.strokes));
  });
  return g;
}

/** 整頁寬的筆記，高度到 height 單位為止（總覽）。 */
export function notesSvg(segments, height) {
  return svg('svg', { class: 'notes', viewBox: `0 0 ${CANVAS_WIDTH} ${height}`, preserveAspectRatio: 'xMinYMin meet' },
    segmentsGroup(segments));
}

/** 整份筆記等比例縮小放進框內（清單頁預覽）；上下各留 pad/2 單位。 */
export function previewSvg(segments, contentHeight, pad) {
  return svg('svg', {
    class: 'notes fit', viewBox: `0 ${-pad / 2} ${CANVAS_WIDTH} ${contentHeight}`, preserveAspectRatio: 'xMidYMin meet',
  }, segmentsGroup(segments));
}

/** 筆跡標題相對於字級的高度，讓它和文字標題看起來差不多大。 */
const INK_TITLE_HEIGHT_EM = 1.35;
const MIN_TITLE_STROKE_PX = 2;

function inkTitle(p, fontSize) {
  const heightPx = fontSize * INK_TITLE_HEIGHT_EM;
  const scale = heightPx / p.titleHeight;
  // 標題縮小後筆畫會變細，保持最小線寬讓它和文字一樣清楚
  const width = Math.max(STROKE_WIDTH, MIN_TITLE_STROKE_PX / scale);
  return svg('svg', {
    class: 'ink-title', viewBox: `0 0 ${p.titleWidth} ${p.titleHeight}`,
    width: heightPx * p.titleWidth / p.titleHeight, height: heightPx,
  }, strokePaths(p.titleInk, width));
}

/**
 * 主治醫師名字的配色：order 為醫師出現順序，決定用第幾色；
 * colored 為 false 時用預設文字色（依主治醫師篩選時）。
 */
export function attendingStyle(order, colored) {
  const index = new Map(order.map((n, i) => [n, i]));
  return name => (colored && index.has(name) ? `att-${index.get(name) % 7}` : null);
}

/**
 * 病人標題；有主治醫師時，名字以較小字級放在最前面。
 * size：{ title, attending }（px）。
 */
export function patientTitle(p, { withChartNo, size, style }) {
  const attending = p.attending != null
    ? h('span', { class: ['attending', style?.(p.attending)].filter(Boolean).join(' '), style: { fontSize: size.attending + 'px' } }, p.attending)
    : null;
  const el = h('div', { class: 'patient-title', style: { fontSize: size.title + 'px' } });
  if (isHandwritten(p)) {
    el.classList.add('ink-row');
    el.append(...[attending, inkTitle(p, size.title)].filter(Boolean));
  } else {
    if (attending) el.append(attending, '\u00a0\u00a0');
    el.append(titleText(p, withChartNo));
  }
  return el;
}

export const LIST_SIZE = { title: 16, attending: 13 };
export const LARGE_SIZE = { title: 22, attending: 20 };

/** 確認對話框，回傳 Promise<boolean>。 */
export function confirmDialog(body, okLabel, { danger = false } = {}) {
  return new Promise(resolve => {
    const close = ok => { overlay.remove(); resolve(ok); };
    const overlay = h('div', { class: 'overlay', onclick: e => { if (e.target === overlay) close(false); } },
      h('div', { class: 'dialog', role: 'dialog' },
        h('div', { class: 'dialog-body' }, body),
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'text-btn', onclick: () => close(false) }, '取消'),
          h('button', { class: 'text-btn' + (danger ? ' danger' : ''), onclick: () => close(true) }, okLabel))));
    document.body.append(overlay);
  });
}
