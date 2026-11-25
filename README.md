# 感覺一座城市｜Sensing Keelung

全鏡頭互動的雨夜基隆。觀眾不碰滑鼠鍵盤，只用身體在畫面前停下、經過。

**目前進度：第 3 步（功能全部做完，等實測調整）**

一輪大約 2–3 分鐘：

1. **雨夜街頭（30 秒）**：經過就拖影、停下就對焦；**伸手接雨**（手掌伸出來停住，雨落在手上、手下積一小攤水）；擦霧玻璃；握拳收集。
2. **廟口（30 秒）**：轉頭聽兩邊；**指著點菜**（食指指著停 1 秒）→ 冒熱氣的乾麵 → **對著它吹氣**（麥克風）熱氣散開，浮出氣味字詞和一句話。
3. **崁仔頂（20 秒）**：結束時**鐵捲門拉下來**，觀眾**兩手一起往上抬**就拉開（8 秒沒抬會自己拉開）。
4. **天亮**：問「你住的地方，有沒有一個大家經過卻很少停下來看的地方？」，**點頭**＝身影留在街上，**搖頭**＝只帶走卡片（沒回答算點頭）。接著出現 9:16 卡片和 QR code，40 秒後回到雨夜。
5. 一直都在：**安靜下來**時城市的聲音浮上來，有人講話時收小（麥克風）；之前觀眾的模糊身影留在街上（每天清空，最多同時 12 個）。

沒有麥克風也能玩：熱氣 20 秒後會自己散開。

## 卡片和 QR code

- 卡片存在 `sensing-keelung/cards/`，最多 20 張，舊的自動刪掉。
- QR code 連到 `http://這臺 Mac 的區網 IP:3000/card/編號`，**手機要跟 Mac 在同一個 Wi-Fi**（不用能上網）。
- 在 `public/js/config.js` 的 `wifi` 填上現場 Wi-Fi 的名稱和密碼，畫面會多一個「掃了自動連 Wi-Fi」的 QR code。
- QR code 是自己寫的產生器（`public/js/qr.js`），不用網路、不用套件。

## 最簡單的用法

雙擊 **啟動.command**。第一次會自動安裝（要網路），之後會啟動伺服器並用 Chrome 打開。展場用 **展場模式.command**。

## 第一次在 Mac 上跑（要網路，只做一次）

打開「終端機」，進到這個資料夾：

```bash
cd "/Volumes/Creator SSD/課程/作業/五上/進階介面/期末/sensing-keelung"
npm install
npm run setup
```

`npm run setup` 會把 MediaPipe 的程式和 4 個模型下載到 `public/vendor/`。之後就不需要網路了。

沒有 Node.js 的話，先到 https://nodejs.org 下載安裝 LTS 版本。

## 平常測試

```bash
npm start
```

然後用 Chrome 打開 http://localhost:3000。第一次會問能不能用鏡頭，按允許。點一下畫面，聲音才會出來（展場模式不用點）。

## 展場模式

```bash
npm run kiosk
```

Chrome 會全螢幕打開，自動允許鏡頭和麥克風，聲音也會自動播。結束時在 Chrome 按 ⌘Q，再回終端機按 Ctrl+C。

## 除錯（只給自己用）

- **D**：打開除錯畫面。看得到鏡頭、臉框（綠框是主角）、人形遮罩、動作量和各種數值。
- **M**：用滑鼠假裝成觀眾，沒有鏡頭也能測：滑鼠 = 手（擦玻璃）、按住滑鼠 = 握拳、按住 Shift 移動滑鼠 = 身體在動、**[** **]** = 轉頭。
- **N**：直接跳到下一個場景（崁仔頂時是直接拉下鐵捲門）。
- 滑鼠模擬時還可以：按住 **P** = 食指指著、按住 **U** = 兩手往上抬、按住 **B** = 吹氣、按住 **T** = 講話、**Y** = 點頭、**H** = 搖頭。
- 除錯畫面會顯示麥克風的音量和低頻比例，到現場看數字調 `config.js` 的 `mic`。

## 要調整的話

| 想改什麼 | 改哪裡 |
| --- | --- |
| 太敏感／太遲鈍、停多久才對焦 | `public/js/config.js` |
| 照片順序、細節小字、提示文字 | `public/js/content.js` |
| 畫面效果（拖影、雨、人形） | `public/js/shaders.js` |

## 檔案

```text
server.js              本機伺服器
scripts/setup.mjs      下載 MediaPipe（只做一次）
scripts/kiosk.mjs      展場模式
public/index.html
public/css/main.css
public/js/
  main.js              主程式：每一格讀鏡頭 → 算狀態 → 畫
  fog.js               霧玻璃
  overlay.js           接雨、乾麵熱氣、鐵捲門、氣味字詞（2D 疊加層）
  mic.js               麥克風：吹氣、講話、安靜
  ghosts.js            留在街上的路人身影
  ending.js            結尾：點頭／搖頭、合成卡片、QR code
  qr.js                QR code 產生器
  fragments.js         握拳收集
  hints.js             提示
  config.js            可以調的數字
  content.js           照片和文案
  camera.js            開鏡頭
  motion.js            影格相減，算動作量
  tracking.js          MediaPipe：找主角、轉頭、手勢、人形分割
  renderer.js          WebGL2
  shaders.js           著色器：拖影、對焦、人形、雨
  audio.js             聲音
  ui.js                畫面上的字
  debug.js             除錯畫面
public/assets/photos/  我拍的照片（網頁用尺寸）
public/assets/temp/    暫用素材，見 TEMP_ASSETS.md
```

## 還沒做（下一步）

功能都做完了。接下來是實測調整：靈敏度、時間長短、文案確認、換掉暫用素材、補拍鐵捲門和廟口。
