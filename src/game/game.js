// 游戏核心：时钟、输入判定、计分、舞蹈反馈
import { buildClassicChart, buildRhythmChart, OPP } from './chart.js';
import { MOVE_POOLS } from '../scene/dances.js';

export const WIN = { perfect: 0.045, great: 0.09, cool: 0.135, bad: 0.18 };
const BASE = { perfect: 1000, great: 700, cool: 400, bad: 150, miss: 0 };
const ACC = { perfect: 1, great: 0.85, cool: 0.6, bad: 0.25, miss: 0 };

const KEYMAP = {
  ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3,
  Numpad4: 0, Numpad2: 1, Numpad8: 2, Numpad6: 3,
  KeyA: 0, KeyS: 1, KeyW: 2, KeyD: 3,
  KeyJ: 0, KeyK: 1, KeyI: 2, KeyL: 3,
};

export function judgeOf(dt) {
  const a = Math.abs(dt);
  if (a <= WIN.perfect) return 'perfect';
  if (a <= WIN.great) return 'great';
  if (a <= WIN.cool) return 'cool';
  if (a <= WIN.bad) return 'bad';
  return null;
}

export class Game {
  constructor({ player, stage, song, meta, buffer, mode, diff, settings, onEnd }) {
    Object.assign(this, { player, stage, song, meta, buffer, mode, diff, settings, onEnd });
    this.spb = meta.spb;
    this.lead = meta.lead;
    this.stats = { perfect: 0, great: 0, cool: 0, bad: 0, miss: 0 };
    this.score = 0;
    this.shownScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.chain = 0; // 连续 Perfect
    this.fx = null; // 最近一次判定（供 HUD）
    this.keyFlash = [0, 0, 0, 0, 0];
    this.held = new Set();
    this.paused = false;
    this.ended = false;
    this.finishResult = null;
    this.events = [];
    if (mode === 'classic') {
      this.chart = buildClassicChart(song, meta, diff);
      for (const r of this.chart.rounds) {
        r.progress = 0;
        r.done = false;
        r.result = null;
        r.shakeT = -9;
      }
      this.ri = 0;
      this.totalNotes = this.chart.rounds.length;
    } else {
      this.chart = buildRhythmChart(song, meta, diff);
      for (const n of this.chart.notes) {
        n.done = false;
        n.result = null;
        n.holding = false;
        n.t = this.timeOf(n.beat);
        if (n.endBeat) n.endT = this.timeOf(n.endBeat);
      }
      this.ni = 0;
      this.totalNotes = this.chart.notes.reduce((s, n) => s + (n.type === 'hold' ? 2 : 1), 0);
      this.nextMoveBeat = 8;
    }
    this.endT = this.timeOf(meta.totalBeats) + 1.2;
    this.offset = (settings.offset || 0) / 1000;
  }

  timeOf(beat) {
    return this.lead + beat * this.spb;
  }

  beatOf(t) {
    return (t - this.lead) / this.spb;
  }

  // 当前（已补偿延迟的）歌曲时间
  now(perf) {
    return this.player.songTime(perf) - this.offset;
  }

  start() {
    this.player.play(this.buffer, 0, 0.35);
    this.startedAt = performance.now();
    for (const d of this.stage.dancers) d.ctrl.play('groove', 0, 1);
  }

  // ---------------------------------------------------------------- 输入
  keydown(e) {
    if (this.paused || this.ended) return;
    if (e.repeat) return;
    const t = this.now(e.timeStamp);
    if (e.code === 'Space') {
      this.keyFlash[4] = performance.now();
      this.held.add('space');
      if (this.mode === 'classic') this.classicSpace(t);
      else this.rhythmKey('space', t);
      return;
    }
    const dir = KEYMAP[e.code];
    if (dir === undefined) return;
    this.keyFlash[dir] = performance.now();
    this.held.add(dir);
    if (this.mode === 'classic') this.classicArrow(dir, t);
    else this.rhythmKey(dir, t);
  }

  keyup(e) {
    if (this.ended) return;
    const t = this.now(e.timeStamp);
    const k = e.code === 'Space' ? 'space' : KEYMAP[e.code];
    if (k === undefined) return;
    this.held.delete(k);
    if (this.mode === 'rhythm') this.rhythmRelease(k, t);
  }

  // ---------------------------------------------------------------- 经典模式
  currentRound() {
    return this.chart.rounds[this.ri];
  }

  roundVisible(i, beat) {
    const r = this.chart.rounds[i];
    if (!r) return false;
    if (i === 0) return beat >= r.startBeat - 2;
    return this.chart.rounds[i - 1].done;
  }

  classicArrow(dir, t) {
    const r = this.currentRound();
    if (!r || r.done || !this.roundVisible(this.ri, this.beatOf(t))) return;
    if (r.progress >= r.arrows.length) return;
    const a = r.arrows[r.progress];
    const need = a.rev ? OPP[a.dir] : a.dir;
    if (dir === need) {
      r.progress++;
      this.player.sfx(a.rev ? 'keyRev' : 'key');
      if (r.progress === r.arrows.length) this.player.sfx('click');
    } else {
      r.progress = 0;
      r.shakeT = performance.now();
      this.player.sfx('wrong');
    }
  }

  classicSpace(t) {
    const r = this.currentRound();
    if (!r || r.done) return;
    const ht = this.timeOf(r.hitBeat);
    const dt = t - ht;
    if (Math.abs(dt) > WIN.bad) {
      // 太早按空格：不判定，给出轻提示
      if (dt < 0 && dt > -this.spb * 1.5) this.fx = { judge: 'early', at: performance.now() };
      return;
    }
    let j = judgeOf(dt);
    if (r.progress < r.arrows.length) j = 'miss';
    this.resolveRound(r, j, dt);
  }

  resolveRound(r, j, dt = 0) {
    r.done = true;
    r.result = j;
    this.ri++;
    this.applyJudge(j, r.arrows.length, dt);
    const beat = this.beatOf(this.now());
    // 舞蹈反馈
    const main = this.stage.main;
    const levelTier = Math.min(3, Math.floor(((r.level - 3) / 7) * 4));
    if (r.finish) {
      if (j === 'perfect' || j === 'great' || j === 'cool') {
        this.finishResult = j;
        this.score += j === 'perfect' ? 10000 : j === 'great' ? 6000 : 3000;
        for (const d of this.stage.dancers) d.ctrl.play('finish', beat, 0.25);
        this.stage.effect('finish');
        this.player.sfx('finish');
        main.dancer.setExpression('happy', 4);
        this.fx = { ...this.fx, finish: true };
      } else {
        this.finishResult = 'fail';
        main.ctrl.play('stumble', beat, 0.3);
      }
      return;
    }
    if (j === 'miss') {
      main.ctrl.play('stumble', beat, 0.3);
      main.dancer.setExpression('sad', 1.4);
      this.pendingRecover = beat + 2;
    } else {
      const pool = MOVE_POOLS[j === 'bad' ? 0 : Math.max(0, levelTier)];
      const name = j === 'bad' ? 'groove' : pool[Math.floor(Math.random() * pool.length)];
      main.ctrl.play(name, beat, 0.5);
      if (j === 'perfect') main.dancer.setExpression('happy', 1.2);
      // 伴舞：Perfect/Great 时同步动作
      this.stage.dancers.forEach((d, i) => {
        if (i === 0) return;
        d.ctrl.play(j === 'perfect' || j === 'great' ? name : 'groove', beat, 0.6);
      });
    }
  }

  // ---------------------------------------------------------------- 节奏模式
  rhythmKey(k, t) {
    const notes = this.chart.notes;
    let best = null;
    for (let i = this.ni; i < notes.length; i++) {
      const n = notes[i];
      if (n.t - t > WIN.bad) break;
      if (n.done || n.holding) continue;
      const match = k === 'space' ? n.type === 'space' : n.type !== 'space' && n.dir === k;
      if (!match) continue;
      if (Math.abs(n.t - t) <= WIN.bad) {
        best = n;
        break;
      }
    }
    if (!best) {
      this.player.sfx('tap');
      return;
    }
    const dt = t - best.t;
    const j = judgeOf(dt);
    if (best.type === 'hold') {
      best.holding = true;
      best.headResult = j;
      this.applyJudge(j, 1, dt);
    } else {
      best.done = true;
      best.result = j;
      this.applyJudge(j, 1, dt);
    }
    best.hitAt = performance.now();
  }

  rhythmRelease(k, t) {
    for (let i = this.ni; i < this.chart.notes.length; i++) {
      const n = this.chart.notes[i];
      if (n.t > t + 1) break;
      if (n.holding && n.dir === k && n.type === 'hold') {
        n.holding = false;
        n.done = true;
        const early = n.endT - t;
        const j = early <= 0.12 ? 'perfect' : early <= 0.25 ? 'great' : 'miss';
        n.result = j;
        this.applyJudge(j, 1, 0, true);
      }
    }
  }

  // ---------------------------------------------------------------- 共通
  applyJudge(j, weight = 1, dt = 0, silent = false) {
    this.stats[j]++;
    if (j === 'miss' || j === 'bad') {
      if (j === 'miss') this.combo = 0;
      this.chain = 0;
    }
    if (j !== 'miss') {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    if (j === 'perfect') this.chain++;
    else this.chain = 0;
    const mult = this.mode === 'classic' ? 1 + 0.1 * weight : 1;
    const comboMul = 1 + Math.min(this.combo, 100) * 0.01;
    const chainMul = j === 'perfect' ? 1 + Math.min(this.chain - 1, 10) * 0.05 : 1;
    this.score += Math.round(BASE[j] * mult * comboMul * chainMul);
    this.fx = { judge: j, at: performance.now(), combo: this.combo, chain: this.chain, dt };
    if (!silent) this.player.sfx(j);
    if (['perfect', 'great', 'cool'].includes(j)) this.stage.effect(j);
    if (this.mode === 'rhythm' && j === 'miss') {
      const beat = this.beatOf(this.now());
      if (!this.stumbling) {
        this.stage.main.ctrl.play('stumble', beat, 0.25);
        this.stage.main.dancer.setExpression('sad', 1);
        this.pendingRecover = beat + 1.5;
      }
    }
    if (this.combo > 0 && this.combo % 50 === 0) this.stage.effect('confetti');
  }

  update() {
    const t = this.now();
    const beat = this.beatOf(t);
    this.t = t;
    this.beat = beat;
    if (this.paused) return;
    // 分数滚动
    this.shownScore += (this.score - this.shownScore) * 0.2;
    if (Math.abs(this.score - this.shownScore) < 1) this.shownScore = this.score;

    if (this.pendingRecover && beat >= this.pendingRecover) {
      this.pendingRecover = null;
      this.stage.main.ctrl.play('groove', beat, 0.6);
    }

    if (this.mode === 'classic') {
      const r = this.currentRound();
      if (r && !r.done && t > this.timeOf(r.hitBeat) + WIN.bad) this.resolveRound(r, 'miss');
      // 终结之后：欢呼
      if (!r && this.finishResult && !this.cheered && beat > this.chart.rounds[this.chart.rounds.length - 1].hitBeat + 4) {
        this.cheered = true;
        const good = this.finishResult !== 'fail';
        this.stage.dancers.forEach((d) => d.ctrl.play(good ? 'cheer' : 'groove', beat, 0.6));
      }
    } else {
      const notes = this.chart.notes;
      while (this.ni < notes.length && notes[this.ni].done) this.ni++;
      for (let i = this.ni; i < notes.length; i++) {
        const n = notes[i];
        if (n.t > t) break;
        if (n.holding) {
          if (t >= n.endT) {
            n.holding = false;
            n.done = true;
            n.result = 'perfect';
            this.applyJudge('perfect', 1, 0, true);
          }
          continue;
        }
        if (!n.done && t > n.t + WIN.bad) {
          n.done = true;
          n.result = 'miss';
          this.applyJudge('miss');
          if (n.type === 'hold') this.applyJudge('miss', 1, 0, true);
        }
      }
      // 舞蹈：每两小节换动作
      if (beat >= this.nextMoveBeat && !this.pendingRecover) {
        this.nextMoveBeat += 8;
        const tier = this.combo < 10 ? 0 : this.combo < 30 ? 1 : this.combo < 60 ? 2 : 3;
        const pool = MOVE_POOLS[tier];
        const name = pool[Math.floor(Math.random() * pool.length)];
        this.stage.dancers.forEach((d, i) => d.ctrl.play(i === 0 || tier >= 2 ? name : 'groove', beat, 0.6));
      }
      if (beat > this.meta.totalBeats - 4 && !this.cheered) {
        this.cheered = true;
        this.stage.dancers.forEach((d) => d.ctrl.play('finish', beat, 0.4));
        if (this.stats.miss === 0) this.stage.effect('finish');
      }
    }
    if (t > this.endT && !this.ended) this.end();
  }

  results() {
    const s = this.stats;
    const total = s.perfect + s.great + s.cool + s.bad + s.miss;
    const acc = total ? (s.perfect * ACC.perfect + s.great * ACC.great + s.cool * ACC.cool + s.bad * ACC.bad) / total : 0;
    let grade = 'D';
    if (total && s.perfect === total) grade = 'SS';
    else if (acc >= 0.93) grade = 'S';
    else if (acc >= 0.85) grade = 'A';
    else if (acc >= 0.72) grade = 'B';
    else if (acc >= 0.55) grade = 'C';
    return { stats: { ...s }, total, acc, grade, score: this.score, maxCombo: this.maxCombo, full: s.miss === 0 && total > 0, finish: this.finishResult };
  }

  end() {
    this.ended = true;
    this.player.fadeOut(1.2);
    this.onEnd && this.onEnd(this.results());
  }

  async pause() {
    if (this.ended) return;
    this.paused = true;
    await this.player.pause();
  }

  async resume() {
    this.paused = false;
    await this.player.resume();
  }

  quit() {
    this.ended = true;
    this.player.stop();
  }
}
