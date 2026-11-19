/**
 * Nabídka sekundárních zbraní (FIRE 2).
 *
 * Přidat zbraň = přidat položku do `SECONDARIES`. Simulace si bere čísla odsud,
 * menu na PC i na telefonu si nabídku postaví samo a model do nabídky je v render/secModel.ts.
 *
 * Vyvážení:
 *   RAKETY  2 kusy, bedna přidá 3 (strop 6) – jedna rána skoro zabije, ale ran je málo
 *   MINY   20 kusů, bedna přidá 6 (strop 20) – slabší rána, zato se dají sypat po trati
 *   MÍČKY  15 dávek po osmi, bedna přidá 4 – jeden míček dá pětinu miny, ale leží jich tam osm
 */
import type { SecStats } from '../secondary';

export const SECONDARIES: SecStats[] = [
  {
    id: 'rocket',
    name: 'RAKETY',
    tagline: 'Naváděná raketa dopředu. Málo kusů, ale pořádně to bouchne.',
    color: 0xffc83c,
    ammo: 2, maxAmmo: 6, pickup: 3, cd: 0.7,
    dmg: 58, radius: 8.5,
  },
  {
    id: 'mine',
    name: 'MINY',
    tagline: 'Pustí minu za auto. Kdo na ni najede, ten schytá ránu.',
    color: 0xff2018,
    ammo: 20, maxAmmo: 20, pickup: 6, cd: 0.22,
    dmg: 46, radius: 6.5,
    arm: 0.8, life: 30, trigger: 2.2,
  },
  {
    id: 'ball',
    name: 'MÍČKY',
    tagline: 'Vysype za auto osm červeno-bílých míčků. Malé, ale kousnou.',
    color: 0xf2f5fa,
    ammo: 15, maxAmmo: 15, pickup: 4, cd: 0.35, count: 8,
    // pětina miny na kus: míčky jsou malé a trefit se do nich je těžší, tak každý bolí víc
    dmg: 9, radius: 2.2,
    arm: 0.5, life: 22, trigger: 1, spread: 7,
  },
];

/** Výchozí sekundární zbraň (ta, kterou má hráč, než si vybere). */
export const DEFAULT_SEC = 0;

/** Zbraň podle indexu – mimo rozsah vrátí výchozí (přijde-li nesmysl z telefonu). */
export function secAt(idx: number): SecStats {
  return SECONDARIES[idx] ?? SECONDARIES[DEFAULT_SEC];
}
