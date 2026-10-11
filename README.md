# 系統設計：讓架構回應需求

[開啟教材](https://susuky.github.io/system-design-notes/)

16 章繁體中文系統設計教材，涵蓋公開課綱的 81 個主題。正文、架構圖、練習與分幕故事都放在同一個 `index.html`，下載後可直接離線開啟。

閱讀介面與[資料結構與演算法教材](https://susuky.github.io/data-structures-algorithms-notes/)一致：章節目錄、全文搜尋、書籤、閱讀進度、深色模式、手機導覽與全書列印。原有章節與圖解連結保留，舊版瀏覽器裡的完成記錄、書籤與上次閱讀位置也沿用。

## 內容與操作

- 需求與容量估算、硬體、通訊、快取、佇列、儲存引擎
- 可靠投遞、批次與壓縮、分區、限流、斷路器與隔離
- 短網址、反詐、認證授權、監控的設計練習
- 原有 6 組分幕故事、28 幕，以及佇列與熱鍵分區兩個互動示範
- 6 個新增分步實驗：快取旁路、佇列與背壓、重試與冪等、複寫與一致性、權杖桶、一致性雜湊

新增實驗可改輸入、前進、後退、重新開始，並顯示每一步的狀態、原因與停止條件。每個實驗都標出簡化假設；算出的數字不能直接當成實際系統效能或部署規格。

搜尋按鈕或鍵盤 `/` 可搜尋正文、圖說與練習答案。列印會展開答案及分幕故事，列印結束後恢復原本的閱讀畫面。停用 JavaScript 仍可閱讀全部正文與圖解。

## 本機重建

只需 Python 3，不必安裝套件。

```sh
python build.py
```

輸出為根目錄的 `index.html`。建置會檢查 16 章是否齊全、ID 是否重複、章節錨點是否有效，以及是否夾帶外部資源。缺檔或檢查失敗時不會覆寫既有輸出。

```text
chapters/                 16 章完整正文，含 SVG 與分幕內容
source/shell.html         首頁與閱讀器介面
source/styles.css         共用閱讀器樣式
source/app.js             導覽、搜尋、主題、書籤與閱讀進度
source/labs.html          新增六個分步實驗的介面
source/labs.css           新實驗樣式
source/labs.js            新實驗的模型與控制器
source/legacy-visuals.css 原有圖解、故事與示範的樣式
source/visuals.js         原有故事與示範的控制器
visuals/、scenes/         既有圖稿與製作來源
outline.json             公開課綱主題清單
build.py                 單檔 HTML 建置器
index.html               可離線開啟的完整教材
tests/                  建置、內容、互動模型及閱讀器測試
```

## 檢查

```sh
python -m unittest discover -s tests -p 'test_build.py'
python tests/test_content.py --html index.html
node tests/test_labs.js
node tests/test_dom.mjs
```

`test_dom.mjs` 檢查 JavaScript 與模擬 DOM 的狀態變化，包含舊版進度相容、搜尋、導覽、列印及故事控制。它不代替真實瀏覽器的排版與無障礙測試。

## 資料與來源

課綱範圍參照 [LeetCode 公開系統設計課綱](https://leetcode.com/explore/featured/card/system-design-for-interviews-and-beyond/)。教材的說明、例子與練習獨立編寫，未翻譯或還原付費課文，也不是官方授權教材。各章附有延伸閱讀連結。

81 指公開課綱主題數；正文導覽另包含練習、章末整理與參考資料，因此導覽小節數不同。案例的負載、延遲與容量都有教學假設，使用前需依自己的工作負載重算。

網站不使用 CDN、分析追蹤或遠端 API；只有點擊外部連結時才需連線。書籤、進度與主題保存在目前瀏覽器的 localStorage，不會跨裝置同步。沿用同一個網址與瀏覽器可接續舊版記錄；改用離線檔、私人瀏覽或清除網站資料時，瀏覽器可能採用不同的儲存空間或不保留記錄。
