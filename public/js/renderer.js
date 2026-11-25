import { VERT, TRAIL_FRAG, MAIN_FRAG } from './shaders.js';

const TRAIL_W = 320, TRAIL_H = 180;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    uniforms[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u: uniforms };
}

// 讓一張寬高比 srcAspect 的圖「填滿」螢幕時，uv 要縮放多少
export function coverScale(screenAspect, srcAspect) {
  return screenAspect > srcAspect ? [1, srcAspect / screenAspect] : [screenAspect / srcAspect, 1];
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('這個瀏覽器不支援 WebGL2');
    this.gl = gl;
    this.trailProg = program(gl, VERT, TRAIL_FRAG);
    this.mainProg = program(gl, VERT, MAIN_FRAG);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.blank = this._tex(1, 1, new Uint8Array([0, 0, 0, 255]));
    this.maskTex = this._tex(1, 1, new Uint8Array([0]), gl.R8, gl.RED);
    this.maskSize = [1, 1];
    this.fogTex = this._tex(1, 1, new Uint8Array([0]), gl.R8, gl.RED);
    this.fogSize = [1, 1];
    this.ghostTex = this._tex(1, 1, new Uint8Array([0, 0, 0, 0]));
    this.trail = [this._fbo(TRAIL_W, TRAIL_H), this._fbo(TRAIL_W, TRAIL_H)];
    this.photoTex = new Map(); // 圖片 → 貼圖
    this.resize();
  }

  _tex(w, h, data, internal = this.gl.RGBA8, format = this.gl.RGBA) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  _fbo(w, h) {
    const gl = this.gl;
    const tex = this._tex(w, h, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  // 照片轉成貼圖（每張只做一次）
  photo(img) {
    let t = this.photoTex.get(img);
    if (!t) {
      const gl = this.gl;
      t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.photoTex.set(img, t);
    }
    return t;
  }

  updateFog(data, w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.fogTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.fogSize[0] !== w || this.fogSize[1] !== h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
      this.fogSize = [w, h];
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.UNSIGNED_BYTE, data);
    }
  }

  updateGhost(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.ghostTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  updateMask(data, w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.maskSize[0] !== w || this.maskSize[1] !== h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
      this.maskSize = [w, h];
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.UNSIGNED_BYTE, data);
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.aspect = w / h;
  }

  _bind(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  render(s) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    // 1. 殘影
    const [src, dst] = this.trail;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    const T = this.trailProg;
    gl.useProgram(T.p);
    this._bind(0, this.maskTex, T.u.uMask);
    this._bind(1, src.tex, T.u.uPrev);
    gl.uniform1i(T.u.uHasMask, s.hasMask ? 1 : 0);
    gl.uniform1i(T.u.uMirror, s.mirror ? 1 : 0);
    gl.uniform2fv(T.u.uCover, s.camCover);
    gl.uniform4fv(T.u.uFace, s.face || [0, 0, 0, 0]);
    gl.uniform1i(T.u.uHasFace, s.face ? 1 : 0);
    gl.uniform1f(T.u.uDecay, s.trailDecay);
    gl.uniform2fv(T.u.uShift, s.trailShift);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.trail = [dst, src];

    // 2. 主畫面
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const M = this.mainProg;
    gl.useProgram(M.p);
    this._bind(0, s.photoA ? this.photo(s.photoA) : this.blank, M.u.uPhotoA);
    this._bind(1, s.photoB ? this.photo(s.photoB) : this.blank, M.u.uPhotoB);
    this._bind(2, s.fill ? this.photo(s.fill) : this.blank, M.u.uFill);
    this._bind(3, dst.tex, M.u.uTrail);
    this._bind(4, this.fogTex, M.u.uFog);
    this._bind(5, this.ghostTex, M.u.uGhost);
    const cov = (img) => (img ? coverScale(this.aspect, img.naturalWidth / img.naturalHeight) : [1, 1]);
    gl.uniform2fv(M.u.uCoverA, cov(s.photoA));
    gl.uniform2fv(M.u.uCoverB, cov(s.photoB));
    gl.uniform2fv(M.u.uCoverFill, cov(s.fill));
    gl.uniform1f(M.u.uMix, s.mix);
    gl.uniform1f(M.u.uAspect, this.aspect);
    gl.uniform1f(M.u.uTime, s.time);
    gl.uniform1f(M.u.uMotionBlur, s.motionBlur);
    gl.uniform1f(M.u.uBaseBlur, s.baseBlur);
    gl.uniform1f(M.u.uFocus, s.focus);
    gl.uniform2fv(M.u.uFocusPoint, s.focusPoint);
    gl.uniform1f(M.u.uDir, s.dir);
    gl.uniform1f(M.u.uPresence, s.presence);
    gl.uniform1f(M.u.uRain, s.rain);
    gl.uniform1f(M.u.uSilhouette, s.silhouette);
    gl.uniform1f(M.u.uFogAmt, s.fogAmt);
    gl.uniform1f(M.u.uDawn, s.dawn);
    gl.uniform1f(M.u.uGhostAmt, s.ghostAmt ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
