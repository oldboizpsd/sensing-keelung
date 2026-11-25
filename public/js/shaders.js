// WebGL2 著色器。螢幕座標 uv：左下 (0,0)，右上 (1,1)。

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// 殘影：把「主角的人形」留在畫面上慢慢淡掉。動得越多，殘影越長。
// 輸出 r = 主角殘影、g = 其他人（路人）、b = 主角這一格的人形
export const TRAIL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uMask;   // 人形分割（影片座標，第 0 列在最上面）
uniform sampler2D uPrev;   // 上一格的殘影
uniform bool uHasMask;
uniform bool uMirror;
uniform vec2 uCover;       // 鏡頭畫面填滿螢幕的縮放
uniform vec4 uFace;        // 主角臉部 (cx, cy, w, h)，螢幕座標
uniform bool uHasFace;
uniform float uDecay;
uniform vec2 uShift;

void main() {
  float m = 0.0;
  if (uHasMask) {
    vec2 c = 0.5 + (vUv - 0.5) * uCover;
    vec2 muv = vec2(uMirror ? 1.0 - c.x : c.x, 1.0 - c.y);
    m = texture(uMask, muv).r;
    m = smoothstep(0.35, 0.75, m);
  }
  float mainW = 0.0;
  if (uHasFace) {
    float dx = (vUv.x - uFace.x) / max(uFace.z * 2.3, 0.05);
    float below = smoothstep(uFace.y + uFace.w * 0.95, uFace.y + uFace.w * 0.55, vUv.y);
    mainW = exp(-dx * dx) * below;
  }
  float cur = m * mainW;
  float prev = texture(uPrev, vUv - uShift).r * uDecay;
  outColor = vec4(max(cur, prev), m * (1.0 - mainW), cur, 1.0);
}`;

export const MAIN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPhotoA;
uniform sampler2D uPhotoB;
uniform sampler2D uFill;
uniform sampler2D uTrail;
uniform vec2 uCoverA;
uniform vec2 uCoverB;
uniform vec2 uCoverFill;
uniform float uMix;          // 0 = A，1 = B（換照片的交叉淡化）
uniform float uAspect;       // 螢幕寬 / 高
uniform float uTime;
uniform float uMotionBlur;   // 因為觀眾在動而產生的拖影長度（uv）
uniform float uBaseBlur;     // 還沒對焦時的模糊
uniform float uFocus;        // 0–1 停下來的對焦程度
uniform vec2 uFocusPoint;    // 從哪裡開始對焦（照片上的細節）
uniform float uDir;          // 拖影方向 -1 / 1
uniform float uPresence;     // 0 = 沒人（待機），1 = 有人
uniform float uRain;         // 雨的強度
uniform float uSilhouette;   // 人形的顯示程度
uniform sampler2D uFog;      // 霧玻璃（第 0 列在最上面）
uniform float uFogAmt;       // 霧的整體強度
uniform float uDawn;         // 0–1 天亮
uniform sampler2D uGhost;    // 留在街上的路人身影（第 0 列在最上面，用 alpha）
uniform float uGhostAmt;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec2 cover(vec2 uv, vec2 s) { return 0.5 + (uv - 0.5) * s; }

// 水平方向的拖影模糊，像平移拍攝
vec3 streak(sampler2D tex, vec2 uv, vec2 s, float len) {
  if (len < 0.0008) return texture(tex, cover(uv, s)).rgb;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 24; i++) {
    float t = float(i) / 23.0 - 0.5;
    float w = 1.0 - abs(t) * 1.2;
    vec2 o = vec2(t * len * uDir, t * len * 0.04);
    acc += texture(tex, cover(uv + o, s)).rgb * w;
    wsum += w;
  }
  return acc / wsum;
}

float rain(vec2 uv, float t) {
  float r = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 1.0 + fi * 0.8;
    vec2 p = vec2(uv.x * uAspect, uv.y);
    p.x += p.y * 0.18;
    p *= vec2(70.0 * sc, 2.4 * sc);
    p.y += t * (1.6 + fi * 0.9);
    float col = floor(p.x);
    float h = hash(col + fi * 37.0);
    float off = hash(col * 1.7 + fi * 11.0);
    float fy = fract(p.y + off);
    float fx = fract(p.x) - 0.5;
    float line = smoothstep(0.09, 0.0, abs(fx)) * smoothstep(0.0, 0.08, fy) * smoothstep(0.55, 0.1, fy);
    r += line * step(0.62, h) * (0.55 / sc);
  }
  return r;
}

void main() {
  vec2 uv = vUv;
  vec4 tr = texture(uTrail, uv);

  // 每個像素的模糊：觀眾動作造成的拖影＋還沒對焦區域的模糊
  vec2 a = vec2(uAspect, 1.0);
  float d = distance(uv * a, uFocusPoint * a);
  float radius = uFocus * 2.4;
  float unrevealed = smoothstep(radius - 0.35, radius, d);
  float blur = uMotionBlur + uBaseBlur * unrevealed;

  vec3 col = mix(streak(uPhotoA, uv, uCoverA, blur), streak(uPhotoB, uv, uCoverB, blur), uMix);

  // 觀眾：填滿基隆街景的人形，動的時候留下拖影
  vec3 fill = streak(uFill, uv, uCoverFill, blur * 0.7 + 0.004);
  fill = fill * 1.55 * vec3(0.88, 1.0, 1.14) + 0.02;
  float person = tr.r * uSilhouette;
  col = mix(col, fill, clamp(person * 0.9, 0.0, 1.0));

  // 路人：後面的人變成淡淡的拖影
  float others = 0.0;
  for (int i = -3; i <= 3; i++) others += texture(uTrail, uv + vec2(float(i) * 0.012, 0.0)).g;
  others /= 7.0;
  vec3 ghost = streak(uFill, uv, uCoverFill, 0.06) * 1.3;
  col = mix(col, ghost, clamp(others * 0.5 * uSilhouette, 0.0, 1.0));

  // 之前的觀眾：留在街上的路人，水平拖影
  float g = 0.0;
  for (int i = -4; i <= 4; i++) g += texture(uGhost, vec2(uv.x + float(i) * 0.014, 1.0 - uv.y)).a * (1.0 - abs(float(i)) * 0.15);
  g /= 6.0;
  col = mix(col, ghost * 0.95 + vec3(0.03, 0.04, 0.05), clamp(g * 0.55 * uGhostAmt, 0.0, 1.0));

  // 停下來時，人形外圍一圈細細的光
  float edge = clamp(length(vec2(dFdx(tr.b), dFdy(tr.b))) * 6.0, 0.0, 1.0);
  col += vec3(0.55, 0.95, 0.85) * edge * uFocus * uSilhouette * 0.8;

  // 霧玻璃：起霧的地方看出去是糊的、偏白；擦過的地方變清楚
  float fog = texture(uFog, vec2(uv.x, 1.0 - uv.y)).r * uFogAmt;
  vec3 hazy = mix(textureLod(uPhotoA, cover(uv, uCoverA), 6.5).rgb, textureLod(uPhotoB, cover(uv, uCoverB), 6.5).rgb, uMix);
  float frost = hash2(floor(uv * vec2(uAspect, 1.0) * 260.0)) * 0.05;
  hazy = hazy * 0.45 + vec3(0.48, 0.52, 0.56) * mix(0.75, 1.05, uDawn) + frost;
  // 玻璃上的小水珠
  vec2 cell = floor(uv * vec2(uAspect, 1.0) * 90.0);
  vec2 inCell = fract(uv * vec2(uAspect, 1.0) * 90.0) - 0.5;
  float drop = step(0.93, hash2(cell)) * smoothstep(0.32, 0.12, length(inCell + (vec2(hash2(cell + 3.1), hash2(cell + 7.7)) - 0.5) * 0.4));
  hazy += drop * 0.12;
  col = mix(col, hazy, smoothstep(0.08, 0.6, fog) * 0.92);
  // 擦痕邊緣亮一點，像水被推開
  col += vec3(0.8, 0.88, 0.95) * clamp(length(vec2(dFdx(fog), dFdy(fog))) * 20.0, 0.0, 1.0) * 0.16;

  // 雨（天亮時停）
  col += vec3(0.75, 0.82, 0.9) * rain(uv, uTime) * uRain * (1.0 - uDawn);

  // 調色：冷、暗、帶一點顆粒
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 0.92) * mix(vec3(0.94, 0.98, 1.05), vec3(1.08, 1.05, 1.02), uDawn);
  col = mix(col, col * 1.25 + 0.05, uDawn);
  float vig = smoothstep(1.25, 0.35, distance(uv * a, vec2(0.5) * a));
  col *= mix(0.55, 1.0, vig);
  col *= mix(0.42, 1.0, uPresence);
  col += (hash2(uv * 1000.0 + uTime) - 0.5) * 0.035;

  outColor = vec4(col, 1.0);
}`;
