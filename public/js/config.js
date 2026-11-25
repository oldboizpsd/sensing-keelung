// 所有可以調的數字都在這裡。到現場覺得太敏感／太遲鈍，改這裡就好。
export const CONFIG = {
  camera: { width: 1280, height: 720 },
  mirror: true, // 畫面像鏡子一樣左右相反

  // 動作偵測（影格相減）
  motion: {
    width: 160, // 低解析度計算，夠用又快
    height: 90,
    pixelThreshold: 22, // 0–255，亮度變化超過才算「有動」
    gain: 9, // 動作量放大倍數
    attack: 0.08, // 秒，開始動時多快反應
    release: 0.3, // 秒，停下來時多快歸零
    stillBelow: 0.08, // 低於這個動作量算「停下」
    handMargin: 0.08, // 手的周圍多大範圍不算進身體的動作（擦玻璃時畫面才不會糊掉）
  },

  // 停下來多久開始對焦、多久完全清楚（秒）；rise / release：對焦和失焦的反應時間（秒）
  focus: { startAfter: 0.6, fullAfter: 2.6, rise: 0.45, release: 0.15 },

  // 主角鎖定
  people: {
    minFaceWidth: 0.07, // 臉的寬度佔畫面比例，太小代表站太遠，不算
    lockAfterMs: 600, // 連續看到多久才鎖定
    lostAfterMs: 4000, // 主角的臉消失多久才放掉（轉頭、手擋到臉都會暫時看不到）
    resetAfterSeconds: 8, // 人離開多久，才當作下一位觀眾、從頭開始
    matchDistance: 0.18, // 同一個人在兩格之間最多移動多少
  },

  // 轉頭：頭轉多少算轉到底（0–1，越小越敏感）
  head: { fullTurn: 0.55, smoothing: 0.25 },

  // 霧玻璃
  fog: {
    gridW: 96,
    gridH: 54,
    max: 0.7, // 霧最濃到多少（邊緣）
    center: 0.25, // 畫面中間的霧是邊緣的幾倍（0–1），太低就擦不太到東西，太高會蓋住對焦
    regrowSeconds: 10, // 擦掉之後多久長回來
    brushRadius: 0.085, // 手掌擦掉的範圍（畫面高度的比例）
    minHandSpeed: 0.004, // 手要動多快才算在擦
  },

  // 握拳收集
  fist: {
    minScore: 0.55, // 手勢辨識的信心值
    holdFrames: 2, // 連續幾次辨識到才算
    cooldownMs: 1200,
    max: 5,
    cropWidth: 0.2, // 剪下來的範圍（畫面寬度的比例）
  },

  // 麥克風（到現場在除錯畫面看數字再調）
  mic: {
    blowLevel: 0.1, // 音量超過這個，而且大多是低頻，就算吹氣
    blowLowRatio: 0.5, // 低頻（400Hz 以下）佔多少比例才算吹氣
    blowHoldMs: 150,
    talkLevel: 0.035, // 超過這個算有人在講話
    quietLevel: 0.015, // 低於這個算安靜
  },

  // 伸手接雨：手掌停住多久開始接到雨
  catchRain: { holdSeconds: 1.2, maxSpeed: 0.006 },

  // 指著點菜：食指指著同一個地方多久
  point: { dwellSeconds: 1.2, maxMove: 0.06 },

  // 吹涼乾麵
  noodle: { hintAfterSeconds: 8, autoClearSeconds: 20, showSeconds: 14 },

  // 鐵捲門：等觀眾抬手多久，沒抬就自己拉起來；兩手要一起往上抬多少（畫面高度比例）
  shutter: { waitSeconds: 8, liftDistance: 0.16 },

  // 結尾
  ending: { questionSeconds: 7, cardSeconds: 40 },

  // 留在街上的路人身影
  ghosts: { maxVisible: 12, maxPerDay: 80 },

  // 現場的 Wi-Fi（填了才會顯示「連上 Wi-Fi」的 QR code）
  wifi: { ssid: '', password: '' },

  // 照片多久沒換、而且觀眾在動時，就換下一張（秒）
  photoMinShow: 9,
  sceneFade: 3, // 換場景的交叉淡化秒數

  // 聲音
  audio: {
    master: 0.9,
    rainIdle: 0.18,
    rainBase: 0.28,
    rainMotion: 0.32,
    ambient: 0.45, // 左右環境音的音量
    wipe: 0.5,
    sfx: 0.7,
  },

  // 沒有偵測模型時，用動作量猜有沒有人
  fallbackPresenceSeconds: 6,
};
