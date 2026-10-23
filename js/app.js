// 進入點：導覽堆疊、app 生命週期（進背景存檔、回前景檢查換日）、Service Worker 更新。
// 對應 Android 的 ui/BedsideNav.kt。

import * as db from './db.js';
import { h } from './ui.js';
import { state } from './state.js';
import { startScreen, doctorsScreen } from './screens/start.js';
import { listScreen } from './screens/list.js';
import { writeScreen } from './screens/write.js';
import { newPatientScreen } from './screens/newpatient.js';
import { overviewScreen } from './screens/overview.js';
import { historyListScreen, historyOverviewScreen } from './screens/history.js';
import { scanScreen } from './screens/scan.js';

const SCREENS = {
  start: startScreen,
  doctors: doctorsScreen,
  list: listScreen,
  write: writeScreen,
  new: newPatientScreen,
  overview: overviewScreen,
  history: historyListScreen,
  historyDay: historyOverviewScreen,
  scan: scanScreen,
};

const root = document.getElementById('app');
/** 導覽堆疊：[{ name, screen: { el, resume?, hide?, destroy? } }]；下層畫面保留 DOM（捲動位置、展開狀態）。 */
const stack = [];

const top = () => stack[stack.length - 1];

function mount(name, args) {
  const entry = { name };
  // 只接受目前最上層畫面發出的導覽，避免連點造成重複開頁或多退一頁
  const nav = {
    go: (n, ...a) => { if (top() === entry) push(n, a); },
    back: () => { if (top() === entry) pop(); },
    openList: f => { if (top() === entry) openList(f, name); },
    modes: () => { if (top() === entry) { state.autoSkip = false; reset('start'); } },
    /** 篩選的主治醫師已不在名單中（例如重新掃描後），回到主治醫師列表 */
    filterGone: () => { if (top() === entry) replace('doctors'); },
  };
  entry.screen = SCREENS[name](nav, ...args);
  return entry;
}

function show(entry) {
  for (const e of stack) e.screen.el.hidden = e !== entry;
}

function push(name, args = []) {
  const prev = top();
  prev?.screen.hide?.();
  const entry = mount(name, args);
  stack.push(entry);
  root.append(entry.screen.el);
  show(entry);
}

/** 回傳畫面離開時的存檔 promise。 */
function remove(entry) {
  const saved = entry.screen.destroy?.();
  entry.screen.el.remove();
  return saved;
}

function pop() {
  if (stack.length <= 1) return;
  const saved = remove(stack.pop());
  const entry = top();
  show(entry);
  // 等離開的畫面存完再重新整理，剛寫的內容才會出現
  Promise.resolve(saved).finally(() => { if (top() === entry) entry.screen.resume?.(); });
}

function replace(name, args = []) {
  const old = stack.pop();
  if (old) remove(old);
  push(name, args);
}

function reset(name) {
  while (stack.length) remove(stack.pop());
  push(name);
}

/** 進入清單；從選擇畫面進入時取代它（清單沒有返回鍵，用左上的「選擇顯示方式」回去）。 */
function openList(filter, from) {
  state.filter = filter;
  if (from === 'start') replace('list');
  else push('list');
}

/** 換日：資料已清空，回到清單（清單不在堆疊中時不動）。 */
function popToList() {
  const i = stack.findIndex(e => e.name === 'list');
  if (i < 0) return;
  while (stack.length > i + 1) remove(stack.pop());
  show(top());
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') {
    top()?.screen.hide?.();
  } else {
    if (await db.ensureToday()) popToList();
    top()?.screen.resume?.();
  }
});
// iOS 關閉 app 時不一定有 visibilitychange
window.addEventListener('pagehide', () => top()?.screen.hide?.());

/** Service Worker：離線可用；有新版時顯示提示列，由使用者決定何時重新載入。 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = worker => {
      if (!navigator.serviceWorker.controller || document.querySelector('.update-bar')) return;
      document.body.append(h('button', {
        class: 'update-bar',
        onclick: () => {
          top()?.screen.hide?.();
          worker.postMessage('skipWaiting');
        },
      }, '有新版本，點此重新載入'));
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    // 回到前景時檢查更新
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}

async function start() {
  // 加入主畫面的 app 不會被自動清除；在 Safari 分頁中則盡量要求保留
  navigator.storage?.persist?.().catch(() => {});
  await db.ensureToday();
  push('start');
  registerServiceWorker();
}

start();
