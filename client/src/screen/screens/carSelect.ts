/**
 * Výběr aut – každý hráč má na obrazovce vlastní výřez garáže s 3D autem; dole je jmenovka hráče a staty auta.
 *
 * Na telefonu si hráč ťukne na auto v nabídce (auto se hned ukáže na obrazovce) a pak ho musí POTVRDIT –
 * ťuknout vedle je snadné, proto dva kroky. Potvrzení jde vzít zpět. Když mají potvrzeno všichni, startuje závod.
 * Klávesnice na PC: ←/→ auto, ENTER potvrdit, ESC zpět.
 *
 * Nabídka se staví z game/content/cars.ts (peníze ani zamykání aut tu zatím nejsou).
 */
import { PLAYER_COLORS, hexCss } from '../../game/cars';
import { CAR_TYPES, carRatings, colorPicker } from '../../game/content/cars';
import type { CtrlMsg } from '../../shared/protocol';
import { $, App, Screen } from '../app';
import { KBD, Player } from '../session';

/** jak dlouho po potvrzení posledního hráče se čeká, než začne závod (s) */
const START_DELAY = 1.3;

/** řádky ukazatelů pod jmenovkou */
const STAT_ROWS: [keyof ReturnType<typeof carRatings>, string][] = [
  ['speed', 'RYCHLOST'], ['armor', 'PANCÍŘ'], ['handling', 'ŘÍZENÍ'],
];

interface Panel {
  pid: string;
  /** panel = zároveň oblast, do které se kreslí 3D auto */
  el: HTMLElement;
  /** co je v panelu vypsané ("index auta|potvrzeno"), ať se nepřepisuje zbytečně */
  shown: string;
}

export class CarSelectScreen implements Screen {
  private panels: Panel[] = [];
  /** odpočet do startu, když mají všichni potvrzeno (-1 = neběží) */
  private startT = -1;

  constructor(private app: App) {}

  /** garáž sdílená s výběrem zbraní */
  private get room() {
    return this.app.showroom;
  }

  // ------------------------------------------------------------ panely hráčů
  /** Postaví panely pro aktuální hráče (jen když se sestava změnila). */
  private build() {
    const players = this.app.session.active();
    const same = players.length === this.panels.length && players.every((p, i) => this.panels[i].pid === p.pid);
    if (same) return;
    const stage = $('cs-stage');
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
          <div class="cs-stats">${STAT_ROWS.map(([k, label]) => `<span>${label}</span><div class="cs-pips" data-k="${k}">${'<i></i>'.repeat(10)}</div>`).join('')}</div>
          <div class="cs-status"></div>
        </div>`;
      (el.querySelector('.cs-name') as HTMLElement).textContent = p.name;
      stage.appendChild(el);
      return { pid: p.pid, el, shown: '' };
    });
    this.room.setCount(players.length);
  }

  /** Přepíše panely a auta v garáži podle toho, co mají hráči vybráno. */
  private sync() {
    this.build();
    const players = this.app.session.active();
    // auto v garáži stojí v barvě, ve které se pojede (dva stejné vozy dostanou různé odstíny)
    const pick = colorPicker();
    players.forEach((p, i) => {
      const panel = this.panels[i];
      const car = CAR_TYPES[p.carIdx];
      const color = pick(p.carIdx);
      this.room.setCar(i, car, color);
      const key = `${p.carIdx}|${p.ready}|${color}`;
      if (panel.shown === key) return;
      panel.shown = key;
      const q = (s: string) => panel.el.querySelector(s) as HTMLElement;
      q('.cs-car').textContent = car.name;
      const r = carRatings(car);
      panel.el.querySelectorAll<HTMLElement>('.cs-pips').forEach((row) => {
        const n = r[row.dataset.k as keyof typeof r];
        Array.from(row.children).forEach((pip, k) => pip.classList.toggle('on', k < n));
      });
      panel.el.classList.toggle('ready', p.ready);
      q('.cs-status').textContent = p.ready ? '✔ POTVRZENO' : p.pid === KBD ? '←/→ vyber · ENTER potvrď' : 'vybírá na telefonu…';
    });
    const all = this.allReady();
    $('cs-banner').hidden = !all;
    if (all && this.startT < 0) this.startT = START_DELAY;
    if (!all) this.startT = -1;
    const waiting = players.filter((p) => !p.ready).map((p) => p.name);
    $('cs-hint').textContent = all ? 'VŠICHNI POTVRDILI – TEĎ ZBRAŇ!' : `POTVRĎTE AUTO · ČEKÁ SE NA: ${waiting.join(', ')}`;
  }

  private allReady(): boolean {
    const players = this.app.session.active();
    return players.length > 0 && players.every((p) => p.ready);
  }

  /** Pošle hráči nabídku aut – každé auto v náhledu ve své barvě. */
  private sendCatalog(p: Player) {
    if (p.pid === KBD) return;
    CAR_TYPES.forEach((car, idx) => {
      const r = carRatings(car);
      this.app.session.send(p, {
        type: 'catalog', kind: 'car', idx, total: CAR_TYPES.length, name: car.name, tagline: car.tagline,
        img: this.room.thumbnail(car, car.color),
        ratings: [{ l: 'RYCHLOST', v: r.speed }, { l: 'ZRYCHLENÍ', v: r.accel }, { l: 'ŘÍZENÍ', v: r.handling }, { l: 'PANCÍŘ', v: r.armor }],
      });
    });
  }

  // ------------------------------------------------------------ Screen
  enter() {
    const { app } = this;
    app.phase = 'cars';
    this.startT = -1;
    for (const p of app.session.players.values()) p.ready = false;
    this.panels = [];
    $('carselect').hidden = false;
    this.sync();
    for (const p of app.session.active()) this.sendCatalog(p);
  }

  exit() {
    $('carselect').hidden = true;
    $('cs-banner').hidden = true;
  }

  refresh() {
    if (this.app.phase === 'cars') this.sync();
  }

  playerJoined(p: Player) {
    p.ready = false;
    this.sendCatalog(p);
  }

  update(dt: number) {
    const { app } = this;
    if (!app.session.active().length) { app.show('lobby'); return; }
    this.room.update(dt);
    if (this.startT >= 0) {
      this.startT -= dt;
      if (this.startT <= 0) { this.startT = -1; if (this.allReady()) app.show('guns'); }
    }
  }

  /** Místo trati se kreslí garáž – pro každý panel jeden výřez. */
  render(): boolean {
    this.room.render(this.panels.map((p) => {
      const r = p.el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }));
    return true;
  }

  command(p: Player, m: CtrlMsg) {
    const { app } = this;
    if (m.type === 'pick') {
      // potvrzené auto se nedá omylem přepnout – nejdřív je potřeba potvrzení zrušit
      if (p.ready || !Number.isInteger(m.idx) || m.idx < 0 || m.idx >= CAR_TYPES.length) return;
      p.carIdx = m.idx;
      app.audio.ui();
    } else if (m.type === 'ready') {
      p.ready = !!m.on;
      if (p.ready) app.audio.lap(); else app.audio.ui();
    } else if (m.type === 'back') {
      if (p.ready) p.ready = false;
      else if (app.session.isMaster(p)) { app.show('track'); return; }
      else return;
    } else return;
    app.session.changed();
  }

  key(e: KeyboardEvent) {
    const kp = this.app.session.keyboard;
    if (e.code === 'Escape' || e.code === 'Backspace') {
      if (kp?.ready) this.command(kp, { type: 'ready', on: false });
      else this.app.show('track');
      return;
    }
    if (!kp) return;
    const n = CAR_TYPES.length;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.command(kp, { type: 'pick', idx: (kp.carIdx + n - 1) % n });
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.command(kp, { type: 'pick', idx: (kp.carIdx + 1) % n });
    else if (e.code === 'Enter' || e.code === 'Space') this.command(kp, { type: 'ready', on: !kp.ready });
  }
}
