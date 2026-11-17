// 编曲器：把曲目数据编排成音符事件，并用 OfflineAudioContext 渲染成音频
import { Synth } from './synth.js';
import { parseMelody, expandProgression, voiceChord } from './theory.js';
import { DEFAULT_STRUCTURE, ENERGY } from './songs.js';

export const LEAD_IN = 0.3; // 音频开头的空白（秒）

export function arrange(song) {
  const structure = song.structure || DEFAULT_STRUCTURE;
  const ops = [];
  const sections = [];
  const melody = [];
  const kicks = [];
  const add = (beat, inst, o = {}) => ops.push({ beat, inst, ...o });
  const mels = {};
  for (const k in song.mels) mels[k] = parseMelody(song.mels[k]);
  const g = song.genre;
  let bar = 0;
  let prevVoice = null;

  structure.forEach((sec, si) => {
    const start = bar * 4;
    const beats = sec.bars * 4;
    const energy = ENERGY[sec.type];
    sections.push({ type: sec.type, startBeat: start, bars: sec.bars, energy });
    const prog = song.progs[sec.prog || 'A'];
    const chords = expandProgression(prog, sec.bars).map((c) => ({ ...c, start: c.start + start }));
    const isLast = si === structure.length - 1;
    const next = structure[si + 1];

    // ---------- 鼓 ----------
    for (let b = 0; b < beats; b++) {
      const beat = start + b;
      const inBar = b % 4;
      const barIdx = Math.floor(b / 4);
      const kick = (bb, v = 1) => {
        add(bb, 'kick', { vel: v });
        add(bb, 'sidechain', { vel: v });
        kicks.push(bb);
      };
      if (g === 'future') {
        // 半拍律动
        const full = sec.type === 'drop' || sec.type === 'verse';
        if (sec.type === 'build') {
          const prog01 = b / beats;
          if (prog01 < 0.5) kick(beat, 0.8);
          else {
            kick(beat, 0.85);
            kick(beat + 0.5, 0.7);
          }
          const snDiv = prog01 < 0.5 ? 1 : prog01 < 0.75 ? 2 : 4;
          for (let s = 0; s < snDiv; s++) add(beat + s / snDiv, 'snare', { vel: 0.35 + 0.55 * prog01 });
          continue;
        }
        if (sec.type === 'break') {
          add(beat, 'hat', { vel: 0.55 });
          add(beat + 0.5, 'shaker', { vel: 0.7 });
          if (barIdx >= sec.bars / 2 && inBar === 0) kick(beat, 0.55);
          continue;
        }
        const v = sec.type === 'intro' || sec.type === 'outro' ? 0.75 : 1;
        if (inBar === 0) kick(beat, v);
        if (inBar === 2 && full) kick(beat + 0.5, v * 0.85);
        if (inBar === 1 && sec.type === 'drop' && barIdx % 2 === 1) kick(beat + 0.75, 0.7);
        if (inBar === 2) {
          add(beat, 'snare', { vel: v * 0.95 });
          add(beat, 'clap', { vel: v * 0.8 });
        }
        if (sec.type === 'intro' && inBar !== 0 && inBar !== 2) add(beat, 'hat', { vel: 0.5 });
        if (full || sec.type === 'outro') {
          add(beat, 'hat', { vel: 0.6 });
          add(beat + 0.5, 'hat', { vel: 0.45 });
          if (inBar === 3 && barIdx % 2 === 1 && sec.type === 'drop') {
            add(beat + 0.25, 'hat', { vel: 0.35 });
            add(beat + 0.75, 'hat', { vel: 0.4 });
          }
        }
        continue;
      }

      // 四拍底鼓类（house / disco / electro）
      if (sec.type === 'build') {
        const p = b / beats;
        kick(beat, 0.9);
        if (p >= 0.5) kick(beat + 0.5, 0.75);
        const snDiv = p < 0.5 ? 1 : p < 0.75 ? 2 : 4;
        for (let s = 0; s < snDiv; s++) add(beat + s / snDiv, 'snare', { vel: 0.3 + 0.6 * p });
        add(beat + 0.5, 'hat', { vel: 0.4 });
        continue;
      }
      if (sec.type === 'break') {
        add(beat, 'hat', { vel: 0.5 });
        add(beat + 0.5, 'shaker', { vel: 0.8 });
        if (barIdx >= sec.bars / 2) kick(beat, 0.55);
        continue;
      }
      const isDrop = sec.type === 'drop';
      const v = sec.type === 'intro' ? 0.8 : sec.type === 'outro' ? 0.85 : 1;
      kick(beat, v);
      if (g === 'electro' && isDrop && inBar === 3 && barIdx % 2 === 1) kick(beat + 0.75, 0.7);
      if ((inBar === 1 || inBar === 3) && sec.type !== 'intro') {
        add(beat, 'clap', { vel: v });
        if (g === 'electro') add(beat, 'snare', { vel: 0.7 * v });
      }
      if (sec.type === 'intro') {
        if (barIdx >= sec.bars / 2) add(beat + 0.5, 'hat', { vel: 0.55 });
        if (barIdx >= sec.bars - 2 && (inBar === 1 || inBar === 3)) add(beat, 'clap', { vel: 0.6 });
        continue;
      }
      const openOff = g === 'disco' || isDrop;
      add(beat + 0.5, 'hat', { vel: openOff ? 0.8 : 0.65, open: openOff });
      if (isDrop || g === 'disco' || g === 'electro') {
        add(beat + 0.25, 'hat', { vel: 0.3 });
        add(beat + 0.75, 'hat', { vel: 0.3 });
        add(beat, 'hat', { vel: 0.38 });
      } else {
        add(beat + 0.25, 'shaker', { vel: 0.6 });
        add(beat + 0.75, 'shaker', { vel: 0.6 });
      }
    }

    if (sec.type === 'drop' || (sec.type === 'verse' && si > 0)) add(start, 'crash', { vel: 1 });
    if (sec.type === 'drop') add(start, 'impact', {});
    if (sec.type === 'build') add(start, 'riser', { dur: beats - 0.25 });
    if (isLast) add(start + beats, 'crash', { vel: 0.9 });

    // ---------- 和声 / 贝斯 ----------
    for (const c of chords) {
      const voice = voiceChord(c.chord, prevVoice);
      prevVoice = voice;
      const root = 36 + c.chord.root; // C2..B2
      const bassRoot = root < 40 ? root + 12 : root;
      const type = sec.type;

      if (type === 'intro' || type === 'break' || type === 'outro' || type === 'build') {
        add(c.start, 'pad', { midis: voice, dur: c.dur, vel: type === 'build' ? 1.1 : 1, cutoff: type === 'build' ? 2400 : 1400 });
      }
      if (type === 'break') add(c.start, 'keys', { midis: voice, dur: c.dur, vel: 0.8 });
      if (type === 'verse') {
        add(c.start, 'pad', { midis: voice, dur: c.dur, vel: 0.75, cutoff: 1800 });
      }
      if (type === 'drop') {
        if (g === 'house') {
          add(c.start, 'supersaw', { midis: [...voice, voice[0] + 12], dur: c.dur, vel: 1 });
        } else if (g === 'disco') {
          for (let o = 0.5; o < c.dur; o += 1) add(c.start + o, 'supersaw', { midis: voice, dur: 0.3, vel: 0.95, cutoff: 3000 });
          add(c.start, 'pad', { midis: voice, dur: c.dur, vel: 0.6, cutoff: 2000 });
        } else if (g === 'electro') {
          const pat = [0, 0.75, 1.5, 2.5, 3.25];
          for (const p of pat) if (p < c.dur) add(c.start + p, 'supersaw', { midis: [...voice, voice[0] + 12], dur: 0.4, vel: 1, cutoff: 4500 });
        } else if (g === 'future') {
          const pat = [0, 0.75, 1.5, 2, 2.75, 3.5];
          for (const p of pat) if (p < c.dur) add(c.start + p, 'supersaw', { midis: [...voice, voice[0] + 12, voice[1] + 12], dur: 0.42, vel: 1, cutoff: 5200 });
        }
      }

      // 贝斯
      if (type === 'intro' && g !== 'future') {
        continue;
      }
      if (g === 'future') {
        if (type === 'verse' || type === 'drop' || type === 'outro') add(c.start, 'bass808', { midi: bassRoot - 12 + 12, dur: c.dur * 0.95, vel: 0.9 });
        if (type === 'build') add(c.start, 'bass808', { midi: bassRoot, dur: 0.9, vel: 0.6 });
        continue;
      }
      if (type === 'break') continue;
      for (let o = 0; o < c.dur; o += 0.25) {
        const pos = o % 1;
        let play = false;
        let m = bassRoot;
        let style = 'pluck';
        if (g === 'house') {
          play = type === 'drop' ? pos !== 0 : pos === 0.5;
        } else if (g === 'disco') {
          play = pos === 0 || pos === 0.5;
          if (pos === 0.5) m += 12;
        } else if (g === 'electro') {
          play = type === 'drop' ? pos !== 0 || o === 0 : pos === 0.5;
          style = type === 'drop' ? 'growl' : 'pluck';
        }
        if (type === 'build' && pos !== 0.5) play = false;
        if (play) add(c.start + o, 'bass', { midi: m, dur: g === 'disco' ? 0.45 : 0.22, vel: 0.95, style });
      }
    }

    // ---------- 琶音 ----------
    if (sec.type === 'intro' || sec.type === 'build' || sec.type === 'drop' || (sec.type === 'verse' && song.verseInst === 'bell')) {
      for (const c of chords) {
        const voice = voiceChord(c.chord, null, 60, 76);
        const seq = [voice[0], voice[1], voice[2] ?? voice[0] + 12, voice[0] + 12, voice[1] + 12, voice[2] ?? voice[0] + 24, voice[0] + 12, voice[1]];
        for (let o = 0, i = 0; o < c.dur; o += 0.25, i++) {
          const rel = (c.start + o - start) / beats;
          const vel = sec.type === 'build' ? 0.5 + 0.5 * rel : sec.type === 'drop' ? 0.55 : 0.6;
          const bright = sec.type === 'build' ? rel : sec.type === 'intro' ? 0.25 + 0.4 * rel : 0.6;
          add(c.start + o, 'pluck', { midi: seq[i % seq.length], dur: 0.2, vel, bright });
        }
      }
    }

    // ---------- 旋律 ----------
    if (sec.mel) {
      const mel = mels[sec.mel];
      const reps = Math.ceil(beats / mel.length);
      for (let r = 0; r < reps; r++) {
        for (const n of mel.notes) {
          const beat = start + r * mel.length + n.start;
          if (beat >= start + beats) continue;
          melody.push({ beat, midi: n.midi, dur: n.dur, sec: sec.type });
          if (sec.type === 'drop') {
            add(beat, 'lead', { midi: n.midi, dur: n.dur, vel: 1 });
            add(beat, 'pluck', { midi: n.midi + 12, dur: n.dur, vel: 0.35, bright: 0.8 });
          } else if (sec.type === 'verse') {
            if (song.verseInst === 'bell') add(beat, 'bell', { midi: n.midi, dur: n.dur, vel: 0.9 });
            else add(beat, 'pluck', { midi: n.midi, dur: n.dur, vel: 1.1, bright: 0.75 });
          } else {
            add(beat, 'bell', { midi: n.midi, dur: n.dur, vel: 0.85 });
          }
        }
      }
    }
    bar += sec.bars;
  });

  const totalBeats = bar * 4;
  const barEnergy = [];
  for (const s of sections) for (let i = 0; i < s.bars; i++) barEnergy.push(s.energy);
  melody.sort((a, b) => a.beat - b.beat);
  return { ops, sections, melody, kicks: [...new Set(kicks)].sort((a, b) => a - b), totalBeats, barEnergy };
}

const cache = new Map();

// 分段并行渲染：把歌曲切成若干段，各自在独立的 OfflineAudioContext（独立线程）中渲染，
// 再带尾音叠加。混音链除总线压缩外都是线性的，所以叠加结果与整体渲染一致；
// 压缩改为最后在 JS 中做软限幅。
function execOp(s, op, t, spb) {
  const d = (op.dur ?? 0) * spb;
  switch (op.inst) {
    case 'kick': s.kick(t, op.vel); break;
    case 'sidechain': s.sidechain(t, 0.55 * op.vel); break;
    case 'clap': s.clap(t, op.vel); break;
    case 'snare': s.snare(t, op.vel); break;
    case 'hat': s.hat(t, op.vel, op.open); break;
    case 'shaker': s.shaker(t, op.vel); break;
    case 'crash': s.crash(t, op.vel); break;
    case 'impact': s.impact(t); break;
    case 'riser': s.riser(t, d); break;
    case 'pad': s.pad(t, op.midis, d, op.vel, op.cutoff); break;
    case 'keys': s.keys(t, op.midis, d, op.vel); break;
    case 'supersaw': s.supersaw(t, op.midis, d, op.vel, op.cutoff); break;
    case 'bass': s.bass(t, op.midi, d, op.vel, op.style); break;
    case 'bass808': s.bass808(t, op.midi, d, op.vel); break;
    case 'pluck': s.pluck(t, op.midi, d, op.vel, op.bright); break;
    case 'lead': s.lead(t, op.midi, d, op.vel); break;
    case 'bell': s.bell(t, op.midi, d, op.vel); break;
  }
}

async function renderChunk(ops, a, b, tail, spb, bpm, sr, onProg) {
  const len = b - a + tail;
  const ctx = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
  const s = new Synth(ctx, bpm, { compressor: false });
  // 发声事件只取 [a, b)；侧链取到尾音结束，保证尾音的“抽吸”也正确
  const list = ops.filter((o) => (o.inst === 'sidechain' ? o.t >= a - 0.3 && o.t < b + tail : o.t >= a && o.t < b));
  let oi = 0;
  const step = 1.5;
  const ahead = 3;
  const until = (x) => {
    while (oi < list.length && list[oi].t - a < x) {
      const op = list[oi++];
      const t = op.t - a;
      if (t >= 0) execOp(s, op, t, spb);
    }
  };
  until(ahead);
  for (let x = step; x < len - 0.1; x += step) {
    ctx.suspend(x).then(() => {
      until(x + ahead);
      onProg(x / len);
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  onProg(1);
  return buf;
}

export async function renderSong(song, onProgress) {
  if (cache.has(song.id)) {
    const c = await cache.get(song.id);
    onProgress && onProgress(1);
    return c;
  }
  const job = (async () => {
    const arr = arrange(song);
    const spb = 60 / song.bpm;
    const sr = 44100;
    const T = (b) => LEAD_IN + b * spb;
    const duration = T(arr.totalBeats) + 3.2;
    const ops = arr.ops.map((op) => ({ ...op, t: T(op.beat) })).sort((x, y) => x.t - y.t);
    const cores = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
    const n = Math.max(2, Math.min(cores, Math.ceil(duration / 12)));
    const seg = duration / n;
    const tail = 3.5;
    const prog = new Array(n).fill(0);
    const report = () => onProgress && onProgress(prog.reduce((x, y) => x + y, 0) / n * 0.95);
    const chunks = await Promise.all(
      Array.from({ length: n }, (_, i) => {
        const a = i * seg;
        const b = i === n - 1 ? duration : (i + 1) * seg;
        return renderChunk(ops, a, b, i === n - 1 ? 0.1 : tail, spb, song.bpm, sr, (p) => {
          prog[i] = p;
          report();
        }).then((buf) => ({ buf, a }));
      }),
    );
    const total = Math.ceil(duration * sr);
    const L = new Float32Array(total);
    const R = new Float32Array(total);
    for (const { buf, a } of chunks) {
      const off = Math.round(a * sr);
      const cl = buf.getChannelData(0);
      const cr = buf.getChannelData(1);
      const m = Math.min(cl.length, total - off);
      for (let i = 0; i < m; i++) {
        L[off + i] += cl[i];
        R[off + i] += cr[i];
      }
    }
    // 软限幅 + 归一化：先按 99.9 百分位估计响度，再用 tanh 压住偶发峰值
    let peak = 0;
    const hist = new Uint32Array(1000);
    for (let i = 0; i < total; i += 3) {
      const v = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      if (v > peak) peak = v;
    }
    for (let i = 0; i < total; i += 3) {
      const v = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      hist[Math.min(999, Math.floor((v / (peak || 1)) * 999))]++;
    }
    let acc = 0;
    let p999 = peak;
    const target = (total / 3) * 0.999;
    for (let k = 0; k < 1000; k++) {
      acc += hist[k];
      if (acc >= target) {
        p999 = ((k + 1) / 999) * peak;
        break;
      }
    }
    const pre = 0.82 / (p999 || 1);
    const knee = 0.7;
    const sat = (x) => {
      const ax = Math.abs(x);
      if (ax <= knee) return x;
      const y = knee + (1 - knee) * Math.tanh((ax - knee) / (1 - knee));
      return Math.sign(x) * y;
    };
    const buffer = new AudioBuffer({ numberOfChannels: 2, length: total, sampleRate: sr });
    const oL = buffer.getChannelData(0);
    const oR = buffer.getChannelData(1);
    for (let i = 0; i < total; i++) {
      oL[i] = sat(L[i] * pre) * 0.95;
      oR[i] = sat(R[i] * pre) * 0.95;
    }
    onProgress && onProgress(1);
    return {
      buffer,
      meta: { ...arr, ops: undefined, bpm: song.bpm, spb, lead: LEAD_IN, duration: buffer.duration, endTime: T(arr.totalBeats) },
    };
  })();
  cache.set(song.id, job);
  try {
    return await job;
  } catch (e) {
    cache.delete(song.id);
    throw e;
  }
}
