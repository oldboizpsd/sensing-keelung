import { CONFIG } from './config.js';
import { SCENES, NOODLE, COPY } from './content.js';
import { startCamera } from './camera.js';
import { Motion } from './motion.js';
import { Tracking } from './tracking.js';
import { Renderer, coverScale } from './renderer.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Debug } from './debug.js';
import { Fog } from './fog.js';
import { Fragments } from './fragments.js';
import { Hints } from './hints.js';
import { Mic } from './mic.js';
import { Overlay } from './overlay.js';
import { Ghosts } from './ghosts.js';
import { Ending } from './ending.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (cur, target, dt, tau) => lerp(cur, target, 1 - Math.exp(-dt / tau));
const sceneIndex = (id) => SCENES.findIndex((s) => s.id === id);
// photo = -1 代表點菜後的乾麵
const photoOf = (scene, photo) => (photo === -1 ? NOODLE : SCENES[scene].photos[photo]);

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn('載入失敗：' + src); resolve(null); };
    img.src = src;
  });
}

const canvas = document.getElementById('stage');
const video = document.getElementById('cam');
const renderer = new Renderer(canvas);
const ui = new UI();
const debug = new Debug();
const motion = new Motion();
const tracking = new Tracking();
const audio = new AudioEngine();
const mic = new Mic(audio.ctx);
const fog = new Fog();
const fragments = new Fragments();
const hints = new Hints(ui);
const overlay = new Overlay(document.getElementById('fx'));
const ghosts = new Ghosts();
const ending = new Ending();
window.addEventListener('resize', () => renderer.resize());

// 一般瀏覽器要互動一次才能出聲；kiosk 模式不用
const unlock = () => audio.resume();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

const images = new Map();
const img = (src) => images.get(src);

const state = {
  phase: 'idle', // idle 待機 / wake 剛走近 / explore 探索
  phaseAt: 0,
  presence: 0,
  stillTime: 0,
  focus: 0,
  revealed: false,
  scene: 0,
  photo: 0,
  sceneTime: 0,
  exploreSeconds: 0,
  fade: null, // { scene, photo, t, dur }
  shownAt: 0,
  dawn: 0,
  dir: 1,
  lastActive: -1e9,
  absentSince: 0,
  sceneChangedTo: null,
  // 各種互動
  catchHold: 0,
  catchAmount: 0,
  catchX: 0.5,
  catchDone: false,
  point: { hold: 0, x: 0, y: 0 },
  noodle: null, // { t, density, cleared, clearedAt }
  noodleDone: false,
  shutter: null, // { phase, v, t }
  ambientMul: 1,
  ghostAt: 0,
  // 給除錯畫面看
  sceneId: SCENES[0].id,
  fogAvg: 0,
  fragments: 0,
  audioRunning: false,
};

let camOK = false, lastVideoTime = -1, maskVersion = -1, lastMotionT = 0;
let fps = 60, lastT = performance.now();
const prevHands = new Map();

async function boot() {
  ui.setHint(COPY.idle);
  ui.setScene(SCENES[0].title);
  const srcs = new Set([NOODLE.src]);
  for (const s of SCENES) {
    s.photos.forEach((p) => srcs.add(p.src));
    s.fills.forEach((f) => srcs.add(f));
  }
  await Promise.all([...srcs].map(async (src) => {
    const im = await loadImage(src);
    if (im) { images.set(src, im); renderer.photo(im); }
  }));
  camOK = !!(await startCamera(video));
  tracking.init(); // 背景載入，不擋畫面
  mic.start();
  audio.resume();
  requestAnimationFrame(frame);
}

function setPhase(p, now) {
  if (state.phase === p) return;
  state.phase = p;
  state.phaseAt = now;
}

// 新的一位觀眾：從雨夜街頭重新開始
function newVisitor(now) {
  Object.assign(state, {
    scene: 0, photo: 0, sceneTime: 0, exploreSeconds: 0, fade: null, shownAt: now, revealed: false, dawn: 0,
    catchHold: 0, catchAmount: 0, catchDone: false, noodle: null, noodleDone: false, shutter: null,
  });
  state.point.hold = 0;
  fog.reset(0.3);
  fragments.reset();
  hints.reset();
  ending.reset();
  overlay.clearWords();
}

// 這位觀眾結束了：身影留在街上
function endVisitor(keepGhost) {
  if (keepGhost) ghosts.commit();
  else ghosts.discard();
}

function startFade(scene, photo, dur) {
  if (state.fade) return;
  state.fade = { scene, photo, t: 0, dur };
}

function jumpToScene(idx, now) {
  state.scene = idx;
  state.photo = 0;
  state.fade = null;
  state.sceneTime = 0;
  state.revealed = false;
  state.shownAt = now;
  state.sceneChangedTo = SCENES[idx].id;
}

function frame(now) {
  const dt = Math.min(0.25, (now - lastT) / 1000);
  lastT = now;
  fps = lerp(fps, 1 / Math.max(dt, 1e-3), 0.05);
  renderer.resize();
  debug.tickMouse();
  mic.update(dt, now);
  const camAspect = camOK && video.videoWidth ? video.videoWidth / video.videoHeight : 16 / 9;
  const camCover = coverScale(renderer.aspect, camAspect);
  // 影片座標 → 螢幕座標（0–1，y 往下）
  const toScreen = (x, y) => [0.5 + ((CONFIG.mirror ? 1 - x : x) - 0.5) / camCover[0], 0.5 + (y - 0.5) / camCover[1]];

  // ---- 1. 讀鏡頭 ----
  const newFrame = camOK && video.readyState >= 2 && video.currentTime !== lastVideoTime;
  if (newFrame) {
    lastVideoTime = video.currentTime;
    tracking.update(video, now);
    const m = CONFIG.motion.handMargin;
    const handBoxes = tracking.hands.map((h) => [h.box[0] - m, h.box[1] - m, h.box[2] + m, h.box[3] + m * 2]);
    motion.update(video, tracking.mainRegion(), Math.min(0.5, (now - lastMotionT) / 1000 || 1 / 30), handBoxes);
    lastMotionT = now;
    if (tracking.maskVersion !== maskVersion && tracking.mask) {
      renderer.updateMask(tracking.mask, tracking.maskW, tracking.maskH);
      maskVersion = tracking.maskVersion;
    }
  }

  // ---- 2. 有沒有人、動作、手、頭、麥克風 ----
  let amount = motion.amount;
  let present, yaw, hands, head = null;
  const sim = debug.sim;
  if (debug.mouseSim) {
    const ms = debug.mouse;
    amount = ms.shift ? ms.speed : 0;
    present = true;
    yaw = debug.yaw;
    const gesture = ms.down ? 'Closed_Fist' : sim.point ? 'Pointing_Up' : 'Open_Palm';
    hands = [{ id: 0, x: ms.x, y: ms.y, tipX: ms.x, tipY: ms.y - 0.04, fist: ms.down, gesture, score: 1 }];
    if (sim.lift) hands.push({ id: 1, x: ms.x + 0.2, y: ms.y, tipX: ms.x + 0.2, tipY: ms.y, gesture: 'Open_Palm', score: 1, lift: true });
  } else {
    if (tracking.ready) {
      present = tracking.locked;
    } else {
      if (motion.raw > 0.04) state.lastActive = now;
      present = camOK && now - state.lastActive < CONFIG.fallbackPresenceSeconds * 1000;
    }
    yaw = tracking.yaw;
    if (tracking.main) head = { pitch: tracking.main.pitch || 0, yaw: tracking.main.yaw || 0 };
    hands = tracking.hands.map((h, i) => {
      const [x, y] = toScreen(h.x, h.y);
      const [tipX, tipY] = toScreen(h.tip.x, h.tip.y);
      return { id: i, x, y, tipX, tipY, fist: h.gesture === 'Closed_Fist', gesture: h.gesture, score: h.score };
    });
  }
  // 手的速度（螢幕寬度／秒）
  for (const h of hands) {
    const p = prevHands.get(h.id);
    h.speed = p ? Math.hypot(h.x - p.x, h.y - p.y) / Math.max(dt, 1e-3) : 0;
    h.vy = p ? (h.y - p.y) / Math.max(dt, 1e-3) : 0;
  }
  prevHands.clear();
  hands.forEach((h) => prevHands.set(h.id, { x: h.x, y: h.y }));
  const blowing = mic.blowing || sim.blow;
  const talking = mic.talking || sim.talk;
  state.presence = approach(state.presence, present ? 1 : 0, dt, present ? 0.4 : 1.2);

  if (present) {
    if (state.phase === 'idle') { newVisitor(now); setPhase('wake', now); }
    if (state.phase === 'wake' && now - state.phaseAt > 3000) setPhase('explore', now);
    state.absentSince = 0;
  } else {
    // 短暫看不到（轉頭、手擋到臉）不算離開；離開超過幾秒才回到待機、下一位觀眾從頭開始
    if (!state.absentSince) state.absentSince = now;
    if (now - state.absentSince > CONFIG.people.resetAfterSeconds * 1000 && state.phase !== 'idle') {
      endVisitor(state.exploreSeconds > 10 && ending.answer !== 'shake');
      setPhase('idle', now);
    }
  }
  const exploring = state.phase === 'explore' && present;

  // ---- 3. 停下來多久 → 對焦 ----
  const still = amount < CONFIG.motion.stillBelow;
  state.stillTime = still && present ? state.stillTime + dt : 0;
  const F = CONFIG.focus;
  const focusTarget = present ? smooth(F.startAfter, F.fullAfter, state.stillTime) : 0;
  state.focus = approach(state.focus, focusTarget, dt, focusTarget > state.focus ? F.rise : F.release);
  if (state.focus > 0.92) state.revealed = true;
  if (Math.abs(motion.velocityX) > 0.002) state.dir = motion.velocityX > 0 ? -1 : 1;

  // 每兩秒記住主角的人形（離開後留在街上）
  if (exploring && !debug.mouseSim && now - state.ghostAt > 2000 && state.stillTime > 0.5) {
    state.ghostAt = now;
    ghosts.remember(tracking, camCover, CONFIG.mirror);
  }

  // ---- 4. 場景時間線：待越久，夜越深 ----
  state.sceneChangedTo = null;
  const busy = !!state.noodle || !!state.shutter || ending.active;
  if (exploring) {
    state.exploreSeconds += dt;
    if (!state.fade && !busy) state.sceneTime += dt;
  }
  let scene = SCENES[state.scene];
  if (debug.skipScene) {
    if (scene.id === 'kanziding') state.sceneTime = scene.duration + 1;
    else if (state.scene < SCENES.length - 1) startFade(state.scene + 1, 0, CONFIG.sceneFade);
    debug.skipScene = false;
  }
  // 崁仔頂結束：鐵捲門拉下來，等觀眾兩手往上抬
  if (scene.id === 'kanziding' && state.sceneTime > scene.duration && !state.shutter && state.phase !== 'idle') {
    state.shutter = { phase: 'closing', v: 0, t: 0 };
    audio.playShutter(1.2);
  } else if (scene.id !== 'kanziding' && scene.id !== 'dawn' && !state.fade && !busy && state.sceneTime > scene.duration && state.phase !== 'idle') {
    startFade(state.scene + 1, 0, CONFIG.sceneFade);
  }

  // 同一個場景裡換照片：看清楚過一張之後，再動起來就換下一張
  const shownFor = (now - state.shownAt) / 1000;
  const wantNext = (present && state.revealed && amount > 0.3 && shownFor > CONFIG.photoMinShow) || (!present && shownFor > 20);
  if (wantNext && !state.fade && !busy && scene.photos.length > 1 && state.photo >= 0) {
    startFade(state.scene, (state.photo + 1) % scene.photos.length, 1.4);
  }
  if (state.fade) {
    state.fade.t += dt / state.fade.dur;
    if (state.fade.t >= 1) {
      if (state.fade.scene !== state.scene) { state.sceneTime = 0; state.sceneChangedTo = SCENES[state.fade.scene].id; }
      state.scene = state.fade.scene;
      state.photo = state.fade.photo;
      state.fade = null;
      state.revealed = false;
      state.shownAt = now;
    }
  }

  // ---- 5. 鐵捲門 ----
  const S = state.shutter;
  if (S) {
    S.t += dt;
    if (S.phase === 'closing') {
      S.v = Math.min(1, S.t / 1.2);
      if (S.v >= 1) { S.phase = 'waiting'; S.t = 0; }
    } else if (S.phase === 'waiting') {
      const lifting = hands.filter((h) => h.vy < -0.25 || h.lift);
      const lift = sim.lift || (hands.length >= 2 && lifting.length >= 2);
      if (lift) S.lifted = (S.lifted || 0) + Math.max(0.1, -Math.min(...lifting.map((h) => h.vy || -0.5))) * dt;
      if ((S.lifted || 0) > CONFIG.shutter.liftDistance || S.t > CONFIG.shutter.waitSeconds) {
        S.phase = 'lifting'; S.t = 0;
        jumpToScene(sceneIndex('dawn'), now);
        audio.playShutter(1.6);
      }
    } else if (S.phase === 'lifting') {
      S.v = Math.max(0, 1 - S.t / 1.6);
      if (S.v <= 0) state.shutter = null;
    }
  }
  scene = SCENES[state.scene];

  // ---- 6. 廟口：指著點菜 → 冒熱氣的乾麵 → 吹涼 ----
  const pointer = hands.find((h) => h.gesture === 'Pointing_Up');
  if (exploring && scene.id === 'miaokou' && !state.noodle && !state.noodleDone && !state.fade && pointer) {
    const P = state.point;
    if (Math.hypot(pointer.tipX - P.x, pointer.tipY - P.y) < CONFIG.point.maxMove) P.hold += dt;
    else { P.hold = 0; P.x = pointer.tipX; P.y = pointer.tipY; }
    if (P.hold > CONFIG.point.dwellSeconds) {
      state.noodle = { t: 0, density: 1, cleared: false, clearedAt: 0 };
      startFade(state.scene, -1, 1.2);
      audio.playSfx('plate', 0.8);
      P.hold = 0;
    }
  } else if (!pointer) state.point.hold = 0;
  const N = state.noodle;
  if (N) {
    N.t += dt;
    if (!N.cleared) {
      if (blowing) N.density -= dt * 0.9;
      if (N.t > CONFIG.noodle.autoClearSeconds) N.density -= dt * 0.3;
      if (N.density < 0.15) {
        N.cleared = true;
        N.clearedAt = N.t;
        overlay.addWords(NOODLE.smells, NOODLE.line);
        audio.playSfx('noodle', 0.9);
      }
    } else {
      N.density = Math.max(0, N.density - dt * 0.3);
      if (N.t - N.clearedAt > CONFIG.noodle.showSeconds) {
        state.noodle = null;
        state.noodleDone = true;
        startFade(state.scene, 0, 1.4);
      }
    }
  }

  // ---- 7. 伸手接雨（手掌張開、停住） ----
  const open = hands.find((h) => (h.gesture === 'Open_Palm' || h.gesture === 'None') && h.speed < CONFIG.catchRain.maxSpeed * 60);
  if (exploring && open && state.dawn < 0.3 && !state.noodle && !state.shutter) {
    state.catchHold += dt;
    state.catchX = open.x;
  } else state.catchHold = Math.max(0, state.catchHold - dt * 2);
  state.catchAmount = approach(state.catchAmount, smooth(CONFIG.catchRain.holdSeconds, CONFIG.catchRain.holdSeconds + 1.5, state.catchHold), dt, 0.3);
  if (state.catchAmount > 0.5) state.catchDone = true;

  // ---- 8. 擷取顯示中的照片 ----
  const curScene = SCENES[state.scene];
  const cur = photoOf(state.scene, state.photo);
  const nextScene = state.fade ? SCENES[state.fade.scene] : curScene;
  const next = state.fade ? photoOf(state.fade.scene, state.fade.photo) : cur;
  const mix = state.fade ? smooth(0, 1, state.fade.t) : 0;
  const sceneMix = state.fade && state.fade.scene !== state.scene ? mix : 0;
  ui.setScene(state.phase === 'idle' ? SCENES[0].title : (mix > 0.5 ? nextScene : curScene).title);
  const dawnTarget = curScene.id === 'dawn' ? 1 : nextScene.id === 'dawn' ? mix : 0;
  state.dawn = approach(state.dawn, dawnTarget, dt, 1.5);

  // ---- 9. 霧玻璃 ----
  const fogTarget = present ? CONFIG.fog.max * (1 - state.dawn * 0.8) : 0.35;
  const wipers = present ? hands.filter((h) => h.gesture !== 'Pointing_Up' && !h.fist) : [];
  const fogBytes = fog.update(dt, wipers, fogTarget, renderer.aspect);
  renderer.updateFog(fogBytes, fog.w, fog.h);

  // ---- 10. 握拳收集 ----
  const fist = exploring && !ending.active ? fragments.checkFist(hands, now) : null;
  if (fist) {
    const shown = mix > 0.5 ? next : cur;
    const im = img(shown.src);
    if (im && fragments.capture(im, coverScale(renderer.aspect, im.naturalWidth / im.naturalHeight), fist.x, fist.y, { scene: (mix > 0.5 ? nextScene : curScene).id, src: shown.src })) {
      audio.playSfx('fist');
    }
  }
  ui.setHands(hands, present && state.phase !== 'idle' && !ending.active);

  // ---- 11. 天亮 → 結尾 ----
  if (curScene.id === 'dawn' && exploring && !ending.active && ending.stage !== 'done' && state.sceneTime > 1.5 && !state.shutter) {
    ending.start({ reached: 'dawn', fragments: fragments.items.map((f) => f.canvas) });
  }
  const endStage = ending.update(dt, now, head, sim.nod ? 'nod' : sim.shake ? 'shake' : null);
  sim.nod = sim.shake = false;
  if (endStage === 'done') {
    endVisitor(ending.answer !== 'shake');
    newVisitor(now);
    setPhase(present ? 'wake' : 'idle', now);
  }

  // ---- 12. 安靜下來：講話時城市的聲音收小，安靜時浮上來 ----
  const mulTarget = !mic.available && !sim.talk ? 1 : talking ? 0.35 : mic.quietSeconds > 1.5 ? 1.15 : 0.85;
  state.ambientMul = approach(state.ambientMul, mulTarget, dt, talking ? 0.4 : 1.5);

  // ---- 13. 字 ----
  hints.update({
    phase: state.phase,
    exploreSeconds: state.exploreSeconds,
    sceneId: curScene.id,
    sceneTime: state.sceneTime,
    fog: fog.average,
    wiped: fog.wiped,
    fragments: fragments.items.length,
    sceneChangedTo: state.sceneChangedTo,
    dawn: state.dawn,
    catchDone: state.catchDone,
    noodleDone: state.noodleDone,
    noodleWaiting: !!N && !N.cleared && N.t > CONFIG.noodle.hintAfterSeconds,
    talkLong: (mic.talkSeconds > 5) || (sim.talk && debug.mouseSim),
    shutterWaiting: !!S && S.phase === 'waiting',
    ending: ending.active,
  }, now);
  if (state.focus > 0.92 && !state.fade && cur.detail && !N && !S && !ending.active) ui.showDetail(cur.detail, cur.focus);
  else if (state.focus < 0.5 || state.fade || !cur.detail || N || S || ending.active) ui.showDetail('', null);

  // ---- 14. 畫 ----
  let face = null;
  if (tracking.main && !debug.mouseSim) {
    const m = tracking.main;
    const [sx, sy] = toScreen(m.cx, m.cy);
    face = [sx, 1 - sy, m.w / camCover[0], m.h / camCover[1]];
  }
  const ghostCanvas = ghosts.compose();
  if (ghostCanvas) renderer.updateGhost(ghostCanvas);
  const fillSrc = curScene.fills[Math.max(0, state.photo) % curScene.fills.length];
  renderer.render({
    photoA: img(cur.src),
    photoB: img(next.src),
    mix,
    fill: img(fillSrc),
    time: now / 1000,
    motionBlur: Math.min(1, amount * 1.5) * 0.11 * state.presence,
    baseBlur: lerp(0.05, 0.035, state.presence),
    focus: N ? 1 : state.focus,
    focusPoint: cur.focus,
    dir: state.dir,
    presence: state.presence,
    rain: lerp(0.55, 0.35 + amount * 0.6, state.presence),
    silhouette: state.presence,
    hasMask: tracking.ready && !!tracking.mask && !debug.mouseSim,
    mirror: CONFIG.mirror,
    camCover,
    face,
    trailDecay: lerp(0.55, 0.94, Math.min(1, amount * 2)),
    trailShift: [state.dir * amount * 0.006, 0],
    fogAmt: lerp(0.6, 1, state.presence) * (N ? 0.4 : 1),
    dawn: state.dawn,
    ghostAmt: 1 - state.dawn * 0.5,
  });
  ending.captureFrame(canvas);

  const catchHand = state.catchAmount > 0.01 ? { x: state.catchX, y: (open || hands[0] || { y: 0.6 }).y, amount: state.catchAmount } : null;
  overlay.update(dt, {
    time: now / 1000,
    catchHand,
    steam: N ? { density: Math.max(0, N.density), blow: blowing ? 1 : 0 } : null,
    shutter: S ? S.v : 0,
    shutterMoving: S && S.phase !== 'waiting' ? 1 : 0,
  });

  // ---- 15. 聲音 ----
  audio.update({
    motion: amount,
    presence: state.presence,
    scene: curScene,
    nextScene: sceneMix > 0 ? nextScene : null,
    sceneMix,
    yaw,
    wipe: present ? fog.speed : 0,
    dawn: state.dawn,
    ambientMul: state.ambientMul * (S && S.v > 0.5 ? 0.4 : 1),
    catchAmount: state.catchAmount,
    catchX: state.catchX,
  });

  state.sceneId = curScene.id;
  state.fogAvg = fog.average;
  state.fragments = fragments.items.length;
  state.audioRunning = audio.running;
  state.photoIndex = state.photo;
  debug.draw(video, tracking, motion, state, fps, { mic, ghosts, ending });
  requestAnimationFrame(frame);
}

window.__sk = { motion, state, tracking, fog, fragments, ghosts, ending, mic };
boot().catch((err) => {
  console.error(err);
  document.getElementById('fatal').textContent = '啟動失敗：' + err.message;
});
