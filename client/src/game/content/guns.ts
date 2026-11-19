/**
 * Nabídka primárních zbraní (FIRE 1).
 *
 * Přidat zbraň = přidat položku do `GUNS`. Nikde jinde se nic měnit nemusí:
 * simulace si bere čísla odsud, menu na PC i na telefonu si nabídku postaví samo
 * a model do nabídky se poskládá podle `shape` (render/gunModel.ts).
 *
 * Vyvážení (poškození za sekundu, když všechno sedí):
 *   VULCAN   1.7 / 0.034 s ≈ 34 dps – rotační minigun: 20 ran za sekundu, drobné rány, kratší dostřel
 *   BREAKER  13  / 0.40 s  ≈ 32 dps – málo ran, každá bolí, delší dostřel, slabší doměřování
 *   PRISM    110 dmg za zásah – dvě děla na dveřích, nabíjí se držením. Dosah 58 m:
 *            měřením vyšlo, že dál než 75 m paprsek stejně nikdy netrefí (90 % zásahů do 56 m),
 *            takže delší dosah byl jen nápis – teď musí zbraň blíž, aby na něco dosáhla.
 *            Stačí po někom paprskem řeznout a je po něm; těžká auta (120+ hp)
 *            to přežijí a padnou druhou ranou. Zato se musí nejdřív nabít.
 *   PULSE    22 dmg v kruhu 42 m – nabíjí se 5 s a zasaženým autům na 1,5 s zblázní volant.
 *            Navíc má každé zasažené auto 40% šanci, že to rovnou roztrhá.
 */
import type { GunStats } from '../guns';

export const GUNS: GunStats[] = [
  {
    id: 'vulcan',
    name: 'VULCAN',
    tagline: 'Rotační minigun. Roztočí hlavně a zasype cíl olovem.',
    kind: 'bullet', mount: 'hood',
    color: 0xffe6a0,
    cd: 0.034, dmg: 1.7, speed: 165, range: 95, spread: 0.015, tracer: 1,
    cone: 0.16, aim: 1, aimMax: 0.17,
    shape: {
      metal: 0xd2d7df, accent: 0xc9a85a, body: [0.56, 0.22, 0.2],
      barrel: 1.02, bore: 0.038, barrels: 6, ammoBox: true, belt: true,
    },
  },
  {
    id: 'breaker',
    name: 'BREAKER',
    tagline: 'Pomalý těžký kulomet. Každá rána pořádně ubere.',
    kind: 'bullet', mount: 'hood',
    color: 0xffa23c,
    cd: 0.4, dmg: 13, speed: 125, range: 110, spread: 0.018, tracer: 1.7,
    cone: 0.12, aim: 0.8, aimMax: 0.1,
    shape: {
      metal: 0x9aa0a8, accent: 0x2a2d33, body: [0.66, 0.26, 0.24],
      barrel: 1.0, bore: 0.085, brake: true, ammoBox: true, belt: true,
    },
  },
  {
    id: 'prism',
    name: 'PRISM',
    tagline: 'Dvě děla na dveřích. Koho paprsek škrtne, ten většinou končí.',
    kind: 'beam', mount: 'side', twin: true,
    color: 0x6ff0ff,
    cd: 0.8, dmg: 110, speed: 0, range: 58, spread: 0, tracer: 1,
    cone: 0, aim: 0, aimMax: 0,
    chargeMax: 5, beamPer: 1, beamR: 0.55, rehit: 0.7,
    shape: {
      // přesně ta dvě děla, co auto nosí na dveřích
      metal: 0xb6bcc4, accent: 0x23262c, body: [0.62, 0.22, 0.22],
      barrel: 0.6, bore: 0.1, pods: 2, glow: 0x6ff0ff,
    },
  },
  {
    id: 'pulse',
    name: 'PULSE',
    tagline: 'EMP vlna do všech stran. Zblázní volant – a každé druhé auto rovnou roztrhá.',
    kind: 'emp', mount: 'hood',
    color: 0x4fc3ff,
    // `range` je tady poloměr vlny, ne dostřel hlavně; `cd` je jen krátká pauza po výstřelu
    cd: 0.6, dmg: 22, speed: 0, range: 42, spread: 0, tracer: 1,
    cone: 0, aim: 0, aimMax: 0,
    chargeMax: 5, jam: 3, jamStep: 0.5, waveTime: 0.55, kill: 0.4,
    shape: {
      metal: 0xc9d2dc, accent: 0x2a2f36, body: [0.5, 0.26, 0.26],
      barrel: 0.72, bore: 0.15, dish: true, glow: 0x4fc3ff,
    },
  },
];

/** Výchozí zbraň (ta, kterou má hráč, než si vybere). */
export const DEFAULT_GUN = 0;

/** Zbraň podle indexu – mimo rozsah vrátí výchozí (přijde-li nesmysl z telefonu). */
export function gunAt(idx: number): GunStats {
  return GUNS[idx] ?? GUNS[DEFAULT_GUN];
}
