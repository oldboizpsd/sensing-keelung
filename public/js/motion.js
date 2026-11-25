import { CONFIG } from './config.js';

// 影格相減：比較這一格和上一格的亮度差，算出「動了多少」。
// 不用任何模型，所以就算 MediaPipe 還沒裝好也能動。
export class Motion {
  constructor() {
    const { width, height } = CONFIG.motion;
    this.w = width;
    this.h = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.prev = new Uint8Array(width * height);
    this.map = new Uint8Array(width * height); // 每個點動了多少，給除錯和之後的效果用
    this.hasPrev = false;
    this.raw = 0; // 這一格的動作量
    this.amount = 0; // 平滑後的動作量 0–1
    this.centerX = 0.5; // 動作的重心（影片座標）
    this.velocityX = 0; // 動作重心的水平速度，決定拖影方向
  }

  // region：只看主角附近（影片座標 0–1），避免後面的路人干擾
  // dt：距離上次計算經過幾秒（用時間平滑，跟影格數無關）
  // exclude：不算進來的範圍（手），影片座標 [x0, y0, x1, y1]
  update(video, region = null, dt = 1 / 30, exclude = []) {
    const { w, h } = this;
    const { pixelThreshold, gain, attack, release } = CONFIG.motion;
    this.ctx.drawImage(video, 0, 0, w, h);
    const px = this.ctx.getImageData(0, 0, w, h).data;
    const x0 = region ? Math.max(0, Math.floor(region.x0 * w)) : 0;
    const x1 = region ? Math.min(w, Math.ceil(region.x1 * w)) : w;
    const ex = exclude.map((b) => [b[0] * w, b[1] * h, b[2] * w, b[3] * h]);
    const skip = (x, y) => ex.some((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
    let sum = 0, count = 0, sx = 0, sxW = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const p = i * 4;
        const lum = (px[p] * 77 + px[p + 1] * 150 + px[p + 2] * 29) >> 8;
        const d = this.hasPrev ? Math.abs(lum - this.prev[i]) : 0;
        this.prev[i] = lum;
        const v = d > pixelThreshold ? Math.min(255, d * 3) : 0;
        this.map[i] = v;
        if (x >= x0 && x < x1 && !(ex.length && skip(x, y))) {
          count++;
          if (v) { sum += v; sx += x * v; sxW += v; }
        }
      }
    }
    this.hasPrev = true;
    this.raw = count ? Math.min(1, (sum / count / 255) * gain) : 0;
    const tau = this.raw > this.amount ? attack : release;
    this.amount += (this.raw - this.amount) * (1 - Math.exp(-dt / tau));
    if (sxW > 0) {
      const cx = sx / sxW / w;
      this.velocityX += ((cx - this.centerX) - this.velocityX) * 0.25;
      this.centerX = cx;
    } else {
      this.velocityX *= 0.9;
    }
    return this.amount;
  }
}
