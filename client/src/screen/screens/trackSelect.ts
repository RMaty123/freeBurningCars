/**
 * Výběr tratě – velké karty, které se posouvají do stran.
 * Ovládá první hráč z telefonu (LEFT / SELECT / RIGHT / zpět) nebo klávesnice na PC (←/→, ENTER, ESC).
 *
 * Karty se staví z dat v game/content/tracks.ts: název, popisek, náhled (previews.ts) a obrys trati.
 * Na pozadí běží ukázka AI na právě vybrané trati.
 */
import { THEME_LABEL, TRACKS } from '../../game/content/tracks';
import type { Track } from '../../game/track';
import type { CtrlMsg, MenuInfo } from '../../shared/protocol';
import { $, App, DIFFS, Screen, TOTAL_CARS, esc } from '../app';
import { KBD, Player } from '../session';

/** Obrys trati jako SVG (pohled shora). */
function outlineSvg(tr: Track): string {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < tr.n; i++) {
    minX = Math.min(minX, tr.x[i]); maxX = Math.max(maxX, tr.x[i]);
    minZ = Math.min(minZ, tr.z[i]); maxZ = Math.max(maxZ, tr.z[i]);
  }
  let d = '';
  for (let i = 0; i < tr.n; i += 3) d += `${i ? 'L' : 'M'}${(tr.x[i] - minX).toFixed(0)} ${(tr.z[i] - minZ).toFixed(0)}`;
  const w = maxX - minX, h = maxZ - minZ, pad = Math.max(w, h) * 0.08;
  const sw = Math.max(w, h) * 0.035;
  return `<svg viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" preserveAspectRatio="xMidYMid meet">
    <path d="${d}Z" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round"/>
    <circle cx="${(tr.x[0] - minX).toFixed(0)}" cy="${(tr.z[0] - minZ).toFixed(0)}" r="${sw * 1.5}" fill="#fff"/>
  </svg>`;
}

const km = (m: number) => (m / 1000).toFixed(1).replace('.', ',') + ' km';

export class TrackSelectScreen implements Screen {
  /** náhledy tratí (id → data URL), nastavuje main.ts po startu */
  previews = new Map<string, string>();
  private sel = 0;
  private cards: HTMLElement[] = [];
  private offsets: number[] = [];
  private bgTimer = 0;

  constructor(private app: App) {}

  // ------------------------------------------------------------ zobrazení
  private build() {
    if (this.cards.length) return;
    const stage = $('ts-stage');
    const dots = $('ts-dots');
    TRACKS.forEach((def, i) => {
      const tr = this.app.track(i);
      const card = document.createElement('article');
      card.className = 'ts-card';
      card.innerHTML = `
        <header><small>TRAŤ ${i + 1}</small><h2>${esc(def.name)}</h2></header>
        <div class="ts-img"></div>
        <div class="ts-side">
          <div class="ts-outline">${outlineSvg(tr)}</div>
          <dl>
            <div><dt>DÉLKA</dt><dd>${km(tr.length)}</dd></div>
            <div><dt>PROSTŘEDÍ</dt><dd>${esc(THEME_LABEL[def.theme])}</dd></div>
          </dl>
          <p>${esc(def.tagline)}</p>
        </div>`;
      const url = this.previews.get(def.id);
      if (url) (card.querySelector('.ts-img') as HTMLElement).style.backgroundImage = `url(${url})`;
      stage.appendChild(card);
      this.cards.push(card);
      dots.appendChild(document.createElement('i'));
    });
  }

  /** Rozmístí karty kolem vybrané (vybraná uprostřed, sousedé po stranách). */
  private layout(instant = false) {
    const n = this.cards.length;
    const dots = $('ts-dots').children;
    this.cards.forEach((card, i) => {
      let o = (((i - this.sel) % n) + n) % n;
      if (o > n / 2) o -= n;
      const prev = this.offsets[i];
      // karta, která "přeskakuje" z jednoho konce na druhý, se nepřesouvá přes celou obrazovku
      const jump = instant || prev === undefined || Math.abs(o - prev) > 1;
      if (jump) card.classList.add('jump');
      card.style.setProperty('--o', String(o));
      card.classList.toggle('sel', o === 0);
      card.classList.toggle('far', Math.abs(o) > 1);
      if (jump) { void card.offsetWidth; card.classList.remove('jump'); }
      this.offsets[i] = o;
      dots[i]?.classList.toggle('on', i === this.sel);
    });
  }

  refresh() {
    const { app } = this;
    const m = app.session.master();
    const who = !m ? '' : m.pid === KBD ? 'klávesnice' : m.name;
    $('ts-who').innerHTML = m && m.pid !== KBD
      ? `Vybírá <b>${esc(who)}</b> na telefonu · <kbd>←</kbd><kbd>→</kbd> <kbd>ENTER</kbd> <kbd>ESC</kbd> fungují taky`
      : `<kbd>←</kbd><kbd>→</kbd> výběr · <kbd>ENTER</kbd> potvrdit · <kbd>ESC</kbd> zpět`;
    const humans = app.session.active().length;
    const laps = app.settings.laps;
    $('ts-info').textContent = `${laps} ${laps === 1 ? 'kolo' : laps < 5 ? 'kola' : 'kol'} · ${humans} ${humans === 1 ? 'hráč' : humans < 5 ? 'hráči' : 'hráčů'} + ${Math.max(0, TOTAL_CARS - humans)} AI · obtížnost ${DIFFS[app.settings.diff].name}`;
    $('ts-room').textContent = app.roomInfo ? `připojení: ${app.roomInfo.urls[0].replace(/^http:\/\//, '').replace(/\/controller.*/, '')} · kód ${app.roomInfo.room}` : '';
  }

  // ------------------------------------------------------------ Screen
  enter() {
    const { app } = this;
    app.phase = 'track';
    this.sel = app.settings.trackIdx;
    this.build();
    this.layout(true);
    this.refresh();
    $('trackselect').hidden = false;
    app.startAttract(this.sel);
  }

  exit() {
    clearTimeout(this.bgTimer);
    $('trackselect').hidden = true;
  }

  update() {
    // všichni odešli → zpátky do lobby
    if (!this.app.session.active().length) this.app.show('lobby');
  }

  menu(): MenuInfo {
    const def = TRACKS[this.sel];
    return {
      title: 'VÝBĚR TRATĚ',
      label: def.name,
      sub: `${this.sel + 1} / ${TRACKS.length} · ${km(this.app.track(this.sel).length)}`,
      by: this.app.session.master()?.name ?? '',
    };
  }

  command(p: Player, m: CtrlMsg) {
    if (!this.app.session.isMaster(p)) return;
    if (m.type === 'nav') this.move(m.dir);
    else if (m.type === 'select') this.confirm();
    else if (m.type === 'back') this.back();
  }

  key(e: KeyboardEvent) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.move(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.move(1);
    else if (e.code === 'Enter' || e.code === 'Space') this.confirm();
    else if (e.code === 'Escape' || e.code === 'Backspace') this.back();
  }

  // ------------------------------------------------------------ akce
  private move(dir: number) {
    const { app } = this;
    const n = TRACKS.length;
    this.sel = (this.sel + dir + n) % n;
    app.settings.trackIdx = this.sel;
    app.audio.ui();
    this.layout();
    // ukázku na pozadí přepni, až když se výběr na chvíli zastaví (načtení světa chvilku trvá)
    clearTimeout(this.bgTimer);
    this.bgTimer = window.setTimeout(() => { if (app.phase === 'track') app.startAttract(this.sel); }, 450);
    app.session.pushStates();
  }

  private confirm() {
    if (!this.app.session.active().length) return;
    this.app.settings.trackIdx = this.sel;
    this.app.show('race');
  }

  private back() {
    this.app.audio.ui();
    this.app.show('lobby');
  }
}
