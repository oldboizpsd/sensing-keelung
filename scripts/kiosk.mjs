// 展場模式（Mac）：啟動伺服器，並用 Chrome 全螢幕打開。
// 自動允許鏡頭、麥克風，也允許聲音自動播放，觀眾不用點任何東西。
// 結束：在 Chrome 按 ⌘Q，再回終端機按 Ctrl+C。
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 3000;
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { stdio: 'inherit' });

const flags = [
  '--kiosk',
  '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream', // 自動允許鏡頭與麥克風
  '--disable-session-crashed-bubble',
  '--noerrdialogs',
  '--no-first-run',
  `--user-data-dir=${path.join(os.tmpdir(), 'sensing-keelung-chrome')}`,
  `http://localhost:${PORT}`,
];

setTimeout(() => {
  if (process.platform === 'darwin') {
    spawn('open', ['-na', 'Google Chrome', '--args', ...flags], { stdio: 'inherit' });
  } else {
    console.log('非 Mac：請手動用這些參數開 Chrome：\n', flags.join(' '));
  }
}, 800);

process.on('SIGINT', () => { server.kill(); process.exit(0); });
