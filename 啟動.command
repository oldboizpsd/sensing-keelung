#!/bin/bash
# 雙擊這個檔案：檢查環境 → 第一次自動安裝 → 啟動網站並用 Chrome 打開
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
clear
echo "感覺一座城市｜啟動中"
echo "--------------------------------"
if ! command -v node >/dev/null 2>&1; then
  echo "✗ 找不到 Node.js。"
  echo "  請到 https://nodejs.org 下載安裝，"
  echo "  安裝時「選取目標」要選 Mac 的內建硬碟，不要選 Creator SSD。"
  read -p "按 Enter 關閉"
  exit 1
fi
echo "✓ Node.js $(node -v)"
if [ ! -d node_modules/@mediapipe/tasks-vision ]; then
  echo "… 第一次使用：安裝套件（需要網路）"
  npm install --no-audit --no-fund || { echo "✗ npm install 失敗，請把上面的訊息截圖給 Claude"; read -p "按 Enter 關閉"; exit 1; }
fi
if [ ! -f public/vendor/mediapipe/models/selfie_segmenter.tflite ] || [ ! -f public/vendor/mediapipe/vision_bundle.mjs ]; then
  echo "… 第一次使用：下載 MediaPipe 模型（需要網路）"
  npm run setup || { echo "✗ 下載失敗，請把上面的訊息截圖給 Claude"; read -p "按 Enter 關閉"; exit 1; }
fi
echo "✓ 準備好了，打開 Chrome…"
( sleep 1.5; open -a "Google Chrome" "http://localhost:3000" ) &
echo "（要結束：在這個視窗按 Ctrl+C）"
node server.js
