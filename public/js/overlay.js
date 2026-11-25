// 疊在 WebGL 畫面上的 2D 效果：接雨、乾麵的熱氣、鐵捲門、浮起來的氣味字詞。
const rand = (a, b) => a + Math.random() * (b - a);

export class Overlay {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.drops = [];
    this.splashes = [];
    this.ripples = [];
    this.puddle = { x: 0.5, y: 0.8, level: 0 };
    this.steam = [];
    this.words = [];
    this.shutterOffset = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.W = w; this.H = h; this.dpr = dpr;
  }

  addWords(list, line) {
    const spots = [[0.27, 0.3], [0.72, 0.26], [0.3, 0.6], [0.74, 0.56], [0.5, 0.18]];
    list.forEach((t, i) => { const [x, y] = spots[i % spots.length]; this.words.push({ text: t, x: x + rand(-0.03, 0.03), y, t: -i * 0.7, life: 6, size: 1 }); });
    if (line) this.words.push({ text: line, x: 0.5, y: 0.82, t: -list.length * 0.7 - 0.5, life: 8, size: 0.85, center: true });
  }

  clearWords() { this.words = []; }

  // s: { catchHand: {x,y,amount}|null, steam: {density, blow}|null, shutter: 0–1, time }
  update(dt, s) {
    this.resize();
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);

    // ---- 接雨 ----
    const hand = s.catchHand;
    if (hand && hand.amount > 0) {
      this.puddle.x += (hand.x - this.puddle.x) * 0.2;
      this.puddle.y = Math.min(0.95, hand.y + 0.16);
      this.puddle.level = Math.min(1, this.puddle.level + dt * 0.18 * hand.amount);
      const rate = 26 * hand.amount;
      for (let i = 0; i < rate * dt * 3; i++) {
        if (Math.random() < 1 / 3) this.drops.push({ x: hand.x + rand(-0.045, 0.045), y: hand.y - rand(0.2, 0.5), vy: rand(1.2, 1.8), stop: hand.y - 0.015 });
      }
    } else {
      this.puddle.level = Math.max(0, this.puddle.level - dt * 0.08);
    }
    for (const d of this.drops) d.y += d.vy * dt;
    this.drops = this.drops.filter((d) => {
      if (d.y < d.stop) return true;
      for (let k = 0; k < 4; k++) this.splashes.push({ x: d.x, y: d.stop, vx: rand(-0.12, 0.12), vy: rand(-0.35, -0.12), life: rand(0.25, 0.45), t: 0 });
      if (this.puddle.level > 0.1 && Math.random() < 0.35) this.ripples.push({ x: this.puddle.x + rand(-0.05, 0.05) * this.puddle.level, y: this.puddle.y + rand(-0.01, 0.01), t: 0 });
      return false;
    });
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(215,230,240,0.75)';
    ctx.lineWidth = 1.4 * this.dpr;
    ctx.beginPath();
    for (const d of this.drops) { ctx.moveTo(d.x * W, d.y * H); ctx.lineTo(d.x * W - 1.5 * this.dpr, (d.y - 0.035) * H); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(225,238,245,0.8)';
    this.splashes = this.splashes.filter((p) => {
      p.t += dt; p.vy += 1.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t > p.life) return false;
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 1.6 * this.dpr, 0, Math.PI * 2); ctx.fill();
      return true;
    });
    ctx.globalAlpha = 1;
    // 手下面的一小攤水：反光＋漣漪
    if (this.puddle.level > 0.01) {
      const P = this.puddle, rx = (0.03 + 0.09 * P.level) * W, ry = rx * 0.22;
      const g = ctx.createRadialGradient(P.x * W, P.y * H, 0, P.x * W, P.y * H, rx);
      g.addColorStop(0, `rgba(190,215,235,${0.32 * P.level})`);
      g.addColorStop(0.7, `rgba(120,150,175,${0.18 * P.level})`);
      g.addColorStop(1, 'rgba(120,150,175,0)');
      ctx.save(); ctx.translate(P.x * W, P.y * H); ctx.scale(1, ry / rx); ctx.translate(-P.x * W, -P.y * H);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x * W, P.y * H, rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.lineWidth = 1 * this.dpr;
    this.ripples = this.ripples.filter((r) => {
      r.t += dt;
      if (r.t > 0.9) return false;
      const rr = (0.006 + r.t * 0.05) * W;
      ctx.strokeStyle = `rgba(220,235,245,${0.6 * (1 - r.t / 0.9)})`;
      ctx.beginPath(); ctx.ellipse(r.x * W, r.y * H, rr, rr * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      return true;
    });

    // ---- 乾麵的熱氣 ----
    const st = s.steam;
    if (st && st.density > 0.01) {
      for (let i = 0; i < 40 * st.density * dt * 3; i++) {
        if (Math.random() < 1 / 3) this.steam.push({ x: 0.5 + rand(-0.2, 0.2), y: rand(0.5, 0.8), vx: 0, vy: rand(-0.05, -0.1), r: rand(0.05, 0.11), t: 0, life: rand(3.5, 6), phase: rand(0, 6.28) });
      }
    }
    for (const p of this.steam) {
      p.t += dt;
      p.vx += Math.sin(s.time * 1.3 + p.phase) * 0.012 * dt;
      if (st && st.blow > 0) { // 吹氣：往外、往上散開
        const dx = p.x - 0.5;
        p.vx += Math.sign(dx || rand(-1, 1)) * 0.9 * st.blow * dt;
        p.vy -= 0.4 * st.blow * dt;
        p.life -= 1.5 * st.blow * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += 0.025 * dt;
    }
    this.steam = this.steam.filter((p) => p.t < p.life && p.y > -0.2);
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.steam) {
      const a = Math.sin(Math.min(1, p.t / p.life) * Math.PI) * 0.075 * (st ? 0.4 + 0.6 * st.density : 0.5);
      const g = ctx.createRadialGradient(p.x * W, p.y * H, 0, p.x * W, p.y * H, p.r * W);
      g.addColorStop(0, `rgba(228,232,236,${a})`);
      g.addColorStop(0.6, `rgba(228,232,236,${a * 0.5})`);
      g.addColorStop(1, 'rgba(228,232,236,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r * W, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // ---- 氣味字詞 ----
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.words = this.words.filter((w) => {
      w.t += dt;
      if (w.t < 0) return true;
      if (w.t > w.life) return false;
      const a = Math.min(1, w.t / 1.2) * Math.min(1, (w.life - w.t) / 1.5);
      const size = Math.round((w.center ? 1.6 : 2.4) * w.size * W / 100);
      ctx.font = `${size}px "Songti TC", "Noto Serif TC", "Noto Serif CJK TC", serif`;
      ctx.fillStyle = `rgba(240,240,235,${a * 0.95})`;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 16;
      ctx.fillText(w.text, w.x * W, (w.y - (w.center ? 0 : w.t * 0.012)) * H);
      ctx.shadowBlur = 0;
      return true;
    });

    // ---- 鐵捲門 ----
    if (s.shutter > 0.001) {
      const bottom = s.shutter * H;
      this.shutterOffset = (this.shutterOffset + (s.shutterMoving || 0) * dt * 0.4) % 1;
      const g = ctx.createLinearGradient(0, 0, 0, bottom);
      g.addColorStop(0, '#3a3f44');
      g.addColorStop(1, '#2a2e33');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, bottom);
      const slat = H * 0.032;
      ctx.lineWidth = Math.max(1, this.dpr);
      for (let y = bottom - slat * (1 - this.shutterOffset); y > -slat; y -= slat) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, y - slat * 0.45, W, slat * 0.2);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.fillStyle = '#1c1f23';
      ctx.fillRect(0, bottom - H * 0.025, W, H * 0.025);
      ctx.fillStyle = 'rgba(200,205,210,0.25)';
      ctx.fillRect(W * 0.47, bottom - H * 0.02, W * 0.06, H * 0.008); // 把手
    }
  }
}
