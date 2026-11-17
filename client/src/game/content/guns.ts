/**
 * Nabídka primárních zbraní (FIRE 1).
 *
 * Přidat zbraň = přidat položku do `GUNS`. Nikde jinde se nic měnit nemusí:
 * simulace si bere čísla odsud, menu na PC i na telefonu si nabídku postaví samo
 * a model do nabídky se poskládá podle `shape` (render/gunModel.ts).
 *
 * Vyvážení (poškození za sekundu, když všechno sedí):
 *   VULCAN   2.7 / 0.085 s ≈ 32 dps – hodně ran, dobře doměřuje, malé rány
 *   BREAKER  13  / 0.40 s  ≈ 32 dps – málo ran, každá bolí, slabší doměřování
 *   PRISM    2× 32 dmg/s po dobu paprsku – dvě děla na dveřích, nabíjí se držením.
 *            Sekunda paprsku na cíli sebere 64 hp, takže většina aut padne po dvou –
 *            zato se na to musí nejdřív nabít a paprskem se musí trefovat.
 */
import type { GunStats } from '../guns';

export const GUNS: GunStats[] = [
  {
    id: 'vulcan',
    name: 'VULCAN',
    tagline: 'Rychlopalný kulomet. Spousta ran, slabší rány.',
    kind: 'bullet', mount: 'hood',
    color: 0xffe6a0,
    cd: 0.085, dmg: 2.7, speed: 150, range: 95, spread: 0.012, tracer: 1,
    cone: 0.16, aim: 1, aimMax: 0.17,
    ratings: { power: 3, rate: 10, range: 7 },
    shape: {
      metal: 0xb9bcc2, accent: 0x6b5a2e, body: [0.52, 0.2, 0.17],
      barrel: 1.05, bore: 0.052, jacket: true, ammoBox: true, belt: true,
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
    ratings: { power: 8, rate: 4, range: 8 },
    shape: {
      metal: 0x9aa0a8, accent: 0x2a2d33, body: [0.66, 0.26, 0.24],
      barrel: 1.0, bore: 0.085, brake: true, ammoBox: true, belt: true,
    },
  },
  {
    id: 'prism',
    name: 'PRISM',
    tagline: 'Dvě děla na dveřích. Drž FIRE 1, pustíš – a pálí obě.',
    kind: 'beam', mount: 'side', twin: true,
    color: 0x6ff0ff,
    cd: 0.8, dmg: 32, speed: 0, range: 90, spread: 0, tracer: 1,
    cone: 0, aim: 0, aimMax: 0,
    chargeMax: 5, beamPer: 1, beamR: 1.6,
    ratings: { power: 10, rate: 2, range: 7 },
    shape: {
      // přesně ta dvě děla, co auto nosí na dveřích
      metal: 0xb6bcc4, accent: 0x23262c, body: [0.62, 0.22, 0.22],
      barrel: 0.6, bore: 0.1, pods: 2, glow: 0x6ff0ff,
    },
  },
];

/** Výchozí zbraň (ta, kterou má hráč, než si vybere). */
export const DEFAULT_GUN = 0;

/** Zbraň podle indexu – mimo rozsah vrátí výchozí (přijde-li nesmysl z telefonu). */
export function gunAt(idx: number): GunStats {
  return GUNS[idx] ?? GUNS[DEFAULT_GUN];
}
