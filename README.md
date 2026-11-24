# 系統設計

[線上閱讀](https://susuky.github.io/system-design-notes/) · [單檔 HTML](index.html) · [原始碼 ZIP](system-design-notes-source.zip)

16 章、90 個閱讀單元，涵蓋原課綱的 81 個主題。整套筆記圍繞著一個共同場景——使用者上傳一份 PDF 之後，從流量估算、快取、佇列、儲存引擎、重試與冪等、分區擴容，一直走到認證授權與可觀測性。

每個單元都從一個會真正踩到痛點的疑問出發：快取都已經刪了，舊值為什麼又冒出來？多開了一台 worker，佇列怎麼還在變長？每層只重試三次，為什麼資料庫一下子收到二十七次查詢？正文、狀態圖、數量級推算跟練習題都用同一套案件數據互相比對。

## 打開怎麼看

直接雙擊開啟 `index.html` 就好。所有 HTML、CSS、JavaScript、圖解跟程式碼都包在裡面，斷網也能完整閱讀和操作實驗。

- **單元／全章切換**：預設一次專心看一個小節，側欄保留章內目錄；想一口氣把整章表格跟脈絡對照看一遍，切成「全章」就好。
- **互動實驗**：首頁放了 6 個即時架構模擬、6 個逐步推演實驗，還有每章 1 個、共 16 個可調參數的章內情境。
- **搜尋全書**：按 `/` 或右上角搜尋按鈕，正文、圖表文字、程式碼跟練習都能一起搜，點下去會直接跳到命中處並展開解答。
- **閱讀紀錄**：書籤、章節完成打勾、深淺主題跟上次讀到的位置都存在目前瀏覽器裡。
- **手機與列印**：手機從左上角目錄切換單元；按列印會展開全書和所有練習推導；就算瀏覽器關掉 JavaScript，正文跟靜態圖也依然看得到。

如果上層資料夾裡同時放著 `data-structures-algorithms-notes`，從頂列或目錄就能一鍵切過去演算法教材。

## 互動內容

### 六個即時模擬

| 模擬 | 你可以怎麼玩 |
|---|---|
| 負載平衡 | 調高每批流量、切換輪詢跟「預估最早完成」，或直接點某台伺服器讓它離線，看各台排隊數跟失敗數怎麼跳。 |
| 快取 TTL | 更新資料庫、送出讀取、一秒一秒往後推，比較「等 TTL 過期」跟「寫完立刻刪快取」在命中率、延遲跟舊資料次數上的差別。 |
| 佇列背壓 | 調整到達跟消化速度，比較來源暫停等待與直接拒絕，看佇列格怎麼滿、待送工作留在哪。 |
| 複本仲裁 | 調整寫入 W 跟讀取 R 的門檻，點副本讓它斷線再恢復，親手試出 `W + R <= N` 何時會讀到舊版。 |
| 斷路器與重試風暴 | 下游故障時，先看「無保護＋重試 3 次」怎麼把流量放大三倍打垮下游，再切換斷路器體驗 Closed → Open → Half-Open 的恢復過程。 |
| 一致性雜湊與搬移量 | 切換「取模 `hash % N`」與「一致性雜湊環」，調整虛擬節點數，按一下讓分片 D 上線，直接看 12 筆鍵有幾筆被重搬。 |

### 每章一個可調情境

用下一步、時間軸或播放看節點怎麼變，再改滑桿或比較條件看同一步的結果。圖上的路徑、數值與解說一起更新。離開單元會暫停播放，手機會把節點排進較窄的圖面。

| 章 | 情境 |
|---|---|
| 01 | 每日文件量、尖峰與 CPU 核心 |
| 02 | 五分鐘完成率與錯誤預算 |
| 03 | AZ 故障後的容量與多數票 |
| 04 | 任務受理、ACK 遺失與完成狀態 |
| 05 | 舊讀取回填與版本檢查 |
| 06 | 到達率、完成率與積壓 |
| 07 | WAL、ACK 時機與崩潰恢復 |
| 08 | 斷線游標、事件補播與快照 |
| 09 | A、B、資料庫驅動的重試放大 |
| 10 | 批次大小與等待上限 |
| 11 | 熱租戶與分區負載 |
| 12 | 擴容暖機與清空積壓 |
| 13 | 斷路、單次探測與恢復 |
| 14 | 扇出數與至少一次慢回應機率 |
| 15 | 短網址撤銷與舊值回填 |
| 16 | token 到期與跨租戶物件權限 |

每個情境的假設和單位列在控制項與正文中，可對照推導。核心表格、算式與實作直接展開；練習答案保留摺疊。

### 六個逐步實驗

快取旁路、佇列與背壓、重試與冪等、複寫與一致性、權杖桶、一致性雜湊。可逐步返回、重設或直接看結果。展開「調整參數」修改輸入，例如在快取實驗中安排「刪除後，舊讀取回填」，觀察 R3 最後取得的版本。

另保留 55 張 SVG 圖解與 6 組分幕故事，連同章內場景一起說明狀態與因果。

## 原始檔與建置

Python 3.10 以上即可建置；模型測試使用 Node.js 20 以上。

| 路徑 | 內容 |
|---|---|
| `chapters/01.html`–`16.html` | 正文、單元、圖解與練習 |
| `source/shell.html` | 兩套教材共用的介面結構 |
| `source/reader.js`、`reader.css` | 單元／全章切換、逐節導覽、互動入口與響應式閱讀版面 |
| `source/app.js`、`styles.css` | 搜尋、書籤、儲存、主題、列印與基礎樣式 |
| `source/scenes.js`、`scenes.css` | 16 個章內情境的模型、圖形與控制器 |
| `source/labs.html`、`labs.js`、`labs.css` | 六個逐步實驗 |
| `source/simulations.js`、`simulations.css` | 六個即時架構模擬與連線圖 |
| `source/visuals.js`、`legacy-visuals.css` | 原有分幕故事與章內示範 |
| `source/highlight.js`、`highlight.css`、`vendor/prism/` | 語法配色與重點標記 |
| `visuals/`、`scenes/` | 可編輯的獨立 SVG 圖稿 |
| `outline.json` | 81 個課綱主題與章序 |
| `build.py`、`tests/` | 建置與測試 |
| `index.html` | 產生的離線教材 |

修改正文或介面後執行：

```sh
python build.py
```

修改 SVG 時，一併更新章節內嵌圖與獨立圖稿。建置器檢查章序、重複 ID、內部連結與離線資源後產生 `index.html`；可用 `--output` 指定輸出路徑。

## 驗證

```sh
python build.py
python -m unittest discover -s tests -p "test_build.py"
python tests/test_content.py --html index.html
node --check source/reader.js
node tests/test_labs.js
node tests/test_scenes.js
node tests/test_simulations.js
node tests/test_dom.mjs
```

模型測試覆蓋原有六個實驗的 12,706 組追蹤、16 個情境的 1,950 組參數，以及六個即時模擬的核心狀態轉移。內容測試核對課綱、錨點、圖稿與練習；模擬 DOM 測試檢查搜尋、書籤、列印與故事控制。

`tests/test_browser.js` 使用真實 Chromium，逐一走過 90 個單元的桌面與 390px 手機版面。測試涵蓋六個即時模擬的操作結果、320px 與 390px 版面、單元／全章切換、搜尋、書籤、六個逐步實驗、16 個章內情境、播放暫停、列印與停用 JavaScript。

安裝 Playwright 後，在 PowerShell 指定已安裝的 Chrome 即可執行：

```powershell
$env:CHROMIUM_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
node tests/test_browser.js
```

設定 `COURSE_SCREENSHOTS` 可另存檢查畫面。教材與其餘測試不需要 Playwright。

提交時一併更新 `index.html`。GitHub Actions 會重跑建置、內容與模型測試，並檢查產生的教材與提交內容一致。

## 參考

互動閱讀方式參考 [Designed to Scale](https://designed-to-scale.vercel.app/#/)：固定情境、逐步改變狀態，讓圖形和當步解釋同步。

課綱範圍參照 [LeetCode 公開系統設計課綱](https://leetcode.com/explore/featured/card/system-design-for-interviews-and-beyond/)。各章附原始文件、標準與論文連結。
