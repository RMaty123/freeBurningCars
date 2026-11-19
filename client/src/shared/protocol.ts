/**
 * Zprávy mezi obrazovkou (host) a telefonem (ovladač).
 * Server je jen přeposílá, takže tenhle soubor je jediná "smlouva" mezi oběma stranami.
 */
import type { SecKind } from '../game/secondary';

/** Stav ovladače – posílá se při každé změně. Plyn drží hra sama, hráč jen zatáčí, brzdí a střílí. */
export interface InputState {
  /** zatáčení -1 (vlevo) … 1 (vpravo) */
  s: number;
  /** brzda / zpátečka 0…1 */
  b: number;
  /** FIRE 1 – kulomet */
  f: boolean;
  /** FIRE 2 – sekundární zbraň (rakety / miny) */
  r: boolean;
  /** drift */
  d: boolean;
}

export const EMPTY_INPUT: InputState = { s: 0, b: 0, f: false, r: false, d: false };

/**
 * Vstup se po síti posílá jako jedno celé číslo, ne jako objekt – ušetří to většinu paketu
 * (z ~60 bajtů na ~14) i práci s JSONem na obou stranách. Rozložení bitů:
 *   bit 0 = FIRE 1, bit 1 = FIRE 2, bit 2 = drift, bity 3–6 = brzda 0–10, bity 7+ = zatáčení 0–200.
 */
export function packInput(i: InputState): number {
  const s = Math.round((Math.max(-1, Math.min(1, i.s)) + 1) * 100);   // 0…200
  const b = Math.round(Math.max(0, Math.min(1, i.b)) * 10);           // 0…10
  return (s << 7) | (b << 3) | (i.d ? 4 : 0) | (i.r ? 2 : 0) | (i.f ? 1 : 0);
}

export function unpackInput(n: number): InputState {
  return {
    s: ((n >> 7) & 255) / 100 - 1,
    b: ((n >> 3) & 15) / 10,
    d: (n & 4) !== 0,
    r: (n & 2) !== 0,
    f: (n & 1) !== 0,
  };
}

/**
 * Ovladač -> obrazovka (spolehlivé zprávy).
 * nav / select / back jsou obecné příkazy pro menu (LEFT / SELECT / RIGHT / zpět) –
 * používá je výběr tratě a půjdou použít i pro další výběry (auta, zbraně…).
 */
export type CtrlMsg =
  | { type: 'laps'; dir: 1 | -1 }
  /** přepnutí způsobu zatáčení (tlačítka / náklon telefonu) – smí jen první hráč */
  | { type: 'tilt' }
  | { type: 'assist' }
  /** počet AI soupeřů (0 = jede se jen s lidmi) */
  | { type: 'bots'; dir: 1 | -1 }
  | { type: 'nav'; dir: 1 | -1 }
  | { type: 'select' }
  | { type: 'back' }
  /** výběr auta / zbraně: ťuknutí na položku v nabídce (ještě nepotvrzeno) */
  | { type: 'pick'; idx: number }
  /** výběr auta / zbraně: potvrzení / zrušení potvrzení */
  | { type: 'ready'; on: boolean }
  /** měření odezvy: obrazovka hned vrátí stejné `t` zpátky (viz 'pong') */
  | { type: 'ping'; t: number }
  /** vypnutí / nastartování motoru (jen na testovacím placu) */
  | { type: 'engine'; on: boolean };

/** lobby → track → cars → guns (FIRE 1) → secs (FIRE 2) → countdown → race → results → track … */
export type Phase = 'lobby' | 'track' | 'cars' | 'guns' | 'secs' | 'countdown' | 'race' | 'results';

/** Co se zrovna vybírá – nabídka na telefonu je pro všechno stejná. */
export type PickKind = 'car' | 'gun' | 'sec';

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
      /** vybrané auto a zbraně (indexy do nabídek) a jestli je výběr potvrzený */
      carIdx: number;
      gunIdx: number;
      secIdx: number;
      ready: boolean;
      master: boolean;
      /** připojil se během závodu a čeká na další */
      waiting: boolean;
      laps: number;
      /** kolik AI soupeřů pojede */
      bots: number;
      /** typ hry: true = zatáčí se náklonem telefonu, false = tlačítky LEFT/RIGHT */
      tilt: boolean;
      /** zapnuté cheaty (nastavuje se jen na PC): vypínač motoru všude a nabídka pomocných brzd */
      cheats: boolean;
      /** pomocné brzdy tohohle hráče – každý si je zapíná sám, výchozí je vypnuto */
      assist: boolean;
      /** testovací plac: volná jízda bez kol, na ovladači přibude vypínač motoru */
      open: boolean;
      /** vyplněno ve fázích s menu (výběr tratě…) */
      menu?: MenuInfo;
    }
  | {
      type: 'hud';
      pos: number;
      total: number;
      lap: number;
      laps: number;
      /** na volné ploše místo kol: kolik aut hráč zničil (jinak chybí) */
      kills?: number;
      /** běží motor? (vypínač na testovacím placu – stav drží obrazovka) */
      engine: boolean;
      hp: number;
      /** zbývající boost 0…1 */
      nitro: number;
      /** smí se teď přepínat motor? (plac, nebo zapnuté cheaty) */
      engineSw: boolean;
      /** která sekundární zbraň (ikona v HUD na telefonu) */
      sec: SecKind;
      ammo: number;
      dead: boolean;
      finished: boolean;
      /** nabití laseru 0…1 (u ostatních zbraní 0) */
      charge: number;
      /** zbývající paprsek 0…1 */
      beam: number;
    }
  /** jedna položka nabídky (aut nebo zbraní) – posílá se při vstupu do výběru, kus po kuse */
  | {
      type: 'catalog';
      kind: PickKind;
      idx: number;
      total: number;
      name: string;
      tagline: string;
      /** náhled (data URL) */
      img: string;
      /** ukazatele 1–10 s popiskem, co je co */
      ratings: { l: string; v: number }[];
    }
  | { type: 'buzz'; ms: number }
  /** odpověď na 'ping' – telefon z toho spočítá odezvu tam a zpátky */
  | { type: 'pong'; t: number }
  | { type: 'kicked'; reason: string };
