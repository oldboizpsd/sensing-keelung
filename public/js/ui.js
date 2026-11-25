// 畫面上的字：提示、細節小字、場景名稱；以及手的位置（小圓圈，讓觀眾知道鏡頭看到他的手）。
export class UI {
  constructor() {
    this.hint = document.getElementById('hint');
    this.detail = document.getElementById('detail');
    this.scene = document.getElementById('scene');
    this.handEls = [...document.querySelectorAll('.hand')];
    this._hintText = '';
    this._detailText = '';
    this._sceneText = '';
  }

  setHint(text) {
    if (text === this._hintText) return;
    this._hintText = text;
    this._swap(this.hint, text);
  }

  setScene(text) {
    if (text === this._sceneText) return;
    this._sceneText = text;
    this._swap(this.scene, text);
  }

  // 細節小字出現在對焦點附近
  showDetail(text, point) {
    if (text === this._detailText) return;
    this._detailText = text;
    if (point) {
      const x = Math.min(Math.max(point[0] + 0.07, 0.08), 0.64);
      const y = 1 - point[1];
      this.detail.style.left = `${x * 100}%`;
      this.detail.style.top = `${Math.min(Math.max(y + 0.08, 0.15), 0.85) * 100}%`;
    }
    this._swap(this.detail, text);
  }

  // hands：螢幕座標 [{x, y, fist}]
  setHands(hands, visible) {
    this.handEls.forEach((el, i) => {
      const h = hands[i];
      if (!h || !visible) {
        el.classList.remove('on');
        return;
      }
      el.classList.add('on');
      const point = h.gesture === 'Pointing_Up';
      el.classList.toggle('fist', !!h.fist);
      el.classList.toggle('point', point);
      const x = point ? h.tipX : h.x, y = point ? h.tipY : h.y;
      el.style.transform = `translate(${x * window.innerWidth}px, ${y * window.innerHeight}px)`;
    });
  }

  _swap(el, text) {
    el.classList.remove('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.textContent = text;
      if (text) el.classList.add('on');
    }, text ? 500 : 0);
  }
}
