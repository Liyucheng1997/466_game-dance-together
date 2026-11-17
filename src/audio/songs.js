// 内置曲库：公有领域古典名曲的舞曲改编 + 原创曲目
// 所有音频在浏览器里实时合成，不含任何外部音频文件。

export const SONGS = [
  {
    id: 'canon',
    title: '星河卡农',
    sub: 'Canon Starlight Remix',
    artist: '改编自 帕赫贝尔《D大调卡农》',
    license: '公有领域作品改编',
    bpm: 126,
    genre: 'house',
    color: '#7fd4ff',
    color2: '#c58bff',
    progs: {
      A: ['D A', 'Bm F#m', 'G D', 'G A'],
      B: ['D A', 'Bm F#m', 'G D', 'G A'],
    },
    mels: {
      A: 'F#5:2 E5:2 | D5:2 C#5:2 | B4:2 A4:2 | B4:2 C#5:2 | D5:2 C#5:2 | B4:2 A4:2 | G4:2 F#4:2 | G4:2 E4:2',
      B:
        'D5:.5 F#5:.5 A5:.5 F#5:.5 E5:.5 C#5:.5 A4:.5 C#5:.5 | B4:.5 D5:.5 F#5:.5 D5:.5 C#5:.5 A4:.5 F#4:.5 A4:.5 | ' +
        'G4:.5 B4:.5 D5:.5 B4:.5 A4:.5 D5:.5 F#5:.5 A5:.5 | G5:.5 F#5:.5 E5:.5 D5:.5 C#5:.5 E5:.5 A5:1 | ' +
        'F#5:.75 D5:.25 E5:.5 F#5:.5 E5:.75 C#5:.25 D5:.5 E5:.5 | D5:.75 B4:.25 C#5:.5 D5:.5 C#5:1 A4:1 | ' +
        'B4:.5 G4:.5 B4:.5 D5:.5 A4:.5 F#4:.5 A4:.5 D5:.5 | B4:.5 D5:.5 G5:.5 B5:.5 A5:2',
    },
    verseInst: 'bell',
  },
  {
    id: 'ode',
    title: '欢乐颂 Disco',
    sub: 'Ode to Joy Disco Edit',
    artist: '改编自 贝多芬《第九交响曲》',
    license: '公有领域作品改编',
    bpm: 118,
    genre: 'disco',
    color: '#ffd36e',
    color2: '#ff7ab8',
    progs: {
      A: ['C', 'G', 'Am', 'G', 'C', 'G', 'F G', 'C'],
      B: ['G', 'C', 'G', 'G', 'C', 'G', 'F G', 'C'],
    },
    mels: {
      A:
        'E5:1 E5:1 F5:1 G5:1 | G5:1 F5:1 E5:1 D5:1 | C5:1 C5:1 D5:1 E5:1 | E5:1.5 D5:.5 D5:2 | ' +
        'E5:1 E5:1 F5:1 G5:1 | G5:1 F5:1 E5:1 D5:1 | C5:1 C5:1 D5:1 E5:1 | D5:1.5 C5:.5 C5:2',
      B:
        'D5:1 D5:1 E5:1 C5:1 | D5:1 E5:.5 F5:.5 E5:1 C5:1 | D5:1 E5:.5 F5:.5 E5:1 D5:1 | C5:1 D5:1 G4:2 | ' +
        'E5:1 E5:1 F5:1 G5:1 | G5:1 F5:1 E5:1 D5:1 | C5:1 C5:1 D5:1 E5:1 | D5:1.5 C5:.5 C5:2',
    },
    verseInst: 'pluck',
  },
  {
    id: 'turca',
    title: '土耳其狂想',
    sub: 'Alla Turca Electro',
    artist: '改编自 莫扎特《土耳其进行曲》',
    license: '公有领域作品改编',
    bpm: 136,
    genre: 'electro',
    color: '#ff6b6b',
    color2: '#ffb36b',
    progs: {
      A: ['Am', 'Dm Am', 'E', 'Am', 'F C', 'E Am', 'Dm E', 'Am'],
      B: ['A', 'E', 'A', 'E A', 'A', 'E', 'E', 'A'],
    },
    mels: {
      A:
        'B4:.5 A4:.5 G#4:.5 A4:.5 C5:1 r:1 | D5:.5 C5:.5 B4:.5 C5:.5 E5:1 r:1 | ' +
        'F5:.5 E5:.5 D#5:.5 E5:.5 B5:.5 A5:.5 G#5:.5 A5:.5 | B5:.5 A5:.5 G#5:.5 A5:.5 C6:2 | ' +
        'A5:1 B5:.5 C6:.5 B5:1 A5:1 | G#5:1 A5:.5 B5:.5 A5:1 E5:1 | F5:1 D5:1 C5:1 B4:1 | A4:1 E4:1 A4:2',
      B:
        'C#5:.5 D5:.5 E5:1 E5:1 F#5:.5 E5:.5 | D5:.5 C#5:.5 B4:1 B4:1 C#5:.5 D5:.5 | ' +
        'E5:.5 F#5:.5 E5:.5 D5:.5 C#5:.5 B4:.5 A4:1 | B4:.5 C#5:.5 B4:.5 G#4:.5 A4:2 | ' +
        'C#5:.5 D5:.5 E5:1 E5:1 F#5:.5 E5:.5 | D5:.5 C#5:.5 B4:1 B4:1 C#5:.5 D5:.5 | ' +
        'E5:.5 F#5:.5 G#5:.5 A5:.5 B5:.5 G#5:.5 E5:1 | A5:1 E5:1 A5:2',
    },
    verseInst: 'pluck',
  },
  {
    id: 'elise',
    title: '爱丽丝之夜',
    sub: 'Für Elise Future Bass',
    artist: '改编自 贝多芬《致爱丽丝》',
    license: '公有领域作品改编',
    bpm: 108,
    genre: 'future',
    color: '#9be7c4',
    color2: '#7f9cff',
    progs: {
      A: ['Am', 'Am', 'E Am', 'Am', 'Am', 'E Am', 'C G', 'C G'],
      B: ['Am', 'Am', 'E Am', 'Am', 'F', 'E', 'C G', 'Dm E'],
    },
    mels: {
      A:
        'E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 | A4:1.5 C4:.5 E4:.5 A4:.5 B4:1 | ' +
        'r:.5 E4:.5 G#4:.5 B4:.5 C5:2 | r:.5 E4:.5 E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 | ' +
        'D5:.5 C5:.5 A4:1.5 C4:.5 E4:.5 A4:.5 | B4:1.5 E4:.5 C5:.5 B4:.5 A4:1 | ' +
        'r:1 B4:.5 C5:.5 D5:.5 E5:1.5 | G4:.5 F5:.5 E5:.5 D5:.5 F4:.5 E5:.5 D5:.5 C5:.5',
      B:
        'E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 | A4:1 E5:.5 A5:.5 C6:1 B5:1 | ' +
        'G#5:.5 E5:.5 B4:.5 G#5:.5 A5:2 | E6:.5 D#6:.5 E6:.5 D#6:.5 E6:.5 B5:.5 D6:.5 C6:.5 | ' +
        'A5:1 C5:.5 E5:.5 A5:1 C6:1 | B5:1 G#5:.5 E5:.5 B5:1 D6:1 | C6:1 B5:.5 A5:.5 G5:1 E5:1 | ' +
        'F5:.5 E5:.5 D5:.5 B4:.5 A4:2',
    },
    verseInst: 'bell',
  },
  {
    id: 'peddler',
    title: '货郎之舞',
    sub: 'Korobeiniki Rush',
    artist: '改编自 俄罗斯民歌《货郎》',
    license: '公有领域作品改编',
    bpm: 140,
    genre: 'electro',
    color: '#6ef0ff',
    color2: '#ff6ef0',
    progs: {
      A: ['E', 'Am', 'E', 'Am', 'Dm', 'C', 'E', 'Am'],
      B: ['E', 'Am', 'E', 'Am', 'Dm', 'C', 'E', 'Am'],
    },
    mels: {
      A:
        'E5:1 B4:.5 C5:.5 D5:1 C5:.5 B4:.5 | A4:1 A4:.5 C5:.5 E5:1 D5:.5 C5:.5 | B4:1.5 C5:.5 D5:1 E5:1 | C5:1 A4:1 A4:2 | ' +
        'r:.5 D5:1 F5:.5 A5:1 G5:.5 F5:.5 | E5:1.5 C5:.5 E5:1 D5:.5 C5:.5 | B4:1 B4:.5 C5:.5 D5:1 E5:1 | C5:1 A4:1 A4:2',
      B:
        'E5:.5 E6:.5 B4:.5 C5:.5 D5:.5 D6:.5 C5:.5 B4:.5 | A4:.5 A5:.5 A4:.5 C5:.5 E5:.5 E6:.5 D5:.5 C5:.5 | ' +
        'B4:.5 B5:.5 B4:.5 C5:.5 D5:1 E5:1 | C5:1 A4:1 A4:1 A5:1 | ' +
        'r:.5 D5:1 F5:.5 A5:1 G5:.5 F5:.5 | E5:1.5 C5:.5 E5:1 D5:.5 C5:.5 | B4:.5 G#4:.5 B4:.5 C5:.5 D5:1 E5:1 | C5:1 A4:1 A4:2',
    },
    verseInst: 'pluck',
  },
  {
    id: 'mountain',
    title: '魔王殿堂',
    sub: 'Hall of the Mountain King',
    artist: '改编自 格里格《在山魔王的宫殿里》',
    license: '公有领域作品改编',
    bpm: 132,
    genre: 'electro',
    color: '#b38bff',
    color2: '#ff4f7a',
    progs: {
      A: ['Bm', 'F# Em', 'Bm', 'D F#'],
      B: ['F#', 'Bm F#', 'F#', 'F#7'],
    },
    mels: {
      A:
        'B4:.5 C#5:.5 D5:.5 E5:.5 F#5:.5 D5:.5 F#5:1 | F5:.5 C#5:.5 F5:1 E5:.5 C5:.5 E5:1 | ' +
        'B4:.5 C#5:.5 D5:.5 E5:.5 F#5:.5 D5:.5 F#5:.5 B5:.5 | A5:.5 F#5:.5 D5:.5 F#5:.5 A5:2',
      B:
        'F#5:.5 G#5:.5 A#5:.5 B5:.5 C#6:.5 A#5:.5 C#6:1 | D6:.5 A#5:.5 D6:1 C#6:.5 A#5:.5 C#6:1 | ' +
        'F#5:.5 G#5:.5 A#5:.5 B5:.5 C#6:.5 A#5:.5 C#6:.5 F#6:.5 | E6:.5 C#6:.5 A#5:.5 C#6:.5 E6:2',
    },
    verseInst: 'pluck',
  },
  {
    id: 'starlight',
    title: '星光跃动',
    sub: 'Starlight Pulse',
    artist: '星律舞团 原创',
    license: '原创曲目',
    bpm: 124,
    genre: 'house',
    color: '#ff9ad5',
    color2: '#8ad8ff',
    progs: {
      A: ['F', 'G', 'Em', 'Am'],
      B: ['F', 'G', 'Em', 'Am'],
    },
    mels: {
      A:
        'A4:.5 C5:.5 F5:.5 E5:.5 F5:1 C5:1 | B4:.5 D5:.5 G5:.5 F5:.5 E5:1 D5:1 | ' +
        'E5:.5 G5:.5 B5:.5 A5:.5 G5:.5 E5:.5 D5:.5 E5:.5 | C5:1.5 B4:.5 A4:2 | ' +
        'A4:.5 C5:.5 F5:.5 G5:.5 A5:1 G5:.5 F5:.5 | G5:1 D5:.5 E5:.5 F5:1 E5:.5 D5:.5 | ' +
        'E5:.5 B4:.5 E5:.5 G5:.5 B5:1 A5:.5 G5:.5 | A5:3 r:1',
      B:
        'C6:.75 A5:.75 F5:.5 G5:.5 A5:.5 C6:1 | B5:.75 G5:.75 D5:.5 E5:.5 G5:.5 B5:1 | ' +
        'B5:.5 A5:.5 G5:.5 E5:.5 G5:1 A5:1 | E5:.5 G5:.5 A5:1 r:1 E5:.5 G5:.5 | ' +
        'A5:.75 C6:.75 A5:.5 G5:.5 F5:.5 G5:1 | G5:.75 B5:.75 G5:.5 F5:.5 E5:.5 D5:1 | ' +
        'E5:.5 G5:.5 B5:.5 D6:.5 C6:1 B5:1 | A5:2 r:2',
    },
    verseInst: 'pluck',
  },
  {
    id: 'neon',
    title: '霓虹心跳',
    sub: 'Neon Heartbeat',
    artist: '星律舞团 原创',
    license: '原创曲目',
    bpm: 98,
    genre: 'future',
    color: '#ffb86b',
    color2: '#6b8bff',
    progs: {
      A: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7', 'Fmaj7', 'Em7', 'Dm7', 'G7'],
      B: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7', 'Fmaj7', 'Em7', 'Dm7', 'G7'],
    },
    mels: {
      A:
        'E5:1 C5:.5 A4:.5 C5:1 E5:1 | D5:1.5 B4:.5 G4:1 r:1 | F5:.5 E5:.5 D5:.5 C5:.5 A4:1 C5:1 | B4:1.5 G4:.5 E4:2 | ' +
        'A4:.5 C5:.5 E5:.5 G5:.5 A5:1 G5:1 | G5:.5 E5:.5 D5:1 B4:1 D5:1 | F5:1 E5:.5 D5:.5 C5:1 A4:1 | B4:1 D5:1 G5:2',
      B:
        'A5:.5 G5:.5 E5:1 A5:.5 G5:.5 E5:1 | G5:.5 E5:.5 D5:1 B4:1 D5:1 | F5:.5 E5:.5 D5:1 F5:.5 A5:.5 C6:1 | B5:1 G5:1 E5:2 | ' +
        'A5:.5 G5:.5 E5:1 A5:.5 G5:.5 C6:1 | B5:.5 G5:.5 E5:1 D5:1 E5:1 | F5:.5 A5:.5 C6:1 B5:.5 A5:.5 G5:1 | G5:2 F5:1 D5:1',
    },
    verseInst: 'bell',
    structure: [
      { type: 'intro', bars: 4 },
      { type: 'verse', bars: 8, prog: 'A', mel: 'A' },
      { type: 'build', bars: 4, prog: 'A' },
      { type: 'drop', bars: 8, prog: 'B', mel: 'B' },
      { type: 'break', bars: 8, prog: 'A', mel: 'A' },
      { type: 'build', bars: 4, prog: 'A' },
      { type: 'drop', bars: 16, prog: 'B', mel: 'B' },
      { type: 'outro', bars: 4, prog: 'A' },
    ],
  },
];

export const DEFAULT_STRUCTURE = [
  { type: 'intro', bars: 8, prog: 'A' },
  { type: 'verse', bars: 8, prog: 'A', mel: 'A' },
  { type: 'build', bars: 4, prog: 'A' },
  { type: 'drop', bars: 8, prog: 'B', mel: 'B' },
  { type: 'break', bars: 8, prog: 'A', mel: 'A' },
  { type: 'build', bars: 4, prog: 'A' },
  { type: 'drop', bars: 16, prog: 'B', mel: 'B' },
  { type: 'outro', bars: 4, prog: 'A' },
];

export const ENERGY = { intro: 0.35, verse: 0.6, build: 0.78, drop: 1, break: 0.45, outro: 0.3 };

// 难度星级（1~10）
export function songStars(song) {
  const base = { house: 0, disco: -1, electro: 1, future: -1 }[song.genre] || 0;
  return Math.max(1, Math.min(10, Math.round((song.bpm - 90) / 8) + base + 1));
}
