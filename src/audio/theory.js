// 音乐理论工具：音名、和弦、旋律字符串解析
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  let n = NOTE_INDEX[m[1]];
  if (m[2] === '#') n += 1;
  if (m[2] === 'b') n -= 1;
  return n + (parseInt(m[3], 10) + 1) * 12;
}

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// "E5:1 B4:.5 r:.5 | ..." -> [{midi, start, dur}] (单位：拍)
export function parseMelody(str) {
  const out = [];
  let t = 0;
  for (const tok of str.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [p, d] = tok.split(':');
    const dur = parseFloat(d);
    if (p !== 'r') out.push({ midi: noteToMidi(p), start: t, dur });
    t += dur;
  }
  return { notes: out, length: t };
}

const QUALITIES = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14],
};

export function parseChord(sym) {
  const m = /^([A-G])(#|b)?([a-z0-9]*)$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  let root = NOTE_INDEX[m[1]];
  if (m[2] === '#') root += 1;
  if (m[2] === 'b') root -= 1;
  root = (root + 12) % 12;
  const ivs = QUALITIES[m[3]];
  if (!ivs) throw new Error('bad quality ' + sym);
  return { root, ivs, sym };
}

// 中音区和弦排列，带简单的声部进行
export function voiceChord(ch, prev, low = 55, high = 72) {
  let notes = ch.ivs.map((iv) => {
    let n = 48 + ((ch.root + iv) % 12);
    while (n < low) n += 12;
    while (n > high) n -= 12;
    return n;
  });
  notes = [...new Set(notes)].sort((a, b) => a - b);
  if (prev && prev.length) {
    // 尝试整体平移一个八度让重心更接近上一个和弦
    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const pa = avg(prev);
    const cand = [notes, notes.map((n) => n + 12), notes.map((n) => n - 12)];
    notes = cand.reduce((best, c) => (Math.abs(avg(c) - pa) < Math.abs(avg(best) - pa) ? c : best));
  }
  return notes;
}

// 进行字符串数组 -> 每小节内的和弦段 [{chord, start(拍), dur}]
export function expandProgression(prog, bars, beatsPerBar = 4) {
  const out = [];
  for (let b = 0; b < bars; b++) {
    const parts = prog[b % prog.length].split(/\s+/);
    const d = beatsPerBar / parts.length;
    parts.forEach((p, i) => out.push({ chord: parseChord(p), start: b * beatsPerBar + i * d, dur: d }));
  }
  return out;
}
