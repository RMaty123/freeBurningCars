/**
 * Procedurální modely sekundárních zbraní (FIRE 2) – raketa a mina.
 * Stejný přístup jako u aut a kulometů: žádné soubory, jen válce a krabice.
 *
 * `mineParts()` a `ballParts()` staví minu a míček v herním měřítku – používá je i závod
 * (gameView je kreslí instancovaně). `buildSec()` z toho udělá model do nabídky:
 * položka stojí na nízkém podstavci a míří do +Z.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SecStats } from '../game/secondary';

export interface SecVisual {
  root: THREE.Group;
  materials: THREE.Material[];
}

/** Díly roztříděné podle materiálu – minu z nich poskládá nabídka i závod. */
export interface SecParts {
  metal: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  stripe: THREE.BufferGeometry[];
  glow: THREE.BufferGeometry[];
}

const prep = (g: THREE.BufferGeometry) => { g.deleteAttribute('uv'); return g; };

function cyl(r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y', seg = 12, r2 = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r2, len, seg, 1);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  else if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return prep(g);
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return prep(g);
}

/** Kus oblouku (torus) – používá se na ohebnou hadici vysypávače. */
function arc(r: number, tube: number, len: number, rotZ: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, tube, 6, Math.max(4, Math.round(len * 14)), len);
  g.rotateZ(rotZ);
  g.translate(x, y, z);
  return prep(g);
}

/** Šestiúhelníkový talíř (plochý válec o šesti stěnách) – základ miny. */
const hex = (r: number, h: number, y: number, r2 = r) => cyl(r, h, 0, y, 0, 'y', 6, r2);

/** Barvy miny – stejné v nabídce i v závodě. */
export const MINE_COLORS = { metal: 0xd9dde5, dark: 0x16181d, stripe: 0xc0392b, glow: 0xff3a16 };

/** Poloměr miny (m) – podle něj se staví model i kreslí stín. */
export const MINE_R = 0.6;

/** Míček: poloměr (musí sedět s BALL_R v sim.ts, podle něj se počítá kutálení) a barvy. */
export const BALL_R = 0.17;
export const BALL_COLORS = { shell: 0xf4f6fa, band: 0xe01f16 };

/**
 * Míček: červeno-bílá koule – červená čepička nahoře i dole a široký pruh kolem rovníku,
 * takže je červené a bílé zhruba půl na půl a pozná se z každé strany.
 * Vrací se zvlášť skořápka a červené díly, ať se v závodě kreslí dvěma instancovanými sítěmi.
 */
export function ballParts(): { shell: THREE.BufferGeometry[]; band: THREE.BufferGeometry[] } {
  // červený díl = výseč koule o kousek větší, ať neprobleskuje bílá skořápka zpod ní
  const band = (from: number, to: number) =>
    prep(new THREE.SphereGeometry(BALL_R * 1.015, 14, 5, 0, Math.PI * 2, from, to - from));
  return {
    shell: [prep(new THREE.SphereGeometry(BALL_R, 14, 10))],
    band: [band(0, 0.72), band(1.28, 1.86), band(2.56, Math.PI)],
  };
}

/**
 * Mina v herním měřítku: tmavá podstava, červený pruh, světlý šestiúhelníkový talíř
 * a uprostřed vyvýšený terčík se svítící čočkou. Střed je v ose, spodek v y = 0.
 */
export function mineParts(): SecParts {
  const p: SecParts = { metal: [], dark: [], stripe: [], glow: [] };
  const R = MINE_R;
  p.dark.push(hex(R * 0.97, 0.07, 0.035));                       // podstava
  p.stripe.push(hex(R, 0.06, 0.095));                            // výstražný pruh
  p.metal.push(hex(R * 0.96, 0.13, 0.19, R * 0.86));             // horní talíř (nahoře se zužuje)
  p.dark.push(hex(R * 0.55, 0.03, 0.262));                       // osazení pod terčíkem
  p.metal.push(hex(R * 0.46, 0.09, 0.31, R * 0.4));              // terčík
  p.dark.push(cyl(R * 0.32, 0.035, 0, 0.357, 0, 'y', 14));       // rámeček čočky
  p.glow.push(cyl(R * 0.25, 0.05, 0, 0.368, 0, 'y', 14));        // svítící čočka
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    p.metal.push(cyl(R * 0.07, 0.04, Math.cos(a) * R * 0.72, 0.265, Math.sin(a) * R * 0.72, 'y', 6)); // šrouby v rozích
  }
  return p;
}

/** Slije díly jednoho materiálu do jedné geometrie (nebo null, když žádné nejsou). */
export function mergeParts(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  return list.length ? mergeGeometries(list, false) : null;
}

/** Raketa do nabídky: trup s kuželem, křidélka a červený pruh, leží v kolébce. */
function rocketParts(): SecParts {
  const p: SecParts = { metal: [], dark: [], stripe: [], glow: [] };
  const y = 0.46, L = 1.0, r = 0.13, z0 = -0.06;
  const zN = z0 + L / 2, zR = z0 - L / 2;                         // nos a záď trupu
  p.metal.push(cyl(r, L, 0, y, z0, 'z', 14));                     // trup
  p.metal.push(cyl(0.012, 0.36, 0, y, zN + 0.18, 'z', 14, r));    // kužel (vpředu špička)
  p.stripe.push(cyl(r * 1.04, 0.09, 0, y, zN - 0.12, 'z', 14));   // výstražné pruhy
  p.stripe.push(cyl(r * 1.04, 0.09, 0, y, zR + 0.26, 'z', 14));
  p.dark.push(cyl(r * 0.94, 0.11, 0, y, zR - 0.03, 'z', 14));     // tryska
  p.glow.push(cyl(r * 0.62, 0.05, 0, y, zR - 0.1, 'z', 12));      // žhavé ústí
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const g = new THREE.BoxGeometry(0.035, 0.26, 0.32);
    g.translate(0, 0.15, 0);
    g.rotateZ(a);
    g.translate(0, y, zR + 0.18);
    p.dark.push(prep(g));                                         // křidélka
  }
  // kolébka pod raketou
  for (const z of [zR + 0.3, zN - 0.16]) {
    p.dark.push(box(0.42, 0.06, 0.14, 0, 0.07, z));
    for (const sx of [-1, 1]) p.metal.push(box(0.06, 0.38, 0.12, sx * 0.16, 0.26, z, sx * 0.3));
  }
  return p;
}

/**
 * Vysypávač míčků do nabídky: zásobník s žebrovanou hadicí dolů a tři míčky kolem.
 * Tvar vychází z vysypávače v Burnin' Rubber – hranatá bedna, hadice a výstražný pruh.
 */
function ballPreviewParts(): SecParts {
  const out: SecParts = { metal: [], dark: [], stripe: [], glow: [] };
  const top = 0.3;                        // výška tácku nad podlahou
  out.metal.push(cyl(0.32, 0.05, 0, 0.025, 0, 'y', 6));
  out.dark.push(cyl(0.11, top - 0.05, 0, (top - 0.05) / 2 + 0.05, 0, 'y', 10));
  out.dark.push(cyl(0.72, 0.05, 0, top - 0.025, 0, 'y', 6));
  out.metal.push(cyl(0.74, 0.03, 0, top, 0, 'y', 6));

  // zásobník: hranatá bedna s rámem navrchu a výstražným pruhem vepředu
  const bw = 0.5, bh = 0.6, bd = 0.5;
  const bx = -0.42, by = top + bh / 2, bz = -0.04;
  const right = bx + bw / 2;
  out.metal.push(box(bw, bh, bd, bx, by, bz));
  out.dark.push(box(bw + 0.03, 0.08, bd + 0.03, bx, by + bh / 2 - 0.02, bz));
  for (const sx of [-1, 1]) out.metal.push(box(0.06, 0.22, bd - 0.04, bx + sx * (bw / 2 - 0.04), by + bh / 2 + 0.1, bz));
  out.metal.push(box(bw - 0.04, 0.06, 0.09, bx, by + bh / 2 + 0.19, bz - 0.2));
  out.dark.push(box(0.3, 0.1, 0.03, bx, by + 0.12, bz + bd / 2));    // mřížka
  out.stripe.push(box(bw - 0.06, 0.09, 0.03, bx, by - 0.16, bz + bd / 2)); // výstražný pruh

  // ohebná hadice: čtvrtoblouk z boku bedny dolů na tácek, se žebry
  const r = 0.34, hy = top + 0.42 - r, hz = bz + 0.14;
  out.metal.push(arc(r, 0.08, Math.PI / 2, 0, right, hy, hz));
  for (let i = 1; i < 6; i++) out.dark.push(arc(r, 0.092, 0.11, (i / 6) * (Math.PI / 2), right, hy, hz));
  out.metal.push(box(0.16, 0.2, 0.22, right + r + 0.02, hy - 0.02, hz));   // ústí
  out.dark.push(box(0.17, 0.08, 0.23, right + r + 0.02, hy - 0.11, hz));

  // tři míčky, jako by zrovna vypadly z hadice
  const bp = ballParts();
  const put = (x: number, y: number, z: number, sc: number) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, 0.4, 0)),
      new THREE.Vector3(sc, sc, sc),
    );
    for (const g of bp.shell) out.metal.push(g.clone().applyMatrix4(m));
    for (const g of bp.band) out.stripe.push(g.clone().applyMatrix4(m));
  };
  put(0.52, top + 0.24, 0.3, 0.88);
  put(0.8, top + 0.16, -0.08, 0.66);
  put(0.34, top + 0.14, -0.4, 0.58);
  return out;
}

/** Postaví model sekundární zbraně do nabídky. Střed modelu je na podlaze, zbraň míří do +Z. */
export function buildSec(sec: SecStats): SecVisual {
  const p = sec.id === 'mine' ? minePreviewParts() : sec.id === 'ball' ? ballPreviewParts() : rocketParts();
  const metal = new THREE.MeshStandardMaterial({ color: MINE_COLORS.metal, metalness: 0.85, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: MINE_COLORS.dark, metalness: 0.5, roughness: 0.6 });
  const stripe = new THREE.MeshStandardMaterial({ color: MINE_COLORS.stripe, metalness: 0.3, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: sec.color, toneMapped: false });

  const root = new THREE.Group();
  const materials: THREE.Material[] = [metal, dark, stripe, glow];
  for (const [parts, mat] of [[p.metal, metal], [p.dark, dark], [p.stripe, stripe], [p.glow, glow]] as const) {
    const geo = mergeParts(parts as THREE.BufferGeometry[]);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mat !== glow;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return { root, materials };
}

/** Mina do nabídky: dva kusy vedle sebe (jeden ležící, jeden opřený) na nízkém podstavci. */
function minePreviewParts(): SecParts {
  const out: SecParts = { metal: [], dark: [], stripe: [], glow: [] };
  const put = (p: SecParts, m: THREE.Matrix4) => {
    for (const k of ['metal', 'dark', 'stripe', 'glow'] as const) {
      for (const g of p[k]) out[k].push(g.clone().applyMatrix4(m));
    }
  };
  const S = 0.85, top = 0.33; // výška podstavce – zbraň má v nabídce vyjít do stejné výšky jako kulomety
  // ležící mina vpravo
  put(mineParts(), new THREE.Matrix4().compose(
    new THREE.Vector3(0.26, top, 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, 0)), new THREE.Vector3(S, S, S),
  ));
  // druhá opřená dozadu, ať je vidět i profil
  put(mineParts(), new THREE.Matrix4().compose(
    new THREE.Vector3(-0.38, top + 0.2, -0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(1.12, -0.25, -0.08)), new THREE.Vector3(S, S, S),
  ));
  // podstavec: patka, sloupek a šestihranný tácek
  out.metal.push(cyl(0.3, 0.05, 0, 0.025, 0, 'y', 6));
  out.dark.push(cyl(0.1, top - 0.05, 0, (top - 0.05) / 2 + 0.05, 0, 'y', 10));
  out.dark.push(cyl(0.66, 0.05, 0, top - 0.025, 0, 'y', 6));
  out.metal.push(cyl(0.68, 0.03, 0, top, 0, 'y', 6));
  return out;
}

export function disposeSec(v: SecVisual) {
  v.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  for (const m of v.materials) m.dispose();
}
