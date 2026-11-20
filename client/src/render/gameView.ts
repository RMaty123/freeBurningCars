/**
 * Vykreslování hry: scéna, auta, střely, bedny, kamery a split-screen.
 * Simulaci jen čte – nic v ní nemění.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexCss } from '../game/cars';
import { MAX_DROPS, type Car, type PickupKind, type Sim, type SimEvent } from '../game/sim';
import type { Track } from '../game/track';
import { buildCar, CarVisual, disposeCar, setWrecked } from './carModel';
import { ballParts, BALL_COLORS, BALL_R, HOOK_COLORS, hookHeadParts, mergeParts, MINE_COLORS, mineParts, ROCKET_COLORS } from './secModel';
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
  /** otáčky svazku hlavní minigunu (rad/s) – roztáčí se při střelbě a pak dobíhá */
  gunSpin: number;
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

/** typy televizních záběrů */
const SHOT_CHASE = 0, SHOT_FLYBY = 1, SHOT_CRANE = 2;
/** Kolik háků se naráz vykreslí – simulace jich víc než jeden na auto nepustí. */
const MAX_HOOKS = 8;
/** Osa, podél které jsou postavené lano i hlavice háku. */
const FWD = new THREE.Vector3(0, 0, 1);

export class GameView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  effects = new Effects();
  world: World | null = null;
  private track: Track | null = null;
  /** v menu (lobby, výběr tratě) kamera jen pomalu letí nad tratí místo televizní režie */
  menuCam = false;
  private droneS = 0;
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
  private tmpDir = new THREE.Vector3();
  private tmpVec2 = new THREE.Vector3();
  private rockets: THREE.InstancedMesh;
  /** miny: tělo, výstražný pruh a svítící čočka – každý materiál jedna instancovaná síť */
  private mines: THREE.InstancedMesh[] = [];
  /** ta z nich, co svítí – každá mina si v ní blikne vlastní barvou */
  private mineLight: THREE.InstancedMesh | null = null;
  /** míčky: skořápka a červené pruhy */
  private balls: THREE.InstancedMesh[] = [];
  /** rozpínající se EMP vlny: prstenec ve výšce aut a druhý po zemi (jedna dvojice na vlnu) */
  private waves: THREE.Mesh[] = [];
  private waveRings: THREE.Mesh[] = [];
  private waveGeo: THREE.BufferGeometry | null = null;
  private waveRingGeo: THREE.BufferGeometry | null = null;
  /** hlavice háků ve vzduchu a lana k nim (jedno na auto) */
  private hookHeads: THREE.InstancedMesh;
  private ropes: THREE.Mesh[] = [];
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
  /** televizní kamera: typ záběru, zbývající čas, pevný bod (průlet / jeřáb) a vyhlazená pozice */
  private tvShot = SHOT_CHASE;
  private tvShotT = 0;
  private tvCut = true;
  private tvAnchor = new THREE.Vector3();
  private tvPos = new THREE.Vector3();
  private tvLook = new THREE.Vector3();
  private tvFov = 52;
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
    // olivový trup, motor zezadu žhne – stejná barva jako raketa v nabídce
    this.rockets = new THREE.InstancedMesh(rocketGeo, new THREE.MeshStandardMaterial({ color: ROCKET_COLORS.metal, metalness: 0.5, roughness: 0.45, emissive: 0x3a2a04 }), 24);
    // miny leží na zemi: stejný model jako v nabídce, jen kreslený instancovaně
    const mp = mineParts();
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const mineMats: [THREE.BufferGeometry[], THREE.Material][] = [
      [mp.metal, new THREE.MeshStandardMaterial({ color: MINE_COLORS.metal, metalness: 0.8, roughness: 0.34 })],
      [mp.dark, new THREE.MeshStandardMaterial({ color: MINE_COLORS.dark, metalness: 0.5, roughness: 0.6 })],
      [mp.stripe, new THREE.MeshStandardMaterial({ color: MINE_COLORS.stripe, metalness: 0.3, roughness: 0.5 })],
      [mp.glow, lightMat],
    ];
    for (const [parts, mat] of mineMats) {
      const geo = mergeParts(parts);
      if (!geo) continue;
      const im = new THREE.InstancedMesh(geo, mat, MAX_DROPS);
      im.castShadow = mat !== lightMat;
      if (mat === lightMat) this.mineLight = im;
      this.mines.push(im);
    }
    // míčky: je jich hodně a jsou malé, takže bez stínů – jinak by to zbytečně zdražilo snímek
    const bp = ballParts();
    const ballMats: [THREE.BufferGeometry[], THREE.Material][] = [
      [bp.shell, new THREE.MeshStandardMaterial({ color: BALL_COLORS.shell, metalness: 0.25, roughness: 0.45 })],
      [bp.band, new THREE.MeshStandardMaterial({ color: BALL_COLORS.band, metalness: 0.2, roughness: 0.5 })],
    ];
    for (const [parts, mat] of ballMats) {
      const geo = mergeParts(parts);
      if (geo) this.balls.push(new THREE.InstancedMesh(geo, mat, MAX_DROPS));
    }
    // hlavice háku: stejný kus železa jako v nabídce
    const hookGeo = mergeParts(hookHeadParts())!;
    this.hookHeads = new THREE.InstancedMesh(hookGeo, new THREE.MeshStandardMaterial({ color: HOOK_COLORS.metal, metalness: 0.85, roughness: 0.3 }), MAX_HOOKS);
    this.hookHeads.castShadow = true;
    for (const m of [this.bullets, this.rockets, ...this.mines, ...this.balls, this.hookHeads]) {
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
    // Na 4K TV znamená pixelRatio 2 čtyřnásobek pixelů a tím i delší snímek – a delší snímek
    // je přímo odezva ovládání (vstup se zpracuje mezi snímky). 1,5 je rozumný strop.
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1);
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
    this.track = track;
    this.droneS = 0;
    this.tvCut = true;
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
      // barvy "neonů" v odrazech laku: letiště má sodíkovou oranžovou a studenou runway modř
      const cards: [number, number, number, number][] = this.track.def.theme === 'airport'
        ? [[0xffa23c, 300, 120, 0], [0x6fa8ff, -300, 100, 80], [0xff7a2a, 0, 160, -320], [0xe8f2ff, 80, 90, 320]]
        : [[0xff2bd0, 300, 120, 0], [0x22e0ff, -300, 100, 80], [0xffb060, 0, 160, -320], [0x8060ff, 80, 90, 320]];
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
      const v = buildCar(c.stats.shape, c.color, c.gun, c.sec);
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
      this.cars.push({ v, tag, headlight, blob, wrecked: false, roll: 0, pitch: 0, smokeAcc: 0, tireAcc: 0, fireAcc: 0, gunSpin: 0 });
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
      g.position.set(p.x, p.y, p.z);
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

  /**
   * EMP vlna `i`: dva tenké prstence (jeden po zemi, druhý ve výšce aut), které se rozjíždějí ven.
   * Schválně to není koule ani průhledná stěna – kamera bývá vlně v cestě a plocha přes půl
   * obrazovky by s aditivním mícháním obraz vybílila. Dva prstence jsou levné a čitelné.
   */
  private wave(i: number): [THREE.Mesh, THREE.Mesh] {
    if (this.waves[i]) return [this.waves[i], this.waveRings[i]];
    // mezikruží: při zvětšení zůstane poměrně tenké, ať je vlna jakkoli velká
    this.waveGeo ??= new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2);
    this.waveRingGeo ??= new THREE.RingGeometry(0.965, 1, 48).rotateX(-Math.PI / 2);
    const mat = () => new THREE.MeshBasicMaterial({
      color: 0x4fc3ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide,
    });
    const high = new THREE.Mesh(this.waveGeo, mat());
    const ground = new THREE.Mesh(this.waveRingGeo, mat());
    for (const m of [high, ground]) { m.frustumCulled = false; this.scene.add(m); }
    this.waves[i] = high;
    this.waveRings[i] = ground;
    return [high, ground];
  }

  /** Mesh lana pro hák `i` (stejný válec jako paprsek, jen tmavý a tenký). */
  private rope(i: number): THREE.Mesh {
    let m = this.ropes[i];
    if (m) return m;
    this.beamGeo ??= new THREE.CylinderGeometry(1, 1, 1, 8, 1).rotateX(Math.PI / 2);
    m = new THREE.Mesh(this.beamGeo, new THREE.MeshStandardMaterial({ color: 0x59616e, metalness: 0.5, roughness: 0.6 }));
    m.frustumCulled = false;
    this.scene.add(m);
    this.ropes[i] = m;
    return m;
  }

  // ------------------------------------------------------------ události → efekty
  handleEvents(sim: Sim, events: SimEvent[]) {
    const fx = this.effects;
    for (const e of events) {
      switch (e.t) {
        case 'shot': {
          const c = sim.cars[e.car];
          fx.muzzle(e.x, (e.y ?? 0) + this.cars[e.car].v.shoulder + 0.08, e.z, Math.sin(c.h), Math.cos(c.h));
          break;
        }
        case 'hit':
          fx.sparks(e.x, (e.y ?? 0) + 0.9, e.z, 5, 8);
          this.shakeCar(e.car, 0.12);
          break;
        case 'spark': fx.sparks(e.x, (e.y ?? 0) + 0.7, e.z, 4, 7); break;
        case 'beam': {
          const cv = this.cars[e.car];
          cv.v.body.updateWorldMatrix(true, false);
          for (const mz of cv.v.muzzles) {
            const o = cv.v.body.localToWorld(this.tmpVec.copy(mz));
            fx.flash(o.x, o.y, o.z, 1.8, 1.2, 2.4, 3.2, 0.18);
          }
          break;
        }
        case 'wall':
          fx.sparks(e.x, (e.y ?? 0) + 0.6, e.z, Math.min(16, 4 + e.force), 6 + e.force * 0.4);
          this.shakeCar(e.car, Math.min(0.7, e.force * 0.04));
          break;
        case 'land': {
          // dopad ze seskokové rampy: prach od kol a lehké zatřesení
          const n = Math.min(14, 3 + Math.round(e.force * 0.4));
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            fx.dustPuff(e.x + Math.sin(a) * 1.6, e.z + Math.cos(a) * 1.6, Math.sin(a) * 5, Math.cos(a) * 5, e.y);
          }
          this.shakeCar(e.car, Math.min(0.9, e.force * 0.05));
          break;
        }
        case 'crash':
          fx.sparks(e.x, (e.y ?? 0) + 0.8, e.z, Math.min(20, 5 + e.force), 8 + e.force * 0.4);
          this.shakeCar(e.a, Math.min(0.8, e.force * 0.05));
          this.shakeCar(e.b, Math.min(0.8, e.force * 0.05));
          break;
        case 'boom':
          fx.explosion(e.x, e.z, e.size, e.y ?? 0);
          for (const r of this.rigs) {
            if (r.carId < 0) continue;
            const c = sim.cars[r.carId];
            const d = Math.hypot(c.x - e.x, c.z - e.z);
            if (d < 45) r.shake = Math.max(r.shake, (1 - d / 45) * 1.3 * e.size);
          }
          break;
        case 'pickup':
          fx.pickupBurst(e.x, e.z, new THREE.Color(PICKUP_HEX[e.kind]), e.y ?? 0);
          break;
        case 'respawn': {
          const c = sim.cars[e.car];
          fx.flash(c.x, c.y + 1, c.z, 9, 0.8, 1.6, 3.0, 0.3);
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
      v.root.position.set(c.x, c.y, c.z);
      v.root.rotation.y = c.h;

      if (c.dead !== cv.wrecked) { cv.wrecked = c.dead; setWrecked(v, c.dead); }
      cv.tag.visible = !c.dead;
      if (cv.headlight) cv.headlight.visible = !c.dead;

      if (c.dead) {
        // vrak nadskočí a hoří
        const k = 2.6 - c.deadT;
        v.root.position.y = c.y + Math.max(0, 7 * k - 9.5 * k * k);
        v.body.rotation.x = Math.min(0.5, k * 1.2) * 0.4;
        v.body.rotation.z = 0.12;
        cv.fireAcc += dt * 26;
        while (cv.fireAcc > 1) { cv.fireAcc--; fx.wreckFire(c.x, v.root.position.y + 0.9, c.z); }
        v.root.visible = true;
        return;
      }
      v.root.visible = c.invuln <= 0 || Math.floor(t * 14) % 2 === 0;

      // náklon karoserie – sklon vozovky se přičítá k rozjezdu/brzdění
      const rollT = THREE.MathUtils.clamp(c.yawRate * c.speed * 0.0017, -0.1, 0.1);
      const pitchT = THREE.MathUtils.clamp(-c.accel * 0.0032, -0.05, 0.07) - Math.atan(c.grade);
      const k = Math.min(1, dt * 9);
      cv.roll += (rollT - cv.roll) * k; cv.pitch += (pitchT - cv.pitch) * k;
      v.body.rotation.z = cv.roll;
      v.body.rotation.x = cv.pitch;
      v.body.position.y = Math.abs(c.speed) > 3 ? Math.sin(t * 31 + i) * 0.006 : Math.sin(t * 22 + i) * 0.004; // chvění motoru
      // světelný kužel se na svahu naklopí s vozovkou, ať nezajede do kopce
      if (cv.headlight) {
        const ga = Math.atan(c.grade);
        cv.headlight.rotation.x = -ga;
        cv.headlight.position.y = 0.08 + Math.tan(ga) * (c.stats.shape.length / 2 + 7.5);
      }

      // kola
      const spin = (c.speed * dt) / c.stats.shape.wheelR;
      for (let w = 0; w < 4; w++) v.spins[w].rotation.x += spin;
      v.wheels[0].rotation.y = v.wheels[1].rotation.y = -c.steer * 0.42;

      // minigun: při střelbě se svazek hlavní roztočí, po puštění spouště dobíhá
      if (v.gunSpins.length) {
        const want = c.fireCd > 0 ? 34 : 0;
        cv.gunSpin += (want - cv.gunSpin) * Math.min(1, dt * (want ? 9 : 2.4));
        if (cv.gunSpin > 0.02) for (const g of v.gunSpins) g.rotation.z += cv.gunSpin * dt;
      }

      // světla + záblesk při zásahu
      v.rearLights.emissiveIntensity = Math.max(c.input.brake, c.assistK) > 0.1 ? 4.5 : 1.4;
      const fl = c.hitFlash * 3;
      v.paint.emissive.setRGB(fl, fl * 0.8, fl * 0.6);

      // částice
      const rearX = c.x - fxd * (c.stats.shape.length / 2), rearZ = c.z - fzd * (c.stats.shape.length / 2);
      if (c.nitroOn) {
        for (const sx of [-0.5, 0.5]) {
          fx.nitroFlame(rearX - fzd * sx, c.y + v.shape.ground + 0.14, rearZ + fxd * sx, c.vx - fxd * 9, c.vz - fzd * 9);
        }
      }
      if ((c.drifting || c.slip > 5.5) && Math.abs(c.speed) > 8) {
        cv.tireAcc += dt * 46;
        while (cv.tireAcc > 1) { cv.tireAcc--; const sx = Math.random() < 0.5 ? -0.8 : 0.8; fx.tireSmoke(rearX - fzd * sx + fxd * 0.6, rearZ + fxd * sx + fzd * 0.6, c.vx, c.vz, c.y); }
      }
      const hpK = c.hp / c.stats.hp;
      if (hpK < 0.5) {
        cv.smokeAcc += dt * (hpK < 0.25 ? 30 : 14);
        while (cv.smokeAcc > 1) { cv.smokeAcc--; fx.damageSmoke(c.x + fxd * 1.2, c.y + v.shoulder + 0.1, c.z + fzd * 1.2, c.vx, c.vz, hpK < 0.25); }
      }
    });

    // střely
    const d = this.dummy;
    let n = 0;
    for (const b of sim.bullets) {
      if (n >= 400) break;
      d.position.set(b.x, b.y, b.z);
      d.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
      // těžší kulomet má větší a delší stopu
      d.scale.set(b.gun.tracer, b.gun.tracer, 0.7 + b.gun.tracer * 0.5);
      d.updateMatrix();
      this.bullets.setMatrixAt(n, d.matrix);
      this.bullets.setColorAt(n, this.tmpColor.setHex(b.gun.color));
      n++;
    }
    // na GPU posíláme jen když je co kreslit (nebo se to zrovna vyprázdnilo)
    const hadBullets = this.bullets.count;
    this.bullets.count = n;
    if (n || hadBullets) {
      this.bullets.instanceMatrix.needsUpdate = true;
      if (this.bullets.instanceColor) this.bullets.instanceColor.needsUpdate = true;
    }

    // paprsky laseru: vedou z ústí zbraní (u PRISM z obou dveří) a končí tam, kam dosáhly
    this.beams.forEach((m) => (m.visible = false));
    sim.cars.forEach((c, i) => {
      const cv = this.cars[i];
      if (!cv) return;
      // čočky zbraně svítí podle nabití, ať je na autě vidět, že se chystá pálit
      if (c.gun.kind !== 'bullet') {
        const k = c.beam > 0 ? 1 : c.charge / (c.gun.chargeMax ?? 1);
        // u EMP plně nabité jádro ještě pulzuje, ať je poznat, že se dá vystřelit
        const pulse = c.gun.kind === 'emp' && k >= 1 ? 1.15 + Math.sin(t * 9) * 0.35 : 0.3 + 0.7 * k;
        cv.v.laser.color.setHex(c.gun.color).multiplyScalar(c.gun.kind === 'emp' ? pulse : 0.3 + 0.7 * k);
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
        const o = mz ? cv.v.body.localToWorld(this.tmpVec.copy(mz)) : this.tmpVec.set(c.x + fx2 * 1.6, c.y + cv.v.shoulder, c.z + fz2 * 1.6);
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
      d.position.set(r.x, r.y, r.z);
      d.rotation.set(0, r.h, t * 9);
      d.updateMatrix();
      this.rockets.setMatrixAt(n++, d.matrix);
      fx.rocketTrail(r.x, r.y, r.z, Math.sin(r.h), Math.cos(r.h));
    }
    const hadRockets = this.rockets.count;
    this.rockets.count = n;
    if (n || hadRockets) this.rockets.instanceMatrix.needsUpdate = true;

    // miny a míčky leží v jednom seznamu, každý se ale kreslí svou sadou sítí
    n = 0;
    let nb = 0;
    for (const m of sim.drops) {
      if (m.def.id === 'ball') {
        if (nb >= MAX_DROPS) continue;
        d.position.set(m.x, m.gy + m.y + BALL_R, m.z);
        d.rotation.set(m.roll, m.yaw, 0, 'YXZ');  // kutálí se ve směru, kterým letí
        d.updateMatrix();
        for (const im of this.balls) im.setMatrixAt(nb, d.matrix);
        nb++;
        continue;
      }
      if (n >= MAX_DROPS) continue;
      // mina: nenatažená jen slabě doutná, natažená zvolna pulzuje, zapálená bliká naplno
      d.position.set(m.x, m.gy, m.z);
      d.rotation.set(0, m.id * 1.37, 0);
      d.scale.setScalar(m.arm > 0 ? 0.75 + 0.25 * (1 - m.arm / (m.def.arm ?? 0.8)) : 1); // při položení "dosedne"
      d.updateMatrix();
      for (const im of this.mines) im.setMatrixAt(n, d.matrix);
      const blink = m.fuse > 0 ? 1 : m.arm > 0 ? 0.2 : 0.45 + Math.sin(t * 5 + m.id) * 0.4;
      this.mineLight?.setColorAt(n, this.tmpColor.setHex(MINE_COLORS.glow).multiplyScalar(0.35 + 0.8 * blink));
      d.scale.setScalar(1);
      n++;
    }
    const hadMines = this.mines[0]?.count ?? 0;
    if (n || hadMines) {
      for (const im of this.mines) { im.count = n; im.instanceMatrix.needsUpdate = true; }
      if (this.mineLight?.instanceColor) this.mineLight.instanceColor.needsUpdate = true;
    }
    const hadBalls = this.balls[0]?.count ?? 0;
    if (nb || hadBalls) for (const im of this.balls) { im.count = nb; im.instanceMatrix.needsUpdate = true; }

    // háky: hlavice ve vzduchu a napnuté lano od vrhače na kapotě
    this.ropes.forEach((m) => (m.visible = false));
    let nh = 0;
    for (const h of sim.hooks) {
      if (nh >= MAX_HOOKS) break;
      const cv = this.cars[h.owner];
      if (!cv) continue;
      cv.v.body.updateWorldMatrix(true, false);
      const mz = cv.v.hookMuzzle;
      const o = mz
        ? cv.v.body.localToWorld(this.tmpVec.copy(mz))
        : this.tmpVec.set(sim.cars[h.owner].x, sim.cars[h.owner].y + cv.v.shoulder, sim.cars[h.owner].z);
      const ox = o.x, oy = o.y, oz = o.z;
      const hy = h.y;
      const dx = h.x - ox, dy = hy - oy, dz = h.z - oz;
      const len = Math.max(0.4, Math.hypot(dx, dy, dz));
      this.tmpDir.set(dx / len, dy / len, dz / len);
      // hlavice míří po laně od auta pryč
      d.position.set(h.x, hy, h.z);
      d.quaternion.setFromUnitVectors(FWD, this.tmpDir);
      d.rotation.z += h.id;                        // ať nemají všechny drápy stejně
      d.updateMatrix();
      this.hookHeads.setMatrixAt(nh, d.matrix);
      // lano
      const rope = this.rope(nh);
      rope.visible = true;
      rope.position.set(ox + dx / 2, oy + dy / 2, oz + dz / 2);
      rope.quaternion.setFromUnitVectors(FWD, this.tmpDir);
      rope.scale.set(0.05, 0.05, len);
      nh++;
    }
    const hadHooks = this.hookHeads.count;
    if (nh || hadHooks) { this.hookHeads.count = nh; this.hookHeads.instanceMatrix.needsUpdate = true; }

    // EMP vlny: stěna, která se rozjíždí od auta ven a cestou bledne
    this.waves.forEach((m) => (m.visible = false));
    this.waveRings.forEach((m) => (m.visible = false));
    sim.waves.forEach((w, i) => {
      if (i >= 8) return;
      const [high, ground] = this.wave(i);
      const k = Math.min(1, w.t / (w.gun.waveTime ?? 0.55));
      const fade = (1 - k) ** 0.7;
      high.visible = ground.visible = true;
      high.position.set(w.x, w.y + 1.4, w.z);
      high.scale.set(w.r * 0.93, 1, w.r * 0.93);     // horní prstenec kousek pozadu, jako čelo vlny
      ground.position.set(w.x, w.y + 0.06, w.z);
      ground.scale.set(w.r, 1, w.r);
      for (const [m, o] of [[high, 0.8], [ground, 1]] as const) {
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.setHex(w.gun.color);
        mat.opacity = o * fade;
      }
    });

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
      this.tvSwitch = 11;
      const alive = sim.cars.filter((c) => !c.dead);
      const lead = alive.sort((a, b) => a.rank - b.rank)[Math.floor(Math.random() * Math.min(3, alive.length))];
      this.tvTarget = lead ? lead.id : 0;
      this.tvShotT = 0; // nové auto = nový záběr
    }
    for (const r of this.rigs) {
      const cam = r.cam;
      const c = sim.cars[r.carId >= 0 ? r.carId : this.tvTarget];
      if (!c) continue;
      r.shake = Math.max(0, r.shake - dt * 2.4);
      const sh = r.shake * r.shake;
      const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;

      if (r.carId < 0) {
        if (this.menuCam) this.droneCamera(r, cam, sim, t, dt);
        else this.tvCamera(r, cam, c, t, dt);
      } else {
        // za autem: směr kamery se plynule dotahuje ke směru jízdy (v driftu je vidět bok auta)
        let want = c.h;
        const sp = Math.hypot(c.vx, c.vz);
        if (sp > 6 && c.speed > 0 && !c.dead) want = c.h + angDiff(Math.atan2(c.vx, c.vz), c.h) * 0.55;
        if (!r.init) { r.heading = want; r.init = true; }
        // kamera se dotahuje svižně – pomalé dotahování působí jako zpoždění ovládání
        r.heading += angDiff(want, r.heading) * (1 - Math.exp(-(c.dead ? 1 : 11) * dt));
        const dx = Math.sin(r.heading), dz = Math.cos(r.heading);
        const speedK = THREE.MathUtils.clamp(Math.abs(c.speed) / 70, 0, 1);
        const dist = (c.dead ? 9.5 : 5.5 + speedK * 1.3) + c.stats.shape.length * 0.22;
        const hgt = c.dead ? 4.0 : 2.35 + c.stats.shape.cabinH;
        cam.position.set(c.x - dx * dist + sx, c.y + hgt + sy, c.z - dz * dist + sx);
        cam.lookAt(c.x + dx * 5, c.y + 1.25 + sy * 0.5, c.z + dz * 5);
        const fovT = 60 + speedK * 13 + (c.nitroOn ? 9 : 0);
        r.fov += (fovT - r.fov) * Math.min(1, dt * 8);
      }
    }
  }

  /**
   * Kamera v menu: pomalý „dron“, co plyne nad tratí pořád dopředu a mírně se houpe do stran
   * i na výšku. Žádné střihy – v lobby a ve výběru tratě je kulisa jen podkres, takže se nic
   * neděje skokem a dění zůstává u horního a dolního okraje, kde ho nezakrývají karty.
   */
  private droneCamera(r: Rig, cam: THREE.PerspectiveCamera, sim: Sim, t: number, dt: number) {
    const tr = this.track;
    if (!tr) return;
    const L = tr.length;
    // na okruhu se dron drží kus za vedoucím autem, ať je v záběru pořád nějaké dění
    const lead = sim.cars.find((c) => !c.dead && c.rank === 1);
    let step = 17 * dt;
    if (lead && !tr.def.open) {
      let d = lead.ti * tr.step - 120 - this.droneS;
      d = ((d % L) + L) % L;
      if (d > L / 2) d -= L;
      step = THREE.MathUtils.clamp(d, 9 * dt, 46 * dt); // vždycky dopředu a nikdy trhaně
    }
    this.droneS = (this.droneS + step + L) % L;
    const i = Math.floor(this.droneS / tr.step) % tr.n;
    const j = (i + Math.round(75 / tr.step)) % tr.n;
    const side = Math.sin(t * 0.055) * 13;
    const hgt = 17 + Math.sin(t * 0.041) * 5;
    const want = this.tmpVec.set(tr.x[i] + tr.nx[i] * side, tr.y[i] + hgt, tr.z[i] + tr.nz[i] * side);
    const look = this.tmpVec2.set(tr.x[j], tr.y[j] + 0.6, tr.z[j]);
    if (this.tvCut) { this.tvPos.copy(want); this.tvLook.copy(look); this.tvFov = 46; this.tvCut = false; }
    else {
      this.tvPos.lerp(want, 1 - Math.exp(-3 * dt));
      this.tvLook.lerp(look, 1 - Math.exp(-2 * dt));
    }
    cam.position.copy(this.tvPos);
    cam.lookAt(this.tvLook);
    r.fov = 46;
    r.init = true;
  }

  /**
   * Televizní kamera v okně bez hráče: střídá tři typy záběrů
   * (nízká honička za autem, průlet kolem stojící kamery, jeřáb shora) a mezi nimi střihá.
   * Uvnitř záběru se pozice vyhlazuje, takže kamera „letí“ a necuká.
   */
  private tvCamera(r: Rig, cam: THREE.PerspectiveCamera, c: Car, t: number, dt: number) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    const sp = Math.abs(c.speed), speedK = THREE.MathUtils.clamp(sp / 70, 0, 1);
    this.tvShotT -= dt;
    // průlet skončí, jakmile auto přejede kolem kamery
    if (this.tvShot === SHOT_FLYBY && (c.x - this.tvAnchor.x) * fx + (c.z - this.tvAnchor.z) * fz > 26) this.tvShotT = 0;
    if (this.tvShotT <= 0) this.pickTvShot(c, fx, fz, sp);

    const want = this.tmpVec.set(0, 0, 0);
    let lookX = c.x, lookY = c.y + 1.1, lookZ = c.z, fov = 52, k = 6;
    if (this.tvShot === SHOT_FLYBY) {
      // kamera stojí u trati a auto ji mine
      want.copy(this.tvAnchor);
      fov = 44;
      k = 2.5;
    } else if (this.tvShot === SHOT_CRANE) {
      // jeřáb: shora se snáší za auto
      const p = THREE.MathUtils.clamp(1 - this.tvShotT / 7, 0, 1);
      want.set(c.x - fx * (30 - p * 12), c.y + 24 - p * 11, c.z - fz * (30 - p * 12));
      fov = 48;
      k = 3;
    } else {
      // nízká honička za autem (drží se těsně, ať auto neujede)
      const dist = 8 + speedK * 3;
      want.set(c.x - fx * dist, c.y + 1.5 + Math.sin(t * 0.4) * 0.25, c.z - fz * dist);
      lookX = c.x + fx * 7; lookZ = c.z + fz * 7; lookY = c.y + 1.3;
      fov = 62 + speedK * 10;
      k = 9;
    }
    if (this.tvCut) { this.tvPos.copy(want); this.tvLook.set(lookX, lookY, lookZ); this.tvFov = fov; this.tvCut = false; }
    else {
      const a = 1 - Math.exp(-k * dt);
      this.tvPos.lerp(want, a);
      this.tvLook.lerp(this.tmpVec2.set(lookX, lookY, lookZ), 1 - Math.exp(-5 * dt));
      this.tvFov += (fov - this.tvFov) * Math.min(1, dt * 3);
    }
    cam.position.copy(this.tvPos);
    cam.lookAt(this.tvLook);
    r.fov = this.tvFov;
    r.init = true;
  }

  /** Vybere další typ záběru (nikdy dvakrát po sobě stejný) a připraví mu pevný bod. */
  private pickTvShot(c: Car, fx: number, fz: number, sp: number) {
    // průlet dává smysl jen na jedoucí auto – stojící by ke kameře nedojelo
    const opts = sp > 14 ? [SHOT_CHASE, SHOT_FLYBY, SHOT_CRANE] : [SHOT_CHASE, SHOT_CRANE];
    const pool = opts.filter((o) => o !== this.tvShot);
    this.tvShot = pool[Math.floor(Math.random() * pool.length)] ?? SHOT_CHASE;
    this.tvShotT = this.tvShot === SHOT_FLYBY ? 7 : 6 + Math.random() * 3;
    this.tvCut = true;
    if (this.tvShot === SHOT_FLYBY) {
      // bod kus před autem a stranou – auto kolem něj projede
      const side = Math.random() < 0.5 ? 1 : -1;
      const ahead = 36 + sp * 0.9;
      this.tvAnchor.set(c.x + fx * ahead + fz * side * 10, c.y + 2.2, c.z + fz * ahead - fx * side * 10);
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
      rig.cam.position.set(c.x + Math.sin(a) * 9.5, c.y + 2.6, c.z + Math.cos(a) * 9.5);
      rig.cam.lookAt(c.x - Math.sin(c.h) * 4, c.y + 1.1, c.z - Math.cos(c.h) * 4);
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
        world.sun.target.position.set(fxp, c ? c.y : 0, fzp);
        world.sun.position.set(fxp + world.theme.sunDir.x * 160, (c ? c.y : 0) + world.theme.sunDir.y * 160, fzp + world.theme.sunDir.z * 160);
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
