// 純邏輯（不碰 DOM、IndexedDB），由 web/test/ 在 Node 中測試。
// 對應 Android 的 data/ImportPayload.kt、ImportPlan.kt、TitleFormat.kt、Attendings.kt。

const PREFIX = 'BI';
const VERSION = 2;

/** 歷史總覽保留的份數。 */
export const HISTORY_DAYS = 7;

/** 本地日期的 ISO 字串 "2026-10-23"；換日以 00:00 為界。 */
export function isoDay(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * HTML 匯入頁產生的 QR 內容（格式 BI2）：
 * ```
 * BI2|yyyyMMdd|人數
 * 主治|病房-床號|姓名|病歷號|出院日(民國7碼，可空)
 * ```
 * 回傳 { ok: { day, patients } }、{ foreign: true }（不是 BedsideInk 的 QR）或 { invalid: 原因 }。
 */
export function parsePayload(text) {
  const lines = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
  const header = lines[0].split('|');
  if (!header[0].startsWith(PREFIX)) return { foreign: true };
  const v = header[0].slice(PREFIX.length);
  const version = /^\d+$/.test(v) ? Number(v) : NaN;
  if (Number.isNaN(version) || version > VERSION) {
    return { invalid: `不支援的格式 ${header[0]}，請更新 app` };
  }
  if (version < VERSION) return { invalid: `匯入頁是舊版（${header[0]}），請更新匯入頁` };
  if (header.length !== 3) return { invalid: '表頭格式錯誤' };
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(header[1]);
  const date = m && new Date(+m[1], +m[2] - 1, +m[3]);
  if (!m || date.getMonth() !== +m[2] - 1 || date.getDate() !== +m[3]) return { invalid: '日期格式錯誤' };
  if (!/^\d+$/.test(header[2])) return { invalid: '人數格式錯誤' };
  const count = Number(header[2]);
  const rows = lines.slice(1);
  if (rows.length !== count) return { invalid: `人數不符：應有 ${count} 位，讀到 ${rows.length} 位` };
  const patients = [];
  for (const row of rows) {
    const f = row.split('|');
    if (f.length !== 5 || !f[0].trim() || !f[1].trim() || !f[2].trim()) {
      return { invalid: `資料格式錯誤：${row}` };
    }
    patients.push({ attending: f[0], bed: f[1], name: f[2], chartNo: f[3], discharge: f[4] });
  }
  return { ok: { day: `${m[1]}-${m[2]}-${m[3]}`, patients } };
}

export const isHandwritten = p => p.titleInk != null;

const matchKey = (bed, name) => `${bed}|${name}`;

/**
 * 同日重新掃描時，新名單如何套用到既有病人：
 * - 以「病房-床號＋姓名」比對；比對到的保留 id（筆記跟著保留），更新順序與主治、病歷號、出院日
 * - 新名單沒有的匯入病人刪除（連同筆記）
 * - 手寫新增的病人保留（含所屬主治），排在新名單之後
 */
export function computeImportPlan(existing, incoming) {
  const bySort = (a, b) => a.sortOrder - b.sortOrder;
  const pool = new Map();
  for (const p of existing.filter(p => !isHandwritten(p)).sort(bySort)) {
    const k = matchKey(p.bed, p.name);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(p);
  }
  const updates = [];
  const inserts = [];
  incoming.forEach((p, i) => {
    const match = pool.get(matchKey(p.bed, p.name))?.shift();
    const discharge = p.discharge || null;
    if (match) {
      updates.push({ ...match, sortOrder: i, attending: p.attending, chartNo: p.chartNo, discharge });
    } else {
      inserts.push({
        sortOrder: i, attending: p.attending, bed: p.bed, name: p.name,
        chartNo: p.chartNo, discharge, titleInk: null, titleWidth: 0, titleHeight: 0,
      });
    }
  });
  existing.filter(isHandwritten).sort(bySort)
    .forEach((h, j) => updates.push({ ...h, sortOrder: incoming.length + j }));
  const deletes = [...pool.values()].flat().map(p => p.id);
  return { updates, inserts, deletes };
}

/** 主治醫師的順序：依清單順序第一次出現的先後，決定醫師列表順序與名字顏色。 */
export function attendingOrder(patients) {
  const seen = new Set();
  for (const p of [...patients].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (p.attending != null) seen.add(p.attending);
  }
  return [...seen];
}

/** 有沒有沒主治醫師的匯入病人（BI1 匯入的舊資料），醫師列表另列「未指定」。 */
export const hasUnassigned = patients => patients.some(p => !isHandwritten(p) && p.attending == null);

/**
 * 清單、總覽要顯示哪些病人：{ kind: 'all' }、{ kind: 'doctor', name }、{ kind: 'none' }（未指定）。
 */
export const ALL = Object.freeze({ kind: 'all' });

export function filterMatches(filter, p) {
  switch (filter.kind) {
    case 'doctor': return p.attending === filter.name;
    case 'none': return p.attending == null;
    default: return true;
  }
}

/** 在此篩選下新增的手寫病人歸給誰 */
export const filterAttending = filter => (filter.kind === 'doctor' ? filter.name : null);

/** 文字標題格式（DESIGN.md 4.3）。手寫新增的病人另以筆跡顯示。 */
export function displayChartNo(s) {
  const t = s.replace(/^0+/, '');
  return t || (s ? '0' : '');
}

/** "1151017" → "10/17" */
export function displayDischarge(roc) {
  if (roc == null || roc.length !== 7) return null;
  const m = roc.slice(3, 5), d = roc.slice(5, 7);
  if (!/^\d\d$/.test(m) || !/^\d\d$/.test(d)) return null;
  return `${Number(m)}/${Number(d)}`;
}

/** 清單頁 `8A-07 張美玲 (234567) 10/17`；總覽、手寫頁不含病歷號。 */
export function titleText(p, withChartNo) {
  let s = `${p.bed ?? ''} ${p.name ?? ''}`;
  const chart = p.chartNo ? displayChartNo(p.chartNo) : '';
  if (withChartNo && chart) s += ` (${chart})`;
  const d = displayDischarge(p.discharge);
  if (d) s += ` ${d}`;
  return s;
}

const WEEKDAYS = '日一二三四五六';

/** "2026-10-20" → "10/20（二）" */
export function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
}
