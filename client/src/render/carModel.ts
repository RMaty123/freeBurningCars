/**
 * Procedurální 3D modely aut.
 *
 * Základ je boční profil karoserie vytažený do šířky (ExtrudeGeometry) se zaoblenými hranami
 * a výřezy pro kola. Na něj se podle `CarShape` navěší detaily: rozšířené blatníky, boční sání,
 * nasávání na kapotě, splitter s difuzorem, křídlo, světla, kliky dveří, výfuky a kola s paprsky.
 * Díky tomu vypadá každé auto ze seznamu jinak, i když je všechno jen z pár geometrií.
 *
 * Model míří po ose +Z, kola jsou samostatné skupiny (točí se a přední zatáčí).
 * Všechny díly se slučují podle materiálu, takže jedno auto = osm draw-callů.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AccentPart, CarShape } from '../game/cars';

export interface CarVisual {
  root: THREE.Group;
  /** karoserie – naklání se v zatáčkách a při brzdění */
  body: THREE.Group;
  /** FL, FR, RL, RR */
  wheels: THREE.Group[];
  spins: THREE.Object3D[];
  paint: THREE.MeshPhysicalMaterial;
  /** druhá barva (kapota, střecha, prahy… podle `shape.accent`) */
  accent: THREE.MeshPhysicalMaterial;
  caliper: THREE.MeshStandardMaterial;
  stripe: THREE.MeshStandardMaterial;
  rim: THREE.MeshStandardMaterial;
  rearLights: THREE.MeshStandardMaterial;
  frontLights: THREE.MeshStandardMaterial;
  color: number;
  shape: CarShape;
  /** výška ramen karoserie (kam se dává kulomet, kouř…) */
  shoulder: number;
  roofY: number;
}

// ---------------------------------------------------------------- sdílené materiály
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2c3e, metalness: 0.55, roughness: 0.08, envMapIntensity: 1.3, emissive: 0x070d14 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.4, roughness: 0.65 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x2b2e36, metalness: 0.9, roughness: 0.35 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.0, roughness: 0.92 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.6, roughness: 0.5 });
const plateMat = new THREE.MeshStandardMaterial({ color: 0xe9e9e2, roughness: 0.6 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.18 });

// ---------------------------------------------------------------- pomocné geometrie
function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  // sjednocení atributů kvůli slučování
  for (const name of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(name)) out.deleteAttribute(name);
  return out;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return prep(g);
}

/** Kvádr pootočený kolem svislé osy – šikmé díly (sání, lamely). */
function boxY(w: number, h: number, d: number, x: number, y: number, z: number, ry: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(ry);
  g.translate(x, y, z);
  return prep(g);
}

function cyl(r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return prep(g);
}

/** Jeden paprsek kola: kvádr od středu ven, otočený o daný úhel. */
function spoke(w: number, len: number, thick: number, ang: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, len, thick);
  g.translate(0, len / 2, 0);
  g.rotateX(ang);
  return prep(g);
}

/** Oblouk blatníku nad kolem; `wide` ho roztáhne do šířky (rozšířený blatník). */
function fender(r: number, tube: number, wide: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, tube, 5, 14, Math.PI);
  g.rotateY(Math.PI / 2); // oblouk do roviny boku auta
  g.scale(wide, 1, 1);
  g.translate(x, y, z);
  return prep(g);
}

/** Vytáhne boční profil [z, y] do šířky a otočí ho tak, aby délka auta byla v ose Z. */
function sideExtrude(shape: THREE.Shape, width: number, bevel: number, grow = 0, offsetX = 0): THREE.BufferGeometry {
  const depth = width - 2 * bevel;
  // bevelOffset: zaoblení jde dovnitř, takže obrys profilu sedí přesně na zadané rozměry
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: bevel, bevelOffset: -bevel + grow, bevelThickness: bevel, bevelSegments: 3, steps: 1, curveSegments: 12,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2 + offsetX, 0, 0);
  return prep(g);
}

function merged(list: THREE.BufferGeometry[], mat: THREE.Material, shadow = true): THREE.Mesh | null {
  if (!list.length) return null;
  const g = mergeGeometries(list, false)!;
  const m = new THREE.Mesh(g, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}

// ---------------------------------------------------------------- stavba auta
export function buildCar(shape: CarShape, color: number): CarVisual {
  const L = shape.length, W = shape.width, g = shape.ground, wr = shape.wheelR, ww = shape.wheelW;
  const open = !!shape.openWheels;   // bugina / formule: kola vně karoserie
  const roofless = !!shape.roofless; // bez střechy, jen ochranný oblouk
  const bed = !!shape.bed;           // otevřená korba vzadu
  const nose = shape.nose;           // 0 tupá příď … 1 nízký klín
  const flares = shape.flares ?? 0;
  const lights = shape.lights ?? 'slim';
  const livery = shape.livery ?? 'center';
  const bodyW = open ? W - 2 * ww - 0.12 : W;
  const sh = open ? g + shape.bodyH : Math.max(g + shape.bodyH, 2 * wr + 0.12); // výška ramen
  const hB = sh - g;
  const zr = -L / 2, zf = L / 2;
  const axF = L * 0.31, axR = -L * 0.3;
  const zcr = zr + shape.cabinFrom * L, zcf = zr + shape.cabinTo * L;
  const ch = shape.cabinH;
  const cw = bodyW * (open ? 0.9 : 0.8);

  const paintGeo: THREE.BufferGeometry[] = [];
  const accentGeo: THREE.BufferGeometry[] = [];
  const stripeGeo: THREE.BufferGeometry[] = [];
  const glassGeo: THREE.BufferGeometry[] = [];
  const darkGeo: THREE.BufferGeometry[] = [];
  const gunGeo: THREE.BufferGeometry[] = [];
  const chromeGeo: THREE.BufferGeometry[] = [];
  const frontGeo: THREE.BufferGeometry[] = [];
  const rearGeo: THREE.BufferGeometry[] = [];

  // Dvoubarevný lak: díl jde do hlavní barvy, nebo do druhé, pokud ho auto má v `shape.accent`.
  const acc = new Set<AccentPart>(shape.accent ?? []);
  const put = (part: AccentPart, geo: THREE.BufferGeometry) => (acc.has(part) ? accentGeo : paintGeo).push(geo);
  /** spodní díly (prahy, nárazníky, difuzor): tmavé, nebo v druhé barvě */
  const putLow = (geo: THREE.BufferGeometry) => (acc.has('lower') ? accentGeo : darkGeo).push(geo);

  // ---- boční profil karoserie (proti směru hodin)
  const s = new THREE.Shape();
  const zWind = zcf + shape.windshield * ch * 1.2;
  const bedTop = g + hB * 0.6;
  s.moveTo(zr + 0.1, g);
  if (!open) {
    // výřezy pro kola
    const ra = wr + 0.05;
    const phi = Math.asin(Math.max(-1, Math.min(1, (g - wr) / ra)));
    for (const zc of [axR, axF]) {
      s.lineTo(zc - ra * Math.cos(phi), g);
      s.absarc(zc, wr, ra, Math.PI - phi, phi, true);
    }
  }
  s.lineTo(zf - 0.06, g);
  // příď: pro nose = 0 skoro svislá stěna (dodávka), pro nose = 1 dlouhý nízký klín (supersport)
  s.lineTo(zf, g + hB * (0.66 - 0.46 * nose));
  s.lineTo(Math.max(zWind + 0.16, zf - 0.04 - 0.3 * nose), g + hB * (0.95 - 0.3 * nose));
  s.lineTo(Math.max(zWind + 0.08, zf - 0.12 - 0.85 * nose), g + hB * (1 - 0.06 * nose));
  s.lineTo(zWind, sh);
  s.lineTo(zcr - 0.1, sh);
  if (bed) {
    // korba: karoserie za kabinou klesne, boky se přidají jako samostatné díly
    s.lineTo(zcr - 0.2, bedTop);
    s.lineTo(zr + 0.12, bedTop);
    s.lineTo(zr, g + hB * 0.42);
  } else {
    s.lineTo(zr + 0.14, g + hB * (shape.spoiler ? 0.98 : 0.93));
    s.lineTo(zr, g + hB * 0.62);
  }
  s.closePath();
  paintGeo.push(sideExtrude(s, bodyW, 0.07));

  // ---- panel kapoty (jen když má jinou barvu – jinak je kapota součástí karoserie)
  if (acc.has('hood')) {
    const yA = sh, zA = zWind;
    const zB = Math.max(zWind + 0.1, zf - 0.14 - 0.85 * nose), yB = g + hB * (1 - 0.06 * nose);
    const len = Math.hypot(zB - zA, yA - yB);
    accentGeo.push(box(bodyW * 0.84, 0.05, len * 0.94, 0, (yA + yB) / 2 + 0.018, (zA + zB) / 2, Math.atan2(yA - yB, zB - zA)));
  }

  // ---- lak: pruhy obepínají kapotu i záď (stejný profil, jen užší a o chlup větší)
  if (livery === 'center') stripeGeo.push(sideExtrude(s, bodyW * 0.26, 0.02, 0.012));
  else if (livery === 'twin') {
    for (const sx of [-1, 1]) stripeGeo.push(sideExtrude(s, bodyW * 0.11, 0.02, 0.012, sx * bodyW * 0.1));
  } else if (livery === 'flash') {
    // boční blesk přes dveře
    for (const sx of [-1, 1]) {
      stripeGeo.push(boxY(0.05, hB * 0.2, (zcf - zcr) * 1.25, sx * (bodyW / 2 - 0.01), g + hB * 0.5, (zcf + zcr) / 2, 0));
      stripeGeo.push(boxY(0.05, hB * 0.3, hB * 0.5, sx * (bodyW / 2 - 0.01), g + hB * 0.62, zcr + 0.1, 0.5));
    }
  }

  // ---- rozšířené blatníky
  if (flares > 0 && !open) {
    const wide = 1 + flares * 3.4;
    for (const sx of [-1, 1]) for (const zc of [axF, axR]) {
      put('flares', fender(wr + 0.1, 0.075, wide, sx * (bodyW / 2 - 0.03), wr, zc));
    }
  }

  // ---- kabina: prosklená bublina, nebo otevřený kokpit s obloukem
  let roofY: number;
  if (roofless) {
    roofY = sh + ch * 0.8;
    glassGeo.push(box(cw * 0.84, ch * 0.6, 0.05, 0, sh + ch * 0.28, zcf - 0.06, -0.32));
    for (const sx of [-1, 1]) {
      paintGeo.push(box(0.07, ch * 0.64, 0.07, sx * cw * 0.44, sh + ch * 0.3, zcf - 0.06));
      gunGeo.push(box(0.09, ch * 0.8, 0.09, sx * (cw / 2), sh + ch * 0.4, zcr + 0.08));
    }
    gunGeo.push(box(cw + 0.12, 0.09, 0.09, 0, sh + ch * 0.8, zcr + 0.08));
    darkGeo.push(box(cw * 0.46, ch * 0.5, 0.14, 0, sh + ch * 0.25, zcr + 0.26));          // opěradlo
    darkGeo.push(box(cw * 0.52, 0.08, (zcf - zcr) * 0.5, 0, sh + 0.02, (zcf + zcr) / 2)); // vana kokpitu
  } else {
    const cs = new THREE.Shape();
    cs.moveTo(zcr - shape.rearGlass * ch * 1.5, sh - 0.03);
    cs.lineTo(zcf + shape.windshield * ch * 1.3, sh - 0.03);
    cs.lineTo(zcf, sh + ch);
    cs.lineTo(zcr, sh + ch);
    cs.closePath();
    glassGeo.push(sideExtrude(cs, cw, 0.08));
    roofY = sh + ch;
    // střecha a sloupky v barvě vozu
    put('roof', box(cw - 0.1, 0.06, zcf - zcr - 0.04, 0, roofY + 0.012, (zcf + zcr) / 2));
    if (livery === 'center') stripeGeo.push(box(bodyW * 0.26, 0.07, zcf - zcr - 0.02, 0, roofY + 0.014, (zcf + zcr) / 2));
    if (livery === 'twin') for (const sx of [-1, 1]) stripeGeo.push(box(bodyW * 0.11, 0.07, zcf - zcr - 0.02, sx * bodyW * 0.1, roofY + 0.014, (zcf + zcr) / 2));
    // zrcátka
    for (const sx of [-1, 1]) {
      darkGeo.push(box(0.1, 0.05, 0.06, sx * (cw / 2 + 0.08), sh + 0.1, zcf + 0.06));
      put('mirrors', box(0.18, 0.09, 0.12, sx * (cw / 2 + 0.16), sh + 0.13, zcf + 0.08));
    }
    // linka dveří, klika a lišta pod okny
    for (const sx of [-1, 1]) {
      darkGeo.push(box(0.03, hB * 0.42, 0.035, sx * (bodyW / 2), g + hB * 0.6, zcr + 0.06));
      darkGeo.push(box(0.04, 0.05, 0.22, sx * (bodyW / 2 + 0.01), sh - 0.15, (zcf + zcr) / 2 - 0.1));
      chromeGeo.push(box(0.035, 0.05, zcf - zcr + 0.22, sx * (cw / 2 + 0.015), sh - 0.02, (zcf + zcr) / 2));
    }
    // interiér: palubka a opěradla, vidět skrz sklo
    darkGeo.push(box(cw * 0.88, ch * 0.26, 0.1, 0, sh + ch * 0.16, zcf - 0.14));
    for (const sx of [-1, 1]) darkGeo.push(box(cw * 0.3, ch * 0.5, 0.09, sx * cw * 0.22, sh + ch * 0.3, zcr + 0.2));
  }

  // ---- korba pick-upu
  if (bed) {
    const wallH = hB * 0.38, zbR = zr + 0.12, zbF = zcr - 0.2;
    for (const sx of [-1, 1]) put('bed', box(0.1, wallH, zbF - zbR, sx * (bodyW / 2 - 0.05), bedTop + wallH / 2, (zbF + zbR) / 2));
    put('bed', box(bodyW, wallH, 0.1, 0, bedTop + wallH / 2, zbR));
    darkGeo.push(box(bodyW - 0.22, 0.05, zbF - zbR, 0, bedTop + 0.03, (zbF + zbR) / 2));
  }

  // ---- spodek, maska, prahy
  darkGeo.push(box(bodyW - 0.5, hB - 0.16, L - 0.5, 0, g + hB / 2 - 0.02, 0)); // podvozek (vyplní podběhy)
  darkGeo.push(box(bodyW * 0.56, hB * 0.26, 0.08, 0, g + hB * 0.36, zf - 0.03)); // maska
  for (let i = 0; i < 3; i++) chromeGeo.push(box(bodyW * 0.44, 0.025, 0.05, 0, g + hB * (0.3 + i * 0.06), zf - 0.01)); // lamely mřížky
  if (!open) {
    const skirt = axF - axR - 2 * (wr + 0.12);
    for (const sx of [-1, 1]) putLow(box(0.09, hB * 0.22, skirt, sx * (bodyW / 2), g + hB * 0.1, (axF + axR) / 2));
  }
  darkGeo.push(box(bodyW * 0.34, hB * 0.2, 0.06, 0, g + hB * 0.6, zr + 0.01)); // panel mezi zadními světly

  // ---- boční sání před zadními koly
  if (shape.intakes) {
    for (const sx of [-1, 1]) {
      const zi = axR + wr + 0.42;
      darkGeo.push(box(0.09, hB * 0.3, 0.5, sx * (bodyW / 2 - 0.02), g + hB * 0.5, zi));
      for (let k = 0; k < 3; k++) chromeGeo.push(box(0.05, 0.03, 0.42, sx * (bodyW / 2 + 0.01), g + hB * (0.42 + k * 0.08), zi));
    }
  }

  // ---- nasávání na kapotě / kompresor
  const zHood = (zWind + zf) / 2;
  if (shape.scoop === 1) {
    darkGeo.push(box(bodyW * 0.34, 0.09, 0.42, 0, sh - 0.02, zHood, -0.1));
    paintGeo.push(box(bodyW * 0.42, 0.07, 0.5, 0, sh - 0.06, zHood, -0.1));
  } else if (shape.scoop === 2) {
    // kompresor trčící z kapoty (hot rod)
    const hy = g + hB * 0.95;
    darkGeo.push(box(bodyW * 0.46, 0.26, 0.6, 0, hy + 0.12, zHood));
    chromeGeo.push(box(bodyW * 0.5, 0.08, 0.5, 0, hy + 0.28, zHood));
    for (const sx of [-1, 1]) chromeGeo.push(cyl(0.11, 0.26, sx * bodyW * 0.14, hy + 0.42, zHood, 'y', 10));
  }

  // ---- splitter a difuzor
  if (shape.splitter) {
    putLow(box(bodyW * 1.04, 0.05, 0.42, 0, g + 0.03, zf - 0.14));
    for (const sx of [-1, 1]) darkGeo.push(box(0.05, hB * 0.3, 0.3, sx * bodyW * 0.5, g + hB * 0.17, zf - 0.2));
    putLow(box(bodyW * 0.92, hB * 0.22, 0.3, 0, g + hB * 0.12, zr + 0.16));
    for (let k = -1.5; k <= 1.5; k++) darkGeo.push(box(0.05, hB * 0.26, 0.34, k * bodyW * 0.17, g + hB * 0.14, zr + 0.14));
  } else {
    putLow(box(bodyW * 0.96, 0.08, 0.34, 0, g + 0.02, zf - 0.1)); // přední spoiler
    putLow(box(bodyW * 0.9, 0.1, 0.2, 0, g + 0.05, zr + 0.08));   // difuzor
  }

  // ---- výfuky
  if (shape.sideExhaust) {
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      chromeGeo.push(cyl(0.06, 0.34, sx * (bodyW / 2 - 0.02), g + hB * 0.22, axF - 0.5 - k * 0.3, 'x', 8));
    }
  } else {
    const quad = shape.spoiler >= 2;
    for (const sx of [-1, 1]) {
      if (quad) {
        chromeGeo.push(cyl(0.055, 0.28, sx * (bodyW * 0.2), g + 0.12, zr + 0.02, 'z', 8));
        chromeGeo.push(cyl(0.055, 0.28, sx * (bodyW * 0.32), g + 0.12, zr + 0.02, 'z', 8));
      } else chromeGeo.push(cyl(0.065, 0.3, sx * bodyW * 0.28, g + 0.1, zr + 0.02, 'z', 8));
    }
  }

  // ---- zadní křídlo
  if (shape.spoiler === 1) {
    // lipa na víku kufru
    put('wing', box(bodyW * 0.92, 0.07, 0.26, 0, sh + 0.06, zr + 0.2, -0.3));
  } else if (shape.spoiler >= 2) {
    const swan = shape.spoiler === 3;
    // formule nese křídlo vysoko, hypersport nízko a elegantně, tuner naopak co nejvýš
    const wingH = swan ? (open ? 0.72 : 0.3) : 0.5;
    const wingD = swan ? 0.5 : 0.44;
    const wy = sh + wingH, wz = zr + 0.24;
    put('wing', box(bodyW * (swan ? 1.06 : 0.96), 0.06, wingD, 0, wy, wz, -0.17));
    for (const sx of [-1, 1]) {
      if (swan) {
        // labutí krky: držák shora, zalomený
        darkGeo.push(box(0.06, wingH * 0.6, 0.12, sx * bodyW * 0.3, wy - wingH * 0.3, wz + 0.1));
        darkGeo.push(box(0.06, 0.12, 0.34, sx * bodyW * 0.3, wy - wingH * 0.58, wz + 0.22, 0.5));
        put('wing', box(0.05, 0.3, wingD, sx * bodyW * 0.53, wy + 0.1, wz)); // koncová deska
      } else {
        darkGeo.push(box(0.07, wingH, 0.22, sx * bodyW * 0.33, sh + wingH / 2, wz));
      }
    }
  }

  // ---- světla
  const fy = g + hB * (0.62 - 0.18 * nose), ry = g + hB * 0.62;
  if (lights === 'strip') {
    frontGeo.push(box(bodyW * 0.86, hB * 0.08, 0.09, 0, fy, zf - 0.08, 0.2));
    rearGeo.push(box(bodyW * 0.9, hB * 0.09, 0.08, 0, ry, zr + 0.02));
  } else if (lights === 'round' || lights === 'quad') {
    const n = lights === 'quad' ? 2 : 1;
    const lr = hB * (lights === 'quad' ? 0.11 : 0.15);
    for (const sx of [-1, 1]) for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * lr * 2.4;
      frontGeo.push(cyl(lr, 0.1, sx * (bodyW * 0.3) + off, fy, zf - 0.04, 'z', 12));
      chromeGeo.push(cyl(lr * 1.22, 0.06, sx * (bodyW * 0.3) + off, fy, zf - 0.07, 'z', 12));
      rearGeo.push(cyl(lr * 0.85, 0.08, sx * (bodyW * 0.3) + off, ry, zr + 0.02, 'z', 12));
    }
  } else {
    for (const sx of [-1, 1]) {
      frontGeo.push(box(bodyW * 0.24, hB * 0.14, 0.12, sx * bodyW * 0.33, fy, zf - 0.05, 0.2));
      rearGeo.push(box(bodyW * 0.27, hB * 0.15, 0.12, sx * bodyW * 0.31, ry, zr + 0.03));
    }
  }
  const plateGeo = [box(0.46, 0.13, 0.03, 0, g + hB * 0.42, zr - 0.02)];

  // ---- zbraně: dva kulomety na kapotě
  const gz = Math.min(zf - 0.75, zWind + 0.75);
  for (const sx of [-1, 1]) {
    gunGeo.push(box(0.2, 0.12, 0.5, sx * bodyW * 0.27, sh + 0.02, gz - 0.25));
    gunGeo.push(cyl(0.045, 0.95, sx * bodyW * 0.27, sh + 0.07, gz + 0.15, 'z', 8));
    gunGeo.push(cyl(0.07, 0.14, sx * bodyW * 0.27, sh + 0.07, gz + 0.58, 'z', 8));
  }

  // ---- offroad výbava
  if (shape.rugged) {
    gunGeo.push(box(bodyW * 0.8, 0.07, 0.07, 0, g + hB * 0.75, zf + 0.12));
    gunGeo.push(box(bodyW * 0.8, 0.07, 0.07, 0, g + hB * 0.3, zf + 0.12));
    for (const sx of [-1, 1]) gunGeo.push(box(0.07, hB * 0.55, 0.07, sx * bodyW * 0.3, g + hB * 0.52, zf + 0.12));
    if (!roofless) {
      for (const sx of [-1, 1]) gunGeo.push(box(0.08, ch + 0.2, 0.08, sx * (cw / 2 + 0.02), sh + (ch + 0.2) / 2, zcr - 0.12));
      gunGeo.push(box(cw + 0.12, 0.08, 0.08, 0, sh + ch + 0.2, zcr - 0.12));
    }
  }
  if (shape.rugged && !open && !roofless) {
    for (let i = -1.5; i <= 1.5; i++) frontGeo.push(box(0.2, 0.12, 0.1, i * 0.3, roofY + 0.12, zcf - 0.1)); // světelná rampa
    gunGeo.push(box(1.3, 0.05, 0.1, 0, roofY + 0.05, zcf - 0.12));
  }
  if (shape.spare) {
    const sr = wr * 0.9;
    const sz = bed ? zcr - 0.42 : zr - 0.14;
    const sy = bed ? bedTop + sr : g + hB * 0.58;
    darkGeo.push(cyl(sr, 0.22, 0, sy, sz, 'z', 16));
    gunGeo.push(cyl(sr * 0.45, 0.26, 0, sy, sz, 'z', 10));
  }
  if (open) {
    // bugina / formule: nápravy a blatníčky nad koly
    for (const zc of [axF, axR]) {
      darkGeo.push(cyl(0.06, W - 0.2, 0, wr, zc, 'x', 6));
      for (const sx of [-1, 1]) put('flares', box(ww + 0.06, 0.05, wr * 1.5, sx * (W / 2 - ww / 2), wr * 2 + 0.08, zc));
    }
  }

  // ---------------------------------------------------------------- materiály a sestavení
  // povrch laku – od matného vojenského po perleť hypersportu
  const F = {
    gloss: { metalness: 0.65, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.06 },
    matte: { metalness: 0.12, roughness: 0.8, clearcoat: 0.15, clearcoatRoughness: 0.6 },
    metallic: { metalness: 0.92, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.04 },
    pearl: { metalness: 0.45, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.02 },
  }[shape.finish ?? 'gloss'];
  const paint = new THREE.MeshPhysicalMaterial({ color, ...F });
  const accentHex = shape.accentColor ?? new THREE.Color(color).multiplyScalar(0.3).getHex();
  const accent = new THREE.MeshPhysicalMaterial({ color: accentHex, ...F });
  const caliper = new THREE.MeshStandardMaterial({ color: shape.caliperColor ?? 0xc0392b, metalness: 0.5, roughness: 0.35 });
  const pc = new THREE.Color(color);
  const light = 0.3 * pc.r + 0.6 * pc.g + 0.1 * pc.b > 0.45;
  const stripe = new THREE.MeshStandardMaterial({ color: shape.liveryColor ?? (light ? 0x16171b : 0xf4f4f0), metalness: 0.3, roughness: 0.4 });
  const rim = new THREE.MeshStandardMaterial({ color: shape.rimColor ?? 0xd4d9e2, metalness: 0.85, roughness: 0.3 });
  const frontLights = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c8, emissiveIntensity: 2.2, roughness: 0.3 });
  const rearLights = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1010, emissiveIntensity: 1.4, roughness: 0.3 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  for (const [list, mat, shadow] of [
    [paintGeo, paint, true], [accentGeo, accent, true], [stripeGeo, stripe, false], [plateGeo, plateMat, false], [glassGeo, glassMat, true],
    [darkGeo, darkMat, true], [chromeGeo, chromeMat, false], [gunGeo, gunMat, true],
    [frontGeo, frontLights, false], [rearGeo, rearLights, false],
  ] as [THREE.BufferGeometry[], THREE.Material, boolean][]) {
    const m = merged(list, mat, shadow);
    if (m) body.add(m);
  }

  // ---- kola s paprsky
  const spokes = shape.rimSpokes ?? 5;
  const tireGeo = mergeGeometries([cyl(wr, ww, 0, 0, 0, 'x', 20)])!;
  const rimParts = [cyl(wr * 0.52, ww + 0.02, 0, 0, 0, 'x', 16)];
  for (let i = 0; i < spokes; i++) rimParts.push(spoke(ww + 0.03, wr * 0.86, wr * 0.17, (i / spokes) * Math.PI * 2));
  const rimGeo = mergeGeometries(rimParts)!;
  // náboj, vnitřek disku a brzdový kotouč (vidět mezi paprsky)
  const hubGeo = mergeGeometries([
    cyl(wr * 0.22, ww + 0.06, 0, 0, 0, 'x', 10),
    cyl(wr * 0.9, ww * 0.5, 0, 0, 0, 'x', 16),
    cyl(wr * 0.66, ww * 0.26, 0, 0, 0, 'x', 20),
  ])!;
  const caliperGeo = box(ww * 0.42, wr * 0.52, wr * 0.26, 0, wr * 0.42, -wr * 0.34);
  const wheels: THREE.Group[] = [];
  const spins: THREE.Object3D[] = [];
  const wx = W / 2 - ww / 2 + (open ? 0 : 0.03);
  for (const [sx, az] of [[1, axF], [-1, axF], [1, axR], [-1, axR]] as [number, number][]) {
    const wgroup = new THREE.Group();
    wgroup.position.set(sx * wx, wr, az);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spin.add(tire, new THREE.Mesh(hubGeo, hubMat), new THREE.Mesh(rimGeo, rim));
    wgroup.add(spin, new THREE.Mesh(caliperGeo, caliper)); // třmen se netočí s kolem
    root.add(wgroup);
    wheels.push(wgroup);
    spins.push(spin);
  }

  return { root, body, wheels, spins, paint, accent, caliper, stripe, rim, rearLights, frontLights, color, shape, shoulder: sh, roofY };
}

export function setWrecked(v: CarVisual, wrecked: boolean) {
  if (wrecked) {
    v.paint.color.setHex(0x161616);
    v.paint.roughness = 0.95; v.paint.clearcoat = 0; v.paint.metalness = 0.2;
    v.accent.userData.c ??= v.accent.color.getHex();
    v.accent.color.setHex(0x101010);
    v.accent.roughness = 0.95; v.accent.clearcoat = 0; v.accent.metalness = 0.2;
    v.stripe.userData.c ??= v.stripe.color.getHex();
    v.stripe.color.setHex(0x1d1d1d);
    v.frontLights.emissiveIntensity = 0;
    v.rearLights.emissiveIntensity = 0;
  } else {
    v.paint.color.setHex(v.color);
    v.paint.roughness = 0.42; v.paint.clearcoat = 1; v.paint.metalness = 0.65;
    if (v.accent.userData.c !== undefined) v.accent.color.setHex(v.accent.userData.c);
    v.accent.roughness = v.paint.roughness; v.accent.clearcoat = 1; v.accent.metalness = v.paint.metalness;
    if (v.stripe.userData.c !== undefined) v.stripe.color.setHex(v.stripe.userData.c);
    v.frontLights.emissiveIntensity = 2.2;
    v.rearLights.emissiveIntensity = 1.4;
  }
}

export function disposeCar(v: CarVisual) {
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  v.paint.dispose(); v.accent.dispose(); v.caliper.dispose(); v.stripe.dispose(); v.rim.dispose(); v.frontLights.dispose(); v.rearLights.dispose();
}
