/**
 * Garáž pro výběr aut: auto stojí na betonové podlaze mezi stěnami a rekvizitami.
 * Kreslí se stejným rendererem jako závod, jen vlastní scénou – pro každého hráče jeden výřez obrazovky.
 * Umí taky vyrobit malý náhled auta (obrázek na tmavém pozadí) pro nabídku na telefonu.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CarStats } from '../game/cars';
import { buildCar, CarVisual, disposeCar } from './carModel';

export interface PxRect { x: number; y: number; w: number; h: number }

interface Slot {
  /** co je právě postavené ("id auta|barva"), ať se model nestaví zbytečně znovu */
  key: string;
  pivot: THREE.Group;
  visual: CarVisual | null;
  /** krátké "dosednutí" při výměně auta */
  pop: number;
}

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** Popraskaný beton na podlaze garáže. */
function concrete(g: CanvasRenderingContext2D, S: number) {
  g.fillStyle = '#8b8279';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '60,52,46' : '170,160,150'},${0.05 + Math.random() * 0.1})`;
    g.beginPath();
    g.ellipse(Math.random() * S, Math.random() * S, 20 + Math.random() * 90, 14 + Math.random() * 60, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${Math.random() * 0.07})` : `rgba(0,0,0,${Math.random() * 0.14})`;
    g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.strokeStyle = 'rgba(30,26,22,0.55)';
  for (let i = 0; i < 7; i++) {
    g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath();
    let x = Math.random() * S, y = Math.random() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 9; k++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; g.lineTo(x, y); }
    g.stroke();
  }
}

/** Plechová / prkenná stěna. */
function wallPanels(g: CanvasRenderingContext2D, S: number) {
  g.fillStyle = '#6a5a4c';
  g.fillRect(0, 0, S, S);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const x = (i * S) / n;
    const gr = g.createLinearGradient(x, 0, x + S / n, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(0.5, 'rgba(255,240,220,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = gr;
    g.fillRect(x, 0, S / n, S);
  }
  g.fillStyle = 'rgba(40,30,24,0.55)';
  g.fillRect(0, S * 0.08, S, S * 0.05);
  g.fillRect(0, S * 0.62, S, S * 0.05);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.6 ? '120,70,40' : '0,0,0'},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 2 + Math.random() * 8);
  }
}

const BG = 0x3b352f;        // teplé šero garáže
const STUDIO_BG = 0x191919; // tmavé pozadí náhledů pro telefon

export class Showroom {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  /** garáž (podlaha, stěny, rekvizity) – na obrazovce */
  private garage = new THREE.Group();
  /** holé tmavé "studio" – jen pro náhledy aut na telefon */
  private studio = new THREE.Group();
  private fog = new THREE.Fog(BG, 38, 90);
  private slots: Slot[] = [];
  private thumbs = new Map<string, string>();
  private time = 0;
  private shadowsOn = true;

  constructor(private renderer: THREE.WebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    pmrem.dispose();
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = this.fog;
    this.scene.add(this.garage, this.studio);
    this.studio.visible = false;

    // --- garáž: betonová podlaha, zadní a boční stěny, pár rekvizit
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: canvasTex(512, concrete, [9, 9]), roughness: 0.9, metalness: 0 }),
    );
    floor.receiveShadow = true;
    this.garage.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ map: canvasTex(256, wallPanels, [10, 1]), roughness: 0.85, metalness: 0.1 });
    const wall = (w: number, x: number, z: number, rot: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 6, 0.4), wallMat);
      m.position.set(x, 3, z);
      m.rotation.y = rot;
      this.garage.add(m);
    };
    wall(70, 0, -15, 0);
    wall(70, -24, 10, Math.PI / 2);
    wall(70, 24, 10, Math.PI / 2);
    const prop = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rz = 0) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.25 }));
      m.position.set(x, y, z);
      m.rotation.z = rz;
      this.garage.add(m);
    };
    const barrel = new THREE.CylinderGeometry(0.45, 0.45, 1.25, 16);
    prop(barrel, 0xa33a2a, -8.5, 0.63, -11.5);
    prop(barrel, 0xa33a2a, -7.4, 0.63, -12.2);
    prop(barrel, 0x2f5f9a, -9.6, 0.46, -9.6, Math.PI / 2);
    prop(new THREE.BoxGeometry(1.5, 1.2, 1.2), 0xc79a2a, 9, 0.6, -12);
    prop(new THREE.BoxGeometry(1.0, 0.9, 1.0), 0x7a6a55, 10.6, 0.45, -11.2);
    const tyre = new THREE.TorusGeometry(0.42, 0.2, 10, 20).rotateX(Math.PI / 2);
    for (let i = 0; i < 4; i++) prop(tyre, 0x141414, 6.2, 0.2 + i * 0.4, -12.6);

    // --- studio pro náhledy
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(14, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        roughness: 0.6, metalness: 0.1,
        map: canvasTex(256, (g, S) => {
          const gr = g.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S / 2);
          gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(0.4, '#333'); gr.addColorStop(1, '#191919');
          g.fillStyle = gr;
          g.fillRect(0, 0, S, S);
        }),
      }),
    );
    disc.receiveShadow = true;
    this.studio.add(disc);

    // --- světla
    this.scene.add(new THREE.HemisphereLight(0xfff1e0, 0x4a4038, 1.0));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.8);
    key.position.set(5, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 26;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 0.9);
    rim.position.set(-6, 4, -5);
    this.scene.add(rim);
  }

  // ------------------------------------------------------------ místa pro hráče
  /** Kolik aut (hráčů) se ukazuje. */
  setCount(n: number) {
    while (this.slots.length > n) {
      const s = this.slots.pop()!;
      this.scene.remove(s.pivot);
      if (s.visual) disposeCar(s.visual);
    }
    while (this.slots.length < n) {
      const pivot = new THREE.Group();
      this.scene.add(pivot);
      this.slots.push({ key: '', pivot, visual: null, pop: 0 });
    }
  }

  /** Postaví na místo `i` dané auto v dané barvě (nic nedělá, pokud tam už stojí). */
  setCar(i: number, car: CarStats, color: number) {
    const s = this.slots[i];
    if (!s) return;
    const key = `${car.id}|${color}`;
    if (s.key === key) return;
    if (s.visual) { s.pivot.remove(s.visual.root); disposeCar(s.visual); }
    s.visual = buildCar(car.shape, color);
    s.pivot.add(s.visual.root);
    s.key = key;
    s.pop = 1;
  }

  update(dt: number) {
    this.time += dt;
    for (const s of this.slots) {
      s.pop = Math.max(0, s.pop - dt * 3.2);
      if (!s.visual) continue;
      // auto stojí šikmo k divákovi a jen se zvolna natáčí sem a tam; nové auto krátce "dosedne"
      s.visual.root.rotation.y = 0.72 + Math.sin(this.time * 0.3) * 0.22;
      const k = s.pop * s.pop;
      s.visual.root.position.y = k * 0.35;
      s.visual.root.scale.setScalar(1 - k * 0.08);
    }
  }

  // ------------------------------------------------------------ vykreslení
  private aim(aspect: number) {
    const cam = this.cam;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    // vzdálenost tak, aby se auto vešlo na šířku i na výšku výřezu
    const v = Math.tan((cam.fov * Math.PI) / 360);
    const dist = Math.max(3.6 / (v * aspect), 2.9 / v);
    cam.position.set(0, dist * 0.24 + 0.55, dist);
    // míří se kousek pod auto, takže auto vyjde nad jmenovku se staty
    cam.lookAt(0, 0.25, 0);
  }

  /** Přepne mezi garáží (obrazovka) a tmavým studiem (náhledy). */
  private stage(studio: boolean) {
    this.garage.visible = !studio;
    this.studio.visible = studio;
    const c = studio ? STUDIO_BG : BG;
    (this.scene.background as THREE.Color).setHex(c);
    this.fog.color.setHex(c);
    this.fog.near = studio ? 12 : 38;
    this.fog.far = studio ? 28 : 90;
  }

  private syncShadows() {
    const on = this.renderer.shadowMap.enabled;
    if (on === this.shadowsOn) return;
    this.shadowsOn = on;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  }

  /** Vykreslí každé auto do jeho výřezu (obdélníky v CSS pixelech, počátek vlevo nahoře). */
  render(rects: PxRect[]) {
    const rn = this.renderer;
    const size = rn.getSize(new THREE.Vector2());
    const exposure = rn.toneMappingExposure;
    rn.toneMappingExposure = 1.05;
    this.syncShadows();
    this.stage(false);
    rn.setScissorTest(false);
    rn.setViewport(0, 0, size.x, size.y);
    rn.setClearColor(0x000000, 1);
    rn.clear();
    rn.setScissorTest(true);
    rects.forEach((r, i) => {
      if (!this.slots[i] || r.w < 2 || r.h < 2) return;
      this.slots.forEach((s, k) => (s.pivot.visible = k === i));
      const x = Math.round(r.x), w = Math.round(r.w), h = Math.round(r.h);
      const y = Math.round(size.y - r.y - r.h); // WebGL má počátek vlevo dole
      rn.setViewport(x, y, w, h);
      rn.setScissor(x, y, w, h);
      this.aim(w / h);
      rn.render(this.scene, this.cam);
    });
    rn.setScissorTest(false);
    rn.toneMappingExposure = exposure;
  }

  /**
   * Náhled auta jako obrázek (data URL) – pro nabídku aut na telefonu.
   * Výsledek se pamatuje, takže se každé auto v každé barvě kreslí jen jednou.
   */
  thumbnail(car: CarStats, color: number, width = 320, height = 200): string {
    const key = `${car.id}|${color}|${width}x${height}`;
    const hit = this.thumbs.get(key);
    if (hit) return hit;

    const rn = this.renderer;
    const size = rn.getSize(new THREE.Vector2());
    const pr = rn.getPixelRatio();
    // výřez v poměru stran náhledu, který se vejde do plátna
    const vw = Math.floor(Math.min(size.x, (size.y * width) / height));
    const vh = Math.floor((vw * height) / width);
    if (vw < 8 || vh < 8) return '';

    const visual = buildCar(car.shape, color);
    visual.root.rotation.y = 0.75;
    this.scene.add(visual.root);
    this.slots.forEach((s) => (s.pivot.visible = false));
    const exposure = rn.toneMappingExposure;
    rn.toneMappingExposure = 1.05;
    this.syncShadows();
    this.stage(true);
    rn.setScissorTest(true);
    rn.setViewport(0, 0, vw, vh);
    rn.setScissor(0, 0, vw, vh);
    this.aim(width / height);
    rn.render(this.scene, this.cam);
    rn.setScissorTest(false);
    rn.toneMappingExposure = exposure;

    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const src = rn.domElement;
    // výřez leží v levém dolním rohu plátna
    out.getContext('2d')!.drawImage(src, 0, src.height - vh * pr, vw * pr, vh * pr, 0, 0, width, height);
    const url = out.toDataURL('image/jpeg', 0.85);

    this.scene.remove(visual.root);
    disposeCar(visual);
    this.thumbs.set(key, url);
    return url;
  }
}
