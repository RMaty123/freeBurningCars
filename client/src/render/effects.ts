/**
 * Částicové efekty: oheň, kouř, jiskry, výbuchy, záře světel.
 * Všechny částice jsou ve dvou objektech THREE.Points (aditivní "světlo" a normální "kouř"),
 * takže stojí jen dva draw-cally bez ohledu na počet.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute vec4 aColor;
  attribute float aSize;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(1024.0, aSize * uScale / max(0.1, -mv.z));
  }
`;
const FRAG = /* glsl */ `
  varying vec4 vColor;
  uniform float uSoft;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(uSoft, 1.0, d);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Sdílený uniform: přepočet velikosti bodů podle výšky právě kresleného výřezu obrazovky. */
export const pointScale = { value: 400 };

function makeMaterial(additive: boolean, soft: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uScale: pointScale, uSoft: { value: soft } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** Statické svítící body (lampy, hvězdy, neonové tečky). */
export function makeGlowPoints(items: { x: number; y: number; z: number; size: number; color: THREE.Color; alpha?: number }[]): THREE.Points {
  const n = items.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n);
  items.forEach((it, i) => {
    pos.set([it.x, it.y, it.z], i * 3);
    col.set([it.color.r, it.color.g, it.color.b, it.alpha ?? 1], i * 4);
    size[i] = it.size;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const p = new THREE.Points(g, makeMaterial(true, 0.0));
  p.frustumCulled = false;
  return p;
}

interface P {
  life: number; max: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  s0: number; s1: number;
  r: number; g: number; b: number;
  /** barva na konci života (pro oheň → kouř) */
  r1: number; g1: number; b1: number;
  a: number;
  drag: number; grav: number;
}

class Pool {
  points: THREE.Points;
  private ps: P[] = [];
  private pos: Float32Array; private col: Float32Array; private size: Float32Array;
  private next = 0;
  constructor(private cap: number, additive: boolean) {
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap);
    for (let i = 0; i < cap; i++) this.ps.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, r: 1, g: 1, b: 1, r1: 1, g1: 1, b1: 1, a: 1, drag: 0, grav: 0 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, makeMaterial(additive, additive ? 0.0 : 0.25));
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
  }
  spawn(): P {
    const p = this.ps[this.next];
    this.next = (this.next + 1) % this.cap;
    p.drag = 0; p.grav = 0; p.a = 1;
    return p;
  }
  update(dt: number) {
    const { ps, pos, col, size } = this;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.life <= 0) { size[i] = 0; continue; }
      p.life -= dt;
      const k = 1 - Math.max(0, p.life) / p.max; // 0 → 1
      if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05 && p.grav > 0) { p.y = 0.05; p.vy = -p.vy * 0.4; p.vx *= 0.7; p.vz *= 0.7; }
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 4] = p.r + (p.r1 - p.r) * k; col[i * 4 + 1] = p.g + (p.g1 - p.g) * k; col[i * 4 + 2] = p.b + (p.b1 - p.b) * k;
      // rychlý náběh, pozvolné zhasnutí
      col[i * 4 + 3] = p.a * Math.min(1, k * 12) * (1 - k) ** 1.2;
      size[i] = p.life > 0 ? p.s0 + (p.s1 - p.s0) * k : 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
  clear() { for (const p of this.ps) p.life = 0; }
}

const R = Math.random;
const rr = (a: number, b: number) => a + R() * (b - a);

export class Effects {
  private glow = new Pool(1400, true);
  private smoke = new Pool(900, false);
  group = new THREE.Group();
  /** barva kouře/prachu podle prostředí */
  dust = new THREE.Color(0.6, 0.55, 0.5);

  constructor() {
    this.group.add(this.smoke.points, this.glow.points);
  }

  update(dt: number) { this.glow.update(dt); this.smoke.update(dt); }
  clear() { this.glow.clear(); this.smoke.clear(); }

  private fire(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, hot = 1) {
    const p = this.glow.spawn();
    p.life = p.max = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.s0 = size * 0.5; p.s1 = size * 1.6;
    p.r = 3.2 * hot; p.g = 1.5 * hot; p.b = 0.35 * hot; p.r1 = 0.9; p.g1 = 0.12; p.b1 = 0.02;
    p.drag = 2.2; p.a = 0.9;
  }

  private puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, shade: number, alpha: number) {
    const p = this.smoke.spawn();
    p.life = p.max = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.s0 = size * 0.4; p.s1 = size * 2.2;
    p.r = p.g = p.b = shade; p.r1 = p.g1 = p.b1 = shade * 0.8;
    p.drag = 1.5; p.a = alpha;
  }

  sparks(x: number, y: number, z: number, n: number, speed = 9, cr = 3.0, cg = 2.0, cb = 0.7) {
    for (let i = 0; i < n; i++) {
      const p = this.glow.spawn();
      const a = R() * Math.PI * 2, e = R() * 1.2;
      const sp = speed * rr(0.3, 1);
      p.life = p.max = rr(0.25, 0.7);
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * Math.cos(e) * sp; p.vy = Math.sin(e) * sp + 1.5; p.vz = Math.sin(a) * Math.cos(e) * sp;
      p.s0 = rr(0.14, 0.3); p.s1 = 0.04;
      p.r = cr; p.g = cg; p.b = cb; p.r1 = cr * 0.6; p.g1 = cg * 0.25; p.b1 = 0;
      p.grav = 16; p.drag = 0.6;
    }
  }

  flash(x: number, y: number, z: number, size: number, r = 3, g = 2.2, b = 1.2, life = 0.12) {
    const p = this.glow.spawn();
    p.life = p.max = life; p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0;
    p.s0 = size; p.s1 = size * 1.5; p.r = r; p.g = g; p.b = b; p.r1 = r; p.g1 = g * 0.6; p.b1 = b * 0.3; p.a = 0.75;
  }

  explosion(x: number, z: number, size: number, baseY = 0) {
    const y = baseY + 0.8;
    this.flash(x, y + 0.6, z, 16 * size, 3.2, 2.4, 1.4, 0.16);
    this.flash(x, y + 0.6, z, 34 * size, 1.2, 0.6, 0.2, 0.3);
    const nf = Math.round(26 * size);
    for (let i = 0; i < nf; i++) {
      const a = R() * Math.PI * 2, sp = rr(2, 13) * size;
      this.fire(x + rr(-0.6, 0.6), y + rr(0, 1.2), z + rr(-0.6, 0.6), Math.cos(a) * sp, rr(2, 11) * size, Math.sin(a) * sp, rr(2.4, 5) * size, rr(0.45, 1.0), rr(0.7, 1.2));
    }
    const ns = Math.round(16 * size);
    for (let i = 0; i < ns; i++) {
      const a = R() * Math.PI * 2, sp = rr(1, 7) * size;
      this.puff(x + rr(-1, 1), y + rr(0.5, 2), z + rr(-1, 1), Math.cos(a) * sp, rr(2.5, 7), Math.sin(a) * sp, rr(3, 6) * size, rr(1.2, 2.6), rr(0.05, 0.22), 0.75);
    }
    this.sparks(x, y, z, Math.round(34 * size), 24 * size);
  }

  muzzle(x: number, y: number, z: number, dx: number, dz: number) {
    this.flash(x + dx * 0.4, y, z + dz * 0.4, 1.5, 3.4, 2.6, 1.0, 0.05);
    const p = this.glow.spawn();
    p.life = p.max = 0.07; p.x = x + dx * 0.9; p.y = y; p.z = z + dz * 0.9;
    p.vx = dx * 14; p.vy = 0; p.vz = dz * 14;
    p.s0 = 0.9; p.s1 = 0.3; p.r = 3.4; p.g = 2.2; p.b = 0.6; p.r1 = 2; p.g1 = 0.6; p.b1 = 0; p.a = 0.9;
  }

  tireSmoke(x: number, z: number, vx: number, vz: number, baseY = 0) {
    this.puff(x + rr(-0.2, 0.2), baseY + 0.25, z + rr(-0.2, 0.2), vx * 0.15 + rr(-0.6, 0.6), rr(0.6, 1.6), vz * 0.15 + rr(-0.6, 0.6), rr(1.1, 1.8), rr(0.5, 0.95), rr(0.7, 0.86), 0.34);
  }

  dustPuff(x: number, z: number, vx: number, vz: number, baseY = 0) {
    const p = this.smoke.spawn();
    p.life = p.max = rr(0.6, 1.1); p.x = x; p.y = baseY + 0.2; p.z = z;
    p.vx = vx * 0.1 + rr(-0.8, 0.8); p.vy = rr(0.5, 1.4); p.vz = vz * 0.1 + rr(-0.8, 0.8);
    p.s0 = 0.8; p.s1 = rr(2.5, 4);
    p.r = this.dust.r; p.g = this.dust.g; p.b = this.dust.b; p.r1 = p.r; p.g1 = p.g; p.b1 = p.b;
    p.drag = 1.2; p.a = 0.28;
  }

  /** Kouř (a při velkém poškození oheň) z motoru. */
  damageSmoke(x: number, y: number, z: number, vx: number, vz: number, severe: boolean) {
    this.puff(x + rr(-0.2, 0.2), y, z + rr(-0.2, 0.2), vx * 0.3 + rr(-0.5, 0.5), rr(1.5, 3), vz * 0.3 + rr(-0.5, 0.5), rr(1.0, 1.7), rr(0.6, 1.1), severe ? rr(0.04, 0.12) : rr(0.25, 0.4), severe ? 0.7 : 0.45);
    if (severe && R() < 0.6) this.fire(x + rr(-0.25, 0.25), y, z + rr(-0.25, 0.25), vx * 0.5, rr(1, 2.5), vz * 0.5, rr(0.8, 1.4), rr(0.2, 0.4));
  }

  wreckFire(x: number, y: number, z: number) {
    this.fire(x + rr(-0.8, 0.8), y, z + rr(-0.8, 0.8), rr(-0.5, 0.5), rr(2, 4.5), rr(-0.5, 0.5), rr(1.4, 2.6), rr(0.35, 0.7));
    if (R() < 0.5) this.puff(x + rr(-0.6, 0.6), y + 1, z + rr(-0.6, 0.6), rr(-0.5, 0.5), rr(2.5, 5), rr(-0.5, 0.5), rr(2, 3.4), rr(1.2, 2.2), rr(0.03, 0.1), 0.7);
  }

  /** Plamen z výfuku při nitru. */
  nitroFlame(x: number, y: number, z: number, vx: number, vz: number) {
    const p = this.glow.spawn();
    p.life = p.max = rr(0.1, 0.2); p.x = x; p.y = y; p.z = z;
    p.vx = vx + rr(-0.6, 0.6); p.vy = rr(-0.2, 0.5); p.vz = vz + rr(-0.6, 0.6);
    p.s0 = 0.75; p.s1 = 0.15;
    p.r = 0.5; p.g = 1.6; p.b = 3.6; p.r1 = 0.3; p.g1 = 0.2; p.b1 = 2.2; p.a = 0.9;
  }

  rocketTrail(x: number, y: number, z: number, dx: number, dz: number) {
    this.fire(x - dx * 0.6, y, z - dz * 0.6, -dx * 6 + rr(-1, 1), rr(-0.5, 0.5), -dz * 6 + rr(-1, 1), 0.9, 0.16, 1.2);
    this.puff(x - dx * 1.0, y, z - dz * 1.0, rr(-0.6, 0.6), rr(0.2, 1), rr(-0.6, 0.6), 0.9, rr(0.5, 0.9), rr(0.6, 0.8), 0.4);
  }

  pickupBurst(x: number, z: number, c: THREE.Color, baseY = 0) {
    this.flash(x, baseY + 1.2, z, 7, c.r * 2.4, c.g * 2.4, c.b * 2.4, 0.22);
    this.sparks(x, baseY + 1.2, z, 14, 8, c.r * 3, c.g * 3, c.b * 3);
  }
}
