import { CONFIG } from './config.js';

// 留在街上的路人身影：觀眾離開後，他的模糊人形留在畫面裡，變成下一個人看到的路人。
// 只存模糊輪廓，不存臉、不錄影。每天清空（日期改變或重新整理網頁）。
const GW = 320, GH = 180;

export class Ghosts {
  constructor() {
    this.list = []; // 今天的身影 {canvas, dx}
    this.day = new Date().toDateString();
    this.pending = null; // 目前這位觀眾最近一次清楚的人形
    this.canvas = document.createElement('canvas');
    this.canvas.width = GW;
    this.canvas.height = GH;
    this.ctx = this.canvas.getContext('2d');
    this.dirty = true;
    this._tmp = document.createElement('canvas');
  }

  get count() { return this.list.length; }

  // 每隔一兩秒呼叫：把主角現在的人形存起來（影片座標 → 螢幕座標）
  remember(tracking, camCover, mirror) {
    const { mask, maskW: mw, maskH: mh, main } = tracking;
    if (!mask || !main) return;
    this._tmp.width = mw;
    this._tmp.height = mh;
    const tctx = this._tmp.getContext('2d');
    const img = tctx.createImageData(mw, mh);
    let sum = 0;
    for (let y = 0; y < mh; y++) {
      const below = Math.min(1, Math.max(0, (y / mh - (main.cy - main.h)) / (main.h * 0.4)));
      for (let x = 0; x < mw; x++) {
        const dx = (x / mw - main.cx) / Math.max(0.05, main.w * 2.3);
        const a = (mask[y * mw + x] / 255) * Math.exp(-dx * dx) * below;
        const i = (y * mw + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = a * 255;
        sum += a;
      }
    }
    if (sum / (mw * mh) < 0.01) return; // 太小，可能沒抓到人
    tctx.putImageData(img, 0, 0);
    const snap = document.createElement('canvas');
    snap.width = GW;
    snap.height = GH;
    const s = snap.getContext('2d');
    const dw = GW / camCover[0], dh = GH / camCover[1];
    const left = GW * (0.5 - 0.5 / camCover[0]), top = GH * (0.5 - 0.5 / camCover[1]);
    if (mirror) { s.translate(left + dw, top); s.scale(-1, 1); s.drawImage(this._tmp, 0, 0, dw, dh); }
    else s.drawImage(this._tmp, left, top, dw, dh);
    this.pending = snap;
  }

  // 這位觀眾結束了：把他留在街上
  commit() {
    if (!this.pending) return;
    this._checkDay();
    this.list.push({ canvas: this.pending, dx: (Math.random() - 0.5) * 0.6 * GW });
    this.pending = null;
    while (this.list.length > CONFIG.ghosts.maxPerDay) this.list.shift();
    this.dirty = true;
  }

  discard() { this.pending = null; }

  _checkDay() {
    const d = new Date().toDateString();
    if (d !== this.day) { this.day = d; this.list = []; this.dirty = true; }
  }

  // 合成成一張圖：越新的越清楚
  compose() {
    this._checkDay();
    if (!this.dirty) return null;
    this.dirty = false;
    const { ctx } = this;
    ctx.clearRect(0, 0, GW, GH);
    const vis = this.list.slice(-CONFIG.ghosts.maxVisible);
    vis.forEach((g, i) => {
      ctx.globalAlpha = 0.25 + 0.5 * ((i + 1) / vis.length);
      ctx.drawImage(g.canvas, g.dx, 0);
    });
    ctx.globalAlpha = 1;
    return this.canvas;
  }
}
