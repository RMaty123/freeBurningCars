/**
 * Zprávy mezi obrazovkou (host) a telefonem (ovladač).
 * Server je jen přeposílá, takže tenhle soubor je jediná "smlouva" mezi oběma stranami.
 */

/** Stav ovladače – posílá se při každé změně. Plyn drží hra sama, hráč jen zatáčí, brzdí a střílí. */
export interface InputState {
  /** zatáčení -1 (vlevo) … 1 (vpravo) */
  s: number;
  /** brzda / zpátečka 0…1 */
  b: number;
  /** FIRE 1 – kulomet */
  f: boolean;
  /** FIRE 2 – rakety / miny */
  r: boolean;
  /** drift */
  d: boolean;
}

export const EMPTY_INPUT: InputState = { s: 0, b: 0, f: false, r: false, d: false };

/**
 * Ovladač -> obrazovka (spolehlivé zprávy).
 * nav / select / back jsou obecné příkazy pro menu (LEFT / SELECT / RIGHT / zpět) –
 * používá je výběr tratě a půjdou použít i pro další výběry (auta, zbraně…).
 */
export type CtrlMsg =
  | { type: 'laps'; dir: 1 | -1 }
  | { type: 'nav'; dir: 1 | -1 }
  | { type: 'select' }
  | { type: 'back' }
  /** výběr auta: ťuknutí na auto v nabídce (ještě nepotvrzeno) */
  | { type: 'pick'; idx: number }
  /** výběr auta: potvrzení / zrušení potvrzení */
  | { type: 'ready'; on: boolean };

/** lobby → track (výběr tratě) → cars (výběr aut) → countdown → race → results → track … */
export type Phase = 'lobby' | 'track' | 'cars' | 'countdown' | 'race' | 'results';

/** Co má ovladač ukázat na obrazovce menu (LEFT / SELECT / RIGHT). */
export interface MenuInfo {
  /** nadpis, např. "VÝBĚR TRATĚ" */
  title: string;
  /** právě vybraná položka */
  label: string;
  /** doplňkový řádek, např. "2 / 3 · 1,7 km" */
  sub: string;
  /** jméno hráče, který vybírá */
  by: string;
}

/** Obrazovka -> ovladač. */
export type HostMsg =
  | {
      type: 'state';
      phase: Phase;
      slot: number;
      color: string;
      name: string;
      /** vybrané auto (index do nabídky) a jestli už je potvrzené */
      carIdx: number;
      ready: boolean;
      master: boolean;
      /** připojil se během závodu a čeká na další */
      waiting: boolean;
      laps: number;
      /** vyplněno ve fázích s menu (výběr tratě…) */
      menu?: MenuInfo;
    }
  | {
      type: 'hud';
      pos: number;
      total: number;
      lap: number;
      laps: number;
      hp: number;
      /** zbývající boost 0…1 */
      nitro: number;
      sec: 'rocket' | 'mine';
      ammo: number;
      dead: boolean;
      finished: boolean;
    }
  /** jedna položka nabídky aut (posílá se při vstupu do výběru aut, auto po autu) */
  | {
      type: 'catalog';
      idx: number;
      total: number;
      name: string;
      tagline: string;
      /** náhled auta v barvě hráče (data URL) */
      img: string;
      /** hodnocení 1–10 */
      ratings: { speed: number; accel: number; handling: number; armor: number };
    }
  | { type: 'buzz'; ms: number }
  | { type: 'kicked'; reason: string };
