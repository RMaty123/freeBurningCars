/**
 * Vykreslování hry: scéna, auta, střely, bedny, kamery a split-screen.
 * Simulaci jen čte – nic v ní nemění.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexCss } from '../game/cars';
import type { Car, PickupKind, Sim, SimEvent } from '../game/sim';
import type { Track } from '../game/track';
import { buildCar, CarVisual, disposeCar, setWrecked } from './carModel';
import { Effects, pointScale } from './effects';
import { headlightTexture, nameTagTexture, PICKUP_HEX, pickupTexture, blobTexture } from './textures';
import { buildWorld, World } from './world';

export interface ViewRect { x: number; y: number; w: number; h: number; carId: number; }

interface CarView {
  v: CarVisual;
  tag: THREE.Sprite;
  headlight: THREE.Mesh | null;
  blob: THREE.Mesh;
  wrecked: boolean;
  roll: number; pitch: number;
  smokeAcc: number; tireAcc: number; fireAcc: number;
}

interface Rig {
  cam: THREE.PerspectiveCamera;
  carId: number; // -1 = televizní kamera
  heading: number;
  fov: number;
  shake: number;
  init: boolean;
  rect: { x: number; y: number; w: number; h: number };
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export class GameView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  effects = new Effects();
  world: World | null = null;
  quality: 'high' | 'low' = 'high';

  private cars: CarView[] = [];
  private carGroup = new THREE.Group();
  private rigs: Rig[] = [];
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;

  private bullets: THREE.InstancedMesh;
  /** paprsky laseru – jeden na auto, staví se až když je potřeba */
  private beams: THREE.Mesh[] = [];
  private beamGeo: THREE.BufferGeometry | null = null;
  private tmpColor = new THREE.Color();
  private tmpVec = new THREE.Vector3();
  private rockets: THREE.InstancedMesh;
  private pickupGroup = new THREE.Group();
  private pickupMeshes = new Map<number, THREE.Group>();
  private pickupMats = new Map<PickupKind, THREE.MeshStandardMaterial>();
  private pickupGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  private ringGeo = new THREE.RingGeometry(1.1, 1.5, 24).rotateX(-Math.PI / 2);
  private headTex = headlightTexture();
  private blobTex = blobTexture();
  private dummy = new THREE.Object3D();
  private time = 0;
  /** vzdálenost televizní kamery od auta */
  tvDist = 12.5;
  private tvTarget = 0;
  private tvSwitch = 0;
  private width = 1; private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.scene.add(this.carGroup, this.pickupGroup, this.effects.group);

    // střely
    const bulletGeo = new THREE.BoxGeometry(0.1, 0.1, 2.8);
    this.bullets = new THREE.InstancedMesh(bulletGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 400);
    const rocketGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8).rotateX(Math.PI / 2),
      new THREE.ConeGeometry(0.14, 0.4, 8).rotateX(Math.PI / 2).translate(0, 0, 0.75),
      new THREE.BoxGeometry(0.5, 0.04, 0.3).translate(0, 0, -0.45),
      new THREE.BoxGeometry(0.04, 0.5, 0.3).translate(0, 0, -0.45),
    ])!;
    this.rockets = new THREE.InstancedMesh(rocketGeo, new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.6, roughness: 0.35, emissive: 0x551100 }), 24);
    for (const m of [this.bullets, this.rockets]) {
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
    }
    this.rockets.castShadow = true;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.width = window.innerWidth; this.height = window.innerHeight;
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.renderer.setSize(this.width, this.height, false);
  }

  setQuality(q: 'high' | 'low') {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === 'high';
    if (this.world) this.world.sun.castShadow = q === 'high';
    for (const c of this.cars) c.blob.visible = q === 'low';
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    this.resize();
  }

  // ------------------------------------------------------------ trať / svět
  setTrack(track: Track) {
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); }
    this.world = buildWorld(track);
    this.scene.add(this.world.group);
    const th = this.world.theme;
    this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    this.renderer.toneMappingExposure = th.exposure;
    this.effects.dust.setHex(th.dust);
    this.world.sun.castShadow = this.quality === 'high';

    // odrazy na laku: environment mapa z oblohy (v noci navíc pár "neonů")
    const envScene = new THREE.Scene();
    const sky = this.world.sky.clone();
    envScene.add(sky);
    if (th.night) {
      const cards: [number, number, number, number][] = [[0xff2bd0, 300, 120, 0], [0x22e0ff, -300, 100, 80], [0xffb060, 0, 160, -320], [0x8060ff, 80, 90, 320]];
      for (const [c, x, y, z] of cards) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 110), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), side: THREE.DoubleSide }));
        m.position.set(x, y, z);
        m.lookAt(0, 0, 0);
        envScene.add(m);
      }
    }
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 1, 4000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = th.env;
  }

  // ------------------------------------------------------------ nový závod
  setSim(sim: Sim, viewCarIds: number[]) {
    for (const c of this.cars) { this.carGroup.remove(c.v.root); disposeCar(c.v); (c.tag.material as THREE.SpriteMaterial).map?.dispose(); c.tag.material.dispose(); }
    this.cars = [];
    this.effects.clear();
    const night = !!this.world?.theme.night;
    for (const c of sim.cars) {
      const v = buildCar(c.stats.shape, c.color, c.gun);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTagTexture(c.name, hexCss(c.tagColor)), depthWrite: false, transparent: true, fog: false }));
      tag.scale.set(3.0, 0.75, 1);
      tag.position.y = v.roofY + 1.15;
      tag.renderOrder = 20;
      v.root.add(tag);
      let headlight: THREE.Mesh | null = null;
      if (night) {
        headlight = new THREE.Mesh(
          new THREE.PlaneGeometry(9, 20).rotateX(-Math.PI / 2).rotateY(Math.PI),
          new THREE.MeshBasicMaterial({ map: this.headTex, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xfff0d0 }),
        );
        headlight.position.set(0, 0.08, c.stats.shape.length / 2 + 7.5);
        headlight.renderOrder = 3;
        v.root.add(headlight);
      }
      const blob = new THREE.Mesh(
        new THREE.PlaneGeometry(c.stats.shape.width * 1.7, c.stats.shape.length * 1.5).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: 0.9 }),
      );
      blob.position.y = 0.05;
      blob.visible = this.quality === 'low';
      v.root.add(blob);
      this.carGroup.add(v.root);
      this.cars.push({ v, tag, headlight, blob, wrecked: false, roll: 0, pitch: 0, smokeAcc: 0, tireAcc: 0, fireAcc: 0 });
    }
    // bedny
    this.pickupGroup.clear();
    this.pickupMeshes.clear();
    for (const p of sim.pickups) {
      let mat = this.pickupMats.get(p.kind);
      if (!mat) {
        const t = pickupTexture(p.kind);
        mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.4, metalness: 0.3 });
        this.pickupMats.set(p.kind, mat);
      }
      const g = new THREE.Group();
      const boxM = new THREE.Mesh(this.pickupGeo, mat);
      boxM.castShadow = true;
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: PICKUP_HEX[p.kind], transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      ring.position.y = 0.07;
      g.add(boxM, ring);
      g.position.set(p.x, 0, p.z);
      this.pickupGroup.add(g);
      this.pickupMeshes.set(p.id, g);
    }
    this.setViews(viewCarIds);
  }

  /** Rozdělení obrazovky: 1 hráč = celá, 2 = nad sebou, 3–4 = mřížka 2×2 (při 3 hráčích je čtvrté okno TV kamera). */
  setViews(carIds: number[]) {
    const n = carIds.length;
    const ids = n === 0 ? [-1] : n === 3 ? [...carIds, -1] : carIds.slice(0, 4);
    const rects =
      ids.length === 1 ? [{ x: 0, y: 0, w: 1, h: 1 }]
      : ids.length === 2 ? [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }]
      : [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }];
    this.rigs = ids.map((carId, i) => ({
      cam: new THREE.PerspectiveCamera(62, 1, 0.5, 4000),
      carId, heading: 0, fov: 62, shake: 0, init: false, rect: rects[i],
    }));
  }

  /** Obdélníky jednotlivých pohledů v CSS pixelech (pro HUD). */
  getRects(): ViewRect[] {
    return this.rigs.map((r) => ({ x: r.rect.x * this.width, y: r.rect.y * this.height, w: r.rect.w * this.width, h: r.rect.h * this.height, carId: r.carId }));
  }

  /** Mesh paprsku pro auto `i` (válec podél osy Z o jednotkové délce). */
  private beam(i: number): THREE.Mesh {
    let m = this.beams[i];
    if (m) return m;
    this.beamGeo ??= new THREE.CylinderGeometry(1, 1, 1, 8, 1).rotateX(Math.PI / 2);
    m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false,
    }));
    m.frustumCulled = false;
    this.scene.add(m);
    this.beams[i] = m;
    return m;
  }

  // ------------------------------------------------------------ události → efekty
  handleEvents(sim: Sim, events: SimEvent[]) {
    const fx = this.effects;
    for (const e of events) {
      switch (e.t) {
        case 'shot': {
          const c = sim.cars[e.car];
          fx.muzzle(e.x, this.cars[e.car].v.shoulder + 0.08, e.z, Math.sin(c.h), Math.cos(c.h));
          break;
        }
        case 'hit':
          fx.sparks(e.x, 0.9, e.z, 5, 8);
          this.shakeCar(e.car, 0.12);
          break;
        case 'spark': fx.sparks(e.x, 0.7, e.z, 4, 7); break;
        case 'beam': {
          const c = sim.cars[e.car];
          const cv = this.cars[e.car];
          cv.v.body.updateWorldMatrix(true, false);
          for (const mz of cv.v.muzzles) {
            const o = cv.v.body.localToWorld(this.tmpVec.copy(mz));
            fx.flash(o.x, o.y, o.z, 1.8, 1.2, 2.4, 3.2, 0.18);
          }
          break;
        }
        case 'wall':
          fx.sparks(e.x, 0.6, e.z, Math.min(16, 4 + e.force), 6 + e.force * 0.4);
          this.shakeCar(e.car, Math.min(0.7, e.force * 0.04));
          break;
        case 'crash':
          fx.sparks(e.x, 0.8, e.z, Math.min(20, 5 + e.force), 8 + e.force * 0.4);
          this.shakeCar(e.a, Math.min(0.8, e.force * 0.05));
          this.shakeCar(e.b, Math.min(0.8, e.force * 0.05));
          break;
        case 'boom':
          fx.explosion(e.x, e.z, e.size);
          for (const r of this.rigs) {
            if (r.carId < 0) continue;
            const c = sim.cars[r.carId];
            const d = Math.hypot(c.x - e.x, c.z - e.z);
            if (d < 45) r.shake = Math.max(r.shake, (1 - d / 45) * 1.3 * e.size);
          }
          break;
        case 'pickup':
          fx.pickupBurst(e.x, e.z, new THREE.Color(PICKUP_HEX[e.kind]));
          break;
        case 'respawn': {
          const c = sim.cars[e.car];
          fx.flash(c.x, 1, c.z, 9, 0.8, 1.6, 3.0, 0.3);
          break;
        }
      }
    }
  }

  private shakeCar(carId: number, amount: number) {
    for (const r of this.rigs) if (r.carId === carId) r.shake = Math.max(r.shake, amount);
  }

  // ------------------------------------------------------------ synchronizace se simulací
  update(sim: Sim, dt: number) {
    this.time += dt;
    const fx = this.effects;
    const t = this.time;

    sim.cars.forEach((c, i) => {
      const cv = this.cars[i];
      if (!cv) return;
      const v = cv.v;
      const fxd = Math.sin(c.h), fzd = Math.cos(c.h);
      v.root.position.set(c.x, 0, c.z);
      v.root.rotation.y = c.h;

      if (c.dead !== cv.wrecked) { cv.wrecked = c.dead; setWrecked(v, c.dead); }
      cv.tag.visible = !c.dead;
      if (cv.headlight) cv.headlight.visible = !c.dead;

      if (c.dead) {
        // vrak nadskočí a hoří
        const k = 2.6 - c.deadT;
        v.root.position.y = Math.max(0, 7 * k - 9.5 * k * k);
        v.body.rotation.x = Math.min(0.5, k * 1.2) * 0.4;
        v.body.rotation.z = 0.12;
        cv.fireAcc += dt * 26;
        while (cv.fireAcc > 1) { cv.fireAcc--; fx.wreckFire(c.x, v.root.position.y + 0.9, c.z); }
        v.root.visible = true;
        return;
      }
      v.root.visible = c.invuln <= 0 || Math.floor(t * 14) % 2 === 0;

      // náklon karoserie
      const rollT = THREE.MathUtils.clamp(c.yawRate * c.speed * 0.0017, -0.1, 0.1);
      const pitchT = THREE.MathUtils.clamp(-c.accel * 0.0032, -0.05, 0.07);
      const k = Math.min(1, dt * 9);
      cv.roll += (rollT - cv.roll) * k; cv.pitch += (pitchT - cv.pitch) * k;
      v.body.rotation.z = cv.roll;
      v.body.rotation.x = cv.pitch;
      v.body.position.y = Math.abs(c.speed) > 3 ? Math.sin(t * 31 + i) * 0.006 : Math.sin(t * 22 + i) * 0.004; // chvění motoru

      // kola
      const spin = (c.speed * dt) / c.stats.shape.wheelR;
      for (let w = 0; w < 4; w++) v.spins[w].rotation.x += spin;
      v.wheels[0].rotation.y = v.wheels[1].rotation.y = -c.steer * 0.42;

      // světla + záblesk při zásahu
      v.rearLights.emissiveIntensity = c.input.brake > 0.1 ? 4.5 : 1.4;
      const fl = c.hitFlash * 3;
      v.paint.emissive.setRGB(fl, fl * 0.8, fl * 0.6);

      // částice
      const rearX = c.x - fxd * (c.stats.shape.length / 2), rearZ = c.z - fzd * (c.stats.shape.length / 2);
      if (c.nitroOn) {
        for (const sx of [-0.5, 0.5]) {
          fx.nitroFlame(rearX - fzd * sx, v.shape.ground + 0.14, rearZ + fxd * sx, c.vx - fxd * 9, c.vz - fzd * 9);
        }
      }
      if ((c.drifting || c.slip > 5.5) && Math.abs(c.speed) > 8) {
        cv.tireAcc += dt * 46;
        while (cv.tireAcc > 1) { cv.tireAcc--; const sx = Math.random() < 0.5 ? -0.8 : 0.8; fx.tireSmoke(rearX - fzd * sx + fxd * 0.6, rearZ + fxd * sx + fzd * 0.6, c.vx, c.vz); }
      }
      const hpK = c.hp / c.stats.hp;
      if (hpK < 0.5) {
        cv.smokeAcc += dt * (hpK < 0.25 ? 30 : 14);
        while (cv.smokeAcc > 1) { cv.smokeAcc--; fx.damageSmoke(c.x + fxd * 1.2, v.shoulder + 0.1, c.z + fzd * 1.2, c.vx, c.vz, hpK < 0.25); }
      }
    });

    // střely
    const d = this.dummy;
    let n = 0;
    for (const b of sim.bullets) {
      if (n >= 400) break;
      d.position.set(b.x, 0.85, b.z);
      d.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
      // těžší kulomet má větší a delší stopu
      d.scale.set(b.gun.tracer, b.gun.tracer, 0.7 + b.gun.tracer * 0.5);
      d.updateMatrix();
      this.bullets.setMatrixAt(n, d.matrix);
      this.bullets.setColorAt(n, this.tmpColor.setHex(b.gun.color));
      n++;
    }
    this.bullets.count = n;
    this.bullets.instanceMatrix.needsUpdate = true;
    if (this.bullets.instanceColor) this.bullets.instanceColor.needsUpdate = true;

    // paprsky laseru: vedou z ústí zbraní (u PRISM z obou dveří) a končí tam, kam dosáhly
    this.beams.forEach((m) => (m.visible = false));
    sim.cars.forEach((c, i) => {
      const cv = this.cars[i];
      if (!cv) return;
      // čočky zbraně svítí podle nabití, ať je na autě vidět, že se chystá pálit
      if (c.gun.kind === 'beam') {
        const k = c.beam > 0 ? 1 : c.charge / (c.gun.chargeMax ?? 1);
        cv.v.laser.color.setHex(c.gun.color).multiplyScalar(0.3 + 0.7 * k);
      }
      if (c.beam <= 0 || c.dead) return;
      const fade = Math.min(1, c.beam * 3);                     // na konci dohasne
      const fx2 = Math.sin(c.h), fz2 = Math.cos(c.h);
      cv.v.body.updateWorldMatrix(true, false);
      c.beamLen.forEach((raw, k) => {
        const m = this.beam(i * 2 + k);
        const len = Math.max(0.8, raw);
        const r = (0.15 + Math.sin(t * 48 + i + k) * 0.015) * fade; // lehce pulzuje
        // začátek paprsku je přesně v ústí hlavně
        const mz = cv.v.muzzles[Math.min(k, cv.v.muzzles.length - 1)];
        const o = mz ? cv.v.body.localToWorld(this.tmpVec.copy(mz)) : this.tmpVec.set(c.x + fx2 * 1.6, cv.v.shoulder, c.z + fz2 * 1.6);
        const ox = o.x, oy = o.y, oz = o.z;
        m.visible = true;
        m.position.set(ox + fx2 * (len / 2), oy, oz + fz2 * (len / 2));
        m.rotation.set(0, c.h, 0);
        m.scale.set(r, r, len);
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.setHex(c.gun.color);
        mat.opacity = 0.5 + 0.35 * fade;
        fx.flash(ox + fx2 * 0.3, oy, oz + fz2 * 0.3, 0.85 * fade, 1.4, 2.6, 3.0, 0.06);
        if (raw < c.gun.range - 0.5) fx.sparks(ox + fx2 * len, oy, oz + fz2 * len, 2, 6, 1.6, 2.6, 3.2);
      });
    });

    n = 0;
    for (const r of sim.rockets) {
      if (n >= 24) break;
      d.position.set(r.x, 0.95, r.z);
      d.rotation.set(0, r.h, t * 9);
      d.updateMatrix();
      this.rockets.setMatrixAt(n++, d.matrix);
      fx.rocketTrail(r.x, 0.95, r.z, Math.sin(r.h), Math.cos(r.h));
    }
    this.rockets.count = n;
    this.rockets.instanceMatrix.needsUpdate = true;

    // bedny
    for (const p of sim.pickups) {
      const g = this.pickupMeshes.get(p.id);
      if (!g) continue;
      g.visible = p.cooldown <= 0;
      const boxM = g.children[0];
      boxM.rotation.y = t * 1.6 + p.id;
      boxM.rotation.x = 0.35;
      boxM.position.y = 1.35 + Math.sin(t * 2.6 + p.id) * 0.22;
      const s = 1 + Math.sin(t * 4 + p.id) * 0.08;
      g.children[1].scale.set(s, 1, s);
    }

    fx.update(dt);
    this.world?.update(t);
    this.updateCameras(sim, dt);
  }

  private updateCameras(sim: Sim, dt: number) {
    const t = this.time;
    // televizní kamera: krouží kolem auta a občas přepne na jiné
    this.tvSwitch -= dt;
    if (this.tvSwitch <= 0 || !sim.cars[this.tvTarget] || sim.cars[this.tvTarget].dead) {
      this.tvSwitch = 9;
      const alive = sim.cars.filter((c) => !c.dead);
      const lead = alive.sort((a, b) => a.rank - b.rank)[Math.floor(Math.random() * Math.min(3, alive.length))];
      this.tvTarget = lead ? lead.id : 0;
    }
    for (const r of this.rigs) {
      const cam = r.cam;
      const c = sim.cars[r.carId >= 0 ? r.carId : this.tvTarget];
      if (!c) continue;
      r.shake = Math.max(0, r.shake - dt * 2.4);
      const sh = r.shake * r.shake;
      const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;

      if (r.carId < 0) {
        // krouží kolem auta; vyhlazuje se jen úhel, takže kamera autu neujede
        const want = c.h + 2.5 + Math.sin(t * 0.22) * 1.1;
        if (!r.init) { r.heading = want; r.init = true; }
        r.heading += angDiff(want, r.heading) * (1 - Math.exp(-2.5 * dt));
        const dist = this.tvDist, hgt = dist * 0.37 + Math.sin(t * 0.3) * 1.2;
        cam.position.set(c.x + Math.sin(r.heading) * dist, hgt, c.z + Math.cos(r.heading) * dist);
        cam.lookAt(c.x, 1.0, c.z);
        r.fov = 52;
      } else {
        // za autem: směr kamery se plynule dotahuje ke směru jízdy (v driftu je vidět bok auta)
        let want = c.h;
        const sp = Math.hypot(c.vx, c.vz);
        if (sp > 6 && c.speed > 0 && !c.dead) want = c.h + angDiff(Math.atan2(c.vx, c.vz), c.h) * 0.55;
        if (!r.init) { r.heading = want; r.init = true; }
        r.heading += angDiff(want, r.heading) * (1 - Math.exp(-(c.dead ? 1 : 7) * dt));
        const dx = Math.sin(r.heading), dz = Math.cos(r.heading);
        const speedK = THREE.MathUtils.clamp(Math.abs(c.speed) / 70, 0, 1);
        const dist = (c.dead ? 9.5 : 5.5 + speedK * 1.3) + c.stats.shape.length * 0.22;
        const hgt = c.dead ? 4.0 : 2.35 + c.stats.shape.cabinH;
        cam.position.set(c.x - dx * dist + sx, hgt + sy, c.z - dz * dist + sx);
        cam.lookAt(c.x + dx * 5, 1.25 + sy * 0.5, c.z + dz * 5);
        const fovT = 60 + speedK * 13 + (c.nitroOn ? 9 : 0);
        r.fov += (fovT - r.fov) * Math.min(1, dt * 5);
      }
    }
  }

  // ------------------------------------------------------------ náhled tratě
  /**
   * Vyrenderuje jeden snímek aktuální scény a vrátí ho jako JPEG (data URL).
   * Používá se pro obrázky na kartách ve výběru tratě. Volat po setTrack() + setSim(sim, []).
   */
  snapshot(sim: Sim, width = 640, height = 360): string {
    this.update(sim, 1 / 60);
    const rig = this.rigs[0];
    const order = [...sim.cars].sort((a, b) => a.rank - b.rank);
    const c = order[Math.min(1, order.length - 1)];
    if (rig && c) {
      // kamera šikmo zepředu na druhé auto v pořadí, ať je v záběru auto i kus trati
      const a = c.h + 0.55;
      rig.cam.position.set(c.x + Math.sin(a) * 9.5, 2.6, c.z + Math.cos(a) * 9.5);
      rig.cam.lookAt(c.x - Math.sin(c.h) * 4, 1.1, c.z - Math.cos(c.h) * 4);
      rig.fov = 58;
      this.tvTarget = c.id;
    }
    this.render(sim);
    const src = this.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const g = out.getContext('2d')!;
    // ořez na poměr stran náhledu
    const k = Math.min(src.width / width, src.height / height);
    const sw = width * k, sh = height * k;
    g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, width, height);
    return out.toDataURL('image/jpeg', 0.82);
  }

  // ------------------------------------------------------------ vykreslení
  render(sim: Sim | null) {
    const rn = this.renderer;
    const W = this.width, H = this.height;
    rn.setScissorTest(false);
    rn.setViewport(0, 0, W, H);
    rn.setClearColor(0x000000, 1);
    rn.clear();
    rn.setScissorTest(true);
    const world = this.world;
    for (const r of this.rigs) {
      const x = Math.round(r.rect.x * W), w = Math.round(r.rect.w * W), h = Math.round(r.rect.h * H);
      const y = H - Math.round(r.rect.y * H) - h; // WebGL má počátek vlevo dole
      rn.setViewport(x, y, w, h);
      rn.setScissor(x, y, w, h);
      const cam = r.cam;
      cam.aspect = w / h;
      // v širokém/nízkém okně držíme vodorovný záběr rozumný
      cam.fov = cam.aspect > 2.4 ? r.fov * 0.8 : r.fov;
      cam.updateProjectionMatrix();
      pointScale.value = (h * rn.getPixelRatio()) / (2 * Math.tan((cam.fov * Math.PI) / 360));
      if (world) {
        // stíny: světlo "sleduje" místo, kam se dívá tahle kamera
        const c = sim?.cars[r.carId >= 0 ? r.carId : this.tvTarget];
        const fxp = c ? c.x + Math.sin(c.h) * 18 : cam.position.x, fzp = c ? c.z + Math.cos(c.h) * 18 : cam.position.z;
        world.sun.target.position.set(fxp, 0, fzp);
        world.sun.position.set(fxp + world.theme.sunDir.x * 160, world.theme.sunDir.y * 160, fzp + world.theme.sunDir.z * 160);
        world.sky.position.copy(cam.position).setY(0);
        world.follow(cam.position.x, cam.position.z); // otevřený plac: zem jede s kamerou
      }
      // vlastní jmenovku ve svém okně nevidíš (nezaclání ve výhledu)
      const own = r.carId >= 0 ? this.cars[r.carId] : null;
      const was = own ? own.tag.visible : false;
      if (own) own.tag.visible = false;
      rn.render(this.scene, cam);
      if (own) own.tag.visible = was;
    }
    rn.setScissorTest(false);
  }
}
