/**
 * Auta – typy (jízdní vlastnosti + tvar karoserie) a barvy.
 * Seznam aut je v content/cars.ts; karoserie se generuje procedurálně v render/carModel.ts.
 */

/** Styl světel. */
export type LightStyle = 'slim' | 'round' | 'quad' | 'strip';
/** Lak: pruhy přes kapotu a střechu, dvojité pruhy, boční blesk, nic. */
export type Livery = 'center' | 'twin' | 'flash' | 'none';
/** Zadní křídlo. */
export type Wing = 0 | 1 | 2 | 3; // 0 nic, 1 lipa, 2 GT křídlo, 3 vysoké křídlo na labutích krcích
/** Díly, které se obarví druhou barvou. */
export type AccentPart = 'hood' | 'roof' | 'flares' | 'wing' | 'mirrors' | 'lower' | 'bed';
/** Povrch laku. */
export type Finish = 'gloss' | 'matte' | 'metallic' | 'pearl';

/**
 * Tvar karoserie. Model se z těchhle čísel postaví sám – vytažením bočního profilu
 * do šířky a doplněním detailů, takže stačí měnit rozměry a přepínače a auto vypadá úplně jinak.
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
  /** příď: 0 tupá a vysoká (dodávka) … 1 nízká klínová (supersport) */
  nose: number;
  /** zadní křídlo */
  spoiler: Wing;
  /** offroad výbava: rám vpředu, oblouk za kabinou, světelná rampa */
  rugged: boolean;

  // ---- nepovinné doplňky
  /** kola mimo karoserii (bugina, formule) */
  openWheels?: boolean;
  /** bez střechy – jen ochranný oblouk (hot rod, formule) */
  roofless?: boolean;
  /** otevřená korba vzadu (pick-up) */
  bed?: boolean;
  /** rezerva na korbě / na zádi */
  spare?: boolean;
  /** rozšířené blatníky 0…1 */
  flares?: number;
  /** boční sání před zadními koly */
  intakes?: boolean;
  /** 0 nic, 1 nasávání na kapotě, 2 kompresor trčící z kapoty */
  scoop?: 0 | 1 | 2;
  /** přední splitter a zadní difuzor se žebry */
  splitter?: boolean;
  /** boční výfuky za předními koly místo zadních */
  sideExhaust?: boolean;
  lights?: LightStyle;
  livery?: Livery;
  /** barva pruhů (jinak bílá / černá podle laku) */
  liveryColor?: number;
  /** které díly dostanou druhou barvu */
  accent?: AccentPart[];
  /** druhá barva (jinak ztmavená hlavní) */
  accentColor?: number;
  /** povrch laku */
  finish?: Finish;
  /** barva brzdových třmenů (vidět mezi paprsky) */
  caliperColor?: number;
  /** počet paprsků kol a jejich barva */
  rimSpokes?: number;
  rimColor?: number;
}

export interface CarStats {
  /** stálé označení (klíč pro náhledy apod.) */
  id: string;
  name: string;
  tagline: string;
  /** barva, ve které auto jezdí vždy – stejná pro hráče i pro AI */
  color: number;
  /** max. rychlost m/s */
  top: number;
  /** zrychlení m/s² */
  accel: number;
  brake: number;
  /** jak rychle se auto stáčí v nízké rychlosti (rad/s) */
  turn: number;
  /** rychlost (m/s), od které auto začne nedotáčet – čím míň, tím dřív se "vzpírá" */
  steerRef: number;
  /** boční přilnavost (větší = míň klouže) */
  grip: number;
  hp: number;
  mass: number;
  shape: CarShape;
}

/** Barvy slotů hráčů v lobby (než si vyberou auto). */
export const PLAYER_COLORS = [0xff2d2d, 0x1f8bff, 0xffc61a, 0x2fd35a];

/**
 * Paleta, ze které si hráč může přebarvit auto (a ze které se berou náhradní barvy,
 * když by dvě auta v závodě vyšla stejně). Pořadí je rozházené schválně,
 * aby vedle sebe nestály podobné odstíny.
 */
export const CAR_COLORS: { name: string; hex: number }[] = [
  { name: 'červená', hex: 0xe02d26 },
  { name: 'světle modrá', hex: 0x4fb6f0 },
  { name: 'žlutá', hex: 0xf2b02a },
  { name: 'černá', hex: 0x15161b },
  { name: 'mátová', hex: 0x3fc08a },
  { name: 'oranžová', hex: 0xff6a13 },
  { name: 'bílá', hex: 0xecebe6 },
  { name: 'rallye modrá', hex: 0x1b5fd0 },
  { name: 'magenta', hex: 0xe0218a },
  { name: 'vojenská zelená', hex: 0x5f6b3c },
  { name: 'vínová', hex: 0x7e1d22 },
  { name: 'grafitová', hex: 0x3a3f47 },
];

export const AI_NAMES = [
  'BLAZE', 'REX', 'NOVA', 'DIESEL', 'VIXEN', 'GHOST',
  'TURBO', 'SMILEY', 'CRUSHER', 'ZIGGY', 'BANDIT', 'SHADOW',
];

/** Barvy disků pro content/cars.ts. */
export const RIM = { chrome: 0xd4d9e2, dark: 0x26282e, gold: 0xd9a93c, bronze: 0xa6713a, white: 0xeceae4, red: 0xb52a20 };
/** Pojmenované barvy laku pro druhou barvu a pruhy. */
export const PAINT = {
  carbon: 0x1b1d22, black: 0x101216, white: 0xf2f0ea, silver: 0xb9bec7, gunmetal: 0x4a4f58,
  gold: 0xd9a93c, orange: 0xff7a1a, red: 0xc0392b, blue: 0x1f6fd6, lime: 0x9ad42a, cream: 0xe8dcb5,
};

export function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
