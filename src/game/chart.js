// 谱面生成：根据编曲信息（段落能量、旋律音符）生成两种模式的谱面
export const DIRS = ['left', 'down', 'up', 'right'];
export const OPP = [3, 2, 1, 0];

export const DIFFS = {
  easy: { name: '简单', min: 3, max: 6, rev: 0, gapRhythm: 1, spaceEvery: 4 },
  normal: { name: '普通', min: 4, max: 8, rev: 0.12, gapRhythm: 0.5, spaceEvery: 2 },
  hard: { name: '困难', min: 5, max: 10, rev: 0.3, gapRhythm: 0.25, spaceEvery: 1 },
};

function rng(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sectionAt(meta, beat) {
  let cur = meta.sections[0];
  for (const s of meta.sections) if (beat >= s.startBeat) cur = s;
  return cur;
}

// ---------------------------------------------------------------- 经典模式
export function buildClassicChart(song, meta, diffKey) {
  const D = DIFFS[diffKey];
  const rand = rng(song.id + diffKey + 'classic');
  let R = diffKey === 'easy' ? 8 : diffKey === 'hard' ? 4 : song.bpm <= 112 ? 4 : 8;
  const first = 8;
  const total = meta.totalBeats;
  // 终结回合：最后一个 drop 段落的最后一个回合
  const drops = meta.sections.filter((s) => s.type === 'drop');
  const lastDrop = drops[drops.length - 1];
  const finishEnd = lastDrop.startBeat + lastDrop.bars * 4;
  const rounds = [];
  for (let s = first; s + R <= finishEnd; s += R) rounds.push({ startBeat: s, hitBeat: s + R - 1, len: R });
  const n = rounds.length;
  rounds.forEach((r, i) => {
    const sec = sectionAt(meta, r.hitBeat);
    const p = i / Math.max(1, n - 1);
    const e = (sec.energy - 0.3) / 0.7;
    let count = Math.round(D.min + (D.max - D.min) * (0.55 * p + 0.45 * e));
    r.finish = i === n - 1;
    if (r.finish) count = D.max;
    count = Math.max(D.min, Math.min(D.max, count));
    // 节拍太快、回合太短时减少按键数，保证可玩
    const maxPerSec = diffKey === 'hard' ? 7 : 5.5;
    const avail = (R - 0.6) * meta.spb;
    count = Math.max(D.min - 1, Math.min(count, Math.floor(avail * maxPerSec)));
    const arrows = [];
    let last = -1;
    for (let k = 0; k < count; k++) {
      let d = Math.floor(rand() * 4);
      if (d === last && rand() < 0.6) d = (d + 1 + Math.floor(rand() * 3)) % 4;
      last = d;
      const revChance = D.rev * (0.3 + p);
      arrows.push({ dir: d, rev: rand() < revChance });
    }
    r.arrows = arrows;
    r.level = count;
    r.energy = sec.energy;
  });
  return { rounds, roundBeats: R };
}

// ---------------------------------------------------------------- 节奏模式
export function buildRhythmChart(song, meta, diffKey) {
  const D = DIFFS[diffKey];
  const rand = rng(song.id + diffKey + 'rhythm');
  const notes = [];
  const total = meta.totalBeats;
  const endBeat = total - 4;
  // 旋律音符
  let prevMidi = null;
  let lastBeat = -99;
  let lastDir = 3;
  let run = 0;
  for (const m of meta.melody) {
    if (m.beat < 4 || m.beat > endBeat) continue;
    const q = m.beat;
    // 简单难度只保留落在半拍上的音
    if (diffKey === 'easy' && Math.abs(q * 2 - Math.round(q * 2)) > 0.01) continue;
    if (q - lastBeat < D.gapRhythm - 1e-6) continue;
    let dir;
    if (prevMidi === null) dir = 1;
    else if (m.midi > prevMidi + 1) dir = 2;
    else if (m.midi < prevMidi - 1) dir = 1;
    else dir = lastDir === 0 ? 3 : 0;
    if (dir === lastDir) run++;
    else run = 0;
    if (run >= 2) {
      dir = [0, 3][Math.floor(rand() * 2)];
      if (dir === lastDir) dir = OPP[dir];
      run = 0;
    }
    const holdMin = diffKey === 'easy' ? 2 : 1.5;
    const note = { beat: q, type: 'tap', dir };
    if (m.dur >= holdMin && diffKey !== 'easy') {
      note.type = 'hold';
      note.endBeat = q + Math.max(1, m.dur - 0.25);
    }
    notes.push(note);
    prevMidi = m.midi;
    lastBeat = note.type === 'hold' ? note.endBeat : q;
    lastDir = dir;
  }
  // 没有旋律的段落：踩拍子
  for (const s of meta.sections) {
    if (['verse', 'drop', 'break'].includes(s.type)) continue;
    const step = s.type === 'build' ? (diffKey === 'hard' ? 0.5 : 1) : diffKey === 'easy' ? 4 : 2;
    for (let b = Math.max(4, s.startBeat); b < s.startBeat + s.bars * 4 && b <= endBeat; b += step) {
      // build 最后一小节加密
      const lastBar = s.type === 'build' && b >= s.startBeat + s.bars * 4 - 4;
      notes.push({ beat: b, type: 'tap', dir: [0, 3, 1, 2][Math.floor(b / step) % 4] });
      if (lastBar && diffKey !== 'easy' && step >= 1) notes.push({ beat: b + 0.5, type: 'tap', dir: [3, 0][Math.floor(b) % 2] });
    }
  }
  // 空格：drop 段落的小节重拍
  for (const s of meta.sections) {
    if (s.type !== 'drop') continue;
    for (let bar = 0; bar < s.bars; bar += D.spaceEvery) {
      const b = s.startBeat + bar * 4;
      if (b > endBeat) continue;
      // 移除与之冲突的音符
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const end = n.endBeat ?? n.beat;
        if (Math.abs(n.beat - b) < 0.3 || (n.beat < b && end > b - 0.3)) notes.splice(i, 1);
      }
      notes.push({ beat: b, type: 'space' });
    }
  }
  notes.sort((a, b) => a.beat - b.beat);
  // 二次清理过近的音符
  const out = [];
  let lb = -99;
  for (const n of notes) {
    if (n.beat - lb < Math.min(D.gapRhythm, 0.5) - 1e-6 && n.type !== 'space') continue;
    if (out.length && n.type === 'space' && n.beat - lb < 0.25) out.pop();
    out.push(n);
    lb = n.endBeat ?? n.beat;
  }
  return { notes: out };
}
