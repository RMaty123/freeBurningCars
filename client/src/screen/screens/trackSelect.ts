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

/** Náhled testovacího placu – místo fotky schéma na milimetrovém papíře. */
function testPlanSvg(tr: Track): string {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < tr.n; i++) {
    minX = Math.min(minX, tr.x[i]); maxX = Math.max(maxX, tr.x[i]);
    minZ = Math.min(minZ, tr.z[i]); maxZ = Math.max(maxZ, tr.z[i]);
  }
  const W = 320, H = 190;
  const sc = Math.min((W * 0.62) / (maxX - minX), (H * 0.52) / (maxZ - minZ));
  const ox = W * 0.5 - ((minX + maxX) / 2) * sc, oz = H * 0.54 - ((minZ + maxZ) / 2) * sc;
  const px = (x: number) => (ox + x * sc).toFixed(1), pz = (z: number) => (oz + z * sc).toFixed(1);
  let d = '';
  for (let i = 0; i < tr.n; i += 8) d += `${i ? 'L' : 'M'}${px(tr.x[i])} ${pz(tr.z[i])}`;
  let grid = '';
  for (let x = 0; x <= W; x += 10) grid += `<path d="M${x} 0V${H}"/>`;
  for (let y = 0; y <= H; y += 10) grid += `<path d="M0 ${y}H${W}"/>`;
  let fat = '';
  for (let x = 0; x <= W; x += 50) fat += `<path d="M${x} 0V${H}"/>`;
  for (let y = 0; y <= H; y += 50) fat += `<path d="M0 ${y}H${W}"/>`;
  // pruhy vozovky přes celou plochu – asfalt nikde nekončí
  let lanes = '';
  for (let y = 7; y < H; y += 14) lanes += `<path d="M0 ${y}H${W}"/>`;
  const band = (tr.wallDist * 2 * sc).toFixed(1);
  // značky "pokračuje dál" na všech čtyřech stranách
  const arrow = (x: number, y: number, r: number) => `<g transform="translate(${x} ${y}) rotate(${r})" fill="#ff9d3c" opacity=".75"><path d="M0 -4 L7 0 L0 4Z"/><path d="M-7 -4 L0 0 L-7 4Z" opacity=".45"/></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="font-family:var(--display);font-style:italic">
    <rect width="${W}" height="${H}" fill="#0f1118"/>
    <g stroke="#ff8a1e" stroke-opacity=".10" stroke-width=".5">${grid}</g>
    <g stroke="#ff8a1e" stroke-opacity=".22" stroke-width=".7">${fat}</g>
    <g stroke="#fff" stroke-opacity=".10" stroke-width=".9" stroke-dasharray="9 8">${lanes}</g>
    <g stroke="#ffb357" stroke-opacity=".45" stroke-width=".6" stroke-dasharray="6 5"><path d="M${(W / 2).toFixed(0)} 0V${H}"/><path d="M0 ${(H / 2).toFixed(0)}H${W}"/></g>
    <path d="${d}Z" fill="none" stroke="#ff8a1e" stroke-opacity=".22" stroke-width="${band}" stroke-linejoin="round"/>
    <path d="${d}Z" fill="none" stroke="#ffbe6b" stroke-width="1" stroke-dasharray="7 5"/>
    <circle cx="${px(tr.x[0])}" cy="${pz(tr.z[0])}" r="3" fill="#fff"/>
    ${arrow(14, H / 2, 180)}${arrow(W - 14, H / 2, 0)}${arrow(W / 2, 12, -90)}${arrow(W / 2, H - 12, 90)}
    <g paint-order="stroke" stroke="#0f1118" stroke-width="3.5" stroke-linejoin="round">
      <text x="12" y="22" fill="#fff" font-size="15" letter-spacing="2">TEST PAD</text>
      <text x="12" y="36" fill="#ff9d3c" font-size="9" letter-spacing="3">SCHÉMA · PLOCHA BEZ HRANIC</text>
      <text x="12" y="${H - 12}" fill="#9a9aae" font-size="8.5" letter-spacing="2.5">∞ × ∞ m · ∞ PRUHŮ · BEZ SVODIDEL</text>
    </g>
  </svg>`;
}

/** Obrys testovacího placu – křížové osy a pás, co pokračuje do nekonečna. */
function testOutlineSvg(): string {
  let grid = '';
  for (let k = 20; k <= 80; k += 20) grid += `<path d="M${k} 4V96"/><path d="M4 ${k}H96"/>`;
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <rect x="4" y="4" width="92" height="92" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="7 6" opacity=".55"/>
    <g stroke="currentColor" stroke-width=".8" opacity=".25">${grid}</g>
    <rect x="0" y="36" width="100" height="28" fill="currentColor" opacity=".18"/>
    <path d="M0 50H100" stroke="currentColor" stroke-width="2" stroke-dasharray="10 7"/>
    <circle cx="50" cy="50" r="5" fill="#fff"/>
    <g fill="currentColor"><path d="M100 50L90 44v12z"/><path d="M0 50l10-6v12z"/></g>
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
      const card = document.createElement('article');
      card.className = 'ts-card';
      card.innerHTML = `
        <header><small>TRAŤ ${i + 1}</small><h2>${esc(def.name)}</h2></header>
        <div class="ts-img${open ? ' ts-plan' : ''}">${open ? testPlanSvg(tr) : ''}</div>
        <div class="ts-side">
          <div class="ts-outline">${open ? testOutlineSvg() : outlineSvg(tr)}</div>
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
