// 歷史，對應 Android 的 ui/HistoryScreen.kt。

import * as db from '../db.js';
import { HISTORY_DAYS, attendingOrder, dayLabel } from '../model.js';
import { attendingStyle, h, topBar } from '../ui.js';
import { overviewList } from './overview.js';

/** 歷史：列出保留的日期，點了進入該日唯讀總覽。 */
export function historyListScreen(nav) {
  const body = h('div', { class: 'scroll' });
  const el = h('section', { class: 'screen' }, topBar(() => nav.back(), '歷史'), body);

  (async () => {
    const days = await db.historyDays();
    body.replaceChildren(days.length === 0
      ? h('p', { class: 'empty' }, `還沒有歷史紀錄\n換日後會保留前一天的總覽（最近 ${HISTORY_DAYS} 份）`)
      : h('ul', { class: 'rows' }, days.map(d =>
        h('li', { class: 'row history-row', onclick: () => nav.go('historyDay', d.day) },
          h('div', { class: 'history-day' }, dayLabel(d.day)),
          h('div', { class: 'muted-text' }, `${d.patients} 位病人・${d.withNotes} 位有筆記`)))));
  })();

  return { el };
}

/** 某一天的唯讀總覽。標題為「主治 病房-床號 姓名 (病歷號)」，主治醫師依該日名單順序上色。 */
export function historyOverviewScreen(nav, day) {
  const body = h('div', { class: 'scroll paper' });
  const el = h('section', { class: 'screen' }, topBar(() => nav.back(), `${dayLabel(day)} 總覽`), body);

  (async () => {
    const snapshot = await db.history(day);
    const ps = snapshot?.patients ?? [];
    // 歷史不含出院日
    const items = ps.map((p, i) => ({ patient: { ...p, id: i, discharge: null }, segments: p.segments }));
    body.replaceChildren(overviewList(items, {
      withChartNo: true, style: attendingStyle(attendingOrder(ps), true), onOpen: null,
    }));
  })();

  return { el };
}
