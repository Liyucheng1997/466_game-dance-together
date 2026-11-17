import { Stage } from './scene/stage.js';
import { DANCERS } from './scene/character.js';
import { AudioPlayer } from './audio/player.js';
import { renderSong } from './audio/arranger.js';
import { SONGS, songStars } from './audio/songs.js';
import { Game } from './game/game.js';
import { HUD } from './ui/hud.js';

// ---------------------------------------------------------------- 存档
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('beatstar.' + k);
      return v === null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('beatstar.' + k, JSON.stringify(v));
    } catch (e) { /* 忽略 */ }
  },
};

const settings = Object.assign(
  { master: 0.9, music: 0.85, sfx: 0.55, offset: 0, speed: 1, quality: 'high', dancer: 'seri', mode: 'classic', diff: 'normal', song: 'starlight' },
  store.get('settings', {}),
);
const saveSettings = () => store.set('settings', settings);

// ---------------------------------------------------------------- 初始化
const stage = new Stage(document.getElementById('gl'), settings.quality);
const hud = new HUD(document.getElementById('hud'));
const ui = document.getElementById('ui');
let player = null;
let game = null;
let screen = 'title';
let bgm = null; // { song, meta } 正在循环播放的预览
let previewToken = 0;

function dancerById(id) {
  return DANCERS.find((d) => d.id === id) || DANCERS[0];
}
function applyDancers() {
  const main = dancerById(settings.dancer);
  const others = DANCERS.filter((d) => d.id !== main.id);
  stage.setDancers([main, others[0], others[1]]);
  for (const d of stage.dancers) d.ctrl.play('idle', 0, 0.01);
}
applyDancers();
const firstSong = SONGS.find((s) => s.id === settings.song) || SONGS[0];
stage.setColors(firstSong.color, firstSong.color2);

// ---------------------------------------------------------------- 工具
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function sfx(name) {
  if (player) player.sfx(name);
}
function show(el) {
  ui.innerHTML = '';
  ui.appendChild(el);
}
function bestKey(song, mode, diff) {
  return `best.${song}.${mode}.${diff}`;
}

async function ensurePlayer() {
  if (!player) {
    player = new AudioPlayer();
    player.setVolumes(settings.master, settings.music, settings.sfx);
  }
  await player.resume();
}

// 循环播放歌曲高潮段作为背景音乐
async function playPreview(song, onProgress) {
  const token = ++previewToken;
  await ensurePlayer();
  const res = await renderSong(song, onProgress);
  if (token !== previewToken || game) return res;
  const meta = res.meta;
  const drop = meta.sections.find((s) => s.type === 'drop') || meta.sections[1];
  const ls = meta.lead + drop.startBeat * meta.spb;
  const le = ls + Math.min(drop.bars, 8) * 4 * meta.spb;
  if (player.src) player.fadeOut(0.35);
  player.play(res.buffer, ls, 0.05, { loop: true, loopStart: ls, loopEnd: le, fadeIn: 0.6 });
  bgm = { song, meta };
  stage.setColors(song.color, song.color2);
  return res;
}

function stopPreview() {
  previewToken++;
  if (player) player.fadeOut(0.4);
  bgm = null;
}

// ---------------------------------------------------------------- 标题
function titleScreen() {
  screen = 'title';
  stage.setMode('menu');
  const el = h(`
  <div class="screen title">
    <div class="logo">
      <div class="logo-main">星律舞团</div>
      <div class="logo-sub">BEATSTAR · DANCE RHYTHM STAGE</div>
    </div>
    <button class="btn-start pulse">点击进入舞台</button>
    <div class="title-tip">方向键 + 空格键 · 跟着节拍尽情舞动</div>
    <div class="credits">全部音乐为浏览器实时合成 · 曲库为公有领域古典名曲改编与原创曲目</div>
  </div>`);
  el.querySelector('.btn-start').onclick = async () => {
    await ensurePlayer();
    sfx('ui');
    lobby();
    playPreview(SONGS.find((s) => s.id === 'starlight'));
  };
  show(el);
}

// ---------------------------------------------------------------- 大厅
function lobby() {
  screen = 'lobby';
  stage.setMode('select');
  const d = dancerById(settings.dancer);
  const el = h(`
  <div class="screen lobby">
    <div class="panel side">
      <div class="logo small"><div class="logo-main">星律舞团</div><div class="logo-sub">BEATSTAR</div></div>
      <div class="profile">
        <div class="avatar" style="--c:${d.outfit.accent}">${esc(d.name[0])}</div>
        <div><div class="pname">${esc(d.name)} <span>${esc(d.en)}</span></div><div class="pdesc">${esc(d.desc)}</div></div>
      </div>
      <button class="menu-btn primary" data-a="songs"><b>开始游戏</b><span>选择歌曲与模式</span></button>
      <button class="menu-btn" data-a="dancers"><b>舞者</b><span>挑选你的舞者</span></button>
      <button class="menu-btn" data-a="settings"><b>设置</b><span>音量 · 延迟校准 · 画质</span></button>
      <button class="menu-btn" data-a="help"><b>玩法说明</b><span>两种模式怎么玩</span></button>
    </div>
  </div>`);
  el.querySelectorAll('[data-a]').forEach((b) => {
    b.onmouseenter = () => sfx('click');
    b.onclick = () => {
      sfx('ui');
      const a = b.dataset.a;
      if (a === 'songs') songSelect();
      if (a === 'dancers') dancerSelect();
      if (a === 'settings') settingsModal();
      if (a === 'help') helpModal();
    };
  });
  show(el);
  for (const x of stage.dancers) x.ctrl.play(x.main ? 'groove' : 'idle', stage.beat, 0.5);
}

// ---------------------------------------------------------------- 舞者选择
function dancerSelect() {
  screen = 'dancers';
  stage.setMode('dress');
  const el = h(`
  <div class="screen dancers">
    <div class="panel side">
      <div class="head"><button class="back">‹ 返回</button><h2>选择舞者</h2></div>
      <div class="dancer-list"></div>
      <div class="dancer-detail"></div>
      <div class="move-test">
        <div class="label">动作预览</div>
        <div class="chips"></div>
      </div>
    </div>
  </div>`);
  const list = el.querySelector('.dancer-list');
  const detail = el.querySelector('.dancer-detail');
  const renderList = () => {
    list.innerHTML = '';
    for (const d of DANCERS) {
      const c = h(`<button class="dancer-card ${d.id === settings.dancer ? 'on' : ''}" style="--c:${d.outfit.accent};--h:${d.hair.color}">
        <div class="swatch"><i style="background:${d.hair.color}"></i><i style="background:${d.outfit.jacket || d.outfit.top}"></i><i style="background:${d.outfit.skirt || d.outfit.pants}"></i></div>
        <div class="dn">${esc(d.name)}<span>${esc(d.en)}</span></div></button>`);
      c.onclick = () => {
        if (settings.dancer === d.id) return;
        sfx('ui');
        settings.dancer = d.id;
        saveSettings();
        applyDancers();
        for (const x of stage.dancers) x.ctrl.play(x.main ? 'heart' : 'idle', stage.beat, 0.3);
        renderList();
      };
      list.appendChild(c);
    }
    const d = dancerById(settings.dancer);
    detail.innerHTML = `<div class="dname">${esc(d.name)} <span>${esc(d.en)}</span></div><p>${esc(d.desc)}</p>`;
  };
  renderList();
  const moves = [['groove', '律动'], ['sidestep', '侧步拍手'], ['point', '指天'], ['wave', '波浪'], ['robot', '机械舞'], ['runningman', '奔跑者'], ['spin', '旋转'], ['jumpclap', '跳跃'], ['hiproll', '扭胯'], ['shuffle', '曳步'], ['bodyroll', '身体波浪'], ['heart', '比心']];
  const chips = el.querySelector('.chips');
  for (const [k, n] of moves) {
    const c = h(`<button class="chip">${n}</button>`);
    c.onclick = () => {
      sfx('click');
      stage.main.ctrl.play(k, stage.beat, 0.4);
    };
    chips.appendChild(c);
  }
  el.querySelector('.back').onclick = () => {
    sfx('uiBack');
    lobby();
  };
  show(el);
}

// ---------------------------------------------------------------- 选歌
function songSelect() {
  screen = 'songs';
  stage.setMode('select');
  const el = h(`
  <div class="screen songs">
    <div class="panel side wide">
      <div class="head"><button class="back">‹ 返回</button><h2>选择歌曲</h2></div>
      <div class="song-list"></div>
    </div>
    <div class="panel detail-panel">
      <div class="sd"></div>
      <div class="opt-group"><div class="label">模式</div>
        <div class="seg" data-k="mode">
          <button data-v="classic">经典模式<small>输入箭头序列 + 空格踩点</small></button>
          <button data-v="rhythm">节奏模式<small>音符滚动到圆圈时按键</small></button>
        </div>
      </div>
      <div class="opt-group"><div class="label">难度</div>
        <div class="seg three" data-k="diff">
          <button data-v="easy">简单</button><button data-v="normal">普通</button><button data-v="hard">困难</button>
        </div>
      </div>
      <div class="best"></div>
      <button class="btn-go">开 始 跳 舞</button>
    </div>
  </div>`);
  const list = el.querySelector('.song-list');
  const sd = el.querySelector('.sd');
  const best = el.querySelector('.best');
  const updateBest = () => {
    const b = store.get(bestKey(settings.song, settings.mode, settings.diff), null);
    best.innerHTML = b ? `最高纪录 <b>${b.score}</b> <span class="grade-s g-${b.grade}">${b.grade}</span>` : '暂无纪录';
  };
  const renderDetail = () => {
    const s = SONGS.find((x) => x.id === settings.song) || SONGS[0];
    const stars = songStars(s);
    sd.innerHTML = `
      <div class="cover" style="--c1:${s.color};--c2:${s.color2}"><div class="eq"><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="st">${esc(s.title)}</div><div class="ss">${esc(s.sub)}</div>
      <div class="meta"><span>BPM ${s.bpm}</span><span>${'★'.repeat(Math.ceil(stars / 2))}${'☆'.repeat(5 - Math.ceil(stars / 2))}</span></div>
      <div class="art">${esc(s.artist)}<br><small>${esc(s.license)}</small></div>
      <div class="loading-bar"><i></i></div>`;
    updateBest();
  };
  const renderList = () => {
    list.innerHTML = '';
    for (const s of SONGS) {
      const c = h(`<button class="song-card ${s.id === settings.song ? 'on' : ''}" style="--c1:${s.color};--c2:${s.color2}">
        <div class="sc-title">${esc(s.title)}</div>
        <div class="sc-sub">${esc(s.sub)}</div>
        <div class="sc-meta"><span>BPM ${s.bpm}</span><span>${s.license === '原创曲目' ? '原创' : '古典改编'}</span><span class="lv">Lv.${songStars(s)}</span></div>
      </button>`);
      c.onclick = () => {
        if (settings.song === s.id) return;
        sfx('click');
        settings.song = s.id;
        saveSettings();
        renderList();
        renderDetail();
        loadPreview();
      };
      list.appendChild(c);
    }
  };
  const loadPreview = () => {
    const s = SONGS.find((x) => x.id === settings.song);
    const bar = sd.querySelector('.loading-bar');
    bar.classList.add('on');
    playPreview(s, (p) => {
      const i = bar.querySelector('i');
      if (i) i.style.width = p * 100 + '%';
    }).then(() => bar.classList.remove('on'));
  };
  el.querySelectorAll('.seg').forEach((seg) => {
    const k = seg.dataset.k;
    const upd = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings[k]));
    seg.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        sfx('click');
        settings[k] = b.dataset.v;
        saveSettings();
        upd();
        updateBest();
      };
    });
    upd();
  });
  el.querySelector('.back').onclick = () => {
    sfx('uiBack');
    lobby();
  };
  el.querySelector('.btn-go').onclick = () => {
    sfx('ui');
    startGame();
  };
  renderList();
  renderDetail();
  show(el);
  if (!bgm || bgm.song.id !== settings.song) loadPreview();
}

// ---------------------------------------------------------------- 开始游戏
async function startGame() {
  const song = SONGS.find((s) => s.id === settings.song);
  stopPreview();
  screen = 'loading';
  const el = h(`<div class="screen loading"><div class="ld-title">${esc(song.title)}</div><div class="ld-sub">正在合成音乐…</div><div class="loading-bar big on"><i></i></div></div>`);
  show(el);
  const res = await renderSong(song, (p) => {
    el.querySelector('i').style.width = p * 100 + '%';
  });
  await ensurePlayer();
  stage.setColors(song.color, song.color2);
  screen = 'game';
  show(h(`<div class="screen game-ui"><button class="pause-btn" title="暂停 (Esc)">❚❚</button></div>`));
  ui.querySelector('.pause-btn').onclick = () => pauseMenu();
  stage.setMode('game');
  game = new Game({
    player, stage, song, meta: res.meta, buffer: res.buffer, mode: settings.mode, diff: settings.diff, settings,
    onEnd: (r) => setTimeout(() => results(song, r), 600),
  });
  game.start();
}

function pauseMenu() {
  if (!game || game.paused || game.ended) return;
  game.pause();
  const el = h(`<div class="modal"><div class="modal-box small">
    <h2>暂停</h2>
    <button class="menu-btn primary" data-a="resume"><b>继续</b></button>
    <button class="menu-btn" data-a="retry"><b>重新开始</b></button>
    <button class="menu-btn" data-a="quit"><b>退出到选歌</b></button>
  </div></div>`);
  el.querySelectorAll('[data-a]').forEach((b) => {
    b.onclick = async () => {
      sfx('ui');
      el.remove();
      const a = b.dataset.a;
      if (a === 'resume') game.resume();
      else {
        game.quit();
        await player.resume();
        game = null;
        if (a === 'retry') startGame();
        else songSelect();
      }
    };
  });
  ui.appendChild(el);
}

// ---------------------------------------------------------------- 结算
function results(song, r) {
  const g = game;
  game = null;
  screen = 'results';
  stage.setMode('result');
  const good = ['SS', 'S', 'A', 'B'].includes(r.grade);
  for (const d of stage.dancers) d.ctrl.play(good ? 'cheer' : r.grade === 'C' ? 'groove' : 'sad', stage.beat, 0.6);
  stage.main.dancer.setExpression(good ? 'happy' : r.grade === 'D' ? 'sad' : 'open', 99);
  if (good) stage.effect('confetti');
  const key = bestKey(song.id, g.mode, g.diff);
  const prev = store.get(key, null);
  const isBest = !prev || r.score > prev.score;
  if (isBest) store.set(key, { score: r.score, grade: r.grade, combo: r.maxCombo });
  const s = r.stats;
  const el = h(`
  <div class="screen results">
    <div class="panel side res">
      <div class="res-song">${esc(song.title)} <span>${g.mode === 'classic' ? '经典模式' : '节奏模式'} · ${{ easy: '简单', normal: '普通', hard: '困难' }[g.diff]}</span></div>
      <div class="grade g-${r.grade}">${r.grade}</div>
      ${r.full ? '<div class="fc">FULL COMBO</div>' : ''}
      ${r.finish && r.finish !== 'fail' ? '<div class="fc fin">FINISH 成功</div>' : ''}
      <div class="res-score">${r.score.toLocaleString()} ${isBest ? '<span class="nb">NEW BEST</span>' : ''}</div>
      <div class="res-grid">
        <div class="j perfect">PERFECT<b>${s.perfect}</b></div>
        <div class="j great">GREAT<b>${s.great}</b></div>
        <div class="j cool">COOL<b>${s.cool}</b></div>
        <div class="j bad">BAD<b>${s.bad}</b></div>
        <div class="j miss">MISS<b>${s.miss}</b></div>
        <div class="j combo">MAX COMBO<b>${r.maxCombo}</b></div>
      </div>
      <div class="acc">准确率 ${(r.acc * 100).toFixed(2)}%</div>
      <button class="menu-btn primary" data-a="retry"><b>再来一次</b></button>
      <button class="menu-btn" data-a="songs"><b>选择歌曲</b></button>
    </div>
  </div>`);
  el.querySelectorAll('[data-a]').forEach((b) => {
    b.onclick = () => {
      sfx('ui');
      stage.main.dancer.setExpression('open', 0);
      if (b.dataset.a === 'retry') startGame();
      else songSelect();
    };
  });
  show(el);
  hud.clear();
  playPreview(song);
}

// ---------------------------------------------------------------- 设置
function settingsModal() {
  const el = h(`<div class="modal"><div class="modal-box">
    <h2>设置</h2>
    <label class="row">主音量<input type="range" min="0" max="1" step="0.01" data-k="master"><output></output></label>
    <label class="row">音乐<input type="range" min="0" max="1" step="0.01" data-k="music"><output></output></label>
    <label class="row">打击音效<input type="range" min="0" max="1" step="0.01" data-k="sfx"><output></output></label>
    <label class="row">判定偏移(ms)<input type="range" min="-200" max="200" step="1" data-k="offset"><output></output></label>
    <label class="row">节奏模式流速<input type="range" min="0.6" max="2" step="0.05" data-k="speed"><output></output></label>
    <div class="row">画质<div class="seg three" data-k="quality"><button data-v="high">高</button><button data-v="medium">中</button><button data-v="low">低</button></div></div>
    <p class="hint">偏移为正：判定更靠后（适合蓝牙耳机等高延迟设备）。不确定的话可以点「自动校准」。画质修改后刷新页面生效。</p>
    <div class="btns"><button class="menu-btn" data-a="calib"><b>自动校准</b></button><button class="menu-btn primary" data-a="close"><b>完成</b></button></div>
  </div></div>`);
  el.querySelectorAll('input[type=range]').forEach((inp) => {
    const k = inp.dataset.k;
    const out = inp.nextElementSibling;
    inp.value = settings[k];
    const fmt = () => (out.textContent = k === 'offset' ? `${settings[k]}` : k === 'speed' ? `x${(+settings[k]).toFixed(2)}` : `${Math.round(settings[k] * 100)}%`);
    fmt();
    inp.oninput = () => {
      settings[k] = parseFloat(inp.value);
      fmt();
      if (player) player.setVolumes(settings.master, settings.music, settings.sfx);
      saveSettings();
    };
  });
  const seg = el.querySelector('.seg');
  const upd = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.quality));
  seg.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      settings.quality = b.dataset.v;
      saveSettings();
      upd();
    };
  });
  upd();
  el.querySelector('[data-a=close]').onclick = () => {
    sfx('ui');
    el.remove();
  };
  el.querySelector('[data-a=calib]').onclick = () => {
    el.remove();
    calibrate();
  };
  ui.appendChild(el);
}

async function calibrate() {
  await ensurePlayer();
  stopPreview();
  const el = h(`<div class="modal"><div class="modal-box small calib">
    <h2>延迟校准</h2>
    <p>听到“嘀”声时按下 <b>空格</b>，共 12 下。</p>
    <div class="dots"></div>
    <div class="calib-res">准备…</div>
  </div></div>`);
  ui.appendChild(el);
  const dots = el.querySelector('.dots');
  for (let i = 0; i < 12; i++) dots.appendChild(h('<i></i>'));
  const ctx = player.ctx;
  const interval = 0.6;
  const t0 = ctx.currentTime + 1.2;
  player.startAt = t0;
  for (let i = 0; i < 12; i++) {
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.frequency.value = i % 4 === 0 ? 1760 : 1320;
    gn.gain.setValueAtTime(0, t0 + i * interval);
    gn.gain.linearRampToValueAtTime(0.3, t0 + i * interval + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.001, t0 + i * interval + 0.08);
    o.connect(gn);
    gn.connect(player.sfxGain);
    o.start(t0 + i * interval);
    o.stop(t0 + i * interval + 0.1);
  }
  const diffs = [];
  const onKey = (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    const st = player.songTime(e.timeStamp);
    const k = Math.round(st / interval);
    if (k < 0 || k > 11) return;
    diffs.push(st - k * interval);
    const dot = dots.children[k];
    if (dot) dot.classList.add('on');
  };
  window.addEventListener('keydown', onKey);
  const finish = () => {
    window.removeEventListener('keydown', onKey);
    const res = el.querySelector('.calib-res');
    if (diffs.length < 5) {
      res.textContent = '有效按键太少，请重试。';
    } else {
      const sorted = diffs.slice(2).sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      settings.offset = Math.round(med * 1000);
      saveSettings();
      res.innerHTML = `检测到偏移 <b>${settings.offset} ms</b>，已应用。`;
    }
    const b = h('<button class="menu-btn primary"><b>好的</b></button>');
    b.onclick = () => {
      el.remove();
      settingsModal();
      if (screen !== 'game') playPreview(SONGS.find((x) => x.id === settings.song) || SONGS[0]);
    };
    el.querySelector('.modal-box').appendChild(b);
  };
  el.querySelector('.calib-res').textContent = '开始！';
  setTimeout(finish, (1.2 + 12 * interval + 0.5) * 1000);
}

function helpModal() {
  const el = h(`<div class="modal"><div class="modal-box help">
    <h2>玩法说明</h2>
    <div class="help-cols">
      <div>
        <h3>经典模式</h3>
        <p>屏幕下方会出现一串箭头。在光标到达<b>右侧圆圈</b>之前，用方向键依次输入。</p>
        <p>输完后，在光标正好碰到圆圈的瞬间按下 <kbd>空格</kbd>，根据时机判定 PERFECT / GREAT / COOL / BAD。</p>
        <p><span class="red">红色箭头</span>需要按<b>相反方向</b>。按错会清空当前输入。</p>
        <p>歌曲最后一回合是 <b>FINISH</b>，成功会触发终结舞步和大量加分。</p>
      </div>
      <div>
        <h3>节奏模式</h3>
        <p>音符从右向左滚动，到达左侧圆圈时按下对应按键。</p>
        <p>彩色圆形音符对应方向键，金色胶囊是 <kbd>空格</kbd>，带尾巴的是长按音符，按住直到尾巴结束。</p>
        <h3>按键</h3>
        <p>方向：<kbd>↑↓←→</kbd> / <kbd>WASD</kbd> / 小键盘 <kbd>8246</kbd><br>暂停：<kbd>Esc</kbd></p>
      </div>
    </div>
    <p class="hint">连续 PERFECT 会叠加分数倍率，舞者也会跳出更高级的舞步。觉得判定不准？到设置里做一次「自动校准」。</p>
    <button class="menu-btn primary" data-a="close"><b>明白了</b></button>
  </div></div>`);
  el.querySelector('[data-a=close]').onclick = () => {
    sfx('ui');
    el.remove();
  };
  ui.appendChild(el);
}

// ---------------------------------------------------------------- 输入
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
window.addEventListener('keydown', (e) => {
  if (game && !game.ended) {
    if (e.code === 'Escape') {
      if (game.paused) {
        const m = ui.querySelector('.modal');
        if (m) m.remove();
        game.resume();
      } else pauseMenu();
      return;
    }
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    game.keydown(e);
  } else if (e.code === 'Escape') {
    const m = ui.querySelector('.modal');
    if (m) m.remove();
  }
});
window.addEventListener('keyup', (e) => {
  if (game) game.keyup(e);
});
window.addEventListener('blur', () => {
  if (game && !game.paused && !game.ended) pauseMenu();
});

// ---------------------------------------------------------------- 主循环
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let beat;
  let energy = 0.45;
  let pattern;
  if (game) {
    game.update();
    beat = game.beat;
    const bar = Math.max(0, Math.floor(beat / 4));
    energy = game.meta.barEnergy[Math.min(bar, game.meta.barEnergy.length - 1)] ?? 0.4;
    const sec = game.meta.sections.findIndex((s, i, a) => beat >= s.startBeat && (i === a.length - 1 || beat < a[i + 1].startBeat));
    pattern = Math.max(0, sec) % 4;
    hud.draw(game, { speed: settings.speed });
  } else if (bgm && player && player.src) {
    beat = (player.songTime() - bgm.meta.lead) / bgm.meta.spb;
    energy = 0.8;
    pattern = Math.floor(beat / 32) % 4;
  } else {
    beat = (now / 1000) * 2;
  }
  stage.update(dt, beat, energy, pattern);
  stage.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__app = { stage, get game() { return game; }, get player() { return player; } };

titleScreen();
