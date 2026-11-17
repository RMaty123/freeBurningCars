/**
 * Garáž pro výběr aut: auto na točně pod reflektorem.
 * Kreslí se stejným rendererem jako závod, jen vlastní scénou – pro každého hráče jeden výřez obrazovky.
 * Umí taky vyrobit malý náhled auta (obrázek) pro nabídku na telefonu.
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
  ring: THREE.Mesh;
  /** krátké "zhoupnutí" při výměně auta */
  pop: number;
}

function floorTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  // světelný kužel reflektoru: uprostřed světlý beton, do stran tma
  const gr = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
  gr.addColorStop(0, '#5b5f6b'); gr.addColorStop(0.35, '#3a3d47'); gr.addColorStop(0.75, '#16171d'); gr.addColorStop(1, '#0b0c11');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${Math.random() * 0.05})` : `rgba(0,0,0,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BG = 0x0b0c11;

export class Showroom {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private slots: Slot[] = [];
  private thumbs = new Map<string, string>();
  private time = 0;
  private shadowsOn = true;
  private ringGeo = new THREE.RingGeometry(3.25, 3.45, 64).rotateX(-Math.PI / 2);

  constructor(private renderer: THREE.WebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;
    pmrem.dispose();
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 14, 30);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(16, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0.15 }),
    );
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x20222a, 0.7));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.6);
    key.position.set(4, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 25;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb0ff, 1.2);
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
      (s.ring.material as THREE.Material).dispose();
    }
    while (this.slots.length < n) {
      const pivot = new THREE.Group();
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.9 }));
      ring.position.y = 0.02;
      pivot.add(ring);
      this.scene.add(pivot);
      this.slots.push({ key: '', pivot, visual: null, ring, pop: 0 });
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
    (s.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    s.key = key;
    s.pop = 1;
  }

  update(dt: number) {
    this.time += dt;
    for (const s of this.slots) {
      s.pop = Math.max(0, s.pop - dt * 3.2);
      if (!s.visual) continue;
      // pomalá točna; nové auto krátce "dosedne"
      s.visual.root.rotation.y = 0.7 + this.time * 0.35;
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
    const dist = Math.max(3.3 / (v * aspect), 1.9 / v);
    cam.position.set(0, dist * 0.26 + 0.6, dist);
    cam.lookAt(0, 0.62, 0);
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
    rn.setScissorTest(false);
    rn.setViewport(0, 0, size.x, size.y);
    rn.setClearColor(BG, 1);
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
