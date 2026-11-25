// 本機伺服器：提供網頁、存卡片、產生 QR code。展場不需要網路。
// 啟動：npm start，然後打開 http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { qrSvg } from './public/js/qr.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'public');
const CARDS = path.join(HERE, 'cards'); // 卡片存這裡，最多 MAX_CARDS 張
const MAX_CARDS = 20;
const PORT = Number(process.env.PORT || 3000);
const MAP_URL = 'https://maps.app.goo.gl/sK3L5XLFT6NsJxm56';
fs.mkdirSync(CARDS, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream', '.woff2': 'font/woff2',
};

// 這臺電腦在區域網路的位址（手機掃 QR code 要連這個）
function lanIP() {
  const all = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) all.push(a.address);
  return all.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a)) || all[0] || 'localhost';
}

// 今天第幾位觀眾（每天從 1 開始）
let counter = { day: '', n: 0 };
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}
const json = (res, obj, status = 200) => send(res, status, JSON.stringify(obj), TYPES['.json']);

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) { // 長音檔用 <audio> 串流播放，需要支援 Range
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? Number(m[1]) : 0;
      const end = m && m[2] ? Number(m[2]) : st.size - 1;
      if (start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// 只留最新的 MAX_CARDS 張
function prune() {
  const files = fs.readdirSync(CARDS).filter((f) => f.endsWith('.png') && !f.startsWith('._'))
    .map((f) => ({ f, t: fs.statSync(path.join(CARDS, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(MAX_CARDS)) fs.unlinkSync(path.join(CARDS, f));
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 手機上看到的卡片頁（文案是 Claude 草稿）
function cardPage(id, exists) {
  const body = exists
    ? `<img src="/cards/${esc(id)}.png" alt="你的基隆卡片">
       <p class="tip">長按圖片就可以存下來。</p>
       <a class="btn" href="/cards/${esc(id)}.png" download="sensing-keelung-${esc(id)}.png">下載這張卡</a>
       <p class="quiet">存好之後，切回自己的網路就可以分享。</p>
       <hr>
       <p>這些是我平常會去的地方。</p>
       <a class="btn ghost" href="${MAP_URL}">打開地圖清單</a>
       <p class="question">你住的地方，有沒有一個大家經過卻很少停下來看的地方？</p>`
    : `<p class="question">這張卡已經收起來了。</p><p class="quiet">卡片只保留最新的 ${MAX_CARDS} 張。</p>`;
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>感覺一座城市</title><style>
body{margin:0;background:#07090c;color:#e8ebee;font-family:"PingFang TC","Noto Sans TC",sans-serif;text-align:center;padding:28px 20px 48px}
h1{font-family:"Songti TC","Noto Serif TC",serif;font-weight:500;letter-spacing:.2em;font-size:22px;margin:0 0 4px}
.en{color:#7fe6c8;letter-spacing:.35em;font-size:11px;margin:0 0 24px}
img{width:100%;max-width:420px;border:1px solid rgba(232,235,238,.25)}
.tip{margin:14px 0}.quiet{color:rgba(232,235,238,.55);font-size:13px}
.btn{display:inline-block;margin:8px 0;padding:12px 22px;border-radius:24px;background:#7fe6c8;color:#07090c;text-decoration:none;font-weight:600}
.btn.ghost{background:none;color:#7fe6c8;border:1px solid #7fe6c8}
hr{border:0;border-top:1px solid rgba(232,235,238,.15);margin:28px auto;max-width:420px}
.question{font-family:"Songti TC","Noto Serif TC",serif;font-size:18px;line-height:1.7;margin:28px auto 0;max-width:340px}
</style></head><body><h1>感覺一座城市</h1><p class="en">SENSING KEELUNG</p>${body}</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/info') return json(res, { ip: lanIP(), port: PORT });
    if (p === '/api/visitor' && req.method === 'POST') {
      if (counter.day !== today()) counter = { day: today(), n: 0 };
      counter.n++;
      return json(res, { n: counter.n, day: counter.day });
    }
    if (p === '/api/card' && req.method === 'POST') {
      const buf = await readBody(req);
      if (buf.length < 100 || buf.readUInt32BE(0) !== 0x89504e47) return json(res, { error: '不是 PNG' }, 400);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      fs.writeFileSync(path.join(CARDS, id + '.png'), buf);
      prune();
      return json(res, { id, url: `http://${lanIP()}:${PORT}/card/${id}` });
    }
    if (p === '/api/qr') return send(res, 200, qrSvg(url.searchParams.get('text') || ''), TYPES['.svg']);
    let m;
    if ((m = /^\/card\/([a-z0-9]+)$/.exec(p))) return send(res, 200, cardPage(m[1], fs.existsSync(path.join(CARDS, m[1] + '.png'))), TYPES['.html']);
    if ((m = /^\/cards\/([a-z0-9]+)\.png$/.exec(p))) return serveFile(req, res, path.join(CARDS, m[1] + '.png'));
  } catch (err) {
    console.error(err);
    return json(res, { error: String(err.message || err) }, 500);
  }
  let fp = p.endsWith('/') ? p + 'index.html' : p;
  const file = path.normalize(path.join(ROOT, fp));
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden');
  serveFile(req, res, file);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  感覺一座城市｜本機伺服器已啟動`);
  console.log(`  這臺電腦：  http://localhost:${PORT}`);
  console.log(`  同一個 Wi-Fi：http://${lanIP()}:${PORT}`);
  console.log(`  卡片存在：  ${CARDS}（最多 ${MAX_CARDS} 張）`);
  console.log(`\n  除錯畫面：在網頁上按 D\n`);
});
