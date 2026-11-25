// 除錯畫面（只給作者用）：按 D 開關。
// 看得到鏡頭畫面、臉框、主角、人形遮罩和所有數值，到現場調整 config.js 用。
// 按 M：用滑鼠假裝成觀眾（沒有鏡頭也能測）：滑鼠 = 手、按住 = 握拳、按住 Shift = 身體在動、[ ] = 轉頭。
// 按 N：直接跳到下一個場景。
export class Debug {
  constructor() {
    this.on = false;
    this.mouseSim = false;
    this.el = document.getElementById('debug');
    this.cv = document.getElementById('debug-cam');
    this.ctx = this.cv.getContext('2d');
    this.info = document.getElementById('debug-info');
    this.mouse = { x: 0.5, y: 0.5, speed: 0, _x: 0.5, _y: 0.5, down: false, shift: false };
    this.yaw = 0;
    this.skipScene = false;
    // 滑鼠模擬時的其他動作：P 按住 = 指、U 按住 = 兩手往上抬、Y = 點頭、H = 搖頭、B 按住 = 吹氣、T 按住 = 講話
    this.sim = { point: false, lift: false, nod: false, shake: false, blow: false, talk: false };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'd' || e.key === 'D') this.toggle();
      if (e.key === 'm' || e.key === 'M') this.mouseSim = !this.mouseSim;
      if (e.key === 'n' || e.key === 'N') this.skipScene = true;
      if (e.key === '[') this.yaw = Math.max(-1, this.yaw - 0.25);
      if (e.key === ']') this.yaw = Math.min(1, this.yaw + 0.25);
      if (e.key === 'Shift') this.mouse.shift = true;
      const k = e.key.toLowerCase();
      if (k === 'p') this.sim.point = true;
      if (k === 'u') this.sim.lift = true;
      if (k === 'b') this.sim.blow = true;
      if (k === 't') this.sim.talk = true;
      if (k === 'y') this.sim.nod = true;
      if (k === 'h') this.sim.shake = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.mouse.shift = false;
      const k = e.key.toLowerCase();
      if (k === 'p') this.sim.point = false;
      if (k === 'u') this.sim.lift = false;
      if (k === 'b') this.sim.blow = false;
      if (k === 't') this.sim.talk = false;
    });
    window.addEventListener('pointerdown', () => (this.mouse.down = true));
    window.addEventListener('pointerup', () => (this.mouse.down = false));
    window.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX / window.innerWidth;
      this.mouse.y = e.clientY / window.innerHeight;
    });
  }

  toggle() {
    this.on = !this.on;
    this.el.hidden = !this.on;
  }

  // 每格更新滑鼠速度（給滑鼠模擬用）
  tickMouse() {
    const m = this.mouse;
    const d = Math.hypot(m.x - m._x, m.y - m._y);
    m.speed += (Math.min(1, d * 40) - m.speed) * 0.2;
    m._x = m.x;
    m._y = m.y;
  }

  draw(video, tracking, motion, state, fps, extra = {}) {
    if (!this.on) return;
    const { ctx, cv } = this;
    const W = cv.width, H = cv.height;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W, 0);
    ctx.scale(-1, 1); // 鏡像，跟主畫面一致
    if (video && video.readyState >= 2) ctx.drawImage(video, 0, 0, W, H);
    // 人形遮罩
    if (tracking.mask) {
      const mw = tracking.maskW, mh = tracking.maskH;
      if (!this._mc || this._mc.width !== mw) {
        this._mc = document.createElement('canvas');
        this._mc.width = mw;
        this._mc.height = mh;
      }
      const mctx = this._mc.getContext('2d');
      const img = mctx.createImageData(mw, mh);
      for (let i = 0; i < tracking.mask.length; i++) {
        img.data[i * 4] = 80;
        img.data[i * 4 + 1] = 230;
        img.data[i * 4 + 2] = 200;
        img.data[i * 4 + 3] = tracking.mask[i] * 0.45;
      }
      mctx.putImageData(img, 0, 0);
      ctx.drawImage(this._mc, 0, 0, W, H);
    }
    // 臉框
    for (const f of tracking.faces) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect((f.cx - f.w / 2) * W, (f.cy - f.h / 2) * H, f.w * W, f.h * H);
    }
    for (const h of tracking.hands) {
      ctx.fillStyle = h.gesture === 'Closed_Fist' ? '#ffb36b' : '#7fe6c8';
      ctx.beginPath();
      ctx.arc(h.x * W, h.y * H, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (tracking.main) {
      const f = tracking.main;
      ctx.strokeStyle = '#7fe6c8';
      ctx.lineWidth = 4;
      ctx.strokeRect((f.cx - f.w / 2) * W, (f.cy - f.h / 2) * H, f.w * W, f.h * H);
    }
    ctx.restore();
    // 動作量條
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, H - 14, W, 14);
    ctx.fillStyle = '#7fe6c8';
    ctx.fillRect(0, H - 14, W * motion.amount, 14);

    const rows = [
      ['FPS', fps.toFixed(0)],
      ['MediaPipe', tracking.ready ? '已載入' : '沒有（npm run setup）'],
      ['看到的臉', tracking.faces.length],
      ['主角', tracking.locked ? '鎖定' : '—'],
      ['頭轉向（+ = 觀眾的左）', tracking.yaw.toFixed(2)],
      ['手', tracking.hands.map((h) => h.gesture).join('、') || '—'],
      ['場景', `${state.sceneId}　${state.sceneTime.toFixed(0)} 秒`],
      ['霧', state.fogAvg.toFixed(2)],
      ['碎片', state.fragments],
      ['麥克風', extra.mic && extra.mic.available ? `音量 ${extra.mic.level.toFixed(3)}｜低頻 ${extra.mic.low.toFixed(2)}｜${extra.mic.blowing ? '吹氣' : extra.mic.talking ? '講話' : '—'}` : '沒有'],
      ['頭（點頭用）', tracking.main ? `pitch ${(tracking.main.pitch || 0).toFixed(2)}` : '—'],
      ['接雨', state.catchAmount.toFixed(2)],
      ['乾麵熱氣', state.noodle ? state.noodle.density.toFixed(2) : '—'],
      ['鐵捲門', state.shutter ? state.shutter.phase : '—'],
      ['結尾', extra.ending ? extra.ending.stage : '—'],
      ['街上的身影', extra.ghosts ? extra.ghosts.count : 0],
      ['動作量', motion.amount.toFixed(3)],
      ['停下秒數', state.stillTime.toFixed(1)],
      ['對焦', state.focus.toFixed(2)],
      ['狀態', state.phase],
      ['照片', state.photoIndex],
      ['聲音', state.audioRunning ? '播放中' : '等待點擊（kiosk 模式會自動）'],
      ['滑鼠模擬（M）', this.mouseSim ? '開' : '關'],
    ];
    this.info.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }
}
