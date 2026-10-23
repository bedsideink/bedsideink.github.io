// 新增病人：上中下三格手寫，對應 Android 的 ui/NewPatientScreen.kt。
// 離開或 app 進背景時自動存檔：第一次存時新增病人，之後（從背景回來繼續寫）更新同一位病人的標題；
// 全部復原則刪除。存了就不能修改。

import * as db from '../db.js';
import { composeTitle } from '../ink.js';
import { filterAttending } from '../model.js';
import { state } from '../state.js';
import { InkSurface } from '../surface.js';
import { h, icon, topBar } from '../ui.js';

const CELLS = 3;

export function newPatientScreen(nav) {
  const attending = filterAttending(state.filter);
  const day = db.today();
  /** 每格的筆畫 */
  const cells = Array.from({ length: CELLS }, () => []);
  /** 每一筆寫在哪一格，供「復原至上一筆」跨格使用。 */
  const order = [];
  let patientId = null;
  let version = 0;
  let savedVersion = 0;
  let saving = Promise.resolve();

  const undoBtn = h('button', { class: 'icon-btn', 'aria-label': '復原', disabled: true, onclick: () => undo() }, icon('undo'));
  const surfaces = [];
  const cellEls = cells.map((strokes, i) => {
    const wrap = h('div', { class: 'ink-wrap cell' });
    const surface = new InkSurface(wrap, {
      draw: (ctx, palette) => surface.strokes(ctx, strokes, palette),
      onStroke(s) {
        strokes.push(s);
        order.push(i);
        changed();
      },
    });
    surfaces.push(surface);
    return wrap;
  });

  const el = h('section', { class: 'screen' },
    topBar(() => nav.back(), '新增病人', undoBtn),
    h('div', { class: 'scroll' },
      h('p', { class: 'hint' }, '每格寫床號、姓名或其他資訊；按返回時自動存檔，依上、中、下拼成一行標題，之後不能修改。'),
      h('div', { class: 'cells' }, cellEls)));

  // 等版面配置好再量格子大小
  requestAnimationFrame(() => surfaces.forEach(s => s.start()));

  function changed() {
    version++;
    undoBtn.disabled = order.length === 0;
    surfaces.forEach(s => s.redraw());
  }

  function undo() {
    const i = order.pop();
    if (i == null) return;
    cells[i].pop();
    changed();
  }

  /** 返回時（destroy）自動存檔；一筆都沒寫就不新增病人。 */
  function save() {
    if (version === savedVersion) return saving;
    const title = composeTitle(cells);
    const v = version;
    saving = saving.then(async () => {
      // 跨過午夜：手寫新增的病人已被換日清空，不要寫回
      if (db.today() !== day) return;
      if (title == null) {
        if (patientId != null) await db.deletePatient(patientId);
        patientId = null;
      } else if (patientId == null) {
        patientId = await db.addHandwritten(title, attending);
      } else {
        await db.updateHandwrittenTitle(patientId, title);
      }
      savedVersion = v;
    }).catch(e => console.error('save failed', e));
    return saving;
  }

  return {
    el,
    hide: save,
    destroy() { surfaces.forEach(s => s.dispose()); return save(); },
  };
}
