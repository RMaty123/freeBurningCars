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
import type { GunStats } from '../game/guns';

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
  /** svítící části zbraně (čočky laserů na dveřích) */
  laser: THREE.MeshBasicMaterial;
  /** ústí zbraní v souřadnicích karoserie (zleva doprava) */
  muzzles: THREE.Vector3[];
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

/** Válec; `r2` zúží / rozšíří zadní konec (kužel, např. ústí hlavně). */
function cyl(r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', seg = 10, r2 = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r2, len, seg);
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

/**
 * Plochý panel daný půdorysem (body [x, z]) – kapota, víko motoru, lamely.
 * `y` je spodek panelu, `rx` ho nakloní kolem osy X procházející z = `zPivot`.
 */
function plate(pts: [number, number][], y: number, th: number, rx = 0, zPivot = 0): THREE.BufferGeometry {
  const sp = new THREE.Shape();
  pts.forEach(([px, pz], i) => (i ? sp.lineTo(px, pz) : sp.moveTo(px, pz)));
  sp.closePath();
  const g = new THREE.ExtrudeGeometry(sp, { depth: th, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(Math.PI / 2); // půdorys si lehne do roviny XZ a tloušťka jde nahoru
  g.translate(0, th, 0);
  if (rx) {
    g.translate(0, 0, -zPivot);
    g.rotateX(rx);
    g.translate(0, 0, zPivot);
  }
  g.translate(0, y, 0);
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
export function buildCar(shape: CarShape, color: number, gun?: GunStats): CarVisual {
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

  // ---- šikmé čelo: maska a světla musí sedět na plášti, ne trčet z klínu
  const noseA: [number, number] = [zf, g + hB * (0.66 - 0.46 * nose)];
  const noseB: [number, number] = [Math.max(zWind + 0.16, zf - 0.04 - 0.3 * nose), g + hB * (0.95 - 0.3 * nose)];
  const nd: [number, number] = [noseB[0] - noseA[0], noseB[1] - noseA[1]];
  const nLen = Math.hypot(nd[0], nd[1]);
  const nrm: [number, number] = [nd[1] / nLen, -nd[0] / nLen]; // normála [z, y] ven z karoserie
  const noseRx = -Math.atan2(nrm[1], nrm[0]);
  /** Bod na čele: `t` = 0 dole … 1 nahoře, `out` = jak moc díl vystupuje. Vrací [z, y]. */
  const noseAt = (t: number, out: number): [number, number] =>
    [noseA[0] + nd[0] * t + nrm[0] * out, noseA[1] + nd[1] * t + nrm[1] * out];

  // ---- panel kapoty (jen když má jinou barvu – jinak je kapota součástí karoserie)
  if (acc.has('hood')) {
    const yA = sh, zA = zWind;
    const zB = Math.max(zWind + 0.1, zf - 0.14 - 0.85 * nose), yB = g + hB * (1 - 0.06 * nose);
    const len = Math.hypot(zB - zA, yA - yB);
    accentGeo.push(box(bodyW * 0.84, 0.05, len * 0.94, 0, (yA + yB) / 2 + 0.018, (zA + zB) / 2, Math.atan2(yA - yB, zB - zA)));
  }

  // ---- tmavý hřbet: klín na kapotě a víko motoru v druhé barvě (hypersport)
  const yHood = g + hB * (1 - 0.06 * nose);
  const zHoodEnd = Math.max(zWind + 0.32, zf - 0.16 - 0.78 * nose);
  if (acc.has('spine')) {
    accentGeo.push(plate(
      [[-bodyW * 0.34, zWind - 0.05], [bodyW * 0.34, zWind - 0.05], [bodyW * 0.17, zHoodEnd], [-bodyW * 0.17, zHoodEnd]],
      (sh + yHood) / 2 - 0.012, 0.05, Math.atan2(sh - yHood, zHoodEnd - zWind), (zWind + zHoodEnd) / 2));
    if (!bed) {
      const zDeck = zr + 0.22;
      accentGeo.push(plate(
        [[-bodyW * 0.4, zcr + 0.06], [bodyW * 0.4, zcr + 0.06], [bodyW * 0.33, zDeck], [-bodyW * 0.33, zDeck]],
        sh - 0.038, 0.05));
    }
  }

  // ---- lamely na víku motoru
  if (shape.deckVents && !bed) {
    const zvF = zcr - 0.16, zvR = zr + 0.5;
    for (let k = 0; k < 3; k++) {
      const zz = zvF + (zvR - zvF) * ((k + 0.5) / 3);
      darkGeo.push(box(bodyW * 0.34, 0.05, 0.09, 0, sh + 0.02, zz, 0.42));
    }
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
  // výplň podběhů: jen tak vysoká, aby zakryla výřezy – jinak by prorazila klínovou příď
  const fz0 = axR - wr - 0.12, fz1 = axF + wr + 0.12;
  const fillTop = Math.min(g + hB - 0.08, wr + 0.16);
  darkGeo.push(box(bodyW - 0.5, fillTop - g, fz1 - fz0, 0, (g + fillTop) / 2, (fz0 + fz1) / 2));
  const [mz, my] = noseAt(0.34, 0.01);
  darkGeo.push(box(bodyW * 0.56, Math.min(hB * 0.26, nLen * 0.5), 0.08, 0, my, mz, noseRx)); // maska
  for (let i = 0; i < 3; i++) {
    const [lz, ly] = noseAt(0.26 + i * 0.08, 0.04);
    chromeGeo.push(box(bodyW * 0.44, 0.025, 0.05, 0, ly, lz, noseRx)); // lamely mřížky
  }
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
    putLow(box(bodyW * 0.99, 0.05, 0.36, 0, g + 0.03, zf - 0.16));
    for (const sx of [-1, 1]) darkGeo.push(box(0.05, hB * 0.3, 0.3, sx * bodyW * 0.5, g + hB * 0.17, zf - 0.2));
    putLow(box(bodyW * 0.92, hB * 0.22, 0.3, 0, g + hB * 0.12, zr + 0.16));
    for (let k = -1.5; k <= 1.5; k++) darkGeo.push(box(0.05, hB * 0.26, 0.34, k * bodyW * 0.17, g + hB * 0.14, zr + 0.14));
  } else {
    putLow(box(bodyW * 0.96, 0.08, 0.34, 0, g + 0.02, zf - 0.1)); // přední spoiler
    putLow(box(bodyW * 0.9, 0.1, 0.2, 0, g + 0.05, zr + 0.08));   // difuzor
  }

  // ---- výfuky
  if (shape.sideExhaust) {
    // chromovaný svod podél prahu: trubka, tlumič, koncovka a stahovací pásky
    const zA = axF - wr - 0.22, zB = axR + wr + 0.18, len = Math.max(0.8, zA - zB), zc = (zA + zB) / 2;
    for (const sx of [-1, 1]) {
      const ex = sx * (bodyW / 2 + 0.035), ey = g + hB * 0.26;
      chromeGeo.push(cyl(0.05, len, ex, ey, zc, 'z', 10));
      chromeGeo.push(box(0.15, 0.17, len * 0.42, ex + sx * 0.012, ey, zc - len * 0.08));
      chromeGeo.push(cyl(0.075, 0.2, ex, ey, zB + 0.02, 'z', 10));
      for (const t of [0.26, 0.74]) gunGeo.push(box(0.17, 0.055, 0.05, ex, ey, zB + len * t));
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
  } else if (shape.spoiler === 4) {
    // vysoké rovné křídlo na dvou stojkách – hypersport
    const wd = 0.46, wy = sh + 0.33, wz = zr + 0.74;
    put('wing', box(bodyW * 1.0, 0.05, wd, 0, wy, wz, 0.13));
    put('wing', box(bodyW * 1.0, 0.09, 0.05, 0, wy + 0.045, wz - wd * 0.48, 0.13)); // odtoková hrana
    for (const sx of [-1, 1]) {
      gunGeo.push(box(0.055, 0.34, 0.2, sx * bodyW * 0.29, sh + 0.17, wz + 0.03)); // stojka
      gunGeo.push(box(0.03, 0.19, wd + 0.06, sx * bodyW * 0.5, wy + 0.05, wz));    // koncová deska
    }
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

  // ---- hřeben na střeše, který sbíhá na víko motoru
  if (shape.roofScoop && !roofless && !bed) {
    darkGeo.push(box(cw * 0.15, 0.06, zcf - zcr - 0.24, 0, roofY + 0.035, (zcf + zcr) / 2 - 0.05));
    darkGeo.push(box(cw * 0.13, 0.06, 0.5, 0, roofY - 0.08, zcr - 0.21, -0.44));
  }

  // ---- světla
  const ry = g + hB * 0.62;
  if (lights === 'strip') {
    const [lz, ly] = noseAt(0.62, 0.015);
    frontGeo.push(box(bodyW * 0.86, hB * 0.08, 0.09, 0, ly, lz, noseRx));
    rearGeo.push(box(bodyW * 0.9, hB * 0.09, 0.08, 0, ry, zr + 0.02));
  } else if (lights === 'round' || lights === 'quad') {
    const n = lights === 'quad' ? 2 : 1;
    const lr = hB * (lights === 'quad' ? 0.11 : 0.15);
    const [lz, ly] = noseAt(0.5, 0.0);
    for (const sx of [-1, 1]) for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * lr * 2.4;
      frontGeo.push(cyl(lr, 0.1, sx * (bodyW * 0.3) + off, ly, lz + 0.03, 'z', 12));
      chromeGeo.push(cyl(lr * 1.22, 0.06, sx * (bodyW * 0.3) + off, ly, lz, 'z', 12));
      rearGeo.push(cyl(lr * 0.85, 0.08, sx * (bodyW * 0.3) + off, ry, zr + 0.02, 'z', 12));
    }
  } else {
    const [lz, ly] = noseAt(0.56, 0.015);
    for (const sx of [-1, 1]) {
      frontGeo.push(box(bodyW * 0.24, Math.min(hB * 0.14, nLen * 0.3), 0.12, sx * bodyW * 0.33, ly, lz, noseRx));
      rearGeo.push(box(bodyW * 0.27, hB * 0.15, 0.12, sx * bodyW * 0.31, ry, zr + 0.03));
    }
  }
  const plateGeo = [box(0.46, 0.13, 0.03, 0, g + hB * 0.42, zr - 0.02)];

  // ---- zbraně: buď dva kulomety na kapotě, nebo dva lasery na dveřích
  const gz = Math.min(zf - 0.75, zWind + 0.75);
  const laserGeo: THREE.BufferGeometry[] = [];
  /** kde zbraň ústí (v souřadnicích karoserie) – odtud se kreslí paprsky a záblesky */
  const muzzles: THREE.Vector3[] = [];
  if (gun?.mount === 'side') {
    // laserové dělo přišroubované zvenku na dveře – končí kousek za předním kolem, míří dopředu
    const zF = axF - wr - 0.28;
    const zR = Math.max(axR + wr + 0.12, zF - 1.15);
    const len = Math.max(0.6, zF - zR);
    const py = g + hB * 0.46;
    const ps = Math.min(1.3, Math.max(0.8, bodyW / 2.1)); // na formuli menší dělo, na náklaďáku větší
    const px = bodyW / 2 + 0.085 * ps;
    for (const sx of [-1, 1]) {
      const x = sx * px;
      // dva držáky do karoserie
      for (const t of [0.22, 0.68]) {
        const bz = zR + len * t;
        darkGeo.push(box(0.14 * ps, 0.13 * ps, 0.11 * ps, sx * (bodyW / 2 - 0.03), py, bz));
        gunGeo.push(box(0.13 * ps, 0.17 * ps, 0.1 * ps, sx * (bodyW / 2 + 0.04 * ps), py, bz));
      }
      chromeGeo.push(box(0.17 * ps, 0.19 * ps, len * 0.46, x, py, zR + len * 0.23));            // tělo děla
      darkGeo.push(box(0.185 * ps, 0.055 * ps, len * 0.32, x, py + 0.095 * ps, zR + len * 0.2)); // žebra chlazení
      darkGeo.push(box(0.19 * ps, 0.08 * ps, 0.06, x, py - 0.085 * ps, zR + len * 0.08));        // patka vzadu
      laserGeo.push(box(0.05 * ps, 0.045 * ps, len * 0.36, x + sx * 0.072 * ps, py + 0.075 * ps, zR + len * 0.2)); // svítící proužek
      chromeGeo.push(cyl(0.058 * ps, len * 0.58, x, py, zR + len * 0.72, 'z', 10));              // hlaveň
      for (const t of [0.47, 0.78]) gunGeo.push(cyl(0.085 * ps, 0.055 * ps, x, py, zR + len * t, 'z', 12)); // objímky
      laserGeo.push(cyl(0.072 * ps, 0.045 * ps, x, py, zR + len * 0.63, 'z', 12));               // světelný prstenec
      gunGeo.push(cyl(0.062 * ps, 0.16 * ps, x, py, zF - 0.07, 'z', 12, 0.095 * ps));            // ústí se zužuje dopředu
      laserGeo.push(cyl(0.052 * ps, 0.11 * ps, x, py, zF + 0.015, 'z', 12));                     // zářící čočka
      muzzles.push(new THREE.Vector3(x, py, zF + 0.06));
    }
  } else {
    for (const sx of [-1, 1]) {
      const gx = sx * bodyW * 0.27;
      gunGeo.push(box(0.14, 0.09, 0.34, gx, sh - 0.01, gz - 0.12));
      gunGeo.push(box(0.15, 0.035, 0.05, gx, sh + 0.035, gz + 0.06)); // objímka hlavní
      for (const [ox, oy] of [[-0.032, 0], [0.032, 0], [0, 0.05]] as [number, number][]) {
        gunGeo.push(cyl(0.019, 0.52, gx + ox, sh + 0.02 + oy, gz + 0.26, 'z', 6));
      }
      chromeGeo.push(cyl(0.046, 0.08, gx, sh + 0.035, gz + 0.5, 'z', 8)); // ústí
      muzzles.push(new THREE.Vector3(gx, sh + 0.035, gz + 0.56));
    }
  }
  // ústí se ukládají zleva doprava, ať odpovídají pořadí paprsků v simulaci
  muzzles.sort((a, b) => a.x - b.x);

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
  // svítící části zbraně (čočky laserů) – přesně v barvě jejích střel, bez vlivu světla
  const laserMat = new THREE.MeshBasicMaterial({ color: gun?.color ?? 0x6ff0ff, toneMapped: false });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  for (const [list, mat, shadow] of [
    [paintGeo, paint, true], [accentGeo, accent, true], [stripeGeo, stripe, false], [plateGeo, plateMat, false], [glassGeo, glassMat, true],
    [darkGeo, darkMat, true], [chromeGeo, chromeMat, false], [gunGeo, gunMat, true],
    [frontGeo, frontLights, false], [rearGeo, rearLights, false], [laserGeo, laserMat, false],
  ] as [THREE.BufferGeometry[], THREE.Material, boolean][]) {
    const m = merged(list, mat, shadow);
    if (m) body.add(m);
  }

  // ---- kola s paprsky
  const spokes = shape.rimSpokes ?? 5;
  const spokeTh = wr * Math.min(0.17, 1.5 / spokes); // hodně paprsků = tenké
  const tireGeo = mergeGeometries([cyl(wr, ww, 0, 0, 0, 'x', 20)])!;
  const rimParts = [cyl(wr * 0.52, ww + 0.02, 0, 0, 0, 'x', 16)];
  for (let i = 0; i < spokes; i++) rimParts.push(spoke(ww + 0.03, wr * 0.86, spokeTh, (i / spokes) * Math.PI * 2));
  const rimGeo = mergeGeometries(rimParts)!;
  // náboj, vnitřek disku a brzdový kotouč (vidět mezi paprsky)
  const hubGeo = mergeGeometries([
    cyl(wr * 0.22, ww + 0.06, 0, 0, 0, 'x', 10),
    cyl(wr * 0.9, ww * 0.5, 0, 0, 0, 'x', 16),
    cyl(wr * 0.66, ww * 0.26, 0, 0, 0, 'x', 20),
  ])!;
  const caliperGeo = box(ww * 0.42, wr * 0.52, wr * 0.26, 0, wr * 0.42, -wr * 0.34);
  const capGeo = shape.rimCap ? cyl(wr * 0.25, ww + 0.1, 0, 0, 0, 'x', 14) : null;
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
    if (capGeo) spin.add(new THREE.Mesh(capGeo, paint)); // krytka v barvě vozu
    wgroup.add(spin, new THREE.Mesh(caliperGeo, caliper)); // třmen se netočí s kolem
    root.add(wgroup);
    wheels.push(wgroup);
    spins.push(spin);
  }

  return {
    root, body, wheels, spins, paint, accent, caliper, stripe, rim, rearLights, frontLights,
    laser: laserMat, muzzles, color, shape, shoulder: sh, roofY,
  };
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
  v.paint.dispose(); v.accent.dispose(); v.caliper.dispose(); v.stripe.dispose(); v.rim.dispose();
  v.frontLights.dispose(); v.rearLights.dispose(); v.laser.dispose();
}
