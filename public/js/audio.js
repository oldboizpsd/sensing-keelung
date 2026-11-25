import { CONFIG } from './config.js';
import { AUDIO, SFX } from './content.js';

// 聲音分三層：
// 1. 底層雨聲（一直都在，跟著觀眾動作起伏）
// 2. 路口兩側的環境音（每個場景不同，轉頭時一邊變清楚、一邊變悶）
// 3. 動作音（擦玻璃、握拳）
// 長的環境音用 <audio> 串流，不會一次吃掉大量記憶體。
export class AudioEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.audio.master;
    this.master.connect(this.ctx.destination);
    this.loops = {};
    for (const [id, src] of Object.entries(AUDIO)) this.loops[id] = this._loop(src);
    this.buffers = {};
    for (const [id, src] of Object.entries(SFX)) {
      fetch(src)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx.decodeAudioData(b))
        .then((buf) => (this.buffers[id] = buf))
        .catch((e) => console.warn('[audio] 載入失敗', src, e));
    }
    this.scene = null;
  }

  _loop(src) {
    const el = new Audio(src);
    el.loop = true;
    el.preload = 'auto';
    const node = this.ctx.createMediaElementSource(el);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2500;
    const pan = this.ctx.createStereoPanner();
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    node.connect(filter).connect(pan).connect(gain).connect(this.master);
    // 從檔案中間隨機一個地方開始，每次聽起來不一樣
    el.addEventListener('loadedmetadata', () => {
      if (isFinite(el.duration)) el.currentTime = Math.random() * el.duration * 0.8;
    }, { once: true });
    return { el, filter, pan, gain, playing: false, want: 0 };
  }

  get running() {
    return this.ctx.state === 'running';
  }

  // 展場用 kiosk 模式會自動允許播放；一般瀏覽器要先點一下或按任一鍵
  async resume() {
    try {
      await this.ctx.resume();
    } catch (e) { /* 等使用者互動 */ }
  }

  _ensurePlaying(l, on) {
    if (on && !l.playing && this.running) {
      l.playing = true;
      l.el.play().catch(() => (l.playing = false));
    } else if (!on && l.playing && l.gain.gain.value < 0.002) {
      l.playing = false;
      l.el.pause();
    }
  }

  playSfx(id, volume = 1) {
    const buf = this.buffers[id];
    if (!buf || !this.running) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = CONFIG.audio.sfx * volume;
    src.connect(g).connect(this.master);
    src.start();
  }

  // 鐵捲門的聲音：用雜訊合成金屬片一片一片捲動的聲音
  playShutter(seconds = 1.6) {
    if (!this.running) return;
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const rate = 22; // 每秒幾片
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const ph = (t * rate) % 1;
      const click = Math.exp(-ph * 18); // 每一片撞一下
      const env = Math.min(1, t * 6) * Math.min(1, (seconds - t) * 3);
      d[i] = (Math.random() * 2 - 1) * (0.25 + click) * env * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = CONFIG.audio.sfx;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
  }

  // 每格呼叫
  // s: { motion, presence, scene, sceneMix(0–1 換場景中), nextScene, yaw(-1~1, 正 = 觀眾的左邊), wipe(0–1), dawn(0–1),
  //      ambientMul（講話時變小、安靜時變大）, catchAmount, catchX }
  update(s) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const A = CONFIG.audio;

    // 1. 底層雨聲：天亮時雨停
    const rain = this.loops.rain;
    const rainVol = (A.rainIdle + s.presence * (A.rainBase - A.rainIdle + s.motion * A.rainMotion)) * (1 - s.dawn);
    rain.gain.gain.setTargetAtTime(rainVol, t, 0.25);
    rain.filter.frequency.setTargetAtTime(900 + s.motion * 7000 + (1 - s.presence) * 400, t, 0.3);
    this._ensurePlaying(rain, rainVol > 0.001);

    // 2. 路口兩側：目前場景（淡出）和下一個場景（淡入）
    const want = {};
    const add = (scene, weight) => {
      if (!scene || weight <= 0) return;
      const both = !scene.right;
      for (const [side, id] of [['left', scene.left], ['right', scene.right]]) {
        if (!id) continue;
        // 觀眾往左轉頭（yaw > 0）→ 左邊那個聲音變清楚
        const w = both ? 0.5 : side === 'left' ? 0.5 + 0.5 * s.yaw : 0.5 - 0.5 * s.yaw;
        const cur = want[id] || { vol: 0, w: 0, pan: 0 };
        cur.vol += weight * A.ambient * (0.35 + 0.9 * w) * (0.4 + 0.6 * s.presence) * (s.ambientMul ?? 1);
        cur.w = Math.max(cur.w, w);
        cur.pan = both ? 0 : side === 'left' ? -0.85 : 0.85;
        want[id] = cur;
      }
    };
    add(s.scene, 1 - s.sceneMix);
    add(s.nextScene, s.sceneMix);
    for (const [id, l] of Object.entries(this.loops)) {
      if (id === 'rain' || id === 'wipe' || id === 'rainHand') continue;
      const w = want[id];
      const vol = w ? w.vol : 0;
      l.gain.gain.setTargetAtTime(vol, t, 0.4);
      if (w) {
        l.filter.frequency.setTargetAtTime(500 + 11000 * w.w * w.w, t, 0.3); // 轉開的那一邊變悶
        l.pan.pan.setTargetAtTime(w.pan, t, 0.5);
      }
      this._ensurePlaying(l, vol > 0.001);
    }

    // 接雨：雨打在手上，聲音跟著手的位置左右移動
    const rh = this.loops.rainHand;
    const rhVol = 0.55 * (s.catchAmount || 0);
    rh.gain.gain.setTargetAtTime(rhVol, t, 0.2);
    rh.filter.frequency.setTargetAtTime(6000, t, 0.2);
    rh.pan.pan.setTargetAtTime(((s.catchX ?? 0.5) - 0.5) * 1.6, t, 0.2);
    this._ensurePlaying(rh, rhVol > 0.001);

    // 3. 擦玻璃：跟著手的速度
    const wipe = this.loops.wipe;
    const wipeVol = A.wipe * Math.min(1, s.wipe * 1.4);
    wipe.gain.gain.setTargetAtTime(wipeVol, t, 0.06);
    wipe.el.playbackRate = 0.8 + s.wipe * 0.6;
    this._ensurePlaying(wipe, wipeVol > 0.001);
  }
}
