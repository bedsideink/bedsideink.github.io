# BedsideInk（網頁版）

院內醫師查房用的手寫筆記，iPad 版（PWA）。這個 repo 只放發佈到 GitHub Pages 的檔案，由原始碼 repo 的 `deploy-web.sh` 自動產生，**不要直接修改**，每次發佈都會整個覆蓋。

- App：<https://emissionspectrum-creator.github.io/BedsideInk-web/>
  用 Safari 打開 → 分享 →「加入主畫面」，之後從主畫面圖示開啟。
- 匯入頁：<https://emissionspectrum-creator.github.io/BedsideInk-web/BedsideInk-Import.html>
  在醫院電腦貼上 HIS 病房清單，產生 QR code 給 app 掃描。

## 隱私

- 病人資料只存在裝置本機（IndexedDB），不上傳、不同步。
- App 以 Content Security Policy `connect-src 'none'` 禁止頁面發出任何連線，也不載入外部資源。
- 匯入頁只在瀏覽器本機解析，不上傳、不保存任何資料。
- 這個 repo 不含任何病人資料。
