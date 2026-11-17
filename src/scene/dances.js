// 舞蹈动作库：每个动作是 (拍内时间 b, 能量 e) -> 姿态 的函数，跟随节拍
const { sin, cos, PI, max, min, abs, exp, floor } = Math;
const TAU = PI * 2;

const clamp01 = (x) => max(0, min(1, x));
const smooth = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const frac = (x) => x - floor(x);
// 击拍：拍点瞬间达到峰值后衰减
const hit = (b, k = 7) => exp(-frac(b) * k);
// 拍点下沉
const bounce = (b, a) => -a * (0.5 + 0.5 * cos(TAU * b));
// 分段平滑插值：keys = [[t, v], ...]
function keys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 0; i < ks.length - 1; i++) {
    const [t0, v0] = ks[i];
    const [t1, v1] = ks[i + 1];
    if (t <= t1) {
      const u = smooth((t - t0) / (t1 - t0));
      if (Array.isArray(v0)) return v0.map((x, k) => x + (v1[k] - x) * u);
      return v0 + (v1 - v0) * u;
    }
  }
  return ks[ks.length - 1][1];
}

export function basePose() {
  return {
    root: { x: 0, z: 0, ry: 0 },
    hips: { x: 0, y: -0.015, z: 0, rx: 0, ry: 0, rz: 0 },
    spine: [0.02, 0, 0],
    chest: [0.0, 0, 0],
    neck: [0.0, 0, 0],
    head: [0.02, 0, 0],
    armL: { sh: [0, 0, 0], up: [0.05, 0, 0.14], lo: [-0.2, 0, 0], hand: [0, 0, 0] },
    armR: { sh: [0, 0, 0], up: [0.05, 0, -0.14], lo: [-0.2, 0, 0], hand: [0, 0, 0] },
    footL: { x: 0.095, y: 0, z: 0.0, ry: 0.12, rx: 0 },
    footR: { x: -0.095, y: 0, z: 0.0, ry: -0.12, rx: 0 },
    kneeOut: 0.12,
  };
}

// 以左臂约定书写，右臂自动镜像
const mir = (v) => [v[0], -v[1], -v[2]];
function setArm(P, side, up, lo, hand = [0, 0, 0], sh = [0, 0, 0]) {
  const a = side === 'L' ? P.armL : P.armR;
  const f = side === 'L' ? (x) => x : mir;
  a.up = f(up);
  a.lo = f(lo);
  a.hand = f(hand);
  a.sh = f(sh);
}
function foot(P, side, x, y, z, ry = 0, rx = 0) {
  const f = side === 'L' ? P.footL : P.footR;
  const s = side === 'L' ? 1 : -1;
  f.x = s * x;
  f.y = y;
  f.z = z;
  f.ry = s * ry;
  f.rx = rx;
}

export function mirrorPose(P) {
  const Q = JSON.parse(JSON.stringify(P));
  Q.root.x = -P.root.x;
  Q.root.ry = -P.root.ry;
  Q.hips.x = -P.hips.x;
  Q.hips.ry = -P.hips.ry;
  Q.hips.rz = -P.hips.rz;
  for (const k of ['spine', 'chest', 'neck', 'head']) Q[k] = mir(P[k]);
  const swapArm = (a) => ({ sh: mir(a.sh), up: mir(a.up), lo: mir(a.lo), hand: mir(a.hand) });
  Q.armL = swapArm(P.armR);
  Q.armR = swapArm(P.armL);
  const swapFoot = (f) => ({ x: -f.x, y: f.y, z: f.z, ry: -f.ry, rx: f.rx });
  Q.footL = swapFoot(P.footR);
  Q.footR = swapFoot(P.footL);
  return Q;
}

export function lerpPose(A, B, t) {
  const L = (a, b) => {
    if (typeof a === 'number') return a + (b - a) * t;
    if (Array.isArray(a)) return a.map((x, i) => x + (b[i] - x) * t);
    const o = {};
    for (const k in a) o[k] = L(a[k], b[k]);
    return o;
  };
  const out = L(A, B);
  // 根旋转走最短路径
  let d = B.root.ry - A.root.ry;
  d = ((d + PI) % TAU + TAU) % TAU - PI;
  out.root.ry = A.root.ry + d * t;
  return out;
}

// ------------------------------------------------------------ 动作
export const MOVES = {
  // 待机律动
  idle(b, e = 0.5) {
    const P = basePose();
    const sway = sin(PI * b * 0.5);
    P.hips.y += bounce(b, 0.012 + 0.01 * e);
    P.hips.x = 0.02 * sway;
    P.hips.rz = 0.04 * sway;
    P.spine[2] = -0.03 * sway;
    P.chest[0] = 0.02 * sin(TAU * b);
    P.head = [0.04 * hit(b, 5), 0.05 * sin(PI * b * 0.25), -0.04 * sway];
    setArm(P, 'L', [0.05 + 0.05 * sway, 0, 0.16], [-0.25, 0, 0]);
    setArm(P, 'R', [0.05 - 0.05 * sway, 0, 0.16], [-0.25, 0, 0]);
    foot(P, 'L', 0.1, 0, 0.0, 0.15);
    foot(P, 'R', 0.1, 0, 0.0, 0.15);
    return P;
  },

  groove(b, e = 0.7) {
    const P = basePose();
    const sw = sin(PI * b);
    P.hips.y += bounce(b, 0.035 + 0.025 * e);
    P.hips.x = 0.03 * sw;
    P.hips.rz = 0.07 * sw;
    P.hips.ry = 0.08 * sw;
    P.spine = [0.06, -0.05 * sw, -0.05 * sw];
    P.chest = [0.05 * hit(b, 6), 0, 0];
    P.head = [0.1 * hit(b, 6) - 0.02, 0.06 * sw, 0.06 * sw];
    setArm(P, 'L', [-0.3 + 0.35 * sw, 0, 0.22], [-1.2 - 0.3 * sw, 0, 0.1], [0, 0, 0.2]);
    setArm(P, 'R', [-0.3 - 0.35 * sw, 0, 0.22], [-1.2 + 0.3 * sw, 0, 0.1], [0, 0, 0.2]);
    // 交替抬脚跟
    foot(P, 'L', 0.12, 0.02 * max(0, sw), 0.0, 0.2, -0.3 * max(0, sw));
    foot(P, 'R', 0.12, 0.02 * max(0, -sw), 0.0, 0.2, -0.3 * max(0, -sw));
    return P;
  },

  sidestep(b, e = 0.7) {
    const P = basePose();
    const ph = b % 4;
    // 身体左右移动
    const shift = keys(ph, [[0, 0], [0.5, 0.14], [1.5, 0.14], [2, 0], [2.5, -0.14], [3.5, -0.14], [4, 0]]);
    const liftL = ph < 0.5 ? sin(PI * ph * 2) : ph > 1.5 && ph < 2 ? sin(PI * (ph - 1.5) * 2) : 0;
    const liftR = ph > 2 && ph < 2.5 ? sin(PI * (ph - 2) * 2) : ph > 3.5 ? sin(PI * (ph - 3.5) * 2) : 0;
    const out = 0.28;
    const lx = keys(ph, [[0, 0.1], [0.5, out], [1.5, out], [2, 0.1]]);
    const rx = keys(ph, [[2, 0.1], [2.5, out], [3.5, out], [4, 0.1]]);
    P.hips.x = shift;
    P.hips.y += bounce(b, 0.05) - 0.02;
    P.hips.rz = -shift * 0.6;
    P.spine = [0.05, 0, shift * 0.5];
    P.head = [0.08 * hit(b), 0, shift * 0.4];
    foot(P, 'L', lx, 0.06 * liftL, 0, 0.2);
    foot(P, 'R', rx, 0.06 * liftR, 0, 0.2);
    // 手臂：拍手
    const clap = hit(b + 0.5, 9);
    const k = frac(b) > 0.5 ? 1 : 0;
    setArm(P, 'L', [-0.9 - 0.2 * k, 0, 0.35 - 0.2 * clap], [-1.0, 0, -0.3 - 0.4 * clap], [0, 0, 0]);
    setArm(P, 'R', [-0.9 - 0.2 * k, 0, 0.35 - 0.2 * clap], [-1.0, 0, -0.3 - 0.4 * clap], [0, 0, 0]);
    return P;
  },

  point(b, e = 0.8) {
    const P = basePose();
    const ph = b % 2;
    const up = keys(ph, [[0, 0], [0.25, 1], [0.9, 1], [1.15, 0], [1.9, 0], [2, 0]]);
    P.hips.y += bounce(b, 0.04) - 0.02;
    P.hips.x = 0.05 * (up - 0.5);
    P.hips.rz = -0.12 * (up - 0.5) * 2;
    P.hips.ry = 0.12 * (up - 0.5) * 2;
    P.spine = [0.03, -0.1 * up, 0.08 * (up - 0.5)];
    P.head = [-0.1 * up + 0.05, -0.2 * up + 0.1, 0.05];
    // 右手指天 / 指地
    setArm(P, 'R', [-0.3 * up - 0.3, 0, 0.6 + 1.9 * up], [-0.15, 0, 0], [0, 0, 0.1]);
    // 左手叉腰
    setArm(P, 'L', [0.35, 0, 0.6], [0.2, 0.0, -1.7], [0, 0, 0.3]);
    foot(P, 'L', 0.12, 0, 0.02, 0.25);
    foot(P, 'R', 0.15 + 0.06 * (1 - up), 0.03 * (1 - up), 0.08 * (1 - up), 0.4, -0.4 * (1 - up));
    return P;
  },

  wave(b, e = 0.8) {
    const P = basePose();
    const w = PI * b;
    P.hips.y += bounce(b, 0.03) - 0.02;
    P.hips.x = 0.05 * sin(w);
    P.hips.rz = 0.06 * sin(w - 1.2);
    P.spine = [0.05, 0, 0.08 * sin(w - 0.6)];
    P.chest = [0, 0, 0.08 * sin(w - 0.3)];
    P.head = [0.0, 0, 0.12 * sin(w + 0.3)];
    // 手臂波浪：右手 -> 肩 -> 左手
    const arm = (side, ph) => {
      setArm(P, side, [-0.15, 0, 1.45 + 0.28 * sin(w + ph)], [0, 0, 0.55 * sin(w + ph - 0.9)], [0, 0, 0.7 * sin(w + ph - 1.8)], [0, 0, 0.15 * sin(w + ph + 0.6)]);
    };
    arm('R', 0);
    arm('L', PI + 1.5);
    foot(P, 'L', 0.16, 0, 0, 0.2);
    foot(P, 'R', 0.16, 0, 0, 0.2);
    return P;
  },

  runningman(b, e = 1) {
    const P = basePose();
    const ph = frac(b * 0.5) * 2; // 两拍一个循环
    const side = ph < 1 ? 1 : -1;
    const t = frac(ph);
    // 一脚抬膝，另一脚后滑
    const lift = sin(PI * t);
    const front = (side > 0 ? 'L' : 'R');
    const back = (side > 0 ? 'R' : 'L');
    P.hips.y += -0.06 + 0.03 * lift;
    P.hips.rx = 0.08;
    P.spine = [0.1, 0.1 * side, 0];
    P.head = [0.05 + 0.05 * hit(b), -0.1 * side, 0];
    foot(P, front, 0.1, 0.22 * lift, 0.18 * lift - 0.05 * (1 - lift), 0.1, -0.2 * lift);
    foot(P, back, 0.1, 0.02 * (1 - lift), -0.15 * lift + 0.12 * (1 - lift), 0.1, 0.4 * lift);
    // 手臂摆动
    setArm(P, front === 'L' ? 'R' : 'L', [-1.0 * lift - 0.2, 0, 0.2], [-1.5, 0, 0], [0, 0, 0]);
    setArm(P, front === 'L' ? 'L' : 'R', [0.5 * lift, 0, 0.2], [-1.4, 0, 0], [0, 0, 0]);
    return P;
  },

  spin(b, e = 1) {
    const P = basePose();
    const ph = b % 4;
    const turn = keys(ph, [[0, 0], [1.6, 1], [4, 1]]);
    P.root.ry = turn * TAU;
    const raise = keys(ph, [[0, 0], [0.4, 1], [1.4, 1], [2, 0.3], [4, 0.3]]);
    P.hips.y += -0.03 - 0.03 * (1 - raise) + bounce(b, ph > 2 ? 0.04 : 0);
    // 旋转时踮脚
    const tip = keys(ph, [[0, 0], [0.3, 1], [1.5, 1], [1.8, 0]]);
    foot(P, 'L', 0.05, 0.02 * tip, 0, 0.1, -0.5 * tip);
    foot(P, 'R', 0.05 + 0.08 * (1 - tip), 0.12 * tip, 0.03, 0.1, -0.6 * tip);
    P.hips.y += 0.025 * tip;
    setArm(P, 'L', [-0.2, 0, 0.8 + 1.9 * raise], [0, 0, 0.5 * raise], [0, 0, 0.2]);
    setArm(P, 'R', [-0.2, 0, 0.8 + 1.9 * raise], [0, 0, 0.5 * raise], [0, 0, 0.2]);
    P.head = [-0.15 * raise, 0, 0];
    if (ph > 2) {
      // 定格 pose：左手指向前方
      const k = smooth((ph - 2) * 2);
      setArm(P, 'L', [-1.2 * k, 0.4 * k, 0.4 + 0.6 * (1 - k)], [-0.1, 0, 0], [0, 0, 0]);
      setArm(P, 'R', [0.3 * k, 0, 0.6], [0.2, 0, -1.7 * k], [0, 0, 0.3]);
      P.hips.rz = 0.08 * k;
      P.hips.x = 0.03 * k;
      P.head = [0.05 * k, 0.15 * k, -0.08 * k];
    }
    return P;
  },

  jumpclap(b, e = 1) {
    const P = basePose();
    const ph = frac(b * 0.5) * 2;
    // 第0拍起跳，第1拍拍手
    const jt = ph < 0.7 ? ph / 0.7 : 1;
    const air = ph < 0.7 ? sin(PI * jt) : 0;
    const crouch = ph < 0.08 ? 1 - ph / 0.08 : ph > 1.75 ? (ph - 1.75) / 0.25 : ph > 0.7 && ph < 0.95 ? sin(PI * (ph - 0.7) / 0.25) : 0;
    P.hips.y += 0.17 * air - 0.12 * crouch;
    const fy = 0.17 * air;
    foot(P, 'L', 0.14 + 0.04 * air, fy * 0.9, 0, 0.2, -0.4 * air);
    foot(P, 'R', 0.14 + 0.04 * air, fy * 0.9, 0, 0.2, -0.4 * air);
    P.spine = [0.1 * crouch - 0.08 * air, 0, 0];
    P.head = [-0.15 * air + 0.1 * crouch, 0, 0];
    const clap = hit(b - 1 + 2, 8) * (ph >= 1 ? 1 : 0);
    const raise = keys(ph, [[0, 0.3], [0.35, 1], [1.2, 1], [2, 0.3]]);
    setArm(P, 'L', [-0.2, 0, 0.6 + 2.2 * raise], [0, 0, 0.3 - 0.4 * clap], [0, 0, 0]);
    setArm(P, 'R', [-0.2, 0, 0.6 + 2.2 * raise], [0, 0, 0.3 - 0.4 * clap], [0, 0, 0]);
    P.kneeOut = 0.25;
    return P;
  },

  robot(b, e = 0.8) {
    const P = basePose();
    const step = floor(b * 2) % 8;
    const t = smooth(frac(b * 2) * 4); // 快速到位后停住
    const poses = [
      { L: [[0, 0, 1.57], [0, 0, 1.57]], R: [[0, 0, 0.2], [-1.57, 0, 0]], h: [0, 0.4, 0] },
      { L: [[0, 0, 0.2], [-1.57, 0, 0]], R: [[0, 0, 1.57], [0, 0, 1.57]], h: [0, -0.4, 0] },
      { L: [[-1.57, 0, 0], [0, 0, 0]], R: [[-1.57, 0, 0], [0, 0, 0]], h: [0.1, 0, 0] },
      { L: [[0, 0, 1.57], [0, 0, -1.57]], R: [[0, 0, 1.57], [0, 0, -1.57]], h: [0, 0, 0.2] },
      { L: [[0, 0, 1.57], [0, 0, 0]], R: [[0, 0, 1.57], [0, 0, 0]], h: [0, 0, -0.2] },
      { L: [[-1.57, 0, 0.3], [-1.57, 0, 0]], R: [[0, 0, 0.2], [0, 0, 0]], h: [0, 0.3, 0] },
      { L: [[0, 0, 0.2], [0, 0, 0]], R: [[-1.57, 0, 0.3], [-1.57, 0, 0]], h: [0, -0.3, 0] },
      { L: [[0, 0, 2.8], [0, 0, 0]], R: [[0, 0, 2.8], [0, 0, 0]], h: [-0.1, 0, 0] },
    ];
    const A = poses[(step + 7) % 8];
    const B = poses[step];
    const l = (x, y) => x.map((v, i) => v + (y[i] - v) * t);
    setArm(P, 'L', l(A.L[0], B.L[0]), l(A.L[1], B.L[1]));
    setArm(P, 'R', l(A.R[0], B.R[0]), l(A.R[1], B.R[1]));
    P.head = l(A.h, B.h);
    P.hips.y += -0.04 - 0.02 * hit(b * 2, 10);
    P.hips.ry = 0.15 * (step % 2 ? 1 : -1) * t;
    foot(P, 'L', 0.15, 0, 0, 0.0);
    foot(P, 'R', 0.15, 0, 0, 0.0);
    return P;
  },

  hiproll(b, e = 0.8) {
    const P = basePose();
    const w = (TAU * b) / 2;
    P.hips.x = 0.07 * cos(w);
    P.hips.z = 0.04 * sin(w);
    P.hips.rz = -0.14 * cos(w);
    P.hips.rx = 0.08 * sin(w);
    P.hips.y += -0.05;
    P.spine = [0.02, 0, 0.12 * cos(w)];
    P.chest = [0, 0, 0.06 * cos(w)];
    P.head = [0.05, 0.1 * sin(w), -0.08 * cos(w)];
    // 一只手叉腰，一只手扶后脑
    setArm(P, 'L', [0.35, 0, 0.6], [0.2, 0, -1.7], [0, 0, 0.3]);
    setArm(P, 'R', [-0.6, 0, 2.4], [-0.2, 0, 1.9], [0, 0, 0.5]);
    foot(P, 'L', 0.17, 0, 0.0, 0.25);
    foot(P, 'R', 0.17, 0, 0.03, 0.25);
    P.kneeOut = 0.2;
    return P;
  },

  kick(b, e = 0.9) {
    const P = basePose();
    const ph = b % 2;
    const side = ph < 1 ? 'L' : 'R';
    const other = side === 'L' ? 'R' : 'L';
    const t = frac(ph);
    const k = t < 0.5 ? sin(PI * t * 2) : 0;
    const prep = t > 0.75 ? sin(PI * (t - 0.75) * 4) : 0;
    P.hips.y += -0.04 + 0.02 * k - 0.03 * prep;
    P.hips.rx = -0.1 * k;
    P.spine = [-0.06 * k, 0, 0];
    foot(P, side, 0.1, 0.32 * k, 0.4 * k, 0.1, 0.7 * k);
    foot(P, other, 0.1, 0, -0.02, 0.2);
    setArm(P, side, [0.3 * k, 0, 0.5 + 0.6 * k], [-0.4, 0, 0]);
    setArm(P, other, [-0.6 * k - 0.2, 0, 0.5 + 0.8 * k], [-0.4, 0, 0]);
    P.head = [0.08 * hit(b), 0, 0];
    return P;
  },

  heart(b, e = 0.7) {
    const P = basePose();
    const sw = sin(PI * b * 0.5);
    P.hips.x = 0.06 * sw;
    P.hips.rz = 0.1 * sw;
    P.hips.y += bounce(b, 0.03) - 0.02;
    P.spine = [0.02, 0, -0.08 * sw];
    P.chest = [0, 0, -0.04 * sw];
    P.head = [0.05, 0, 0.18 * sw];
    // 双手头顶比心
    setArm(P, 'L', [-0.35, 0, 2.55], [-0.2, 0, 1.35], [0, 0, 0.6]);
    setArm(P, 'R', [-0.35, 0, 2.55], [-0.2, 0, 1.35], [0, 0, 0.6]);
    foot(P, 'L', 0.1, 0.03 * max(0, -sw), 0.02, 0.25, -0.4 * max(0, -sw));
    foot(P, 'R', 0.1, 0.03 * max(0, sw), 0.02, 0.25, -0.4 * max(0, sw));
    return P;
  },

  shuffle(b, e = 0.9) {
    const P = basePose();
    const t = frac(b * 2);
    const s = floor(b * 2) % 2 ? 1 : -1;
    // 脚尖脚跟交替外旋
    const twist = s * 0.55;
    foot(P, 'L', 0.1 + 0.05 * s, 0.03 * sin(PI * t), 0.05 * s, twist, 0);
    foot(P, 'R', 0.1 - 0.05 * s, 0.03 * sin(PI * t), -0.05 * s, -twist, 0);
    P.hips.y += -0.06 + bounce(b * 2, 0.02);
    P.hips.ry = -0.1 * s;
    P.spine = [0.12, 0.1 * s, 0];
    P.head = [0.05 + 0.08 * hit(b * 2), -0.1 * s, 0];
    setArm(P, 'L', [-0.9, 0, 0.5 + 0.15 * s], [-1.2, 0, 0], [0, 0, 0]);
    setArm(P, 'R', [-0.9, 0, 0.5 - 0.15 * s], [-1.2, 0, 0], [0, 0, 0]);
    P.kneeOut = 0.25;
    return P;
  },

  bodyroll(b, e = 0.8) {
    const P = basePose();
    const w = PI * b;
    // 胸 -> 腹 -> 胯 的波浪
    P.chest = [0.25 * sin(w), 0, 0];
    P.spine = [0.2 * sin(w - 0.8), 0, 0];
    P.hips.rx = -0.18 * sin(w - 1.6);
    P.hips.z = 0.05 * sin(w - 1.6);
    P.hips.y += -0.06 + 0.04 * sin(w - 1.2);
    P.head = [-0.2 * sin(w + 0.5), 0, 0];
    setArm(P, 'L', [-0.6 + 0.4 * sin(w), 0, 0.3], [-1.6, 0, 0], [0.4 * sin(w - 1), 0, 0]);
    setArm(P, 'R', [-0.6 + 0.4 * sin(w), 0, 0.3], [-1.6, 0, 0], [0.4 * sin(w - 1), 0, 0]);
    foot(P, 'L', 0.16, 0, 0, 0.25);
    foot(P, 'R', 0.16, 0, 0.05, 0.25);
    P.kneeOut = 0.22;
    return P;
  },

  stumble(b) {
    const P = basePose();
    const t = clamp01(b / 1.5);
    const w = sin(PI * clamp01(b / 2));
    P.hips.z = -0.06 * w;
    P.hips.rx = -0.12 * w;
    P.hips.y += -0.05 * w;
    P.spine = [-0.1 * w, 0, 0.1 * w];
    P.head = [0.25 * w, 0.2 * w, 0.1 * w];
    setArm(P, 'L', [-0.4 * w, 0, 0.3 + 1.0 * w * (0.7 + 0.3 * sin(b * 18))], [-0.6, 0, 0.5 * w]);
    setArm(P, 'R', [-0.6 * w, 0, 0.3 + 0.8 * w * (0.7 + 0.3 * cos(b * 16))], [-0.6, 0, 0.4 * w]);
    foot(P, 'L', 0.1, 0, 0, 0.1);
    foot(P, 'R', 0.1 + 0.05 * w, 0.06 * sin(PI * t), -0.1 * w, 0.1);
    return P;
  },

  finish(b) {
    const P = basePose();
    const ph = min(b, 4);
    const turn = keys(ph, [[0, 0], [1.2, 1]]);
    P.root.ry = turn * TAU;
    const raise = keys(ph, [[0, 0], [0.3, 1], [1.2, 1], [1.6, 0]]);
    setArm(P, 'L', [-0.2, 0, 0.5 + 2.2 * raise], [0, 0, 0.3], [0, 0, 0]);
    setArm(P, 'R', [-0.2, 0, 0.5 + 2.2 * raise], [0, 0, 0.3], [0, 0, 0]);
    foot(P, 'L', 0.06, 0.02 * raise, 0, 0.1, -0.5 * raise);
    foot(P, 'R', 0.06, 0.1 * raise, 0.02, 0.1, -0.5 * raise);
    P.hips.y += 0.02 * raise;
    if (ph > 1.2) {
      const k = smooth((ph - 1.2) / 0.5);
      // 定格：右手高举指天，左手叉腰，交叉步
      setArm(P, 'R', [-0.4 * k, 0, 0.5 + 2.3 * k], [-0.1, 0, 0.1], [0, 0, 0]);
      setArm(P, 'L', [0.35 * k, 0, 0.5 + 0.1 * k], [0.2 * k, 0, -1.7 * k], [0, 0, 0.3]);
      foot(P, 'L', 0.1, 0, 0.0, 0.3);
      foot(P, 'R', 0.02 + 0.08 * (1 - k), 0.0, 0.12 * k, -0.2 * k, -0.6 * k);
      P.hips.rz = 0.1 * k;
      P.hips.x = 0.04 * k;
      P.hips.y += -0.03 * k;
      P.spine = [0, 0.1 * k, -0.06 * k];
      P.head = [-0.1 * k, 0.25 * k, -0.1 * k];
    }
    return P;
  },

  cheer(b) {
    const P = basePose();
    const ph = frac(b * 0.5) * 2;
    const air = ph < 0.6 ? sin(PI * ph / 0.6) : 0;
    P.hips.y += 0.12 * air;
    foot(P, 'L', 0.12, 0.12 * air, 0, 0.2, -0.5 * air);
    foot(P, 'R', 0.12, 0.12 * air, 0, 0.2, -0.5 * air);
    setArm(P, 'L', [-0.2, 0, 2.5 + 0.2 * air], [0, 0, 0.2]);
    setArm(P, 'R', [-0.2, 0, 2.5 + 0.2 * air], [0, 0, 0.2]);
    P.head = [-0.15, 0, 0];
    return P;
  },

  sad(b) {
    const P = basePose();
    P.hips.y += -0.02;
    P.spine = [0.15, 0, 0];
    P.chest = [0.1, 0, 0];
    P.head = [0.35, 0, 0.05 * sin(b)];
    setArm(P, 'L', [0.1, 0, 0.08], [-0.1, 0, 0]);
    setArm(P, 'R', [0.1, 0, 0.08], [-0.1, 0, 0]);
    return P;
  },
};

// 按难度等级划分的动作池
export const MOVE_POOLS = [
  ['groove', 'sidestep', 'heart'],
  ['sidestep', 'point', 'wave', 'heart', 'kick', 'bodyroll'],
  ['point', 'wave', 'robot', 'kick', 'shuffle', 'hiproll', 'bodyroll'],
  ['runningman', 'jumpclap', 'spin', 'shuffle', 'robot', 'hiproll', 'wave'],
];

// 舞蹈控制器：在小节边界切换动作，动作之间平滑过渡
export class DanceController {
  constructor(dancer, { mirror = false, phase = 0 } = {}) {
    this.dancer = dancer;
    this.mirror = mirror;
    this.phase = phase;
    this.move = 'idle';
    this.moveStart = 0;
    this.prev = null;
    this.prevStart = 0;
    this.blendStart = -99;
    this.blendLen = 0.5;
    this.queue = null;
    this.energy = 0.6;
    this.lastPose = null;
  }

  // 立即（或从指定拍开始）切换动作
  play(name, beat, blend = 0.45) {
    if (name === this.move && !['spin', 'finish', 'stumble', 'jumpclap'].includes(name)) return;
    this.prev = this.move;
    this.prevStart = this.moveStart;
    this.move = name;
    this.moveStart = beat;
    this.blendStart = beat;
    this.blendLen = blend;
  }

  update(beat, dt) {
    let P = this.eval(this.move, beat - this.moveStart, beat);
    const bt = (beat - this.blendStart) / this.blendLen;
    if (this.prev && bt < 1 && bt >= 0) {
      const A = this.eval(this.prev, beat - this.prevStart, beat);
      P = lerpPose(A, P, smooth(bt));
    }
    if (this.mirror) P = mirrorPose(P);
    this.dancer.applyPose(P);
    this.dancer.update(dt);
  }

  eval(name, local, beat) {
    const f = MOVES[name] || MOVES.groove;
    // 大部分动作跟随绝对节拍，保证与音乐对齐
    const loopMoves = ['idle', 'groove', 'wave', 'robot', 'hiproll', 'shuffle', 'bodyroll', 'heart', 'point', 'kick', 'sidestep', 'runningman', 'jumpclap'];
    const t = loopMoves.includes(name) ? beat + this.phase : local;
    return f(t, this.energy);
  }
}
