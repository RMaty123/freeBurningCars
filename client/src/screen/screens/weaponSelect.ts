/**
 * Výběr zbraní – jedna obrazovka pro oba kroky: primární (FIRE 1) a sekundární (FIRE 2).
 * Pořadí: auta → zbraň FIRE 1 → zbraň FIRE 2 → závod.
 *
 * Stejná logika jako výběr aut: na telefonu si hráč ťukne na zbraň v mřížce a pak ji POTVRDÍ,
 * na obrazovce má každý hráč svůj výřez s 3D modelem zbraně.
 * Klávesnice na PC: ←/→ zbraň, ENTER potvrdit, ESC o krok zpět.
 *
 * Nabídky se staví z game/content/guns.ts a game/content/secondaries.ts – přidáním položky
 * do seznamu se zbraň objeví tady i na telefonu.
 */
import { PLAYER_COLORS, hexCss } from '../../game/cars';
import { GUNS } from '../../game/content/guns';
import { SECONDARIES } from '../../game/content/secondaries';
import type { CtrlMsg, PickKind } from '../../shared/protocol';
import { $, App, Screen, ScreenName } from '../app';
import { KBD, Player } from '../session';

/** jak dlouho po potvrzení posledního hráče se čeká, než se jde dál (s) */
const STEP_DELAY = 1.3;

interface Panel {
  pid: string;
  el: HTMLElement;
  /** co je v panelu vypsané, ať se nepřepisuje zbytečně */
  shown: string;
}

/** Čím se oba kroky liší – zbytek obrazovky je společný. */
const STEP = {
  gun: {
    phase: 'guns' as const,
    title: 'VYBER ZBRAŇ · FIRE 1',
    count: () => GUNS.length,
    name: (i: number) => (GUNS[i] ?? GUNS[0]).name,
    back: 'cars' as ScreenName,
    next: 'secs' as ScreenName,
  },
  sec: {
    phase: 'secs' as const,
    title: 'VYBER ZBRAŇ · FIRE 2',
    count: () => SECONDARIES.length,
    name: (i: number) => (SECONDARIES[i] ?? SECONDARIES[0]).name,
    back: 'guns' as ScreenName,
    next: 'race' as ScreenName,
  },
};

export class WeaponSelectScreen implements Screen {
  private panels: Panel[] = [];
  private startT = -1;

  constructor(private app: App, private kind: Exclude<PickKind, 'car'>) {}

  private get step() { return STEP[this.kind]; }

  /** Index vybrané zbraně daného hráče (podle kroku, ve kterém jsme). */
  private idx(p: Player): number {
    return this.kind === 'gun' ? p.gunIdx : p.secIdx;
  }

  private setIdx(p: Player, i: number) {
    if (this.kind === 'gun') p.gunIdx = i; else p.secIdx = i;
  }

  // ------------------------------------------------------------ panely hráčů
  private build() {
    const players = this.app.session.active();
    const same = players.length === this.panels.length && players.every((p, i) => this.panels[i].pid === p.pid);
    if (same) return;
    const stage = $('ws-stage');
    stage.innerHTML = '';
    stage.className = 'pick-stage n' + Math.min(4, players.length);
    this.panels = players.map((p) => {
      const el = document.createElement('article');
      el.className = 'cs-panel';
      el.style.setProperty('--pc', hexCss(PLAYER_COLORS[p.slot]));
      el.innerHTML = `
        <div class="cs-stamp">PŘIPRAVEN</div>
        <div class="cs-plate">
          <div class="cs-car"></div>
          <div class="cs-name"></div>
          <div class="cs-status"></div>
        </div>`;
      (el.querySelector('.cs-name') as HTMLElement).textContent = p.name;
      stage.appendChild(el);
      return { pid: p.pid, el, shown: '' };
    });
    this.app.showroom.setCount(players.length);
  }

  private sync() {
    this.build();
    const players = this.app.session.active();
    players.forEach((p, i) => {
      const panel = this.panels[i];
      const idx = this.idx(p);
      if (this.kind === 'gun') this.app.showroom.setGun(i, GUNS[idx] ?? GUNS[0]);
      else this.app.showroom.setSec(i, SECONDARIES[idx] ?? SECONDARIES[0]);
      const key = `${idx}|${p.ready}`;
      if (panel.shown === key) return;
      panel.shown = key;
      const q = (s: string) => panel.el.querySelector(s) as HTMLElement;
      q('.cs-car').textContent = this.step.name(idx);
      panel.el.classList.toggle('ready', p.ready);
      q('.cs-status').textContent = p.ready ? '✔ POTVRZENO' : p.pid === KBD ? '←/→ vyber · ENTER potvrď' : 'vybírá na telefonu…';
    });
    const all = this.allReady();
    $('ws-banner').hidden = !all;
    if (all && this.startT < 0) this.startT = STEP_DELAY;
    if (!all) this.startT = -1;
    const waiting = players.filter((p) => !p.ready).map((p) => p.name);
    const btn = this.kind === 'gun' ? 'FIRE 1' : 'FIRE 2';
    $('ws-hint').textContent = all
      ? 'VŠICHNI POTVRDILI!'
      : `POTVRĎTE ZBRAŇ (TLAČÍTKO ${btn}) · ČEKÁ SE NA: ${waiting.join(', ')}`;
  }

  private allReady(): boolean {
    const players = this.app.session.active();
    return players.length > 0 && players.every((p) => p.ready);
  }

  /** Pošle hráči nabídku i s náhledy. */
  private sendCatalog(p: Player) {
    if (p.pid === KBD) return;
    const list = this.kind === 'gun' ? GUNS : SECONDARIES;
    list.forEach((it, idx) => {
      this.app.session.send(p, {
        type: 'catalog', kind: this.kind, idx, total: list.length, name: it.name, tagline: it.tagline,
        img: this.kind === 'gun' ? this.app.showroom.gunThumbnail(GUNS[idx]) : this.app.showroom.secThumbnail(SECONDARIES[idx]),
        ratings: [],
      });
    });
  }

  // ------------------------------------------------------------ Screen
  enter() {
    const { app } = this;
    app.phase = this.step.phase;
    this.startT = -1;
    for (const p of app.session.players.values()) p.ready = false;
    this.panels = [];
    $('ws-title').textContent = this.step.title;
    $('weaponselect').hidden = false;
    this.sync();
    for (const p of app.session.active()) this.sendCatalog(p);
  }

  exit() {
    $('weaponselect').hidden = true;
    $('ws-banner').hidden = true;
  }

  refresh() {
    if (this.app.phase === this.step.phase) this.sync();
  }

  playerJoined(p: Player) {
    p.ready = false;
    this.sendCatalog(p);
  }

  update(dt: number) {
    const { app } = this;
    if (!app.session.active().length) { app.show('lobby'); return; }
    app.showroom.update(dt);
    if (this.startT >= 0) {
      this.startT -= dt;
      if (this.startT <= 0) { this.startT = -1; if (this.allReady()) app.show(this.step.next); }
    }
  }

  render(): boolean {
    this.app.showroom.render(this.panels.map((p) => {
      const r = p.el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }));
    return true;
  }

  command(p: Player, m: CtrlMsg) {
    const { app } = this;
    if (m.type === 'pick') {
      if (p.ready || !Number.isInteger(m.idx) || m.idx < 0 || m.idx >= this.step.count()) return;
      this.setIdx(p, m.idx);
      app.audio.ui();
    } else if (m.type === 'ready') {
      p.ready = !!m.on;
      if (p.ready) app.audio.lap(); else app.audio.ui();
    } else if (m.type === 'back') {
      if (p.ready) p.ready = false;
      else { app.show(this.step.back); return; }
    } else return;
    app.session.changed();
  }

  key(e: KeyboardEvent) {
    const kp = this.app.session.keyboard;
    if (e.code === 'Escape' || e.code === 'Backspace') {
      if (kp?.ready) this.command(kp, { type: 'ready', on: false });
      else this.app.show(this.step.back);
      return;
    }
    if (!kp) return;
    const n = this.step.count();
    const i = this.idx(kp);
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.command(kp, { type: 'pick', idx: (i + n - 1) % n });
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.command(kp, { type: 'pick', idx: (i + 1) % n });
    else if (e.code === 'Enter' || e.code === 'Space') this.command(kp, { type: 'ready', on: !kp.ready });
  }
}
