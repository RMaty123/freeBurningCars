/**
 * Procedurální modely zbraní do nabídky (stejný přístup jako u aut: žádné soubory, jen krabice a válce).
 * Zbraň stojí na malém stojánku a míří do +Z. Používá se v garáži a pro náhledy v nabídce na telefonu.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GunShape, GunStats } from '../game/guns';

export interface GunVisual {
  root: THREE.Group;
  materials: THREE.Material[];
}

const prep = (g: THREE.BufferGeometry) => { g.deleteAttribute('uv'); return g; };

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return prep(g);
}

/** Válec podél osy `axis` (ve výchozím stavu stojí podél Y). */
function cyl(r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'z', seg = 12, r2 = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r2, len, seg, 1);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  else if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return prep(g);
}

/** Válec mířící ven z hlavně (díra v chladicím plášti) – úhel `a` je kolem osy Z. */
function radial(r: number, depth: number, rad: number, a: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, depth, 8, 1);
  g.rotateZ(a - Math.PI / 2);
  g.translate(Math.cos(a) * rad, y + Math.sin(a) * rad, z);
  return prep(g);
}

function ring(r: number, tube: number, z: number, seg = 14): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, tube, 6, seg);
  g.translate(0, 0, z);
  return prep(g);
}

const merged = (parts: THREE.BufferGeometry[]) => (parts.length ? mergeGeometries(parts, false) : null);

/**
 * Dělo, jaké auto nosí na dveřích: chromové tělo s žebry, hlaveň s objímkami a zářící čočka.
 * Kreslí se do předaných seznamů, takže se dá postavit vedle sebe víc kusů.
 */
function podCannon(
  out: { metal: THREE.BufferGeometry[]; dark: THREE.BufferGeometry[]; glow: THREE.BufferGeometry[] },
  x: number, y: number, zR: number, len: number, w: number,
) {
  const zF = zR + len;
  out.metal.push(box(w, w * 1.1, len * 0.46, x, y, zR + len * 0.23));                 // tělo
  out.dark.push(box(w * 1.08, w * 0.32, len * 0.32, x, y + w * 0.56, zR + len * 0.2)); // žebra chlazení
  out.dark.push(box(w * 1.1, w * 0.45, len * 0.1, x, y - w * 0.5, zR + len * 0.08));   // patka
  out.glow.push(box(w * 0.3, w * 0.26, len * 0.36, x + w * 0.42, y + w * 0.44, zR + len * 0.2)); // svítící proužek
  out.metal.push(cyl(w * 0.34, len * 0.58, x, y, zR + len * 0.72, 'z', 12));           // hlaveň
  for (const t of [0.47, 0.78]) out.dark.push(cyl(w * 0.5, w * 0.32, x, y, zR + len * t, 'z', 12)); // objímky
  out.glow.push(cyl(w * 0.42, w * 0.26, x, y, zR + len * 0.63, 'z', 12));              // světelný prstenec
  out.dark.push(cyl(w * 0.36, w * 0.95, x, y, zF - 0.07, 'z', 12, w * 0.56));          // ústí
  out.glow.push(cyl(w * 0.3, w * 0.65, x, y, zF + 0.015, 'z', 12));                    // čočka
}

/** Postaví model zbraně na stojánku. Střed modelu je ve středu stojánku, zbraň míří do +Z. */
export function buildGun(shape: GunShape): GunVisual {
  const metalGeo: THREE.BufferGeometry[] = [];
  const accentGeo: THREE.BufferGeometry[] = [];
  const darkGeo: THREE.BufferGeometry[] = [];
  const glowGeo: THREE.BufferGeometry[] = [];

  const [bl, bh, bw] = shape.body;
  const y = 0.34;            // osa zbraně nad podstavcem
  const zBody = -bl * 0.1;   // tělo kousek za středem, hlaveň vyváží délku

  // ---- stojánek: sloupek a čtyři vzpěry do X
  metalGeo.push(cyl(0.075, y - 0.14, 0, (y - 0.14) / 2 + 0.06, 0, 'y', 10));
  metalGeo.push(box(0.17, 0.09, 0.17, 0, y - 0.07, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    metalGeo.push(box(0.075, 0.05, 0.38, sx * 0.14, 0.055, sz * 0.14, 0, sx * sz * 0.72));
    metalGeo.push(box(0.1, 0.035, 0.1, sx * 0.26, 0.04, sz * 0.26));
  }
  // kloub, na kterém zbraň sedí
  darkGeo.push(cyl(0.055, bw + 0.08, 0, y - 0.03, zBody, 'x', 10));

  // ---- tělo
  metalGeo.push(box(bw, bh, bl, 0, y, zBody));
  metalGeo.push(box(bw * 0.72, bh * 0.42, bl * 0.5, 0, y + bh * 0.6, zBody - bl * 0.1)); // nástavec navrchu
  darkGeo.push(box(bw + 0.03, bh * 0.3, bl * 0.22, 0, y - bh * 0.1, zBody - bl * 0.42)); // zadní kryt
  accentGeo.push(box(bw * 0.4, bh * 0.5, bl * 0.3, 0, y - bh * 0.5, zBody - bl * 0.2));  // rukojeť / spoušť

  // ---- dvojice děl z dveří auta (vlastní model laserové zbraně)
  if (shape.pods) {
    const n = shape.pods, w = bw, len = bl + shape.barrel, gap = w * 3.1;
    const base = { metal: metalGeo, dark: darkGeo, glow: glowGeo };
    const barY = y - w * 0.92, barZ = -len * 0.2;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * gap;
      podCannon(base, x, y, -len * 0.42, len, w);
      metalGeo.push(box(0.08, w * 0.9, 0.16, x, (y + barY) / 2 - w * 0.2, barZ)); // nožka k příčníku
    }
    // příčník, na kterém děla sedí
    metalGeo.push(box(gap * (n - 1) + w * 1.4, 0.08, 0.17, 0, barY, barZ));
    const materials0: THREE.Material[] = [];
    const metal0 = new THREE.MeshStandardMaterial({ color: shape.metal, metalness: 0.9, roughness: 0.34 });
    const dark0 = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.6, roughness: 0.5 });
    const glow0 = new THREE.MeshBasicMaterial({ color: shape.glow ?? 0x6ff0ff, toneMapped: false });
    const root0 = new THREE.Group();
    for (const [parts, mat] of [[metalGeo, metal0], [darkGeo, dark0], [glowGeo, glow0]] as const) {
      const geo = merged(parts as THREE.BufferGeometry[]);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mat !== glow0;
      mesh.receiveShadow = true;
      root0.add(mesh);
    }
    materials0.push(metal0, dark0, glow0);
    return { root: root0, materials: materials0 };
  }

  // ---- hlaveň
  const zMuzzle = zBody + bl / 2 + shape.barrel;
  const n = shape.barrels ?? 1;
  if (n > 1) {
    // rotační kulomet: hlavně kolem osy, vpředu a vzadu je spojuje prstenec
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rr = shape.bore * 2.1;
      metalGeo.push(cyl(shape.bore, shape.barrel, Math.cos(a) * rr, y + Math.sin(a) * rr, zBody + bl / 2 + shape.barrel / 2, 'z', 8));
    }
    for (const t of [0.12, 0.55, 0.95]) {
      darkGeo.push(cyl(shape.bore * 3.1, 0.06, 0, y, zBody + bl / 2 + shape.barrel * t, 'z', 14));
    }
  } else {
    metalGeo.push(cyl(shape.bore, shape.barrel, 0, y, zBody + bl / 2 + shape.barrel / 2, 'z', 12));
  }

  // chladicí plášť s otvory
  if (shape.jacket) {
    const jr = shape.bore * 2.6, jl = shape.barrel * 0.78;
    const jz = zBody + bl / 2 + jl / 2 + 0.02;
    metalGeo.push(cyl(jr, jl, 0, y, jz, 'z', 16));
    metalGeo.push(cyl(jr * 1.12, 0.05, 0, y, jz - jl / 2 + 0.02, 'z', 16)); // objímka vzadu
    metalGeo.push(cyl(jr * 1.12, 0.05, 0, y, jz + jl / 2 - 0.02, 'z', 16)); // objímka vpředu
    for (let i = 0; i < 6; i++) for (let k = 0; k < 5; k++) {
      const z = jz - jl / 2 + 0.1 + (i * (jl - 0.2)) / 5;
      darkGeo.push(radial(jr * 0.3, jr * 0.5, jr * 0.8, (k / 5) * Math.PI * 2 + i * 0.1, y, z));
    }
  }

  // úsťová brzda
  if (shape.brake) {
    metalGeo.push(cyl(shape.bore * 1.7, 0.2, 0, y, zMuzzle - 0.06, 'z', 12));
    for (let i = 0; i < 3; i++) darkGeo.push(box(shape.bore * 4, 0.035, 0.03, 0, y, zMuzzle - 0.14 + i * 0.06));
  }
  darkGeo.push(cyl(shape.bore * 0.62, 0.05, 0, y, zMuzzle + 0.01, 'z', 10)); // ústí

  // ---- bedna s municí a pás
  if (shape.ammoBox) {
    accentGeo.push(box(bw * 1.05, bh * 1.15, bl * 0.8, -(bw * 0.95), y - bh * 0.25, zBody - bl * 0.1));
    darkGeo.push(box(bw * 1.1, 0.04, bl * 0.84, -(bw * 0.95), y + bh * 0.35, zBody - bl * 0.1));
  }
  if (shape.belt) {
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      accentGeo.push(box(0.055, 0.075, 0.05, -bw * (0.2 + t * 0.75), y + bh * (0.36 - t * 0.12), zBody + bl * 0.08, 0, 0.25));
    }
  }

  // ---- energetické prstence a zářící jádro
  if (shape.rings) {
    const z0 = zBody + bl / 2;
    // zářící tyč místo hlavně, kolem ní tmavé prstence a vpředu emitor
    glowGeo.push(cyl(shape.bore * 1.15, shape.barrel * 0.98, 0, y, z0 + shape.barrel / 2, 'z', 12));
    for (let i = 0; i < shape.rings; i++) {
      const z = z0 + shape.barrel * ((i + 0.7) / (shape.rings + 0.5));
      metalGeo.push(ring(shape.bore * 1.55, 0.045, 0).translate(0, y, z));
      darkGeo.push(ring(shape.bore * 1.55, 0.016, 0, 10).translate(0, y, z));
    }
    metalGeo.push(cyl(shape.bore * 1.25, 0.14, 0, y, z0 + shape.barrel - 0.03, 'z', 14, shape.bore * 1.9)); // emitor
    metalGeo.push(cyl(shape.bore * 1.4, 0.1, 0, y, z0 + 0.04, 'z', 14)); // objímka u těla
    // chladiče po stranách těla a proužek, který svítí stejně jako paprsek
    for (const sx of [-1, 1]) {
      metalGeo.push(box(0.05, bh * 1.2, bl * 0.5, sx * (bw / 2 + 0.03), y + bh * 0.2, zBody, 0, sx * 0.12));
    }
    glowGeo.push(box(bw * 0.34, 0.035, bl * 0.4, 0, y + bh * 0.82, zBody - bl * 0.08));
  }

  // ---- materiály
  const metal = new THREE.MeshStandardMaterial({ color: shape.metal, metalness: 0.9, roughness: 0.34 });
  const accent = new THREE.MeshStandardMaterial({ color: shape.accent, metalness: 0.45, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.6, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: shape.glow ?? 0xffffff, toneMapped: false });

  const root = new THREE.Group();
  const materials: THREE.Material[] = [metal, accent, dark, glow];
  for (const [parts, mat] of [[metalGeo, metal], [accentGeo, accent], [darkGeo, dark], [glowGeo, glow]] as const) {
    const geo = merged(parts as THREE.BufferGeometry[]);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mat !== glow;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return { root, materials };
}

export function disposeGun(v: GunVisual) {
  v.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  for (const m of v.materials) m.dispose();
}

/** Zbraň i s modelem – zkratka pro volající, kteří mají jen `GunStats`. */
export const buildGunModel = (gun: GunStats) => buildGun(gun.shape);
