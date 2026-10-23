// 選擇畫面與主治醫師列表，對應 Android 的 ui/StartScreen.kt。

import * as db from '../db.js';
import { ALL, attendingOrder, hasUnassigned } from '../model.js';
import { state } from '../state.js';
import { h, icon, topBar } from '../ui.js';

/**
 * 開 app 時的選擇畫面：掃描名單，或選所有病人清單、依主治醫師。
 * autoSkip 且名單只有一位（或沒有）主治醫師時直接進入所有病人清單（「未指定」不算）。
 */
export function startScreen(nav) {
  const el = h('section', { class: 'screen start' });
  let doctors = [];

  const content = h('div', { class: 'start-content' },
    h('button', { class: 'scan-big', onclick: () => { state.autoSkip = false; nav.go('scan'); } },
      icon('qr', 80), h('span', null, '掃描')),
    h('h1', null, 'BedsideInk'),
    h('button', { class: 'mode-btn primary', onclick: () => { state.autoSkip = false; nav.openList(ALL); } },
      icon('list'), '所有病人清單'),
    h('button', {
      class: 'mode-btn tonal',
      onclick: () => {
        state.autoSkip = false;
        // 只有一位主治醫師時不必再選
        if (doctors.length === 1) nav.openList({ kind: 'doctor', name: doctors[0] });
        else nav.go('doctors');
      },
    }, icon('doctors'), '根據主治醫師顯示病人'));

  async function load() {
    doctors = attendingOrder(await db.patients());
    if (state.autoSkip && doctors.length <= 1) {
      nav.openList(ALL);
      return;
    }
    // 資料還沒讀到，或即將自動跳過時不顯示，避免閃一下
    if (!content.isConnected) el.append(content);
  }
  load();

  return { el, resume: load };
}

/** 主治醫師列表，依名單中第一次出現的順序。 */
export function doctorsScreen(nav) {
  const body = h('div', { class: 'scroll' });
  const el = h('section', { class: 'screen' }, topBar(() => nav.back(), '主治醫師'), body);

  async function load() {
    const ps = await db.patients();
    const entries = attendingOrder(ps).map(n => [n, { kind: 'doctor', name: n }]);
    if (hasUnassigned(ps)) entries.push(['未指定', { kind: 'none' }]);
    body.replaceChildren(entries.length === 0
      ? h('p', { class: 'empty' }, '還沒有主治醫師資料，請先掃描名單')
      : h('ul', { class: 'rows' }, entries.map(([label, filter]) =>
        h('li', { class: 'row doctor-row', onclick: () => nav.openList(filter) }, label))));
  }
  load();

  return { el, resume: load };
}
