/**
 * Auta – typy (jízdní vlastnosti + tvar karoserie) a barvy hráčů.
 * Seznam aut je v content/cars.ts; karoserie se generuje procedurálně v render/carModel.ts.
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
  spoiler: boolean;
  /** offroad doplňky (rám, nárazník) */
  rugged: boolean;
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
  /** max. úhlová rychlost zatáčení rad/s */
  turn: number;
  /** při jaké rychlosti klesne zatáčení na polovinu */
  steerRef: number;
  /** boční přilnavost (větší = méně klouže) */
  grip: number;
  hp: number;
  mass: number;
  shape: CarShape;
}

/** Barvy hráčů (slot 0–3) a AI soupeřů. */
export const PLAYER_COLORS = [0xff2d2d, 0x1f8bff, 0xffc61a, 0x2fd35a];
export const AI_COLORS = [0xff7a1a, 0xb04dff, 0x18d6c8, 0xf2f2f2, 0xff4fa3, 0x8a8f99];
export const AI_NAMES = ['BLAZE', 'REX', 'NOVA', 'DIESEL', 'VIXEN', 'GHOST'];

export function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
