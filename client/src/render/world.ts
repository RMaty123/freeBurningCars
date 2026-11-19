/**
 * Svět: vozovka, svodidla, cílová brána, obloha, světla a scenérie podle prostředí
 * (pouštní kaňon při západu slunce / noční město / alpský les).
 * Všechno je generované procedurálně z definice trati.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Track, ThemeId, distToTrack } from '../game/track';
import { mulberry } from '../game/sim';
import { PAD_TILE, bannerTexture, buildingTexture, checkerTexture, groundTexture, padTexture, roadTexture, wallTexture } from './textures';
import { makeGlowPoints } from './effects';

export interface Theme {
  night: boolean;
  skyTop: number; skyHorizon: number; skyBottom: number;
  sunColor: number; sunDir: THREE.Vector3; sunIntensity: number; sunDisc: number;
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  fog: number; fogNear: number; fogFar: number;
  exposure: number; env: number;
  dust: number;
}

export const THEMES: Record<ThemeId, Theme> = {
  desert: {
    night: false,
    skyTop: 0x2b3478, skyHorizon: 0xffa25c, skyBottom: 0xd9824e,
    sunColor: 0xffb070, sunDir: new THREE.Vector3(-0.72, 0.3, -0.55).normalize(), sunIntensity: 3.4, sunDisc: 1.0,
    hemiSky: 0xffc9aa, hemiGround: 0x8a5a3c, hemiIntensity: 1.15,
    fog: 0xe9a06c, fogNear: 140, fogFar: 950,
    exposure: 1.0, env: 0.9, dust: 0xc79a6a,
  },
  city: {
    night: true,
    skyTop: 0x04050e, skyHorizon: 0x3a1f5e, skyBottom: 0x0c0a18,
    sunColor: 0xa9b8ff, sunDir: new THREE.Vector3(0.45, 0.62, 0.4).normalize(), sunIntensity: 1.5, sunDisc: 0.5,
    hemiSky: 0x8a90e8, hemiGround: 0x241a33, hemiIntensity: 1.5,
    fog: 0x1c1236, fogNear: 70, fogFar: 620,
    exposure: 1.15, env: 1.6, dust: 0x8a8a96,
  },
  forest: {
    night: false,
    skyTop: 0x2e7de0, skyHorizon: 0xd3e8ff, skyBottom: 0xa9c6da,
    sunColor: 0xfff3da, sunDir: new THREE.Vector3(0.5, 0.72, 0.38).normalize(), sunIntensity: 3.5, sunDisc: 0.8,
    hemiSky: 0xcfe2ff, hemiGround: 0x4f6f3f, hemiIntensity: 1.1,
    fog: 0xcfe3f6, fogNear: 160, fogFar: 1150,
    exposure: 1.0, env: 1.0, dust: 0x9a8f78,
  },
  airport: {
    night: true,
    // noc nad letištěm: skoro černo, u obzoru dohání teplý svit města
    skyTop: 0x03040b, skyHorizon: 0x2b1a2c, skyBottom: 0x07070c,
    sunColor: 0x8fa4ff, sunDir: new THREE.Vector3(0.42, 0.66, 0.4).normalize(), sunIntensity: 1.35, sunDisc: 0.35,
    hemiSky: 0x44507a, hemiGround: 0x120f16, hemiIntensity: 1.15,
    fog: 0x0d1020, fogNear: 90, fogFar: 720,
    exposure: 1.12, env: 1.45, dust: 0x777a80,
  },
};

/**
 * Testovací plac má vlastní „počasí“: čistý modrý den s daleko viditelným obzorem.
 * Textury (asfalt, šachovnice, brána) se berou dál podle tématu trati.
 */
const PAD_THEME: Theme = {
  night: false,
  skyTop: 0x1361cf, skyHorizon: 0xa6cdf2, skyBottom: 0x86a9c4,
  sunColor: 0xfff6e4, sunDir: new THREE.Vector3(0.42, 0.78, 0.46).normalize(), sunIntensity: 3.5, sunDisc: 0,
  hemiSky: 0xcde5ff, hemiGround: 0x4c525b, hemiIntensity: 1.2,
  fog: 0xbdd8ef, fogNear: 260, fogFar: 1600,
  exposure: 1.0, env: 1.0, dust: 0x9aa0a8,
};

export interface World {
  group: THREE.Group;
  theme: Theme;
  sun: THREE.DirectionalLight;
  sky: THREE.Mesh;
  /** u otevřených tratí posune zem za kameru (jinak nic nedělá) */
  follow(x: number, z: number): void;
  update(time: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------- pomocné funkce

/**
 * Pás podél trati mezi dvěma bočními odchylkami (a výškami nad vozovkou).
 * Výška vozovky se bere z trati, takže pásy samy kopírují stoupání a klesání.
 */
function strip(tr: Track, offA: number, yA: number, offB: number, yB: number, tile: number, alongU = false): THREE.BufferGeometry {
  const n = tr.n;
  const reps = Math.max(1, Math.round(tr.length / tile));
  const pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4);
  const idx: number[] = [];
  for (let r = 0; r <= n; r++) {
    const i = r % n;
    const v = (r / n) * reps;
    const base = tr.y[i];
    pos.set([tr.x[i] + tr.nx[i] * offA, base + yA, tr.z[i] + tr.nz[i] * offA, tr.x[i] + tr.nx[i] * offB, base + yB, tr.z[i] + tr.nz[i] * offB], r * 6);
    if (alongU) uv.set([v, 0, v, 1], r * 4); else uv.set([0, v, 1, v], r * 4);
    if (r < n) { const a = r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function paint(g: THREE.BufferGeometry, c: THREE.Color | number, fn?: (x: number, y: number, z: number, out: THREE.Color) => void): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  const p = out.attributes.position;
  const col = new Float32Array(p.count * 3);
  const base = c instanceof THREE.Color ? c : new THREE.Color(c);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    tmp.copy(base);
    if (fn) fn(p.getX(i), p.getY(i), p.getZ(i), tmp);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/** Zdeformuje vrcholy podle jejich polohy (sdílené vrcholy se pohnou stejně → žádné díry). */
function jitter(g: THREE.BufferGeometry, amount: number): THREE.BufferGeometry {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const k = 1 + ((h - Math.floor(h)) - 0.5) * 2 * amount;
    p.setXYZ(i, x * k, y * (1 + (k - 1) * 0.6), z * k);
  }
  g.computeVertexNormals();
  return g;
}

interface Inst { x: number; y: number; z: number; sx: number; sy: number; sz: number; rot: number; color?: THREE.Color }

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[], shadow: boolean): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const d = new THREE.Object3D();
  items.forEach((it, i) => {
    d.position.set(it.x, it.y, it.z);
    d.rotation.set(0, it.rot, 0);
    d.scale.set(it.sx, it.sy, it.sz);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    if (it.color) m.setColorAt(i, it.color);
  });
  m.castShadow = shadow;
  m.receiveShadow = false;
  m.instanceMatrix.needsUpdate = true;
  // instance jsou rozeseté po celé mapě – ořezávání celého objektu by je schovávalo
  m.frustumCulled = false;
  return m;
}

/** Náhodné body v pásu vzdáleností od trati. */
function scatter(tr: Track, rnd: () => number, count: number, minD: number, maxD: number, cb: (x: number, z: number, d: number) => void) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < tr.n; i++) {
    minX = Math.min(minX, tr.x[i]); maxX = Math.max(maxX, tr.x[i]);
    minZ = Math.min(minZ, tr.z[i]); maxZ = Math.max(maxZ, tr.z[i]);
  }
  minX -= maxD; maxX += maxD; minZ -= maxD; maxZ += maxD;
  let placed = 0;
  for (let tries = 0; tries < count * 40 && placed < count; tries++) {
    const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ);
    const d = distToTrack(tr, x, z, 4);
    if (d < minD || d > maxD) continue;
    cb(x, z, d);
    placed++;
  }
}

function trackCenter(tr: Track): [number, number, number] {
  let cx = 0, cz = 0;
  for (let i = 0; i < tr.n; i++) { cx += tr.x[i]; cz += tr.z[i]; }
  cx /= tr.n; cz /= tr.n;
  let r = 0;
  for (let i = 0; i < tr.n; i++) r = Math.max(r, Math.hypot(tr.x[i] - cx, tr.z[i] - cz));
  return [cx, cz, r];
}

// ---------------------------------------------------------------- obloha

function makeSky(theme: Theme, simple = false): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) },
      horizon: { value: new THREE.Color(theme.skyHorizon) },
      bottom: { value: new THREE.Color(theme.skyBottom) },
      sunColor: { value: new THREE.Color(theme.sunColor) },
      sunDir: { value: theme.sunDir.clone() },
      sunDisc: { value: theme.sunDisc },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunDisc;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(horizon, top, pow(clamp(d.y, 0.0, 1.0), 0.5));
        col = mix(col, bottom, clamp(-d.y * 5.0, 0.0, 1.0));
        #ifndef SIMPLE_SKY
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 900.0) * 9.0 * sunDisc + pow(s, 40.0) * 0.55 * sunDisc + pow(s, 5.0) * 0.16);
        #endif
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  if (simple) mat.defines = { SIMPLE_SKY: '' }; // holý přechod bez slunce – nejlevnější obloha
  const m = new THREE.Mesh(new THREE.SphereGeometry(1800, simple ? 12 : 32, simple ? 6 : 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// ---------------------------------------------------------------- scenérie

function addDesert(group: THREE.Group, tr: Track, rnd: () => number) {
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  // balvany
  const rockGeo = paint(jitter(new THREE.IcosahedronGeometry(1, 1), 0.22), 0xffffff);
  const rocks: Inst[] = [];
  scatter(tr, rnd, 320, tr.wallDist + 3, 170, (x, z, d) => {
    const s = (1 + rnd() * 3) * (d > 60 ? 2.2 : 1);
    rocks.push({ x, y: s * 0.25, z, sx: s * (0.8 + rnd() * 0.7), sy: s * (0.5 + rnd() * 0.6), sz: s * (0.8 + rnd() * 0.7), rot: rnd() * 6.3, color: new THREE.Color().setHSL(0.05 + rnd() * 0.03, 0.45, 0.32 + rnd() * 0.16) });
  });
  group.add(instanced(rockGeo, stone, rocks, true));
  // stolové hory s vrstvami
  const mesaBase = new THREE.CylinderGeometry(0.72, 1, 1, 10, 4);
  mesaBase.translate(0, 0.5, 0);
  const layers = [new THREE.Color(0x8f3f24), new THREE.Color(0xc0633a), new THREE.Color(0xa64b2c), new THREE.Color(0xd9824e), new THREE.Color(0xb2572f)];
  const mesaGeo = paint(jitter(mesaBase, 0.1), 0xffffff, (_x, y, _z, out) => out.copy(layers[Math.min(4, Math.floor(y * 5))]));
  const mesas: Inst[] = [];
  scatter(tr, rnd, 46, 70, 520, (x, z, d) => {
    const s = 22 + rnd() * 40 + d * 0.06;
    mesas.push({ x, y: -1, z, sx: s, sy: 16 + rnd() * 38 + d * 0.05, sz: s * (0.7 + rnd() * 0.6), rot: rnd() * 6.3 });
  });
  group.add(instanced(mesaGeo, stone, mesas, false));
  // kaktusy
  const green = 0x3f7a3a;
  const cactusGeo = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.26, 0.3, 3.4, 7).translate(0, 1.7, 0), green),
    paint(new THREE.CylinderGeometry(0.17, 0.17, 1.0, 6).rotateZ(Math.PI / 2).translate(0.6, 1.7, 0), green),
    paint(new THREE.CylinderGeometry(0.17, 0.17, 1.3, 6).translate(1.05, 2.3, 0), green),
    paint(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6).rotateZ(Math.PI / 2).translate(-0.5, 1.2, 0), green),
    paint(new THREE.CylinderGeometry(0.15, 0.15, 0.9, 6).translate(-0.85, 1.6, 0), green),
  ])!;
  const cacti: Inst[] = [];
  scatter(tr, rnd, 170, tr.wallDist + 2, 90, (x, z) => {
    const s = 0.8 + rnd() * 0.9;
    cacti.push({ x, y: 0, z, sx: s, sy: s * (0.8 + rnd() * 0.5), sz: s, rot: rnd() * 6.3 });
  });
  group.add(instanced(cactusGeo, stone, cacti, true));
}

function addForest(group: THREE.Group, tr: Track, rnd: () => number) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const g1 = 0x2f6b34, g2 = 0x3c7f3c, g3 = 0x4a9146;
  const pineGeo = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6).translate(0, 1.1, 0), 0x5a3d24),
    paint(new THREE.ConeGeometry(2.1, 3.6, 8).translate(0, 3.4, 0), g1),
    paint(new THREE.ConeGeometry(1.6, 3.2, 8).translate(0, 5.3, 0), g2),
    paint(new THREE.ConeGeometry(1.05, 2.8, 8).translate(0, 7.1, 0), g3),
  ])!;
  const pines: Inst[] = [];
  scatter(tr, rnd, 900, tr.wallDist + 3.5, 200, (x, z) => {
    const s = 0.9 + rnd() * 1.3;
    pines.push({ x, y: 0, z, sx: s, sy: s * (0.85 + rnd() * 0.5), sz: s, rot: rnd() * 6.3, color: new THREE.Color().setHSL(0.3, 0.1, 0.72 + rnd() * 0.28) });
  });
  group.add(instanced(pineGeo, mat, pines, true));
  // balvany
  const rockGeo = paint(jitter(new THREE.IcosahedronGeometry(1, 1), 0.2), 0x8d9096);
  const rocks: Inst[] = [];
  scatter(tr, rnd, 130, tr.wallDist + 2.5, 80, (x, z) => {
    const s = 0.6 + rnd() * 1.8;
    rocks.push({ x, y: s * 0.2, z, sx: s, sy: s * 0.7, sz: s * (0.7 + rnd() * 0.6), rot: rnd() * 6.3 });
  });
  group.add(instanced(rockGeo, mat, rocks, true));
  // hory se sněhem v kruhu kolem trati
  const [cx, cz, r] = trackCenter(tr);
  const rock = new THREE.Color(0x66707c), snow = new THREE.Color(0xf4f8ff), base = new THREE.Color(0x3d5a3e);
  const mountGeo = paint(jitter(new THREE.ConeGeometry(1, 1, 9, 5).translate(0, 0.5, 0), 0.16), 0xffffff, (_x, y, _z, out) => {
    out.copy(y > 0.62 ? snow : y > 0.22 ? rock : base);
  });
  const mounts: Inst[] = [];
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rnd() * 0.15;
    const dist = r + 330 + rnd() * 330;
    const s = 150 + rnd() * 170;
    mounts.push({ x: cx + Math.cos(a) * dist, y: -4, z: cz + Math.sin(a) * dist, sx: s, sy: 110 + rnd() * 170, sz: s, rot: rnd() * 6.3 });
  }
  const mm = instanced(mountGeo, mat, mounts, false);
  group.add(mm);
}

function addClouds(group: THREE.Group, tr: Track, rnd: () => number, color: number) {
  const [cx, cz] = trackCenter(tr);
  const mat = new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: 0.9 });
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const items: Inst[] = [];
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, dist = 500 + rnd() * 700, h = 190 + rnd() * 160;
    const bx = cx + Math.cos(a) * dist, bz = cz + Math.sin(a) * dist;
    const n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const s = 40 + rnd() * 50;
      items.push({ x: bx + (k - n / 2) * 55 + rnd() * 20, y: h + rnd() * 14, z: bz + rnd() * 40, sx: s * 1.5, sy: s * 0.42, sz: s, rot: rnd() * 6 });
    }
  }
  group.add(instanced(geo, mat, items, false));
}

function addCity(group: THREE.Group, tr: Track, rnd: () => number) {
  // --- budovy: sloučené kvádry, UV podle rozměrů (okna 3 × 3 m)
  const tints = ['#ffd58a', '#8ad8ff', '#ff8ad0'];
  const buckets = tints.map(() => ({ pos: [] as number[], uv: [] as number[], nor: [] as number[] }));
  const addBox = (b: (typeof buckets)[number], cx: number, cz: number, w: number, d: number, h: number, rot: number) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx: number, y: number, lz: number) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
    const face = (a: number[], bq: number[], cq: number[], dq: number[], nx: number, nz: number, uw: number, vh: number) => {
      // a,b dole; c,d nahoře
      const N = [nx * c + nz * s, 0, -nx * s + nz * c];
      b.pos.push(...a, ...bq, ...cq, ...a, ...cq, ...dq);
      b.uv.push(0, 0, uw, 0, uw, vh, 0, 0, uw, vh, 0, vh);
      for (let i = 0; i < 6; i++) b.nor.push(...N);
    };
    const uw = Math.max(1, Math.round(w / 3)) / 4, ud = Math.max(1, Math.round(d / 3)) / 4, vh = Math.max(1, Math.round(h / 3)) / 4;
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    face(P(x0, 0, z1), P(x1, 0, z1), P(x1, h, z1), P(x0, h, z1), 0, 1, uw, vh);
    face(P(x1, 0, z0), P(x0, 0, z0), P(x0, h, z0), P(x1, h, z0), 0, -1, uw, vh);
    face(P(x1, 0, z1), P(x1, 0, z0), P(x1, h, z0), P(x1, h, z1), 1, 0, ud, vh);
    face(P(x0, 0, z0), P(x0, 0, z1), P(x0, h, z1), P(x0, h, z0), -1, 0, ud, vh);
    // střecha (tmavý roh textury)
    b.pos.push(...P(x0, h, z1), ...P(x1, h, z1), ...P(x1, h, z0), ...P(x0, h, z1), ...P(x1, h, z0), ...P(x0, h, z0));
    for (let i = 0; i < 6; i++) { b.uv.push(0.01, 0.01); b.nor.push(0, 1, 0); }
  };
  const antennas: { x: number; y: number; z: number; size: number; color: THREE.Color }[] = [];
  const GRID = 30;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < tr.n; i++) {
    minX = Math.min(minX, tr.x[i]); maxX = Math.max(maxX, tr.x[i]);
    minZ = Math.min(minZ, tr.z[i]); maxZ = Math.max(maxZ, tr.z[i]);
  }
  const M = 240;
  for (let gx = Math.floor((minX - M) / GRID); gx <= Math.ceil((maxX + M) / GRID); gx++) {
    for (let gz = Math.floor((minZ - M) / GRID); gz <= Math.ceil((maxZ + M) / GRID); gz++) {
      const x = gx * GRID + (rnd() - 0.5) * 6, z = gz * GRID + (rnd() - 0.5) * 6;
      const w = 14 + rnd() * 11, d = 14 + rnd() * 11;
      const dist = distToTrack(tr, x, z, 3);
      if (dist < tr.wallDist + 4 + Math.hypot(w, d) / 2) continue;
      if (dist > 70 && rnd() < 0.35) continue;
      const tall = rnd() < 0.18;
      const h = Math.round((12 + rnd() * 26 + (tall ? 40 + rnd() * 50 : 0) + Math.min(40, dist * 0.12)) / 3) * 3;
      const k = Math.floor(rnd() * tints.length);
      addBox(buckets[k], x, z, w, d, h, 0);
      if (tall) antennas.push({ x, y: h + 3, z, size: 6, color: new THREE.Color(3, 0.2, 0.2) });
    }
  }
  buckets.forEach((b, k) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    const t = buildingTexture(100 + k * 7, tints[k]);
    const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.55, metalness: 0.35 });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    group.add(m);
  });

  // --- pouliční lampy se světelnými kužely na silnici
  const poles: Inst[] = [];
  const pools: Inst[] = [];
  const glows: { x: number; y: number; z: number; size: number; color: THREE.Color }[] = [...antennas];
  const warm = new THREE.Color(3.0, 1.9, 0.9);
  for (let i = 0, k = 0; i < tr.n; i += 13, k++) {
    const side = k % 2 ? 1 : -1;
    const off = side * (tr.wallDist + 1.3);
    const px = tr.x[i] + tr.nx[i] * off, pz = tr.z[i] + tr.nz[i] * off;
    const rot = Math.atan2(tr.nx[i] * -side, tr.nz[i] * -side); // rameno míří nad silnici
    poles.push({ x: px, y: tr.y[i], z: pz, sx: 1, sy: 1, sz: 1, rot });
    const lx = tr.x[i] + tr.nx[i] * (off - side * 2.6), lz = tr.z[i] + tr.nz[i] * (off - side * 2.6);
    glows.push({ x: lx, y: tr.y[i] + 7.4, z: lz, size: 5.5, color: warm });
    pools.push({ x: tr.x[i] + tr.nx[i] * side * tr.halfWidth * 0.45, y: tr.y[i] + 0.07, z: tr.z[i] + tr.nz[i] * side * tr.halfWidth * 0.45, sx: 13, sy: 1, sz: 13, rot: 0 });
  }
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.1, 0.14, 7.6, 6).translate(0, 3.8, 0),
    new THREE.BoxGeometry(0.12, 0.12, 2.8).translate(0, 7.55, 1.3),
    new THREE.BoxGeometry(0.34, 0.1, 0.7).translate(0, 7.46, 2.5),
  ])!;
  group.add(instanced(poleGeo, new THREE.MeshStandardMaterial({ color: 0x30333c, metalness: 0.8, roughness: 0.5 }), poles, false));
  // světelná kola na vozovce
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g2 = c.getContext('2d')!;
  const gr = g2.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
  const poolTex = new THREE.CanvasTexture(c);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffb46a, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pm = instanced(poolGeo, poolMat, pools, false);
  pm.renderOrder = 2;
  group.add(pm);
  group.add(makeGlowPoints(glows));

  // --- hvězdy
  const stars: { x: number; y: number; z: number; size: number; color: THREE.Color; alpha: number }[] = [];
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2, e = 0.08 + rnd() * 1.4;
    stars.push({ x: Math.cos(a) * Math.cos(e) * 1500, y: Math.sin(e) * 1500, z: Math.sin(a) * Math.cos(e) * 1500, size: 7 + rnd() * 11, color: new THREE.Color(1.6, 1.7, 2.2), alpha: 0.4 + rnd() * 0.6 });
  }
  const sp = makeGlowPoints(stars);
  (sp.material as THREE.ShaderMaterial).fog = false;
  sp.renderOrder = -9;
  group.add(sp);
}

// ---------------------------------------------------------------- letiště

function addAirport(group: THREE.Group, tr: Track, rnd: () => number) {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x53565c, roughness: 0.95, metalness: 0.03 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.68, metalness: 0.55 });
  const glows: { x: number; y: number; z: number; size: number; color: THREE.Color; alpha?: number }[] = [];
  const pools: Inst[] = [];
  const warm = new THREE.Color(2.6, 1.45, 0.55);
  const cool = new THREE.Color(0.55, 0.85, 2.5);
  const red = new THREE.Color(3.4, 0.2, 0.1);
  const white = new THREE.Color(2.6, 2.2, 1.6);
  const box = new THREE.BoxGeometry(1, 1, 1);

  // --- terminál: dlouhá hala s rozsvícenými okny a nápisem
  const winTex = buildingTexture(311, '#ffb066');
  winTex.repeat.set(14, 2);
  const termMat = new THREE.MeshStandardMaterial({
    map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 1.0,
    roughness: 0.6, metalness: 0.3,
  });
  // hala leží západně od sjezdové rovinky (ta vede u x ≈ 110), aby do ní trať nevrývala
  const hall = new THREE.Mesh(new THREE.BoxGeometry(160, 15, 42), termMat);
  hall.position.set(-10, 7.5, -58);
  hall.castShadow = true;
  hall.receiveShadow = true;
  group.add(hall);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(168, 1.3, 49), darkMetal);
  roof.position.set(-10, 15.3, -58);
  roof.castShadow = true;
  group.add(roof);
  // prosklené přízemí a nápis nad ním
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x111820, emissive: 0xffc07a, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.45 });
  const front = new THREE.Mesh(new THREE.BoxGeometry(148, 5.4, 0.8), glassMat);
  front.position.set(-10, 5.4, -36.4);
  group.add(front);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 5.5),
    new THREE.MeshBasicMaterial({ map: bannerTexture('RON BURBLE', 'AIRPORT · TERMINAL 2'), toneMapped: false }),
  );
  // nápis stojí na střeše, aby ho bylo vidět i přes vyvýšenou příjezdovou cestu
  sign.position.set(-10, 18.7, -36.2);
  group.add(sign);
  // přístřešek před halou + sloupky
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(152, 0.55, 8), darkMetal);
  canopy.position.set(-10, 9.2, -31.4);
  canopy.castShadow = true;
  group.add(canopy);
  const posts: Inst[] = [];
  for (let x = -80; x <= 60; x += 20) posts.push({ x, y: 4.6, z: -28, sx: 0.45, sy: 9.2, sz: 0.45, rot: 0 });
  group.add(instanced(box, concrete, posts, false));
  for (let x = -75; x <= 65; x += 20) glows.push({ x, y: 9.7, z: -31, size: 2.6, color: warm });

  // --- řídicí věž (mezi terminálem a sjezdovou rovinkou)
  const towerX = 90, towerZ = -100;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(7, 31, 7), concrete);
  shaft.position.set(towerX, 15.5, towerZ);
  shaft.castShadow = true;
  group.add(shaft);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(13, 5.5, 13), glassMat);
  cab.position.set(towerX, 33.7, towerZ);
  cab.castShadow = true;
  group.add(cab);
  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.8, 14.4), darkMetal);
  cabRoof.position.set(towerX, 36.8, towerZ);
  group.add(cabRoof);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 7, 6), darkMetal);
  antenna.position.set(towerX, 40.7, towerZ);
  group.add(antenna);
  glows.push({ x: towerX, y: 44.6, z: towerZ, size: 4.2, color: red });
  glows.push({ x: towerX, y: 33.7, z: towerZ + 6.7, size: 2.4, color: cool });

  // --- vícepatrová garáž pod vyvýšenou zatáčkou
  const gcx = 222, gcz = -132, gw = 150, gd = 122;
  for (const fy of [3, 9, 15]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.75, gd), concrete);
    slab.position.set(gcx, fy, gcz);
    slab.receiveShadow = true;
    group.add(slab);
    // zářivky pod stropem
    for (let gx = -3; gx <= 3; gx++) {
      for (const gz of [-1.5, 0, 1.5]) {
        glows.push({ x: gcx + gx * 19, y: fy - 0.55, z: gcz + gz * 28, size: 2.6, color: new THREE.Color(2.2, 1.9, 1.45), alpha: 0.65 });
      }
    }
  }
  const garCols: Inst[] = [];
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -2; gz <= 2; gz++) {
      garCols.push({ x: gcx + gx * 20, y: 7.7, z: gcz + gz * 24, sx: 1.2, sy: 15.4, sz: 1.2, rot: 0 });
    }
  }
  group.add(instanced(box, concrete, garCols, true));
  const beacons: Inst[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const bx = gcx + sx * (gw / 2 - 1), bz = gcz + sz * (gd / 2 - 1);
    beacons.push({ x: bx, y: 16.9, z: bz, sx: 0.35, sy: 3.0, sz: 0.35, rot: 0 });
    glows.push({ x: bx, y: 18.6, z: bz, size: 3.4, color: red });
  }
  group.add(instanced(box, darkMetal, beacons, false));
  // vjezd do garáže z rampy
  const entry = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.4, 24), darkMetal);
  entry.position.set(gcx - gw / 2 + 1, 5.4, gcz + 22);
  group.add(entry);

  // --- hangáry ve vnitřním prostoru letiště
  const hangarRoofMat = new THREE.MeshStandardMaterial({ color: 0x3a404a, roughness: 0.6, metalness: 0.5 });
  const bodyGeo = new THREE.BoxGeometry(70, 14, 44).translate(0, 7, 0);
  const roofGeo = new THREE.CylinderGeometry(22, 22, 70, 18).rotateZ(Math.PI / 2).scale(1, 0.62, 1).translate(0, 13.5, 0);
  for (const [hx, hz, rot] of [[-115, 240, 0.12], [-30, 280, -0.18], [-195, 330, 0.42]] as [number, number, number][]) {
    const h = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, darkMetal);
    body.castShadow = true; body.receiveShadow = true;
    const hroof = new THREE.Mesh(roofGeo, hangarRoofMat);
    hroof.castShadow = true;
    h.add(body, hroof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(40, 10, 0.7), new THREE.MeshStandardMaterial({ color: 0x171b21, roughness: 0.8, metalness: 0.3 }));
    door.position.set(0, 5, 22.4);
    h.add(door);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(42, 0.5, 0.4), new THREE.MeshBasicMaterial({ color: 0xffb266, toneMapped: false }));
    strip.position.set(0, 10.6, 22.6);
    h.add(strip);
    h.position.set(hx, 0, hz);
    h.rotation.y = rot;
    group.add(h);
    glows.push({ x: hx, y: 11, z: hz, size: 3.2, color: warm });
  }

  // --- odstavená dopravní letadla
  const planeMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.45, roughness: 0.45 });
  const planeDark = new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.6, roughness: 0.4 });
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffcf88, toneMapped: false });
  const makePlane = (x: number, z: number, rot: number, s: number) => {
    const g = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 14), planeMat);
    fus.rotation.x = Math.PI / 2;
    fus.castShadow = true;
    g.add(fus);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.2, 14), planeMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 17.1;
    g.add(nose);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.6, 14), planeMat);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -17.2;
    g.add(tail);
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(17, 0.5, 7), planeMat);
      wing.position.set(sx * 9.2, -1.4, -1.5);
      wing.rotation.y = sx * 0.22;
      wing.castShadow = true;
      g.add(wing);
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 10).rotateX(Math.PI / 2), planeDark);
      eng.position.set(sx * 7.5, -2.4, 0.5);
      g.add(eng);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 24), windowMat);
      win.position.set(sx * 2.16, 0.75, 0);
      g.add(win);
    }
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.4, 5.4), planeMat);
    fin.position.set(0, 2.7, -12.8);
    g.add(fin);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 3.2), planeMat);
    stab.position.set(0, 0.5, -15.8);
    g.add(stab);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.scale.setScalar(s);
    group.add(g);
    glows.push({ x, y: 1.4, z, size: 2.6, color: white });
  };
  makePlane(185, 62, -0.15, 1);
  makePlane(-8, 566, 0.32, 1.12);

  // --- stožáry osvětlení apronu
  const mastGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.32, 0.5, 25, 8).translate(0, 12.5, 0),
    new THREE.BoxGeometry(5.2, 1.5, 1.4).translate(0, 25.2, 0),
  ])!;
  const masts: Inst[] = [];
  for (const [mx, mz, rot] of [[178, 18, 0.4], [-6, -18, -0.5], [150, 250, 0.2], [-150, 372, 1.2], [-330, 118, 2.1], [-64, 500, 0.8]] as [number, number, number][]) {
    masts.push({ x: mx, y: 0, z: mz, sx: 1, sy: 1, sz: 1, rot });
    glows.push({ x: mx, y: 25.6, z: mz, size: 9, color: warm });
    pools.push({ x: mx, y: 0.03, z: mz, sx: 46, sy: 1, sz: 46, rot: 0 });
  }
  group.add(instanced(mastGeo, darkMetal, masts, false));

  // --- runway / taxiway obrysová světla podél celé trati
  for (let i = 0; i < tr.n; i += 4) {
    const side = (i / 4) % 2 ? 1 : -1;
    const off = side * (tr.wallDist + 0.7);
    const px = tr.x[i] + tr.nx[i] * off, pz = tr.z[i] + tr.nz[i] * off;
    const onRunway = tr.z[i] > 355 && tr.y[i] < 0.6;
    glows.push({
      x: px, y: tr.y[i] + 1.1, z: pz,
      size: onRunway ? 3.1 : 2.0,
      color: onRunway ? white : tr.y[i] > 1 ? cool : warm,
    });
  }

  // --- světelné kaluže na zemi (stejná technika jako noční město)
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g2 = c.getContext('2d')!;
  const gr = g2.createRadialGradient(64, 64, 2, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
  const poolTex = new THREE.CanvasTexture(c);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffb46a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pm = instanced(poolGeo, poolMat, pools, false);
  pm.renderOrder = 2;
  group.add(pm);

  // --- vzdálené město a jeho svit
  const [ccx, ccz] = trackCenter(tr);
  const cityMat = new THREE.MeshStandardMaterial({ color: 0x0b0d14, roughness: 0.95, metalness: 0.05 });
  const city: Inst[] = [];
  for (let i = 0; i < 46; i++) {
    const a = 0.15 + rnd() * 2.35;
    const dist = 620 + rnd() * 430;
    const w = 14 + rnd() * 30, d = 14 + rnd() * 30, h = 16 + rnd() * 78;
    const bx = ccx + Math.cos(a) * dist, bz = ccz + Math.sin(a) * dist;
    city.push({ x: bx, y: 0, z: bz, sx: w, sy: h, sz: d, rot: rnd() * 3 });
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      glows.push({
        x: bx + (rnd() - 0.5) * w, y: 3 + rnd() * h, z: bz + (rnd() - 0.5) * d,
        size: 2.2 + rnd() * 1.8, color: rnd() < 0.7 ? new THREE.Color(1.6, 0.9, 0.4) : new THREE.Color(0.6, 1.0, 1.6),
        alpha: 0.5 + rnd() * 0.4,
      });
    }
  }
  group.add(instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cityMat, city, false));
  for (let i = 0; i < 90; i++) {
    const a = 0.1 + rnd() * 2.4;
    glows.push({
      x: ccx + Math.cos(a) * (980 + rnd() * 120), y: 4 + rnd() * 46, z: ccz + Math.sin(a) * (980 + rnd() * 120),
      size: 4 + rnd() * 7, color: new THREE.Color(1.3, 0.55, 0.22), alpha: 0.35 + rnd() * 0.35,
    });
  }

  // --- hvězdy
  const stars: { x: number; y: number; z: number; size: number; color: THREE.Color; alpha: number }[] = [];
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2, e = 0.06 + rnd() * 1.4;
    stars.push({ x: Math.cos(a) * Math.cos(e) * 1500, y: Math.sin(e) * 1500, z: Math.sin(a) * Math.cos(e) * 1500, size: 6 + rnd() * 9, color: new THREE.Color(1.5, 1.6, 2.1), alpha: 0.35 + rnd() * 0.55 });
  }
  const sp = makeGlowPoints(stars);
  (sp.material as THREE.ShaderMaterial).fog = false;
  sp.renderOrder = -9;
  group.add(sp);

  group.add(makeGlowPoints(glows));
}

/**
 * Mostní konstrukce pod vyvýšenou vozovkou: spodní deska, vnější hrany a pilíře.
 * Na rovinatých tratích se hned skončí, takže si ostatní mapy ničeho nevšimnou.
 */
function addSupports(group: THREE.Group, tr: Track) {
  let raised = false;
  for (let i = 0; i < tr.n; i += 3) if (tr.y[i] > 0.8) { raised = true; break; }
  if (!raised) return;
  const concrete = new THREE.MeshStandardMaterial({ color: 0x565a60, roughness: 0.94, metalness: 0.04, side: THREE.DoubleSide });
  const wd = tr.wallDist;
  const deck = mergeGeometries([
    strip(tr, wd, -0.72, -wd, -0.72, 16),
    strip(tr, wd + 0.72, 0, wd + 0.72, -0.72, 12, true),
    strip(tr, -wd - 0.72, 0, -wd - 0.72, -0.72, 12, true),
  ])!;
  const dm = new THREE.Mesh(deck, concrete);
  dm.castShadow = true;
  dm.receiveShadow = true;
  group.add(dm);

  const cols: Inst[] = [], caps: Inst[] = [];
  for (let i = 0; i < tr.n; i += 6) {
    const h = tr.y[i];
    if (h < 0.9) continue;
    const rot = Math.atan2(tr.tx[i], tr.tz[i]);
    const off = tr.halfWidth * 0.72;
    for (const side of [-1, 1]) {
      const px = tr.x[i] + tr.nx[i] * off * side, pz = tr.z[i] + tr.nz[i] * off * side;
      const ph = h - 0.72;
      if (ph < 0.3) continue;
      cols.push({ x: px, y: ph / 2, z: pz, sx: 0.9, sy: ph, sz: 0.9, rot });
      caps.push({ x: px, y: ph + 0.1, z: pz, sx: 1.7, sy: 0.32, sz: 1.1, rot });
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  group.add(instanced(box, concrete, cols, true));
  group.add(instanced(box, concrete, caps, false));
}


export function buildWorld(tr: Track): World {
  const themeId = tr.def.theme;
  const open = !!tr.def.open; // otevřený plac: bez svodidel a scenérie, zem jde do nekonečna
  const theme = open ? PAD_THEME : THEMES[themeId];
  const group = new THREE.Group();
  const rnd = mulberry(tr.def.id.length * 977 + tr.n);

  // obloha + světla
  const sky = makeSky(theme, open);
  group.add(sky);
  const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 10; sc.far = 320;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  group.add(sun, sun.target);

  // země
  // Na otevřeném placu není zem terén, ale rovnou vozovka – asfalt s čarami pokračuje do nekonečna.
  const GTILE = open ? PAD_TILE : 4400 / 110;
  const gt = open ? padTexture() : groundTexture(themeId);
  gt.repeat.setScalar(4400 / GTILE);
  // Země je dělená na menší čtverce (obří trojúhelníky dělají na některých GPU nepřesnou hloubku)
  // a polygonOffset ji drží bezpečně pod vozovkou.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4400, 4400, 64, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: gt, roughness: open ? 0.85 : 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 }),
  );
  const [ccx, ccz] = trackCenter(tr);
  // Když zemí posouváme po celých dlaždicích textury, švy nejsou vidět a plocha o poloměru 2200 m
  // je pořád dál než mlha → plac působí nekonečně do všech stran.
  ground.position.set(open ? 0 : ccx, -0.08, open ? 0 : ccz);
  ground.receiveShadow = true;
  group.add(ground);

  // vozovka od svodidla ke svodidlu (na otevřeném placu je vozovkou rovnou celá zem)
  if (!open) {
    const shoulder = (tr.wallDist - tr.halfWidth) / (2 * tr.wallDist);
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTexture(themeId, shoulder, tr.def.lanes), roughness: themeId === 'city' ? 0.55 : 0.85, metalness: themeId === 'city' ? 0.25 : 0.0 });
    const road = new THREE.Mesh(strip(tr, tr.wallDist, 0, -tr.wallDist, 0, 12), roadMat);
    road.receiveShadow = true;
    group.add(road);
    addSupports(group, tr);
  }

  // svodidla (profil betonového bloku) – otevřený plac je bez nich
  const wd = tr.wallDist;
  const neon: { m: THREE.MeshBasicMaterial; c: THREE.Color }[] = [];
  if (!open) {
    const wallGeo = mergeGeometries([
      strip(tr, wd, 0, wd + 0.16, 1.05, 8, true), strip(tr, wd + 0.16, 1.05, wd + 0.56, 1.05, 8, true), strip(tr, wd + 0.56, 1.05, wd + 0.72, 0, 8, true),
      strip(tr, -wd, 0, -wd - 0.16, 1.05, 8, true), strip(tr, -wd - 0.16, 1.05, -wd - 0.56, 1.05, 8, true), strip(tr, -wd - 0.56, 1.05, -wd - 0.72, 0, 8, true),
    ])!;
    const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ map: wallTexture(themeId), roughness: 0.9, side: THREE.DoubleSide }));
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    if (theme.night) {
      // neonové pásky na svodidlech; letiště má teplou sodíkovou a modrobílou
      const mk = (side: number, color: THREE.Color) => {
        const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide });
        neon.push({ m: mat, c: color });
        group.add(new THREE.Mesh(strip(tr, side * (wd + 0.1), 0.72, side * (wd + 0.15), 0.98, 8, true), mat));
      };
      if (themeId === 'airport') {
        mk(1, new THREE.Color(1.0, 0.58, 0.2));
        mk(-1, new THREE.Color(0.45, 0.68, 1.0));
      } else {
        mk(1, new THREE.Color(1.0, 0.1, 0.75));
        mk(-1, new THREE.Color(0.1, 0.9, 1.0));
      }
    }
  }

  // cílová brána + šachovnice
  const gate = new THREE.Group();
  gate.position.set(tr.x[0], tr.y[0], tr.z[0]);
  gate.rotation.y = Math.atan2(tr.tx[0], tr.tz[0]);
  const span = (wd + 1.4) * 2;
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d36, metalness: 0.85, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.6, 0.7), metal);
    p.position.set((sx * span) / 2, 4.3, 0);
    p.castShadow = true;
    gate.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 0.7, 1.9, 0.5), metal);
  beam.position.y = 7.9;
  beam.castShadow = true;
  gate.add(beam);
  const bt = bannerTexture('FREE BURNIN’N CARS', 'START  ·  CÍL');
  const bannerMat = new THREE.MeshBasicMaterial({ map: bt, toneMapped: false });
  for (const dir of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(span - 0.4, 1.7), bannerMat);
    b.position.set(0, 7.9, dir * 0.27);
    if (dir < 0) b.rotation.y = Math.PI;
    gate.add(b);
  }
  const checker = new THREE.Mesh(
    new THREE.PlaneGeometry(tr.halfWidth * 2, 2.4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  );
  checker.position.y = 0.03;
  checker.receiveShadow = true;
  gate.add(checker);
  group.add(gate);

  // scenérie (na otevřeném placu žádná – holá plocha a jednoduchá obloha nic nezatěžují)
  if (open) { /* nic */ }
  else if (themeId === 'desert') { addDesert(group, tr, rnd); addClouds(group, tr, rnd, 0xffc0a0); }
  else if (themeId === 'forest') { addForest(group, tr, rnd); addClouds(group, tr, rnd, 0xffffff); }
  else if (themeId === 'airport') { addAirport(group, tr, rnd); }
  else { addCity(group, tr, rnd); }

  return {
    group, theme, sun, sky,
    follow(x: number, z: number) {
      if (!open) return;
      ground.position.x = Math.round(x / GTILE) * GTILE;
      ground.position.z = Math.round(z / GTILE) * GTILE;
    },
    update(time: number) {
      // neony lehce pulzují
      neon.forEach((n, i) => {
        const k = 0.85 + 0.15 * Math.sin(time * 3 + i * 2);
        n.m.color.copy(n.c).multiplyScalar(k);
      });
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
        for (const mat of mats) {
          for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
            if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
          }
          mat.dispose();
        }
      });
      sun.shadow.map?.dispose();
    },
  };
}
