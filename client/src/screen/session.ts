/**
 * Hráči a spojení s ovladači.
 * Session drží seznam hráčů, mluví se serverem (Socket.IO) a posílá telefonům jejich stav.
 * O hře samotné nic neví – co se má stát po připojení / příkazu, řeší App přes "hooks".
 */
import { io, Socket } from 'socket.io-client';
import { PLAYER_COLORS, hexCss } from '../game/cars';
import { CAR_TYPES } from '../game/content/cars';
import { CtrlMsg, EMPTY_INPUT, HostMsg, InputState, MenuInfo, Phase } from '../shared/protocol';

export const MAX_PLAYERS = 4;
/** pid hráče na klávesnici u PC */
export const KBD = 'keyboard';

export interface Player {
  pid: string;
  name: string;
  slot: number;
  carIdx: number;
  /** auto potvrzené ve výběru aut */
  ready: boolean;
  connected: boolean;
  input: InputState;
  points: number;
  /** připojil se během závodu – pojede až příští */
  waiting: boolean;
  lastBuzz: number;
}

export interface RoomInfo {
  room: string;
  urls: string[];
  qr: string;
  net: { ip: string; iface: string; gateway: string; source: string } | null;
}

export interface SessionHooks {
  phase(): Phase;
  laps(): number;
  /** popisek pro menu na ovladači (jen ve fázích s menu) */
  menu(): MenuInfo | undefined;
  onRoom(info: RoomInfo): void;
  /** hráč se připojil (isNew = poprvé, jinak návrat po výpadku) */
  onJoin(p: Player, isNew: boolean): void;
  /** hráč se odpojil; vrať true, pokud má zůstat v seznamu (např. má auto v rozjetém závodě) */
  onLeave(p: Player): boolean;
  onCommand(p: Player, m: CtrlMsg): void;
  /** seznam hráčů se změnil → překreslit */
  onChange(): void;
}

export class Session {
  readonly players = new Map<string, Player>();
  readonly socket: Socket;
  room = '';

  constructor(private hooks: SessionHooks) {
    this.socket = io({ transports: ['websocket', 'polling'] });
    const s = this.socket;

    s.on('connect', () => {
      // po obnovení stránky chceme zpátky stejnou místnost, ať se telefony nemusí připojovat znovu
      const wanted = sessionStorage.getItem('fbc-room') ?? '';
      s.emit('host:create', { room: wanted }, (r: RoomInfo) => {
        this.room = r.room;
        sessionStorage.setItem('fbc-room', r.room);
        hooks.onRoom(r);
      });
    });

    s.on('player:join', ({ pid, name }: { pid: string; name: string }) => {
      let p = this.players.get(pid);
      const isNew = !p;
      if (p) {
        p.connected = true;
        p.name = name;
      } else {
        const slot = this.freeSlot();
        if (slot < 0) {
          s.emit('host:to', { pid, m: { type: 'kicked', reason: `Hra je plná (max ${MAX_PLAYERS} hráči).` } satisfies HostMsg });
          return;
        }
        p = this.makePlayer(pid, name, slot);
        this.players.set(pid, p);
      }
      hooks.onJoin(p, isNew);
      this.changed();
    });

    s.on('player:leave', ({ pid }: { pid: string }) => {
      const p = this.players.get(pid);
      if (!p) return;
      p.connected = false;
      p.input = { ...EMPTY_INPUT };
      if (!hooks.onLeave(p)) this.players.delete(pid);
      this.changed();
    });

    s.on('player:input', ({ pid, d }: { pid: string; d: InputState }) => {
      const p = this.players.get(pid);
      if (p && d) p.input = d;
    });

    s.on('player:msg', ({ pid, m }: { pid: string; m: CtrlMsg }) => {
      const p = this.players.get(pid);
      if (p && m) hooks.onCommand(p, m);
    });
  }

  private makePlayer(pid: string, name: string, slot: number): Player {
    return { pid, name, slot, carIdx: slot % CAR_TYPES.length, ready: false, connected: true, input: { ...EMPTY_INPUT }, points: 0, waiting: false, lastBuzz: 0 };
  }

  // ------------------------------------------------------------ dotazy
  freeSlot(): number {
    for (let s = 0; s < MAX_PLAYERS; s++) if (![...this.players.values()].some((p) => p.slot === s)) return s;
    return -1;
  }

  /** všichni hráči podle slotu */
  sorted(): Player[] {
    return [...this.players.values()].sort((a, b) => a.slot - b.slot);
  }

  /** připojení hráči podle slotu */
  active(): Player[] {
    return this.sorted().filter((p) => p.connected);
  }

  /** první připojený hráč – ovládá menu a startuje závod */
  master(): Player | undefined {
    return this.active()[0];
  }

  isMaster(p: Player): boolean {
    return this.master()?.pid === p.pid;
  }

  get keyboard(): Player | undefined {
    return this.players.get(KBD);
  }

  // ------------------------------------------------------------ změny
  addKeyboard(): Player | undefined {
    const slot = this.freeSlot();
    if (this.keyboard || slot < 0) return undefined;
    const p = this.makePlayer(KBD, 'HRÁČ ' + (slot + 1), slot);
    this.players.set(KBD, p);
    this.changed();
    return p;
  }

  removeKeyboard() {
    if (this.players.delete(KBD)) this.changed();
  }

  /** Po závodě: vyhodí odpojené hráče a čekající pustí do hry. */
  prune() {
    for (const [pid, p] of this.players) {
      if (!p.connected) this.players.delete(pid);
      else p.waiting = false;
    }
  }

  /** Překreslí obrazovku a pošle všem ovladačům aktuální stav. */
  changed() {
    this.hooks.onChange();
    this.pushStates();
  }

  // ------------------------------------------------------------ zprávy ovladačům
  private stateFor(p: Player): HostMsg {
    const phase = this.hooks.phase();
    const racing = phase === 'countdown' || phase === 'race' || phase === 'results';
    const waiting = p.waiting && racing;
    return {
      type: 'state',
      phase: waiting ? 'lobby' : phase,
      slot: p.slot,
      color: hexCss(PLAYER_COLORS[p.slot]),
      name: p.name,
      carIdx: p.carIdx,
      ready: p.ready,
      master: this.isMaster(p),
      waiting,
      laps: this.hooks.laps(),
      menu: this.hooks.menu(),
    };
  }

  pushStates() {
    for (const p of this.players.values()) {
      if (p.pid === KBD || !p.connected) continue;
      this.socket.emit('host:to', { pid: p.pid, m: this.stateFor(p) });
    }
  }

  /** Spolehlivá zpráva jednomu ovladači. */
  send(p: Player, m: HostMsg) {
    if (p.pid === KBD || !p.connected) return;
    this.socket.emit('host:to', { pid: p.pid, m });
  }

  /** Průběžný stav během závodu (pořadí, zdraví…) – klidně se může ztratit. */
  sendHud(p: Player, m: HostMsg) {
    if (p.pid === KBD || !p.connected) return;
    this.socket.volatile.emit('host:to', { pid: p.pid, m });
  }

  buzz(p: Player | undefined, ms: number) {
    if (!p || p.pid === KBD || !p.connected) return;
    const now = performance.now();
    if (now - p.lastBuzz < 180) return;
    p.lastBuzz = now;
    this.socket.emit('host:to', { pid: p.pid, m: { type: 'buzz', ms } satisfies HostMsg });
  }
}
