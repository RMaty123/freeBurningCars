/**
 * Seznam aut. Nové auto přidáš dalším záznamem do pole CAR_TYPES – ve výběru aut se objeví samo
 * (3D model, náhled pro telefon i staty se počítají z těchhle dat).
 *
 *   top / accel / brake      rychlost (m/s), zrychlení a brzdy (m/s²)
 *   turn / steerRef / grip   zatáčení
 *   hp / mass                výdrž a hmotnost (těžší auto víc ubližuje při nárazu)
 *   shape                    rozměry karoserie pro procedurální model (render/carModel.ts)
 */
import type { CarStats } from '../cars';

export const CAR_TYPES: CarStats[] = [
  {
    id: 'viper',
    name: 'VIPER GT',
    tagline: 'Rychlý sporťák. Vydrží míň.',
    top: 64, accel: 27, brake: 46, turn: 2.75, steerRef: 46, grip: 9.5, hp: 90, mass: 1.0,
    shape: { length: 4.5, width: 1.95, ground: 0.2, bodyH: 0.52, cabinFrom: 0.26, cabinTo: 0.62, cabinH: 0.42, windshield: 0.75, rearGlass: 0.85, wheelR: 0.36, wheelW: 0.3, spoiler: true, rugged: false },
  },
  {
    id: 'brute',
    name: 'BRUTE V8',
    tagline: 'Muscle car. Vyvážený rváč.',
    top: 60, accel: 25, brake: 42, turn: 2.6, steerRef: 44, grip: 8.5, hp: 120, mass: 1.3,
    shape: { length: 4.8, width: 2.0, ground: 0.24, bodyH: 0.62, cabinFrom: 0.2, cabinTo: 0.6, cabinH: 0.5, windshield: 0.55, rearGlass: 0.7, wheelR: 0.39, wheelW: 0.34, spoiler: false, rugged: false },
  },
  {
    id: 'dune',
    name: 'DUNE RAT',
    tagline: 'Bugina. Zrychluje a točí jako blázen.',
    top: 57, accel: 31, brake: 44, turn: 3.0, steerRef: 48, grip: 10.5, hp: 80, mass: 0.8,
    shape: { length: 3.9, width: 1.9, ground: 0.36, bodyH: 0.46, cabinFrom: 0.3, cabinTo: 0.66, cabinH: 0.52, windshield: 0.45, rearGlass: 0.3, wheelR: 0.44, wheelW: 0.36, spoiler: false, rugged: true },
  },
  {
    id: 'titan',
    name: 'TITAN',
    tagline: 'Obrněný pick-up. Pomalý, ale nezničitelný.',
    top: 54, accel: 21, brake: 40, turn: 2.4, steerRef: 42, grip: 8.0, hp: 165, mass: 1.9,
    shape: { length: 5.1, width: 2.1, ground: 0.42, bodyH: 0.72, cabinFrom: 0.42, cabinTo: 0.72, cabinH: 0.62, windshield: 0.3, rearGlass: 0.1, wheelR: 0.48, wheelW: 0.4, spoiler: false, rugged: true },
  },
];

/** Hodnocení auta 1–10 pro ukazatele ve výběru aut. */
export interface CarRatings { speed: number; accel: number; handling: number; armor: number }

/** Porovná auto s ostatními v seznamu: nejslabší dostane 3, nejlepší 10. */
export function carRatings(car: CarStats): CarRatings {
  const rate = (get: (c: CarStats) => number) => {
    const all = CAR_TYPES.map(get);
    const lo = Math.min(...all), hi = Math.max(...all);
    return hi > lo ? Math.round(3 + (7 * (get(car) - lo)) / (hi - lo)) : 7;
  };
  return { speed: rate((c) => c.top), accel: rate((c) => c.accel), handling: rate((c) => c.turn), armor: rate((c) => c.hp) };
}
