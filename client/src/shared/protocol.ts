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

/** Ovladač -> obrazovka (spolehlivé zprávy). */
export type CtrlMsg =
  | { type: 'car'; dir: 1 | -1 }
  | { type: 'track'; dir: 1 | -1 }
  | { type: 'laps'; dir: 1 | -1 }
  | { type: 'start' }
  | { type: 'continue' };

export type Phase = 'lobby' | 'countdown' | 'race' | 'results';

/** Obrazovka -> ovladač. */
export type HostMsg =
  | {
      type: 'state';
      phase: Phase;
      slot: number;
      color: string;
      name: string;
      carName: string;
      carIdx: number;
      carStats: { speed: number; accel: number; handling: number; armor: number };
      master: boolean;
      /** připojil se během závodu a čeká na další */
      waiting: boolean;
      track: string;
      laps: number;
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
  | { type: 'buzz'; ms: number }
  | { type: 'kicked'; reason: string };
