// 程序化建模的舞者：骨骼层级 + 车削曲面身体 + 发丝 + 服装 + 手绘脸部贴图 + 腿部 IK
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- 几何工具
function smoothProfile(pts, n = 48) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getPoints(n).map((p) => new THREE.Vector2(Math.max(0.0001, p.x), p.y));
}

// 两端圆头、可带肌肉鼓包的锥形肢体，沿 -Y 方向
function limbGeo(len, r0, r1, bulge = 0, bulgeAt = 0.35, radial = 24, zScale = 1) {
  const pts = [];
  const capN = 8;
  for (let i = 0; i <= capN; i++) {
    const a = (i / capN) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.sin(a)), -len - r1 * Math.cos(a) * 0.9));
  }
  const n = 22;
  for (let i = n - 1; i >= 1; i--) {
    const t = i / n;
    const r = r0 + (r1 - r0) * t + bulge * Math.exp(-Math.pow((t - bulgeAt) / 0.28, 2));
    pts.push(new THREE.Vector2(r, -len * t));
  }
  for (let i = capN; i >= 0; i--) {
    const a = (i / capN) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, r0 * Math.sin(a)), r0 * Math.cos(a) * 0.9));
  }
  const g = new THREE.LatheGeometry(pts, radial);
  if (zScale !== 1) g.scale(1, 1, zScale);
  g.computeVertexNormals();
  return g;
}

function latheGeo(profile, radial = 32, sx = 1, sz = 1, phiStart = 0, phiLen = TAU) {
  const g = new THREE.LatheGeometry(smoothProfile(profile), radial, phiStart, phiLen);
  g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

// 带锥度、扁平截面的发丝
function strandGeo(points, r0, r1, flat = 0.45, center = V(0, 0, 0), radial = 8, seg = 22, taperPow = 1.0) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [];
  const idx = [];
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    N.copy(P).sub(center);
    N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N).normalize();
    const r = r0 + (r1 - r0) * Math.pow(t, taperPow);
    // 根部稍窄，中段最宽，形成叶片状
    const shape = Math.min(1, 0.55 + t * 4);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const cx = Math.cos(a) * r * flat * shape;
      const cy = Math.sin(a) * r * shape;
      pos.push(P.x + N.x * cx + B.x * cy, P.y + N.y * cx + B.y * cy, P.z + N.z * cx + B.z * cy);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  // 尖端收口
  const tipIndex = pos.length / 3;
  const tip = curve.getPointAt(1);
  pos.push(tip.x, tip.y, tip.z);
  for (let j = 0; j < radial; j++) idx.push(seg * radial + j, tipIndex, seg * radial + ((j + 1) % radial));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- 贴图
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function plaidTex(base, line1, line2) {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.55;
    g.fillStyle = line1;
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * 64 + 20, 0, 18, h);
      g.fillRect(0, i * 64 + 20, w, 18);
    }
    g.globalAlpha = 0.8;
    g.fillStyle = line2;
    for (let i = 0; i < 4; i++) {
      g.fillRect(i * 64 + 50, 0, 3, h);
      g.fillRect(0, i * 64 + 50, w, 3);
    }
    g.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1.2);
  return t;
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * k)));
  return '#' + c.getHexString();
}

// 脸部：画在头部球体的 UV 上（u=0.25 为正前方）
function drawFace(g, W, H, cfg, state) {
  g.fillStyle = cfg.skin;
  g.fillRect(0, 0, W, H);
  const cx = W * 0.25;
  const male = cfg.gender === 'm';
  const eyeY = H * 0.53;
  const eyeDX = male ? 50 : 52;
  // 腮红
  if (!male) {
    for (const s of [-1, 1]) {
      const gr = g.createRadialGradient(cx + s * 70, eyeY + 42, 2, cx + s * 70, eyeY + 42, 30);
      gr.addColorStop(0, 'rgba(255,120,140,0.42)');
      gr.addColorStop(1, 'rgba(255,120,140,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(cx + s * 70, eyeY + 42, 34, 18, 0, 0, TAU);
      g.fill();
    }
  }
  const lash = '#2a1a22';
  // 眉毛
  g.strokeStyle = shade(cfg.hair.color, 0.55);
  g.lineCap = 'round';
  g.lineWidth = male ? 7 : 4.5;
  for (const s of [-1, 1]) {
    g.beginPath();
    const bx = cx + s * eyeDX;
    const by = eyeY - (male ? 46 : 52);
    g.moveTo(bx - s * 22, by + 5);
    g.quadraticCurveTo(bx + s * 2, by - 6, bx + s * 26, by + (male ? 2 : 5));
    g.stroke();
  }
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDX;
    if (state === 'open') {
      const rx = male ? 17 : 19;
      const ry = male ? 19 : 25;
      // 眼白
      g.fillStyle = '#fbf8ff';
      g.beginPath();
      g.ellipse(ex, eyeY, rx + 4, ry, 0, 0, TAU);
      g.fill();
      // 虹膜
      g.save();
      g.beginPath();
      g.ellipse(ex, eyeY, rx + 4, ry, 0, 0, TAU);
      g.clip();
      const ig = g.createLinearGradient(0, eyeY - ry, 0, eyeY + ry);
      ig.addColorStop(0, shade(cfg.eye, 0.35));
      ig.addColorStop(0.45, cfg.eye);
      ig.addColorStop(1, shade(cfg.eye, 1.6));
      g.fillStyle = ig;
      g.beginPath();
      g.ellipse(ex + s * 1, eyeY + 2, rx, ry - 1, 0, 0, TAU);
      g.fill();
      g.strokeStyle = shade(cfg.eye, 0.4);
      g.lineWidth = 2;
      g.stroke();
      // 瞳孔
      g.fillStyle = shade(cfg.eye, 0.2);
      g.beginPath();
      g.ellipse(ex + s * 1, eyeY + 3, rx * 0.42, ry * 0.5, 0, 0, TAU);
      g.fill();
      // 虹膜纹理
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 1.2;
      for (let a = 0; a < 12; a++) {
        const an = (a / 12) * TAU;
        g.beginPath();
        g.moveTo(ex + Math.cos(an) * rx * 0.5, eyeY + 3 + Math.sin(an) * ry * 0.55);
        g.lineTo(ex + Math.cos(an) * rx * 0.9, eyeY + 3 + Math.sin(an) * ry * 0.9);
        g.stroke();
      }
      // 上眼睑阴影
      const sg = g.createLinearGradient(0, eyeY - ry, 0, eyeY - ry + 14);
      sg.addColorStop(0, 'rgba(60,30,60,0.45)');
      sg.addColorStop(1, 'rgba(60,30,60,0)');
      g.fillStyle = sg;
      g.fillRect(ex - rx - 6, eyeY - ry, rx * 2 + 12, 16);
      g.restore();
      // 高光
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(ex - s * 6 - 2, eyeY - ry * 0.38, 6, 7.5, -0.3, 0, TAU);
      g.fill();
      g.beginPath();
      g.arc(ex + s * 6, eyeY + ry * 0.45, 3, 0, TAU);
      g.fill();
      // 上睫毛
      g.fillStyle = lash;
      g.beginPath();
      const top = eyeY - ry - 1;
      g.moveTo(ex - s * (rx + 8), eyeY - 4);
      g.quadraticCurveTo(ex - s * (rx + 2), top - 6, ex, top - 3);
      g.quadraticCurveTo(ex + s * (rx + 2), top - 6, ex + s * (rx + 13), eyeY - ry * 0.55);
      g.lineTo(ex + s * (rx + 6), eyeY - ry * 0.35);
      g.quadraticCurveTo(ex + s * rx, top + 2, ex, top + 4);
      g.quadraticCurveTo(ex - s * (rx - 2), top + 4, ex - s * (rx + 6), eyeY - 2);
      g.closePath();
      g.fill();
      // 眼角睫毛翘起
      if (!male) {
        g.beginPath();
        g.moveTo(ex + s * (rx + 6), eyeY - ry * 0.5);
        g.quadraticCurveTo(ex + s * (rx + 16), eyeY - ry * 0.7, ex + s * (rx + 20), eyeY - ry * 1.0);
        g.quadraticCurveTo(ex + s * (rx + 12), eyeY - ry * 0.4, ex + s * (rx + 5), eyeY - ry * 0.3);
        g.fill();
      }
      // 下睫毛
      g.strokeStyle = 'rgba(70,40,60,0.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(ex - s * (rx - 2), eyeY + ry - 1);
      g.quadraticCurveTo(ex, eyeY + ry + 4, ex + s * (rx + 2), eyeY + ry - 5);
      g.stroke();
      // 双眼皮线
      g.strokeStyle = 'rgba(80,40,60,0.35)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(ex - s * rx * 0.6, top - 9);
      g.quadraticCurveTo(ex + s * 4, top - 13, ex + s * (rx + 6), top - 3);
      g.stroke();
    } else if (state === 'closed') {
      g.strokeStyle = lash;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(ex - s * 22, eyeY + 2);
      g.quadraticCurveTo(ex, eyeY + 12, ex + s * 24, eyeY - 2);
      g.stroke();
    } else if (state === 'happy') {
      g.strokeStyle = lash;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(ex - 22, eyeY + 8);
      g.quadraticCurveTo(ex, eyeY - 16, ex + 22, eyeY + 8);
      g.stroke();
    } else if (state === 'sad') {
      g.strokeStyle = lash;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(ex - 20, eyeY + 2);
      g.lineTo(ex + 20, eyeY + 2);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(ex - s * 18, eyeY - 28);
      g.lineTo(ex + s * 16, eyeY - 38);
      g.stroke();
    }
  }
  // 鼻子
  g.fillStyle = 'rgba(200,120,110,0.45)';
  g.beginPath();
  g.ellipse(cx + 2, eyeY + 34, 3, 2.2, 0, 0, TAU);
  g.fill();
  // 嘴
  const my = eyeY + 58;
  if (state === 'happy') {
    g.fillStyle = '#c4475c';
    g.beginPath();
    g.moveTo(cx - 15, my - 4);
    g.quadraticCurveTo(cx, my - 1, cx + 15, my - 4);
    g.quadraticCurveTo(cx, my + 18, cx - 15, my - 4);
    g.fill();
    g.fillStyle = '#ff8fa0';
    g.beginPath();
    g.ellipse(cx, my + 7, 7, 4, 0, 0, TAU);
    g.fill();
  } else if (state === 'sad') {
    g.strokeStyle = '#a0505e';
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(cx - 10, my + 4);
    g.quadraticCurveTo(cx, my - 4, cx + 10, my + 4);
    g.stroke();
  } else {
    g.strokeStyle = '#b4505e';
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(cx - 11, my - 1);
    g.quadraticCurveTo(cx, my + 7, cx + 11, my - 1);
    g.stroke();
  }
}

// ---------------------------------------------------------------- 材质
function physMat(color, o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, metalness: 0, ...o });
}

function makeMaterials(cfg) {
  const m = {};
  m.skin = physMat(cfg.skin, { roughness: 0.48, sheen: 0.35, sheenColor: new THREE.Color('#ffb6a6'), sheenRoughness: 0.5 });
  m.hair = physMat(cfg.hair.color, {
    roughness: 0.32, sheen: 0.8, sheenColor: new THREE.Color(shade(cfg.hair.color, 1.6)), sheenRoughness: 0.35,
    side: THREE.DoubleSide, clearcoat: 0.25, clearcoatRoughness: 0.4,
  });
  m.hairTip = physMat(cfg.hair.tip || cfg.hair.color, { roughness: 0.32, sheen: 0.8, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide });
  const o = cfg.outfit;
  m.top = physMat(o.top, { roughness: 0.7, sheen: 0.6, sheenColor: new THREE.Color(shade(o.top, 1.5)) });
  m.jacket = physMat(o.jacket || o.top, { roughness: 0.6, sheen: 0.3, sheenColor: new THREE.Color(shade(o.jacket || o.top, 1.3)), side: THREE.DoubleSide });
  m.pants = physMat(o.pants || '#333', { roughness: 0.8, sheen: 0.4, sheenColor: new THREE.Color(shade(o.pants || '#333', 1.5)) });
  m.sock = physMat(o.sock || '#222', { roughness: 0.75, sheen: 0.5, sheenColor: new THREE.Color('#888') });
  m.shoe = physMat(o.shoe, { roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  m.sole = physMat(o.sole || '#f4f4f4', { roughness: 0.5 });
  m.accent = new THREE.MeshStandardMaterial({ color: o.accent, emissive: o.accent, emissiveIntensity: 2.2, roughness: 0.3 });
  m.metal = new THREE.MeshStandardMaterial({ color: '#e8e8f0', metalness: 1, roughness: 0.2 });
  if (o.skirt) {
    const tex = plaidTex(o.skirt, shade(o.skirt, 0.6), o.skirtLine || '#ffffff');
    m.skirt = physMat('#ffffff', { map: tex, roughness: 0.7, side: THREE.DoubleSide, sheen: 0.5, sheenColor: new THREE.Color('#ffffff') });
  }
  const faceStates = ['open', 'closed', 'happy', 'sad'];
  m.faces = {};
  for (const s of faceStates) m.faces[s] = canvasTex(1024, 512, (g, w, h) => drawFace(g, w, h, cfg, s));
  m.head = physMat('#ffffff', { map: m.faces.open, roughness: 0.48, sheen: 0.35, sheenColor: new THREE.Color('#ffb6a6') });
  return m;
}

// ---------------------------------------------------------------- 预设角色
export const DANCERS = [
  {
    id: 'seri', name: '星璃', en: 'SERI', gender: 'f', skin: '#ffe2d3', eye: '#7a6cff',
    hair: { style: 'twin', color: '#f2a7d8', tip: '#b9a4ff' },
    outfit: {
      top: '#24212e', jacket: '#d9d6e6', jacketStyle: 'crop', pants: null, skirt: '#e86aa6', skirtLine: '#fff2fa',
      sock: '#1e1c26', shoe: '#ffffff', sole: '#ff8fc8', accent: '#59f3ff', crop: true,
    },
    desc: '元气满满的偶像系舞者，擅长甜美可爱的舞步。',
  },
  {
    id: 'kai', name: '夜澄', en: 'KAI', gender: 'm', skin: '#f6d6c2', eye: '#29c4ff',
    hair: { style: 'spiky', color: '#2e3c74', tip: '#4fd7ff' },
    outfit: {
      top: '#1d1f2b', jacket: '#1d1f2b', jacketStyle: 'hoodie', pants: '#4a5263', sock: '#ddd', shoe: '#22232b', sole: '#ffffff', accent: '#3ff0ff',
    },
    desc: '街舞出身的酷系舞者，动作干净利落。',
  },
  {
    id: 'yuzu', name: '柚子', en: 'YUZU', gender: 'f', skin: '#ffe6d6', eye: '#ff8a3d',
    hair: { style: 'bob', color: '#ff9e57', tip: '#ffd36e' },
    outfit: {
      top: '#fff6e6', jacket: '#ffb03b', jacketStyle: 'vest', pants: '#5a7bd6', sock: '#fff', shoe: '#ff7a3d', sole: '#fff4e0', accent: '#ffdd3f', crop: true, wide: true,
    },
    desc: '活力四射的爵士少女，节奏感一流。',
  },
  {
    id: 'luna', name: '月汐', en: 'LUNA', gender: 'f', skin: '#fde3d6', eye: '#3ec8b4',
    hair: { style: 'pony', color: '#cfd8ff', tip: '#8fe8ff' },
    outfit: {
      top: '#2b2450', jacket: '#3a2f6b', jacketStyle: 'crop', skirt: '#2b2450', skirtLine: '#9ff3ff', sock: '#f0f0ff', shoe: '#2b2450', sole: '#c6f6ff', accent: '#b98bff',
    },
    desc: '优雅的现代舞者，舞步如月光般流畅。',
  },
];

// ---------------------------------------------------------------- 舞者类
const UP_LEN = 0.27;
const LO_LEN = 0.245;
const TH_LEN = 0.42;
const SH_LEN = 0.41;
const ANKLE = 0.075;
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Dancer {
  constructor(cfg) {
    this.cfg = cfg;
    this.mats = makeMaterials(cfg);
    this.group = new THREE.Group();
    this.root = new THREE.Group();
    this.group.add(this.root);
    this.j = {};
    this.meshes = [];
    this.blinkT = 2 + Math.random() * 3;
    this.blinking = 0;
    this.expression = 'open';
    this.exprTimer = 0;
    this.build();
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    // 头发弹簧
    this.springs = [];
    if (this.tails) {
      for (const t of this.tails) this.springs.push({ obj: t, dir: V(0, -1, 0), vel: V(0, 0, 0), rest: t.quaternion.clone(), stiff: t.userData.stiff || 60 });
    }
    this.lastHeadPos = null;
    this.headVel = V(0, 0, 0);
    this.prevYaw = 0;
    this.spinSpeed = 0;
  }

  add(parent, geo, mat, pos, rot, scale) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.copy(pos);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.copy(scale);
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  joint(name, parent, pos) {
    const o = new THREE.Group();
    o.name = name;
    o.position.copy(pos);
    o.rotation.order = 'YZX';
    parent.add(o);
    this.j[name] = o;
    return o;
  }

  build() {
    const c = this.cfg;
    const male = c.gender === 'm';
    const M = this.mats;
    const o = c.outfit;
    this.hipRestY = TH_LEN + SH_LEN + ANKLE + 0.035;

    const hips = this.joint('hips', this.root, V(0, this.hipRestY, 0));
    const spine = this.joint('spine', hips, V(0, 0.1, 0));
    const chest = this.joint('chest', spine, V(0, 0.15, 0));
    const neck = this.joint('neck', chest, V(0, 0.215, -0.005));
    const head = this.joint('head', neck, V(0, 0.065, 0.005));

    // ---- 骨盆
    const pelvisProf = male
      ? [[0.001, -0.12], [0.07, -0.115], [0.115, -0.08], [0.128, -0.02], [0.122, 0.04], [0.112, 0.1], [0.11, 0.12]]
      : [[0.001, -0.125], [0.075, -0.12], [0.125, -0.085], [0.142, -0.025], [0.134, 0.035], [0.108, 0.09], [0.098, 0.12]];
    const pelvisMat = o.skirt ? M.sock : M.pants;
    this.add(hips, latheGeo(pelvisProf, 32, 1, 0.78), pelvisMat);

    // ---- 腹部
    const absProf = male
      ? [[0.11, -0.03], [0.108, 0.04], [0.112, 0.1], [0.12, 0.17]]
      : [[0.1, -0.03], [0.092, 0.04], [0.094, 0.1], [0.105, 0.17]];
    const absMat = o.crop ? M.skin : M.top;
    this.add(spine, latheGeo(absProf, 32, 1, 0.76), absMat);
    if (o.crop) {
      // 肚脐
      this.add(spine, new THREE.SphereGeometry(0.006, 8, 6), physMat(shade(c.skin, 0.8)), V(0, 0.035, 0.073));
    }

    // ---- 胸腔
    const chestProf = male
      ? [[0.12, -0.03], [0.135, 0.04], [0.148, 0.11], [0.146, 0.165], [0.12, 0.2], [0.06, 0.225], [0.001, 0.23]]
      : [[0.106, -0.03], [0.112, 0.04], [0.118, 0.11], [0.118, 0.16], [0.095, 0.2], [0.05, 0.222], [0.001, 0.226]];
    const chestMesh = this.add(chest, latheGeo(chestProf, 36, 1, 0.72), M.top);
    chestMesh.name = 'chestBody';
    if (!male) {
      for (const s of [-1, 1]) this.add(chest, new THREE.SphereGeometry(0.048, 20, 14), M.top, V(s * 0.052, 0.105, 0.052), null, V(1, 0.92, 0.85));
    } else {
      // 胸肌轮廓
      for (const s of [-1, 1]) this.add(chest, new THREE.SphereGeometry(0.06, 20, 14), M.top, V(s * 0.06, 0.12, 0.05), null, V(1.1, 0.75, 0.6));
    }
    // 上衣下摆边
    const hemY = o.crop ? -0.02 : -0.13;
    const hemParent = o.crop ? chest : spine;
    const hemR = o.crop ? (male ? 0.122 : 0.108) : male ? 0.115 : 0.103;
    const hem = this.add(hemParent, new THREE.TorusGeometry(hemR, 0.008, 8, 48), o.crop ? M.top : M.top, V(0, o.crop ? -0.02 : hemY + 0.1, 0), [Math.PI / 2, 0, 0], V(1, 0.75, 1));
    hem.scale.set(1, 0.76, 1);

    // 外套
    if (o.jacketStyle === 'crop' || o.jacketStyle === 'vest') {
      const jp = chestProf.map(([r, y]) => [r * 1.09 + 0.006, y]);
      jp[0] = [jp[0][0] + 0.004, -0.0];
      const jk = this.add(chest, latheGeo(jp.slice(0, 6), 36, 1, 0.8, 0.42, TAU - 0.84), M.jacket);
      jk.position.y = 0.0;
      // 翻领
      for (const s of [-1, 1]) {
        const lap = this.add(chest, new RoundedBoxGeometry(0.045, 0.12, 0.012, 2, 0.005), M.jacket, V(s * 0.058, 0.15, 0.1), [0.35, 0, s * 0.35]);
        lap.castShadow = false;
      }
      // 霓虹边
      const trim = this.add(chest, new THREE.TorusGeometry(0.122, 0.004, 6, 48, TAU - 0.84), M.accent, V(0, 0.002, 0), [Math.PI / 2, 0, Math.PI / 2 + 0.42]);
      trim.scale.set(male ? 1.2 : 1.07, 0.82, 1);
    }
    if (o.jacketStyle === 'hoodie') {
      // 帽兜
      const hood = this.add(chest, new THREE.SphereGeometry(0.11, 24, 16, 0, TAU, 0, Math.PI * 0.55), M.jacket, V(0, 0.19, -0.075), [-0.9, 0, 0], V(1.25, 0.9, 0.7));
      hood.castShadow = true;
      // 拉绳
      for (const s of [-1, 1]) {
        this.add(chest, new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), M.accent, V(s * 0.035, 0.12, 0.105), [0.15, 0, 0]);
        this.add(chest, new THREE.SphereGeometry(0.008, 8, 6), M.metal, V(s * 0.035, 0.058, 0.113));
      }
      // 霓虹胸前条纹
      this.add(chest, new RoundedBoxGeometry(0.2, 0.012, 0.01, 2, 0.004), M.accent, V(0, 0.07, 0.102));
      // 卫衣下摆罗纹
      this.add(spine, new THREE.TorusGeometry(0.117, 0.016, 8, 40), M.jacket, V(0, -0.045, 0), [Math.PI / 2, 0, 0], V(1, 0.8, 1));
    }

    // ---- 脖子 & 头
    const neckR = male ? 0.044 : 0.036;
    this.add(neck, new THREE.CylinderGeometry(neckR, neckR * 1.15, 0.12, 20), M.skin, V(0, 0.01, 0));
    if (o.jacketStyle !== 'hoodie' && !male) {
      // choker
      this.add(neck, new THREE.TorusGeometry(neckR + 0.004, 0.006, 8, 32), M.accent, V(0, 0.0, 0), [Math.PI / 2, 0, 0]);
    }
    this.buildHead(head);

    // ---- 手臂
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      const sx = male ? 0.175 : 0.152;
      const sh = this.joint('shoulder' + side, chest, V(s * 0.04, 0.185, -0.005));
      const up = this.joint('upArm' + side, sh, V(s * (sx - 0.04), 0, 0));
      const lo = this.joint('loArm' + side, up, V(0, -UP_LEN, 0));
      const hand = this.joint('hand' + side, lo, V(0, -LO_LEN, 0));
      const sleeve = o.jacketStyle === 'hoodie' || o.jacketStyle === 'crop';
      const armMat = sleeve ? M.jacket : M.skin;
      const ur0 = male ? 0.05 : 0.041;
      const ur1 = male ? 0.04 : 0.033;
      const sleeveAdd = sleeve ? 0.012 : 0;
      // 三角肌
      this.add(up, new THREE.SphereGeometry(ur0 + 0.008 + sleeveAdd, 20, 14), sleeve ? M.jacket : (o.jacketStyle === 'vest' ? M.jacket : M.skin), V(0, -0.01, 0), null, V(1.05, 1, 0.95));
      this.add(up, limbGeo(UP_LEN, ur0 + sleeveAdd, ur1 + sleeveAdd, male ? 0.008 : 0.004, 0.3), armMat);
      // 前臂
      const lr0 = male ? 0.038 : 0.031;
      const lr1 = male ? 0.028 : 0.023;
      this.add(lo, limbGeo(LO_LEN, lr0, lr1, male ? 0.008 : 0.005, 0.25), M.skin);
      if (o.jacketStyle === 'hoodie') {
        this.add(lo, limbGeo(LO_LEN * 0.82, lr0 + 0.016, lr1 + 0.02, 0.004, 0.3), M.jacket);
        this.add(lo, new THREE.TorusGeometry(lr1 + 0.017, 0.006, 6, 24), M.accent, V(0, -LO_LEN * 0.82, 0), [Math.PI / 2, 0, 0]);
      } else if (o.jacketStyle === 'crop') {
        // 喇叭袖口
        const cuff = this.add(lo, latheGeo([[lr0 + 0.012, 0.02], [lr0 + 0.014, -0.05], [lr0 + 0.03, -0.11]], 24), M.jacket);
        cuff.material = M.jacket;
        this.add(lo, new THREE.TorusGeometry(lr0 + 0.03, 0.004, 6, 24), M.accent, V(0, -0.11, 0), [Math.PI / 2, 0, 0]);
      } else {
        // 手环
        this.add(lo, new THREE.TorusGeometry(lr1 + 0.006, 0.006, 8, 24), M.accent, V(0, -LO_LEN + 0.03, 0), [Math.PI / 2, 0, 0]);
      }
      this.add(up, new THREE.SphereGeometry(lr0 + 0.004, 16, 12), M.skin, V(0, -UP_LEN, 0));
      // 手
      const palm = this.add(hand, new THREE.SphereGeometry(1, 20, 14), M.skin, V(0, -0.045, 0.004), null, V(male ? 0.022 : 0.019, 0.05, male ? 0.041 : 0.036));
      palm.rotation.y = 0;
      // 手指（并拢）
      const fing = this.add(hand, limbGeo(0.045, 0.014, 0.01, 0, 0.3, 12, 2.6), M.skin, V(0, -0.075, 0.004), [0, 0, 0], V(1, 1, 1));
      fing.scale.set(1, 1, 1);
      // 大拇指
      this.add(hand, limbGeo(0.04, 0.009, 0.007, 0, 0.3, 10), M.skin, V(s * 0.006, -0.025, 0.03), [-0.5, 0, s * 0.3]);
      // 手腕连接
      this.add(lo, new THREE.SphereGeometry(lr1 + 0.002, 12, 10), M.skin, V(0, -LO_LEN, 0));
    }

    // ---- 腿
    for (const s of [1, -1]) {
      const side = s > 0 ? 'L' : 'R';
      const th = this.joint('thigh' + side, hips, V(s * (male ? 0.085 : 0.088), -0.035, 0));
      const sh = this.joint('shin' + side, th, V(0, -TH_LEN, 0));
      const ft = this.joint('foot' + side, sh, V(0, -SH_LEN, 0));
      th.rotation.order = 'XYZ';
      const pants = !!o.pants;
      const wide = o.wide ? 0.022 : 0;
      const tr0 = male ? 0.072 : 0.076;
      const tr1 = male ? 0.05 : 0.046;
      if (pants) {
        this.add(th, limbGeo(TH_LEN, tr0 + 0.012 + wide, tr1 + 0.016 + wide, 0.004, 0.3), M.pants);
        this.add(sh, limbGeo(SH_LEN - 0.02, tr1 + 0.012 + wide, 0.05 + wide * 1.6, 0.006, 0.25), M.pants);
        this.add(sh, new THREE.SphereGeometry(tr1 + 0.014 + wide, 16, 12), M.pants, V(0, 0.0, 0));
        // 裤侧霓虹线
        const stripe = this.add(th, new RoundedBoxGeometry(0.008, TH_LEN * 0.95, 0.008, 1, 0.003), M.accent, V(s * (tr0 + wide + 0.006), -TH_LEN / 2, 0), [0, 0, s * -0.06]);
        stripe.castShadow = false;
      } else {
        // 光腿 + 过膝袜
        this.add(th, limbGeo(TH_LEN, tr0, tr1, 0.006, 0.25), M.skin);
        this.add(th, new THREE.SphereGeometry(tr1 + 0.002, 16, 12), M.skin, V(0, -TH_LEN, 0));
        this.add(sh, limbGeo(SH_LEN, 0.049, 0.031, 0.012, 0.28), M.sock);
        const top = this.add(th, limbGeo(0.09, tr1 + 0.008, tr1 + 0.004, 0, 0.3), M.sock, V(0, -TH_LEN + 0.07, 0));
        top.castShadow = false;
        this.add(th, new THREE.TorusGeometry(tr1 + 0.017, 0.004, 6, 24), M.accent, V(0, -TH_LEN + 0.075, 0), [Math.PI / 2, 0, 0]);
      }
      this.buildShoe(ft, s);
    }

    // 裙子
    if (o.skirt) {
      const prof = [[0.118, 0.07], [0.135, 0.02], [0.17, -0.06], [0.215, -0.14], [0.245, -0.2]];
      const g = latheGeo(prof, 96, 1, 0.82);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const y = pos.getY(i);
        const a = Math.atan2(x, z);
        const depth = Math.max(0, (0.06 - y) / 0.26);
        const pleat = Math.abs(((a * 28) / TAU) % 1 - 0.5) * 2; // 三角波
        const k = 1 + depth * 0.07 * (pleat - 0.5);
        pos.setXYZ(i, x * k, y, z * k);
      }
      g.computeVertexNormals();
      this.skirt = this.add(hips, g, M.skirt);
      this.skirt.position.y = 0.0;
      // 腰带
      this.add(hips, new THREE.TorusGeometry(0.121, 0.012, 8, 48), M.top, V(0, 0.07, 0), [Math.PI / 2, 0, 0], V(1, 0.82, 1));
      this.add(hips, new RoundedBoxGeometry(0.03, 0.022, 0.01, 2, 0.003), M.metal, V(0, 0.07, 0.102));
      this.skirtBase = this.skirt.scale.clone();
    } else {
      // 腰带
      this.add(hips, new THREE.TorusGeometry(male ? 0.118 : 0.112, 0.012, 8, 48), physMat('#18181e', { roughness: 0.4, clearcoat: 0.5 }), V(0, 0.095, 0), [Math.PI / 2, 0, 0], V(1, 0.8, 1));
      this.add(hips, new RoundedBoxGeometry(0.036, 0.026, 0.012, 2, 0.004), M.metal, V(0, 0.095, 0.094));
      if (male) {
        // 链条
        const chain = this.add(hips, new THREE.TorusGeometry(0.07, 0.0035, 6, 32, Math.PI), M.metal, V(0.07, 0.03, 0.07), [0, 0.9, Math.PI]);
        chain.castShadow = false;
      }
    }
  }

  buildShoe(ft, s) {
    const M = this.mats;
    const g = new THREE.Group();
    ft.add(g);
    this.add(g, new THREE.SphereGeometry(1, 28, 18), M.shoe, V(0, -0.028, 0.035), null, V(0.05, 0.05, 0.118));
    this.add(g, new THREE.SphereGeometry(1, 20, 14), M.shoe, V(0, -0.005, -0.02), null, V(0.047, 0.065, 0.06));
    this.add(g, new RoundedBoxGeometry(0.108, 0.03, 0.27, 3, 0.012), M.sole, V(0, -0.06, 0.035));
    // 鞋舌与鞋带
    for (let i = 0; i < 3; i++) {
      this.add(g, new RoundedBoxGeometry(0.05, 0.006, 0.01, 1, 0.002), M.sole, V(0, 0.005 + -i * 0.012, 0.055 + i * 0.022), [0.5 + i * 0.15, 0, 0]);
    }
    // 侧边霓虹
    for (const k of [-1, 1]) {
      const st = this.add(g, new RoundedBoxGeometry(0.004, 0.012, 0.12, 1, 0.002), M.accent, V(k * 0.049, -0.035, 0.02));
      st.castShadow = false;
    }
    this.add(g, new THREE.TorusGeometry(0.044, 0.011, 8, 24), M.shoe, V(0, 0.012, -0.005), [Math.PI / 2, 0, 0]);
  }

  buildHead(head) {
    const c = this.cfg;
    const M = this.mats;
    const male = c.gender === 'm';
    const hc = new THREE.Group();
    hc.position.set(0, 0.098, 0.004);
    head.add(hc);
    this.headCenter = hc;
    const R = 0.112;
    const sx = male ? 0.94 : 0.92;
    const sy = 1.04;
    const sz = 1.0;
    this.headScale = V(sx, sy, sz);
    const g = new THREE.SphereGeometry(R, 64, 48);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      if (y < 0) {
        // 下巴收窄
        const k = Math.pow(-y / R, 1.6);
        const narrow = 1 - (male ? 0.22 : 0.3) * k;
        x *= narrow;
        z *= 1 - 0.12 * k;
        if (z > 0) z += 0.012 * k * (z / R);
        y *= 1 + 0.08 * k;
      }
      // 后脑勺饱满
      if (z < 0) z *= 1.04;
      pos.setXYZ(i, x * sx, y * sy, z * sz);
    }
    g.computeVertexNormals();
    this.headMesh = this.add(hc, g, M.head);
    // 耳朵
    for (const s of [-1, 1]) {
      this.add(hc, new THREE.SphereGeometry(1, 14, 10), M.skin, V(s * R * sx * 0.97, -0.012, -0.005), [0, s * 0.3, 0], V(0.012, 0.026, 0.018));
      this.add(hc, new THREE.SphereGeometry(0.006, 8, 6), M.metal, V(s * R * sx * 0.99, -0.034, 0.0));
    }
    this.buildHair(hc, R * 1.0, sx, sy, sz);
  }

  sph(theta, phi, r) {
    const s = this.headScale;
    return V(r * Math.sin(theta) * Math.sin(phi) * s.x, r * Math.cos(theta) * s.y, r * Math.sin(theta) * Math.cos(phi) * s.z);
  }

  buildHair(hc, R, sx, sy, sz) {
    const c = this.cfg;
    const M = this.mats;
    const style = c.hair.style;
    const center = V(0, 0, 0);
    const PI = Math.PI;
    // 发顶：裁剪过的球壳，带发流起伏
    const capR = R * 1.075;
    const cap = new THREE.SphereGeometry(capR, 72, 40, 0, TAU, 0, PI * 0.82);
    const p = cap.attributes.position;
    const backLimit = style === 'bob' ? 0.8 : style === 'spiky' ? 0.62 : 0.72;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const r = Math.sqrt(x * x + y * y + z * z);
      let theta = Math.acos(y / r);
      const phi = Math.atan2(x, z); // 0 = 前方
      const front = Math.max(0, Math.cos(phi));
      const side = Math.abs(Math.sin(phi));
      const limit = PI * (backLimit - front * (backLimit - 0.33) - (style === 'bob' ? 0 : side * 0.0));
      if (theta > limit) theta = limit;
      const ridge = 1 + 0.018 * Math.sin(phi * 22) * Math.min(1, theta / 0.6);
      const swell = 1 + 0.05 * Math.sin(Math.min(theta, PI * 0.6));
      const rr = capR * ridge * swell;
      p.setXYZ(i, rr * Math.sin(theta) * Math.sin(phi) * sx, rr * Math.cos(theta) * sy + 0.004, rr * Math.sin(theta) * Math.cos(phi) * sz);
    }
    cap.computeVertexNormals();
    this.add(hc, cap, M.hair);

    const hairStrand = (pts, r0, r1, flat = 0.4, mat = M.hair, parent = hc, ctr = center) => this.add(parent, strandGeo(pts, r0, r1, flat, ctr), mat);
    const Rh = R * 1.1;

    // 刘海
    const bangCount = style === 'spiky' ? 7 : 9;
    for (let i = 0; i < bangCount; i++) {
      const u = i / (bangCount - 1) - 0.5;
      const phi = u * PI * 0.62;
      const len = style === 'spiky' ? 0.41 + 0.04 * Math.cos(i * 2.1) : 0.43 + 0.035 * Math.cos(i * 1.7) - Math.abs(u) * 0.06;
      const curl = u * 0.25;
      const pts = [
        this.sph(PI * 0.1, phi * 0.5, Rh * 1.02),
        this.sph(PI * 0.22, phi * 0.85, Rh * 1.05),
        this.sph(PI * 0.32, phi + curl * 0.3, Rh * 1.03),
        this.sph(PI * len, phi + curl, Rh * 0.98),
      ];
      hairStrand(pts, 0.026, 0.002, 0.32);
    }
    // 鬓角
    if (style !== 'spiky') {
      for (const s of [-1, 1]) {
        const endT = style === 'bob' ? 0.78 : 0.82;
        const pts = [
          this.sph(PI * 0.2, s * PI * 0.32, Rh * 1.03),
          this.sph(PI * 0.42, s * PI * 0.4, Rh * 1.04),
          this.sph(PI * 0.62, s * PI * 0.42, Rh * 1.0),
          this.sph(PI * endT, s * PI * 0.4, Rh * 0.98),
        ];
        hairStrand(pts, 0.028, 0.003, 0.35);
        const pts2 = [this.sph(PI * 0.25, s * PI * 0.42, Rh * 1.03), this.sph(PI * 0.5, s * PI * 0.47, Rh * 1.05), this.sph(PI * (endT - 0.08), s * PI * 0.5, Rh * 1.0)];
        hairStrand(pts2, 0.025, 0.003, 0.35);
      }
    }

    this.tails = [];
    if (style === 'twin' || style === 'pony') {
      // 后发
      const n = 14;
      for (let i = 0; i < n; i++) {
        const phi = PI * 0.55 + (i / (n - 1)) * PI * 0.9;
        const end = 0.8 + 0.04 * Math.sin(i * 1.3);
        const pts = [this.sph(PI * 0.3, phi, Rh * 1.02), this.sph(PI * 0.55, phi, Rh * 1.06), this.sph(PI * end, phi, Rh * 1.02)];
        hairStrand(pts, 0.04, 0.004, 0.35);
      }
    }
    if (style === 'twin') {
      for (const s of [-1, 1]) {
        const anchor = this.sph(PI * 0.3, s * PI * 0.66, Rh * 0.98);
        const tg = new THREE.Group();
        tg.position.copy(anchor);
        hc.add(tg);
        // 发圈
        this.add(tg, new THREE.TorusGeometry(0.026, 0.009, 10, 24), M.accent, V(s * 0.01, 0, 0), [0, 0, s * 0.6 + Math.PI / 2]);
        this.add(tg, new THREE.SphereGeometry(0.017, 12, 10), M.accent, V(s * 0.022, 0.018, 0.008));
        const local = V(0, 0, 0);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          const ox = Math.cos(a) * 0.012;
          const oz = Math.sin(a) * 0.012;
          const spread = 1 + 0.15 * Math.sin(a * 2);
          const pts = [
            V(s * 0.005 + ox, 0.005, oz),
            V(s * (0.06 + ox) * spread, -0.03, -0.02 + oz),
            V(s * (0.1 + ox * 2) * spread, -0.16, -0.035 + oz * 2),
            V(s * (0.105 + ox * 2.5) * spread, -0.32, -0.02 + oz * 2.5),
            V(s * (0.08 + ox * 2) * spread, -0.48, 0.0 + oz * 2),
            V(s * (0.05 + ox) * spread, -0.58 - 0.02 * Math.sin(a), 0.01 + oz),
          ];
          hairStrand(pts, 0.036, 0.003, 0.7, k % 3 === 0 ? M.hairTip : M.hair, tg, V(s * 0.0, -0.25, 0));
        }
        tg.userData.stiff = 45;
        this.tails.push(tg);
      }
    }
    if (style === 'pony') {
      const anchor = this.sph(PI * 0.42, PI, Rh * 0.98);
      const tg = new THREE.Group();
      tg.position.copy(anchor);
      hc.add(tg);
      this.add(tg, new THREE.TorusGeometry(0.03, 0.01, 10, 24), M.accent, V(0, 0.005, -0.008), [0.3, 0, 0]);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        const ox = Math.cos(a) * 0.016;
        const oz = Math.sin(a) * 0.016;
        const pts = [
          V(ox, 0.01, oz - 0.005),
          V(ox * 1.5, 0.03, -0.07 + oz),
          V(ox * 2.5, -0.1, -0.12 + oz * 2),
          V(ox * 2.8, -0.3, -0.1 + oz * 2),
          V(ox * 2, -0.5, -0.06 + oz),
          V(ox, -0.62, -0.04),
        ];
        hairStrand(pts, 0.04, 0.003, 0.75, k % 3 === 0 ? M.hairTip : M.hair, tg, V(0, -0.2, 0.05));
      }
      tg.userData.stiff = 35;
      this.tails.push(tg);
    }
    if (style === 'bob') {
      const n = 26;
      for (let i = 0; i < n; i++) {
        const phi = PI * 0.36 + (i / (n - 1)) * PI * 1.28;
        const back = Math.max(0, -Math.cos(phi));
        const end = 0.74 + 0.05 * back + 0.02 * Math.sin(i * 2.7);
        const pts = [
          this.sph(PI * 0.25, phi, Rh * 1.03),
          this.sph(PI * 0.5, phi, Rh * 1.12),
          this.sph(PI * (end - 0.06), phi, Rh * 1.12),
          this.sph(PI * end, phi + 0.05 * Math.sin(phi), Rh * 0.98),
        ];
        hairStrand(pts, 0.042, 0.006, 0.35, i % 4 === 0 ? M.hairTip : M.hair);
      }
      // 发夹
      this.add(hc, new RoundedBoxGeometry(0.035, 0.008, 0.01, 1, 0.003), M.accent, this.sph(PI * 0.28, PI * 0.28, Rh * 1.08), [0, 0.6, -0.5]);
      this.add(hc, new RoundedBoxGeometry(0.035, 0.008, 0.01, 1, 0.003), M.accent, this.sph(PI * 0.32, PI * 0.3, Rh * 1.08), [0, 0.6, -0.5]);
    }
    if (style === 'spiky') {
      let k = 0;
      for (let ti = 0; ti < 4; ti++) {
        const theta = PI * (0.08 + ti * 0.14);
        const cnt = 5 + ti * 3;
        for (let i = 0; i < cnt; i++) {
          const phi = (i / cnt) * TAU + ti * 0.4;
          const front = Math.cos(phi);
          if (front > 0.6 && ti > 1) continue;
          const base = this.sph(theta, phi, Rh * 0.98);
          const dir = base.clone().normalize();
          dir.y += 0.25;
          dir.z -= 0.35;
          dir.normalize();
          const len = 0.08 + 0.03 * Math.sin(k * 1.7) + ti * 0.012;
          const mid = base.clone().addScaledVector(dir, len * 0.55);
          mid.y -= 0.01;
          const tip = base.clone().addScaledVector(dir, len);
          tip.y -= 0.035;
          hairStrand([base, mid, tip], 0.032, 0.002, 0.5, k % 5 === 0 ? M.hairTip : M.hair);
          k++;
        }
      }
      // 后颈
      for (let i = 0; i < 9; i++) {
        const phi = PI * 0.65 + (i / 8) * PI * 0.7;
        hairStrand([this.sph(PI * 0.45, phi, Rh * 1.0), this.sph(PI * 0.62, phi, Rh * 1.03), this.sph(PI * 0.72, phi, Rh * 0.99)], 0.035, 0.003, 0.4);
      }
      // 侧边
      for (const s of [-1, 1]) {
        hairStrand([this.sph(PI * 0.25, s * PI * 0.38, Rh * 1.03), this.sph(PI * 0.45, s * PI * 0.43, Rh * 1.03), this.sph(PI * 0.6, s * PI * 0.42, Rh * 0.99)], 0.03, 0.003, 0.4);
      }
    }
  }

  // ------------------------------------------------------------ 姿态应用
  applyPose(P) {
    const j = this.j;
    this.root.position.set(P.root.x, 0, P.root.z);
    this.root.rotation.y = P.root.ry;
    j.hips.position.set(P.hips.x, this.hipRestY + P.hips.y, P.hips.z);
    j.hips.rotation.set(P.hips.rx, P.hips.ry, P.hips.rz);
    j.spine.rotation.set(...P.spine);
    j.chest.rotation.set(...P.chest);
    j.neck.rotation.set(...P.neck);
    j.head.rotation.set(...P.head);
    for (const s of ['L', 'R']) {
      const a = P['arm' + s];
      j['shoulder' + s].rotation.set(...a.sh);
      j['upArm' + s].rotation.set(...a.up);
      j['loArm' + s].rotation.set(...a.lo);
      j['hand' + s].rotation.set(...a.hand);
    }
    this.root.updateMatrixWorld(true);
    this.solveLeg('L', P.footL, P.kneeOut ?? 0.12);
    this.solveLeg('R', P.footR, P.kneeOut ?? 0.12);
    this.root.updateMatrixWorld(true);
  }

  solveLeg(side, F, kneeOut) {
    const j = this.j;
    const hips = j.hips;
    const th = j['thigh' + side];
    const sh = j['shin' + side];
    const ft = j['foot' + side];
    const s = side === 'L' ? 1 : -1;
    // 目标踝点（root 空间 -> 世界 -> hips 空间）
    const target = _v.set(F.x, F.y + ANKLE, F.z);
    this.root.localToWorld(target);
    hips.worldToLocal(target);
    const d = target.sub(th.position);
    const a = TH_LEN;
    const b = SH_LEN;
    let L = d.length();
    L = Math.min(Math.max(L, 0.12), a + b - 0.0015);
    const dir = d.normalize();
    const alpha = Math.acos(Math.min(1, Math.max(-1, (a * a + L * L - b * b) / (2 * a * L))));
    // 膝盖朝向：角色前方（hips 空间）
    _q.copy(hips.quaternion).invert();
    const fwd = _v2.set(0, 0, 1).applyQuaternion(_q);
    // 叠加脚尖朝向的影响
    fwd.applyAxisAngle(V(0, 1, 0), (F.ry || 0) * 0.7);
    fwd.applyAxisAngle(dir, -s * kneeOut);
    fwd.addScaledVector(dir, -fwd.dot(dir)).normalize();
    const thighDir = dir.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(fwd, Math.sin(alpha)).normalize();
    const knee = th.position.clone().addScaledVector(thighDir, a);
    const shinDir = target.clone().add(th.position).sub(knee);
    // 注意 target 已被 sub 修改，这里重建
    const tgt = dir.clone().multiplyScalar(L).add(th.position);
    shinDir.copy(tgt).sub(knee).normalize();
    // 大腿基
    const yAxis = thighDir.clone().negate();
    const zAxis = fwd.clone().addScaledVector(yAxis, -fwd.dot(yAxis)).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    _m.makeBasis(xAxis, yAxis, zAxis);
    th.quaternion.setFromRotationMatrix(_m);
    // 小腿
    const local = shinDir.clone().applyQuaternion(_q2.copy(th.quaternion).invert());
    sh.quaternion.setFromUnitVectors(V(0, -1, 0), local.normalize());
    // 脚掌：世界朝向 = root 朝向 * 脚 yaw * 脚 pitch
    th.updateMatrixWorld(true);
    const shinWorld = new THREE.Quaternion();
    sh.getWorldQuaternion(shinWorld);
    const rootWorld = new THREE.Quaternion();
    this.root.getWorldQuaternion(rootWorld);
    const desired = rootWorld.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(F.rx || 0, F.ry || 0, F.rz || 0, 'YXZ')));
    ft.quaternion.copy(shinWorld.invert().multiply(desired));
  }

  setExpression(e, hold = 0.8) {
    this.expression = e;
    this.exprTimer = hold;
  }

  update(dt) {
    // 表情 & 眨眼
    this.exprTimer -= dt;
    if (this.exprTimer <= 0) this.expression = 'open';
    this.blinkT -= dt;
    let face = this.expression;
    if (face === 'open') {
      if (this.blinkT < 0) {
        face = 'closed';
        if (this.blinkT < -0.11) this.blinkT = 1.5 + Math.random() * 3.5;
      }
    }
    const tex = this.mats.faces[face];
    if (this.mats.head.map !== tex) {
      this.mats.head.map = tex;
      this.mats.head.needsUpdate = true;
    }

    // 头发弹簧（简化物理）
    if (!this.springs.length || dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    const hp = new THREE.Vector3();
    this.headCenter.getWorldPosition(hp);
    if (this.lastHeadPos) {
      const v = hp.clone().sub(this.lastHeadPos).divideScalar(dt);
      this.headVel.lerp(v, 0.5);
    }
    this.lastHeadPos = hp;
    const hq = new THREE.Quaternion();
    this.headCenter.getWorldQuaternion(hq);
    const inv = hq.clone().invert();
    for (const sp of this.springs) {
      const g = V(0, -1, 0).applyQuaternion(inv);
      const inertia = this.headVel.clone().multiplyScalar(-0.12).applyQuaternion(inv);
      // 旋转离心
      const target = g.add(inertia);
      target.y = Math.min(target.y, -0.35);
      target.normalize();
      const acc = target.sub(sp.dir).multiplyScalar(sp.stiff).addScaledVector(sp.vel, -7);
      sp.vel.addScaledVector(acc, dt);
      sp.dir.addScaledVector(sp.vel, dt).normalize();
      sp.obj.quaternion.setFromUnitVectors(V(0, -1, 0), sp.dir);
    }
    // 裙摆随旋转张开
    if (this.skirt) {
      const yaw = this.root.rotation.y;
      const w = Math.abs(yaw - this.prevYaw) / dt;
      this.prevYaw = yaw;
      this.spinSpeed += (Math.min(w, 14) - this.spinSpeed) * Math.min(1, dt * 6);
      const flare = 1 + this.spinSpeed * 0.03;
      this.skirt.scale.set(flare, 1 - (flare - 1) * 0.5, flare);
    }
  }
}
