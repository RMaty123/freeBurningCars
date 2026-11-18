/**
 * Geometrie tratí (definice jednotlivých tratí jsou v content/tracks.ts). Čistá matematika bez Three.js – používá ji simulace i vykreslování
 * (a taky headless test v scripts/simtest.ts).
 *
 * Trať je uzavřená křivka (Catmull-Rom přes řídicí body) převzorkovaná po STEP metrech.
 * Auta si pamatují index nejbližšího vzorku, z toho se počítá pořadí, kola i náraz do svodidel.
 */

export type ThemeId = 'desert' | 'city' | 'forest';

export interface TrackDef {
  id: string;
  name: string;
  /** krátký popisek na kartě ve výběru tratě */
  tagline: string;
  theme: ThemeId;
  /** šířka vozovky (m) */
  width: number;
  /** na kolik pruhů je vozovka rozdělená čarami (2 = běžná silnice se středovou čárou) */
  lanes?: number;
  /**
   * Otevřená plocha: žádná svodidla, žádná scenérie a země pokračuje do nekonečna.
   * Trať samotná zůstává jako vodicí linka (AI, kola, pořadí, minimapa), jen nic nedrží auta uvnitř.
   */
  open?: boolean;
  /** řídicí body [x, z] v metrech; křivka se uzavírá sama */
  points: [number, number][];
}

export interface Track {
  def: TrackDef;
  /** počet vzorků */
  n: number;
  /** vzdálenost mezi vzorky (m) */
  step: number;
  length: number;
  x: Float32Array;
  z: Float32Array;
  /** tečna (směr jízdy) */
  tx: Float32Array;
  tz: Float32Array;
  /** normála doleva */
  nx: Float32Array;
  nz: Float32Array;
  /** křivost se znaménkem (1/poloměr), kladná = zatáčka vlevo */
  curv: Float32Array;
  halfWidth: number;
  /** vzdálenost svodidel od středu */
  wallDist: number;
}

const STEP = 2;

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function buildTrack(def: TrackDef): Track {
  const P = def.points;
  const m = P.length;
  // 1) hustá polyline
  const fine: [number, number][] = [];
  const SUB = 60;
  for (let i = 0; i < m; i++) {
    const p0 = P[(i + m - 1) % m], p1 = P[i], p2 = P[(i + 1) % m], p3 = P[(i + 2) % m];
    for (let k = 0; k < SUB; k++) {
      const t = k / SUB;
      fine.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  // 2) délka a rovnoměrné převzorkování
  const cum = [0];
  for (let i = 0; i < fine.length; i++) {
    const a = fine[i], b = fine[(i + 1) % fine.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[fine.length];
  const n = Math.round(length / STEP);
  const step = length / n;
  const x = new Float32Array(n), z = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = i * step;
    while (cum[j + 1] < d) j++;
    const a = fine[j], b = fine[(j + 1) % fine.length];
    const t = (d - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    x[i] = a[0] + (b[0] - a[0]) * t;
    z[i] = a[1] + (b[1] - a[1]) * t;
  }
  // 3) tečny, normály, křivost
  const tx = new Float32Array(n), tz = new Float32Array(n), nx = new Float32Array(n), nz = new Float32Array(n);
  const ang = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n;
    let dx = x[b] - x[a], dz = z[b] - z[a];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    tx[i] = dx; tz[i] = dz;
    nx[i] = dz; nz[i] = -dx; // doleva (při pohledu shora, osa Y nahoru)
    ang[i] = Math.atan2(dx, dz);
  }
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 2) % n, b = (i + 2) % n;
    let d = ang[b] - ang[a];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    raw[i] = d / (4 * step);
  }
  const curv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -3; k <= 3; k++) s += raw[(i + k + n) % n];
    curv[i] = s / 7;
  }
  const halfWidth = def.width / 2;
  return { def, n, step, length, x, z, tx, tz, nx, nz, curv, halfWidth, wallDist: halfWidth + 1.6 };
}

/** Najde nejbližší vzorek v okně kolem "hint" (auta se mezi kroky pohnou jen o kousek). */
export function locate(tr: Track, px: number, pz: number, hint: number, win = 12): number {
  const n = tr.n;
  let best = hint, bd = Infinity;
  for (let k = -win; k <= win; k++) {
    const i = (((hint + k) % n) + n) % n;
    const dx = px - tr.x[i], dz = pz - tr.z[i];
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Nejbližší vzorek z celé trati (pomalé – jen při startu / pro scenérii). */
export function locateGlobal(tr: Track, px: number, pz: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < tr.n; i++) {
    const dx = px - tr.x[i], dz = pz - tr.z[i];
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Boční odchylka od středu trati (kladná = vlevo). */
export function lateral(tr: Track, i: number, px: number, pz: number): number {
  return (px - tr.x[i]) * tr.nx[i] + (pz - tr.z[i]) * tr.nz[i];
}

/** Vzdálenost bodu od osy trati (pro rozmisťování scenérie). */
export function distToTrack(tr: Track, px: number, pz: number, stride = 3): number {
  let bd = Infinity;
  for (let i = 0; i < tr.n; i += stride) {
    const dx = px - tr.x[i], dz = pz - tr.z[i];
    const d = dx * dx + dz * dz;
    if (d < bd) bd = d;
  }
  return Math.sqrt(bd);
}

export function wrapIdx(tr: Track, i: number): number {
  return ((i % tr.n) + tr.n) % tr.n;
}
