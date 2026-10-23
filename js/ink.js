// 筆跡的純邏輯（不碰 DOM），由 web/test/ 在 Node 中測試。
// 對應 Android 的 ink/Stroke.kt、StrokeBuilder.kt、TitleComposer.kt。
// 一筆筆畫是 Float32Array [x0, y0, x1, y1, …]，直接存進 IndexedDB。

/** 畫布寬度固定為這麼多單位；所有筆跡座標以此正規化，與螢幕大小無關。 */
export const CANVAS_WIDTH = 10000;

/** 筆畫寬度（單位同座標）。 */
export const STROKE_WIDTH = 75;

/** 正在畫的那一筆。點太密時略過，minStep 為單位距離。 */
export class StrokeBuilder {
  constructor(minStep = 8) {
    this.minStep = minStep;
    this.pts = [];
  }

  get isActive() { return this.pts.length > 0; }

  add(x, y) {
    const n = this.pts.length;
    if (n > 0 && Math.hypot(x - this.pts[n - 2], y - this.pts[n - 1]) < this.minStep) return;
    this.pts.push(x, y);
  }

  /** 抬筆時一定收進最後一點，讓筆尾落在手指離開的位置。座標四捨五入到整數單位。 */
  finish(x, y) {
    const n = this.pts.length;
    if (n === 0 || this.pts[n - 2] !== x || this.pts[n - 1] !== y) this.pts.push(x, y);
    const s = Float32Array.from(this.pts, Math.round);
    this.clear();
    return s;
  }

  clear() { this.pts = []; }
}

export function translated(stroke, dx, dy) {
  return stroke.map((v, i) => v + (i % 2 === 0 ? dx : dy));
}

/** 筆跡外框，已含筆畫寬度；沒有筆畫時為 null。 */
export function bounds(strokes, strokeWidth = STROKE_WIDTH) {
  if (strokes.length === 0) return null;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const s of strokes) {
    for (let i = 0; i < s.length; i += 2) {
      const x = s[i], y = s[i + 1];
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > b) b = y;
    }
  }
  const h = strokeWidth / 2;
  return { left: l - h, top: t - h, right: r + h, bottom: b + h };
}

/** 段落間距，相對於標題高度。 */
const GAP_RATIO = 0.35;

/**
 * 新增病人的三格手寫 → 一行標題 { strokes, width, height }；全部空白時為 null。
 * 有筆跡的格子依序取出，各自左右裁掉空白後橫向拼接，段與段之間留間距；空白格略過。
 * 垂直方向以所有格子的共同上下界裁切，使各段高度相同、字的相對大小不變。
 * 每格的筆畫座標以該格左上角為原點。
 */
export function composeTitle(cells, strokeWidth = STROKE_WIDTH) {
  const used = cells.filter(c => c.length > 0);
  if (used.length === 0) return null;
  const all = bounds(used.flat(), strokeWidth);
  const height = all.bottom - all.top;
  const gap = height * GAP_RATIO;
  const strokes = [];
  let x = 0;
  used.forEach((cell, i) => {
    if (i > 0) x += gap;
    const b = bounds(cell, strokeWidth);
    for (const s of cell) strokes.push(translated(s, x - b.left, -all.top));
    x += b.right - b.left;
  });
  return { strokes, width: x, height };
}

/** 以相鄰點的中點做二次貝茲平滑的 SVG path 字串。單點筆畫靠圓頭畫成一個點。 */
export function pathData(pts, n = pts.length / 2) {
  if (n === 0) return '';
  const r = v => Math.round(v * 10) / 10;
  let d = `M${r(pts[0])} ${r(pts[1])}`;
  if (n === 1) return d + `L${r(pts[0])} ${r(pts[1])}`;
  for (let i = 1; i < n - 1; i++) {
    const x = pts[2 * i], y = pts[2 * i + 1];
    d += `Q${r(x)} ${r(y)} ${r((x + pts[2 * i + 2]) / 2)} ${r((y + pts[2 * i + 3]) / 2)}`;
  }
  return d + `L${r(pts[2 * n - 2])} ${r(pts[2 * n - 1])}`;
}

/** 各段筆記內容的最低點（含分隔線位置）。 */
export const segmentsBottom = segs => segs.reduce((m, s) => Math.max(m, s.bottomY, s.topY), 0);
