# 系統設計

[開啟教材](https://susuky.github.io/system-design-notes/) · [下載原始碼 ZIP](https://github.com/susuky/system-design-notes/archive/refs/heads/main.zip)

16 章繁體中文系統設計教材，涵蓋 81 個課綱主題。從需求與容量估算、快取、佇列、儲存與可靠性，走到短網址、反詐、認證授權與監控的設計練習。

正文、SVG 圖解、練習、6 組分幕故事與互動實驗都內嵌在 `index.html`。下載 ZIP 並解壓縮後，直接開啟這個檔案即可離線閱讀。

## 閱讀與實驗

- 搜尋按鈕或鍵盤 `/` 可搜尋正文、圖中文字、練習答案與六個實驗；點選結果會跳到對應段落。
- 章節目錄、頁內小節、書籤與閱讀進度支援接續閱讀，另有深色模式與手機導覽。
- 正文以螢光筆標示重點；SQL、HTTP／JSON、PromQL、偽碼、算式與狀態流程提供語法配色，並隨主題切換。
- 六個分步實驗：快取旁路、佇列與背壓、重試與冪等、複寫與一致性、權杖桶、一致性雜湊。從索引選擇一個實驗，調整輸入後可逐步前進、返回或重設。
- 快取實驗包含「刪除後，舊讀取回填」：讓已取得 v1 的讀取在 v2 提交、快取刪除後才回填，觀察下一次讀取的版本。
- 章內另有佇列與熱鍵分區示範。列印會展開全書、練習答案與分幕故事；停用 JavaScript 也可閱讀正文與圖解。

書籤、完成記錄、主題與閱讀位置保存在目前瀏覽器的 localStorage。

## 編輯與建置

建置使用 Python 3.10 以上版本的標準函式庫；互動測試另需 Node.js 20 以上版本。

| 路徑 | 內容 |
| --- | --- |
| `chapters/01.html`–`16.html` | 章節正文、內嵌 SVG、故事與練習 |
| `source/shell.html`、`styles.css`、`app.js` | 閱讀器版型、樣式、搜尋與導覽 |
| `source/labs.html`、`labs.css`、`labs.js` | 六個分步實驗的介面、模型與控制器 |
| `source/legacy-visuals.css`、`visuals.js` | 章內故事與互動示範 |
| `source/highlight.css`、`highlight.js`、`vendor/prism/` | 螢光筆配色、程式語法規則與 Prism 1.30.0 |
| `visuals/`、`scenes/` | 可直接編輯的 SVG 圖稿 |
| `outline.json` | 課綱主題與章序 |
| `build.py`、`tests/` | 建置器與回歸測試 |
| `index.html` | 建置產生的完整教材 |

修改正文或介面後重新建置。修改圖稿時，同步更新章節內嵌的 SVG 與 `visuals/`、`scenes/` 中對應的檔案。

```sh
python build.py
```

建置會檢查章序、課綱資料、重複 ID、內部連結及離線資源，完成後一次替換 `index.html`。也可用 `--output 路徑` 輸出到其他檔案。

## 驗證

```sh
python build.py
python -m unittest discover -s tests -p 'test_build.py'
python tests/test_content.py --html index.html
node tests/test_labs.js
node tests/test_dom.mjs
```

測試涵蓋建置失敗處理、正文與圖稿同步、六個實驗的狀態與不變量，以及搜尋、導覽、書籤、列印和故事控制。`test_dom.mjs` 在模擬 DOM 中執行閱讀器；排版檢查使用瀏覽器。

提交時一併更新 `index.html`。GitHub Actions 會重跑上述命令，並以 `git diff --exit-code -- index.html` 檢查提交的教材是否與來源一致。

## 來源

課綱範圍參照 [LeetCode 公開系統設計課綱](https://leetcode.com/explore/featured/card/system-design-for-interviews-and-beyond/)。各章的解說、案例與練習附有對應的官方文件、標準或論文連結。
