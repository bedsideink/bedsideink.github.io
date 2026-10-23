// 掃描匯入，對應 Android 的 scan/ScanScreen.kt。
// 相機畫面在本機以 jsQR 辨識（vendor/jsQR-1.4.0.js，由 index.html 載入成全域 jsQR），不經網路。

import * as db from '../db.js';
import { parsePayload } from '../model.js';
import { confirmDialog, h, topBar } from '../ui.js';

/** 兩次辨識之間的間隔（毫秒）；jsQR 在主執行緒上執行，不必每個畫面都跑。 */
const SCAN_INTERVAL = 120;

export function scanScreen(nav) {
  const video = h('video', { playsinline: true, muted: true, autoplay: true });
  video.muted = true;
  const status = h('div', { class: 'scan-status' }, '對準電腦螢幕上的 QR code');
  const retry = h('button', { class: 'mode-btn primary', hidden: true, onclick: () => startCamera() }, '允許相機');
  const el = h('section', { class: 'screen' },
    topBar(() => nav.back(), '掃描匯入'),
    h('div', { class: 'scan-view' }, video, h('div', { class: 'scan-frame' }), retry, status));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stream = null;
  let timer = 0;
  /** 匯入中或等待使用者確認時不再辨識 */
  let busy = false;
  let closed = false;

  async function startCamera() {
    retry.hidden = true;
    stopCamera();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // QR 可能很密，用較高解析度
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (closed) { stopCamera(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      loop();
    } catch (e) {
      status.textContent = '需要相機權限才能掃描 QR code';
      retry.hidden = false;
    }
  }

  function stopCamera() {
    clearTimeout(timer);
    timer = 0;
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
  }

  function loop() {
    timer = setTimeout(() => {
      if (!stream) return;
      if (!busy && video.readyState >= 2) scanFrame();
      loop();
    }, SCAN_INTERVAL);
  }

  /** 只辨識畫面中央的正方形（取景框），解析度夠又省時間。 */
  function scanFrame() {
    const vw = video.videoWidth, vh = video.videoHeight;
    const side = Math.min(vw, vh);
    canvas.width = canvas.height = side;
    ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, side, side);
    const code = globalThis.jsQR(ctx.getImageData(0, 0, side, side).data, side, side, { inversionAttempts: 'dontInvert' });
    if (code) onCode(new TextDecoder('utf-8').decode(Uint8Array.from(code.binaryData)));
  }

  async function onCode(raw) {
    const r = parsePayload(raw);
    if (r.foreign) { status.textContent = '這不是 BedsideInk 的 QR code'; return; }
    if (r.invalid) { status.textContent = r.invalid; return; }
    busy = true;
    const { day, patients } = r.ok;
    if (day !== db.today()) {
      const [, m, d] = day.split('-').map(Number);
      const ok = await confirmDialog(
        h('p', { class: 'dialog-title' }, `這個 QR code 是 ${m}/${d} 產生的，不是今天。仍要匯入？`), '匯入');
      if (!ok) { busy = false; return; }
    }
    status.textContent = '匯入中…';
    await db.importList(patients);
    nav.back();
  }

  startCamera();

  return {
    el,
    hide: stopCamera,
    resume() { if (!busy) startCamera(); },
    destroy() { closed = true; stopCamera(); },
  };
}
