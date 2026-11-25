import { CONFIG } from './config.js';

// 麥克風：吹氣（很大聲、大多是低頻的氣流聲）、講話、安靜。
// 沒有麥克風也能玩：available 會是 false，吹氣和安靜的互動就自己慢慢發生。
export class Mic {
  constructor(ctx) {
    this.ctx = ctx;
    this.available = false;
    this.level = 0; // 0–1 平滑過的音量
    this.low = 0; // 低頻比例
    this.blowing = false;
    this.talking = false;
    this.quietSeconds = 0;
    this.talkSeconds = 0;
    this._blowSince = 0;
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const src = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.3;
      src.connect(this.analyser); // 不接到喇叭，避免回授
      this.time = new Float32Array(this.analyser.fftSize);
      this.freq = new Float32Array(this.analyser.frequencyBinCount);
      this.available = true;
    } catch (e) {
      console.warn('[mic] 沒有麥克風，吹氣和安靜改成自動', e);
    }
  }

  update(dt, now) {
    if (!this.available) return;
    const M = CONFIG.mic;
    this.analyser.getFloatTimeDomainData(this.time);
    let sum = 0;
    for (const v of this.time) sum += v * v;
    const rms = Math.sqrt(sum / this.time.length);
    this.analyser.getFloatFrequencyData(this.freq);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    let lowE = 0, allE = 0;
    for (let i = 1; i < this.freq.length; i++) {
      const e = Math.pow(10, this.freq[i] / 10);
      allE += e;
      if (i * binHz < 400) lowE += e;
    }
    const low = allE > 0 ? lowE / allE : 0;
    this.level += (rms - this.level) * (rms > this.level ? 0.5 : 0.1);
    this.low += (low - this.low) * 0.3;

    const blowNow = rms > M.blowLevel && low > M.blowLowRatio;
    if (blowNow) { if (!this._blowSince) this._blowSince = now; } else this._blowSince = 0;
    this.blowing = !!this._blowSince && now - this._blowSince > M.blowHoldMs;
    this.talking = !this.blowing && this.level > M.talkLevel;
    this.talkSeconds = this.talking ? this.talkSeconds + dt : Math.max(0, this.talkSeconds - dt * 2);
    this.quietSeconds = this.level < M.quietLevel ? this.quietSeconds + dt : 0;
  }
}
