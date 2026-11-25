#!/bin/bash
# 展場用：全螢幕、自動允許鏡頭和聲音。結束：Chrome 按 ⌘Q，再在這個視窗按 Ctrl+C
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
node scripts/kiosk.mjs
