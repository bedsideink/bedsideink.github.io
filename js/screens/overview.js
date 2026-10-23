// 總覽頁，對應 Android 的 ui/OverviewScreen.kt。

import * as db from '../db.js';
import { segmentsBottom } from '../ink.js';
import { filterMatches } from '../model.js';
import { currentAttendingStyle, state } from '../state.js';
import { LARGE_SIZE, h, notesSvg, patientTitle, topBar } from '../ui.js';

/** 筆跡下方保留的空白（單位）。 */
const BOTTOM_PAD = 250;

/**
 * 依序列出病人與筆記（沒有筆記的也列出）；onOpen 為 null 時唯讀（歷史總覽）。
 * items：[{ patient, segments }]
 */
export function overviewList(items, { withChartNo, style, onOpen }) {
  return h('ul', { class: 'overview' }, items.map(({ patient, segments }) =>
    h('li', { class: onOpen ? 'clickable' : null, onclick: onOpen && (() => onOpen(patient.id)) },
      patientTitle(patient, { withChartNo, size: LARGE_SIZE, style }),
      segments.length === 0
        ? h('p', { class: 'muted-text no-notes' }, '沒有筆記')
        : notesSvg(segments, segmentsBottom(segments) + BOTTOM_PAD))));
}

export function overviewScreen(nav) {
  const body = h('div', { class: 'scroll paper' });
  const el = h('section', { class: 'screen' }, topBar(() => nav.back(), '總覽'), body);

  // 每次顯示時即時組合所有筆記；從手寫頁返回時保留原本的捲動位置
  async function load() {
    const [all, segs] = await Promise.all([db.patients(), db.allSegments()]);
    const byPatient = new Map();
    for (const s of segs.sort((a, b) => a.seq - b.seq)) {
      byPatient.set(s.patientId, [...(byPatient.get(s.patientId) ?? []), s]);
    }
    const items = all.filter(p => filterMatches(state.filter, p))
      .map(p => ({ patient: p, segments: byPatient.get(p.id) ?? [] }));
    const scrollTop = body.scrollTop;
    body.replaceChildren(items.length === 0
      ? h('p', { class: 'empty' }, '還沒有病人')
      : overviewList(items, { withChartNo: false, style: currentAttendingStyle(all), onOpen: id => nav.go('write', id) }));
    body.scrollTop = scrollTop;
  }
  load();

  return { el, resume: load };
}
