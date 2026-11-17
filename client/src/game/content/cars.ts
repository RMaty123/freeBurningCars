/**
 * Seznam aut. Nové auto přidáš dalším záznamem do pole CAR_TYPES – ve výběru aut se objeví samo
 * (3D model, náhled pro telefon i ukazatele se spočítají z těchhle dat).
 *
 * Jízdní vlastnosti:
 *   top        max. rychlost (m/s; × 3,6 = km/h)
 *   accel      zrychlení (m/s²), brake brzdy
 *   turn       jak rychle se auto stáčí v pomalé jízdě (rad/s) – nejvíc je znát v ostrých zatáčkách
 *   steerRef   rychlost, od které auto začne nedotáčet. Nízká hodnota = ve vysoké rychlosti
 *              se auto "vzpírá" a jede rovně (náklaďák), vysoká = zatáčí i ve sto padesáti (formule)
 *   grip       boční přilnavost. Nízká = zadek ujíždí a auto krásně driftuje, ale snadno se protočí
 *   hp         výdrž, mass hmotnost (těžké auto odhodí lehké při nárazu)
 *
 * Tvar karoserie (shape) kreslí render/carModel.ts:
 *   nose 0 = tupá vysoká příď (dodávka) … 1 = nízký klín (supersport)
 *   spoiler 0/1/2, rugged = offroad rám a rampa, bed = korba, roofless = bez střechy,
 *   openWheels = kola mimo karoserii
 */
import type { CarStats } from '../cars';

export const CAR_TYPES: CarStats[] = [
  {
    id: 'viper',
    name: 'VIPER GT',
    tagline: 'Rychlý sporťák. Drží stopu, ale moc nevydrží.',
    top: 64, accel: 27, brake: 46, turn: 2.55, steerRef: 46, grip: 9.5, hp: 90, mass: 1.0,
    shape: { length: 4.5, width: 1.95, ground: 0.2, bodyH: 0.5, cabinFrom: 0.26, cabinTo: 0.6, cabinH: 0.4, windshield: 0.75, rearGlass: 0.85, wheelR: 0.36, wheelW: 0.3, spoiler: 1, rugged: false, nose: 0.85 },
  },
  {
    id: 'brute',
    name: 'BRUTE V8',
    tagline: 'Muscle car. Zadek ujíždí, zato parádně zrychluje.',
    top: 61, accel: 29, brake: 40, turn: 2.35, steerRef: 38, grip: 7.2, hp: 120, mass: 1.35,
    shape: { length: 4.9, width: 2.02, ground: 0.24, bodyH: 0.62, cabinFrom: 0.18, cabinTo: 0.56, cabinH: 0.5, windshield: 0.55, rearGlass: 0.7, wheelR: 0.39, wheelW: 0.36, spoiler: 0, rugged: false, nose: 0.45 },
  },
  {
    id: 'dune',
    name: 'DUNE RAT',
    tagline: 'Bugina. Otočí se na place, na rovince zaostane.',
    top: 55, accel: 31, brake: 45, turn: 3.3, steerRef: 56, grip: 11.5, hp: 80, mass: 0.8,
    shape: { length: 3.8, width: 1.92, ground: 0.38, bodyH: 0.44, cabinFrom: 0.3, cabinTo: 0.66, cabinH: 0.5, windshield: 0.4, rearGlass: 0.2, wheelR: 0.46, wheelW: 0.38, spoiler: 0, rugged: true, nose: 0.4, openWheels: true, roofless: true },
  },
  {
    id: 'titan',
    name: 'TITAN',
    tagline: 'Obrněný pick-up. Odhodí každého, v zatáčce dřevo.',
    top: 53, accel: 22, brake: 40, turn: 2.15, steerRef: 33, grip: 8.0, hp: 170, mass: 1.95,
    shape: { length: 5.2, width: 2.12, ground: 0.42, bodyH: 0.7, cabinFrom: 0.42, cabinTo: 0.74, cabinH: 0.6, windshield: 0.3, rearGlass: 0.15, wheelR: 0.48, wheelW: 0.42, spoiler: 0, rugged: true, nose: 0.2, bed: true, spare: true },
  },
  {
    id: 'needle',
    name: 'NEEDLE',
    tagline: 'Formule. Nejrychlejší a nejpřesnější, ale z papíru.',
    top: 68, accel: 33, brake: 52, turn: 2.95, steerRef: 62, grip: 13, hp: 70, mass: 0.72,
    shape: { length: 4.7, width: 1.85, ground: 0.12, bodyH: 0.36, cabinFrom: 0.34, cabinTo: 0.58, cabinH: 0.34, windshield: 0.5, rearGlass: 0.1, wheelR: 0.34, wheelW: 0.34, spoiler: 2, rugged: false, nose: 1, openWheels: true, roofless: true },
  },
  {
    id: 'hauler',
    name: 'HAULER',
    tagline: 'Náklaďák. Rozhrne všechno, zatáčí jako loď.',
    top: 50, accel: 20, brake: 36, turn: 1.95, steerRef: 29, grip: 6.2, hp: 200, mass: 2.4,
    shape: { length: 5.3, width: 2.22, ground: 0.36, bodyH: 1.3, cabinFrom: 0.62, cabinTo: 0.95, cabinH: 0.3, windshield: 0.25, rearGlass: 0.05, wheelR: 0.46, wheelW: 0.38, spoiler: 0, rugged: false, nose: 0.05 },
  },
  {
    id: 'pixie',
    name: 'PIXIE',
    tagline: 'Městské autíčko. Mrštné a lehké, zato pomalé.',
    top: 54, accel: 26, brake: 44, turn: 3.05, steerRef: 50, grip: 10.5, hp: 85, mass: 0.85,
    shape: { length: 3.6, width: 1.78, ground: 0.22, bodyH: 0.56, cabinFrom: 0.22, cabinTo: 0.7, cabinH: 0.52, windshield: 0.4, rearGlass: 0.25, wheelR: 0.32, wheelW: 0.26, spoiler: 0, rugged: false, nose: 0.3 },
  },
  {
    id: 'roadking',
    name: 'ROADKING',
    tagline: 'Hot rod. Síla a kouř, přilnavost skoro žádná.',
    top: 62, accel: 32, brake: 38, turn: 2.15, steerRef: 35, grip: 6.3, hp: 100, mass: 1.2,
    shape: { length: 4.4, width: 1.98, ground: 0.26, bodyH: 0.58, cabinFrom: 0.24, cabinTo: 0.56, cabinH: 0.46, windshield: 0.3, rearGlass: 0.2, wheelR: 0.42, wheelW: 0.4, spoiler: 0, rugged: false, nose: 0.55, roofless: true },
  },
  {
    id: 'trail',
    name: 'TRAILBLAZER',
    tagline: 'Rallyové SUV. Ze všeho trochu, nic nezkazí.',
    top: 57, accel: 25, brake: 43, turn: 2.6, steerRef: 44, grip: 10, hp: 130, mass: 1.5,
    shape: { length: 4.6, width: 2, ground: 0.36, bodyH: 0.7, cabinFrom: 0.26, cabinTo: 0.72, cabinH: 0.58, windshield: 0.42, rearGlass: 0.3, wheelR: 0.44, wheelW: 0.36, spoiler: 0, rugged: true, nose: 0.3, spare: true },
  },
  {
    id: 'specter',
    name: 'SPECTER',
    tagline: 'Noční kupé. Vysoká rychlost a klid v rychlých zatáčkách.',
    top: 66, accel: 28, brake: 48, turn: 2.45, steerRef: 52, grip: 10.8, hp: 95, mass: 1.05,
    shape: { length: 4.8, width: 1.98, ground: 0.18, bodyH: 0.48, cabinFrom: 0.3, cabinTo: 0.62, cabinH: 0.38, windshield: 0.8, rearGlass: 1, wheelR: 0.37, wheelW: 0.32, spoiler: 1, rugged: false, nose: 0.95 },
  },
];

/** Hodnocení auta 1–10 pro ukazatele ve výběru aut. */
export interface CarRatings { speed: number; accel: number; handling: number; armor: number }

/**
 * Jedno číslo pro "ŘÍZENÍ": kombinuje rychlost stáčení, odolnost proti nedotáčivosti
 * a přilnavost – ukazatel tak odpovídá tomu, jak se auto opravdu chová v zatáčce.
 */
function cornering(c: CarStats): number {
  return c.turn * 0.55 + c.steerRef * 0.022 + c.grip * 0.055;
}

/** Porovná auto s ostatními v seznamu: nejslabší dostane 3, nejlepší 10. */
export function carRatings(car: CarStats): CarRatings {
  const rate = (get: (c: CarStats) => number) => {
    const all = CAR_TYPES.map(get);
    const lo = Math.min(...all), hi = Math.max(...all);
    return hi > lo ? Math.round(3 + (7 * (get(car) - lo)) / (hi - lo)) : 7;
  };
  return { speed: rate((c) => c.top), accel: rate((c) => c.accel), handling: rate(cornering), armor: rate((c) => c.hp) };
}
