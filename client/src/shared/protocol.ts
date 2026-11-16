/**
 * Zprávy mezi obrazovkou (host) a telefonem (ovladač).
 * Server je jen přeposílá, takže tenhle soubor je jediná "smlouva" mezi oběma stranami.
 */

/** Stav ovladače – posílá se ~30× za sekundu a při každé změně. */
export interface InputState {
  /** zatáčení -1 (vlevo) … 1 (vpravo) */
  s: number;
  /** plyn 0…1 */
  t: number;
  /** brzda / zpátečka 0…1 */
  b: number;
  /** kulomet */
  f: boolean;
  /** sekundární zbraň (rakety / miny) */
  r: boolean;
  /** nitro */
  n: boolean;
}

export const EMPTY_INPUT: InputState = { s: 0, t: 0, b: 0, f: false, r: false, n: false };

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
      nitro: number;
      sec: 'rocket' | 'mine';
      ammo: number;
      dead: boolean;
      finished: boolean;
    }
  | { type: 'buzz'; ms: number }
  | { type: 'kicked'; reason: string };
