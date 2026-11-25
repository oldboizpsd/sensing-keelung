import { COPY } from './content.js';

// 提示：觀眾不碰任何東西，所以提示要在對的時候自己出現。
// 每句對每位觀眾只出現一次，觀眾已經做過的事就不提示。
export class Hints {
  constructor(ui) {
    this.ui = ui;
    this.reset();
  }

  reset() {
    this.shown = new Set();
    this.current = null;
    this.until = 0;
  }

  _show(key, text, now, ms = 5000) {
    if (this.shown.has(key)) return false;
    this.shown.add(key);
    this.current = text;
    this.until = now + ms;
    return true;
  }

  update(s, now) {
    if (s.phase === 'idle') return this.ui.setHint(COPY.idle);
    if (s.phase === 'wake') return this.ui.setHint(COPY.wake);
    if (s.ending) return this.ui.setHint('');
    const busy = now < this.until;
    // 正在等觀眾做某件事的提示，優先出現
    if (s.shutterWaiting) this._show('shutter', COPY.hintShutter, now, 7000);
    else if (s.noodleWaiting) this._show('blow', COPY.hintBlow, now, 6000);
    else if (s.talkLong) this._show('quiet', COPY.hintQuiet, now);
    else if (!busy) {
      if (s.sceneChangedTo === 'miaokou') this._show('turn', COPY.hintTurn, now);
      else if (s.sceneId === 'street' && s.exploreSeconds > 8 && !s.catchDone) this._show('catch', COPY.hintCatch, now);
      else if (s.sceneId === 'street' && s.exploreSeconds > 16 && s.fog > 0.4 && s.wiped < 1) this._show('wipe', COPY.hintWipe, now);
      else if (s.sceneId === 'miaokou' && s.sceneTime > 7 && !s.noodleDone) this._show('point', COPY.hintPoint, now, 6000);
      else if (s.exploreSeconds > 24 && s.fragments === 0) this._show('fist', COPY.hintFist, now);
    }
    this.ui.setHint(now < this.until ? this.current : '');
  }
}
