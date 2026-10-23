// 手寫頁，對應 Android 的 ui/WritingScreen.kt、WritingViewModel.kt。
// 每次進入所寫的筆畫成為一個新段落，離開或 app 進背景時自動儲存；沒寫任何東西就不建立段落。

import * as db from '../db.js';
import { bounds, segmentsBottom } from '../ink.js';
import { currentAttendingStyle } from '../state.js';
import { LARGE_SIZE, h, icon, patientTitle, topBar } from '../ui.js';
import { InkSurface, keepScreenOn } from '../surface.js';

/** 舊筆跡與本次筆跡之間的距離（單位）。 */
const SEPARATOR_GAP = 500;
/** 再次進入時，上次寫到的位置（本次分隔線）放在畫面這個高度。 */
const RESUME_AT = 0.25;

export function writeScreen(nav, patientId) {
  const title = h('div', { class: 'grow' });
  const undoBtn = h('button', { class: 'icon-btn', 'aria-label': '復原', disabled: true, onclick: () => undo() }, icon('undo'));
  const wrap = h('div', { class: 'ink-wrap' });
  const el = h('section', { class: 'screen' }, topBar(() => nav.back(), title, undoBtn), wrap);

  const day = db.today();
  let loaded = false;
  /** 已存的段落：[{ topY, bottomY, strokes }] */
  let old = [];
  /** 本次寫的筆畫；復原只作用在這裡。 */
  const session = [];
  /** 本次筆跡上方分隔線的位置；沒有舊筆跡時為 null。 */
  let separatorY = null;
  let oldBottom = 0;
  /** 目前所有內容（含分隔線）的最低點，用來限制往下捲動的範圍。 */
  let contentBottom = 0;
  let nextSeq = 0;
  let segmentId = null;
  let version = 0;
  let savedVersion = 0;
  /** 依序執行儲存，避免兩次儲存交錯 */
  let saving = Promise.resolve();

  const surface = new InkSurface(wrap, {
    draw(ctx, palette) {
      old.forEach((s, i) => {
        if (i > 0) surface.separator(ctx, s.topY, palette);
        surface.strokes(ctx, s.strokes, palette);
      });
      if (separatorY != null && (session.length > 0 || current.isActive)) surface.separator(ctx, separatorY, palette);
      surface.strokes(ctx, session, palette);
    },
    maxScroll: (scroll, viewH) => Math.max(0, contentBottom - viewH * RESUME_AT, scroll),
    onStroke(stroke) {
      session.push(stroke);
      changed();
    },
  });
  const current = surface.current;
  const wake = keepScreenOn();

  function changed() {
    version++;
    const b = bounds(session)?.bottom;
    contentBottom = b == null ? oldBottom : Math.max(oldBottom, separatorY ?? 0, b);
    undoBtn.disabled = session.length === 0;
    surface.redraw();
  }

  function undo() {
    if (session.length === 0) return;
    session.pop();
    changed();
  }

  function save() {
    if (!loaded || version === savedVersion) return saving;
    const strokes = [...session];
    const v = version;
    saving = saving.then(async () => {
      // 跨過午夜：筆記已被換日清空，不要寫回昨天的內容
      if (db.today() !== day) return;
      if (strokes.length === 0) {
        if (segmentId != null) await db.deleteSegment(segmentId);
        segmentId = null;
      } else {
        const seg = {
          patientId, seq: nextSeq, strokes, topY: separatorY ?? 0, bottomY: bounds(strokes).bottom,
        };
        if (segmentId == null) segmentId = await db.insertSegment(seg);
        else await db.updateSegment({ ...seg, id: segmentId });
      }
      savedVersion = v;
    }).catch(e => console.error('save failed', e));
    return saving;
  }

  (async () => {
    const [p, all, segs] = await Promise.all([db.patient(patientId), db.patients(), db.segments(patientId)]);
    if (p) title.append(patientTitle(p, { withChartNo: false, size: LARGE_SIZE, style: currentAttendingStyle(all) }));
    old = segs;
    if (segs.length > 0) {
      oldBottom = segmentsBottom(segs);
      separatorY = oldBottom + SEPARATOR_GAP;
      nextSeq = Math.max(...segs.map(s => s.seq)) + 1;
    }
    contentBottom = oldBottom;
    loaded = true;
    surface.start(viewH => (separatorY != null ? Math.max(0, separatorY - viewH * RESUME_AT) : 0));
  })();

  return {
    el,
    hide() { save(); wake.release(); },
    resume() { wake.acquire(); },
    destroy() { wake.release(); surface.dispose(); return save(); },
  };
}
