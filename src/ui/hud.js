// 游戏 HUD：Canvas 2D 绘制箭头序列、节拍条、音符轨道、判定文字
import { OPP } from '../game/chart.js';
import { WIN } from '../game/game.js';

const DIR_COLORS = ['#ff6fb5', '#5fd3ff', '#7dff9a', '#ffd35f'];
const ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2]; // left, down, up, right
const JUDGE_STYLE = {
  perfect: { text: 'PERFECT', c1: '#fff3a8', c2: '#ff7ad9', glow: '#ff9be6' },
  great: { text: 'GREAT', c1: '#c8ffff', c2: '#3fb8ff', glow: '#5fd3ff' },
  cool: { text: 'COOL', c1: '#d9ffd0', c2: '#3fdc8a', glow: '#6dffb0' },
  bad: { text: 'BAD', c1: '#e6d4ff', c2: '#8c6bff', glow: '#a88bff' },
  miss: { text: 'MISS', c1: '#d0d0d8', c2: '#6c6c7a', glow: '#888' },
  early: { text: 'TOO EARLY', c1: '#ffffff', c2: '#aaaaaa', glow: '#888' },
};

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function arrowPath(g, s) {
  // 指向上方的箭头，中心在原点，尺寸 s
  g.beginPath();
  g.moveTo(0, -s * 0.46);
  g.lineTo(s * 0.42, s * 0.02);
  g.lineTo(s * 0.17, s * 0.02);
  g.lineTo(s * 0.17, s * 0.42);
  g.lineTo(-s * 0.17, s * 0.42);
  g.lineTo(-s * 0.17, s * 0.02);
  g.lineTo(-s * 0.42, s * 0.02);
  g.closePath();
}

export class HUD {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.c.width = this.W * dpr;
    this.c.height = this.H * dpr;
  }

  clear() {
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.clearRect(0, 0, this.c.width, this.c.height);
  }

  draw(game, opts = {}) {
    const g = this.g;
    this.clear();
    if (!game) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.now = performance.now();
    this.drawTop(game);
    if (game.mode === 'classic') this.drawClassic(game);
    else this.drawRhythm(game, opts);
    this.drawJudge(game);
  }

  // ---------------------------------------------------------------- 顶部
  drawTop(game) {
    const g = this.g;
    const W = this.W;
    // 进度条
    const p = Math.max(0, Math.min(1, game.beat / game.meta.totalBeats));
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, 0, W, 4);
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, game.song.color);
    grad.addColorStop(1, game.song.color2);
    g.fillStyle = grad;
    g.fillRect(0, 0, W * p, 4);
    // 歌名
    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.font = '700 20px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 8;
    g.fillText(game.song.title, 24, 20);
    g.font = '500 13px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.65)';
    const modeName = game.mode === 'classic' ? '经典模式' : '节奏模式';
    const diffName = { easy: '简单', normal: '普通', hard: '困难' }[game.diff];
    g.fillText(`${modeName} · ${diffName} · BPM ${game.song.bpm}`, 24, 46);
    // 分数
    g.textAlign = 'right';
    g.font = '800 34px "Segoe UI","PingFang SC",sans-serif';
    const sg = g.createLinearGradient(0, 16, 0, 52);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(1, game.song.color);
    g.fillStyle = sg;
    g.fillText(String(Math.round(game.shownScore)).padStart(7, '0'), W - 24, 16);
    g.font = '600 12px "Segoe UI",sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText('SCORE', W - 24, 54);
    g.shadowBlur = 0;
  }

  // ---------------------------------------------------------------- 判定文字
  drawJudge(game) {
    const g = this.g;
    const fx = game.fx;
    const cx = this.W / 2;
    const cy = this.H * (game.mode === 'classic' ? 0.4 : 0.42);
    // 开场提示
    if (game.mode === 'classic') {
      const first = game.chart.rounds[0];
      if (game.beat < first.startBeat - 2 && game.beat > -2) {
        this.bigText('READY', cx, cy, 1, '#ffffff', game.song.color, 0.6 + 0.4 * Math.abs(Math.sin(game.beat * Math.PI)));
      } else if (game.beat >= first.startBeat - 2 && game.beat < first.startBeat) {
        this.bigText('GO!', cx, cy, 1.2, '#fff3a8', game.song.color2, 1);
      }
    } else if (game.beat < 4 && game.beat > -2) {
      this.bigText('READY', cx, cy, 1, '#ffffff', game.song.color, 0.6 + 0.4 * Math.abs(Math.sin(game.beat * Math.PI)));
    }
    if (!fx) return;
    const age = (this.now - fx.at) / 1000;
    if (age > 1.0) return;
    const st = JUDGE_STYLE[fx.judge];
    if (!st) return;
    const pop = 1 + 0.45 * Math.exp(-age * 14);
    const alpha = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
    if (fx.finish) {
      this.bigText('FINISH!', cx, cy - 70, pop * 1.4, '#fff7c0', '#ff6fd8', alpha);
    }
    this.bigText(st.text, cx, cy, pop * (fx.judge === 'perfect' ? 1.1 : 0.95), st.c1, st.c2, alpha, st.glow);
    const g2 = this.g;
    g2.save();
    g2.globalAlpha = alpha;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    if (fx.chain > 1 && fx.judge === 'perfect') {
      g2.font = 'italic 900 26px "Segoe UI",sans-serif';
      g2.fillStyle = '#fff3a8';
      g2.shadowColor = '#ff7ad9';
      g2.shadowBlur = 12;
      g2.fillText(`x${fx.chain}`, cx + 150 * pop, cy - 26);
    }
    if (fx.combo > 1 && fx.judge !== 'miss' && fx.judge !== 'early') {
      g2.font = '900 30px "Segoe UI",sans-serif';
      g2.shadowColor = 'rgba(0,0,0,0.6)';
      g2.shadowBlur = 8;
      g2.fillStyle = '#ffffff';
      g2.fillText(`${fx.combo}`, cx - 30, cy + 52);
      g2.font = 'italic 800 16px "Segoe UI",sans-serif';
      g2.fillStyle = 'rgba(255,255,255,0.8)';
      g2.textAlign = 'left';
      const w = g2.measureText(`${fx.combo}`).width;
      g2.fillText('COMBO', cx - 30 + 22 + w * 0, cy + 54);
    }
    // 早晚提示
    if (fx.dt && fx.judge !== 'perfect' && fx.judge !== 'miss') {
      g2.textAlign = 'center';
      g2.font = '700 13px "PingFang SC","Microsoft YaHei",sans-serif';
      g2.fillStyle = fx.dt < 0 ? '#7fd4ff' : '#ff9a7a';
      g2.fillText(fx.dt < 0 ? '偏早' : '偏晚', cx, cy - 40);
    }
    g2.restore();
  }

  bigText(text, x, y, scale, c1, c2, alpha = 1, glow) {
    const g = this.g;
    g.save();
    g.translate(x, y);
    g.scale(scale, scale);
    g.globalAlpha = Math.max(0, alpha);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'italic 900 64px "Segoe UI","Arial Black",sans-serif';
    const grad = g.createLinearGradient(0, -30, 0, 30);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    g.lineJoin = 'round';
    g.shadowColor = glow || c2;
    g.shadowBlur = 24;
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(20,10,40,0.85)';
    g.strokeText(text, 0, 0);
    g.shadowBlur = 0;
    g.fillStyle = grad;
    g.fillText(text, 0, 0);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.strokeText(text, 0, 0);
    g.restore();
  }

  // ---------------------------------------------------------------- 经典模式
  drawClassic(game) {
    const g = this.g;
    const W = this.W;
    const H = this.H;
    const rounds = game.chart.rounds;
    const R = game.chart.roundBeats;
    const panelW = Math.min(880, W - 32);
    const cx = W / 2;
    const beat = game.beat;
    // 当前展示回合
    let idx = game.ri;
    const r = rounds[idx];
    const shownR = r && game.roundVisible(idx, beat) ? r : null;
    // 面板底
    const py = H - 190;
    const grad = g.createLinearGradient(0, py, 0, H);
    grad.addColorStop(0, 'rgba(10,6,30,0)');
    grad.addColorStop(0.35, 'rgba(10,6,30,0.55)');
    grad.addColorStop(1, 'rgba(10,6,30,0.85)');
    g.fillStyle = grad;
    g.fillRect(0, py, W, H - py);

    // ---- 节拍条
    const bw = panelW - 140;
    const bx = cx - bw / 2;
    const by = H - 62;
    const bh = 22;
    const ref = shownR || rounds[Math.min(idx, rounds.length - 1)] || rounds[rounds.length - 1];
    const barStart = ref.hitBeat - (R - 0.5);
    let f = (beat - barStart) / R;
    const fHit = (R - 0.5) / R;
    g.save();
    rr(g, bx, by, bw, bh, bh / 2);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.stroke();
    g.clip();
    // 填充进度
    if (shownR && f > 0) {
      const fg = g.createLinearGradient(bx, 0, bx + bw, 0);
      fg.addColorStop(0, 'rgba(127,212,255,0.05)');
      fg.addColorStop(1, game.song.color + 'aa');
      g.fillStyle = fg;
      g.fillRect(bx, by, bw * Math.min(f, 1), bh);
    }
    g.restore();
    // 拍点刻度
    for (let k = 0; k < R; k++) {
      const x = bx + bw * ((k + 0.5) / R);
      const isHit = k === R - 1;
      const kb = barStart + k + 0.5;
      const near = Math.exp(-Math.abs(beat - kb) * 6);
      g.beginPath();
      g.arc(x, by + bh / 2, isHit ? 0 : 3 + near * 2, 0, Math.PI * 2);
      g.fillStyle = `rgba(255,255,255,${0.35 + near * 0.6})`;
      g.fill();
    }
    // 判定点
    const hx = bx + bw * fHit;
    const hp = Math.exp(-Math.abs(beat - ref.hitBeat) * 4);
    g.save();
    g.shadowColor = game.song.color2;
    g.shadowBlur = 18 + hp * 20;
    g.lineWidth = 3;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.arc(hx, by + bh / 2, 17 + hp * 3, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = game.song.color2;
    g.beginPath();
    g.arc(hx, by + bh / 2, 22 + hp * 5, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    g.font = '800 10px "Segoe UI",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText('SPACE', hx, by + bh / 2 + 36);
    // 光标
    if (shownR && f >= 0 && f <= 1.08) {
      const x = bx + bw * Math.min(f, 1.05);
      g.save();
      const trail = g.createLinearGradient(x - 90, 0, x, 0);
      trail.addColorStop(0, 'rgba(255,255,255,0)');
      trail.addColorStop(1, 'rgba(255,255,255,0.55)');
      g.fillStyle = trail;
      g.fillRect(x - 90, by + 3, 90, bh - 6);
      g.shadowColor = '#fff';
      g.shadowBlur = 16;
      g.fillStyle = '#ffffff';
      rr(g, x - 3, by - 8, 6, bh + 16, 3);
      g.fill();
      g.restore();
    }
    // 等级 & 回合
    g.textAlign = 'left';
    g.font = 'italic 900 26px "Segoe UI",sans-serif';
    g.fillStyle = '#fff';
    g.shadowColor = game.song.color;
    g.shadowBlur = 10;
    const lv = shownR ? shownR.level : ref.level;
    g.fillText(`Lv.${lv}`, bx - 98, by + bh / 2);
    g.shadowBlur = 0;
    g.textAlign = 'right';
    g.font = '700 12px "Segoe UI",sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText(`${Math.min(idx + 1, rounds.length)}/${rounds.length}`, bx + bw + 98, by + bh / 2);

    // ---- 箭头序列
    if (shownR) {
      const n = shownR.arrows.length;
      const size = Math.min(58, (panelW - 40) / n - 8);
      const gap = size + 10;
      const ax0 = cx - (gap * (n - 1)) / 2;
      const ay = H - 128;
      const shakeAge = (this.now - shownR.shakeT) / 1000;
      const shake = shakeAge < 0.3 ? Math.sin(shakeAge * 80) * 10 * (1 - shakeAge / 0.3) : 0;
      if (shownR.finish) {
        g.textAlign = 'center';
        g.font = 'italic 900 18px "Segoe UI",sans-serif';
        g.fillStyle = '#ffe680';
        g.shadowColor = '#ff6fd8';
        g.shadowBlur = 12;
        g.fillText('★ FINISH MOVE ★', cx, ay - size / 2 - 18);
        g.shadowBlur = 0;
      }
      // 出现动画
      shownR.appearAt = shownR.appearAt || this.now;
      const appear = Math.min(1, (this.now - shownR.appearAt) / 160);
      for (let k = 0; k < n; k++) {
        const a = shownR.arrows[k];
        const done = k < shownR.progress;
        const cur = k === shownR.progress;
        const x = ax0 + k * gap + shake;
        const delay = Math.min(1, Math.max(0, appear * 1.6 - k * 0.06));
        const y = ay + (1 - delay) * 20;
        g.save();
        g.globalAlpha = delay;
        g.translate(x, y);
        const s = size * (cur ? 1.08 : 1) * (done ? 0.92 : 1);
        // 底座
        rr(g, -s / 2, -s / 2, s, s, s * 0.24);
        let fill;
        if (done) {
          fill = g.createLinearGradient(0, -s / 2, 0, s / 2);
          fill.addColorStop(0, '#fff6b0');
          fill.addColorStop(1, '#ffae3d');
        } else if (a.rev) {
          fill = g.createLinearGradient(0, -s / 2, 0, s / 2);
          fill.addColorStop(0, '#ff8a8a');
          fill.addColorStop(1, '#c4204a');
        } else {
          fill = g.createLinearGradient(0, -s / 2, 0, s / 2);
          fill.addColorStop(0, '#9fe7ff');
          fill.addColorStop(1, '#3a6dff');
        }
        g.shadowColor = done ? '#ffcf5a' : a.rev ? '#ff4f7a' : '#4fb8ff';
        g.shadowBlur = done ? 18 : cur ? 16 : 6;
        g.fillStyle = fill;
        g.fill();
        g.shadowBlur = 0;
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.stroke();
        // 高光
        rr(g, -s / 2 + 3, -s / 2 + 3, s - 6, s * 0.38, s * 0.18);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fill();
        // 箭头（显示的是方向；反向箭头需按相反方向）
        g.rotate(ROT[a.dir]);
        arrowPath(g, s * 0.78);
        g.fillStyle = done ? '#7a3b00' : '#ffffff';
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = done ? 'rgba(255,255,255,0.4)' : 'rgba(0,30,80,0.5)';
        g.stroke();
        g.restore();
      }
      if (shownR.progress === n) {
        g.textAlign = 'center';
        g.font = '800 13px "PingFang SC","Microsoft YaHei",sans-serif';
        g.fillStyle = '#ffe680';
        g.fillText('在光标到达圆圈时按 SPACE！', cx, ay + size / 2 + 18);
      } else if (shownR.arrows.some((a) => a.rev)) {
        g.textAlign = 'center';
        g.font = '600 12px "PingFang SC","Microsoft YaHei",sans-serif';
        g.fillStyle = 'rgba(255,160,170,0.85)';
        g.fillText('红色箭头 = 反向按键', cx, ay + size / 2 + 18);
      }
    }
  }

  // ---------------------------------------------------------------- 节奏模式
  drawRhythm(game, opts) {
    const g = this.g;
    const W = this.W;
    const H = this.H;
    const t = game.t;
    const laneW = Math.min(1100, W - 40);
    const lx = (W - laneW) / 2;
    const ly = H - 132;
    const lh = 92;
    const cyL = ly + lh / 2;
    const jx = lx + 90;
    const speed = 520 * (opts.speed || 1);
    // 背板
    const bg = g.createLinearGradient(0, ly - 30, 0, H);
    bg.addColorStop(0, 'rgba(10,6,30,0)');
    bg.addColorStop(0.3, 'rgba(10,6,30,0.6)');
    bg.addColorStop(1, 'rgba(10,6,30,0.85)');
    g.fillStyle = bg;
    g.fillRect(0, ly - 30, W, H - ly + 30);
    g.save();
    rr(g, lx, ly, laneW, lh, lh / 2);
    const lg = g.createLinearGradient(lx, 0, lx + laneW, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.14)');
    lg.addColorStop(1, 'rgba(255,255,255,0.03)');
    g.fillStyle = lg;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.stroke();
    g.clip();
    // 小节线
    const spb = game.spb;
    const b0 = Math.floor(game.beat);
    for (let b = b0; b < b0 + 40; b++) {
      const bt = game.timeOf(b);
      const x = jx + (bt - t) * speed;
      if (x > lx + laneW) break;
      if (x < lx) continue;
      g.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)';
      g.fillRect(x - 1, ly + 8, 2, lh - 16);
    }
    g.restore();
    // 判定圈
    const flashSpace = Math.exp(-(this.now - game.keyFlash[4]) / 90);
    const beatPulse = Math.exp(-((game.beat % 1) + 1) % 1 * 5);
    g.save();
    g.shadowColor = game.song.color;
    g.shadowBlur = 20 + 20 * beatPulse;
    g.lineWidth = 4;
    g.strokeStyle = '#fff';
    g.beginPath();
    g.arc(jx, cyL, 36 + beatPulse * 2, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    g.lineWidth = 2;
    g.strokeStyle = game.song.color2;
    g.beginPath();
    g.arc(jx, cyL, 44, 0, Math.PI * 2);
    g.stroke();
    // 按键闪光
    for (let d = 0; d < 4; d++) {
      const fl = Math.exp(-(this.now - game.keyFlash[d]) / 110);
      if (fl < 0.02) continue;
      g.save();
      g.globalAlpha = fl;
      g.fillStyle = DIR_COLORS[d];
      g.beginPath();
      g.arc(jx, cyL, 34, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    if (flashSpace > 0.02) {
      g.save();
      g.globalAlpha = flashSpace * 0.8;
      g.fillStyle = '#ffd76e';
      g.beginPath();
      g.arc(jx, cyL, 40, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // 音符（从远到近绘制）
    const notes = game.chart.notes;
    const vis = [];
    for (let i = game.ni; i < notes.length; i++) {
      const n = notes[i];
      const x = jx + (n.t - t) * speed;
      if (x > lx + laneW + 60) break;
      vis.push([n, x]);
    }
    for (let k = vis.length - 1; k >= 0; k--) {
      const [n, x] = vis[k];
      if (n.done && n.result !== 'miss') continue;
      const missFade = n.result === 'miss' ? Math.max(0, 1 - (t - n.t - WIN.bad) * 4) : 1;
      if (missFade <= 0) continue;
      g.save();
      g.globalAlpha = missFade * (n.result === 'miss' ? 0.4 : 1);
      if (n.type === 'hold') {
        const xe = jx + (n.endT - t) * speed;
        const xs = n.holding ? jx : x;
        const hg = g.createLinearGradient(xs, 0, xe, 0);
        hg.addColorStop(0, DIR_COLORS[n.dir] + 'dd');
        hg.addColorStop(1, DIR_COLORS[n.dir] + '55');
        g.fillStyle = hg;
        rr(g, xs, cyL - 12, Math.max(0, xe - xs), 24, 12);
        g.fill();
        if (n.holding) {
          g.shadowColor = DIR_COLORS[n.dir];
          g.shadowBlur = 25;
          g.fill();
          g.shadowBlur = 0;
        }
        this.noteHead(n, n.holding ? jx : x, cyL, 0);
      } else {
        this.noteHead(n, x, cyL, 0);
      }
      g.restore();
    }
    // 按键提示
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const keys = ['←', '↓', '↑', '→', 'SPACE'];
    const kx0 = W / 2 - 150;
    for (let i = 0; i < 5; i++) {
      const fl = Math.exp(-(this.now - game.keyFlash[i]) / 120);
      const w = i === 4 ? 80 : 34;
      const x = i === 4 ? kx0 + 4 * 44 + 40 : kx0 + i * 44 + 17;
      const y = H - 22;
      rr(g, x - w / 2, y - 13, w, 26, 7);
      g.fillStyle = `rgba(255,255,255,${0.08 + fl * 0.5})`;
      g.fill();
      g.strokeStyle = i === 4 ? '#ffd76e' : DIR_COLORS[i];
      g.lineWidth = 1.5;
      g.stroke();
      g.font = i === 4 ? '800 11px "Segoe UI",sans-serif' : '800 15px "Segoe UI",sans-serif';
      g.fillStyle = '#fff';
      g.fillText(keys[i], x, y + 1);
    }
  }

  noteHead(n, x, y) {
    const g = this.g;
    if (n.type === 'space') {
      const w = 92;
      const h = 54;
      const grad = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      grad.addColorStop(0, '#fff5c4');
      grad.addColorStop(1, '#ff9d2e');
      g.shadowColor = '#ffb84a';
      g.shadowBlur = 16;
      rr(g, x - w / 2, y - h / 2, w, h, h / 2);
      g.fillStyle = grad;
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 2.5;
      g.strokeStyle = '#fff';
      g.stroke();
      g.font = 'italic 900 15px "Segoe UI",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#7a3600';
      g.fillText('SPACE', x, y + 1);
      return;
    }
    const r = 30;
    const col = DIR_COLORS[n.dir];
    const grad = g.createRadialGradient(x - 8, y - 10, 2, x, y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, col);
    grad.addColorStop(1, col);
    g.shadowColor = col;
    g.shadowBlur = 14;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 2.5;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.save();
    g.translate(x, y);
    g.rotate(ROT[n.dir]);
    arrowPath(g, 34);
    g.fillStyle = 'rgba(20,10,40,0.85)';
    g.fill();
    g.restore();
  }
}
