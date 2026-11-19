/**
 * App – společný "kontext" obrazovky: grafika, zvuk, hráči, nastavení a právě běžící simulace.
 *
 * Jednotlivé části hry jsou "obrazovky" (Screen) ve složce screens/:
 *   lobby        připojení hráčů
 *   track        výběr tratě
 *   cars         výběr aut
 *   race         odpočet, závod a výsledky
 * Další krok (výběr aut, zbraní…) = nový soubor ve screens/ + řádek v main.ts.
 * App mezi nimi přepíná a stará se o to, co mají společné (simulace na pozadí, zvuky, toast).
 */
import { AI_NAMES } from '../game/cars';
import { CAR_TYPES, carColor } from '../game/content/cars';
import { GUNS } from '../game/content/guns';
import { SECONDARIES } from '../game/content/secondaries';
import { TRACKS } from '../game/content/tracks';
import { CarEntry, Sim, SimEvent } from '../game/sim';
import { Track, buildTrack } from '../game/track';
import { GameView } from '../render/gameView';
import { Showroom } from '../render/showroom';
import type { CtrlMsg, MenuInfo, Phase } from '../shared/protocol';
import { GameAudio } from './audio';
import { Hud } from './hud';
import { Player, RoomInfo, Session } from './session';

/** kolik aut jede v závodě, když si hráč nic nenastaví */
export const TOTAL_CARS = 6;
/** nejvíc aut na startu (lidi + AI) a nejvíc AI soupeřů */
export const MAX_CARS = 8;
export const MAX_BOTS = 7;
export const DIFFS = [
  { name: 'lehká', skill: 0.86 },
  { name: 'střední', skill: 0.93 },
  { name: 'těžká', skill: 1.0 },
];

export const $ = (id: string) => document.getElementById(id)!;
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export type ScreenName = 'lobby' | 'track' | 'cars' | 'guns' | 'secs' | 'race';

export interface Screen {
  /** obrazovka se právě zobrazila */
  enter(): void;
  exit(): void;
  /** příkaz z ovladače */
  command(p: Player, m: CtrlMsg): void;
  /** klávesa na PC (jen první stisk, ne opakování) */
  key(e: KeyboardEvent): void;
  /** změnil se seznam hráčů nebo nastavení → překreslit */
  refresh(): void;
  /** každý snímek, po kroku simulace */
  update(dt: number): void;
  /** každý snímek před krokem simulace (např. vstupy hráčů do aut) */
  beforeStep?(dt: number): void;
  /** události ze simulace za tento snímek */
  events?(sim: Sim, events: SimEvent[]): void;
  /** vlastní vykreslení místo trati (např. garáž ve výběru aut); vrať true, pokud jsi kreslil */
  render?(): boolean;
  /** popisek pro menu na ovladači */
  menu?(): MenuInfo;
  /** ve hře se připojil / vrátil / odpojil hráč */
  playerJoined?(p: Player, isNew: boolean): void;
  /** vrať true, pokud má odpojený hráč zůstat v seznamu */
  playerLeft?(p: Player): boolean;
  onRoom?(info: RoomInfo): void;
}

export class App {
  readonly view: GameView;
  readonly hud = new Hud();
  readonly audio = new GameAudio();
  readonly session: Session;
  readonly settings = { trackIdx: 0, laps: 3, diff: 1, bots: TOTAL_CARS - 1, tilt: false };
  /** právě běžící simulace (závod, nebo ukázka AI na pozadí menu) */
  sim: Sim | null = null;
  phase: Phase = 'lobby';
  /** poslední informace o místnosti (QR, adresa) */
  roomInfo: RoomInfo | null = null;
  /** trať, jejíž 3D svět je načtený (-1 = žádná) */
  worldIdx = -1;
  /** trať, na které běží ukázka AI (-1 = neběží) */
  attractIdx = -1;
  autoQuality = true;
  /** právě držené klávesy na PC */
  readonly keys = new Set<string>();

  private screens = {} as Record<ScreenName, Screen>;
  /** garáž pro výběr aut i zbraní – staví se až při prvním použití a sdílí ji obě obrazovky */
  private showroomRef: Showroom | null = null;
  private current: Screen | null = null;
  private trackCache = new Map<string, Track>();
  private toastTimer = 0;
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.view = new GameView(canvas);
    this.session = new Session({
      phase: () => this.phase,
      laps: () => this.settings.laps,
      bots: () => this.settings.bots,
      tilt: () => this.settings.tilt,
      open: () => !!TRACKS[this.settings.trackIdx]?.open,
      menu: () => this.current?.menu?.(),
      onRoom: (info) => { this.roomInfo = info; for (const s of Object.values(this.screens)) s.onRoom?.(info); },
      onJoin: (p, isNew) => { if (isNew) this.audio.ui(); this.current?.playerJoined?.(p, isNew); },
      onLeave: (p) => this.current?.playerLeft?.(p) ?? false,
      onCommand: (p, m) => this.current?.command(p, m),
      onChange: () => this.current?.refresh(),
    });
  }

  register(name: ScreenName, screen: Screen) {
    this.screens[name] = screen;
  }

  /** Přepne na jinou obrazovku. */
  show(name: ScreenName) {
    this.current?.exit();
    this.current = this.screens[name];
    this.current.enter();
    this.session.changed();
  }

  /** Scéna s modelem (auto / zbraň) pro výběrové obrazovky. */
  get showroom(): Showroom {
    return (this.showroomRef ??= new Showroom(this.view.renderer));
  }

  get racing(): boolean {
    return this.phase === 'countdown' || this.phase === 'race' || this.phase === 'results';
  }

  key(e: KeyboardEvent) {
    this.current?.key(e);
  }

  // ------------------------------------------------------------ tratě a ukázka na pozadí
  track(i: number): Track {
    const def = TRACKS[i];
    let t = this.trackCache.get(def.id);
    if (!t) { t = buildTrack(def); this.trackCache.set(def.id, t); }
    return t;
  }

  /** Načte 3D svět tratě (nic nedělá, pokud už načtený je). */
  loadWorld(i: number) {
    if (this.worldIdx === i) return;
    this.view.setTrack(this.track(i));
    this.worldIdx = i;
  }

  aiEntries(n: number, startAt = 0): CarEntry[] {
    const out: CarEntry[] = [];
    for (let i = 0; i < n; i++) {
      const k = (i + startAt) % AI_NAMES.length;
      const typeIdx = (i + startAt + 1) % CAR_TYPES.length;
      const color = carColor(typeIdx);
      // boti mají zbraně na střídačku, ať je v závodě vidět všechno
      const gun = GUNS[(i + startAt) % GUNS.length];
      const sec = SECONDARIES[(i + startAt) % SECONDARIES.length];
      out.push({ name: AI_NAMES[k], color, tagColor: color, typeIdx, stats: CAR_TYPES[typeIdx], gun, sec, human: false, pid: null });
    }
    return out;
  }

  /** Simulace pro ukázku / náhled: samá AI, nekonečný závod, kousek "předtočený". */
  attractSim(i: number, seed?: number): Sim {
    const sim = new Sim(this.track(i), this.aiEntries(TOTAL_CARS), { laps: 999, attract: true, aiSkill: 0.95, seed });
    // na volné ploše nech auta nejdřív rozjet, ať náhled není jen hromada u startovní brány
    const warm = TRACKS[i].open ? 900 : 240;
    for (let k = 0; k < warm; k++) sim.step(1 / 30);
    sim.events.length = 0;
    return sim;
  }

  /** Ukázková jízda AI na pozadí menu. */
  /** Tratě, které smí běžet jako kulisa na úvodní obrazovce (testovací plac mezi ně nepatří). */
  menuTracks(): number[] {
    return TRACKS.map((_, i) => i).filter((i) => !TRACKS[i].open);
  }

  startAttract(i = this.settings.trackIdx) {
    if (this.attractIdx === i) return;
    this.loadWorld(i);
    this.sim = this.attractSim(i);
    this.view.setSim(this.sim, []);
    this.hud.clear();
    this.hud.show(false);
    this.audio.setEngines([]);
    this.attractIdx = i;
  }

  // ------------------------------------------------------------ společné
  toast(text: string, ms = 2600) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
  }

  /** Hlasitost podle vzdálenosti k nejbližšímu lidskému hráči (v menu jen potichu). */
  volAt(x: number, z: number): number {
    if (!this.sim || !this.racing) return 0.12;
    let best = Infinity;
    for (const c of this.sim.cars) if (c.pid) best = Math.min(best, Math.hypot(c.x - x, c.z - z));
    return 1 / (1 + (best / 26) ** 2);
  }

  /** Zvuky, které znějí stejně v závodě i v ukázce na pozadí. */
  private sounds(s: Sim, events: SimEvent[]) {
    const a = this.audio;
    for (const e of events) {
      switch (e.t) {
        case 'shot': a.shot(this.volAt(e.x, e.z)); break;
        case 'hit': a.hit(this.volAt(e.x, e.z)); break;
        case 'boom': a.boom(this.volAt(e.x, e.z), e.size); break;
        case 'crash': a.crash(this.volAt(e.x, e.z) * Math.min(1, e.force / 14)); break;
        case 'wall': a.crash(this.volAt(e.x, e.z) * Math.min(1, e.force / 16)); break;
        case 'pickup': a.pickup(this.volAt(e.x, e.z)); break;
        case 'wave': {
          a.wave(this.volAt(e.x, e.z));
          this.view.effects.flash(e.x, 1.0, e.z, 1.6, 2.2, 4.4, 7, 0.22);
          break;
        }
        case 'charge': {
          a.charge(0.6);
          break;
        }
        case 'jammed': {
          const c = s.cars[e.car];
          this.view.effects.sparks(c.x, 1.0, c.z, 10, 14, 2.6, 4.2, 5);
          break;
        }
        case 'hooked': {
          a.hook(this.volAt(e.x, e.z));
          this.view.effects.sparks(e.x, 0.8, e.z, 6, 10, 2.2, 3.4, 4.2);
          break;
        }
        case 'launch': {
          const c = s.cars[e.car];
          if (e.kind === 'rocket') a.launch(this.volAt(c.x, c.z)); else a.mine(this.volAt(c.x, c.z));
          break;
        }
        case 'respawn': { const c = s.cars[e.car]; a.respawn(this.volAt(c.x, c.z)); break; }
        case 'beam': { const c = s.cars[e.car]; a.beam(this.volAt(c.x, c.z), e.len); break; }
      }
    }
  }

  // ------------------------------------------------------------ jeden snímek
  frame(dt: number) {
    const cur = this.current;
    cur?.beforeStep?.(dt);
    const sim = this.sim;
    if (sim) {
      const steps = dt > 0.034 ? 2 : 1;
      for (let i = 0; i < steps; i++) sim.step(dt / steps);
      const events = sim.events.splice(0);
      this.view.handleEvents(sim, events);
      this.sounds(sim, events);
      cur?.events?.(sim, events);
      this.view.update(sim, dt);
    }
    cur?.update(dt);
    if (!cur?.render?.()) this.view.render(this.sim);

    // slabší počítač? po pár vteřinách pod 30 fps automaticky vypni stíny
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 4) {
      const fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0; this.fpsN = 0;
      if (this.autoQuality && fps < 30 && this.view.quality === 'high' && document.visibilityState === 'visible') {
        this.autoQuality = false;
        this.view.setQuality('low');
        this.toast('Nízké FPS – přepínám na rychlejší grafiku (G = zpět)', 4000);
      }
    }
  }
}
