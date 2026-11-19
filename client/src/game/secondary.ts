/**
 * Typy pro sekundární zbraně (FIRE 2).
 * Čísla jednotlivých zbraní jsou v `content/secondaries.ts` – tady je jen "tvar" dat,
 * aby šly zbraně přidávat bez sahání do simulace a do menu (stejně jako u primárních zbraní).
 */

/**
 * `rocket` = naváděná raketa dopředu,
 * `mine`   = mina položená za auto,
 * `ball`   = dávka míčků, které se za autem rozletí a rozkutálí.
 */
export type SecKind = 'rocket' | 'mine' | 'ball';

export interface SecStats {
  id: SecKind;
  name: string;
  /** krátký popis do nabídky */
  tagline: string;
  /** barva ikony v HUD a náhledu */
  color: number;

  /** kolik kusů má auto na startu a po respawnu */
  ammo: number;
  /** kolik se jich vejde do zásobníku (strop pro bedny s municí) */
  maxAmmo: number;
  /** kolik kusů přidá bedna s municí */
  pickup: number;
  /** prodleva mezi dvěma použitími (s) */
  cd: number;
  /** kolik kusů vypadne na jedno použití (míčky po osmi; jinak 1) */
  count?: number;

  /** poškození uprostřed výbuchu */
  dmg: number;
  /** poloměr výbuchu (m) */
  radius: number;

  /** `mine` a `ball`: za jak dlouho se náboj natáhne a začne reagovat (s) */
  arm?: number;
  /** `mine` a `ball`: jak dlouho leží na trati, než sám zmizí (s) */
  life?: number;
  /** `mine` a `ball`: na jakou vzdálenost od středu auta to bouchne (m) */
  trigger?: number;
  /** jen `ball`: jak rychle se míčky rozletí (m/s) */
  spread?: number;
}
