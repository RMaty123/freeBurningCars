/**
 * Auta – typy (jízdní vlastnosti + tvar karoserie) a barvy.
 * Seznam aut je v content/cars.ts; karoserie se generuje procedurálně v render/carModel.ts.
 */

/**
 * Tvar karoserie. Model se z těchhle čísel postaví sám – vytažením bočního profilu
 * do šířky, takže stačí měnit rozměry a pár přepínačů a auto vypadá úplně jinak.
 */
export interface CarShape {
  /** délka, šířka (m) */
  length: number;
  width: number;
  /** světlá výška a výška boků */
  ground: number;
  bodyH: number;
  /** kabina: začátek/konec (0 = záď, 1 = příď) a výška */
  cabinFrom: number;
  cabinTo: number;
  cabinH: number;
  /** sklon předního/zadního skla (0…1) */
  windshield: number;
  rearGlass: number;
  wheelR: number;
  wheelW: number;
  /** zadní křídlo: 0 žádné, 1 lipa, 2 velké */
  spoiler: 0 | 1 | 2;
  /** offroad výbava: rám vpředu, oblouk za kabinou, světelná rampa */
  rugged: boolean;
  /** příď: 0 tupá a vysoká (dodávka) … 1 nízká klínová (supersport) */
  nose: number;
  /** kola mimo karoserii (bugina, formule) */
  openWheels?: boolean;
  /** bez střechy – jen ochranný oblouk (hot rod, formule) */
  roofless?: boolean;
  /** otevřená korba vzadu (pick-up) */
  bed?: boolean;
  /** rezerva na korbě / na zádi */
  spare?: boolean;
}

export interface CarStats {
  /** stálé označení (klíč pro náhledy apod.) */
  id: string;
  name: string;
  tagline: string;
  /** max. rychlost m/s */
  top: number;
  /** zrychlení m/s² */
  accel: number;
  brake: number;
  /** jak rychle se auto stáčí v nízké rychlosti (rad/s) */
  turn: number;
  /** rychlost (m/s), od které auto začne nedotáčet – čím míň, tím dřív se "vzpírá" */
  steerRef: number;
  /** boční přilnavost (větší = míň klouže) */
  grip: number;
  hp: number;
  mass: number;
  shape: CarShape;
}

/** Barvy hráčů (slot 0–3). */
export const PLAYER_COLORS = [0xff2d2d, 0x1f8bff, 0xffc61a, 0x2fd35a];
/** Barvy a jména AI soupeřů – každý závod vypadá jinak. */
export const AI_COLORS = [
  0xff7a1a, 0xb04dff, 0x18d6c8, 0xf2f2f2, 0xff4fa3, 0x8a8f99,
  0x7bd430, 0x00a2ff, 0xffe14d, 0xc0392b, 0x4b3bd6, 0x12141a,
];
export const AI_NAMES = [
  'BLAZE', 'REX', 'NOVA', 'DIESEL', 'VIXEN', 'GHOST',
  'TURBO', 'SMILEY', 'CRUSHER', 'ZIGGY', 'BANDIT', 'SHADOW',
];

export function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
