import { CONFIG } from './config.js';
import { COPY } from './content.js';
import { qrSvg } from './qr.js';

// 結尾：天亮 → 問一個問題（點頭／搖頭）→ 合成卡片 → 存在 Mac 上 → 螢幕上出現 QR code → 倒數回到雨夜。
export class Ending {
  constructor() {
    this.el = document.getElementById('ending');
    this.qEl = document.getElementById('question');
    this.reset();
  }

  reset() {
    this.stage = 'off'; // off / question / answer / card / done
    this.t = 0;
    this.answer = null; // 'nod' / 'shake'
    this.history = [];
    this.wantsFrame = false;
    this.frame = null;
    this.el.classList.remove('on');
    this.qEl.classList.remove('on');
  }

  get active() { return this.stage !== 'off'; }

  start(info) {
    this.info = info; // { reached: 場景 id, fragments: [canvas] }
    this.stage = 'question';
    this.t = 0;
    this.history = [];
    this.qEl.innerHTML = `<p>${COPY.question}</p><small>${COPY.questionHow}</small>`;
    this.qEl.classList.add('on');
  }

  // head: { pitch, yaw } 或 null；sim: 'nod' / 'shake'（除錯用）
  update(dt, now, head, sim) {
    if (this.stage === 'off' || this.stage === 'done') return this.stage;
    this.t += dt;
    if (this.stage === 'question') {
      if (head) this.history.push({ t: now, ...head });
      this.history = this.history.filter((h) => now - h.t < 1600);
      const range = (k) => this.history.length < 4 ? 0 : Math.max(...this.history.map((h) => h[k])) - Math.min(...this.history.map((h) => h[k]));
      let ans = sim || null;
      if (!ans && this.t > 1.5) {
        if (range('pitch') > 0.12 && range('yaw') < 0.45) ans = 'nod';
        else if (range('yaw') > 0.6 && range('pitch') < 0.1) ans = 'shake';
      }
      if (!ans && this.t > CONFIG.ending.questionSeconds) ans = 'nod'; // 沒回答：預設留下
      if (ans) {
        this.answer = ans;
        this.stage = 'answer';
        this.t = 0;
        this.qEl.innerHTML = `<p>${ans === 'nod' ? COPY.stayNod : COPY.stayShake}</p>`;
      }
    } else if (this.stage === 'answer' && this.t > 2.5) {
      this.qEl.classList.remove('on');
      this.stage = 'card';
      this.t = 0;
      this.wantsFrame = true; // 下一格畫完後擷取畫面
    } else if (this.stage === 'card') {
      const left = Math.max(0, Math.ceil(CONFIG.ending.cardSeconds - this.t));
      const c = document.getElementById('ending-count');
      if (c) c.textContent = COPY.backToRain(left);
      if (this.t > CONFIG.ending.cardSeconds) {
        this.el.classList.remove('on');
        this.stage = 'done';
      }
    }
    return this.stage;
  }

  // 主畫面剛畫完時呼叫（WebGL 的畫面只有在同一格裡讀得到）
  captureFrame(glCanvas) {
    if (!this.wantsFrame) return;
    this.wantsFrame = false;
    const f = document.createElement('canvas');
    f.width = glCanvas.width;
    f.height = glCanvas.height;
    f.getContext('2d').drawImage(glCanvas, 0, 0);
    this.frame = f;
    this._makeCard();
  }

  async _makeCard() {
    let n = '';
    try { n = (await (await fetch('/api/visitor', { method: 'POST' })).json()).n; } catch (e) { /* 沒有伺服器也照樣做卡片 */ }
    const card = compose(this.frame, this.info, n);
    const img = card.toDataURL('image/png');
    let url = null;
    try {
      const blob = await new Promise((r) => card.toBlob(r, 'image/png'));
      const res = await fetch('/api/card', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
      if (res.ok) url = (await res.json()).url;
    } catch (e) {
      console.warn('[ending] 卡片沒有存成功', e);
    }
    this._show(img, url);
  }

  _show(img, url) {
    const W = CONFIG.wifi;
    let qrs = '';
    if (url && W.ssid) {
      const wifi = `WIFI:T:WPA;S:${W.ssid.replace(/([\\;,:"])/g, '\\$1')};P:${W.password.replace(/([\\;,:"])/g, '\\$1')};;`;
      qrs += `<figure>${qrSvg(wifi)}<figcaption>${COPY.scanWifi}</figcaption></figure>`;
      qrs += `<figure>${qrSvg(url)}<figcaption>${COPY.scanCard}</figcaption></figure>`;
    } else if (url) {
      qrs += `<figure>${qrSvg(url)}<figcaption>${COPY.scanCardOnly}</figcaption></figure>`;
    } else {
      qrs += `<p class="fail">${COPY.scanFail}</p>`;
    }
    this.el.innerHTML = `<img class="card" src="${img}" alt=""><div class="side"><h2>${COPY.dawn}</h2><div class="qrs">${qrs}</div><p id="ending-count"></p></div>`;
    this.el.classList.add('on');
  }
}

// 合成 9:16 的卡片（1080×1920）
function compose(frame, info, n) {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#07090c';
  x.fillRect(0, 0, W, H);
  if (frame) { // 從畫面中間切一塊 9:16
    const fh = frame.height, fw = Math.min(frame.width, (fh * 9) / 16);
    x.drawImage(frame, (frame.width - fw) / 2, 0, fw, fh, 0, 0, W, H);
  }
  let g = x.createLinearGradient(0, 0, 0, 420);
  g.addColorStop(0, 'rgba(7,9,12,0.85)'); g.addColorStop(1, 'rgba(7,9,12,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, 420);
  g = x.createLinearGradient(0, H - 760, 0, H);
  g.addColorStop(0, 'rgba(7,9,12,0)'); g.addColorStop(0.45, 'rgba(7,9,12,0.8)'); g.addColorStop(1, 'rgba(7,9,12,0.95)');
  x.fillStyle = g; x.fillRect(0, H - 760, W, 760);

  const serif = '"Songti TC", "Noto Serif TC", "Noto Serif CJK TC", serif';
  const sans = '"PingFang TC", "Noto Sans TC", sans-serif';
  x.textAlign = 'center';
  x.fillStyle = '#e8ebee';
  x.font = `500 68px ${serif}`;
  x.fillText('感覺一座城市', W / 2, 150);
  x.fillStyle = '#7fe6c8';
  x.font = `600 24px ${sans}`;
  x.fillText('S E N S I N G   K E E L U N G', W / 2, 200);
  x.fillStyle = 'rgba(232,235,238,0.6)';
  x.font = `28px ${sans}`;
  const d = new Date();
  x.fillText(`${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}${n ? '　' + COPY.cardNth(n) : ''}`, W / 2, 255);

  // 握拳收集的碎片
  const frags = (info && info.fragments) || [];
  const tw = 176, th = 132, gap = 18;
  const total = frags.length * tw + Math.max(0, frags.length - 1) * gap;
  frags.forEach((f, i) => {
    const fx = (W - total) / 2 + i * (tw + gap), fy = H - 520;
    x.drawImage(f, fx, fy, tw, th);
    x.strokeStyle = 'rgba(232,235,238,0.55)';
    x.lineWidth = 2;
    x.strokeRect(fx, fy, tw, th);
  });

  x.fillStyle = '#f0f0eb';
  x.font = `500 54px ${serif}`;
  x.fillText(COPY.cardLine[(info && info.reached) || 'street'] || COPY.cardLine.street, W / 2, H - 250);
  x.fillStyle = 'rgba(232,235,238,0.45)';
  x.font = `24px ${sans}`;
  x.fillText('基隆四百｜一個普通的雨夜', W / 2, H - 150);
  return c;
}
