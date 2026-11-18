/**
 * Typy pro primární zbraně (FIRE 1).
 * Čísla a modely jednotlivých zbraní jsou v `content/guns.ts` – tady je jen "tvar" dat,
 * aby šly zbraně přidávat bez sahání do simulace a do menu.
 */

/** `bullet` = střílí projektily, `beam` = nabíjí se držením a pak drží paprsek. */
export type GunKind = 'bullet' | 'beam';

/** Kam je zbraň na autě přidělaná – odtud taky střílí. */
export type GunMount = 'hood' | 'side';

/** Z čeho se poskládá model zbraně do nabídky (render/gunModel.ts). */
export interface GunShape {
  /** barva kovu a barva doplňků (pažba, kryty) */
  metal: number;
  accent: number;
  /** tělo zbraně: délka × výška × šířka */
  body: [number, number, number];
  /** hlaveň: délka a poloměr */
  barrel: number;
  bore: number;
  /** víc hlavní = rotační kulomet */
  barrels?: number;
  /** děrovaný chladicí plášť kolem hlavně */
  jacket?: boolean;
  /** úsťová brzda na konci hlavně */
  brake?: boolean;
  /** bedna s municí vedle těla */
  ammoBox?: boolean;
  /** pás nábojů vedoucí do zbraně */
  belt?: boolean;
  /** prstence kolem hlavně (energetické zbraně) */
  rings?: number;
  /** dvojice (trojice…) stejných děl vedle sebe – přesně ta, co auto nosí na dveřích */
  pods?: number;
  /** zářící jádro / hlaveň v téhle barvě */
  glow?: number;
}

export interface GunStats {
  id: string;
  name: string;
  /** krátký popis do nabídky */
  tagline: string;
  kind: GunKind;
  /** kde je zbraň na autě: 'hood' = na kapotě, 'side' = dva kusy na dveřích */
  mount: GunMount;
  /** střílí z obou stran naráz – dvě střely v salvě, u paprsku dva paprsky */
  twin?: boolean;
  /** barva střel, paprsku a záblesku u hlavně */
  color: number;

  /** prodleva mezi ranami (s); u paprsku prodleva po jeho dohoření */
  cd: number;
  /** poškození jedné rány – u paprsku taky, a to celé naráz při každém zásahu */
  dmg: number;
  /** rychlost střely (m/s) – u paprsku se nepoužije */
  speed: number;
  /** dostřel (m) */
  range: number;
  /** rozptyl hráče (rad) */
  spread: number;
  /** velikost stopy střely (1 = kulomet) */
  tracer: number;

  /** kužel, ve kterém zbraň hledá cíl pro doměření (rad); 0 = míří se přesně na nos */
  cone: number;
  /** jak velkou část opravy k cíli zbraň vezme (0 = nic, 1 = zamíří naplno) */
  aim: number;
  /** nejvyšší oprava zamíření od směru auta (rad) */
  aimMax: number;

  /** jen `beam`: jak dlouho se dá nabíjet (s) */
  chargeMax?: number;
  /** jen `beam`: kolik sekund paprsku dá jedna sekunda nabíjení */
  beamPer?: number;
  /** jen `beam`: jak daleko od osy paprsku ještě auto schytá ránu (m, k poloměru auta) */
  beamR?: number;
  /** jen `beam`: za jak dlouho může paprsek zasáhnout to samé auto znovu (s) */
  rehit?: number;

  shape: GunShape;
}

/** Paprsek nikdy nesvítí déle než tohle (s) – i kdyby se nabíjel sebedéle. */
export const BEAM_MAX = 5;

/** Nejkratší nabití, které ještě vystřelí (s) – ať se nedá laser "ťukat". */
export const BEAM_MIN_CHARGE = 0.25;

/** Jak dlouho bude paprsek svítit po nabíjení trvajícím `charge` sekund (u PRISM 1 : 1). */
export function beamTime(g: GunStats, charge: number): number {
  return Math.min(BEAM_MAX, charge * (g.beamPer ?? 1));
}
