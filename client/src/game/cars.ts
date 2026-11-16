/**
 * Typy aut – jízdní vlastnosti i tvar karoserie (karoserie se generuje procedurálně v render/carModel.ts).
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

export const CAR_TYPES: CarStats[] = [
  {
    name: 'VIPER GT',
    tagline: 'Rychlý sporťák. Vydrží míň.',
    top: 64, accel: 27, brake: 46, turn: 2.75, steerRef: 46, grip: 9.5, hp: 90, mass: 1.0,
    shape: { length: 4.5, width: 1.95, ground: 0.2, bodyH: 0.52, cabinFrom: 0.26, cabinTo: 0.62, cabinH: 0.42, windshield: 0.75, rearGlass: 0.85, wheelR: 0.36, wheelW: 0.3, spoiler: true, rugged: false },
  },
  {
    name: 'BRUTE V8',
    tagline: 'Muscle car. Vyvážený rváč.',
    top: 60, accel: 25, brake: 42, turn: 2.6, steerRef: 44, grip: 8.5, hp: 120, mass: 1.3,
    shape: { length: 4.8, width: 2.0, ground: 0.24, bodyH: 0.62, cabinFrom: 0.2, cabinTo: 0.6, cabinH: 0.5, windshield: 0.55, rearGlass: 0.7, wheelR: 0.39, wheelW: 0.34, spoiler: false, rugged: false },
  },
  {
    name: 'DUNE RAT',
    tagline: 'Bugina. Zrychluje a točí jako blázen.',
    top: 57, accel: 31, brake: 44, turn: 3.0, steerRef: 48, grip: 10.5, hp: 80, mass: 0.8,
    shape: { length: 3.9, width: 1.9, ground: 0.36, bodyH: 0.46, cabinFrom: 0.3, cabinTo: 0.66, cabinH: 0.52, windshield: 0.45, rearGlass: 0.3, wheelR: 0.44, wheelW: 0.36, spoiler: false, rugged: true },
  },
  {
    name: 'TITAN',
    tagline: 'Obrněný pick-up. Pomalý, ale nezničitelný.',
    top: 54, accel: 21, brake: 40, turn: 2.4, steerRef: 42, grip: 8.0, hp: 165, mass: 1.9,
    shape: { length: 5.1, width: 2.1, ground: 0.42, bodyH: 0.72, cabinFrom: 0.42, cabinTo: 0.72, cabinH: 0.62, windshield: 0.3, rearGlass: 0.1, wheelR: 0.48, wheelW: 0.4, spoiler: false, rugged: true },
  },
];

/** Barvy hráčů (slot 0–3) a AI soupeřů. */
export const PLAYER_COLORS = [0xff2d2d, 0x1f8bff, 0xffc61a, 0x2fd35a];
export const AI_COLORS = [0xff7a1a, 0xb04dff, 0x18d6c8, 0xf2f2f2, 0xff4fa3, 0x8a8f99];
export const AI_NAMES = ['BLAZE', 'REX', 'NOVA', 'DIESEL', 'VIXEN', 'GHOST'];

export function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** Hodnoty 1–5 pro zobrazení na ovladači. */
export function statBars(s: CarStats) {
  const r = (v: number, lo: number, hi: number) => Math.round(1 + (4 * (v - lo)) / (hi - lo));
  return {
    speed: r(s.top, 54, 64),
    accel: r(s.accel, 21, 31),
    handling: r(s.turn, 2.4, 3.0),
    armor: r(s.hp, 80, 165),
  };
}
