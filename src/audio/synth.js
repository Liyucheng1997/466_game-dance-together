// 合成器乐器：全部用 Web Audio 节点即时合成（离线渲染时使用）
import { midiToFreq } from './theory.js';

export class Synth {
  constructor(ctx, bpm, { compressor = true } = {}) {
    this.ctx = ctx;
    this.bpm = bpm;
    this.spb = 60 / bpm;
    this.noise = this.makeNoise(2);

    // 母线
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    if (compressor) {
      this.master.connect(comp);
      comp.connect(ctx.destination);
    } else {
      this.master.connect(ctx.destination);
    }

    this.drums = ctx.createGain();
    this.drums.gain.value = 1;
    this.drums.connect(this.master);

    // 音乐母线（受侧链压缩影响）
    this.music = ctx.createGain();
    this.music.gain.value = 1;
    this.music.connect(this.master);
    this.duck = this.music.gain;

    // 混响
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.8);
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.32;
    this.revSend.connect(this.reverb);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.9;
    this.reverb.connect(revOut);
    revOut.connect(this.music);

    // 附点八分延迟
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = this.spb * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3200;
    this.delay.connect(dlp);
    dlp.connect(fb);
    fb.connect(this.delay);
    this.delSend = ctx.createGain();
    this.delSend.gain.value = 0.22;
    this.delSend.connect(this.delay);
    const delOut = ctx.createGain();
    delOut.gain.value = 0.5;
    dlp.connect(delOut);
    delOut.connect(this.music);
    delOut.connect(this.revSend);
  }

  makeNoise(sec) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < d.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (s / 0x3fffffff) - 1;
    }
    return buf;
  }

  makeImpulse(sec, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let s = 987;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const r = (s / 0x3fffffff) - 1;
        const t = i / len;
        // 前 12ms 预延迟后开始衰减
        const pre = i < ctx.sampleRate * 0.012 ? 0 : 1;
        d[i] = r * Math.pow(1 - t, decay) * pre;
      }
    }
    return buf;
  }

  noiseSrc(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  env(param, t, a, peak, d, sustain = 0, dur = 0, r = 0.05) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (dur > 0) {
      param.setTargetAtTime(sustain * peak, t + a, d / 3);
      param.setValueAtTime(sustain * peak, t + Math.max(a, dur));
      param.linearRampToValueAtTime(0, t + Math.max(a, dur) + r);
    } else {
      param.exponentialRampToValueAtTime(0.0008, t + a + d);
    }
  }

  // 侧链：每个底鼓压一下音乐母线
  sidechain(t, depth = 0.55) {
    this.duck.setValueAtTime(1 - depth, t);
    this.duck.setTargetAtTime(1, t + 0.02, 0.075);
  }

  // ---------------- 鼓组 ----------------
  kick(t, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.075);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1.0 * vel, t + 0.002);
    g.gain.setTargetAtTime(0.0, t + 0.06, 0.11);
    const sh = ctx.createWaveShaper();
    sh.curve = SAT_CURVE;
    o.connect(g);
    g.connect(sh);
    sh.connect(this.drums);
    o.start(t);
    o.stop(t + 0.7);
    // 击打瞬态
    const n = this.noiseSrc(t, 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const ng = ctx.createGain();
    this.env(ng.gain, t, 0.001, 0.25 * vel, 0.012);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(this.drums);
  }

  clap(t, vel = 1) {
    const ctx = this.ctx;
    const n = this.noiseSrc(t, 0.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      g.gain.setValueAtTime(0.55 * vel, tt);
      g.gain.exponentialRampToValueAtTime(0.08 * vel, tt + 0.009);
    }
    g.gain.setValueAtTime(0.5 * vel, t + 0.034);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.drums);
    const rs = this.ctx.createGain();
    rs.gain.value = 0.35;
    g.connect(rs);
    rs.connect(this.revSend);
  }

  snare(t, vel = 1) {
    const ctx = this.ctx;
    const n = this.noiseSrc(t, 0.3);
    const bp = ctx.createBiquadFilter();
    bp.type = 'highpass';
    bp.frequency.value = 1400;
    const g = ctx.createGain();
    this.env(g.gain, t, 0.001, 0.42 * vel, 0.16);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.drums);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.08);
    const og = ctx.createGain();
    this.env(og.gain, t, 0.001, 0.4 * vel, 0.09);
    o.connect(og);
    og.connect(this.drums);
    o.start(t);
    o.stop(t + 0.2);
    const rs = this.ctx.createGain();
    rs.gain.value = 0.25;
    g.connect(rs);
    rs.connect(this.revSend);
  }

  hat(t, vel = 1, open = false) {
    const ctx = this.ctx;
    const dur = open ? 0.28 : 0.045;
    const n = this.noiseSrc(t, dur + 0.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = open ? 7000 : 8500;
    const pk = ctx.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 10500;
    pk.gain.value = 6;
    const g = ctx.createGain();
    this.env(g.gain, t, 0.001, (open ? 0.16 : 0.2) * vel, dur);
    n.connect(hp);
    hp.connect(pk);
    pk.connect(g);
    g.connect(this.drums);
  }

  shaker(t, vel = 1) {
    const ctx = this.ctx;
    const n = this.noiseSrc(t, 0.08);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 6000;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09 * vel, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.drums);
  }

  crash(t, vel = 1) {
    const ctx = this.ctx;
    const n = this.noiseSrc(t, 2.2);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.drums);
    g.connect(this.revSend);
  }

  riser(t, dur, vel = 1) {
    const ctx = this.ctx;
    const n = this.noiseSrc(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * vel, t + dur * 0.97);
    g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(bp);
    bp.connect(g);
    g.connect(this.music);
    g.connect(this.revSend);
  }

  impact(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    o.connect(g);
    g.connect(this.drums);
    o.start(t);
    o.stop(t + 1.5);
  }

  // ---------------- 旋律乐器 ----------------
  bass(t, midi, dur, vel = 1, style = 'pluck') {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = style === 'growl' ? 6 : 2;
    const peak = style === 'growl' ? 2200 : 1100;
    lp.frequency.setValueAtTime(peak, t);
    lp.frequency.exponentialRampToValueAtTime(style === 'sub' ? 200 : 260, t + Math.min(dur, 0.25));
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f / 2;
    const g1 = ctx.createGain();
    g1.gain.value = style === 'sub' ? 0.15 : 0.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.9;
    o1.connect(g1);
    g1.connect(lp);
    o2.connect(g2);
    g2.connect(out);
    lp.connect(out);
    const len = Math.max(0.06, dur * 0.92);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.42 * vel, t + 0.004);
    out.gain.setValueAtTime(0.38 * vel, t + len);
    out.gain.linearRampToValueAtTime(0, t + len + 0.03);
    out.connect(this.music);
    o1.start(t);
    o2.start(t);
    o1.stop(t + len + 0.05);
    o2.stop(t + len + 0.05);
  }

  // 808 风格长贝斯（带滑音）
  bass808(t, midi, dur, vel = 1) {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.8 * vel, t + 0.005);
    g.gain.setTargetAtTime(0.45 * vel, t + 0.05, 0.3);
    g.gain.setValueAtTime(0.45 * vel, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
    const sh = ctx.createWaveShaper();
    sh.curve = SAT_CURVE;
    o.connect(g);
    g.connect(sh);
    sh.connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  supersaw(t, midis, dur, vel = 1, cutoff = 3800) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff * 0.5, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + 0.05);
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    const n = midis.length * 5;
    const amp = (0.34 / Math.sqrt(n)) * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.012);
    g.gain.setTargetAtTime(amp * 0.7, t + 0.05, 0.25);
    g.gain.setValueAtTime(amp * 0.7, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.18);
    const pan = ctx.createStereoPanner();
    lp.connect(g);
    g.connect(pan);
    pan.connect(this.music);
    const s = ctx.createGain();
    s.gain.value = 0.4;
    g.connect(s);
    s.connect(this.revSend);
    const det = [-17, -8, 0, 8, 17];
    const pans = [-0.65, 0, 0.65].map((v) => {
      const p = ctx.createStereoPanner();
      p.pan.value = v;
      p.connect(lp);
      return p;
    });
    for (const m of midis) {
      const f = midiToFreq(m);
      det.forEach((c, i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = c + (i % 2 ? 2 : -2);
        o.connect(pans[i < 2 ? 0 : i === 2 ? 1 : 2]);
        o.start(t + i * 0.0007);
        o.stop(t + dur + 0.25);
      });
    }
  }

  pad(t, midis, dur, vel = 1, cutoff = 1500) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    const amp = (0.22 / Math.sqrt(midis.length * 3)) * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + Math.min(0.5, dur * 0.4));
    g.gain.setValueAtTime(amp, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.4);
    lp.connect(g);
    g.connect(this.music);
    const s = ctx.createGain();
    s.gain.value = 0.8;
    g.connect(s);
    s.connect(this.revSend);
    const pans = [-0.6, 0, 0.6].map((v) => {
      const p = ctx.createStereoPanner();
      p.pan.value = v;
      p.connect(lp);
      return p;
    });
    for (const m of midis) {
      const f = midiToFreq(m);
      [-10, 0, 10].forEach((c, i) => {
        const o = ctx.createOscillator();
        o.type = i === 1 ? 'triangle' : 'sawtooth';
        o.frequency.value = f;
        o.detune.value = c;
        o.connect(pans[i]);
        o.start(t);
        o.stop(t + dur + 0.5);
      });
    }
  }

  pluck(t, midi, dur, vel = 1, bright = 1) {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = f;
    o2.detune.value = 7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(900 + 4200 * bright, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.16);
    const g = ctx.createGain();
    const len = Math.min(dur, 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + len + 0.2);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(this.music);
    g.connect(this.delSend);
    o.start(t);
    o2.start(t);
    o.stop(t + len + 0.25);
    o2.stop(t + len + 0.25);
  }

  lead(t, midi, dur, vel = 1, bright = 1) {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(1800 + 3000 * bright, t);
    lp.frequency.setTargetAtTime(1400 + 2000 * bright, t + 0.02, 0.2);
    const g = ctx.createGain();
    const len = Math.max(0.08, dur * 0.95);
    const amp = 0.13 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.008);
    g.gain.setTargetAtTime(amp * 0.75, t + 0.02, 0.15);
    g.gain.setValueAtTime(amp * 0.75, t + len);
    g.gain.linearRampToValueAtTime(0, t + len + 0.08);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(dur > 0.6 ? 18 : 0, t + 0.35);
    vib.connect(vg);
    const oscs = [
      ['sawtooth', -9, 0, -0.35],
      ['sawtooth', 9, 0, 0.35],
      ['square', 0, -12, 0],
    ];
    for (const [type, det, oct, pan] of oscs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det + oct * 100;
      vg.connect(o.detune);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      const og = ctx.createGain();
      og.gain.value = type === 'square' ? 0.5 : 0.8;
      o.connect(og);
      og.connect(p);
      p.connect(lp);
      o.start(t);
      o.stop(t + len + 0.1);
    }
    vib.start(t);
    vib.stop(t + len + 0.1);
    lp.connect(g);
    g.connect(this.music);
    g.connect(this.delSend);
    const s = ctx.createGain();
    s.gain.value = 0.5;
    g.connect(s);
    s.connect(this.revSend);
  }

  // FM 电钢/铃声
  bell(t, midi, dur, vel = 1) {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.5;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.1, t + 0.8);
    mod.connect(mg);
    mg.connect(car.frequency);
    const car2 = ctx.createOscillator();
    car2.type = 'triangle';
    car2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    car2.connect(g2);
    const g = ctx.createGain();
    const len = Math.max(dur, 0.6) + 0.8;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    car.connect(g);
    g2.connect(g);
    g.connect(this.music);
    g.connect(this.delSend);
    const s = ctx.createGain();
    s.gain.value = 0.6;
    g.connect(s);
    s.connect(this.revSend);
    for (const o of [car, mod, car2]) {
      o.start(t);
      o.stop(t + len + 0.05);
    }
  }

  // 电钢琴和弦
  keys(t, midis, dur, vel = 1) {
    for (const m of midis) this.bell(t, m, dur, vel * 0.55);
  }
}

const SAT_CURVE = (() => {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(1.6 * x) / Math.tanh(1.6);
  }
  return c;
})();
