import { CONFIG } from './config.js';

// MediaPipe：臉（找主角、算轉頭）＋手（擦玻璃、握拳）＋人形分割（畫輪廓）。
// 模型放在 public/vendor/mediapipe（npm run setup 下載），展場不需要網路。
// 所有座標都是「影片座標」：0–1，左上角是 (0,0)，還沒鏡像。
const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;

export class Tracking {
  constructor() {
    this.ready = false;
    this.handsReady = false;
    this.error = null;
    this.faces = []; // 這一格看到的所有臉 {cx, cy, w, h, yaw}
    this.main = null; // 鎖定的主角
    this.locked = false;
    this.lockedAt = 0;
    this.yaw = 0; // 主角的頭：正 = 轉向他自己的左邊，負 = 右邊（-1 ~ 1，平滑過）
    this.hands = []; // 主角的手 {x, y, box:[x0,y0,x1,y1], gesture, score}
    this._candidateSince = 0;
    this._lastSeen = 0;
    this._lastTs = 0;
    this._frame = 0;
    this.mask = null;
    this.maskW = 0;
    this.maskH = 0;
    this.maskVersion = 0;
  }

  async init() {
    try {
      const vision = await import(BASE + 'vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(BASE + 'wasm');
      const make = async (Task, opts) => {
        try {
          return await Task.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } });
        } catch (e) {
          console.warn('[tracking] GPU 不行，改用 CPU', e);
          return await Task.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } });
        }
      };
      this.faceLandmarker = await make(vision.FaceLandmarker, {
        baseOptions: { modelAssetPath: BASE + 'models/face_landmarker.task' },
        runningMode: 'VIDEO',
        numFaces: 3,
        minFaceDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      this.segmenter = await make(vision.ImageSegmenter, {
        baseOptions: { modelAssetPath: BASE + 'models/selfie_segmenter.tflite' },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      this.ready = true;
      console.log('[tracking] 臉和人形準備好了');
      // 手勢模型比較大，晚一點載入，不擋主畫面
      this.gestures = await make(vision.GestureRecognizer, {
        baseOptions: { modelAssetPath: BASE + 'models/gesture_recognizer.task' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      this.handsReady = true;
      console.log('[tracking] 手勢準備好了');
    } catch (err) {
      this.error = err;
      console.warn('[tracking] 沒有 MediaPipe，改用動作量猜有沒有人。請執行 npm run setup。', err);
    }
  }

  _ts() {
    const t = Math.max(Math.round(performance.now()), this._lastTs + 1);
    this._lastTs = t;
    return t;
  }

  update(video, now) {
    if (!this.ready) return;
    this._frame++;

    // 臉：每一格都算
    const res = this.faceLandmarker.detectForVideo(video, this._ts());
    this.faces = (res.faceLandmarks || []).map(faceFromLandmarks).filter((f) => f.w >= CONFIG.people.minFaceWidth);
    this._updateLock(now);
    if (this.main) {
      const H = CONFIG.head;
      const target = Math.max(-1, Math.min(1, this.main.yaw / H.fullTurn));
      this.yaw += (target - this.yaw) * H.smoothing;
    } else {
      this.yaw *= 0.9;
    }

    // 人形分割和手勢輪流算，省效能
    if (this._frame % 2 === 0) {
      this.segmenter.segmentForVideo(video, this._ts(), (result) => {
        const m = result.confidenceMasks && result.confidenceMasks[0];
        if (!m) return;
        const f = m.getAsFloat32Array();
        if (!this.mask || this.mask.length !== f.length) this.mask = new Uint8Array(f.length);
        for (let i = 0; i < f.length; i++) this.mask[i] = f[i] * 255;
        this.maskW = m.width;
        this.maskH = m.height;
        this.maskVersion++;
      });
    } else if (this.handsReady) {
      const g = this.gestures.recognizeForVideo(video, this._ts());
      const region = this.mainRegion();
      this.hands = (g.landmarks || []).map((lm, i) => {
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        for (const p of lm) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
        // 手掌中心：手腕和四個指根的平均
        const ids = [0, 5, 9, 13, 17];
        const x = ids.reduce((s, k) => s + lm[k].x, 0) / ids.length;
        const y = ids.reduce((s, k) => s + lm[k].y, 0) / ids.length;
        const top = g.gestures && g.gestures[i] && g.gestures[i][0];
        return { x, y, tip: { x: lm[8].x, y: lm[8].y }, box: [x0, y0, x1, y1], gesture: top ? top.categoryName : 'None', score: top ? top.score : 0 };
      }).filter((h) => !region || (h.x > region.x0 - 0.1 && h.x < region.x1 + 0.1)); // 只要主角的手
      if (!this.locked) this.hands = [];
    }
  }

  _score(f) {
    // 臉越大（越近）、越靠中間，分數越高
    return f.w * f.w * (1.2 - Math.min(1, Math.abs(f.cx - 0.5) * 1.6));
  }

  _updateLock(now) {
    const P = CONFIG.people;
    if (this.locked) {
      let best = null, bestD = Infinity;
      for (const f of this.faces) {
        const d = Math.hypot(f.cx - this.main.cx, f.cy - this.main.cy);
        if (d < bestD) { bestD = d; best = f; }
      }
      if (best && bestD < P.matchDistance) {
        for (const k of ['cx', 'cy', 'w', 'h']) this.main[k] += (best[k] - this.main[k]) * 0.5;
        this.main.yaw = best.yaw;
        this.main.pitch = best.pitch;
        this._lastSeen = now;
      } else if (now - this._lastSeen > P.lostAfterMs) {
        this.locked = false;
        this.main = null;
        this.hands = [];
        this._candidateSince = 0;
      }
      return;
    }
    const cand = this.faces.slice().sort((a, b) => this._score(b) - this._score(a))[0];
    if (!cand) { this._candidateSince = 0; return; }
    if (!this._candidateSince) this._candidateSince = now;
    if (now - this._candidateSince > P.lockAfterMs) {
      this.locked = true;
      this.main = { ...cand };
      this.lockedAt = now;
      this._lastSeen = now;
    }
  }

  // 主角附近的範圍，給動作偵測用（只算主角的動作）
  mainRegion() {
    if (!this.main) return null;
    const half = Math.max(0.18, this.main.w * 2.2);
    return { x0: this.main.cx - half, x1: this.main.cx + half };
  }
}

// 從臉部 478 個點算出臉框和轉頭角度
function faceFromLandmarks(lm) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of lm) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const nose = lm[1], left = lm[234], right = lm[454];
  const mid = (left.x + right.x) / 2;
  const half = Math.max(1e-3, Math.abs(right.x - left.x) / 2);
  // 影片沒鏡像：觀眾往他自己的左邊轉頭時，鼻子在影片裡往右移 → yaw 為正
  const yaw = (nose.x - mid) / half;
  // 點頭：鼻子在「兩眼」和「下巴」之間的高度比例
  const eyeY = (lm[33].y + lm[263].y) / 2;
  const pitch = (nose.y - eyeY) / Math.max(1e-3, lm[152].y - eyeY);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, yaw, pitch };
}
