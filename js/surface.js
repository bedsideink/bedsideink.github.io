// 可書寫的畫布：手寫頁的長畫布與新增病人的格子共用。
// 底層 canvas 畫已完成的筆跡，上層 canvas 只畫正在寫的那一筆，寫字時不必重畫整頁。
//
// 觸控規則（DESIGN.md 4.7）：單指 = 寫字，雙指 = 捲動；第一指已開始畫、第二指落下時取消那一筆並改為捲動。
// iPad 加上 Apple Pencil：筆一律寫字，筆在畫面上時忽略手指（手掌）；
// 這次開 app 用過筆之後，手指不再寫字，單指即可捲動。

import { CANVAS_WIDTH, STROKE_WIDTH, StrokeBuilder, pathData } from './ink.js';

const SEPARATOR_WIDTH = 20;

/** 這次開 app 是否用過 Apple Pencil。 */
let penSeen = false;

const paths = new WeakMap();
function pathOf(stroke) {
  let p = paths.get(stroke);
  if (!p) paths.set(stroke, (p = new Path2D(pathData(stroke))));
  return p;
}

/** 畫布配色取自 CSS 變數；筆跡不存顏色，深淺色模式切換時已存的筆記也跟著換色。 */
let palette = null;
const dark = matchMedia('(prefers-color-scheme: dark)');
function currentPalette() {
  if (!palette) {
    const cs = getComputedStyle(document.documentElement);
    palette = { ink: cs.getPropertyValue('--ink').trim(), separator: cs.getPropertyValue('--separator').trim() };
  }
  return palette;
}
const surfaces = new Set();
dark.addEventListener('change', () => {
  palette = null;
  for (const s of surfaces) s.redraw();
});

export class InkSurface {
  /**
   * opts.draw(ctx, palette)：畫已完成的內容（單位座標）。
   * opts.onStroke(stroke)：完成一筆。
   * opts.maxScroll(scroll, viewHeight)：可捲動的最大值（單位）；沒有時不可捲動，座標限制在格內。
   */
  constructor(wrap, opts) {
    this.wrap = wrap;
    this.opts = opts;
    this.scrollable = opts.maxScroll != null;
    this.current = new StrokeBuilder();
    this.base = document.createElement('canvas');
    this.live = document.createElement('canvas');
    wrap.append(this.base, this.live);
    this.scroll = 0;
    this.scale = 1;
    this.w = 0;
    this.h = 0;
    this.frame = 0;
    /** 書寫中的 pointerId；null 表示沒有在寫 */
    this.writer = null;
    this.writerIsPen = false;
    /** 按著的手指：pointerId → clientY */
    this.touches = new Map();
    this.scrolling = false;
    this.lastCentroid = 0;
    this.lastPoint = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  /** 開始書寫；initialScroll(viewHeight) 回傳一開始的捲動位置（單位）。 */
  start(initialScroll) {
    this.resize();
    if (initialScroll) this.scroll = initialScroll(this.h / this.scale);
    this.resizeObserver.observe(this.wrap);
    surfaces.add(this);
    const w = this.wrap;
    this.handlers = {
      pointerdown: e => this.down(e),
      pointermove: e => this.move(e),
      pointerup: e => this.up(e, true),
      pointercancel: e => this.up(e, false),
      lostpointercapture: e => this.up(e, false),
      // 擋掉 iOS 的放大鏡、長按選單、雙擊縮放
      touchstart: e => e.preventDefault(),
      wheel: e => { if (this.scrollable) { e.preventDefault(); this.scrollBy(-e.deltaY); } },
    };
    for (const [type, fn] of Object.entries(this.handlers)) w.addEventListener(type, fn, { passive: false });
    this.redraw();
  }

  dispose() {
    this.resizeObserver.disconnect();
    surfaces.delete(this);
    for (const [type, fn] of Object.entries(this.handlers ?? {})) this.wrap.removeEventListener(type, fn);
  }

  resize() {
    const r = this.wrap.getBoundingClientRect();
    if (r.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.w = r.width;
    this.h = r.height;
    this.dpr = dpr;
    this.scale = r.width / CANVAS_WIDTH;
    for (const c of [this.base, this.live]) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    this.redraw();
  }

  unit(e) {
    const r = this.wrap.getBoundingClientRect();
    let x = (e.clientX - r.left) / this.scale;
    let y = (e.clientY - r.top) / this.scale + this.scroll;
    if (!this.scrollable) {
      x = Math.min(Math.max(x, 0), CANVAS_WIDTH);
      y = Math.min(Math.max(y, 0), this.h / this.scale);
    }
    return [x, y];
  }

  down(e) {
    e.preventDefault();
    try { this.wrap.setPointerCapture(e.pointerId); } catch { /* 已放開 */ }
    if (e.pointerType === 'pen') {
      penSeen = true;
      if (this.writer != null && !this.writerIsPen) this.current.clear();
      this.scrolling = false;
      this.beginStroke(e, true);
      return;
    }
    if (this.writer != null && this.writerIsPen) return; // 筆在畫面上：手掌
    this.touches.set(e.pointerId, e.clientY);
    if (!this.scrollable) {
      if (this.writer == null && !penSeen) this.beginStroke(e, false);
      return;
    }
    if (this.scrolling) {
      this.lastCentroid = this.centroid();
    } else if (this.writer == null && !penSeen && this.touches.size === 1) {
      this.beginStroke(e, false);
    } else {
      // 第二指落下（或用過筆後的單指）：取消那一筆半成品，改為捲動
      this.writer = null;
      this.current.clear();
      this.scrolling = true;
      this.lastCentroid = this.centroid();
      this.drawLive();
    }
  }

  beginStroke(e, pen) {
    this.writer = e.pointerId;
    this.writerIsPen = pen;
    this.current.clear();
    const [x, y] = this.unit(e);
    this.current.add(x, y);
    this.lastPoint = [x, y];
    this.requestLive();
  }

  move(e) {
    if (e.pointerId === this.writer) {
      const events = e.getCoalescedEvents?.() ?? [];
      for (const c of events.length ? events : [e]) {
        const [x, y] = this.unit(c);
        this.current.add(x, y);
        this.lastPoint = [x, y];
      }
      this.requestLive();
    } else if (this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, e.clientY);
      if (this.scrolling) {
        const c = this.centroid();
        this.scrollBy(c - this.lastCentroid);
        this.lastCentroid = c;
      }
    }
  }

  up(e, finished) {
    if (e.pointerId === this.writer) {
      this.writer = null;
      if (finished) {
        const [x, y] = this.lastPoint;
        this.opts.onStroke(this.current.finish(x, y));
      } else {
        this.current.clear();
      }
      this.requestLive();
    }
    if (this.touches.delete(e.pointerId)) {
      if (this.touches.size === 0) this.scrolling = false;
      else this.lastCentroid = this.centroid();
    }
  }

  centroid() {
    let sum = 0;
    for (const y of this.touches.values()) sum += y;
    return sum / this.touches.size;
  }

  /** 手指往下移 dy 像素 → 內容往下（捲動位置變小）。 */
  scrollBy(dy) {
    const next = this.scroll - dy / this.scale;
    this.scroll = Math.min(Math.max(next, 0), this.opts.maxScroll(this.scroll, this.h / this.scale));
    this.redraw();
  }

  transform(ctx) {
    const k = this.dpr * this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, -this.scroll * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  /** 整頁重畫（下一個畫面更新時）。 */
  redraw() {
    this.needBase = true;
    this.requestLive();
  }

  requestLive() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.needBase) {
        this.needBase = false;
        const ctx = this.base.getContext('2d');
        this.transform(ctx);
        this.opts.draw(ctx, currentPalette());
      }
      this.drawLive();
    });
  }

  drawLive() {
    const ctx = this.live.getContext('2d');
    this.transform(ctx);
    if (this.current.isActive) {
      const p = currentPalette();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = STROKE_WIDTH;
      ctx.stroke(new Path2D(pathData(this.current.pts)));
    }
  }

  strokes(ctx, list, p) {
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = STROKE_WIDTH;
    for (const s of list) ctx.stroke(pathOf(s));
  }

  separator(ctx, y, p) {
    ctx.strokeStyle = p.separator;
    ctx.lineWidth = SEPARATOR_WIDTH;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
    ctx.lineCap = 'round';
  }
}

/** 手寫頁開著時螢幕不自動熄滅；app 進背景時系統會自動釋放，回前景再要一次。 */
export function keepScreenOn() {
  let lock = null;
  let wanted = true;
  const acquire = async () => {
    wanted = true;
    if (lock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
      if (!wanted) release();
    } catch { /* 不支援或被拒：照常使用 */ }
  };
  const release = () => {
    wanted = false;
    lock?.release().catch(() => {});
    lock = null;
  };
  acquire();
  return { acquire, release };
}
