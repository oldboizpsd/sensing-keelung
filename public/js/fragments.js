import { CONFIG } from './config.js';

// 握拳收集：把手邊那一小塊照片剪下來，飛到右邊排好。最多 5 塊，結尾會排進卡片。
export class Fragments {
  constructor() {
    this.strip = document.getElementById('strip');
    this.counter = document.getElementById('strip-count');
    this.slots = [...this.strip.querySelectorAll('.slot')];
    this.items = []; // {canvas, scene, src}
    this._lastAt = 0;
    this._fistFrames = 0;
    this._wasFist = false;
    this._render();
  }

  get full() {
    return this.items.length >= CONFIG.fist.max;
  }

  reset() {
    this.items = [];
    this.slots.forEach((s) => (s.innerHTML = ''));
    this._render();
  }

  // 每次有新的手勢結果時呼叫。回傳 true = 這次握拳成立
  checkFist(hands, now) {
    const F = CONFIG.fist;
    const fist = hands.find((h) => h.gesture === 'Closed_Fist' && h.score >= F.minScore);
    this._fistFrames = fist ? this._fistFrames + 1 : 0;
    const isFist = this._fistFrames >= F.holdFrames;
    const trigger = isFist && !this._wasFist && now - this._lastAt > F.cooldownMs;
    this._wasFist = isFist;
    if (trigger) this._lastAt = now;
    return trigger ? fist : null;
  }

  // img：目前的照片；cover：照片填滿螢幕的縮放；sx, sy：手在螢幕上的位置（0–1，y 往下）
  capture(img, cover, sx, sy, meta) {
    if (this.full) return false;
    const aspect = window.innerWidth / window.innerHeight;
    const cw = CONFIG.fist.cropWidth, ch = cw * aspect * 0.75; // 4:3
    // 螢幕座標 → 照片像素
    const toImg = (x, y) => {
      const u = 0.5 + (x - 0.5) * cover[0];
      const v = 0.5 + (y - 0.5) * cover[1];
      return [u * img.naturalWidth, v * img.naturalHeight];
    };
    const [ax, ay] = toImg(sx - cw / 2, sy - ch / 2);
    const [bx, by] = toImg(sx + cw / 2, sy + ch / 2);
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    canvas.getContext('2d').drawImage(img, ax, ay, bx - ax, by - ay, 0, 0, 320, 240);
    this.items.push({ canvas, ...meta });

    // 從手的位置飛到右邊的格子
    const slot = this.slots[this.items.length - 1];
    const fly = canvas.cloneNode();
    fly.getContext('2d').drawImage(canvas, 0, 0);
    fly.className = 'fly';
    const W = window.innerWidth, H = window.innerHeight;
    const startW = cw * W;
    Object.assign(fly.style, { left: `${sx * W - startW / 2}px`, top: `${sy * H - (startW * 0.75) / 2}px`, width: `${startW}px` });
    document.body.appendChild(fly);
    const r = slot.getBoundingClientRect();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        Object.assign(fly.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
      });
    });
    setTimeout(() => {
      fly.remove();
      slot.innerHTML = '';
      slot.appendChild(canvas);
      this._render();
    }, 900);
    this._render();
    return true;
  }

  _render() {
    this.counter.textContent = `${this.items.length} / ${CONFIG.fist.max}`;
    this.strip.classList.toggle('on', this.items.length > 0);
  }
}
