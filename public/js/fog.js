import { CONFIG } from './config.js';

// 霧玻璃：一張低解析度的「霧有多濃」地圖（螢幕座標，第 0 列在最上面）。
// 霧會慢慢長回來；手掌刷過的地方被擦掉。
export class Fog {
  constructor() {
    const { gridW, gridH } = CONFIG.fog;
    this.w = gridW;
    this.h = gridH;
    this.d = new Float32Array(gridW * gridH).fill(0.3);
    this.bytes = new Uint8Array(gridW * gridH);
    this.prev = new Map(); // 每隻手上一格的位置
    this.speed = 0; // 擦的速度（給聲音用）
    this.wiped = 0; // 這位觀眾總共擦了多少
    this.average = 0;
    // 霧從四周往中間長：中間淡、邊緣濃（像真的窗戶起霧）
    this.shape = new Float32Array(gridW * gridH);
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const dx = (x + 0.5) / gridW - 0.5, dy = (y + 0.5) / gridH - 0.5;
        const r = Math.sqrt(dx * dx * 2.2 + dy * dy * 3.2);
        this.shape[y * gridW + x] = Math.min(1, CONFIG.fog.center + (1 - CONFIG.fog.center) * Math.pow(r, 1.4) * 1.6);
      }
    }
  }

  reset(level = 0.3) {
    this.d.fill(level);
    this.prev.clear();
    this.wiped = 0;
  }

  // hands：螢幕座標的手 [{id, x, y}]（x 0–1 往右，y 0–1 往下）
  update(dt, hands, target, aspect) {
    const F = CONFIG.fog;
    const k = 1 - Math.exp(-dt / F.regrowSeconds);
    let sum = 0;
    for (let i = 0; i < this.d.length; i++) {
      this.d[i] += (target * this.shape[i] - this.d[i]) * k;
      sum += this.d[i];
    }
    this.average = sum / this.d.length;

    let speed = 0;
    const seen = new Set();
    for (const hand of hands) {
      seen.add(hand.id);
      const p = this.prev.get(hand.id);
      this.prev.set(hand.id, { x: hand.x, y: hand.y });
      if (!p) continue;
      const dist = Math.hypot((hand.x - p.x) * aspect, hand.y - p.y);
      if (dist < F.minHandSpeed) continue;
      speed = Math.max(speed, dist / Math.max(dt, 1e-3));
      // 從上一個位置到這一個位置，一路擦過去
      const steps = Math.ceil(dist / (F.brushRadius * 0.35));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        this._stamp(p.x + (hand.x - p.x) * t, p.y + (hand.y - p.y) * t, aspect);
      }
    }
    for (const id of [...this.prev.keys()]) if (!seen.has(id)) this.prev.delete(id);
    this.speed += (Math.min(1, speed / 1.5) - this.speed) * 0.3;

    for (let i = 0; i < this.d.length; i++) this.bytes[i] = Math.max(0, Math.min(255, this.d[i] * 255));
    return this.bytes;
  }

  _stamp(x, y, aspect) {
    const { w, h } = this;
    const r = CONFIG.fog.brushRadius;
    const rx = (r / aspect) * w, ry = r * h;
    const cx = x * w, cy = y * h;
    for (let gy = Math.max(0, Math.floor(cy - ry)); gy <= Math.min(h - 1, Math.ceil(cy + ry)); gy++) {
      for (let gx = Math.max(0, Math.floor(cx - rx)); gx <= Math.min(w - 1, Math.ceil(cx + rx)); gx++) {
        const dx = (gx + 0.5 - cx) / rx, dy = (gy + 0.5 - cy) / ry;
        const q = dx * dx + dy * dy;
        if (q < 1) {
          const i = gy * w + gx;
          const before = this.d[i];
          this.d[i] *= 0.1 + 0.9 * q * q; // 中間擦得最乾淨
          this.wiped += before - this.d[i];
        }
      }
    }
  }
}
