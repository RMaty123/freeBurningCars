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
import { $, App, DIFFS, Screen, esc } from '../app';
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

/** Náhled testovacího placu – místo fotky schéma na milimetrovém papíře (žádný okruh, jen plocha). */
function testPlanSvg(): string {
  const W = 320, H = 190;
  let grid = '';
  for (let x = 0; x <= W; x += 10) grid += `<path d="M${x} 0V${H}"/>`;
  for (let y = 0; y <= H; y += 10) grid += `<path d="M0 ${y}H${W}"/>`;
  let fat = '';
  for (let x = 0; x <= W; x += 50) fat += `<path d="M${x} 0V${H}"/>`;
  for (let y = 0; y <= H; y += 50) fat += `<path d="M0 ${y}H${W}"/>`;
  // pruhy vozovky přes celou plochu – asfalt nikde nekončí
  let lanes = '';
  for (let y = 7; y < H; y += 14) lanes += `<path d="M0 ${y}H${W}"/>`;
  // značky "pokračuje dál" na všech čtyřech stranách
  const arrow = (x: number, y: number, r: number) => `<g transform="translate(${x} ${y}) rotate(${r})" fill="#ff9d3c" opacity=".75"><path d="M0 -4 L7 0 L0 4Z"/><path d="M-7 -4 L0 0 L-7 4Z" opacity=".45"/></g>`;
  // pár aut na placu, ať je vidět, že se tu jezdí volně a po sobě střílí
  const car = (x: number, y: number, r: number, c: string) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-2.6" y="-4.6" width="5.2" height="9.2" rx="1.4" fill="${c}"/><path d="M0 -6 V-13" stroke="${c}" stroke-opacity=".55" stroke-width="1.2" stroke-dasharray="3 2"/></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="font-family:var(--display);font-style:italic">
    <rect width="${W}" height="${H}" fill="#0f1118"/>
    <g stroke="#ff8a1e" stroke-opacity=".10" stroke-width=".5">${grid}</g>
    <g stroke="#ff8a1e" stroke-opacity=".22" stroke-width=".7">${fat}</g>
    <g stroke="#fff" stroke-opacity=".12" stroke-width=".9" stroke-dasharray="9 8">${lanes}</g>
    <g stroke="#ffb357" stroke-opacity=".45" stroke-width=".6" stroke-dasharray="6 5"><path d="M${(W / 2).toFixed(0)} 0V${H}"/><path d="M0 ${(H / 2).toFixed(0)}H${W}"/></g>
    <circle cx="${W / 2}" cy="${H / 2}" r="34" fill="none" stroke="#ffb357" stroke-opacity=".35" stroke-width=".8"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="68" fill="none" stroke="#ffb357" stroke-opacity=".22" stroke-width=".8"/>
    ${car(W / 2 - 46, H / 2 + 22, 28, '#ff8a1e')}${car(W / 2 + 34, H / 2 - 18, -142, '#f1f1f1')}${car(W / 2 + 76, H / 2 + 40, 196, '#6ff0ff')}
    ${arrow(14, H / 2, 180)}${arrow(W - 14, H / 2, 0)}${arrow(W / 2, 12, -90)}${arrow(W / 2, H - 12, 90)}
    <g paint-order="stroke" stroke="#0f1118" stroke-width="3.5" stroke-linejoin="round">
      <text x="12" y="22" fill="#fff" font-size="15" letter-spacing="2">TEST PAD</text>
      <text x="12" y="36" fill="#ff9d3c" font-size="9" letter-spacing="3">VOLNÁ JÍZDA · PLOCHA BEZ HRANIC</text>
      <text x="12" y="${H - 12}" fill="#9a9aae" font-size="8.5" letter-spacing="2.5">∞ × ∞ m · ∞ PRUHŮ · BEZ KOL A SVODIDEL</text>
    </g>
  </svg>`;
}

/** Obrys testovacího placu – místo okruhu značka plochy, která pokračuje do všech stran. */
function testOutlineSvg(): string {
  let lanes = '';
  for (let y = 16; y <= 84; y += 11) lanes += `<path d="M2 ${y}H98"/>`;
  const car = (x: number, y: number, r: number, o: number) =>
    `<g transform="translate(${x} ${y}) rotate(${r})" opacity="${o}"><rect x="-3.4" y="-6" width="6.8" height="12" rx="2" fill="currentColor"/></g>`;
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <rect x="3" y="3" width="94" height="94" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="8 7" opacity=".5"/>
    <g stroke="currentColor" stroke-width="1.1" stroke-dasharray="7 6" opacity=".3">${lanes}</g>
    <circle cx="50" cy="50" r="22" fill="none" stroke="currentColor" stroke-width=".9" opacity=".35"/>
    ${car(50, 50, 0, 1)}${car(31, 62, 34, 0.55)}${car(66, 38, -150, 0.55)}
    <g fill="currentColor"><path d="M100 50L91 45v10z"/><path d="M0 50l9-5v10z"/><path d="M50 0l-5 9h10z"/><path d="M50 100l-5-9h10z"/></g>
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
      const open = !!def.open;
      const url = this.previews.get(def.id);
      const plan = open && !url; // vyrenderovaný náhled má přednost, schéma je záloha
      const card = document.createElement('article');
      card.className = 'ts-card';
      card.innerHTML = `
        <header><small>TRAŤ ${i + 1}</small><h2>${esc(def.name)}</h2></header>
        <div class="ts-img${plan ? ' ts-plan' : ''}">${plan ? testPlanSvg() : ''}</div>
        <div class="ts-side">
          <div class="ts-outline">${open ? testOutlineSvg() : outlineSvg(tr)}</div>
          <dl>
            <div><dt>${open ? 'REŽIM' : 'DÉLKA'}</dt><dd>${open ? 'Volná jízda' : km(tr.length)}</dd></div>
            <div><dt>PROSTŘEDÍ</dt><dd>${open ? '∞ asfalt' : esc(THEME_LABEL[def.theme])}</dd></div>
          </dl>
          <p>${esc(def.tagline)}</p>
        </div>`;
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
      ? `Vybírá <b>${esc(who)}</b>`
      : 'Vybíráš na klávesnici';
    const humans = app.session.active().length;
    const laps = app.settings.laps;
    const bots = app.settings.bots;
    $('ts-info').textContent = `${laps} ${laps === 1 ? 'kolo' : laps < 5 ? 'kola' : 'kol'} · ${humans} ${humans === 1 ? 'hráč' : humans < 5 ? 'hráči' : 'hráčů'} + ${bots} AI · obtížnost ${DIFFS[app.settings.diff].name}`;
    const net = app.roomInfo?.nets[0];
    $('ts-room').textContent = net ? `připojení: ${net.url.replace(/^http:\/\//, '').replace(/\/controller.*/, '')}` : '';
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
    this.app.show('cars');
  }

  private back() {
    this.app.audio.ui();
    this.app.show('lobby');
  }
}
