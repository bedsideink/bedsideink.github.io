// IndexedDB 資料層，對應 Android 的 data/Repository.kt。
// patients：病人（匯入或手寫新增，done 為清單頁勾選的「已處理」）；segments：每次進入手寫頁所寫的一段筆記；
// meta：單筆狀態 { day, scannedToday }；history：每日快照，以 day 為 key。

import { HISTORY_DAYS, computeImportPlan, isHandwritten, isoDay } from './model.js';

const DB_NAME = 'bedsideink';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('patients', { keyPath: 'id', autoIncrement: true });
      db.createObjectStore('segments', { keyPath: 'id', autoIncrement: true })
        .createIndex('patientId', 'patientId');
      db.createObjectStore('meta');
      db.createObjectStore('history', { keyPath: 'day' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/**
 * 在一個交易中執行 fn(stores)。fn 內只能 await IndexedDB 請求，否則交易會提早結束。
 * 交易完成（commit）後才 resolve。
 */
async function tx(names, mode, fn) {
  const db = await open();
  const t = db.transaction(names, mode);
  const stores = Object.fromEntries(names.map(n => [n, t.objectStore(n)]));
  const finished = new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('transaction aborted'));
  });
  let result;
  try {
    result = await fn(stores);
  } catch (e) {
    try { t.abort(); } catch { /* 已結束 */ }
    throw e;
  }
  await finished;
  return result;
}

const bySortThenId = (a, b) => a.sortOrder - b.sortOrder || a.id - b.id;

async function allPatients(s) {
  return (await done(s.patients.getAll())).sort(bySortThenId);
}

async function deletePatientIn(s, id) {
  const keys = await done(s.segments.index('patientId').getAllKeys(id));
  for (const k of keys) s.segments.delete(k);
  s.patients.delete(id);
}

export const today = () => isoDay();

/** 資料變更的通知，清單等畫面據此重新整理。 */
export const changes = new EventTarget();
const changed = () => changes.dispatchEvent(new Event('change'));

export async function patients() {
  return tx(['patients'], 'readonly', allPatients);
}

export async function patient(id) {
  return tx(['patients'], 'readonly', s => done(s.patients.get(id)));
}

export async function meta() {
  return tx(['meta'], 'readonly', s => done(s.meta.get(0)));
}

export async function segments(patientId) {
  const segs = await tx(['segments'], 'readonly', s => done(s.segments.index('patientId').getAll(patientId)));
  return segs.sort((a, b) => a.seq - b.seq);
}

export async function allSegments() {
  return tx(['segments'], 'readonly', s => done(s.segments.getAll()));
}

/**
 * 換日處理：先把前一天存成歷史，再清空所有筆記、手寫新增的病人與勾選，保留前一天匯入的名單並標示未更新。
 * 回傳 true 表示剛剛換了日。
 */
export async function ensureToday() {
  const day = today();
  const switched = await tx(['patients', 'segments', 'meta', 'history'], 'readwrite', async s => {
    const m = await done(s.meta.get(0));
    if (m?.day === day) return false;
    if (m) {
      await archive(s, m.day);
      s.segments.clear();
      for (const p of await allPatients(s)) {
        if (isHandwritten(p)) s.patients.delete(p.id);
        else if (p.done) s.patients.put({ ...p, done: false });
      }
    }
    s.meta.put({ day, scannedToday: false }, 0);
    return m != null;
  });
  if (switched) changed();
  return switched;
}

/**
 * 把當天的總覽存成歷史快照，只保留最近 HISTORY_DAYS 份。
 * 一則筆記都沒有的日子不存，避免把有內容的紀錄擠掉。
 */
async function archive(s, day) {
  const segs = await done(s.segments.getAll());
  if (segs.length === 0) return;
  const byPatient = new Map();
  for (const g of segs) byPatient.set(g.patientId, [...(byPatient.get(g.patientId) ?? []), g]);
  const ps = (await allPatients(s)).map(p => ({
    sortOrder: p.sortOrder, attending: p.attending, bed: p.bed, name: p.name, chartNo: p.chartNo,
    titleInk: p.titleInk, titleWidth: p.titleWidth, titleHeight: p.titleHeight,
    segments: (byPatient.get(p.id) ?? []).sort((a, b) => a.seq - b.seq)
      .map(g => ({ seq: g.seq, strokes: g.strokes, topY: g.topY, bottomY: g.bottomY })),
  }));
  s.history.put({ day, patients: ps });
  const days = (await done(s.history.getAllKeys())).sort().reverse();
  for (const d of days.slice(HISTORY_DAYS)) s.history.delete(d);
}

/** 歷史日期清單，由新到舊：[{ day, patients, withNotes }]。 */
export async function historyDays() {
  const all = await tx(['history'], 'readonly', s => done(s.history.getAll()));
  return all
    .map(h => ({ day: h.day, patients: h.patients.length, withNotes: h.patients.filter(p => p.segments.length).length }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

export async function history(day) {
  return tx(['history'], 'readonly', s => done(s.history.get(day)));
}

export async function importList(incoming) {
  await ensureToday();
  await tx(['patients', 'segments', 'meta'], 'readwrite', async s => {
    const plan = computeImportPlan(await allPatients(s), incoming);
    for (const id of plan.deletes) await deletePatientIn(s, id);
    for (const p of plan.updates) s.patients.put(p);
    for (const p of plan.inserts) s.patients.add(p);
    s.meta.put({ day: today(), scannedToday: true }, 0);
  });
  changed();
}

/** attending 為新增時所在的主治醫師篩選；在「所有病人」新增時為 null。回傳新病人 id。 */
export async function addHandwritten(title, attending) {
  const id = await tx(['patients'], 'readwrite', async s => {
    const ps = await allPatients(s);
    const sortOrder = ps.reduce((m, p) => Math.max(m, p.sortOrder), -1) + 1;
    return done(s.patients.add({
      sortOrder, attending, bed: null, name: null, chartNo: null, discharge: null,
      titleInk: title.strokes, titleWidth: title.width, titleHeight: title.height, done: false,
    }));
  });
  changed();
  return id;
}

/** 新增病人畫面在背景存過後又繼續寫：更新同一位病人的筆跡標題。 */
export async function updateHandwrittenTitle(id, title) {
  await tx(['patients'], 'readwrite', async s => {
    const p = await done(s.patients.get(id));
    if (p) s.patients.put({ ...p, titleInk: title.strokes, titleWidth: title.width, titleHeight: title.height });
  });
  changed();
}

export async function setDone(id, value) {
  await tx(['patients'], 'readwrite', async s => {
    const p = await done(s.patients.get(id));
    if (p) s.patients.put({ ...p, done: value });
  });
  changed();
}

export async function deletePatient(id) {
  await tx(['patients', 'segments'], 'readwrite', s => deletePatientIn(s, id));
  changed();
}

/** 病人已被刪除（例如剛換日）時不寫入，回傳 null。 */
export async function insertSegment(seg) {
  const id = await tx(['patients', 'segments'], 'readwrite', async s => {
    if (!(await done(s.patients.get(seg.patientId)))) return null;
    return done(s.segments.add(seg));
  });
  changed();
  return id;
}

export async function updateSegment(seg) {
  await tx(['segments'], 'readwrite', s => done(s.segments.put(seg)));
  changed();
}

export async function deleteSegment(id) {
  await tx(['segments'], 'readwrite', s => done(s.segments.delete(id)));
  changed();
}
