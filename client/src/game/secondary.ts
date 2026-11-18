/**
 * Typy pro sekundární zbraně (FIRE 2).
 * Čísla jednotlivých zbraní jsou v `content/secondaries.ts` – tady je jen "tvar" dat,
 * aby šly zbraně přidávat bez sahání do simulace a do menu (stejně jako u primárních zbraní).
 */

/** `rocket` = naváděná raketa dopředu, `mine` = mina položená za auto. */
export type SecKind = 'rocket' | 'mine';

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

  /** poškození uprostřed výbuchu */
  dmg: number;
  /** poloměr výbuchu (m) */
  radius: number;

  /** jen `mine`: za jak dlouho se mina natáhne a začne reagovat (s) */
  arm?: number;
  /** jen `mine`: jak dlouho mina leží, než sama zmizí (s) */
  life?: number;
  /** jen `mine`: na jakou vzdálenost od středu auta mina vybouchne (m) */
  trigger?: number;
}
