// 实时播放 + 高精度歌曲时钟 + 打击音效
export class AudioPlayer {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.src = null;
    this.startAt = 0; // ctx 时间轴上歌曲 0 秒对应的位置
    this.pausedAt = null;
    this.buffer = null;
    this._noise = this._makeNoise();
    this.setVolumes(0.9, 0.8, 0.5);
  }

  setVolumes(master, music, sfx) {
    this.master.gain.value = master;
    this.musicGain.gain.value = music;
    this.sfxGain.gain.value = sfx;
  }

  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  play(buffer, offset = 0, delay = 0.12, { loop = false, loopStart = 0, loopEnd = 0, fadeIn = 0 } = {}) {
    this.stop();
    this.buffer = buffer;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    src.connect(g);
    g.connect(this.musicGain);
    const when = this.ctx.currentTime + delay;
    if (fadeIn > 0) {
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(1, when + fadeIn);
    }
    if (loop) {
      src.loop = true;
      src.loopStart = loopStart;
      src.loopEnd = loopEnd;
    }
    src.start(when, offset);
    this.src = src;
    this.srcGain = g;
    this.startAt = when - offset;
    this.pausedAt = null;
    return src;
  }

  fadeOut(sec = 0.6) {
    if (!this.src) return;
    const g = this.srcGain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + sec);
    const s = this.src;
    setTimeout(() => {
      try { s.stop(); } catch (e) { /* ignore */ }
    }, sec * 1000 + 50);
    this.src = null;
  }

  stop() {
    if (this.src) {
      try { this.src.stop(); } catch (e) { /* ignore */ }
      this.src.disconnect();
      this.src = null;
    }
  }

  async pause() {
    if (this.ctx.state === 'running') await this.ctx.suspend();
  }

  // 当前听到的歌曲时间（秒）。perfMs 为 performance.now() 时间戳（可用于键盘事件）
  songTime(perfMs = performance.now()) {
    const ctx = this.ctx;
    if (ctx.state !== 'running' || !ctx.getOutputTimestamp) return ctx.currentTime - this.startAt - (ctx.outputLatency || 0);
    const ts = ctx.getOutputTimestamp();
    if (!ts.performanceTime) return ctx.currentTime - this.startAt - (ctx.outputLatency || 0);
    return ts.contextTime + (perfMs - ts.performanceTime) / 1000 - this.startAt;
  }

  _makeNoise() {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ---------- 打击音效 ----------
  sfx(type) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.connect(this.sfxGain);
    const tone = (f, dur, vol, wave = 'sine', f2 = null, delay = 0) => {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.setValueAtTime(f, t + delay);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + delay + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(vol, t + delay + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      o.connect(g);
      g.connect(out);
      o.start(t + delay);
      o.stop(t + delay + dur + 0.02);
    };
    const noise = (dur, vol, freq, type = 'bandpass') => {
      const s = ctx.createBufferSource();
      s.buffer = this._noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(out);
      s.start(t);
      s.stop(t + dur);
    };
    switch (type) {
      case 'key': tone(1500, 0.05, 0.12, 'triangle'); break;
      case 'keyRev': tone(1100, 0.05, 0.12, 'triangle'); break;
      case 'wrong': tone(220, 0.14, 0.18, 'square', 140); break;
      case 'perfect':
        noise(0.09, 0.5, 2200);
        tone(1320, 0.18, 0.12, 'sine');
        tone(1980, 0.22, 0.08, 'sine', null, 0.03);
        break;
      case 'great': noise(0.08, 0.45, 1800); tone(990, 0.14, 0.1); break;
      case 'cool': noise(0.07, 0.4, 1500); break;
      case 'bad': noise(0.06, 0.3, 900); break;
      case 'miss': tone(160, 0.2, 0.12, 'sawtooth', 90); break;
      case 'tap': noise(0.05, 0.35, 3000, 'highpass'); tone(880, 0.05, 0.05, 'triangle'); break;
      case 'click': tone(2000, 0.03, 0.15, 'square'); break;
      case 'clickHi': tone(3000, 0.04, 0.2, 'square'); break;
      case 'ui': tone(880, 0.06, 0.08, 'sine', 1320); break;
      case 'uiBack': tone(660, 0.06, 0.07, 'sine', 440); break;
      case 'finish':
        [0, 0.08, 0.16, 0.24].forEach((d, i) => tone([784, 988, 1175, 1568][i], 0.35, 0.1, 'triangle', null, d));
        break;
    }
  }
}
