// 3D 舞台：镜面地板、LED 大屏、摇头灯光束、粒子、镜头导演、泛光后期
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Dancer } from './character.js';
import { DanceController } from './dances.js';

const TAU = Math.PI * 2;

export class Stage {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.quality = quality;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 阴影每帧只在主渲染开始时更新一次，避免镜面反射的嵌套渲染破坏阴影状态
    renderer.shadowMap.autoUpdate = false;
    renderer.localClippingEnabled = false;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07060f');
    scene.fog = new THREE.FogExp2('#0b0820', 0.045);
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 120);
    this.camera.position.set(0, 1.6, 5.5);
    this.camTarget = new THREE.Vector3(0, 1.1, 0);
    this.camPos = this.camera.position.clone();
    this.camLook = this.camTarget.clone();

    this.c1 = new THREE.Color('#7fd4ff');
    this.c2 = new THREE.Color('#c58bff');
    this.time = 0;
    this.beat = 0;
    this.energy = 0.4;
    this.flashAmt = 0;
    this.pattern = 0;
    this.mode = 'menu';

    this.buildLights();
    this.buildStage();
    this.buildBeams();
    this.buildParticles();
    this.buildComposer();

    this.dancers = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ------------------------------------------------------------ 构建
  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight('#8a7fff', '#1a1028', 0.55));
    const key = new THREE.SpotLight('#fff4f0', 22, 20, 0.42, 0.55, 1.6);
    key.position.set(0.5, 6.5, 5.5);
    key.target.position.set(0, 0.9, 0);
    key.castShadow = this.quality !== 'low';
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    s.add(key, key.target);
    this.key = key;
    // 轮廓光
    this.rimL = new THREE.SpotLight('#ff5fd2', 55, 16, 0.5, 0.6, 1.5);
    this.rimL.position.set(-4, 4.5, -3.5);
    this.rimL.target.position.set(0, 1.1, 0);
    this.rimR = new THREE.SpotLight('#4fd8ff', 55, 16, 0.5, 0.6, 1.5);
    this.rimR.position.set(4, 4.5, -3.5);
    this.rimR.target.position.set(0, 1.1, 0);
    s.add(this.rimL, this.rimL.target, this.rimR, this.rimR.target);
    // 补光
    this.fill = new THREE.PointLight('#ffd9f0', 2.5, 8, 1.6);
    this.fill.position.set(0, 1.3, 3.2);
    s.add(this.fill);
    // 地面颜色反弹
    this.bounce = new THREE.PointLight('#7f5fff', 1.2, 6, 1.5);
    this.bounce.position.set(0, 0.15, 2.4);
    s.add(this.bounce);
  }

  buildStage() {
    const s = this.scene;
    const R = 7;
    // 平面反射：每帧用镜像相机渲染到 RT，再在地板着色器里投影采样
    this.reflect = this.quality === 'high';
    if (this.reflect) {
      this.reflRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
      this.reflCam = new THREE.PerspectiveCamera();
      this.reflMatrix = new THREE.Matrix4();
      this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.0);
    }
    this.floorMat = new THREE.ShaderMaterial({
      transparent: false,
      uniforms: {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uEnergy: { value: 0.5 },
        uC1: { value: this.c1 },
        uC2: { value: this.c2 },
        uMirror: { value: this.reflect ? 1 : 0 },
        uRefl: { value: this.reflect ? this.reflRT.texture : null },
        uReflMat: { value: this.reflect ? this.reflMatrix : new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
      },
      vertexShader: /* glsl */ `
        uniform mat4 uReflMat;
        varying vec2 vUv; varying vec3 vPos; varying vec4 vRefl;
        void main(){
          vUv = uv; vPos = position;
          vRefl = uReflMat * modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uBeat, uEnergy, uMirror; uniform vec3 uC1, uC2;
        uniform sampler2D uRefl; uniform vec2 uTexel;
        varying vec2 vUv; varying vec3 vPos; varying vec4 vRefl;
        float line(float x, float w){ return smoothstep(w, 0.0, abs(x)); }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 p = vPos.xy;
          float r = length(p);
          float a = atan(p.y, p.x);
          float pulse = exp(-fract(uBeat) * 4.0);
          float rings = line(fract(r * 0.5 - uBeat * 0.25) - 0.5, 0.03) * smoothstep(7.0, 2.0, r);
          float center = line(r - 1.6, 0.025) + line(r - 1.68, 0.01) * 0.6;
          float rays = line(fract(a / 6.2831 * 24.0) - 0.5, 0.04) * smoothstep(1.7, 2.2, r) * smoothstep(7.0, 3.0, r) * 0.35;
          vec2 g = abs(fract(p * 1.0) - 0.5);
          float grid = (line(g.x - 0.5, 0.012) + line(g.y - 0.5, 0.012)) * 0.25 * smoothstep(7.0, 1.0, r);
          float edge = line(r - 6.85, 0.05) * 1.2;
          vec3 col = mix(uC1, uC2, 0.5 + 0.5 * sin(a * 2.0 + uTime * 0.5));
          float glow = rings * (0.35 + 0.9 * pulse * uEnergy) + center * (0.9 + pulse) + rays * (0.3 + uEnergy) + grid + edge;
          float spot = smoothstep(2.4, 0.0, r) * (0.18 + 0.12 * pulse * uEnergy);
          // 拉丝金属地板的细微噪点
          float n = hash(floor(p * 220.0)) * 0.012;
          vec3 base = vec3(0.018, 0.014, 0.034) + n;
          vec3 refl = vec3(0.0);
          if (uMirror > 0.5) {
            vec2 uv = vRefl.xy / vRefl.w;
            // 轻微模糊（5 点）
            vec2 o = uTexel * 1.5;
            refl = texture2D(uRefl, uv).rgb * 0.4
                 + texture2D(uRefl, uv + vec2(o.x, 0.0)).rgb * 0.15
                 + texture2D(uRefl, uv - vec2(o.x, 0.0)).rgb * 0.15
                 + texture2D(uRefl, uv + vec2(0.0, o.y)).rgb * 0.15
                 + texture2D(uRefl, uv - vec2(0.0, o.y)).rgb * 0.15;
            refl *= 0.42;
          }
          vec3 outc = base + refl + col * (glow * 1.4 + spot);
          gl_FragColor = vec4(outc, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 128), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.001;
    s.add(floor);
    this.floor = floor;
    // 阴影接收层
    const shadowFloor = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.ShadowMaterial({ opacity: 0.55 }));
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.position.y = 0.003;
    shadowFloor.receiveShadow = true;
    shadowFloor.renderOrder = 2;
    s.add(shadowFloor);
    this.shadowFloor = shadowFloor;
    // 台基
    const baseMat = new THREE.MeshStandardMaterial({ color: '#15121f', metalness: 0.8, roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.15, 0.5, 96, 1, true), baseMat);
    base.position.y = -0.25;
    s.add(base);
    this.edgeMat = new THREE.MeshBasicMaterial({ color: this.c1 });
    const edge = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.025, 8, 160), this.edgeMat);
    edge.rotation.x = Math.PI / 2;
    s.add(edge);
    const edge2 = new THREE.Mesh(new THREE.TorusGeometry(R + 0.12, 0.015, 8, 160), this.edgeMat);
    edge2.rotation.x = Math.PI / 2;
    edge2.position.y = -0.3;
    s.add(edge2);
    // 远处地面
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshStandardMaterial({ color: '#06050c', roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    s.add(ground);

    // LED 大屏
    this.ledMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uBeat: { value: 0 }, uEnergy: { value: 0.5 }, uPattern: { value: 0 },
        uC1: { value: this.c1 }, uC2: { value: this.c2 }, uFlash: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uBeat, uEnergy, uPattern, uFlash; uniform vec3 uC1, uC2;
        varying vec2 vUv;
        float hash(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          vec2 res = vec2(160.0, 64.0);
          vec2 cell = floor(uv * res);
          vec2 f = fract(uv * res) - 0.5;
          vec2 c = (cell + 0.5) / res;
          float pulse = exp(-fract(uBeat) * 3.0);
          float v = 0.0;
          vec3 col = uC1;
          int pat = int(uPattern);
          if (pat == 0) {
            // 频谱柱
            float bx = floor(c.x * 32.0);
            float h = 0.25 + 0.55 * hash(bx + floor(uBeat * 2.0) * 13.0) * (0.5 + 0.5 * uEnergy) + 0.2 * pulse;
            float y = abs(c.y - 0.5) * 2.0;
            v = step(y, h) * (0.55 + 0.45 * (1.0 - y / max(h, 0.01)));
            col = mix(uC1, uC2, y);
          } else if (pat == 1) {
            // 扩散环
            vec2 p = (c - 0.5) * vec2(2.5, 1.0);
            float r = length(p);
            v = smoothstep(0.08, 0.0, abs(fract(r * 3.0 - uBeat * 0.5) - 0.5) - 0.12);
            col = mix(uC1, uC2, fract(r * 1.5 - uBeat * 0.25));
            v *= 0.5 + 0.5 * pulse;
          } else if (pat == 2) {
            // 斜条纹滚动
            float s = fract((c.x * 2.5 + c.y) * 3.0 - uBeat * 0.5);
            v = smoothstep(0.5, 0.45, abs(s - 0.5) * 2.0 - 0.0) * 0.5 + 0.2 * pulse;
            col = mix(uC1, uC2, step(0.5, fract((c.x * 2.5 + c.y) * 1.5 - uBeat * 0.25)));
          } else {
            // 星光隧道
            vec2 p = (c - 0.5) * vec2(2.5, 1.0);
            float a = atan(p.y, p.x);
            float r = length(p);
            float rays = smoothstep(0.6, 1.0, sin(a * 12.0 + uTime * 1.5)) * smoothstep(0.0, 0.6, r);
            v = rays * (0.4 + 0.6 * pulse) + smoothstep(0.2, 0.0, r) * (0.6 + pulse);
            col = mix(uC2, uC1, r);
          }
          // 像素点阵
          float dotm = smoothstep(0.5, 0.32, length(f));
          vec3 outc = col * v * dotm * (0.6 + 0.7 * uEnergy) + vec3(0.012, 0.01, 0.025);
          outc += uFlash * 0.4 * col;
          // 边缘暗角
          outc *= smoothstep(0.0, 0.04, uv.x) * smoothstep(1.0, 0.96, uv.x) * smoothstep(0.0, 0.06, uv.y) * smoothstep(1.0, 0.94, uv.y);
          gl_FragColor = vec4(outc, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const led = new THREE.Mesh(new THREE.PlaneGeometry(17, 6.8), this.ledMat);
    led.position.set(0, 3.9, -7.5);
    s.add(led);
    // 大屏边框
    const frameMat = new THREE.MeshStandardMaterial({ color: '#1a1726', metalness: 0.9, roughness: 0.3 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(17.6, 7.4, 0.3), frameMat);
    frame.position.set(0, 3.9, -7.68);
    s.add(frame);
    // 两侧侧屏（竖条灯柱）
    this.pillarMat = new THREE.MeshBasicMaterial({ color: this.c2 });
    this.pillars = [];
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.5, 0.12), this.pillarMat);
        p.position.set(sx * (9.3 + i * 1.3), 3.25, -6.5 + i * 1.6);
        s.add(p);
        this.pillars.push(p);
      }
    }

    // 桁架 + 灯泡
    const trussMat = new THREE.MeshStandardMaterial({ color: '#2a2838', metalness: 0.9, roughness: 0.35 });
    const truss = new THREE.Group();
    const bar = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), trussMat);
      m.position.set(x, y, z);
      truss.add(m);
    };
    for (const z of [-4.5, 2.5]) {
      bar(18, 0.08, 0.08, 0, 7.6, z);
      bar(18, 0.08, 0.08, 0, 7.2, z);
      bar(18, 0.08, 0.08, 0, 7.4, z + 0.3);
      for (let x = -9; x <= 9; x += 0.6) {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4), trussMat);
        d.position.set(x, 7.4, z + 0.15);
        d.rotation.z = 0.8;
        truss.add(d);
      }
    }
    for (const x of [-9, 9]) bar(0.3, 8, 0.3, x, 3.6, -4.5);
    s.add(truss);
    // 灯泡阵列（实例化）
    const bulbGeo = new THREE.SphereGeometry(0.07, 10, 8);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const bulbs = new THREE.InstancedMesh(bulbGeo, this.bulbMat, 60);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (const z of [-4.5, 2.5]) {
      for (let i = 0; i < 30; i++) {
        m4.makeTranslation(-8.7 + i * 0.6, 7.05, z);
        bulbs.setMatrixAt(k, m4);
        bulbs.setColorAt(k, new THREE.Color(1, 1, 1));
        k++;
      }
    }
    s.add(bulbs);
    this.bulbs = bulbs;
  }

  buildBeams() {
    this.beams = [];
    const beamMat = (color) =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: color }, uInt: { value: 0.5 } },
        vertexShader: /* glsl */ `
          varying float vY; varying vec3 vN; varying vec3 vView;
          void main(){
            vY = uv.y;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
            vView = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uInt;
          varying float vY; varying vec3 vN; varying vec3 vView;
          void main(){
            float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
            float fade = pow(vY, 1.4);
            gl_FragColor = vec4(uColor * edge * fade * uInt * 0.32, 1.0);
          }`,
      });
    const geo = new THREE.CylinderGeometry(0.06, 0.9, 9, 32, 1, true);
    geo.translate(0, -4.5, 0);
    const positions = [-6, -3.6, -1.2, 1.2, 3.6, 6];
    positions.forEach((x, i) => {
      const color = (i % 2 ? this.c2 : this.c1).clone();
      const pivot = new THREE.Group();
      pivot.position.set(x, 7.1, -4.4);
      const mat = beamMat(color);
      const cone = new THREE.Mesh(geo, mat);
      pivot.add(cone);
      // 灯头
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.3, 16), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.8, roughness: 0.3 }));
      head.position.y = -0.1;
      pivot.add(head);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), new THREE.MeshBasicMaterial({ color }));
      lens.rotation.x = Math.PI / 2;
      lens.position.y = -0.26;
      pivot.add(lens);
      this.scene.add(pivot);
      this.beams.push({ pivot, mat, lens, i, color });
    });
    // 前排两盏追光（光束）
    for (const x of [-3, 3]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 7.1, 2.5);
      const mat = beamMat(new THREE.Color('#ffffff'));
      const cone = new THREE.Mesh(geo, mat);
      pivot.add(cone);
      this.scene.add(pivot);
      pivot.lookAt(0, 0, 0);
      pivot.rotateX(-Math.PI / 2);
      this.beams.push({ pivot, mat, follow: true, i: x > 0 ? 7 : 6, color: mat.uniforms.uColor.value });
    }
  }

  buildParticles() {
    // 漂浮光点
    const N = 500;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = -8 + Math.random() * 12;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uC1: { value: this.c1 }, uC2: { value: this.c2 }, uPix: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float seed; uniform float uTime, uPix; varying float vS; varying float vA;
        void main(){
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.1 + seed * 0.25), 9.0);
          p.x += sin(uTime * 0.3 + seed * 20.0) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (6.0 + seed * 12.0) * uPix / -mv.z;
          vS = seed;
          vA = 0.4 + 0.6 * sin(uTime * (1.0 + seed * 3.0) + seed * 50.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uC1, uC2; varying float vS; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(mix(uC1, uC2, vS) * a * vA * 0.9, 1.0);
        }`,
    });
    this.scene.add(new THREE.Points(g, this.dustMat));

    // 爆发粒子池
    const M = 900;
    this.burst = {
      n: M,
      pos: new Float32Array(M * 3),
      vel: new Float32Array(M * 3),
      col: new Float32Array(M * 3),
      life: new Float32Array(M),
      size: new Float32Array(M),
      next: 0,
    };
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.burst.pos, 3));
    bg.setAttribute('color', new THREE.BufferAttribute(this.burst.col, 3));
    bg.setAttribute('life', new THREE.BufferAttribute(this.burst.life, 1));
    bg.setAttribute('size', new THREE.BufferAttribute(this.burst.size, 1));
    this.burstGeo = bg;
    const bm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPix: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute float life; attribute float size; uniform float uPix; varying vec3 vC; varying float vL;
        void main(){
          vC = color; vL = life;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = life > 0.0 ? size * uPix * (0.4 + life) / -mv.z : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vL;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float star = smoothstep(0.5, 0.0, d) + smoothstep(0.06, 0.0, abs(c.x)) * smoothstep(0.5, 0.0, abs(c.y)) * 0.6 + smoothstep(0.06, 0.0, abs(c.y)) * smoothstep(0.5, 0.0, abs(c.x)) * 0.6;
          gl_FragColor = vec4(vC * star * clamp(vL, 0.0, 1.0) * 1.6, 1.0);
        }`,
    });
    this.burstMat = bm;
    const pts = new THREE.Points(bg, bm);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  buildComposer() {
    if (this.quality === 'low') {
      this.composer = null;
      return;
    }
    const comp = new EffectComposer(this.renderer);
    comp.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.5, 0.9);
    comp.addPass(this.bloom);
    comp.addPass(new OutputPass());
    this.composer = comp;
  }

  // ------------------------------------------------------------ 舞者
  setDancers(cfgs) {
    for (const d of this.dancers) this.scene.remove(d.dancer.group);
    this.dancers = [];
    const spots = [
      [0, 0, 0],
      [-1.55, 0, -1.0],
      [1.55, 0, -1.0],
    ];
    cfgs.forEach((cfg, i) => {
      if (!cfg) return;
      const dancer = new Dancer(cfg);
      const [x, y, z] = spots[i];
      dancer.group.position.set(x, y, z);
      if (i > 0) dancer.group.rotation.y = -x * 0.08;
      this.scene.add(dancer.group);
      const ctrl = new DanceController(dancer, { mirror: i === 2, phase: 0 });
      this.dancers.push({ dancer, ctrl, main: i === 0 });
    });
    return this.dancers;
  }

  get main() {
    return this.dancers[0];
  }

  setColors(c1, c2) {
    this.targetC1 = new THREE.Color(c1);
    this.targetC2 = new THREE.Color(c2);
  }

  // ------------------------------------------------------------ 特效
  spawnBurst(origin, count, colors, speed = 2.5, up = 1.5, size = 70) {
    const B = this.burst;
    for (let n = 0; n < count; n++) {
      const i = B.next;
      B.next = (B.next + 1) % B.n;
      const a = Math.random() * TAU;
      const e = Math.random() * 2 - 1;
      const s = speed * (0.4 + Math.random() * 0.8);
      B.pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.3;
      B.pos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.4;
      B.pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.3;
      B.vel[i * 3] = Math.cos(a) * s * Math.sqrt(1 - e * e);
      B.vel[i * 3 + 1] = Math.abs(e) * s * 0.6 + up * Math.random();
      B.vel[i * 3 + 2] = Math.sin(a) * s * Math.sqrt(1 - e * e);
      const c = colors[n % colors.length];
      B.col[i * 3] = c.r;
      B.col[i * 3 + 1] = c.g;
      B.col[i * 3 + 2] = c.b;
      B.life[i] = 1 + Math.random() * 0.6;
      B.size[i] = size * (0.5 + Math.random());
    }
  }

  // judgment: 'perfect' | 'great' | 'cool' | 'bad' | 'miss' | 'finish'
  effect(type) {
    const d = this.main;
    const origin = new THREE.Vector3(0, 1.2, 0);
    if (d) d.dancer.group.localToWorld(origin.set(0, 1.1, 0));
    const white = new THREE.Color(1, 1, 1);
    const gold = new THREE.Color('#ffd76e');
    if (type === 'perfect') {
      this.spawnBurst(origin, 60, [this.c1, this.c2, white, gold], 2.8, 1.5);
      this.flashAmt = 1;
    } else if (type === 'great') {
      this.spawnBurst(origin, 30, [this.c1, this.c2, white], 2.2, 1.2);
      this.flashAmt = 0.6;
    } else if (type === 'cool') {
      this.spawnBurst(origin, 14, [this.c1, white], 1.6, 1);
      this.flashAmt = 0.3;
    } else if (type === 'finish') {
      for (let i = 0; i < 3; i++) this.spawnBurst(origin, 200, [this.c1, this.c2, white, gold, new THREE.Color('#ff6b9a')], 4.5, 3, 90);
      this.flashAmt = 1.6;
    } else if (type === 'confetti') {
      const o = new THREE.Vector3(0, 6, 0);
      this.spawnBurst(o, 300, [this.c1, this.c2, white, gold], 3, 0, 80);
    }
  }

  // ------------------------------------------------------------ 镜头
  setMode(mode) {
    this.mode = mode;
    this.shotStart = this.beat;
    this.cutNow = true;
  }

  updateCamera(dt) {
    const t = this.time;
    const B = this.beat;
    let pos;
    let look;
    let fov = 36;
    if (this.mode === 'debug') {
      pos = this.debugPos;
      look = this.debugLook;
    } else if (this.mode === 'menu') {
      const a = t * 0.12;
      pos = new THREE.Vector3(Math.sin(a) * 4.6, 1.55 + Math.sin(t * 0.2) * 0.2, Math.cos(a) * 4.6);
      look = new THREE.Vector3(0, 1.0, 0);
    } else if (this.mode === 'select') {
      const a = Math.sin(t * 0.25) * 0.15;
      pos = new THREE.Vector3(-0.9 + Math.sin(a) * 3.2, 1.25, Math.cos(a) * 3.2);
      look = new THREE.Vector3(-0.9, 1.0, 0);
      fov = 34;
    } else if (this.mode === 'dress') {
      const a = t * 0.35;
      pos = new THREE.Vector3(-0.75 + Math.sin(a) * 2.9, 1.2, Math.cos(a) * 2.9);
      look = new THREE.Vector3(-0.75, 0.95, 0);
      fov = 34;
    } else if (this.mode === 'result') {
      const a = Math.sin(t * 0.3) * 0.25;
      pos = new THREE.Vector3(-0.85 + Math.sin(a) * 3.0, 1.3, Math.cos(a) * 3.0);
      look = new THREE.Vector3(-0.85, 1.0, 0);
    } else {
      // 游戏：每 4 小节切换机位
      const shot = Math.floor(Math.max(0, B) / 16) % 6;
      const lt = (Math.max(0, B) % 16) / 16;
      const shots = [
        () => [new THREE.Vector3(0, 1.75, 6.2 - lt * 0.8), new THREE.Vector3(0, 0.95, 0)],
        () => [new THREE.Vector3(-3.2 + lt * 1.2, 1.4, 4.6), new THREE.Vector3(0, 1.0, 0)],
        () => [new THREE.Vector3(0.2, 1.45, 3.4 - lt * 0.5), new THREE.Vector3(0, 1.1, 0)],
        () => [new THREE.Vector3(Math.sin(lt * 1.6 - 0.8) * 5, 0.55, Math.cos(lt * 1.6 - 0.8) * 5), new THREE.Vector3(0, 1.2, 0)],
        () => [new THREE.Vector3(3.0 - lt * 1.2, 2.2, 4.4), new THREE.Vector3(0, 0.9, 0)],
        () => [new THREE.Vector3(0, 3.2 - lt * 1.0, 5.6), new THREE.Vector3(0, 0.85, 0)],
      ];
      [pos, look] = shots[shot]();
      if (this.lastShot !== shot) {
        this.lastShot = shot;
        this.cutNow = true;
      }
      fov = 36 - 0.8 * this.energy * Math.exp(-((B % 1 + 1) % 1) * 5);
    }
    if (this.cutNow) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.cutNow = false;
    } else {
      const k = 1 - Math.exp(-dt * (this.mode === 'game' ? 4 : 2));
      this.camPos.lerp(pos, k);
      this.camLook.lerp(look, k);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------ 每帧
  update(dt, beat, energy, pattern) {
    this.time += dt;
    this.beat = beat;
    this.energy += (energy - this.energy) * Math.min(1, dt * 2);
    if (pattern !== undefined) this.pattern = pattern;
    if (this.targetC1) {
      this.c1.lerp(this.targetC1, Math.min(1, dt * 2));
      this.c2.lerp(this.targetC2, Math.min(1, dt * 2));
    }
    this.flashAmt = Math.max(0, this.flashAmt - dt * 3);
    const pulse = Math.exp(-(((beat % 1) + 1) % 1) * 4);
    const E = this.energy;

    // 着色器参数
    for (const m of [this.floorMat, this.ledMat]) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uBeat.value = beat;
      m.uniforms.uEnergy.value = E;
    }
    this.ledMat.uniforms.uPattern.value = this.pattern;
    this.ledMat.uniforms.uFlash.value = this.flashAmt;
    this.dustMat.uniforms.uTime.value = this.time;
    this.edgeMat.color.copy(this.c1).multiplyScalar(1.2 + pulse * E * 1.5);
    this.pillarMat.color.copy(this.c2).multiplyScalar(0.6 + pulse * E * 2.2);
    // 灯泡追逐
    const n = this.bulbs.count;
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const k = i % 30;
      const chase = Math.max(0, Math.cos((k / 30) * TAU * 2 - beat * Math.PI)) ** 6;
      const on = 0.15 + chase * (0.4 + E * 1.6) + pulse * 0.6 * E;
      col.copy(i % 2 ? this.c1 : this.c2).lerp(new THREE.Color(1, 1, 1), 0.5).multiplyScalar(on);
      this.bulbs.setColorAt(i, col);
    }
    this.bulbs.instanceColor.needsUpdate = true;

    // 光束摆动
    for (const b of this.beams) {
      if (b.follow) {
        b.mat.uniforms.uInt.value = 0.35 + 0.3 * E;
        continue;
      }
      const ph = b.i * 1.1;
      const sw = Math.sin(beat * Math.PI * 0.25 + ph) * 0.55;
      const tilt = 0.35 + 0.25 * Math.sin(beat * Math.PI * 0.125 + ph * 0.7);
      b.pivot.rotation.set(tilt, 0, sw);
      const strobe = E > 0.9 ? (Math.floor(beat * 2 + b.i) % 2 ? 1 : 0.4) : 1;
      b.mat.uniforms.uInt.value = (0.25 + E * 0.9 + pulse * E * 0.8) * strobe;
      b.mat.uniforms.uColor.value.copy(b.i % 2 ? this.c2 : this.c1);
      b.lens.material.color.copy(b.mat.uniforms.uColor.value).multiplyScalar(1.5 + pulse);
    }
    // 灯光
    this.rimL.color.copy(this.c2);
    this.rimR.color.copy(this.c1);
    this.rimL.intensity = 30 + 30 * E * pulse + this.flashAmt * 40;
    this.rimR.intensity = 30 + 30 * E * pulse + this.flashAmt * 40;
    this.key.intensity = 22 + this.flashAmt * 18;
    this.bounce.color.copy(this.c1).lerp(this.c2, 0.5);
    this.bounce.intensity = 0.8 + 1.4 * pulse * E;
    if (this.bloom) this.bloom.strength = 0.6 + 0.25 * E + this.flashAmt * 0.35;

    // 爆发粒子
    const Bst = this.burst;
    for (let i = 0; i < Bst.n; i++) {
      if (Bst.life[i] <= 0) continue;
      Bst.life[i] -= dt * 0.9;
      Bst.vel[i * 3 + 1] -= 3.2 * dt;
      const drag = Math.exp(-dt * 1.2);
      Bst.vel[i * 3] *= drag;
      Bst.vel[i * 3 + 2] *= drag;
      Bst.pos[i * 3] += Bst.vel[i * 3] * dt;
      Bst.pos[i * 3 + 1] += Bst.vel[i * 3 + 1] * dt;
      Bst.pos[i * 3 + 2] += Bst.vel[i * 3 + 2] * dt;
      if (Bst.pos[i * 3 + 1] < 0.02) {
        Bst.pos[i * 3 + 1] = 0.02;
        Bst.vel[i * 3 + 1] *= -0.3;
      }
    }
    this.burstGeo.attributes.position.needsUpdate = true;
    this.burstGeo.attributes.life.needsUpdate = true;
    this.burstGeo.attributes.color.needsUpdate = true;
    this.burstGeo.attributes.size.needsUpdate = true;

    for (const d of this.dancers) d.ctrl.update(beat, dt);
    this.updateCamera(dt);
  }

  renderReflection() {
    const cam = this.camera;
    const rc = this.reflCam;
    rc.copy(cam, false);
    rc.position.set(cam.position.x, -cam.position.y, cam.position.z);
    const look = this.camLook;
    rc.up.set(0, -1, 0);
    rc.lookAt(look.x, -look.y, look.z);
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(cam.projectionMatrix);
    this.reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.reflMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    const r = this.renderer;
    this.floor.visible = false;
    this.shadowFloor.visible = false;
    r.clippingPlanes = [this.clipPlane];
    r.setRenderTarget(this.reflRT);
    r.clear();
    r.render(this.scene, rc);
    r.setRenderTarget(null);
    r.clippingPlanes = [];
    this.floor.visible = true;
    this.shadowFloor.visible = true;
  }

  render() {
    this.renderer.shadowMap.needsUpdate = true;
    if (this.reflect) this.renderReflection();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w / 2, h / 2);
    }
    if (this.reflRT) {
      const rw = Math.floor(w * 0.5), rh = Math.floor(h * 0.5);
      this.reflRT.setSize(rw, rh);
      this.floorMat.uniforms.uTexel.value.set(1 / rw, 1 / rh);
    }
    const pix = this.renderer.getPixelRatio() * h * 0.5;
    this.dustMat.uniforms.uPix.value = pix / 100;
    this.burstMat.uniforms.uPix.value = pix / 100;
  }
}
