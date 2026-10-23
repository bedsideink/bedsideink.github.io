// 全 app 共用的狀態。

import { ALL, attendingOrder } from './model.js';
import { attendingStyle } from './ui.js';

export const state = {
  /** 目前清單、總覽、新增病人所用的篩選；在選擇畫面或主治醫師列表選定。 */
  filter: ALL,
  /** 冷啟動時只有一位主治醫師就跳過選擇畫面；之後從清單回到選擇畫面時不再跳過。 */
  autoSkip: true,
};

/** 所有病人清單：名字依醫師上色；依主治醫師篩選時用預設文字色。 */
export const currentAttendingStyle = patients =>
  attendingStyle(attendingOrder(patients), state.filter.kind === 'all');
