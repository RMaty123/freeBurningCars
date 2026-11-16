/**
 * Procedurální 3D modely aut. Karoserie vzniká vytažením bočního profilu (ExtrudeGeometry)
 * se zaoblenými hranami a výřezy pro kola, kabina je prosklená "bublina" se střechou v barvě vozu.
 * Model míří po ose +Z, kola jsou samostatné skupiny (točí se a přední zatáčí).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarShape } from '../game/cars';

export interface CarVisual {
  root: THREE.Group;
  /** karoserie – naklání se v zatáčkách a při brzdění */
  body: THREE.Group;
  /** FL, FR, RL, RR */
  wheels: THREE.Group[];
  spins: THREE.Object3D[];
  paint: THREE.MeshPhysicalMaterial;
  stripe: THREE.MeshStandardMaterial;
  rearLights: THREE.MeshStandardMaterial;
  frontLights: THREE.MeshStandardMaterial;
  color: number;
  shape: CarShape;
  /** výška ramen karoserie (kam se dává kulomet, kouř…) */
  shoulder: number;
  roofY: number;
}

const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2c3e, metalness: 0.55, roughness: 0.08, envMapIntensity: 1.3, emissive: 0x070d14 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.4, roughness: 0.65 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x2b2e36, metalness: 0.9, roughness: 0.35 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.0, roughness: 0.92 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9bec8, metalness: 0.7, roughness: 0.32 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0x23252b, metalness: 0.6, roughness: 0.5 });
const plateMat = new THREE.MeshStandardMaterial({ color: 0xe9e9e2, roughness: 0.6 });

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

function cyl(r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', seg = 10): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return prep(g);
}

/** Vytáhne boční profil [z, y] do šířky a otočí ho tak, aby délka auta byla v ose Z. */
function sideExtrude(shape: THREE.Shape, width: number, bevel: number, grow = 0): THREE.BufferGeometry {
  const depth = width - 2 * bevel;
  // bevelOffset: zaoblení jde dovnitř, takže obrys profilu sedí přesně na zadané rozměry
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: bevel, bevelOffset: -bevel + grow, bevelThickness: bevel, bevelSegments: 3, steps: 1, curveSegments: 12,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return prep(g);
}

function merged(list: THREE.BufferGeometry[], mat: THREE.Material, shadow = true): THREE.Mesh {
  const g = mergeGeometries(list, false)!;
  const m = new THREE.Mesh(g, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}

export function buildCar(shape: CarShape, color: number): CarVisual {
  const L = shape.length, W = shape.width, g = shape.ground, wr = shape.wheelR;
  const open = shape.rugged && shape.cabinH < 0.6; // bugina: kola vně karoserie
  const bodyW = open ? W - 2 * shape.wheelW - 0.12 : W;
  const sh = open ? g + shape.bodyH : Math.max(g + shape.bodyH, 2 * wr + 0.12); // výška ramen
  const hB = sh - g;
  const zr = -L / 2, zf = L / 2;
  const axF = L * 0.31, axR = -L * 0.3;
  const zcr = zr + shape.cabinFrom * L, zcf = zr + shape.cabinTo * L;

  // ---- spodní karoserie (profil z boku, proti směru hodin)
  const s = new THREE.Shape();
  s.moveTo(zr + 0.1, g);
  if (!open) {
    const ra = wr + 0.05;
    const phi = Math.asin(Math.max(-1, Math.min(1, (g - wr) / ra)));
    for (const zc of [axR, axF]) {
      s.lineTo(zc - ra * Math.cos(phi), g);
      s.absarc(zc, wr, ra, Math.PI - phi, phi, true);
    }
  }
  s.lineTo(zf - 0.06, g);
  s.lineTo(zf, g + hB * 0.28);
  s.lineTo(zf - 0.05, g + hB * 0.66);
  s.lineTo(zf - 0.32, g + hB * 0.82);
  s.lineTo(zcf + shape.windshield * shape.cabinH * 1.2, sh);
  s.lineTo(zcr - 0.1, sh);
  s.lineTo(zr + 0.14, g + hB * (shape.spoiler ? 0.98 : 0.93));
  s.lineTo(zr, g + hB * 0.62);
  s.closePath();
  const paintGeo: THREE.BufferGeometry[] = [sideExtrude(s, bodyW, 0.07)];
  // závodní pruh: stejný profil, jen úzký a o chlup větší, takže obepíná kapotu i záď
  const stripeGeo: THREE.BufferGeometry[] = [sideExtrude(s, bodyW * 0.26, 0.02, 0.012)];

  // ---- kabina (sklo)
  const ch = shape.cabinH;
  const cw = bodyW * (open ? 0.9 : 0.8);
  const cs = new THREE.Shape();
  cs.moveTo(zcr - shape.rearGlass * ch * 1.5, sh - 0.03);
  cs.lineTo(zcf + shape.windshield * ch * 1.3, sh - 0.03);
  cs.lineTo(zcf, sh + ch);
  cs.lineTo(zcr, sh + ch);
  cs.closePath();
  const glassGeo: THREE.BufferGeometry[] = [sideExtrude(cs, cw, 0.08)];
  const roofY = sh + ch;
  // střecha + sloupky v barvě vozu
  paintGeo.push(box(cw - 0.1, 0.06, zcf - zcr - 0.04, 0, roofY + 0.012, (zcf + zcr) / 2));
  stripeGeo.push(box(bodyW * 0.26, 0.07, zcf - zcr - 0.02, 0, roofY + 0.014, (zcf + zcr) / 2));
  paintGeo.push(box(0.16, 0.1, 0.2, cw / 2 + 0.1, sh + 0.12, zcf + 0.1)); // zrcátka
  paintGeo.push(box(0.16, 0.1, 0.2, -cw / 2 - 0.1, sh + 0.12, zcf + 0.1));

  // ---- tmavé díly
  const darkGeo: THREE.BufferGeometry[] = [];
  darkGeo.push(box(bodyW - 0.5, hB - 0.16, L - 0.5, 0, g + hB / 2 - 0.02, 0)); // podvozek (vyplní podběhy)
  darkGeo.push(box(bodyW * 0.56, hB * 0.26, 0.08, 0, g + hB * 0.36, zf - 0.03)); // maska
  darkGeo.push(box(bodyW * 0.96, 0.08, 0.34, 0, g + 0.02, zf - 0.1)); // přední spoiler
  darkGeo.push(box(bodyW * 0.9, 0.1, 0.2, 0, g + 0.05, zr + 0.08)); // difuzor
  if (!open) {
    // prahy mezi koly
    const skirt = axF - axR - 2 * (wr + 0.12);
    for (const sx of [-1, 1]) darkGeo.push(box(0.08, hB * 0.2, skirt, sx * (bodyW / 2), g + hB * 0.1, (axF + axR) / 2));
  }
  darkGeo.push(box(bodyW * 0.34, hB * 0.2, 0.06, 0, g + hB * 0.6, zr + 0.01)); // panel mezi zadními světly
  darkGeo.push(cyl(0.055, 0.3, bodyW * 0.28, g + 0.1, zr + 0.02, 'z', 8)); // výfuky
  darkGeo.push(cyl(0.055, 0.3, -bodyW * 0.28, g + 0.1, zr + 0.02, 'z', 8));

  // ---- zbraně: dva kulomety na kapotě
  const gunGeo: THREE.BufferGeometry[] = [];
  const gz = Math.min(zf - 0.75, zcf + shape.windshield * ch * 1.3 + 0.75);
  for (const sx of [-1, 1]) {
    gunGeo.push(box(0.2, 0.12, 0.5, sx * bodyW * 0.27, sh + 0.02, gz - 0.25));
    gunGeo.push(cyl(0.045, 0.95, sx * bodyW * 0.27, sh + 0.07, gz + 0.15, 'z', 8));
    gunGeo.push(cyl(0.07, 0.14, sx * bodyW * 0.27, sh + 0.07, gz + 0.58, 'z', 8));
  }

  if (shape.spoiler) {
    paintGeo.push(box(bodyW * 0.94, 0.05, 0.4, 0, sh + 0.34, zr + 0.24, -0.12));
    darkGeo.push(box(0.06, 0.34, 0.2, bodyW * 0.32, sh + 0.16, zr + 0.26));
    darkGeo.push(box(0.06, 0.34, 0.2, -bodyW * 0.32, sh + 0.16, zr + 0.26));
  }
  if (shape.rugged) {
    // ochranný rám vpředu
    gunGeo.push(box(bodyW * 0.8, 0.07, 0.07, 0, g + hB * 0.75, zf + 0.12));
    gunGeo.push(box(bodyW * 0.8, 0.07, 0.07, 0, g + hB * 0.3, zf + 0.12));
    for (const sx of [-1, 1]) gunGeo.push(box(0.07, hB * 0.55, 0.07, sx * bodyW * 0.3, g + hB * 0.52, zf + 0.12));
    // ochranný oblouk za kabinou
    for (const sx of [-1, 1]) gunGeo.push(box(0.08, ch + 0.2, 0.08, sx * (cw / 2 + 0.02), sh + (ch + 0.2) / 2, zcr - 0.12));
    gunGeo.push(box(cw + 0.12, 0.08, 0.08, 0, sh + ch + 0.2, zcr - 0.12));
  }
  if (open) {
    // bugina: nápravy a blatníčky
    for (const zc of [axF, axR]) {
      darkGeo.push(cyl(0.06, W - 0.2, 0, wr, zc, 'x', 6));
      for (const sx of [-1, 1]) paintGeo.push(box(shape.wheelW + 0.06, 0.05, wr * 1.5, sx * (W / 2 - shape.wheelW / 2), wr * 2 + 0.08, zc));
    }
  }

  // ---- světla
  const frontGeo: THREE.BufferGeometry[] = [];
  const rearGeo: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    frontGeo.push(box(bodyW * 0.24, hB * 0.17, 0.12, sx * bodyW * 0.33, g + hB * 0.56, zf - 0.05, 0.2));
    rearGeo.push(box(bodyW * 0.27, hB * 0.17, 0.12, sx * bodyW * 0.31, g + hB * 0.61, zr + 0.03));
  }
  const plateGeo = [box(0.46, 0.13, 0.03, 0, g + hB * 0.6, zr - 0.02)];
  if (shape.rugged && !open) {
    for (let i = -1.5; i <= 1.5; i++) frontGeo.push(box(0.2, 0.12, 0.1, i * 0.3, roofY + 0.12, zcf - 0.1)); // světelná rampa
    gunGeo.push(box(1.3, 0.05, 0.1, 0, roofY + 0.05, zcf - 0.12));
  }

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.65, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.06 });
  // pruh bílý, na světlých autech černý
  const pc = new THREE.Color(color);
  const light = 0.3 * pc.r + 0.6 * pc.g + 0.1 * pc.b > 0.45;
  const stripe = new THREE.MeshStandardMaterial({ color: light ? 0x16171b : 0xf4f4f0, metalness: 0.3, roughness: 0.4 });
  const frontLights = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c8, emissiveIntensity: 2.2, roughness: 0.3 });
  const rearLights = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1010, emissiveIntensity: 1.4, roughness: 0.3 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(merged(paintGeo, paint));
  body.add(merged(stripeGeo, stripe, false));
  body.add(merged(plateGeo, plateMat, false));
  body.add(merged(glassGeo, glassMat));
  body.add(merged(darkGeo, darkMat));
  body.add(merged(gunGeo, gunMat));
  body.add(merged(frontGeo, frontLights, false));
  body.add(merged(rearGeo, rearLights, false));

  // ---- kola
  const tireGeo = mergeGeometries([cyl(wr, shape.wheelW, 0, 0, 0, 'x', 20)])!;
  const rimGeo = mergeGeometries([cyl(wr * 0.6, shape.wheelW + 0.02, 0, 0, 0, 'x', 14)])!;
  // tmavý střed a paprsky – ať je vidět, že se kolo točí
  const hubGeo = mergeGeometries([
    cyl(wr * 0.2, shape.wheelW + 0.05, 0, 0, 0, 'x', 8),
    box(shape.wheelW + 0.04, wr * 1.12, 0.07, 0, 0, 0),
    box(shape.wheelW + 0.04, 0.07, wr * 1.12, 0, 0, 0),
  ])!;
  const wheels: THREE.Group[] = [];
  const spins: THREE.Object3D[] = [];
  const wx = W / 2 - shape.wheelW / 2 + (open ? 0 : 0.03);
  for (const [sx, az] of [[1, axF], [-1, axF], [1, axR], [-1, axR]] as [number, number][]) {
    const wgroup = new THREE.Group();
    wgroup.position.set(sx * wx, wr, az);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spin.add(tire, new THREE.Mesh(rimGeo, rimMat), new THREE.Mesh(hubGeo, hubMat));
    wgroup.add(spin);
    root.add(wgroup);
    wheels.push(wgroup);
    spins.push(spin);
  }

  return { root, body, wheels, spins, paint, stripe, rearLights, frontLights, color, shape, shoulder: sh, roofY };
}

export function setWrecked(v: CarVisual, wrecked: boolean) {
  if (wrecked) {
    v.paint.color.setHex(0x161616);
    v.stripe.userData.c ??= v.stripe.color.getHex();
    v.stripe.color.setHex(0x1d1d1d);
    v.paint.roughness = 0.95; v.paint.clearcoat = 0; v.paint.metalness = 0.2;
    v.frontLights.emissiveIntensity = 0;
    v.rearLights.emissiveIntensity = 0;
  } else {
    v.paint.color.setHex(v.color);
    if (v.stripe.userData.c !== undefined) v.stripe.color.setHex(v.stripe.userData.c);
    v.paint.roughness = 0.42; v.paint.clearcoat = 1; v.paint.metalness = 0.65;
    v.frontLights.emissiveIntensity = 2.2;
    v.rearLights.emissiveIntensity = 1.4;
  }
}

export function disposeCar(v: CarVisual) {
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  v.paint.dispose(); v.stripe.dispose(); v.frontLights.dispose(); v.rearLights.dispose();
}
