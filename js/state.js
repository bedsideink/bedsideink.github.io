// 全 app 共用的狀態。

import { ALL, TEXT_SCALES, attendingOrder, defaultListFields } from './model.js';
import { attendingStyle } from './ui.js';

export const state = {
  /** 目前清單、總覽、新增病人所用的篩選；在選擇畫面或主治醫師列表選定。 */
  filter: ALL,
  /** 冷啟動時只有一位主治醫師就跳過選擇畫面；之後從清單回到選擇畫面時不再跳過。 */
  autoSkip: true,
};

const LIST_FIELDS_KEY = 'bedsideink.listFields';

/** 清單顯示項目存在這台裝置的 localStorage；讀不到（私密瀏覽等）時用預設值。 */
export function loadListFields() {
  try {
    return { ...defaultListFields(), ...JSON.parse(localStorage.getItem(LIST_FIELDS_KEY) ?? '{}') };
  } catch {
    return defaultListFields();
  }
}

export function saveListFields(fields) {
  try {
    localStorage.setItem(LIST_FIELDS_KEY, JSON.stringify(fields));
  } catch { /* 存不了就只在這次使用期間有效 */ }
}

const TEXT_SCALE_KEY = 'bedsideink.textScale';

export function loadTextScale() {
  try {
    const s = Number(localStorage.getItem(TEXT_SCALE_KEY));
    return TEXT_SCALES.includes(s) ? s : 1;
  } catch {
    return 1;
  }
}

export function saveTextScale(scale) {
  try {
    localStorage.setItem(TEXT_SCALE_KEY, String(scale));
  } catch { /* 存不了就只在這次使用期間有效 */ }
}

/** 所有病人清單：名字依醫師上色；依主治醫師篩選時用預設文字色。 */
export const currentAttendingStyle = patients =>
  attendingStyle(attendingOrder(patients), state.filter.kind === 'all');
