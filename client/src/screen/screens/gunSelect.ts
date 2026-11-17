/**
 * Výběr primární zbraně (FIRE 1) – přijde hned po výběru auta.
 *
 * Stejná logika jako výběr aut: na telefonu si hráč ťukne na zbraň v mřížce a pak ji POTVRDÍ,
 * na obrazovce má každý hráč svůj výřez s 3D modelem zbraně a jejími ukazateli.
 * Klávesnice na PC: ←/→ zbraň, ENTER potvrdit, ESC zpět na výběr aut.
 *
 * Nabídka se staví z game/content/guns.ts – přidáním zbraně do GUNS se objeví tady i na telefonu.
 */
import { PLAYER_COLORS, hexCss } from '../../game/cars';
import { GUNS } from '../../game/content/guns';
import type { GunStats } from '../../game/guns';
import { BEAM_MAX } from '../../game/guns';
import type { CtrlMsg } from '../../shared/protocol';
import { $, App, Screen } from '../app';
import { KBD, Player } from '../session';

/** jak dlouho po potvrzení posledního hráče se čeká, než začne závod (s) */
const START_DELAY = 1.3;

/** řádky ukazatelů pod jmenovkou */
const STAT_ROWS: [keyof GunStats['ratings'], string][] = [
  ['power', 'SÍLA'], ['rate', 'KADENCE'], ['range', 'DOSTŘEL'],
];

/** Řádek, který hráči řekne, jak se zbraň chová (tohle je na ní to zajímavé). */
function howTo(g: GunStats): string {
  if (g.kind === 'beam') {
    return `DRŽ FIRE 1 – NABÍJÍ SE (${g.chargeMax} s) · PUSTÍŠ A PÁLÍ AŽ ${BEAM_MAX} s · ${g.dmg} DMG/s`;
  }
  const dps = Math.round(g.dmg / g.cd);
  return `${g.dmg} DMG NA RÁNU · ${(1 / g.cd).toFixed(1)} RAN/s · ${dps} DMG/s`;
}

interface Panel {
  pid: string;
  el: HTMLElement;
  /** co je v panelu vypsané, ať se nepřepisuje zbytečně */
  shown: string;
}

export class GunSelectScreen implements Screen {
  private panels: Panel[] = [];
  private startT = -1;

  constructor(private app: App) {}

  // ------------------------------------------------------------ panely hráčů
  private build() {
    const players = this.app.session.active();
    const same = players.length === this.panels.length && players.every((p, i) => this.panels[i].pid === p.pid);
    if (same) return;
    const stage = $('gs-stage');
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
          <div class="gs-how"></div>
          <div class="cs-stats">${STAT_ROWS.map(([k, label]) => `<span>${label}</span><div class="cs-pips" data-k="${k}">${'<i></i>'.repeat(10)}</div>`).join('')}</div>
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
      const gun = GUNS[p.gunIdx] ?? GUNS[0];
      this.app.showroom.setGun(i, gun);
      const key = `${p.gunIdx}|${p.ready}`;
      if (panel.shown === key) return;
      panel.shown = key;
      const q = (s: string) => panel.el.querySelector(s) as HTMLElement;
      q('.cs-car').textContent = gun.name;
      q('.gs-how').textContent = howTo(gun);
      panel.el.querySelectorAll<HTMLElement>('.cs-pips').forEach((row) => {
        const n = gun.ratings[row.dataset.k as keyof GunStats['ratings']];
        Array.from(row.children).forEach((pip, k) => pip.classList.toggle('on', k < n));
      });
      panel.el.classList.toggle('ready', p.ready);
      q('.cs-status').textContent = p.ready ? '✔ POTVRZENO' : p.pid === KBD ? '←/→ vyber · ENTER potvrď' : 'vybírá na telefonu…';
    });
    const all = this.allReady();
    $('gs-banner').hidden = !all;
    if (all && this.startT < 0) this.startT = START_DELAY;
    if (!all) this.startT = -1;
    const waiting = players.filter((p) => !p.ready).map((p) => p.name);
    $('gs-hint').textContent = all ? 'VŠICHNI POTVRDILI – STARTUJEME!' : `POTVRĎ ZBRAŇ NA TELEFONU! ČEKÁ SE NA: ${waiting.join(', ')}`;
  }

  private allReady(): boolean {
    const players = this.app.session.active();
    return players.length > 0 && players.every((p) => p.ready);
  }

  /** Pošle hráči nabídku zbraní i s náhledy. */
  private sendCatalog(p: Player) {
    if (p.pid === KBD) return;
    GUNS.forEach((gun, idx) => {
      this.app.session.send(p, {
        type: 'catalog', kind: 'gun', idx, total: GUNS.length, name: gun.name, tagline: gun.tagline,
        img: this.app.showroom.gunThumbnail(gun),
        ratings: STAT_ROWS.map(([k, l]) => ({ l, v: gun.ratings[k] })),
      });
    });
  }

  // ------------------------------------------------------------ Screen
  enter() {
    const { app } = this;
    app.phase = 'guns';
    this.startT = -1;
    for (const p of app.session.players.values()) p.ready = false;
    this.panels = [];
    $('gunselect').hidden = false;
    this.sync();
    for (const p of app.session.active()) this.sendCatalog(p);
  }

  exit() {
    $('gunselect').hidden = true;
    $('gs-banner').hidden = true;
  }

  refresh() {
    if (this.app.phase === 'guns') this.sync();
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
      if (this.startT <= 0) { this.startT = -1; if (this.allReady()) app.show('race'); }
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
      if (p.ready || !Number.isInteger(m.idx) || m.idx < 0 || m.idx >= GUNS.length) return;
      p.gunIdx = m.idx;
      app.audio.ui();
    } else if (m.type === 'ready') {
      p.ready = !!m.on;
      if (p.ready) app.audio.lap(); else app.audio.ui();
    } else if (m.type === 'back') {
      if (p.ready) p.ready = false;
      else { app.show('cars'); return; }
    } else return;
    app.session.changed();
  }

  key(e: KeyboardEvent) {
    const kp = this.app.session.keyboard;
    if (e.code === 'Escape' || e.code === 'Backspace') {
      if (kp?.ready) this.command(kp, { type: 'ready', on: false });
      else this.app.show('cars');
      return;
    }
    if (!kp) return;
    const n = GUNS.length;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.command(kp, { type: 'pick', idx: (kp.gunIdx + n - 1) % n });
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.command(kp, { type: 'pick', idx: (kp.gunIdx + 1) % n });
    else if (e.code === 'Enter' || e.code === 'Space') this.command(kp, { type: 'ready', on: !kp.ready });
  }
}
