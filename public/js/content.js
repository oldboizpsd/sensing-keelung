// 照片、聲音和文案。
// ⚠ 文案（COPY、細節小字、NOODLE）目前都是 Claude 寫的草稿（設計文件「文案」一段），確認後直接改這裡。
// ⚠ assets/temp/ 底下都是暫用素材，換檔時檔名保持一樣就不用改程式（見 TEMP_ASSETS.md）。

const P = (f) => `assets/photos/${f}`;
const T = (f) => `assets/temp/photos/${f}`;

// 三個場景＋天亮。觀眾待越久，夜越深。duration 是秒數（只在有人時計時）。
// left / right：轉頭時聽到的兩邊聲音（見 AUDIO）
export const SCENES = [
  {
    id: 'street',
    title: '雨夜｜家附近的路口',
    duration: 30,
    left: 'rain2',
    right: 'road',
    photos: [
      { src: P('k1_2.jpg'), detail: '撐傘的人，在光裡面變得很淡。', focus: [0.42, 0.62] },
      { src: P('a7c01208.jpg'), detail: '穿黃色雨衣的人走在最前面。', focus: [0.22, 0.6] },
      { src: P('k3_2.jpg'), detail: '藍色雨衣的騎士，雨大也照樣出門。', focus: [0.72, 0.64] },
      { src: P('a7c01211.jpg'), detail: '海豚牆下，大家撐著傘一個一個走上樓梯。', focus: [0.35, 0.45] },
      { src: P('a7c01239.jpg'), detail: '穿輕便雨衣的騎士，從斑馬線前面滑過。', focus: [0.17, 0.62] },
      { src: P('k2_2.jpg'), detail: '有人在車流前面快步走過。', focus: [0.5, 0.68] },
      { src: P('a7c01220.jpg'), detail: '紅色雨衣的騎士在路口等著。', focus: [0.72, 0.5] },
      { src: P('a7c01233.jpg'), detail: '一整排機車在雨裡一起起步。', focus: [0.45, 0.62] },
      { src: P('a7c01260.jpg'), detail: '有人提著塑膠袋，走過斑馬線。', focus: [0.48, 0.55] },
      { src: P('a7c01234.jpg'), detail: '計程車開過去，路口的燈全倒映在地上。', focus: [0.55, 0.75] },
    ],
    fills: [P('a7c01233.jpg'), P('k1_2.jpg'), P('a7c01241.jpg')],
  },
  {
    id: 'miaokou',
    title: '晚上｜廟口',
    duration: 30,
    left: 'market',
    right: 'road',
    photos: [
      { src: T('miaokou_stall_1.jpg'), detail: '攤位前，大家站著等自己的那一碗。', focus: [0.55, 0.5], temp: true },
      { src: T('miaokou_stall_2.jpg'), detail: '老闆一邊煎，一邊招呼客人。', focus: [0.42, 0.62], temp: true },
      { src: T('noodle_shop.jpg'), detail: '小小的店面，大家擠在一起吃。', focus: [0.5, 0.45], temp: true },
      { src: T('miaokou_temple.jpg'), detail: '廟前的燈籠下，有人慢慢走過。', focus: [0.5, 0.45], temp: true },
    ],
    fills: [P('a7c01261.jpg'), P('k2_2.jpg')],
  },
  {
    id: 'kanziding',
    title: '凌晨｜崁仔頂',
    duration: 20,
    left: 'kanziding_call',
    right: 'sea',
    photos: [
      { src: T('kanziding_3.jpg'), detail: '撐著透明傘的人，在魚攤前停下來。', focus: [0.3, 0.45], temp: true },
      { src: T('kanziding_2.jpg'), detail: '叫賣聲裡，大家擠在攤子之間。', focus: [0.5, 0.55], temp: true },
      { src: T('kanziding_4.jpg'), detail: '燈一盞一盞亮著，市場才剛開始。', focus: [0.5, 0.5], temp: true },
      { src: T('kanziding_1.jpg'), detail: '凌晨的路面，還是濕的。', focus: [0.5, 0.25], temp: true },
    ],
    fills: [T('kanziding_fish_2.jpg'), P('a7c01243.jpg')],
  },
  {
    id: 'dawn',
    title: '天亮',
    duration: 15,
    left: 'sea',
    right: null,
    photos: [{ src: T('kanziding_1.jpg'), detail: '', focus: [0.5, 0.5], temp: true }],
    fills: [P('k1_2.jpg')],
  },
];

// 廟口點菜後出現的乾麵（暫用照片）
export const NOODLE = {
  src: T('noodle_1.jpg'),
  focus: [0.5, 0.55],
  temp: true,
  smells: ['蔥', '豬油', '熱湯', '雨後潮濕的騎樓'], // Claude 草稿
  line: '和爸爸吃完這碗，才走去買飲料。', // Claude 草稿
};

// 長的環境音（用串流播放）
export const AUDIO = {
  rain: 'assets/temp/audio/rain.mp3', // 底層雨聲，一直都在
  rain2: 'assets/temp/audio/rain.mp3', // 街頭左邊（同一個檔，從別的地方開始播）
  road: 'assets/temp/audio/road.mp3',
  market: 'assets/temp/audio/market.mp3',
  kanziding_call: 'assets/temp/audio/kanziding_call.mp3',
  sea: 'assets/temp/audio/sea.mp3',
  wipe: 'assets/temp/audio/wipe_glass.mp3',
  rainHand: 'assets/temp/audio/rain.mp3', // 接雨：雨打在手上（同一個檔，濾波成比較近、比較脆的聲音）
};

// 短音效（一次載入）
export const SFX = {
  fist: 'assets/temp/audio/fist.mp3',
  plate: 'assets/temp/audio/plate.mp3',
  noodle: 'assets/temp/audio/noodle_eat.mp3',
  wind: 'assets/temp/audio/wind.mp3',
};

export const COPY = {
  idle: '站過來一點。',
  wake: '先不要動，看看這裡。',
  hintWipe: '用手擦擦看。',
  hintFist: '把手握起來，可以收下一塊。',
  hintTurn: '轉頭，聽聽看兩邊。',
  dawn: '天亮了。',
  stripFull: '收滿了。',
  hintCatch: '把手伸出來，停一下。',
  hintPoint: '用手指指看，想吃哪一攤？',
  hintBlow: '對著它吹一口。',
  hintQuiet: '安靜一下，聽聽看。',
  hintShutter: '兩隻手一起，往上抬。',
  question: '你住的地方，有沒有一個大家經過卻很少停下來看的地方？',
  questionHow: '點頭，或搖頭。',
  stayNod: '你的身影會留在這條街上，到今天收工。',
  stayShake: '好，這次就只帶走一張卡。',
  scanWifi: '① 先掃這個，連上 Wi-Fi。',
  scanCard: '② 再掃這個，帶走這張卡。',
  scanCardOnly: '掃這個，帶走這張卡。',
  scanFail: '用手機拍下這張卡吧。',
  backToRain: (s) => `${s} 秒後回到雨夜。`,
  cardLine: { street: '你在基隆的雨夜裡，停下來過。', miaokou: '你在基隆待到了廟口收攤。', kanziding: '你在基隆待到了凌晨的崁仔頂。', dawn: '你在基隆待到了天亮。' },
  cardNth: (n) => `第 ${n} 位經過這條街的人`,
};
