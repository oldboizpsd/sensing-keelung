// 安裝後執行一次：把 MediaPipe 的程式和模型放進 public/vendor，之後展場就不需要網路。
// 用法：npm install && npm run setup
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'public', 'vendor', 'mediapipe');
const SRC = path.join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision');

const MODELS = {
  'blaze_face_short_range.tflite':
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  'selfie_segmenter.tflite':
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  'gesture_recognizer.task':
    'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    const a = path.join(from, f), b = path.join(to, f);
    if (fs.statSync(a).isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

if (!fs.existsSync(SRC)) {
  console.error('找不到 @mediapipe/tasks-vision，請先執行 npm install');
  process.exit(1);
}

fs.mkdirSync(path.join(VENDOR, 'models'), { recursive: true });
const bundle = ['vision_bundle.mjs', 'vision_bundle.js'].map((f) => path.join(SRC, f)).find((f) => fs.existsSync(f));
if (!bundle) {
  console.error('找不到 vision_bundle，套件裡有：', fs.readdirSync(SRC).join(', '));
  process.exit(1);
}
fs.copyFileSync(bundle, path.join(VENDOR, 'vision_bundle.mjs'));
const pkg = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8'));
console.log('MediaPipe 版本：' + pkg.version);
copyDir(path.join(SRC, 'wasm'), path.join(VENDOR, 'wasm'));
console.log('✓ MediaPipe 程式已複製');

for (const [name, url] of Object.entries(MODELS)) {
  const out = path.join(VENDOR, 'models', name);
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) {
    console.log(`✓ ${name}（已存在）`);
    continue;
  }
  process.stdout.write(`… 下載 ${name}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`\n✗ 下載失敗 ${name}：${res.status}`);
    process.exit(1);
  }
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`\r✓ ${name}              `);
}
console.log('\n完成。接下來：npm start，或展場用 npm run kiosk');
