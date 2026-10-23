// 病人清單頁（主畫面），對應 Android 的 ui/ListScreen.kt。

import * as db from '../db.js';
import { filterMatches, isHandwritten } from '../model.js';
import { segmentsBottom } from '../ink.js';
import { currentAttendingStyle, state } from '../state.js';
import { LARGE_SIZE, LIST_SIZE, confirmDialog, h, icon, patientTitle, previewSvg } from '../ui.js';

/** 預覽中筆跡上下保留的空白（單位）。 */
const PREVIEW_PAD = 250;

export function listScreen(nav) {
  const banner = h('div', { class: 'banner', hidden: true }, '未更新：今天還沒掃描名單');
  const body = h('div', { class: 'scroll' });
  const el = h('section', { class: 'screen' },
    h('header', { class: 'list-bar' },
      h('div', { class: 'list-buttons' },
        h('button', { class: 'icon-btn tonal', 'aria-label': '選擇顯示方式', onclick: () => nav.modes() }, icon('doctors')),
        h('button', { class: 'bar-btn primary', onclick: () => nav.go('scan') }, icon('qr', 18), '掃描'),
        h('button', { class: 'bar-btn tonal', onclick: () => nav.go('new') }, icon('add', 18), '新增病人'),
        h('button', { class: 'bar-btn tonal', onclick: () => nav.go('overview') }, icon('list', 18), '總覽'),
        h('button', { class: 'icon-btn tonal', 'aria-label': '歷史', onclick: () => nav.go('history') }, icon('book'))),
      banner),
    body);

  /** 從手寫頁返回時維持展開狀態。 */
  let expandedId = null;
  let list = [];
  let style = () => null;

  async function load() {
    const [all, meta] = await Promise.all([db.patients(), db.meta()]);
    banner.hidden = meta?.scannedToday === true;
    list = all.filter(p => filterMatches(state.filter, p));
    style = currentAttendingStyle(all);
    // 名單中已沒有篩選的主治醫師（例如重新掃描後）
    if (state.filter.kind !== 'all' && all.length > 0 && list.length === 0) {
      nav.filterGone();
      return;
    }
    // 展開中的病人被刪除時收起
    if (!list.some(p => p.id === expandedId)) expandedId = null;
    await render();
  }

  async function render() {
    const scrollTop = body.scrollTop;
    if (list.length === 0) {
      body.replaceChildren(h('p', { class: 'empty' }, '還沒有病人，按「掃描」匯入'));
      return;
    }
    const segs = expandedId != null ? await db.segments(expandedId) : [];
    body.replaceChildren(h('ul', { class: 'rows' }, list.map(p => row(p, segs))));
    sizePreview();
    body.scrollTop = scrollTop;
  }

  /** 預覽框撐滿版面，只留展開那一列和前後各一列。 */
  function sizePreview() {
    const box = body.querySelector('.preview');
    if (!box) return;
    const rowH = body.querySelector('.patient-row').offsetHeight;
    box.style.height = Math.max(body.clientHeight - rowH * 3, rowH * 2) + 'px';
  }

  function row(p, segs) {
    const li = h('li', { class: 'patient' },
      h('div', { class: 'row patient-row', onclick: () => toggle(p.id) },
        h('div', { class: 'grow' }, patientTitle(p, { withChartNo: true, size: LIST_SIZE, style })),
        h('button', { class: 'icon-btn muted', 'aria-label': '手寫', onclick: e => { e.stopPropagation(); nav.go('write', p.id); } }, icon('edit')),
        h('button', { class: 'icon-btn muted', 'aria-label': '刪除', onclick: e => { e.stopPropagation(); askDelete(p); } }, icon('delete'))));
    if (p.id === expandedId) li.append(preview(p, segs));
    return li;
  }

  /** 唯讀筆記預覽：整份筆記等比例縮小放進框內，上下各留前一位與後一位病人那一列。 */
  function preview(p, segs) {
    const box = h('div', { class: 'preview', onclick: () => nav.go('write', p.id) });
    if (segs.length === 0) box.append(h('span', { class: 'muted-text' }, '還沒有筆記'));
    else box.append(previewSvg(segs, segmentsBottom(segs) + PREVIEW_PAD, PREVIEW_PAD));
    return box;
  }

  async function toggle(id) {
    expandedId = expandedId === id ? null : id;
    await render();
    if (expandedId == null) return;
    const rows = body.querySelectorAll('.patient');
    const i = list.findIndex(p => p.id === id);
    body.scrollTo({ top: rows[Math.max(0, i - 1)].offsetTop, behavior: 'smooth' });
  }

  async function askDelete(p) {
    const message = isHandwritten(p)
      ? [h('p', { class: 'dialog-title' }, '確定刪除這位病人？'), patientTitle(p, { withChartNo: false, size: LARGE_SIZE })]
      : [h('p', { class: 'dialog-title' }, `確定刪除 ${p.bed} ${p.name}？`)];
    const ok = await confirmDialog([...message, h('p', { class: 'muted-text' }, '今天的筆記會一起刪除。')], '刪除', { danger: true });
    if (!ok) return;
    await db.deletePatient(p.id);
    await load();
  }

  load();
  return { el, resume: load };
}
